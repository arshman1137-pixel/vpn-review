import { describe, it, expect } from 'vitest'
import { CXO_MODELS, CXO_SYSTEM_PROMPTS, type CXORole } from './cxo'

const ALL_ROLES: CXORole[] = ['ceo', 'cto', 'cmo', 'coo', 'cfo']

describe('CXO_MODELS', () => {
  it('defines all 5 CXO roles', () => {
    for (const role of ALL_ROLES) {
      expect(CXO_MODELS[role]).toBeDefined()
    }
  })

  it('CEO uses claude-opus-4-6', () => {
    expect(CXO_MODELS.ceo).toBe('claude-opus-4-6')
  })

  it('CTO/CMO/COO/CFO use claude-sonnet-4-6', () => {
    for (const role of ['cto', 'cmo', 'coo', 'cfo'] as CXORole[]) {
      expect(CXO_MODELS[role]).toBe('claude-sonnet-4-6')
    }
  })
})

describe('CXO_SYSTEM_PROMPTS', () => {
  it('defines a non-empty string prompt for all 5 roles', () => {
    for (const role of ALL_ROLES) {
      expect(typeof CXO_SYSTEM_PROMPTS[role]).toBe('string')
      expect(CXO_SYSTEM_PROMPTS[role].length).toBeGreaterThan(0)
    }
  })

  it('CEO prompt contains DECISION keyword', () => {
    expect(CXO_SYSTEM_PROMPTS.ceo).toMatch(/DECISION/)
  })

  it('CTO prompt references technical concepts', () => {
    expect(CXO_SYSTEM_PROMPTS.cto).toMatch(/technical/i)
  })
})
