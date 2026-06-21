#!/usr/bin/env node
/**
 * Shared utility: update mission_control_data.json from session content.
 *
 * Called by:
 *   - scripts/hooks/session-end.js  (after every session)
 *   - scripts/nightly-consolidation.js (nightly sweep)
 *
 * What it does:
 *   1. Reads current mission_control_data.json
 *   2. Uses Haiku to extract structured changes from the session transcript
 *   3. Merges completed tasks, experiment status changes, and budget updates
 *   4. Writes the updated JSON back to disk
 */

const fs = require('fs')
const path = require('path')
const Anthropic = require('@anthropic-ai/sdk')

const ROOT = path.resolve(__dirname, '../..')
const MC_FILE = path.join(ROOT, 'mission_control_data.json')

const BUSINESS_SLUGS = {
  arabreviews: 0,
  'arab-reviews': 0,
  'arab reviews': 0,
  digitalsouq: 1,
  'digital-souq': 1,
  'digital souq': 1,
  'ai sales buddy': 2,
  'ai-sales-buddy': 2,
  'sales buddy': 2,
  pronto: 2,
}

// ── Haiku extraction ──────────────────────────────────────────────────────────

async function extractChanges(sessionContent) {
  if (!process.env.ANTHROPIC_API_KEY) return null

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `You are a data extraction assistant for a startup dashboard (Mission Control).
Read the session transcript below and extract ONLY concrete changes that happened.

Return a JSON object with this exact schema (omit any key that has no data):

{
  "completed_tasks": [
    { "business": "ArabReviews|DigitalSouq|AI Sales Buddy|null", "task": "short description in Arabic or English", "agent": "CEO|CTO|CMO|COO|CFO|Coordinator" }
  ],
  "experiment_updates": [
    { "business": "ArabReviews|DigitalSouq|AI Sales Buddy", "experiment_id": 1, "new_status": "pending|running|success|failed", "result": "optional result note" }
  ],
  "metric_updates": [
    { "business": "ArabReviews|DigitalSouq|AI Sales Buddy", "field": "dot.path.to.metric", "value": 123 }
  ],
  "budget_delta_usd": 0.00,
  "next_actions": [
    { "business": "ArabReviews|DigitalSouq|AI Sales Buddy", "action": "what to do next" }
  ]
}

Rules:
- completed_tasks: only tasks that were ACTUALLY DONE in this session, not planned
- experiment_updates: only if an experiment status explicitly changed
- metric_updates: only measurable numbers that changed (e.g. articles_published, sales_mtd)
- budget_delta_usd: estimate of API cost spent in this session (0 if unknown)
- next_actions: the immediate next step for each business mentioned
- If nothing changed for a business, omit it
- Return valid JSON only, no markdown fences

Session transcript:
---
${sessionContent.slice(0, 8000)}
---`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0]?.text?.trim() ?? ''
    // Strip markdown fences if present
    const json = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '')
    return JSON.parse(json)
  } catch {
    return null
  }
}

// ── JSON merge helpers ────────────────────────────────────────────────────────

function resolveBusinessIndex(name) {
  if (typeof name !== 'string') return -1
  const key = name.toLowerCase().trim()
  return BUSINESS_SLUGS[key] ?? -1
}

function setNestedValue(obj, dotPath, value) {
  const keys = dotPath.split('.')
  let cur = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] === undefined) cur[keys[i]] = {}
    cur = cur[keys[i]]
  }
  cur[keys[keys.length - 1]] = value
}

