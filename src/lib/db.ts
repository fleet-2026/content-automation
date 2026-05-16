import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Prisma client + Neon-wakeup retry.
 *
 * Neon's free tier auto-suspends after a few minutes of inactivity. The first
 * query after suspend frequently throws "Closed" / connection-dropped errors
 * while Neon spins back up. The pattern is reliable: retry the same query
 * 1-2x with a short backoff and it succeeds.
 *
 * This client extension wraps every query so callers don't have to know.
 */

// ─── Errors we want to retry ───────────────────────────────────
//
// Prisma surfaces transient connection issues via known error codes:
//   P1001 — can't reach DB (most Neon wake-up failures)
//   P1002 — DB timed out
//   P1008 — operation timed out
//   P1017 — server closed the connection
//
// Plus we string-match "Closed" / "connection" on PrismaClientUnknownRequestError
// since some Neon errors come back as unknown.
function isTransientConnectionError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return ["P1001", "P1002", "P1008", "P1017"].includes(err.code);
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    const msg = err.message || "";
    return /closed|connection|terminated|tcp/i.test(msg);
  }
  // Last-resort: any Error whose message matches Neon's typical signatures
  if (err instanceof Error) {
    const msg = err.message || "";
    if (/error.*closed/i.test(msg) && /postgresql|prisma/i.test(msg)) return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Build a datasource URL with low connection limits in dev. Prisma defaults
 * to (num_cpus * 2 + 1) connections — ~17 on an 8-core box — and when Neon
 * suspends, EACH of those dies and the Rust engine retries each one with
 * heap allocations. Over time this leaks memory and crashes the dev server.
 *
 * `connection_limit=1` → only 1 connection to keep alive.
 * `pool_timeout=0`     → fail fast instead of waiting 10s for a free slot.
 *
 * Production gets the URL untouched — Vercel functions get fresh
 * connections per cold start, no pool to leak.
 */
function devDatasourceUrl(): string | undefined {
  if (process.env.NODE_ENV === "production") return undefined; // use env as-is
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  if (raw.includes("connection_limit=")) return raw; // already configured
  const sep = raw.includes("?") ? "&" : "?";
  return `${raw}${sep}connection_limit=1&pool_timeout=0`;
}

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(devDatasourceUrl() ? { datasourceUrl: devDatasourceUrl() } : {}),
    // Dev: only "warn" — the Rust engine still spams native stderr on connection
    // drops, but at least JS-level logging stays quiet.
    log: process.env.NODE_ENV === "development" ? ["warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = basePrisma;

/**
 * Wrap every operation with up to 2 retries and exponential backoff
 * (300ms, 900ms). Total worst-case wait ~1.2s — well under any reasonable
 * request timeout, and enough for Neon to finish its cold start.
 */
const RETRY_DELAYS_MS = [300, 900];

/**
 * Circuit breaker so concurrent failures during a long Neon outage can't pile
 * up retries indefinitely (which compounds memory pressure and crashed the
 * dev server in one observed case after ~80 minutes).
 *
 * After 8 consecutive transient errors within 30 seconds, the breaker OPENS:
 * new queries fail fast without retrying for 15 seconds. After that, one
 * "probe" query is allowed through. If it succeeds → breaker CLOSES. If it
 * fails → breaker re-opens.
 */
type CircuitState = "closed" | "open" | "half-open";

const breaker = {
  state: "closed" as CircuitState,
  failures: 0,
  firstFailureAt: 0,
  openedAt: 0,
  probeInFlight: false,
};

const BREAKER_FAILURE_THRESHOLD = 8;
const BREAKER_FAILURE_WINDOW_MS = 30_000;
const BREAKER_OPEN_DURATION_MS = 15_000;

function recordFailure(): void {
  const now = Date.now();
  // Reset rolling window if it's been a while since the last failure
  if (now - breaker.firstFailureAt > BREAKER_FAILURE_WINDOW_MS) {
    breaker.failures = 0;
    breaker.firstFailureAt = now;
  }
  breaker.failures++;
  if (breaker.failures >= BREAKER_FAILURE_THRESHOLD) {
    if (breaker.state !== "open") {
      console.error(
        `[prisma] circuit OPEN: ${breaker.failures} transient errors in ${Math.round(
          (now - breaker.firstFailureAt) / 1000,
        )}s. Failing fast for ${BREAKER_OPEN_DURATION_MS / 1000}s.`,
      );
    }
    breaker.state = "open";
    breaker.openedAt = now;
  }
}

function recordSuccess(): void {
  if (breaker.state !== "closed") {
    console.info(`[prisma] circuit CLOSED — connection recovered.`);
  }
  breaker.state = "closed";
  breaker.failures = 0;
  breaker.probeInFlight = false;
}

/**
 * Returns true if the breaker is letting this request through.
 * Transitions to half-open after the open duration and lets one probe through.
 */
function canProceed(): boolean {
  if (breaker.state === "closed") return true;
  const now = Date.now();
  if (breaker.state === "open") {
    if (now - breaker.openedAt < BREAKER_OPEN_DURATION_MS) return false;
    // Time's up — transition to half-open
    breaker.state = "half-open";
    breaker.probeInFlight = false;
  }
  // half-open: allow exactly one probe at a time
  if (breaker.probeInFlight) return false;
  breaker.probeInFlight = true;
  return true;
}

export const prisma = basePrisma.$extends({
  name: "neon-wakeup-retry",
  query: {
    $allOperations: async ({ operation, model, args, query }) => {
      if (!canProceed()) {
        throw new Error(
          "Database temporarily unavailable (circuit breaker open). Try again in a few seconds.",
        );
      }

      let lastErr: unknown;
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
          const result = await query(args);
          recordSuccess();
          return result;
        } catch (err) {
          lastErr = err;
          if (!isTransientConnectionError(err)) {
            // Not a connection issue — don't penalize the breaker. Throw immediately.
            // (Also release the half-open probe slot if we were probing.)
            if (breaker.state === "half-open") breaker.probeInFlight = false;
            throw err;
          }
          if (attempt === RETRY_DELAYS_MS.length) {
            // Out of retries — this is now a real failure
            recordFailure();
            throw err;
          }
          const delay = RETRY_DELAYS_MS[attempt];
          console.warn(
            `[prisma] transient connection error on ${model ?? "?"}.${operation} — retrying in ${delay}ms (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length})`,
          );
          await sleep(delay);
        }
      }
      throw lastErr;
    },
  },
});

// Re-export Prisma namespace so callers can still do `Prisma.PostGetPayload<...>` etc.
export { Prisma };
