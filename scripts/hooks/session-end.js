#!/usr/bin/env node
/**
 * Session end hook: Save important session information to daily notes
 * and update mission_control_data.json to reflect business changes.
 *
 * Flow:
 *   1. Read session transcript from stdin
 *   2. Append to memory/YYYY-MM-DD.md (daily notes)
 *   3. Call updateMissionControl() → Haiku extracts changes → JSON updated
 */
const fs = require('fs')
const path = require('path')
const { updateMissionControl } = require('../lib/mission-control')

const ROOT = path.resolve(__dirname, '../..')
const MEMORY_DIR = path.join(ROOT, 'memory')

function getDateStr() {
  return new Date().toISOString().slice(0, 10)
}

function getTimeStr() {
  return new Date().toISOString().slice(11, 16)
}

async function main() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true })
  }

  const dateStr = getDateStr()
  const timeStr = getTimeStr()
  const dailyFile = path.join(MEMORY_DIR, `${dateStr}.md`)

  // ① Read session transcript from stdin (passed by Claude Code on Stop)
  let input = ''
  try {
    input = fs.readFileSync(0, 'utf-8')
  } catch {
    // stdin is empty
  }

  const entry = `\n### Session ${timeStr} UTC\n${input || '(No session content)'}\n`

  // ② Append to daily notes
  fs.appendFileSync(dailyFile, entry)
  console.log(`Session record saved to ${dailyFile}`)

  // ③ Update mission_control_data.json
  if (input.trim().length > 20) {
    try {
      await updateMissionControl(input, dateStr, timeStr)
    } catch (e) {
      console.error('[session-end] mission_control update failed:', e.message)
    }
  } else {
    console.log('[session-end] Session content too short — skipping mission_control update')
  }
}

main()
