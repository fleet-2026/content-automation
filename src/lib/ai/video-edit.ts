/**
 * Post-production pipeline for HeyGen talking-head videos.
 *
 * Layered composite:
 *   1. Base = HeyGen talking-head MP4 (single photo, full frame)
 *   2. Upper-third = AI-generated visual PiPs showing the topic
 *      (Picture-in-Picture, ~50% width, sits above her face area).
 *      The talking head stays visible — visuals supplement, not replace.
 *   3. Corner = cute cartoon "character" illustrations (sticker style)
 *      that pop in to add personality + reinforce concepts.
 *   4. Mid = big mustard EMPHASIS CARDS at punchline moments
 *      (intentional over-face moments — the "stop scroll" beats).
 *   5. Bottom = running captions in mustard orange — never over face.
 *   6. Top-right = small brand logos when keywords detected.
 *
 * Caption color: mustard #D4AB5F (matches the user's brand palette).
 * Captions sit in the BOTTOM third with MarginV=160 so they never
 * intrude on the face.
 */

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import ffmpegStatic from "ffmpeg-static";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { uploadToR2 } from "@/lib/r2";
import { safeFetch } from "@/lib/safe-fetch";

const FFMPEG = ffmpegStatic as unknown as string;

// Video dimensions — HeyGen output is 720x1280 (vertical 9:16).
const W = 720;
const H = 1280;

// ─── Caption timing ──────────────────────────────────────────────

export type CaptionChunk = {
  text: string;
  startSec: number;
  endSec: number;
};

export function buildCaptionChunks(
  script: string,
  durationSec: number,
  wordsPerChunk = 3,
): CaptionChunk[] {
  const words = script
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 0);
  if (words.length === 0) return [];
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(" "));
  }
  const perChunkSec = durationSec / chunks.length;
  return chunks.map((text, i) => ({
    text,
    startSec: i * perChunkSec,
    endSec: (i + 1) * perChunkSec,
  }));
}

// ─── Emphasis cards (mid-screen punchlines) ──────────────────────

export type EmphasisCard = {
  text: string;
  startSec: number;
  endSec: number;
};

async function extractEmphasisPhrases(script: string): Promise<{ phrase: string }[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    system: `Pick 3-4 punchline phrases (2-5 words) from this talking-head script that should appear as huge mid-screen text cards in a viral Reel. Verbatim snippets only. JSON: [{"phrase":"..."}]`,
    messages: [{ role: "user", content: script }],
  });
  const first = msg.content[0];
  if (!first || first.type !== "text") throw new Error("No text");
  const cleaned = first.text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned) as { phrase: string }[];
}

export async function buildEmphasisCards(script: string, durationSec: number): Promise<EmphasisCard[]> {
  const phrases = await extractEmphasisPhrases(script);
  const cards: EmphasisCard[] = [];
  const lower = script.toLowerCase();
  for (const { phrase } of phrases) {
    const idx = lower.indexOf(phrase.toLowerCase().trim());
    if (idx < 0) continue;
    const startFrac = idx / script.length;
    const endFrac = (idx + phrase.length) / script.length;
    cards.push({
      text: phrase.trim(),
      startSec: Math.max(0, startFrac * durationSec - 0.2),
      endSec: Math.min(durationSec, endFrac * durationSec + 0.8),
    });
  }
  return cards;
}

// ─── Visual content (AI images + character illustrations) ────────

export type VisualMoment = {
  phrase: string;
  imagePrompt: string;
  kind: "scene" | "character"; // scene = upper-third PiP, character = corner sticker
  startSec: number;
  endSec: number;
  localPath?: string;
};

