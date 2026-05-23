/**
 * Generate long-form `body` content for every DailyGuide that doesn't
 * have one yet. The body is what the public /guides/<slug> page renders
 * as the article — without it, the page falls back to the talking-head
 * script.
 *
 * Source material per guide: title + hook + script + caption. The model
 * is asked to *expand* this into a 400-600 word conversational blog
 * post, NOT to invent facts. We never reference outside sources (no
 * mariah, no third-party links), so the resulting page is fully owned
 * by the user.
 *
 * Usage:
 *   npx tsx scripts/generate-guide-bodies.ts              # only fills empty bodies
 *   FORCE=1 npx tsx scripts/generate-guide-bodies.ts      # regenerate every guide
 *   LIMIT=5 npx tsx scripts/generate-guide-bodies.ts      # do 5 then stop (smoke test)
 *   MODEL=claude-haiku-4-5 npx tsx ...                    # switch model
 *
 * Idempotent: re-running without FORCE only touches rows where body is
 * empty, so a partial run resumes cleanly from where it stopped.
 */

import { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

// Load .env with override:true — the shell sometimes has an empty
// ANTHROPIC_API_KEY that shadows the real one in .env. Local-only
// concern; in Vercel/CI the env is already correct.
dotenv.config({ path: ".env", override: true });

// CLI flag parser — env vars are awkward on Windows cmd vs bash, so we
// accept both. CLI takes precedence.
function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((a) => a.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const MODEL = arg("model") ?? process.env.MODEL ?? "claude-sonnet-4-5";
const FORCE = flag("force") || process.env.FORCE === "1";
const LIMIT_RAW = arg("limit") ?? process.env.LIMIT;
const LIMIT = LIMIT_RAW ? parseInt(LIMIT_RAW, 10) : undefined;
const SLEEP_MS = parseInt(arg("sleep") ?? process.env.SLEEP_MS ?? "600", 10);
const MAX_RETRIES = parseInt(arg("retries") ?? process.env.RETRIES ?? "3", 10);

const SYSTEM_PROMPT = `You write conversational long-form blog articles for a creator who teaches AI
to business operators. Voice: warm, direct, second-person ("you"). No corporate fluff,
no clickbait, no "in this guide we will explore" filler.

You will receive a talking-head reel's title, hook, script, and caption. Your job is to
EXPAND that material into a 400-600 word article that someone could read on a webpage
INSTEAD of watching the reel. Keep every concrete fact, example, and step from the
source — do not invent new ones. Reword everything in flowing prose paragraphs.

Output format rules — these are strict:
- Plain text only. No markdown headings, no bold, no bullet lists, no numbered lists.
- Paragraphs separated by a single blank line.
- 4-7 paragraphs total.
- Open with a sentence that gets straight to the point. Do not start with "In this article"
  or "Let me tell you about" or any meta intro.
- End with one short paragraph that gives the reader a clear next action, NOT a generic
  "thanks for reading" sign-off.
- Do not mention "the video", "this reel", "watch", "follow me", or any social-platform
  language. Write as if this is the original article and the reel was derived from it.
- Do not include a title — the page renders the title separately.

Return ONLY the article body. No preamble, no commentary, no meta-explanation of what
you wrote.`;

type GuideRow = {
  id: string;
  slug: string;
  title: string;
  hook: string;
  script: string;
  caption: string;
  body: string;
};

function buildUserMessage(g: GuideRow): string {
  return [
    `TITLE: ${g.title}`,
    "",
    `HOOK (the on-camera opener):`,
    g.hook,
    "",
    `TALKING-HEAD SCRIPT (the spoken content):`,
    g.script,
    "",
    `INSTAGRAM CAPTION (additional framing — may overlap with script):`,
    g.caption,
    "",
    `Write the 400-600 word article body now.`,
  ].join("\n");
}

async function generateOne(client: Anthropic, g: GuideRow): Promise<string> {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(g) }],
  });
  const first = msg.content[0];
  if (!first || first.type !== "text") {
    throw new Error("No text content in Anthropic response");
  }
  return first.text.trim();
}

async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !key.startsWith("sk-ant")) {
    console.error(
      "ANTHROPIC_API_KEY missing or malformed. Check .env (value should start with sk-ant).",
    );
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: key });
  const prisma = new PrismaClient();

  // Define retry helper up here so it can also wrap the initial query.
  // Neon's serverless compute auto-suspends after idle and needs ~1s
  // to wake on first connect, so cold-start failures are normal.
  async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        const msg = (e as Error).message ?? "";
        const transient =
          msg.includes("Can't reach database") ||
          msg.includes("connection pool") ||
          msg.includes("connection") ||
          msg.includes("ECONNRESET") ||
          msg.includes("ETIMEDOUT") ||
          msg.includes("overloaded") ||
          msg.includes("rate_limit") ||
          msg.includes("429") ||
          msg.includes("529");
        if (!transient || attempt === MAX_RETRIES) throw e;
        const backoff = 1500 * 2 ** (attempt - 1);
        console.warn(
          `  · ${label} attempt ${attempt} failed (${msg.slice(0, 80)}…); retry in ${backoff}ms`,
        );
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
    throw lastErr;
  }

  try {
    const rows = (await withRetry("initial findMany", () =>
      prisma.dailyGuide.findMany({
        where: FORCE ? {} : { body: "" },
        orderBy: [{ index: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          slug: true,
          title: true,
          hook: true,
          script: true,
          caption: true,
          body: true,
        },
      }),
    )) as GuideRow[];

    const todo = LIMIT ? rows.slice(0, LIMIT) : rows;
    console.log(
      `Found ${rows.length} guide${rows.length === 1 ? "" : "s"} to process` +
        (LIMIT ? ` (limited to ${LIMIT})` : "") +
        ` · model=${MODEL} · sleep=${SLEEP_MS}ms`,
    );

    let done = 0;
    let failed = 0;
    const failures: { slug: string; reason: string }[] = [];

    for (const g of todo) {
      const t0 = Date.now();
      try {
        // Skip rows with no script — there's nothing to expand.
        if (!g.script.trim()) {
          console.log(`[skip] ${g.slug} (empty script)`);
          continue;
        }

        const body = await withRetry(`anthropic ${g.slug}`, () => generateOne(client, g));
        if (!body || body.length < 100) {
          throw new Error(`Model returned suspiciously short body (${body.length} chars)`);
        }

        await withRetry(`db update ${g.slug}`, () =>
          prisma.dailyGuide.update({
            where: { id: g.id },
            data: { body },
          }),
        );

        done++;
        const ms = Date.now() - t0;
        const wc = body.trim().split(/\s+/).filter(Boolean).length;
        console.log(
          `[${done}/${todo.length}] ${g.slug} · ${wc} words · ${ms}ms`,
        );
      } catch (e) {
        failed++;
        const reason = (e as Error).message;
        failures.push({ slug: g.slug, reason });
        console.warn(`[fail] ${g.slug}: ${reason}`);
      }

      // Be polite to the Anthropic API. Default 600ms between requests
      // keeps us well below the per-minute RPM cap on standard tier.
      if (SLEEP_MS > 0) await new Promise((r) => setTimeout(r, SLEEP_MS));
    }

    console.log(`\nDone. ${done} generated · ${failed} failed.`);
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
