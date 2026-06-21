import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropic } from "./anthropicClient";
import { extractText } from "./responseSchemas";
import { calcCost } from "./costs";

const DREAM_MODEL = "claude-haiku-4-5-20251001";
const MAX_SESSIONS = 10;
const MAX_TOKENS = 800;

const DREAM_SYSTEM_PROMPT = `You are an AI memory synthesizer for a startup run entirely by AI agents.
Your job is to review past CxO council sessions and extract durable, actionable learnings.
Output a concise memory entry (max 300 words) structured as:
1. Recurring themes or challenges (bullet points)
2. Decisions that worked well (bullet points)
3. Patterns worth remembering for future sessions (bullet points)
Be specific — reference actual decisions and outcomes, not generalities.`;

export interface DreamResult {
  content: string;
  sessionCount: number;
  costUsd: number;
}

/**
 * Dreaming: review past CxO sessions for a startup and synthesize a memory entry.
 * Returns null if there are no sessions to review.
 */
export async function runDreaming(
  supabase: SupabaseClient,
  userId: string,
  startupId: string
): Promise<DreamResult | null> {
  // Fetch the most recent sessions
  const { data: sessions, error: fetchError } = await supabase
    .from("cxo_sessions")
    .select(
      "id, agenda, ceo_decision, cto_report, cmo_report, coo_report, cfo_report, created_at"
    )
    .eq("startup_id", startupId)
    .order("created_at", { ascending: false })
    .limit(MAX_SESSIONS);

  if (fetchError) {
    console.error("[dreaming] Failed to fetch sessions:", fetchError);
    throw fetchError;
  }

  if (!sessions?.length) {
    return null;
  }

  // Build a condensed summary of each session for the prompt
  const sessionSummaries = sessions
    .map((s, i) => {
      const date = new Date(s.created_at).toISOString().split("T")[0];
      return [
        `### Session ${i + 1} (${date})`,
        `**Agenda:** ${truncate(s.agenda, 200)}`,
        `**CEO Decision:** ${truncate(s.ceo_decision, 300)}`,
        `**CTO:** ${truncate(s.cto_report, 150)}`,
        `**CMO:** ${truncate(s.cmo_report, 150)}`,
        `**COO:** ${truncate(s.coo_report, 150)}`,
        `**CFO:** ${truncate(s.cfo_report, 150)}`,
      ].join("\n");
    })
    .join("\n\n");

  const userPrompt = `Review these ${sessions.length} past CxO council sessions and create a memory entry:\n\n${sessionSummaries}`;

  const response = await anthropic.messages.create({
    model: DREAM_MODEL,
    max_tokens: MAX_TOKENS,
    system: DREAM_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const content = extractText(response);
  const costUsd = calcCost(
    DREAM_MODEL,
    response.usage.input_tokens,
    response.usage.output_tokens
  );

  // Log the AI run
  await supabase.from("agent_runs").insert({
    user_id: userId,
    startup_id: startupId,
    model: DREAM_MODEL,
    tokens_input: response.usage.input_tokens,
    tokens_output: response.usage.output_tokens,
    cost_usd: costUsd,
    task_type: "dream",
    result: content,
  });

  // Save the dream memory
  const { error: insertError } = await supabase.from("agent_memories").insert({
    user_id: userId,
    startup_id: startupId,
    memory_type: "dream",
    content,
    session_count: sessions.length,
  });

  if (insertError) {
    console.error("[dreaming] Failed to save memory:", insertError);
    throw insertError;
  }

  return { content, sessionCount: sessions.length, costUsd };
}

/** Fetch the latest dream memory for a startup (used by council.ts). */
export async function getLatestDreamMemory(
  supabase: SupabaseClient,
  startupId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("agent_memories")
    .select("content")
    .eq("startup_id", startupId)
    .eq("memory_type", "dream")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data?.content ?? null;
}

function truncate(text: string | null | undefined, maxLen: number): string {
  if (!text) return "(none)";
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}