async function extractVisualMoments(
  script: string,
  title: string,
): Promise<Omit<VisualMoment, "startSec" | "endSec" | "localPath">[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1800,
    system: `You write image-generation prompts for a viral Reel. The video is a talking-head explainer; we will composite 8 visuals onto the screen at key moments to LITERALLY show the concrete thing the speaker is discussing right now. The talking head stays visible behind — these visuals supplement her words by SHOWING THE EXACT THING she's referring to.

These visuals must be SPECIFIC TO THE POST'S TOPIC, not generic editorial photography. If the post is about Claude prompts, the visuals must SHOW a Claude prompt interface, an actual example prompt, or the specific Claude UI — not a nice photo of a person at a desk. If she mentions "three questions", show a list of three questions on screen. If she mentions "GitHub", show the GitHub interface. The viewer should be able to SEE the thing she's describing.

You produce TWO kinds of visuals:

1. SCENE visuals (5-6 of them) — clear, illustrative graphics or screen mockups that LITERALLY VISUALIZE the concept. NOT editorial photography. Examples for an AI/tech post:
   - A close-up screenshot mockup of a chat AI interface with a sample prompt typed in
   - A digital notepad with three numbered review questions visible and readable
   - A side-by-side "before / after" comparison of a bad vs improved prompt
   - A floating UI card showing a checklist with checkmarks
   - A laptop screen with code or text editor showing the exact thing being described
   These should look like flat / illustrative / minimal UI mockups OR clean infographic-style images. NOT moody photography.

2. CHARACTER visuals (2-3 of them) — cute cartoon sticker characters that add personality. Single subject, simple shapes, sticker style.

For EACH visual, pick a verbatim trigger phrase from the script (2-6 words). The visual shows at the moment the speaker says that phrase.

SCENE imagePrompt style:
  - Flat illustration / clean UI mockup / minimal infographic style
  - White or off-white background OR semi-transparent
  - Bright accent colors (mustard #D4AB5F, deep burgundy #5B2C39, cream)
  - Clear readable elements (text in the mockup is OK and encouraged for UI screenshots)
  - The thing depicted must be UNAMBIGUOUSLY what the speaker is describing
  - Vertical 9:16 framing

CHARACTER imagePrompt style:
  - Cute flat-design cartoon sticker, single character/object
  - White outline / die-cut sticker look on TRANSPARENT background
  - Bright friendly mustard/cream/burgundy colors
  - Centered subject

Use the post's TITLE as your anchor — the visuals must obviously belong to a video about THIS specific topic.

Return JSON only (no preamble, no code fences):
[
  {"phrase":"...", "imagePrompt":"...", "kind":"scene"},
  ...
]`,
    messages: [
      {
        role: "user",
        content: `POST TITLE: ${title}\n\nSCRIPT:\n${script}`,
      },
    ],
  });
  const first = msg.content[0];
  if (!first || first.type !== "text") throw new Error("No text");
  const cleaned = first.text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned) as Omit<VisualMoment, "startSec" | "endSec" | "localPath">[];
}

async function generateImage(prompt: string, outPath: string, transparent: boolean): Promise<void> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const result = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1536",
    quality: "medium",
    background: transparent ? "transparent" : "opaque",
  });
  const item = result.data?.[0];
  if (!item) throw new Error("No image");
  if (item.b64_json) {
    await fs.writeFile(outPath, Buffer.from(item.b64_json, "base64"));
  } else if (item.url) {
    const fetched = await safeFetch(item.url, { maxBytes: 20 * 1024 * 1024 });
    await fs.writeFile(outPath, fetched.buffer);
  } else {
    throw new Error("No b64 or url");
  }
}

