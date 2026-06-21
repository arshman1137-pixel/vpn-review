import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// Mock anthropicClient module — vi.hoisted so the variable is available in the hoisted vi.mock factory
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))
vi.mock('@/lib/agent/anthropicClient', () => ({
  anthropic: { messages: { create: mockCreate } },
}))

import { runHeartbeatTask, type HeartbeatTaskInput } from './heartbeatRunner'

function makeSupabase(): SupabaseClient {
  return {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  } as unknown as SupabaseClient
}

function makeAnthropicResponse(text: string, inputTokens = 100, outputTokens = 50) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  }
}

describe('runHeartbeatTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const baseInput: HeartbeatTaskInput = {
    model: 'claude-sonnet-4-6',
    maxTokens: 800,
    prompt: 'Test prompt',
    systemPrompt: 'You are a test agent.',
    startupId: 'startup-1',
    taskType: 'market_research',
  }

  it('calls Anthropic with correct parameters', async () => {
    mockCreate.mockResolvedValue(makeAnthropicResponse('result'))
    const supabase = makeSupabase()

    await runHeartbeatTask(supabase, baseInput)

    expect(mockCreate).toHaveBeenCalledWith({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: 'Test prompt' }],
      system: 'You are a test agent.',
    })
  })

  it('inserts agent_run row with correct fields', async () => {
    mockCreate.mockResolvedValue(makeAnthropicResponse('AI output', 200, 100))
    const supabase = makeSupabase()

    await runHeartbeatTask(supabase, baseInput)

    const fromCall = (supabase.from as ReturnType<typeof vi.fn>)
    expect(fromCall).toHaveBeenCalledWith('agent_runs')
    const insertCall = fromCall.mock.results[0].value.insert
    expect(insertCall).toHaveBeenCalledWith({
      user_id: null,
      startup_id: 'startup-1',
      model: 'claude-sonnet-4-6',
      tokens_input: 200,
      tokens_output: 100,
      cost_usd: expect.any(Number),
      task_type: 'market_research',
      result: 'AI output',
    })
  })

  it('returns content and costUsd', async () => {
    mockCreate.mockResolvedValue(makeAnthropicResponse('AI output', 200, 100))
    const supabase = makeSupabase()

    const result = await runHeartbeatTask(supabase, baseInput)

    expect(result.content).toBe('AI output')
    expect(result.costUsd).toBeGreaterThan(0)
    // sonnet: (200/1M)*3 + (100/1M)*15 = 0.0006 + 0.0015 = 0.0021
    expect(result.costUsd).toBeCloseTo(0.0021, 6)
  })

  it('works with opus model pricing', async () => {
    mockCreate.mockResolvedValue(makeAnthropicResponse('CEO report', 1000, 500))
    const supabase = makeSupabase()

    const result = await runHeartbeatTask(supabase, {
      ...baseInput,
      model: 'claude-opus-4-6',
      taskType: 'pivot_analysis',
    })

    // opus: (1000/1M)*15 + (500/1M)*75 = 0.015 + 0.0375 = 0.0525
    expect(result.costUsd).toBeCloseTo(0.0525, 6)
    expect(result.content).toBe('CEO report')
  })
})
