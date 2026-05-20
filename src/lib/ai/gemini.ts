import crypto from "node:crypto";
import { uploadToR2 } from "@/lib/r2";
import { env } from "@/lib/env";

/**
 * Gemini Omni — Google's unified Imagen 4 (image) + Veo 3 (video) endpoints.
 *
 * Talks to the v1beta endpoints directly via fetch so we don't take a
 * dependency on @google/genai (it's a fat SDK with browser-vs-node split
 * that's brittle on Vercel). The REST shape is stable enough that
 * upgrading models later only means changing the model name.
 *
 * Env required: GOOGLE_GEMINI_API_KEY (Google AI Studio key from
 * https://aistudio.google.com/apikey).
 *
 * Costs (approx, as of 2026):
 *   - Imagen 4 standard:  ~$0.04 per image
 *   - Imagen 4 ultra:     ~$0.06 per image
 *   - Veo 3 (8s 9:16):    ~$0.40 per video
 *   - Veo 3 Fast:         ~$0.20 per video
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";

function apiKey(): string {
  const k = env("GOOGLE_GEMINI_API_KEY") ?? env("GOOGLE_API_KEY");
  if (!k) {
    throw new Error(
      "GOOGLE_GEMINI_API_KEY is not set. Create one at https://aistudio.google.com/apikey and add it to Vercel env vars.",
    );
  }
  return k;
}

// ─── IMAGE (Imagen 4) ─────────────────────────────────────────────

export type ImagenAspect = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
export type ImagenModel = "imagen-4.0-generate-preview-06-06" | "imagen-4.0-ultra-generate-preview-06-06";

export type GeneratedImagenImage = {
  url: string;
  width: number;
  height: number;
  aspectRatio: ImagenAspect;
  model: ImagenModel;
  costCents: number;
  prompt: string;
};

const IMAGEN_DIMS: Record<ImagenAspect, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "3:4": { w: 896, h: 1280 },
  "4:3": { w: 1280, h: 896 },
  "9:16": { w: 768, h: 1408 },
  "16:9": { w: 1408, h: 768 },
};

const IMAGEN_COST_CENTS: Record<ImagenModel, number> = {
  "imagen-4.0-generate-preview-06-06": 4,
  "imagen-4.0-ultra-generate-preview-06-06": 6,
};

export async function generateImageWithImagen({
  userId,
  prompt,
  aspectRatio = "1:1",
  model = "imagen-4.0-generate-preview-06-06",
}: {
  userId: string;
  prompt: string;
  aspectRatio?: ImagenAspect;
  model?: ImagenModel;
}): Promise<GeneratedImagenImage> {
  if (!prompt?.trim()) throw new Error("Prompt is required.");
  const key = apiKey();

  // 60s timeout — Imagen 4 typically responds in 5-15s but the long
  // tail can hit 30+ on busy days. Don't want this eating the Vercel
  // function budget when there's nothing wrong.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(`${BASE}/models/${model}:predict?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: prompt.trim() }],
        parameters: {
          sampleCount: 1,
          aspectRatio,
          // Standard person generation — Google blocks adult content by
          // default. Pass-through for the user's prompt safety.
          personGeneration: "allow_adult",
        },
      }),
      cache: "no-store",
      signal: ctrl.signal,
    });
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error("Imagen timed out after 60s");
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Imagen ${res.status}: ${text.slice(0, 500)}\n` +
        `Common causes: API key missing/invalid, region restriction, billing not enabled, ` +
        `or the prompt triggered Google's safety filter.`,
    );
  }
  const json = (await res.json()) as {
    predictions?: Array<{ bytesBase64Encoded?: string; raiFilteredReason?: string }>;
  };

  const pred = json.predictions?.[0];
  if (pred?.raiFilteredReason) {
    throw new Error(
      `Imagen blocked by Google's safety filter: ${pred.raiFilteredReason}. ` +
        `Rephrase the prompt or try a less sensitive subject.`,
    );
  }
  if (!pred?.bytesBase64Encoded) {
    throw new Error("Imagen returned no image data.");
  }

  const buffer = Buffer.from(pred.bytesBase64Encoded, "base64");
  const rname = `studio/${userId}/imagen-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.png`;
  const url = await uploadToR2(rname, buffer, "image/png");

  const dims = IMAGEN_DIMS[aspectRatio];
  return {
    url,
    width: dims.w,
    height: dims.h,
    aspectRatio,
    model,
    costCents: IMAGEN_COST_CENTS[model],
    prompt: prompt.trim(),
  };
}

// ─── VIDEO (Veo 3) ────────────────────────────────────────────────

export type VeoAspect = "9:16" | "16:9" | "1:1";
export type VeoModel = "veo-3.0-generate-preview" | "veo-3.0-fast-generate-preview";
export type VeoDuration = 4 | 8;

export type GeneratedVeoVideo = {
  url: string;
  width: number;
  height: number;
  aspectRatio: VeoAspect;
  durationSec: number;
  model: VeoModel;
  costCents: number;
  prompt: string;
  remoteId: string;
};

const VEO_DIMS: Record<VeoAspect, { w: number; h: number }> = {
  "9:16": { w: 720, h: 1280 },
  "16:9": { w: 1280, h: 720 },
  "1:1": { w: 1024, h: 1024 },
};

// Approx cost per second (Veo 3 is currently $0.05/s standard, $0.025/s fast).
const VEO_COST_PER_SEC_CENTS: Record<VeoModel, number> = {
  "veo-3.0-generate-preview": 5,
  "veo-3.0-fast-generate-preview": 2.5,
};

type VeoOperation = {
  name: string;
  done?: boolean;
  error?: { code?: number; message?: string };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{ video?: { uri?: string } }>;
    };
  };
};

/**
 * Veo is async — POSTing returns an operation name, then we poll until
 * `done: true`. Total runtime is typically 30-90s for an 8s clip but the
 * long tail can hit 3+ minutes when their queue is busy.
 */
