/**
 * In-memory sliding-window rate limiter.
 *
 * Adequate as a launch speed bump:
 *  - Single-instance: limits hold globally
 *  - Vercel multi-instance: limits hold *per instance*. Worst case, an
 *    attacker hitting N instances can do N× the limit. Still cuts naive
 *    abuse by orders of magnitude.
 *
 * Swap in @upstash/ratelimit + @upstash/redis later for global limits.
 * The `rateLimit()` API surface should not change.
 */

type Hit = { ts: number };

// One bucket per key. Old entries expire automatically.
const buckets = new Map<string, Hit[]>();

// Global cleanup so the Map can't grow unbounded.
const CLEANUP_INTERVAL_MS = 60 * 1000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
function ensureCleanup() {
  if (cleanupTimer) return;
  // Don't keep the process alive just for cleanup.
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, hits] of buckets) {
      // Drop buckets whose newest hit is over 1 hour old
      if (hits.length === 0 || now - hits[hits.length - 1].ts > 60 * 60 * 1000) {
        buckets.delete(k);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  // Node's setInterval returns a Timeout object; unref so it doesn't block exit.
  if (cleanupTimer && typeof (cleanupTimer as unknown as { unref?: () => void }).unref === "function") {
    (cleanupTimer as unknown as { unref: () => void }).unref();
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  limit: number;
};

export async function rateLimit(
  key: string,
  opts: { max: number; windowMs: number },
): Promise<RateLimitResult> {
  ensureCleanup();
  const now = Date.now();
  const cutoff = now - opts.windowMs;

  let hits = buckets.get(key);
  if (!hits) {
    hits = [];
    buckets.set(key, hits);
  }

  // Drop hits outside the window. Slice from the first kept hit to keep this O(n)
  // even if the bucket has accumulated many entries.
  let firstKept = 0;
  while (firstKept < hits.length && hits[firstKept].ts < cutoff) firstKept++;
  if (firstKept > 0) hits.splice(0, firstKept);

  if (hits.length >= opts.max) {
    const oldest = hits[0].ts;
    const retryAfterMs = Math.max(0, oldest + opts.windowMs - now);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil(retryAfterMs / 1000),
      limit: opts.max,
    };
  }

  hits.push({ ts: now });
  return {
    allowed: true,
    remaining: opts.max - hits.length,
    retryAfterSec: 0,
    limit: opts.max,
  };
}

/**
 * Helper for server actions. Throws a user-friendly error when limited.
 */
export async function enforceRateLimit(
  key: string,
  opts: { max: number; windowMs: number; label?: string },
): Promise<void> {
  const r = await rateLimit(key, opts);
  if (r.allowed) return;
  const mins = Math.ceil(r.retryAfterSec / 60);
  throw new Error(
    `Rate limit hit${opts.label ? ` (${opts.label})` : ""}. Try again in ~${mins} min.`,
  );
}

// Convenience presets so usage stays consistent across the app.
export const RATE_LIMITS = {
  CHAT: { max: 30, windowMs: 60_000 },
  HOOK_GEN: { max: 30, windowMs: 60 * 60_000 },
  IMAGE_GEN: { max: 20, windowMs: 60 * 60_000 },
  VIDEO_GEN: { max: 5, windowMs: 60 * 60_000 },
  AVATAR_GEN: { max: 5, windowMs: 60 * 60_000 },
  TRANSCRIBE: { max: 30, windowMs: 60 * 60_000 },
  SCRAPE: { max: 10, windowMs: 60 * 60_000 },
  UPLOAD: { max: 50, windowMs: 60 * 60_000 },
  FLIPIT: { max: 20, windowMs: 60 * 60_000 },
  // Viralize / post-fixer is expensive (~$0.06/call). Tighter cap than HOOK_GEN
  // because with AUTH_DEV_OPEN=1 in prod every visitor shares the default user.
  POST_FIX: { max: 5, windowMs: 60 * 60_000 },
  // Per-(user, postId) idempotency lock — 1 fix per post per 60s prevents
  // double-click and rapid back-button bounces from generating duplicate drafts.
  POST_FIX_SAME: { max: 1, windowMs: 60_000 },
  // Shared-password gate: throttle login attempts per IP to make brute force
  // expensive even before the timing-safe compare kicks in.
  ACCESS_ATTEMPT: { max: 10, windowMs: 60_000 },
} as const;
