vi.mock('server-only', () => ({}))
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BudgetExhaustedError } from '@/lib/agent/budgetDeduction'

// --- Anthropic SDK のモック ---
// vi.hoisted を使って mockCreate を vi.mock ファクトリー内で参照できるようにする
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate }
  },
}))

import { runAgent } from './harness'

// --- ヘルパー ---

/**
 * 予算チェック（check_budget RPC）と予算控除（spend_budget RPC）、
 * および agent_runs INSERT を模倣する Supabase クライアントを返す。
 *
 * @param remaining - check_budget が返す残額。null の場合は RPC エラーを返す。
 * @param deductOk  - spend_budget が成功するか（true=残額あり, false=残量不足）
 */
function makeSupabase(
  remaining: number | null,
  deductOk = true,
): SupabaseClient {
  const mockInsert = vi.fn().mockResolvedValue({ error: null })

  return {
    rpc: vi.fn().mockImplementation((name: string) => {
      if (name === 'check_budget') {
        if (remaining === null) {
          return Promise.resolve({ data: null, error: { message: 'not found' } })
        }
        return Promise.resolve({ data: [{ remaining }], error: null })
      }
      if (name === 'spend_budget') {
        if (!deductOk) {
          // 残量不足: 空配列を返す（TOCTOU パス）
          return Promise.resolve({ data: [], error: null })
        }
        return Promise.resolve({ data: [{ remaining: remaining ?? 0 }], error: null })
      }
      return Promise.resolve({ data: null, error: null })
    }),
    from: vi.fn(() => ({ insert: mockInsert })),
    _mockInsert: mockInsert,
  } as unknown as SupabaseClient
}

function makeAnthropicResponse(text: string, inputTokens = 100, outputTokens = 50) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  }
}

const BASE_CONFIG = {
  userId: 'user-abc',
  startupId: 'startup-xyz',
  taskType: 'market_research' as const,
}

// -------------------------------------------------------------------
// 既存テスト: pre-flight 予算チェック（予算不足でブロックされるパス）
// -------------------------------------------------------------------

describe('runAgent — pre-flight budget check', () => {
  it('throws BudgetExhaustedError when spent_usd equals total_usd (zero remaining)', async () => {
    const supabase = makeSupabase(0)

    await expect(runAgent(BASE_CONFIG, 'any prompt', supabase)).rejects.toThrow(
      BudgetExhaustedError
    )
  })

  it('throws BudgetExhaustedError when spent_usd exceeds total_usd (negative remaining)', async () => {
    const supabase = makeSupabase(-5)

    await expect(runAgent(BASE_CONFIG, 'any prompt', supabase)).rejects.toThrow(
      BudgetExhaustedError
    )
  })

  it('throws generic Error when budget row is not found', async () => {
    const supabase = makeSupabase(null)

    await expect(runAgent(BASE_CONFIG, 'any prompt', supabase)).rejects.toThrow(
      'Budget information not found'
    )
    await expect(runAgent(BASE_CONFIG, 'any prompt', supabase)).rejects.not.toThrow(
      BudgetExhaustedError
    )
  })
})

// -------------------------------------------------------------------
// 新規テスト: 正常系・モデル選択・TOCTOU・副作用
// -------------------------------------------------------------------

