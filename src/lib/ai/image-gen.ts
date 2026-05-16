import OpenAI from "openai";
import crypto from "node:crypto";
import { uploadToR2 } from "@/lib/r2";

/**
 * Image generation via OpenAI gpt-image-1.
 * Returns a public R2 URL plus metadata you can persist into MediaAsset.
 */

const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: apiKey ?? "" });

export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";
export type ImageQuality = "low" | "medium" | "high" | "auto";

export type GeneratedImage = {
  url: string;
  width: number;
  height: number;
  size: ImageSize;
  model: string;
  costCents: number;
  prompt: string;
};

// Approximate costs (cents) for gpt-image-1 at typical quality.
// Square ~$0.04, portrait/landscape ~$0.07. Updated periodically.
const COST_TABLE: Record<ImageSize, number> = {
  "1024x1024": 4,
  "1024x1536": 7,
  "1536x1024": 7,
};

export async function generateImage({
  userId,
  prompt,
  size = "1024x1024",
  quality = "high",
}: {
  userId: string;
  prompt: string;
  size?: ImageSize;
  quality?: ImageQuality;
}): Promise<GeneratedImage> {
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY not set. Add billing at platform.openai.com → Settings → Billing.",
    );
  }
  if (!prompt?.trim()) throw new Error("Prompt is required.");

  const res = await openai.images.generate({
    model: "gpt-image-1",
    prompt: prompt.trim(),
    size,
    quality,
    n: 1,
  });

  const data = res.data?.[0];
  // gpt-image-1 always returns base64
  const b64 = data?.b64_json;
  if (!b64) {
    throw new Error("OpenAI returned no image data. Check billing / org access.");
  }

  const buffer = Buffer.from(b64, "base64");
  const key = `studio/${userId}/img-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.png`;
  const url = await uploadToR2(key, buffer, "image/png");

  const [w, h] = size.split("x").map(Number);
  return {
    url,
    width: w,
    height: h,
    size,
    model: "gpt-image-1",
    costCents: COST_TABLE[size],
    prompt: prompt.trim(),
  };
}
