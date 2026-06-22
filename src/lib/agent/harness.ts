import type { SupabaseClient } from '@supabase/supabase-js'
import { checkBudgetPreFlight, deductBudget, BudgetExhaustedError } from '@/lib/agent/budgetDeduction'
import { calcCost, type ModelName } from '@/lib/agent/costs'
import { extractText, parseAgentResponse, RESPONSE_SCHEMAS, type TaskType } from './responseSchemas'
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
  supabaseServiceClient: SupabaseClient<any, any, any>
): Promise<AgentResult> {
  const model: ModelName = config.model ?? 'claude-3-5-sonnet-20240620'
  const maxTokens = config.maxTokens ?? 1000

  await checkBudgetPreFlight(supabaseServiceClient, config.userId)

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
    system: "You are a helpful assistant."
  })

  return {
    content: response.content[0].type === 'text' ? response.content[0].text : '',
    structured: null,
    tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
    costUsd: 0,
    budgetRemaining: 0
  }
}