describe('runAgent — 正常系', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('AgentResult の全フィールドが正しく返る', async () => {
    // MarketResearchSchema は content: z.string().min(20) → 20文字以上が必要
    const longResponse = 'AI市場は急速に成長しており、多くの競合他社が参入している。差別化戦略が重要。'
    mockCreate.mockResolvedValue(makeAnthropicResponse(longResponse, 200, 100))
    const supabase = makeSupabase(10.0)

    const result = await runAgent(BASE_CONFIG, 'analyze this market', supabase)

    expect(result.content).toBe(longResponse)
    expect(result.tokensUsed).toEqual({ input: 200, output: 100 })
    // haiku: (200/1M)*1.00 + (100/1M)*5.00 = 0.0002 + 0.0005 = 0.0007
    expect(result.costUsd).toBeCloseTo(0.0007, 6)
    expect(result.budgetRemaining).toBe(10.0)
    // market_research: JSON ではなく自由文 → MarketResearchSchema でラップされる（min(20) 満たす）
    expect(result.structured).not.toBeNull()
  })

  it('agent_runs に正しいフィールドで INSERT される', async () => {
    mockCreate.mockResolvedValue(makeAnthropicResponse('result text', 150, 80))
    const supabase = makeSupabase(5.0)

    await runAgent(BASE_CONFIG, 'prompt', supabase)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertCall = ((supabase as any)._mockInsert as ReturnType<typeof vi.fn>)
    expect(insertCall).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-abc',
        startup_id: 'startup-xyz',
        model: 'claude-haiku-4-5-20251001',
        tokens_input: 150,
        tokens_output: 80,
        task_type: 'market_research',
      })
    )
  })

  it('structured が null のとき result フィールドに生テキストが保存される', async () => {
    // pivot_analysis スキーマに合致しない応答 → parsed=null になる
    mockCreate.mockResolvedValue(makeAnthropicResponse('plain text without json', 100, 50))
    const supabase = makeSupabase(5.0)

    const result = await runAgent(
      { ...BASE_CONFIG, taskType: 'pivot_analysis' },
      'prompt',
      supabase,
    )

    expect(result.structured).toBeNull()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertCall = ((supabase as any)._mockInsert as ReturnType<typeof vi.fn>)
    expect(insertCall).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'plain text without json' })
    )
  })

  it('JSON レスポンスが pivot_analysis スキーマに合致するとき structured が non-null', async () => {
    const json = JSON.stringify({ pivot_options: ['Go B2B'], reasoning: 'Higher LTV', risk_level: 'low' })
    mockCreate.mockResolvedValue(makeAnthropicResponse(json, 100, 50))
    const supabase = makeSupabase(5.0)

    const result = await runAgent(
      { ...BASE_CONFIG, taskType: 'pivot_analysis' },
      'prompt',
      supabase,
    )

    expect(result.structured).not.toBeNull()
    expect(result.structured!['risk_level']).toBe('low')
  })
})

describe('runAgent — モデル選択ロジック', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('taskType が pivot_decision のとき sonnet を使う（model 未指定）', async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse(JSON.stringify({ decision: 'go', confidence: 80, rationale: 'ok' }), 100, 50)
    )
    const supabase = makeSupabase(5.0)

    const result = await runAgent(
      { ...BASE_CONFIG, taskType: 'pivot_decision' },
      'decide',
      supabase,
    )

    // sonnet: (100/1M)*3 + (50/1M)*15 = 0.0003 + 0.00075 = 0.00105
    expect(result.costUsd).toBeCloseTo(0.00105, 6)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6' })
    )
  })

  it('taskType が market_research のとき haiku を使う（model 未指定）', async () => {
    mockCreate.mockResolvedValue(makeAnthropicResponse('research', 100, 50))
    const supabase = makeSupabase(5.0)

    await runAgent(BASE_CONFIG, 'research', supabase)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' })
    )
  })

  it('config.model を明示した場合はそのモデルが使われる', async () => {
    mockCreate.mockResolvedValue(makeAnthropicResponse('opus result', 100, 50))
    const supabase = makeSupabase(5.0)

    await runAgent(
      { ...BASE_CONFIG, model: 'claude-opus-4-6' },
      'prompt',
      supabase,
    )

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-4-6' })
    )
  })
})

describe('runAgent — TOCTOU: deductBudget が ok: false を返す', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pre-flight 通過後に deductBudget が失敗したとき BudgetExhaustedError を throw する', async () => {
    mockCreate.mockResolvedValue(makeAnthropicResponse('result', 100, 50))
    // remaining=5 (pre-flight 通過) だが spend_budget は空配列を返す（並列リクエストで枯渇）
    const supabase = makeSupabase(5.0, false)

    await expect(runAgent(BASE_CONFIG, 'prompt', supabase)).rejects.toThrow(BudgetExhaustedError)
  })
})
