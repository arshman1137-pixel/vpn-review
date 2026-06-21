import type { SupabaseClient } from '@supabase/supabase-js'
import { anthropic } from '@/lib/agent/anthropicClient'
import { calcCost } from '@/lib/agent/costs'
import { extractText } from '@/lib/agent/responseSchemas'

export interface HeartbeatTaskInput {
  model: string
  maxTokens: number
  prompt: string
  systemPrompt: string
  startupId: string
  taskType: string
  /** cron 実行時はユーザーが存在しないため省略可。省略時は null として記録される。 */
  userId?: string
}

export interface HeartbeatTaskResult {
  content: string
  costUsd: number
}

export async function runHeartbeatTask(
  supabase: SupabaseClient,
  input: HeartbeatTaskInput,
): Promise<HeartbeatTaskResult> {
  const response = await anthropic.messages.create({
    model: input.model,
    max_tokens: input.maxTokens,
    messages: [{ role: 'user', content: input.prompt }],
    system: input.systemPrompt,
  })

  const content = extractText(response)
  const costUsd = calcCost(input.model, response.usage.input_tokens, response.usage.output_tokens)

  const { error: insertError } = await supabase.from('agent_runs').insert({
    user_id: input.userId ?? null,
    startup_id: input.startupId,
    model: input.model,
    tokens_input: response.usage.input_tokens,
    tokens_output: response.usage.output_tokens,
    cost_usd: costUsd,
    task_type: input.taskType,
    result: content,
  })
  if (insertError) {
    console.error('[heartbeatRunner] agent_runs insert 失敗（コスト記録漏れ）', insertError)
  }

  return { content, costUsd }
}
