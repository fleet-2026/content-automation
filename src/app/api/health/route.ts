import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { checkIntegrations } from "@/lib/health";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  // Explicit Vary so any well-behaved cache (including Vercel's edge) keys on
  // auth state and can't accidentally serve a cached health body cross-user.
  Vary: "Cookie, Authorization",
  Pragma: "no-cache",
} as const;

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anon"
  );
}

/**
 * GET /api/health
 *
 * Returns the live state of every external integration as JSON.
 * Auth-gated (this leaks "is X configured" — not a secret per se, but not
 * worth advertising to anonymous scanners either).
 *
 * Rate limit: two layers.
 *  - Per-IP 60/min runs BEFORE auth/probes so anonymous floods can't trigger
 *    upstream calls (Neon wake-up burns compute; FlipIt probe leaves our IP).
 *  - Per-user 120/min after auth. Bumped above the usual 60 because the
 *    dashboard widget auto-refreshes every 60s and a couple of open tabs
 *    shouldn't lock the user out. In dev-open mode all visitors share the
 *    default user, so the IP layer carries most of the weight there.
 */
export async function GET(req: NextRequest) {
  // Layer 1: per-IP, applied BEFORE auth + BEFORE probes so unauthenticated
  // scanners can't fan out into upstream calls.
  const ipRl = await rateLimit(`health-ip:${getIp(req)}`, {
    max: 60,
    windowMs: 60_000,
  });
  if (!ipRl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: {
          "Retry-After": String(ipRl.retryAfterSec),
          ...NO_STORE_HEADERS,
        },
      },
    );
  }

  let userId: string;
  try {
    userId = await requireUser();
  } catch {
    return NextResponse.json(
      { error: "unauthenticated" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  // Layer 2: per-user, after auth has resolved.
  const rl = await rateLimit(`health:${userId}`, { max: 120, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec: rl.retryAfterSec },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSec),
          ...NO_STORE_HEADERS,
        },
      },
    );
  }

  try {
    const report = await checkIntegrations();
    return NextResponse.json(report, { headers: NO_STORE_HEADERS });
  } catch (e) {
    // Never leak the raw error to the client — Prisma/fetch errors include
    // hostnames, query fragments, and stack traces. Log server-side and
    // return a generic envelope so attackers can't probe internals.
    console.error("[api/health] checkIntegrations threw:", e);
    return NextResponse.json(
      { error: "health_check_failed" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
