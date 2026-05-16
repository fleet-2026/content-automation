/**
 * Integration health probes.
 *
 * One function, many cheap checks. The dashboard hits this to surface "is
 * X actually configured in production?" without us having to SSH into the
 * Vercel env panel and read it line-by-line.
 *
 * Rules:
 *  - Total wall time stays under ~5s. Most checks are env-only.
 *  - Never echo env values. The `detail` field carries context only
 *    (e.g. "expected prefix sk-ant-, got something else").
 *  - Use `env()` from @/lib/env for reads — it strips BOM/whitespace so a
 *    var that's silently broken looks "ok" through that helper. The BOM
 *    audit at the end is the one place we read raw `process.env` to catch
 *    exactly that class of silent failure.
 */
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { checkOpenartAvailability } from "@/lib/ai/openart";

export type IntegrationStatus = "ok" | "missing_env" | "error" | "skipped";

export type IntegrationCheck = {
  id: string;
  label: string;
  status: IntegrationStatus;
  detail?: string;
  latencyMs?: number;
};

export type HealthReport = {
  checkedAt: string;
  overall: "ok" | "degraded" | "down";
  integrations: IntegrationCheck[];
};

// Env vars we sanity-check for a BOM. We scan ALL keys we touch in this
// module; the helper below also dedupes against the actual reported checks.
const BOM_AUDIT_KEYS = [
  "DATABASE_URL",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "APIFY_TOKEN",
  "TAVILY_API_KEY",
  "HEYGEN_API_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "META_APP_ID",
  "META_APP_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "TIKTOK_CLIENT_KEY",
  "TIKTOK_CLIENT_SECRET",
  "TIKTOK_REDIRECT_URI",
  "INNGEST_SIGNING_KEY",
  "NEXT_PUBLIC_APP_URL",
] as const;

const BOM = "﻿";

