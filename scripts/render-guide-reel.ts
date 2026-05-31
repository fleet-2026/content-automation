/**
 * Render a guide's HeyGen footage through the Remotion premium-edit
 * pipeline. Produces a Hormozi-style word-by-word captioned, punch-in
 * zoomed, logo-revealed, Claude-UI-mockup'd MP4 — uploads to R2 and
 * saves the URL to DailyGuide.videoUrl.
 *
 *   npx tsx scripts/render-guide-reel.ts --slug=<slug>
 *
 * Defaults to post #1 if no slug given.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env", override: true });
dotenv.config({ path: ".env.local", override: true });

import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "@prisma/client";
import { uploadToR2 } from "../src/lib/r2";
import { safeFetch } from "../src/lib/safe-fetch";
import type {
  CaptionWord,
  EditPlan,
  LogoReveal,
  PunchIn,
  UIMockup,
} from "../remotion/GuideReel";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const m = process.argv.find((a) => a.startsWith(prefix));
  return m ? m.slice(prefix.length) : undefined;
}

const SLUG = arg("slug") ?? "claude-prompts-that-improve-themselves";
// Override: --video-url=https://... lets the user point the pipeline at
// any R2-hosted MP4 (e.g. their own iPhone-recorded talking head
// uploaded via /compose or the Talking-head slot on /daily-post).
// Without this flag we use the guide's saved videoUrl.
const VIDEO_URL_OVERRIDE = arg("video-url");
// Override: --duration=80 — explicit duration in seconds. Useful when
// the source video duration differs from the 80s assumption we've been
// using. (Future improvement: ffprobe the file to auto-detect.)
const DURATION_OVERRIDE = arg("duration") ? parseFloat(arg("duration")!) : undefined;

// ─── Edit planning via Claude ────────────────────────────────────

type PlanResponse = {
  emphasisWords: string[];
  punchIns: { phrase: string; zoom: number }[];
  logos: { trigger: string; brand: string }[];
  uiMockups: {
    triggerPhrase: string;
    userMessage: string;
    assistantReply: string;
  }[];
  hookCard: {
    headline: string;
    subtitle?: string;
  };
};

async function planEdit(input: {
  title: string;
  script: string;
}): Promise<PlanResponse> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2500,
    system: `You plan a premium short-form video edit (Alex Hormozi / Diary of a CEO style).

Given a talking-head script, you produce a JSON edit plan with four arrays. Be selective — quality over quantity. Only call out moments that genuinely deserve emphasis.

1. emphasisWords: 6-10 exact words/phrases from the script (verbatim) that should be visually emphasized in the captions — punchline words, surprising claims, key concepts. Single words or 2-3 word phrases.

2. punchIns: 2-3 moments to do a cinematic punch-in zoom (1.10 to 1.18 zoom). Pick the most emotionally weighty phrases — when she's making a big claim or pivot.

3. logos: brand logos to overlay when she mentions specific tools. Allowed brand values: claude, openai, github, gemini, manychat, instagram, tiktok, notion, zapier, slack, anthropic. Match brand to the trigger phrase exactly — if she says "Claude" → brand:"claude". Only include brands actually mentioned.

4. uiMockups: 1-2 realistic Claude chat UI mockups to render as picture-in-picture. Only use when she's specifically describing a Claude interaction. For each, write a believable user-side prompt + a short 1-2 sentence Claude reply that matches what she's describing in the script at that moment.

5. hookCard: a punchy full-frame intro card shown for the FIRST 4 SECONDS of the video. The headline is the most curiosity-gap-inducing 4-8 word phrase from the script — what would make a scroller stop. The subtitle is an optional ≤12-word framing line. Think Hormozi/Diary-of-CEO opening title cards.

Return ONLY this JSON (no preamble, no code fences):
{
  "emphasisWords": ["word1", "word2", ...],
  "punchIns": [{"phrase": "...", "zoom": 1.15}],
  "logos": [{"trigger": "Claude", "brand": "claude"}],
  "uiMockups": [{"triggerPhrase": "...", "userMessage": "...", "assistantReply": "..."}],
  "hookCard": {"headline": "your claude prompts are getting dumber.", "subtitle": "and most people don't realize it."}
}`,
    messages: [
      {
        role: "user",
        content: `TITLE: ${input.title}\n\nSCRIPT:\n${input.script}`,
      },
    ],
  });
  const first = msg.content[0];
  if (!first || first.type !== "text") throw new Error("No text");
  const cleaned = first.text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned) as PlanResponse;
}

// ─── Convert plan → typed EditPlan with timestamps ──────────────

function buildEditPlan(input: {
  script: string;
  durationSec: number;
  plan: PlanResponse;
  brandLogos: Record<string, string>; // brand → local file URI
}): EditPlan {
  const { script, durationSec, plan, brandLogos } = input;

  // Word-level timing — distribute the script's words evenly across
  // the duration. We chunk into short visible captions but each word
  // keeps its own timestamp so we can mark emphasis cleanly.
  const words = script
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const perWord = durationSec / Math.max(1, words.length);
  const emphasisSet = new Set(
    plan.emphasisWords.map((w) => w.toLowerCase().replace(/[^\w']/g, "")),
  );

  const captions: CaptionWord[] = words.map((w, i) => {
    const clean = w.toLowerCase().replace(/[^\w']/g, "");
    return {
      text: w,
      startSec: i * perWord,
      endSec: (i + 1) * perWord,
      emphasis: emphasisSet.has(clean),
    };
  });

  // Punch-ins: find each trigger phrase in the script and compute time.
  const lower = script.toLowerCase();
  const punchIns: PunchIn[] = [];
  for (const p of plan.punchIns) {
    const idx = lower.indexOf(p.phrase.toLowerCase().trim());
    if (idx < 0) continue;
    const startSec = (idx / script.length) * durationSec;
    const endSec = Math.min(durationSec, startSec + 1.8);
    punchIns.push({
      startSec,
      endSec,
      zoom: Math.min(1.2, Math.max(1.05, p.zoom)),
      focusY: 0.4,
    });
  }

  // Logos: find each trigger phrase + the matching local PNG path.
  const logos: LogoReveal[] = [];
  for (const l of plan.logos) {
    const idx = lower.indexOf(l.trigger.toLowerCase().trim());
    if (idx < 0) continue;
    const src = brandLogos[l.brand];
    if (!src) continue;
    const startSec = (idx / script.length) * durationSec;
    const endSec = Math.min(durationSec, startSec + 2.2);
    logos.push({
      startSec,
      endSec,
      src,
      position: "tr",
    });
  }

  // UI mockups
  const uiMockups: UIMockup[] = [];
  for (const m of plan.uiMockups) {
    const idx = lower.indexOf(m.triggerPhrase.toLowerCase().trim());
    if (idx < 0) continue;
    const startSec = (idx / script.length) * durationSec;
    const endSec = Math.min(durationSec, startSec + 4.5); // hold for typing animation
    uiMockups.push({
      startSec,
      endSec,
      kind: "claude-chat",
      userMessage: m.userMessage,
      assistantReply: m.assistantReply,
    });
  }

  // Hook card — first 4 seconds of the video. Doubles as a cover for
  // any HeyGen lipsync artifacts in the opening photo (eye glitches).
  const hookCard = plan.hookCard?.headline
    ? {
        startSec: 0,
        endSec: 4.0,
        headline: plan.hookCard.headline,
        subtitle: plan.hookCard.subtitle,
      }
    : undefined;

  return {
    captions,
    emphasis: [],
    punchIns,
    logos,
    uiMockups,
    hookCard,
  };
}

// ─── Brand logo fetch (weserv-proxied PNG) ──────────────────────

function wlogo(svgUpstream: string): string {
  return `https://images.weserv.nl/?url=${encodeURIComponent(svgUpstream)}&output=png&w=256`;
}

const BRAND_URLS: Record<string, string> = {
  claude: wlogo("www.anthropic.com/images/icons/safari-pinned-tab.svg"),
  anthropic: wlogo("www.anthropic.com/images/icons/safari-pinned-tab.svg"),
  openai: wlogo("api.iconify.design/simple-icons/openai.svg?color=white"),
  github: wlogo("api.iconify.design/simple-icons/github.svg?color=white"),
  gemini: wlogo("api.iconify.design/simple-icons/googlegemini.svg?color=white"),
  manychat: wlogo("api.iconify.design/simple-icons/manychat.svg?color=white"),
  instagram: wlogo("api.iconify.design/simple-icons/instagram.svg?color=white"),
  tiktok: wlogo("api.iconify.design/simple-icons/tiktok.svg?color=white"),
  notion: wlogo("api.iconify.design/simple-icons/notion.svg?color=white"),
  zapier: wlogo("api.iconify.design/simple-icons/zapier.svg?color=white"),
  slack: wlogo("api.iconify.design/simple-icons/slack.svg?color=white"),
};

async function downloadBrandLogos(
  brands: string[],
  // tmpDir kept for backward-compatible signature, not used now.
  _tmpDir: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const brand of brands) {
    const url = BRAND_URLS[brand];
    if (!url) continue;
    try {
      const res = await safeFetch(url, { maxBytes: 2 * 1024 * 1024 });
      // Chromium running under @remotion/renderer refuses `file://` for
      // security. Inline the PNG as a data URL so the Img tag in the
      // composition can decode it without touching the filesystem.
      const b64 = res.buffer.toString("base64");
      out[brand] = `data:image/png;base64,${b64}`;
    } catch (e) {
      console.warn(`Logo ${brand} fetch failed: ${(e as Error).message}`);
    }
  }
  return out;
}

// ─── Render entrypoint ──────────────────────────────────────────

async function main() {
  const prisma = new PrismaClient();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "remotion-render-"));
  try {
    const guide = await prisma.dailyGuide.findUnique({
      where: { slug: SLUG },
      select: { title: true, script: true, videoUrl: true },
    });
    if (!guide) throw new Error(`Guide ${SLUG} not found`);

    // Pick which video to edit:
    //   --video-url override → user's own recording (iPhone, etc.)
    //   else                 → whatever's saved on the guide
    const sourceVideoUrl = VIDEO_URL_OVERRIDE ?? guide.videoUrl;
    if (!sourceVideoUrl) {
      throw new Error(
        "No video URL — pass --video-url=<r2-url> or upload a video to this guide first.",
      );
    }
    console.log(`Guide: ${SLUG}`);
    console.log(`Title: ${guide.title}`);
    console.log(`Base MP4: ${sourceVideoUrl}`);
    if (VIDEO_URL_OVERRIDE) {
      console.log(`(Using --video-url override — your own recording)`);
    }

    // OffthreadVideo (used in the composition) downloads + decodes
    // server-side via Node + FFmpeg, so the R2 URL works directly —
    // no need to pre-download. This avoids both the per-frame
    // Chromium fetch problem AND the bundle/public folder timing.
    console.log("\n1. Planning edit with Claude…");
    const plan = await planEdit({ title: guide.title, script: guide.script });
    console.log(`   emphasis: ${plan.emphasisWords.length} words`);
    console.log(`   punch-ins: ${plan.punchIns.length}`);
    console.log(`   logos: ${plan.logos.map((l) => l.brand).join(", ")}`);
    console.log(`   ui mockups: ${plan.uiMockups.length}`);

    console.log("\n2. Downloading brand logos…");
    const brandLogos = await downloadBrandLogos(
      plan.logos.map((l) => l.brand),
      tmpDir,
    );

    // Duration: --duration CLI override → otherwise 80s default.
    // (For self-recorded video, pass --duration with the actual length
    // of your clip so captions distribute correctly.)
    const DURATION_SEC = DURATION_OVERRIDE ?? 80;
    console.log(`Duration: ${DURATION_SEC}s`);

    const editPlan = buildEditPlan({
      script: guide.script,
      durationSec: DURATION_SEC,
      plan,
      brandLogos,
    });

    console.log("\n3. Bundling Remotion project…");
    const bundleLoc = await bundle({
      entryPoint: path.join(process.cwd(), "remotion", "index.ts"),
      // Output to a tmp dir so concurrent runs don't clash.
      outDir: path.join(tmpDir, "bundle"),
      webpackOverride: (config) => config,
    });

    const inputProps = {
      videoUrl: sourceVideoUrl,
      durationSec: DURATION_SEC,
      script: guide.script,
      title: guide.title,
      edit: editPlan,
    };

    const composition = await selectComposition({
      serveUrl: bundleLoc,
      id: "GuideReel",
      inputProps,
    });
    // Override duration to match the actual base video.
    composition.durationInFrames = Math.round(DURATION_SEC * composition.fps);

    console.log(
      `\n4. Rendering MP4 (${composition.width}×${composition.height} @ ${composition.fps}fps, ${composition.durationInFrames} frames)…`,
    );
    const outputPath = path.join(tmpDir, "out.mp4");
    const t0 = Date.now();
    await renderMedia({
      composition,
      serveUrl: bundleLoc,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
      concurrency: null, // auto
      onProgress: ({ progress }) => {
        // Progress: number 0-1. Print every 5%.
        const pct = Math.round(progress * 100);
        if (pct % 5 === 0 && pct > 0) {
          process.stdout.write(`   ${pct}%\r`);
        }
      },
    });
    const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n   Rendered in ${elapsedSec}s`);

    console.log("\n5. Uploading to R2…");
    const buf = await fs.readFile(outputPath);
    const key = `studio/remotion/${Date.now()}-${crypto.randomBytes(4).toString("hex")}.mp4`;
    const finalUrl = await uploadToR2(key, buf, "video/mp4");
    console.log(`   ${finalUrl}`);

    console.log("\n6. Saving to DB…");
    await prisma.dailyGuide.update({
      where: { slug: SLUG },
      data: { videoUrl: finalUrl },
    });
    console.log(
      `\nDone. View: https://creator-os-delta.vercel.app/daily-post/${SLUG}`,
    );
  } finally {
    await prisma.$disconnect();
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
    // Clean any source-*.mp4 files we wrote into remotion/public so the
    // folder doesn't grow with old inputs between runs.
    try {
      const pubDir = path.join(process.cwd(), "remotion", "public");
      const files = await fs.readdir(pubDir).catch(() => []);
      for (const f of files) {
        if (f.startsWith("source-") && f.endsWith(".mp4")) {
          await fs.unlink(path.join(pubDir, f)).catch(() => {});
        }
      }
    } catch {}
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
