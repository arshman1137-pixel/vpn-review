import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireCronAuth } from "@/lib/auth";
import { runDreaming } from "@/lib/agent/dreaming";

// Dreaming processes multiple startups sequentially — allow generous timeout
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  const supabase = createServiceClient();

  // Fetch all active startups grouped by user
  const { data: startups, error } = await supabase
    .from("startups")
    .select("id, name, user_id")
    .eq("status", "active");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!startups?.length) {
    return NextResponse.json({ ok: true, message: "No active startups", results: [] });
  }

  const results: Array<{
    startup: string;
    startupId: string;
    userId: string;
    sessionCount: number;
    costUsd: number;
  }> = [];
  const errors: Array<{ startup: string; error: string }> = [];

  // Process each startup sequentially to avoid rate-limit spikes
  for (const startup of startups) {
    try {
      const result = await runDreaming(supabase, startup.user_id, startup.id);
      if (result) {
        results.push({
          startup: startup.name,
          startupId: startup.id,
          userId: startup.user_id,
          sessionCount: result.sessionCount,
          costUsd: result.costUsd,
        });
      }
    } catch (err) {
      errors.push({
        startup: startup.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);

  return NextResponse.json({
    ok: errors.length === 0,
    total_cost_usd: totalCost,
    dreams_created: results.length,
    results,
    ...(errors.length > 0 && { errors }),
  });
}