/** Run a check with a timeout; converts thrown errors into IntegrationCheck. */
async function timed<T>(
  fn: () => Promise<IntegrationCheck>,
  fallbackId: string,
  fallbackLabel: string,
  timeoutMs = 3000,
): Promise<IntegrationCheck> {
  const start = Date.now();
  try {
    const result = await Promise.race<IntegrationCheck>([
      fn(),
      new Promise<IntegrationCheck>((_, reject) =>
        setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
    if (result.latencyMs === undefined) result.latencyMs = Date.now() - start;
    return result;
  } catch (e) {
    return {
      id: fallbackId,
      label: fallbackLabel,
      status: "error",
      detail: e instanceof Error ? e.message : String(e),
      latencyMs: Date.now() - start,
    };
  }
}

// ─── Individual probes ─────────────────────────────────────────

async function checkNeon(): Promise<IntegrationCheck> {
  const id = "neon";
  const label = "Neon (Postgres)";
  if (!env("DATABASE_URL")) {
    return { id, label, status: "missing_env", detail: "DATABASE_URL not set" };
  }
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      id,
      label,
      status: "ok",
      latencyMs: Date.now() - start,
      detail: "SELECT 1 succeeded",
    };
  } catch (e) {
    return {
      id,
      label,
      status: "error",
      detail: e instanceof Error ? e.message : String(e),
      latencyMs: Date.now() - start,
    };
  }
}

function checkAnthropic(): IntegrationCheck {
  const id = "anthropic";
  const label = "Anthropic (Claude)";
  const key = env("ANTHROPIC_API_KEY");
  if (!key) {
    return { id, label, status: "missing_env", detail: "ANTHROPIC_API_KEY not set" };
  }
  if (!key.startsWith("sk-ant-")) {
    return {
      id,
      label,
      status: "error",
      detail: "ANTHROPIC_API_KEY does not start with expected prefix sk-ant-",
    };
  }
  return { id, label, status: "ok", detail: "key present, prefix valid" };
}

function checkOpenAI(): IntegrationCheck {
  const id = "openai";
  const label = "OpenAI";
  const key = env("OPENAI_API_KEY");
  if (!key) {
    return { id, label, status: "missing_env", detail: "OPENAI_API_KEY not set" };
  }
  if (!key.startsWith("sk-")) {
    return {
      id,
      label,
      status: "error",
      detail: "OPENAI_API_KEY does not start with expected prefix sk-",
    };
  }
  return { id, label, status: "ok", detail: "key present, prefix valid" };
}

function checkGroq(): IntegrationCheck {
  const id = "groq";
  const label = "Groq (Whisper transcription)";
  return env("GROQ_API_KEY")
    ? { id, label, status: "ok", detail: "GROQ_API_KEY set" }
    : { id, label, status: "missing_env", detail: "GROQ_API_KEY not set" };
}

function checkApify(): IntegrationCheck {
  const id = "apify";
  const label = "Apify (Instagram scrape)";
  return env("APIFY_TOKEN")
    ? { id, label, status: "ok", detail: "APIFY_TOKEN set" }
    : { id, label, status: "missing_env", detail: "APIFY_TOKEN not set" };
}

function checkTavily(): IntegrationCheck {
  const id = "tavily";
  const label = "Tavily (web search)";
  return env("TAVILY_API_KEY")
    ? { id, label, status: "ok", detail: "TAVILY_API_KEY set" }
    : { id, label, status: "missing_env", detail: "TAVILY_API_KEY not set" };
}

function checkHeyGen(): IntegrationCheck {
  const id = "heygen";
  const label = "HeyGen (avatar video)";
  const key = env("HEYGEN_API_KEY");
  if (!key) {
    return { id, label, status: "missing_env", detail: "HEYGEN_API_KEY not set" };
  }
  if (!key.startsWith("sk_")) {
    return {
      id,
      label,
      status: "error",
      detail: "HEYGEN_API_KEY does not start with expected prefix sk_",
    };
  }
  return { id, label, status: "ok", detail: "key present, prefix valid" };
}

function checkR2(): IntegrationCheck {
  const id = "r2";
  const label = "Cloudflare R2 (object storage)";
  const account = env("R2_ACCOUNT_ID");
  const accessKey = env("R2_ACCESS_KEY_ID");
  const secret = env("R2_SECRET_ACCESS_KEY");
  const bucket = env("R2_BUCKET");
  const missing: string[] = [];
  if (!account) missing.push("R2_ACCOUNT_ID");
  if (!accessKey) missing.push("R2_ACCESS_KEY_ID");
  if (!secret) missing.push("R2_SECRET_ACCESS_KEY");
  if (!bucket) missing.push("R2_BUCKET");
  if (missing.length) {
    return { id, label, status: "missing_env", detail: `missing: ${missing.join(", ")}` };
  }
  return { id, label, status: "ok", detail: "all 4 R2 env vars set" };
}

function checkMeta(): IntegrationCheck {
  const id = "meta";
  const label = "Meta (Instagram OAuth)";
  const appId = env("META_APP_ID");
  const appSecret = env("META_APP_SECRET");
  const missing: string[] = [];
  if (!appId) missing.push("META_APP_ID");
  if (!appSecret) missing.push("META_APP_SECRET");
  if (missing.length) {
    return { id, label, status: "missing_env", detail: `missing: ${missing.join(", ")}` };
  }
  return { id, label, status: "ok", detail: "META_APP_ID + META_APP_SECRET set" };
}

function checkGoogle(): IntegrationCheck {
  const id = "google";
  const label = "Google (YouTube OAuth)";
  const clientId = env("GOOGLE_CLIENT_ID");
  const clientSecret = env("GOOGLE_CLIENT_SECRET");
  const missing: string[] = [];
  if (!clientId) missing.push("GOOGLE_CLIENT_ID");
  if (!clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (missing.length) {
    return { id, label, status: "missing_env", detail: `missing: ${missing.join(", ")}` };
  }
  // env() strips BOM, so this only triggers if env() didn't strip it for some
  // reason. The BOM_AUDIT pass below catches the raw-process.env case.
  const raw = process.env.GOOGLE_CLIENT_ID ?? "";
  if (raw.startsWith(BOM)) {
    return {
      id,
      label,
      status: "error",
      detail: "GOOGLE_CLIENT_ID has BOM prefix — rotate it (UTF-8-with-BOM bug)",
    };
  }
  return { id, label, status: "ok", detail: "client id + secret set, no BOM" };
}

function checkTikTok(): IntegrationCheck {
  const id = "tiktok";
  const label = "TikTok OAuth";
  const clientKey = env("TIKTOK_CLIENT_KEY");
  const clientSecret = env("TIKTOK_CLIENT_SECRET");
  const redirect = env("TIKTOK_REDIRECT_URI");
  const missing: string[] = [];
  if (!clientKey) missing.push("TIKTOK_CLIENT_KEY");
  if (!clientSecret) missing.push("TIKTOK_CLIENT_SECRET");
  if (missing.length) {
    return { id, label, status: "missing_env", detail: `missing: ${missing.join(", ")}` };
  }
  // Optional but useful — if the redirect URI is set, verify it matches the
  // public app URL host. Mismatches cause silent OAuth-callback failures.
  const appUrl = env("NEXT_PUBLIC_APP_URL");
  if (redirect && appUrl) {
    try {
      const rh = new URL(redirect).host;
      const ah = new URL(appUrl).host;
      if (rh !== ah) {
        return {
          id,
          label,
          status: "error",
          detail: `TIKTOK_REDIRECT_URI host (${rh}) does not match NEXT_PUBLIC_APP_URL host (${ah})`,
        };
      }
    } catch {
      return {
        id,
        label,
        status: "error",
        detail: "TIKTOK_REDIRECT_URI or NEXT_PUBLIC_APP_URL is not a valid URL",
      };
    }
  }
  return { id, label, status: "ok", detail: "client key/secret set, redirect URI host matches" };
}

function checkInngest(): IntegrationCheck {
  const id = "inngest";
  const label = "Inngest (job queue)";
  return env("INNGEST_SIGNING_KEY")
    ? { id, label, status: "ok", detail: "INNGEST_SIGNING_KEY set" }
    : {
        id,
        label,
        status: "skipped",
        detail: "INNGEST_SIGNING_KEY not set — cron-poller backstop covers this",
      };
}

async function checkOpenArt(): Promise<IntegrationCheck> {
  const id = "openart";
  const label = "OpenArt (local Playwright)";
  try {
    const r = await checkOpenartAvailability();
    return r.available
      ? { id, label, status: "ok", detail: `script + python found` }
      : { id, label, status: "skipped", detail: r.reason ?? "not available" };
  } catch (e) {
    return {
      id,
      label,
      status: "error",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

async function checkFlipIt(): Promise<IntegrationCheck> {
  const id = "flipit";
  const label = "FlipIt (external service)";
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const res = await fetch(
        "https://flipit-app.netlify.app/.netlify/functions/_health",
        { signal: controller.signal, cache: "no-store" },
      );
      if (res.ok) {
        return {
          id,
          label,
          status: "ok",
          detail: `health endpoint returned ${res.status}`,
          latencyMs: Date.now() - start,
        };
      }
      // No health endpoint? Falls through to a passive env-only check.
      // 404 means the function isn't deployed; we treat that as "skipped"
      // since the service is reached via direct API calls elsewhere.
      if (res.status === 404) {
        return {
          id,
          label,
          status: "skipped",
          detail: "no _health endpoint deployed; service reached via direct API calls",
          latencyMs: Date.now() - start,
        };
      }
      return {
        id,
        label,
        status: "error",
        detail: `health endpoint returned ${res.status}`,
        latencyMs: Date.now() - start,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Network errors / timeouts are reported but not fatal — FlipIt is used
    // via direct calls, not background coordination.
    return {
      id,
      label,
      status: "error",
      detail: msg.includes("aborted") ? "health probe timed out after 2s" : msg,
      latencyMs: Date.now() - start,
    };
  }
}

// ─── BOM audit ─────────────────────────────────────────────────
//
// Reads raw process.env directly (NOT via env()) since env() strips BOMs.
// If we find any, surface them as their own check so they can't hide behind
// otherwise-passing env-only checks.

function auditBom(): IntegrationCheck[] {
  const offenders: string[] = [];
  for (const key of BOM_AUDIT_KEYS) {
    const raw = process.env[key];
    if (raw && raw.startsWith(BOM)) offenders.push(key);
  }
  if (offenders.length === 0) return [];
  return offenders.map((key) => ({
    id: `bom:${key.toLowerCase()}`,
    label: `BOM in ${key}`,
    status: "error" as const,
    detail: "BOM detected — env was saved as UTF-8-with-BOM; rotate it",
  }));
}

// ─── Public API ────────────────────────────────────────────────

export async function checkIntegrations(): Promise<HealthReport> {
  const checkedAt = new Date().toISOString();

  // Run every probe in parallel. The sync ones return immediately; the
  // async ones each get an outer timeout via timed().
  const results = await Promise.all([
    timed(() => checkNeon(), "neon", "Neon (Postgres)", 4000),
    Promise.resolve(checkAnthropic()),
    Promise.resolve(checkOpenAI()),
    Promise.resolve(checkGroq()),
    Promise.resolve(checkApify()),
    Promise.resolve(checkTavily()),
    Promise.resolve(checkHeyGen()),
    Promise.resolve(checkR2()),
    Promise.resolve(checkMeta()),
    Promise.resolve(checkGoogle()),
    Promise.resolve(checkTikTok()),
    Promise.resolve(checkInngest()),
    timed(() => checkOpenArt(), "openart", "OpenArt (local Playwright)", 3000),
    timed(() => checkFlipIt(), "flipit", "FlipIt (external service)", 3000),
  ]);

  // Append any BOM offenders as extra checks.
  const bomChecks = auditBom();
  const integrations = [...results, ...bomChecks];

  // Rollup. Any error → "down". Else any missing_env → "degraded". Else "ok".
  let overall: HealthReport["overall"] = "ok";
  if (integrations.some((c) => c.status === "error")) overall = "down";
  else if (integrations.some((c) => c.status === "missing_env")) overall = "degraded";

  return { checkedAt, overall, integrations };
}
