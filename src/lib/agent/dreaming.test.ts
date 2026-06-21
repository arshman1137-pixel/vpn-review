vi.mock("server-only", () => ({}))
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

// Hoist mockCreate so it is available in the mock factory
const mockCreate = vi.hoisted(() => vi.fn())

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate }
  },
}))

import { runDreaming, getLatestDreamMemory } from "./dreaming"

function makeSupabase(
  sessions: Array<Record<string, unknown>> | null,
  memoryContent?: string | null
) {
  const insertMocks: Record<string, ReturnType<typeof vi.fn>> = {
    agent_runs: vi.fn().mockResolvedValue({ error: null }),
    agent_memories: vi.fn().mockResolvedValue({ error: null }),
  }

  const memorySelectChain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn(() => ({
      limit: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: memoryContent !== undefined && memoryContent !== null
            ? { content: memoryContent }
            : null,
          error: null,
        }),
      })),
    })),
  }

  return {
    from: vi.fn((table: string) => {
      if (table === "cxo_sessions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({
                  data: sessions,
                  error: sessions === null ? { message: "fetch error" } : null,
                }),
              })),
            })),
          })),
        }
      }
      if (table === "agent_memories") {
        return {
          insert: insertMocks.agent_memories,
          select: vi.fn(() => memorySelectChain),
        }
      }
      // agent_runs and others
      return { insert: insertMocks[table] ?? vi.fn() }
    }),
  } as unknown as SupabaseClient
}

const SESSION_FIXTURE = {
  id: "sess-1",
  agenda: "Launch MVP",
  ceo_decision: "Ship by Friday",
  cto_report: "Feasible stack: Next.js",
  cmo_report: "Target indie devs",
  coo_report: "Need CI pipeline",
  cfo_report: "Burn is $0.50/day",
  created_at: "2026-05-15T00:00:00Z",
}

describe("runDreaming", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns null when no sessions exist", async () => {
    const supabase = makeSupabase([])
    const result = await runDreaming(supabase, "user-1", "startup-1")
    expect(result).toBeNull()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("synthesizes dream from sessions and saves memory", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "Recurring theme: speed matters." }],
      usage: { input_tokens: 500, output_tokens: 100 },
    })

    const supabase = makeSupabase([SESSION_FIXTURE])
    const result = await runDreaming(supabase, "user-1", "startup-1")

    expect(result).not.toBeNull()
    expect(result!.content).toBe("Recurring theme: speed matters.")
    expect(result!.sessionCount).toBe(1)
    expect(result!.costUsd).toBeGreaterThan(0)

    // Verify Haiku model was used
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-4-5-20251001" })
    )

    // Verify agent_runs was logged
    expect(supabase.from).toHaveBeenCalledWith("agent_runs")

    // Verify agent_memories was saved
    expect(supabase.from).toHaveBeenCalledWith("agent_memories")
  })
})

describe("getLatestDreamMemory", () => {
  it("returns content when memory exists", async () => {
    const supabase = makeSupabase([], "Past learning: iterate fast.")
    const content = await getLatestDreamMemory(supabase, "startup-1")
    expect(content).toBe("Past learning: iterate fast.")
  })

  it("returns null when no memory exists", async () => {
    const supabase = makeSupabase([])
    const content = await getLatestDreamMemory(supabase, "startup-1")
    expect(content).toBeNull()
  })
})
