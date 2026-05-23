/**
 * Bulk-generate the AI video-prompt brief (SCENES + VOICEOVER + CAPTIONS)
 * for every DailyGuide that doesn't have one yet.
 *
 * Mirrors scripts/generate-guide-bodies.ts: idempotent, retry-on-transient,
 * sequential with throttle. Each guide takes ~30 seconds, so 197 × 30s ≈
 * 100 minutes total. Run in the background; resume cleanly after any
 * interruption (script only touches rows where videoPrompt is empty).
 *
 * Usage:
 *   npx tsx scripts/generate-video-prompts.ts               # fill empties
 *   npx tsx scripts/generate-video-prompts.ts --force       # regen all
 *   npx tsx scripts/generate-video-prompts.ts --limit=5     # smoke test
 *   npx tsx scripts/generate-video-prompts.ts --sleep=800   # be politer
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env", override: true });

import { PrismaClient } from "@prisma/client";
import { generateVideoPromptText } from "../src/lib/ai/video-prompt";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((a) => a.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const FORCE = flag("force");
const LIMIT_RAW = arg("limit");
const LIMIT = LIMIT_RAW ? parseInt(LIMIT_RAW, 10) : undefined;
const SLEEP_MS = parseInt(arg("sleep") ?? "600", 10);
const MAX_RETRIES = parseInt(arg("retries") ?? "3", 10);

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = (e as Error).message ?? "";
      const transient =
        msg.includes("connection") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("overloaded") ||
        msg.includes("rate_limit") ||
        msg.includes("429") ||
        msg.includes("529");
      if (!transient || attempt === MAX_RETRIES) throw e;
      const backoff = 1000 * 2 ** (attempt - 1);
      console.warn(
        `  - ${label} attempt ${attempt} failed (${msg.slice(0, 80)}); retry in ${backoff}ms`,
      );
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.dailyGuide.findMany({
      where: FORCE ? {} : { videoPrompt: "" },
      orderBy: [{ index: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        hook: true,
        script: true,
        caption: true,
        body: true,
        videoPrompt: true,
      },
    });
    const todo = LIMIT ? rows.slice(0, LIMIT) : rows;
    console.log(
      `Found ${rows.length} guide${rows.length === 1 ? "" : "s"} to process` +
        (LIMIT ? ` (limited to ${LIMIT})` : ""),
    );

    let done = 0;
    let failed = 0;
    const failures: { slug: string; reason: string }[] = [];

    for (const g of todo) {
      const t0 = Date.now();
      try {
        if (!g.script.trim() && !g.hook.trim()) {
          console.log(`[skip] ${g.slug} (no script or hook)`);
          continue;
        }
        const text = await withRetry(`anthropic ${g.slug}`, () =>
          generateVideoPromptText({
            title: g.title,
            hook: g.hook,
            script: g.script,
            caption: g.caption,
            body: g.body,
          }),
        );
        await withRetry(`db update ${g.slug}`, () =>
          prisma.dailyGuide.update({
            where: { id: g.id },
            data: { videoPrompt: text },
          }),
        );
        done++;
        const ms = Date.now() - t0;
        const wc = text.trim().split(/\s+/).filter(Boolean).length;
        console.log(`[${done}/${todo.length}] ${g.slug} - ${wc} words - ${ms}ms`);
      } catch (e) {
        failed++;
        const reason = (e as Error).message;
        failures.push({ slug: g.slug, reason });
        console.warn(`[fail] ${g.slug}: ${reason}`);
      }
      if (SLEEP_MS > 0) await new Promise((r) => setTimeout(r, SLEEP_MS));
    }

    console.log(`\nDone. ${done} generated - ${failed} failed.`);
    if (failures.length) {
      console.log("Failures:");
      for (const f of failures) console.log(`  - ${f.slug}: ${f.reason}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
