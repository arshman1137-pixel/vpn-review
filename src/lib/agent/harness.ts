import type { SupabaseClient } from '@supabase/supabase-js'
import { checkBudgetPreFlight, deductBudget, BudgetExhaustedError } from '@/lib/agent/budgetDeduction'
import { calcCost, type ModelName } from '@/lib/agent/costs'
import {
  extractText,
  parseAgentResponse,
  RESPONSE_SCHEMAS,
  type TaskType,
} from './responseSchemas'
import { anthropic } from './anthropicClient'


export interface AgentConfig {
  userId: string
  startupId: string
  taskType: TaskType
  model?: ModelName
  maxTokens?: number
}

export interface AgentResult {
  content: string
  structured: Record<string, unknown> | null
  tokensUsed: { input: number; output: number }
  costUsd: number
  budgetRemaining: number
}

export async function runAgent(
  config: AgentConfig,
  prompt: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseServiceClient: SupabaseClient<any, any, any>
): Promise<AgentResult> {
  // Use sonnet for pivot_decision, haiku for others
  const model: ModelName = config.model ?? (
    config.taskType === 'pivot_decision' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'
  )
  const maxTokens = config.maxTokens ?? 1000

  // Atomic budget check via RPC (avoids read-modify-write race)
  // minUsd=0 (default): allow execution until budget is fully exhausted.
  // council.ts uses MIN_BUDGET_USD=0.10 to reserve a buffer for the full CXO round.
  await checkBudgetPreFlight(supabaseServiceClient, config.userId)

  // Execute agent
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
    system: getSystemPrompt(config.taskType),
  })

  const tokensIn = response.usage.input_tokens
  const tokensOut = response.usage.output_tokens
  const costUsd = calcCost(model, tokensIn, tokensOut)

  // Parse and validate structured response
  const rawContent = extractText(response)
  const schema = RESPONSE_SCHEMAS[config.taskType]
  const { parsed, error: parseError } = parseAgentResponse(rawContent, schema)

  if (parseError) {
    console.warn(`[harness] Structured parse failed for ${config.taskType}: ${parseError}`)
  }

  // Save execution record (store validated JSON in result if available)
  await supabaseServiceClient.from('agent_runs').insert({
    user_id: config.userId,
    startup_id: config.startupId,
    model,
    tokens_input: tokensIn,
    tokens_output: tokensOut,
    cost_usd: costUsd,
    task_type: config.taskType,
    result: parsed ? JSON.stringify(parsed) : rawContent,
  })

  // アトミックに予算控除（TOCTOU 競合を排除）
  const deduction = await deductBudget(supabaseServiceClient, config.userId, costUsd)
  if (!deduction.ok) throw new BudgetExhaustedError('Token budget exhausted (concurrent deduction failed)')

  return {
    content: rawContent,
    structured: parsed as Record<string, unknown> | null,
    tokensUsed: { input: tokensIn, output: tokensOut },
    costUsd,
    budgetRemaining: deduction.remaining ?? 0,
  }
}

function getSystemPrompt(taskType: TaskType): string {
  const prompts: Record<TaskType, string> = {
    pivot_analysis: `You are a startup pivot advisor. Analyze the current business model and suggest concrete pivot options with reasoning. Be specific and actionable. Output valid JSON with fields: pivot_options (string array), reasoning (string), risk_level ("low"|"medium"|"high").`,
    market_research: `You are a rapid market researcher. Given a startup idea, identify the target market, key competitors, and differentiation opportunity in under 500 words. Focus on actionable insights.`,
    mvp_spec: `You are a lean MVP architect. Define the smallest possible MVP that can validate the core hypothesis. Output valid JSON with fields: core_feature (string), validation_metric (string), build_time_estimate (string), tech_stack_suggestion (string).`,
    pivot_decision: `You are a decisive pivot evaluator. Given metrics and context, make a binary go/pivot decision. Output valid JSON with fields: decision ("go"|"pivot"), confidence (number 0-100), rationale (string).`,
    ops_review: `You are a COO (Chief Operating Officer). Review operations and provide actionable recommendations.`,
    budget_review: `You are a CFO (Chief Financial Officer). Review financials and provide actionable recommendations.`,
    ceo_review: `You are the CEO. Review all active startups, assess overall health, and identify the highest-priority next action.`,
    cto_review: `You are the CTO. Propose technical and UX improvements to improve product engagement and retention.`,
  }
  return prompts[taskType]
}
