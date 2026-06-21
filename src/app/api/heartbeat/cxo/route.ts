import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireCronAuth } from '@/lib/auth'
import { runHeartbeatTask } from '@/lib/agent/heartbeatRunner'
import type { TaskType } from '@/lib/agent/responseSchemas'

// CXO heartbeat runs 5 parallel AI calls
export const maxDuration = 300

// Business-specific CXO tasks (CMO + CTO)
// Operator: Suzan Attallah — physical_product / digital_product / saas
const BUSINESS_TASKS: Record<string, { role: string; prompt: string; task_type: TaskType }> = {
  physical_product: {
    role: 'CTO',
    task_type: 'mvp_spec',
    prompt: `You are the CTO of Patent Mining Spain. The business finds expired USPTO patents in kitchen/garden/pet categories, manufactures via Alibaba, and sells on Amazon.es FBA.
Propose 3 specific actions to advance the technical pipeline this week:
1. USPTO PatentsView scraper improvements (filters, data quality)
2. Claude scoring prompt optimizations (better product-market fit detection for Spain)
3. Amazon.es listing automation ideas (Spanish SEO, image generation)
Keep each proposal to 2-3 lines.`,
  },
  digital_product: {
    role: 'CMO',
    task_type: 'market_research',
    prompt: `You are the CMO of DigitalSouq — a Gumroad store selling Notion templates, Canva templates, and AI prompt packs to Arabic-speaking professionals in MENA (Egypt, Saudi Arabia, UAE).
Propose 3 specific customer acquisition actions for this week:
1. Arabic social media channel strategy (Telegram groups, Facebook)
2. Gumroad listing SEO improvements (Arabic keywords)
3. Bundle or upsell opportunity to increase average order value
Keep each proposal to 2-3 lines.`,
  },
  saas: {
    role: 'CTO',
    task_type: 'mvp_spec',
    prompt: `You are the CTO of AI Sales Buddy (Pronto) — a SaaS AI widget that automates lead capture and demo booking for B2B companies. Built on Lovable.dev. URL: https://pronto-ai-sales-buddy.lovable.app/
Propose 3 specific technical actions to unlock first revenue this week:
1. Stripe pricing page implementation (3 tiers: $29/$79/$199)
2. Arabic UI toggle for MENA B2B market
3. One quick win to improve landing page conversion rate
Keep each proposal to 2-3 lines.`,
  },
}

// Cross-functional CXO tasks (COO + CFO) — common across all businesses
const CROSS_CXO_TASKS: Array<{ role: string; task_type: TaskType; prompt: string }> = [
  {
    role: 'COO',
    task_type: 'ops_review',
    prompt: `You are the COO (Chief Operating Officer) of Launchpad — operator: Suzan Attallah, Egypt. Review the operations of these 3 businesses:
- Patent Mining Spain (Python pipeline → USPTO → Amazon.es FBA, physical_product) — Phase 1: pipeline setup
- DigitalSouq (Gumroad store, digital_product) — Arabic templates and AI prompt packs
- AI Sales Buddy / Pronto (Lovable.dev SaaS, saas) — https://pronto-ai-sales-buddy.lovable.app/

Report on:
1. Any deployment or pipeline blockers for each business
2. Critical operations tasks to prioritize this week
3. One automation opportunity that reduces manual work`,
  },
  {
    role: 'CFO',
    task_type: 'budget_review',
    prompt: `You are the CFO (Chief Financial Officer) of Launchpad — operator: Suzan Attallah, monthly budget $500. Review the monetization status of these 3 businesses:
- Patent Mining Spain: Amazon.es FBA (pending seller account — €39/month one-way door), unit economics: €14.99 sale / €7.19 net profit (48%)
- DigitalSouq: Gumroad (products $7-$12, bundle $19 — all pending launch)
- AI Sales Buddy: Stripe subscriptions ($29/$79/$199/month — pending implementation)

Report on:
1. Month 1 revenue forecast (realistic, given current setup stage)
2. Priority investment: which business should receive first spend and why
3. Current API cost burn rate and runway at $500/month budget`,
  },
]

export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const supabase = createServiceClient()

  const { data: startups } = await supabase
    .from('startups')
    .select('id, name, business_type')
    .eq('status', 'active')

  if (!startups?.length) {
    return NextResponse.json({ message: 'No startups found' })
  }

  // Business-specific (CMO / CTO) + Cross-functional (COO / CFO) を並列実行
  const businessPromises = startups
    .filter(s => BUSINESS_TASKS[s.business_type])
    .map(async startup => {
      const task = BUSINESS_TASKS[startup.business_type]
      const { content, costUsd } = await runHeartbeatTask(supabase, {
        model: 'claude-sonnet-4-6',
        maxTokens: 800,
        prompt: task.prompt,
        systemPrompt: `You are the ${task.role} of Launchpad. Provide actionable and specific recommendations.`,
        startupId: startup.id,
        taskType: task.task_type,
      })
      return { startup: startup.name, role: task.role, suggestions: content, costUsd }
    })

  const crossPromises = CROSS_CXO_TASKS.map(async task => {
    const { content, costUsd } = await runHeartbeatTask(supabase, {
      model: 'claude-sonnet-4-6',
      maxTokens: 800,
      prompt: task.prompt,
      systemPrompt: `You are the ${task.role} of Launchpad. Provide actionable and specific recommendations.`,
      startupId: startups[0].id,
      taskType: task.task_type,
    })
    return { role: task.role, report: content, costUsd }
  })

  const allResults = await Promise.all([...businessPromises, ...crossPromises])
  const totalCost = allResults.reduce((sum, r) => sum + r.costUsd, 0)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const results = allResults.map(({ costUsd: _costUsd, ...rest }) => rest)

  return NextResponse.json({ ok: true, total_cost_usd: totalCost, results })
}