async function buildVisualMoments(
  script: string,
  title: string,
  durationSec: number,
  tmpDir: string,
): Promise<VisualMoment[]> {
  const raw = await extractVisualMoments(script, title);
  const lower = script.toLowerCase();
  const moments: VisualMoment[] = [];
  for (const r of raw) {
    const idx = lower.indexOf(r.phrase.toLowerCase().trim());
    if (idx < 0) continue;
    const startFrac = idx / script.length;
    const startSec = Math.max(0, startFrac * durationSec - 0.2);
    // Scenes hold 2.5s; characters pop briefly 1.6s
    const hold = r.kind === "scene" ? 2.5 : 1.6;
    moments.push({
      phrase: r.phrase,
      imagePrompt: r.imagePrompt,
      kind: r.kind,
      startSec,
      endSec: Math.min(durationSec, startSec + hold),
    });
  }
  // Generate all images in parallel
  await Promise.all(
    moments.map(async (m, i) => {
      const file = path.join(tmpDir, `vis-${m.kind}-${i}.png`);
      try {
        await generateImage(m.imagePrompt, file, m.kind === "character");
        m.localPath = file;
      } catch (e) {
        console.warn(`Visual ${i} (${m.kind}) failed: ${(e as Error).message}`);
      }
    }),
  );
  return moments.filter((m) => m.localPath);
}

// ─── Brand logo overlay ──────────────────────────────────────────

function wlogo(svgUpstream: string): string {
  return `https://images.weserv.nl/?url=${encodeURIComponent(svgUpstream)}&output=png&w=256`;
}

const BRAND_LOGOS: Array<{ re: RegExp; url: string; name: string }> = [
  { re: /\b(claude|anthropic)\b/i, url: wlogo("www.anthropic.com/images/icons/safari-pinned-tab.svg"), name: "claude" },
  { re: /\b(chatgpt|openai|gpt-?\d?)\b/i, url: wlogo("api.iconify.design/simple-icons/openai.svg?color=white"), name: "openai" },
  { re: /\bgithub\b/i, url: wlogo("api.iconify.design/simple-icons/github.svg?color=white"), name: "github" },
  { re: /\b(gemini|google ai)\b/i, url: wlogo("api.iconify.design/simple-icons/googlegemini.svg?color=white"), name: "gemini" },
  { re: /\bmanychat\b/i, url: wlogo("api.iconify.design/simple-icons/manychat.svg?color=white"), name: "manychat" },
  { re: /\binstagram\b/i, url: wlogo("api.iconify.design/simple-icons/instagram.svg?color=white"), name: "instagram" },
  { re: /\btiktok\b/i, url: wlogo("api.iconify.design/simple-icons/tiktok.svg?color=white"), name: "tiktok" },
  { re: /\bnotion\b/i, url: wlogo("api.iconify.design/simple-icons/notion.svg?color=white"), name: "notion" },
  { re: /\bzapier\b/i, url: wlogo("api.iconify.design/simple-icons/zapier.svg?color=white"), name: "zapier" },
  { re: /\bslack\b/i, url: wlogo("api.iconify.design/simple-icons/slack.svg?color=white"), name: "slack" },
];

export type LogoOverlay = {
  name: string;
  localPath: string;
  startSec: number;
  endSec: number;
};

async function buildLogoOverlays(script: string, durationSec: number, tmpDir: string): Promise<LogoOverlay[]> {
  const overlays: LogoOverlay[] = [];
  const seen = new Set<string>();
  for (const brand of BRAND_LOGOS) {
    const match = brand.re.exec(script);
    if (!match) continue;
    if (seen.has(brand.name)) continue;
    seen.add(brand.name);
    const idx = match.index;
    const startFrac = idx / script.length;
    const endFrac = (idx + match[0].length) / script.length;
    const startSec = Math.max(0, startFrac * durationSec - 0.2);
    const endSec = Math.min(durationSec, endFrac * durationSec + 1.8);
    try {
      const res = await safeFetch(brand.url, { maxBytes: 2 * 1024 * 1024 });
      const localPath = path.join(tmpDir, `logo-${brand.name}.png`);
      await fs.writeFile(localPath, res.buffer);
      overlays.push({ name: brand.name, localPath, startSec, endSec });
    } catch (e) {
      console.warn(`Skipped logo ${brand.name}: ${(e as Error).message}`);
    }
  }
  return overlays;
}

// ─── ASS subtitle generation ─────────────────────────────────────

function toAssTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s - Math.floor(s)) * 100);
  return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