export async function generateVideoWithVeo({
  userId,
  prompt,
  aspectRatio = "9:16",
  durationSec = 8,
  model = "veo-3.0-fast-generate-preview",
  pollMs = 5000,
  timeoutMs = 5 * 60 * 1000,
}: {
  userId: string;
  prompt: string;
  aspectRatio?: VeoAspect;
  durationSec?: VeoDuration;
  model?: VeoModel;
  pollMs?: number;
  timeoutMs?: number;
}): Promise<GeneratedVeoVideo> {
  if (!prompt?.trim()) throw new Error("Prompt is required.");
  const key = apiKey();

  // ── 1. Start the long-running operation
  const startRes = await fetch(
    `${BASE}/models/${model}:predictLongRunning?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: prompt.trim() }],
        parameters: {
          aspectRatio,
          durationSeconds: String(durationSec),
          personGeneration: "allow_adult",
        },
      }),
      cache: "no-store",
    },
  );
  if (!startRes.ok) {
    const text = await startRes.text();
    throw new Error(
      `Veo start ${startRes.status}: ${text.slice(0, 500)}\n` +
        `If 'model not found' or 403, your Google Cloud project may not have Veo allow-listed yet.`,
    );
  }
  const opStart = (await startRes.json()) as VeoOperation;
  if (!opStart.name) throw new Error("Veo did not return an operation name.");

  // ── 2. Poll until done
  const deadline = Date.now() + timeoutMs;
  let op: VeoOperation = opStart;
  while (!op.done) {
    if (Date.now() > deadline) {
      throw new Error(
        `Veo job ${opStart.name} did not finish within ${timeoutMs / 1000}s. ` +
          `It may still be processing — check the Library tab in a few minutes.`,
      );
    }
    await new Promise((r) => setTimeout(r, pollMs));
    const pollRes = await fetch(`${BASE}/${op.name}?key=${key}`, {
      method: "GET",
      cache: "no-store",
    });
    if (!pollRes.ok) {
      const text = await pollRes.text();
      throw new Error(`Veo poll ${pollRes.status}: ${text.slice(0, 500)}`);
    }
    op = (await pollRes.json()) as VeoOperation;
  }
  if (op.error) {
    throw new Error(`Veo operation failed: ${op.error.message ?? "unknown error"}`);
  }
  const videoUri = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!videoUri) {
    throw new Error("Veo finished but returned no video URI.");
  }

  // ── 3. Download the rendered MP4. The URI is on Google's CDN and requires
  //      the same API key appended as a query param to download.
  const dlUrl = videoUri.includes("?")
    ? `${videoUri}&key=${key}`
    : `${videoUri}?key=${key}`;
  const dl = await fetch(dlUrl, { cache: "no-store" });
  if (!dl.ok) {
    const text = await dl.text();
    throw new Error(`Veo download ${dl.status}: ${text.slice(0, 300)}`);
  }
  const arrayBuf = await dl.arrayBuffer();
  const mp4 = Buffer.from(arrayBuf);

  const rname = `studio/${userId}/veo-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.mp4`;
  const url = await uploadToR2(rname, mp4, "video/mp4");

  const dims = VEO_DIMS[aspectRatio];
  return {
    url,
    width: dims.w,
    height: dims.h,
    aspectRatio,
    durationSec,
    model,
    costCents: Math.round(VEO_COST_PER_SEC_CENTS[model] * durationSec),
    prompt: prompt.trim(),
    remoteId: opStart.name,
  };
}

export function isGeminiConfigured(): boolean {
  return !!(env("GOOGLE_GEMINI_API_KEY") || env("GOOGLE_API_KEY"));
}
