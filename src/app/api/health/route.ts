import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { checkIntegrations } from "@/lib/health";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Returns the live state of every external integration as JSON.
 * Auth-gated (this leaks "is X configured" — not a secret per se, but not
 * worth advertising to anonymous scanners either).
 *
 * Rate limit: 120/min per user. Bumped above the usual 60 because the
 * dashboard widget auto-refreshes every 60s and we don't want a couple of
 * open tabs to lock the user out of their own health page.
 */
export async function GET() {
  let userId: string;
  try {
    userId = await requireUser();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const rl = await rateLimit(`health:${userId}`, { max: 120, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec: rl.retryAfterSec },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSec),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  try {
    const report = await checkIntegrations();
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "health_check_failed", message: msg },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
