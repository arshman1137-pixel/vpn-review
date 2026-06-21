// モデルごとのトークンコスト（USD / 100万トークン）
export const TOKEN_COSTS = {
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 },
  'claude-sonnet-4-6':         { input: 3.00, output: 15.00 },
  'claude-opus-4-6':           { input: 15.00, output: 75.00 },
} as const

export type ModelName = keyof typeof TOKEN_COSTS

/**
 * トークン使用量から USD コストを計算する。
 * 未知のモデル名は Error を throw する。
 */
export function calcCost(model: string, tokensIn: number, tokensOut: number): number {
  const costs = TOKEN_COSTS[model as ModelName]
  if (!costs) throw new Error(`Unknown model: ${model}`)
  return (tokensIn / 1_000_000) * costs.input + (tokensOut / 1_000_000) * costs.output
}
