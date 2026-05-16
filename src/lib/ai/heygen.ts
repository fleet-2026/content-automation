import crypto from "node:crypto";
import { uploadToR2 } from "@/lib/r2";
import { safeFetch } from "@/lib/safe-fetch";

/**
 * HeyGen integration — AI talking-head avatar videos.
 *
 * Required env: HEYGEN_API_KEY (grab at app.heygen.com → API → Create token)
 *
 * Flow:
 *   POST /v2/video/generate          → returns { video_id }
 *   GET  /v1/video_status.get?video_id=… (poll until status === "completed")
 *   GET  video_url from completed payload → download mp4 → R2
 */

const BASE = "https://api.heygen.com";

function authHeaders() {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) {
    throw new Error(
      "HEYGEN_API_KEY not set. Sign in at app.heygen.com → API → create a token, then add HEYGEN_API_KEY=… to .env.local",
    );
  }
  return {
    "X-Api-Key": key,
    "Content-Type": "application/json",
  };
}

// ─── LISTS ──────────────────────────────────────────────────────

export type HeygenAvatar = {
  avatar_id: string;
  avatar_name: string;
  gender?: string;
  preview_image_url?: string;
  preview_video_url?: string;
};

export type HeygenVoice = {
  voice_id: string;
  language: string;
  gender: string;
  name: string;
  preview_audio?: string;
};

export async function listAvatars(): Promise<HeygenAvatar[]> {
  const r = await fetch(`${BASE}/v2/avatars`, {
    headers: authHeaders(),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`HeyGen avatars ${r.status}: ${t.slice(0, 300)}`);
  }
  const j = await r.json();
  // shape: { error: null, data: { avatars: [...] } }
  return (j?.data?.avatars ?? []) as HeygenAvatar[];
}

export async function listVoices(): Promise<HeygenVoice[]> {
  const r = await fetch(`${BASE}/v2/voices`, {
    headers: authHeaders(),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`HeyGen voices ${r.status}: ${t.slice(0, 300)}`);
  }
  const j = await r.json();
  return (j?.data?.voices ?? []) as HeygenVoice[];
}

// ─── GENERATION ─────────────────────────────────────────────────

export type HeygenAspect = "9:16" | "16:9" | "1:1";

export type GeneratedAvatarVideo = {
  url: string;
  width: number;
  height: number;
  durationSec: number | null;
  costCents: number; // estimate
  prompt: string;
  remoteId: string;
  avatarId: string;
  voiceId: string;
};

const DIMS: Record<HeygenAspect, { width: number; height: number }> = {
  "9:16": { width: 720, height: 1280 },
  "16:9": { width: 1280, height: 720 },
  "1:1": { width: 1024, height: 1024 },
};

type GenerateResponse = {
  error?: { message?: string } | null;
  data?: { video_id?: string };
};

type StatusResponse = {
  error?: { message?: string } | null;
  data?: {
    status?: "processing" | "pending" | "completed" | "failed";
    video_url?: string;
    duration?: number;
    error?: { message?: string } | null;
  };
};

async function createAvatarJob({
  script,
  avatarId,
  voiceId,
  aspect,
}: {
  script: string;
  avatarId: string;
  voiceId: string;
  aspect: HeygenAspect;
}): Promise<string> {
  const dims = DIMS[aspect];
  const body = {
    video_inputs: [
      {
        character: {
          type: "avatar",
          avatar_id: avatarId,
          avatar_style: "normal",
        },
        voice: {
          type: "text",
          input_text: script,
          voice_id: voiceId,
        },
      },
    ],
    dimension: dims,
  };

  const r = await fetch(`${BASE}/v2/video/generate`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`HeyGen generate ${r.status}: ${t.slice(0, 500)}`);
  }
  const j = (await r.json()) as GenerateResponse;
  if (j.error) {
    throw new Error(`HeyGen: ${j.error.message ?? "unknown error"}`);
  }
  const id = j.data?.video_id;
  if (!id) throw new Error("HeyGen returned no video_id.");
  return id;
}

async function getStatus(videoId: string): Promise<StatusResponse["data"]> {
  const r = await fetch(`${BASE}/v1/video_status.get?video_id=${videoId}`, {
    headers: { "X-Api-Key": process.env.HEYGEN_API_KEY ?? "" },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`HeyGen status ${r.status}: ${t.slice(0, 300)}`);
  }
  const j = (await r.json()) as StatusResponse;
  if (j.error) throw new Error(`HeyGen status: ${j.error.message ?? "unknown"}`);
  return j.data ?? {};
}

/**
 * Estimate: HeyGen public API ~$0.30/min on Creator API plan; we approximate
 * 0.5 cents per character of script + 30 cents minimum.
 */
function estimateCostCents(script: string): number {
  return Math.max(30, Math.round(script.length * 0.5));
}

export async function generateAvatarVideo({
  userId,
  script,
  avatarId,
  voiceId,
  aspect = "9:16",
  pollMs = 5000,
  timeoutMs = 8 * 60 * 1000,
}: {
  userId: string;
  script: string;
  avatarId: string;
  voiceId: string;
  aspect?: HeygenAspect;
  pollMs?: number;
  timeoutMs?: number;
}): Promise<GeneratedAvatarVideo> {
  if (!script.trim()) throw new Error("Script is required.");
  if (!avatarId) throw new Error("Pick an avatar.");
  if (!voiceId) throw new Error("Pick a voice.");

  const videoId = await createAvatarJob({
    script: script.trim(),
    avatarId,
    voiceId,
    aspect,
  });

  const deadline = Date.now() + timeoutMs;
  let videoUrl: string | undefined;
  let duration: number | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() > deadline) {
      throw new Error(
        `HeyGen job ${videoId} did not finish within ${timeoutMs / 1000}s. Long scripts may need more time — try a shorter one.`,
      );
    }
    await new Promise((r) => setTimeout(r, pollMs));
    const data = await getStatus(videoId);
    if (data?.status === "completed") {
      videoUrl = data.video_url;
      duration = data.duration;
      break;
    }
    if (data?.status === "failed") {
      throw new Error(
        `HeyGen failed: ${data?.error?.message ?? "unknown render error"}`,
      );
    }
    // else processing/pending → keep polling
  }

  if (!videoUrl) throw new Error("HeyGen finished but returned no video URL.");

  // Download MP4 → R2 so it's served from your own infra. safeFetch blocks
  // private IPs in case HeyGen's response is ever spoofed/MITMed.
  const dl = await safeFetch(videoUrl, {
    maxBytes: 500 * 1024 * 1024,
    timeoutMs: 120_000,
  });
  const buffer = dl.buffer;
  const key = `studio/${userId}/avatar-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.mp4`;
  const url = await uploadToR2(key, buffer, "video/mp4");

  const dims = DIMS[aspect];
  return {
    url,
    width: dims.width,
    height: dims.height,
    durationSec: duration ? Math.round(duration) : null,
    costCents: estimateCostCents(script),
    prompt: script.trim(),
    remoteId: videoId,
    avatarId,
    voiceId,
  };
}
