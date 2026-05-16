import crypto from "node:crypto";
import { uploadToR2 } from "@/lib/r2";

/**
 * Video generation via OpenAI Sora 2 API.
 *
 * The /v1/videos endpoint is async: create -> poll status -> download content.
 * We hit it with raw fetch so this stays version-agnostic to the openai SDK.
 *
 * Pricing (approx, late 2025): sora-2 ~ $0.10/sec standard.
 * Allowed sizes: 720x1280 (vertical), 1280x720 (horizontal), 1024x1024 (square).
 * Allowed seconds: "4", "8", "12".
 */

const API = "https://api.openai.com/v1/videos";

export type VideoSize = "720x1280" | "1280x720" | "1024x1024";
export type VideoSeconds = "4" | "8" | "12";
export type VideoModel = "sora-2" | "sora-2-pro";

export type GeneratedVideo = {
  url: string;
  width: number;
  height: number;
  size: VideoSize;
  durationSec: number;
  model: VideoModel;
  costCents: number;
  prompt: string;
  remoteId: string;
};

function authHeaders() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY not set. Add billing at platform.openai.com → Settings → Billing.",
    );
  }
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

type VideoJob = {
  id: string;
  object: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  error?: { message?: string } | null;
};

export async function createVideoJob({
  prompt,
  size = "720x1280",
  seconds = "4",
  model = "sora-2",
}: {
  prompt: string;
  size?: VideoSize;
  seconds?: VideoSeconds;
  model?: VideoModel;
}): Promise<VideoJob> {
  if (!prompt?.trim()) throw new Error("Prompt is required.");

  const r = await fetch(API, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model,
      prompt: prompt.trim(),
      size,
      seconds,
    }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(
      `OpenAI Sora returned ${r.status}: ${text.slice(0, 500)}\n` +
        `If 'model_not_found' or 403, your org may not have Sora access yet — request access at platform.openai.com.`,
    );
  }
  return (await r.json()) as VideoJob;
}

export async function getVideoJob(id: string): Promise<VideoJob> {
  const r = await fetch(`${API}/${id}`, {
    method: "GET",
    headers: authHeaders(),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`OpenAI Sora poll ${r.status}: ${text.slice(0, 500)}`);
  }
  return (await r.json()) as VideoJob;
}

export async function downloadVideoContent(id: string): Promise<Buffer> {
  // Sora 2 exposes the rendered MP4 at /v1/videos/{id}/content
  const r = await fetch(`${API}/${id}/content`, {
    method: "GET",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Sora download ${r.status}: ${text.slice(0, 500)}`);
  }
  const arrayBuf = await r.arrayBuffer();
  return Buffer.from(arrayBuf);
}

const COST_PER_SECOND_CENTS: Record<VideoModel, number> = {
  "sora-2": 10,
  "sora-2-pro": 30,
};

/**
 * Convenience: create a job, poll until done (or timeout), upload to R2.
 * Use this from short-running paths (server action with timeout >= 90s) or
 * from a job/queue. Default poll budget is 6 minutes.
 */
export async function generateVideo({
  userId,
  prompt,
  size = "720x1280",
  seconds = "4",
  model = "sora-2",
  pollMs = 4000,
  timeoutMs = 6 * 60 * 1000,
}: {
  userId: string;
  prompt: string;
  size?: VideoSize;
  seconds?: VideoSeconds;
  model?: VideoModel;
  pollMs?: number;
  timeoutMs?: number;
}): Promise<GeneratedVideo> {
  const job = await createVideoJob({ prompt, size, seconds, model });

  const deadline = Date.now() + timeoutMs;
  let status: VideoJob = job;
  while (status.status !== "completed" && status.status !== "failed") {
    if (Date.now() > deadline) {
      throw new Error(
        `Sora job ${job.id} did not finish within ${timeoutMs / 1000}s. It may still be processing — check /studio later.`,
      );
    }
    await new Promise((r) => setTimeout(r, pollMs));
    status = await getVideoJob(job.id);
  }

  if (status.status === "failed") {
    throw new Error(`Sora job failed: ${status.error?.message ?? "unknown error"}`);
  }

  const mp4 = await downloadVideoContent(job.id);
  const key = `studio/${userId}/vid-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.mp4`;
  const url = await uploadToR2(key, mp4, "video/mp4");

  const [w, h] = size.split("x").map(Number);
  const dur = parseInt(seconds, 10);
  return {
    url,
    width: w,
    height: h,
    size,
    durationSec: dur,
    model,
    costCents: COST_PER_SECOND_CENTS[model] * dur,
    prompt: prompt.trim(),
    remoteId: job.id,
  };
}
