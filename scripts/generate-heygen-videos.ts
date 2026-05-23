/**
 * Bulk-generate HeyGen talking-head videos for every DailyGuide.
 *
 * Processes guides in index order (lowest index = post #1 first).
 * Idempotent: skips guides where videoUrl is already set unless --force.
 * Stops cleanly on credit / quota errors so you never burn cycles you
 * can't afford — you can resume the moment you top up.
 *
 * Required env or CLI:
 *   --avatar=<id>   (or HEYGEN_DEFAULT_AVATAR_ID in env)
 *   --voice=<id>    (or HEYGEN_DEFAULT_VOICE_ID in env)
 *
 * Optional CLI:
 *   --start=N        skip until index >= N
 *   --limit=N        process only N guides (great for smoke-testing)
 *   --force          regenerate even if videoUrl already set
 *   --sleep=N        ms between HeyGen jobs (default 5000)
 *
 * Usage:
 *   npx tsx scripts/generate-heygen-videos.ts --avatar=... --voice=... --limit=1
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env", override: true });
dotenv.config({ path: ".env.local", override: true });

import { PrismaClient } from "@prisma/client";
import { generateAvatarVideo } from "../src/lib/ai/heygen";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const m = process.argv.find((a) => a.startsWith(prefix));
  return m ? m.slice(prefix.length) : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const AVATAR = arg("avatar") ?? process.env.HEYGEN_DEFAULT_AVATAR_ID;
const VOICE = arg("voice") ?? process.env.HEYGEN_DEFAULT_VOICE_ID;
const START = parseInt(arg("start") ?? "0", 10);
const LIMIT = arg("limit") ? parseInt(arg("limit")!, 10) : undefined;
const SLEEP_MS = parseInt(arg("sleep") ?? "5000", 10);
const FORCE = flag("force");

// Heuristic: HeyGen returns various error messages when out of credits.
// We treat any of these substrings as terminal (stop, don't retry).
const CREDIT_ERROR_MARKERS = [
  "credit",
  "quota",
  "insufficient",
  "exceeded",
  "billing",
  "subscription",
  "402",
  "10005", // HeyGen error code for insufficient credits
];
function isCreditError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return CREDIT_ERROR_MARKERS.some((m) => lower.includes(m));
}

async function main() {
  if (!AVATAR || !VOICE) {
    console.error(
      "Missing --avatar=<id> and/or --voice=<id> (or HEYGEN_DEFAULT_AVATAR_ID / HEYGEN_DEFAULT_VOICE_ID in env).",
    );
    console.error("Run `npx tsx scripts/list-heygen-resources.ts` to find your IDs.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const where = FORCE ? {} : { videoUrl: null };
    const rows = await prisma.dailyGuide.findMany({
      where,
      orderBy: [{ index: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        index: true,
        script: true,
        videoUrl: true,
      },
    });

    // Apply start + limit windowing.
    const filtered = rows.filter((r) => (r.index ?? 0) >= START);
    const todo = LIMIT ? filtered.slice(0, LIMIT) : filtered;

    console.log(
      `Found ${rows.length} candidate${rows.length === 1 ? "" : "s"} (force=${FORCE}); processing ${todo.length}` +
        (START ? ` starting from index ${START}` : "") +
        (LIMIT ? ` limit ${LIMIT}` : ""),
    );
    console.log(`Avatar: ${AVATAR}`);
    console.log(`Voice:  ${VOICE}`);
    console.log("");

    let done = 0;
    let failed = 0;
    const failures: { slug: string; reason: string }[] = [];

    for (const g of todo) {
      const indexLabel = g.index != null ? `#${g.index}` : "(no index)";
      if (!g.script.trim()) {
        console.log(`[skip] ${indexLabel} ${g.slug} (empty script)`);
        continue;
      }

      const t0 = Date.now();
      console.log(`[${done + 1}/${todo.length}] ${indexLabel} ${g.slug} — kicking off…`);

      try {
        const result = await generateAvatarVideo({
          userId: "bulk-heygen",
          script: g.script.trim(),
          avatarId: AVATAR,
          voiceId: VOICE,
          aspect: "9:16",
          pollMs: 5000,
          timeoutMs: 10 * 60 * 1000,
        });
        await prisma.dailyGuide.update({
          where: { id: g.id },
          data: { videoUrl: result.url },
        });
        const ms = Date.now() - t0;
        const sec = result.durationSec ? ` · ${result.durationSec}s clip` : "";
        console.log(`  ✓ rendered in ${(ms / 1000).toFixed(1)}s${sec} → ${result.url}`);
        done++;
      } catch (e) {
        const reason = (e as Error).message;
        if (isCreditError(reason)) {
          console.error("");
          console.error(`╔══════════════════════════════════════════════════════════════════╗`);
          console.error(`║  STOPPED: HeyGen reports out of credits / quota.                ║`);
          console.error(`║  Last attempted: ${indexLabel} ${g.slug.padEnd(40)} ║`);
          console.error(`║  Completed: ${done} video${done === 1 ? "" : "s"} this run.${" ".repeat(Math.max(0, 41 - String(done).length))}║`);
          console.error(`║                                                                  ║`);
          console.error(`║  Top up your HeyGen credits, then resume with:                   ║`);
          console.error(`║    npx tsx scripts/generate-heygen-videos.ts --start=${(g.index ?? 0).toString().padEnd(13)} ║`);
          console.error(`║  (or just rerun without --start — already-done rows are skipped) ║`);
          console.error(`╚══════════════════════════════════════════════════════════════════╝`);
          console.error("");
          console.error("Underlying error:", reason);
          break;
        }
        console.warn(`  ✗ failed: ${reason}`);
        failures.push({ slug: g.slug, reason });
        failed++;
      }

      if (SLEEP_MS > 0) await new Promise((r) => setTimeout(r, SLEEP_MS));
    }

    console.log("");
    console.log(`Done. ${done} rendered · ${failed} failed.`);
    if (failures.length) {
      console.log("Failures (these will be retried next run):");
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
