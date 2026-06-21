import { getLatestDreamMemory } from './dreaming'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CXO_SYSTEM_PROMPTS, CXO_MODELS, type CXORole } from './cxo'
import { extractText } from '@/lib/agent/responseSchemas'
import { checkBudgetPreFlight, deductBudget, BudgetExhaustedError } from '@/lib/agent/budgetDeduction'
import { calcCost } from '@/lib/agent/costs'
import { anthropic } from './anthropicClient'

/**
 * CXO 5役 + CEO の上限コスト見積もり:
 *   Sonnet 4役 × (600 input + 600 output tokens) × $3/$15/M ≈ $0.01 × 4 = $0.04
 *   Opus CEO: 2000 input × $15/M + 1000 output × $75/M ≈ $0.03 + $0.08 = $0.11
 *   合計上限 ≈ $0.15
 * バッファ込みで $0.20 を最低予算として設定。
 * 注意: checkBudgetPreFlight 後に API 呼び出しが発生するため、concurrent リクエストでは
 * 実際のコストが MIN_BUDGET_USD を超える可能性がある。deductBudget の RPC が TOCTOU を防ぐ。
 */
const MIN_BUDGET_USD = 0.20

export interface CouncilResult {
  sessionId: string
  ctoReport: string
  cmoReport: string
  cooReport: string
  cfoReport: string
  ceoDecision: string
  totalCostUsd: number
  budgetRemaining: number
}

interface CXOReport {
  role: CXORole
  content: string
  costUsd: number
  tokensIn: number
  tokensOut: number
}


export async function runCouncil(
  userId: string,
  startupId: string,
  startupContext: string,
  agenda: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<CouncilResult> {
  // Atomic budget check via RPC
  await checkBudgetPreFlight(supabase, userId, MIN_BUDGET_USD)

  const userMessage = `## Startup Context\n${startupContext}\n\n## Agenda\n${agenda}`

  // Step 1: CTO / CMO / COO / CFO in parallel
  const subordinateRoles: Exclude<CXORole, 'ceo'>[] = ['cto', 'cmo', 'coo', 'cfo']

  const reports: CXOReport[] = await Promise.all(
    subordinateRoles.map(async (role): Promise<CXOReport> => {
      const model = CXO_MODELS[role]
      const response = await anthropic.messages.create({
        model,
        max_tokens: 600,
        system: CXO_SYSTEM_PROMPTS[role],
        messages: [{ role: 'user', content: userMessage }],
      })
      const content = extractText(response)
      const costUsd = calcCost(model, response.usage.input_tokens, response.usage.output_tokens)
      return { role, content, costUsd, tokensIn: response.usage.input_tokens, tokensOut: response.usage.output_tokens }
    })
  )

  const byRole = Object.fromEntries(reports.map(r => [r.role, r])) as Record<Exclude<CXORole, 'ceo'>, CXOReport>

  // Step 2: Fetch dream memory (non-blocking — falls back to no memory on error)
  let pastLearnings: string | null = null
  try {
    pastLearnings = await getLatestDreamMemory(supabase, startupId)
  } catch (err) {
    console.warn('[council] Failed to fetch dream memory, proceeding without:', err)
  }

  // Step 3: CEO synthesizes all CXO reports (+ past learnings if available)
  const ceoPromptParts = [
    `## Startup Context\n${startupContext}`,
    `## Agenda\n${agenda}`,
  ]
  if (pastLearnings) {
    ceoPromptParts.push(`## Past Learnings\n${pastLearnings}`)
  }
  ceoPromptParts.push(
    `## CTO Report\n${byRole.cto.content}`,
    `## CMO Report\n${byRole.cmo.content}`,
    `## COO Report\n${byRole.coo.content}`,
    `## CFO Report\n${byRole.cfo.content}`,
  )
  const ceoPrompt = ceoPromptParts.join('\n\n')

  const ceoModel = CXO_MODELS['ceo']
  const ceoResponse = await anthropic.messages.create({
    model: ceoModel,
    max_tokens: 1000,
    system: CXO_SYSTEM_PROMPTS['ceo'],
    messages: [{ role: 'user', content: ceoPrompt }],
  })
  const ceoDecision = extractText(ceoResponse)
  const ceoCostUsd = calcCost(ceoModel, ceoResponse.usage.input_tokens, ceoResponse.usage.output_tokens)

  const totalCostUsd = reports.reduce((sum, r) => sum + r.costUsd, 0) + ceoCostUsd

  // Batch insert execution logs
  await supabase.from('agent_runs').insert([
    ...reports.map(r => ({
      user_id: userId,
      startup_id: startupId,
      model: CXO_MODELS[r.role],
      tokens_input: r.tokensIn,
      tokens_output: r.tokensOut,
      cost_usd: r.costUsd,
      task_type: `cxo_${r.role}`,
    })),
    {
      user_id: userId,
      startup_id: startupId,
      model: ceoModel,
      tokens_input: ceoResponse.usage.input_tokens,
      tokens_output: ceoResponse.usage.output_tokens,
      cost_usd: ceoCostUsd,
      task_type: 'cxo_ceo',
    },
  ])

  // アトミックに予算控除（TOCTOU 競合を排除）
  const deduction = await deductBudget(supabase, userId, totalCostUsd)
  if (!deduction.ok) throw new BudgetExhaustedError('Token budget exhausted (concurrent deduction exceeded limit)')

  // Save CXO session
  const { data: session } = await supabase
    .from('cxo_sessions')
    .insert({
      startup_id: startupId,
      user_id: userId,
      agenda,
      cto_report: byRole.cto.content,
      cmo_report: byRole.cmo.content,
      coo_report: byRole.coo.content,
      cfo_report: byRole.cfo.content,
      ceo_decision: ceoDecision,
      total_cost_usd: totalCostUsd,
    })
    .select('id')
    .single()

  return {
    sessionId: session?.id ?? '',
    ctoReport: byRole.cto.content,
    cmoReport: byRole.cmo.content,
    cooReport: byRole.coo.content,
    cfoReport: byRole.cfo.content,
    ceoDecision,
    totalCostUsd,
    budgetRemaining: deduction.remaining ?? 0,
  }
}