function applyChanges(data, changes, dateStr, timeStr) {
  if (!changes) return data

  const now = `${dateStr}T${timeStr}:00.000Z`

  // ① completed_tasks
  if (Array.isArray(changes.completed_tasks)) {
    for (const t of changes.completed_tasks) {
      const entry = { date: dateStr, task: t.task, agent: t.agent ?? 'CTO' }
      const idx = resolveBusinessIndex(t.business)
      if (idx >= 0) {
        data.businesses[idx].completed_tasks.unshift(entry)
      } else {
        // null / unknown → attach to recent_activity as generic
        data.recent_activity.unshift({
          timestamp: now,
          agent: t.agent ?? 'CTO',
          model: 'claude-sonnet-4-6',
          task: t.task,
          business: null,
          cost_usd: 0,
          status: 'success',
        })
      }
    }
  }

  // ② experiment_updates
  if (Array.isArray(changes.experiment_updates)) {
    for (const eu of changes.experiment_updates) {
      const idx = resolveBusinessIndex(eu.business)
      if (idx < 0) continue
      const biz = data.businesses[idx]
      const exp = biz.experiments.items.find(e => e.id === eu.experiment_id)
      if (!exp) continue

      const prev = exp.status
      exp.status = eu.new_status
      if (eu.result) exp.result = eu.result
      if (eu.new_status === 'running' && !exp.started_at) exp.started_at = now
      if (['success', 'failed'].includes(eu.new_status)) exp.completed_at = now

      // Recount
      const counts = { pending: 0, running: 0, success: 0, failed: 0 }
      for (const e of biz.experiments.items) counts[e.status] = (counts[e.status] ?? 0) + 1
      Object.assign(biz.experiments, counts)

      data.recent_activity.unshift({
        timestamp: now,
        agent: 'CEO',
        model: 'claude-opus-4-7',
        task: `Experiment #${eu.experiment_id} → ${eu.new_status} (was ${prev})`,
        business: biz.name,
        cost_usd: 0,
        status: 'success',
      })
    }
  }

  // ③ metric_updates
  if (Array.isArray(changes.metric_updates)) {
    for (const mu of changes.metric_updates) {
      const idx = resolveBusinessIndex(mu.business)
      if (idx < 0) continue
      setNestedValue(data.businesses[idx], mu.field, mu.value)
    }
  }

  // ④ budget
  if (typeof changes.budget_delta_usd === 'number' && changes.budget_delta_usd > 0) {
    data.budget.spent_usd = Math.round((data.budget.spent_usd + changes.budget_delta_usd) * 1e6) / 1e6
    data.budget.remaining_usd = Math.round((data.budget.total_usd - data.budget.spent_usd) * 100) / 100
    data.budget.utilization_pct = Math.round((data.budget.spent_usd / data.budget.total_usd) * 1000) / 10
  }

  // ⑤ next_actions
  if (Array.isArray(changes.next_actions)) {
    for (const na of changes.next_actions) {
      const idx = resolveBusinessIndex(na.business)
      if (idx >= 0) data.businesses[idx].next_action = na.action
    }
  }

  // ⑥ Keep recent_activity capped at 20 entries
  data.recent_activity = data.recent_activity.slice(0, 20)

  // ⑦ Refresh summary
  data.summary.running_experiments = data.businesses.reduce((s, b) => s + b.experiments.running, 0)
  data.summary.completed_experiments = data.businesses.reduce((s, b) => s + b.experiments.success + b.experiments.failed, 0)
  data.summary.budget_spent_pct = data.budget.utilization_pct
  data.summary.total_revenue_usd = data.businesses.reduce((s, b) => s + (b.monetization?.revenue_total_usd ?? 0), 0)

  // ⑧ Timestamp
  data._meta.last_updated = now

  return data
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {string} sessionContent  Raw session transcript or summary text
 * @param {string} dateStr         YYYY-MM-DD
 * @param {string} timeStr         HH:MM
 * @returns {Promise<boolean>}     true if file was updated
 */
async function updateMissionControl(sessionContent, dateStr, timeStr) {
  if (!fs.existsSync(MC_FILE)) {
    console.warn('[mission-control] mission_control_data.json not found — skipping')
    return false
  }

  let data
  try {
    data = JSON.parse(fs.readFileSync(MC_FILE, 'utf-8'))
  } catch (e) {
    console.error('[mission-control] Failed to parse JSON:', e.message)
    return false
  }

  console.log('[mission-control] Extracting session changes via Haiku...')
  const changes = await extractChanges(sessionContent)

  if (changes) {
    console.log('[mission-control] Applying changes:', JSON.stringify(changes, null, 2))
  } else {
    console.log('[mission-control] No structured changes extracted — updating timestamp only')
  }

  data = applyChanges(data, changes, dateStr, timeStr)

  fs.writeFileSync(MC_FILE, JSON.stringify(data, null, 2))
  console.log('[mission-control] mission_control_data.json updated ✓')
  return true
}

module.exports = { updateMissionControl }