function escapeForAss(s: string): string {
  return s.replace(/\\/g, "").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\r?\n/g, " ");
}

/** Captions: BOTTOM-third in mustard `#D4AB5F`, never on face.
 *  Emphasis: MID-SCREEN big mustard pop, intentional over-face hits.
 *
 *  ASS color is &HAABBGGRR (alpha + BGR — backwards from RGB).
 *  Mustard #D4AB5F → BGR = 5FABD4 → ASS = &H005FABD4
 *  Deeper mustard #B8893E → ASS = &H003E89B8 */
function buildAssSubtitleFile(
  captions: CaptionChunk[],
  cards: EmphasisCard[],
  visualMoments: VisualMoment[],
): string {
  // Pause captions while a SCENE visual is occupying the top-half PiP —
  // the eye should track the visual, not the running text.
  const visualWindows = visualMoments
    .filter((m) => m.kind === "scene")
    .map((m) => [m.startSec, m.endSec] as const);
  const insideVisual = (t: number) => visualWindows.some(([a, b]) => t >= a && t < b);
  const liveCaptions = captions.filter((c) => !insideVisual((c.startSec + c.endSec) / 2));

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Arial Black,52,&H005FABD4,&H000000FF,&H00000000,&HBB000000,1,0,0,0,100,100,0,0,1,4,2,2,40,40,420,1
Style: Emphasis,Arial Black,98,&H005FABD4,&H000000FF,&H00000000,&HCC000000,1,0,0,0,100,100,2,0,1,7,4,5,60,60,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const captionLines = liveCaptions.map(
    (c) =>
      `Dialogue: 0,${toAssTime(c.startSec)},${toAssTime(c.endSec)},Caption,,0,0,0,,{\\fad(60,60)}${escapeForAss(c.text)}`,
  );
  const cardLines = cards.map(
    (c) =>
      `Dialogue: 1,${toAssTime(c.startSec)},${toAssTime(c.endSec)},Emphasis,,0,0,0,,{\\fad(180,300)\\fscx70\\fscy70\\t(0,250,\\fscx100\\fscy100)}${escapeForAss(c.text.toUpperCase())}`,
  );

  return header + captionLines.join("\n") + "\n" + cardLines.join("\n") + "\n";
}

// ─── FFmpeg compositing ──────────────────────────────────────────

function buildFilterComplex(
  assPath: string,
  logos: LogoOverlay[],
  visuals: VisualMoment[],
): { filter: string; inputCount: number } {
  const ass = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
  const subs = `subtitles='${ass}'`;

  const parts: string[] = [];
  parts.push(`[0:v]${subs}[base]`);
  let lastTag = "base";
  let inputIdx = 1;

  // SCENE visuals — half-screen PiP positioned upper-third (above face).
  // Scaled to 520px wide (~72% of frame width), centered horizontally,
  // y=60 so they sit at the very top with a small margin.
  const scenes = visuals.filter((v) => v.kind === "scene");
  for (const [i, v] of scenes.entries()) {
    if (!v.localPath) continue;
    const tag = `s${i + 1}`;
    parts.push(
      `[${inputIdx}:v]scale=520:-1,format=rgba,fade=t=in:st=${v.startSec.toFixed(3)}:d=0.3:alpha=1,fade=t=out:st=${(v.endSec - 0.3).toFixed(3)}:d=0.3:alpha=1[scene${i}]`,
    );
    parts.push(
      `[${lastTag}][scene${i}]overlay=(W-w)/2:60:enable='between(t,${v.startSec.toFixed(3)},${v.endSec.toFixed(3)})'[${tag}]`,
    );
    lastTag = tag;
    inputIdx++;
  }

  // CHARACTER stickers — small 280px cute illustrations that pop in.
  // Position alternates left/right corners (high enough to not block face).
  const chars = visuals.filter((v) => v.kind === "character");
  for (const [i, v] of chars.entries()) {
    if (!v.localPath) continue;
    const tag = `c${i + 1}`;
    const onLeft = i % 2 === 0;
    const xExpr = onLeft ? "40" : "W-w-40";
    parts.push(
      `[${inputIdx}:v]scale=280:-1,format=rgba,fade=t=in:st=${v.startSec.toFixed(3)}:d=0.2:alpha=1,fade=t=out:st=${(v.endSec - 0.2).toFixed(3)}:d=0.2:alpha=1[char${i}]`,
    );
    parts.push(
      `[${lastTag}][char${i}]overlay=${xExpr}:90:enable='between(t,${v.startSec.toFixed(3)},${v.endSec.toFixed(3)})'[${tag}]`,
    );
    lastTag = tag;
    inputIdx++;
  }

  // BRAND LOGOS — tiny corner pip top-right, always visible briefly
  for (const [i, l] of logos.entries()) {
    const tag = `l${i + 1}`;
    parts.push(
      `[${inputIdx}:v]scale=120:-1,format=rgba,fade=t=in:st=${l.startSec.toFixed(3)}:d=0.3:alpha=1,fade=t=out:st=${(l.endSec - 0.3).toFixed(3)}:d=0.3:alpha=1[lg${i}]`,
    );
    parts.push(
      `[${lastTag}][lg${i}]overlay=W-w-30:40:enable='between(t,${l.startSec.toFixed(3)},${l.endSec.toFixed(3)})'[${tag}]`,
    );
    lastTag = tag;
    inputIdx++;
  }

  parts[parts.length - 1] = parts[parts.length - 1].replace(`[${lastTag}]`, "[outv]");
  return { filter: parts.join(";"), inputCount: inputIdx };
}

export async function captionAndEmphasize({
  videoUrl,
  script,
  title,
  userId,
  durationSec,
  generateVisuals = true,
}: {
  videoUrl: string;
  script: string;
  title: string;
  userId: string;
  durationSec: number;
  generateVisuals?: boolean;
}): Promise<{ url: string; captionsCount: number; cardsCount: number; logosCount: number; visualsCount: number }> {
  const captions = buildCaptionChunks(script, durationSec);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vid-edit-"));
  const inputPath = path.join(tmpDir, "in.mp4");
  const outputPath = path.join(tmpDir, "out.mp4");
  const assPath = path.join(tmpDir, "captions.ass");
  try {
    const fetched = await safeFetch(videoUrl, { maxBytes: 200 * 1024 * 1024 });
    await fs.writeFile(inputPath, fetched.buffer);

    // Emphasis cards are disabled per user feedback ("don't put the big
    // captions"). Visuals + running captions only.
    const cards: EmphasisCard[] = [];
    const [visuals, logos] = await Promise.all([
      generateVisuals
        ? buildVisualMoments(script, title, durationSec, tmpDir)
        : Promise.resolve([] as VisualMoment[]),
      buildLogoOverlays(script, durationSec, tmpDir),
    ]);

    const ass = buildAssSubtitleFile(captions, cards, visuals);
    await fs.writeFile(assPath, ass, "utf8");

    const { filter } = buildFilterComplex(assPath, logos, visuals);
    const args: string[] = ["-y", "-i", inputPath];
    for (const v of visuals) args.push("-i", v.localPath!);
    for (const l of logos) args.push("-i", l.localPath);
    args.push(
      "-filter_complex",
      filter,
      "-map",
      "[outv]",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "20",
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      outputPath,
    );
    await runFfmpeg(args);

    const out = await fs.readFile(outputPath);
    const key = `studio/${userId}/reel-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.mp4`;
    const url = await uploadToR2(key, out, "video/mp4");
    return {
      url,
      captionsCount: captions.length,
      cardsCount: cards.length,
      logosCount: logos.length,
      visualsCount: visuals.length,
    };
  } finally {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args);
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited ${code}\n${stderr.slice(-3000)}`));
    });
  });
}
