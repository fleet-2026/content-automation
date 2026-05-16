"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  generateImage,
  type ImageSize,
  type ImageQuality,
} from "@/lib/ai/image-gen";
import {
  type VideoSize,
  type VideoSeconds,
  type VideoModel,
} from "@/lib/ai/video-gen";
import {
  listAvatars as heygenListAvatars,
  listVoices as heygenListVoices,
  type HeygenAspect,
  type HeygenAvatar,
  type HeygenVoice,
} from "@/lib/ai/heygen";
import {
  checkOpenartAvailability,
  type OpenartModel,
  type OpenartAspect,
} from "@/lib/ai/openart";

export type StudioAsset = {
  id: string;
  userId: string;
  type: "IMAGE" | "VIDEO";
  prompt: string;
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  model: string;
  size: string | null;
  costCents: number | null;
  status: "PENDING" | "GENERATING" | "READY" | "FAILED";
  error: string | null;
  createdAt: Date;
};

// ─── IMAGES (sync — fast enough for server actions) ─────────────
export async function createImage(input: {
  prompt: string;
  size?: ImageSize;
  quality?: ImageQuality;
}): Promise<StudioAsset> {
  const userId = await requireUser();
  await enforceRateLimit(`imagegen:${userId}`, { ...RATE_LIMITS.IMAGE_GEN, label: "image gen" });
  const { prompt, size = "1024x1024", quality = "high" } = input;

  if (!prompt.trim()) throw new Error("Prompt is required.");

  const placeholder = await prisma.mediaAsset.create({
    data: {
      userId,
      type: "IMAGE",
      prompt: prompt.trim(),
      url: "",
      model: "gpt-image-1",
      size,
      status: "GENERATING",
    },
  });

  try {
    const out = await generateImage({ userId, prompt, size, quality });
    const updated = await prisma.mediaAsset.update({
      where: { id: placeholder.id },
      data: {
        url: out.url,
        width: out.width,
        height: out.height,
        costCents: out.costCents,
        status: "READY",
      },
    });
    revalidatePath("/studio");
    return updated as StudioAsset;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.mediaAsset.update({
      where: { id: placeholder.id },
      data: { status: "FAILED", error: msg },
    });
    revalidatePath("/studio");
    throw new Error(msg);
  }
}

// ─── VIDEOS / AVATARS (async-poll via /api/studio/{video,avatar}) ────
//
// These thin wrappers call the API routes (which use `after()` so the long
// Sora/HeyGen jobs run after the response is sent). Returns the placeholder
// MediaAsset id; client polls `pollAsset(id)` until READY/FAILED.

async function startAsync(
  path: "/api/studio/video" | "/api/studio/avatar" | "/api/studio/openart",
  body: unknown,
): Promise<StudioAsset> {
  // Always use the absolute URL when calling our own API from a server action
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL?.startsWith("http")
      ? process.env.VERCEL_URL
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

  // Forward cookies so requireUser() works in the spawned route handler.
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const cookieHeader = jar.getAll().map((c) => `${c.name}=${c.value}`).join("; ");

  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err?.message || err?.error || `start failed: ${r.status}`);
  }
  const j = (await r.json()) as { id: string };
  // Return the placeholder so the UI can start polling immediately.
  const asset = await prisma.mediaAsset.findUnique({ where: { id: j.id } });
  if (!asset) throw new Error("Failed to load placeholder asset");
  return asset as StudioAsset;
}

export async function createVideo(input: {
  prompt: string;
  size?: VideoSize;
  seconds?: VideoSeconds;
  model?: VideoModel;
}): Promise<StudioAsset> {
  return startAsync("/api/studio/video", input);
}

export async function createAvatarVideo(input: {
  script: string;
  avatarId: string;
  voiceId: string;
  aspect?: HeygenAspect;
}): Promise<StudioAsset> {
  return startAsync("/api/studio/avatar", input);
}

/**
 * OpenArt generation (local Playwright). Same async-poll shape as the
 * other studio routes — placeholder asset back immediately, real work
 * runs in `after()` inside /api/studio/openart.
 */
export async function createOpenartGen(input: {
  prompt: string;
  model: OpenartModel;
  aspect?: OpenartAspect;
  durationSec?: number;
  imageUrl?: string;
  characterId?: string;
}): Promise<StudioAsset> {
  return startAsync("/api/studio/openart", input);
}

/** Probe whether OpenArt is set up on this machine (returns reason if not). */
export async function getOpenartStatus(): Promise<{
  available: boolean;
  reason: string | null;
  videoModels: string[];
  imageModels: string[];
}> {
  await requireUser();
  const avail = await checkOpenartAvailability();
  return {
    available: avail.available,
    reason: avail.reason ?? null,
    videoModels: ["veo3", "sora-v2", "kling", "hailuo", "seedance", "wan"],
    imageModels: ["flux-pro", "flux-kontext", "flux-dev", "gpt-image", "gemini", "imagen-4", "sdxl"],
  };
}

export async function pollAsset(id: string): Promise<StudioAsset | null> {
  const userId = await requireUser();
  const asset = await prisma.mediaAsset.findFirst({ where: { id, userId } });
  return (asset as StudioAsset) ?? null;
}

// ─── LIST / DELETE / DRAFT INTEGRATION ──────────────────────────

export async function listAssets(opts?: {
  type?: "IMAGE" | "VIDEO";
  limit?: number;
}): Promise<StudioAsset[]> {
  const userId = await requireUser();
  const rows = await prisma.mediaAsset.findMany({
    where: { userId, ...(opts?.type ? { type: opts.type } : {}) },
    orderBy: { createdAt: "desc" },
    take: opts?.limit ?? 60,
  });
  return rows as StudioAsset[];
}

export async function deleteAsset(id: string): Promise<void> {
  const userId = await requireUser();
  await prisma.mediaAsset.deleteMany({ where: { id, userId } });
  revalidatePath("/studio");
}

// ─── HEYGEN dropdown lists ──────────────────────────────────

export async function listHeygenAvatars(): Promise<HeygenAvatar[]> {
  await requireUser();
  return heygenListAvatars();
}

export async function listHeygenVoices(): Promise<HeygenVoice[]> {
  await requireUser();
  return heygenListVoices();
}

/**
 * Drop a generated media asset into a new Draft so the user can compose
 * around it on /compose or /drafts.
 */
export async function useInDraft(assetId: string): Promise<{ draftId: string }> {
  const userId = await requireUser();
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: assetId, userId },
  });
  if (!asset) throw new Error("Asset not found.");
  if (asset.status !== "READY" || !asset.url) {
    throw new Error("Asset is not ready yet.");
  }

  const draft = await prisma.draft.create({
    data: {
      userId,
      caption: "",
      hashtags: [],
      mediaUrl: asset.url,
      platforms: ["INSTAGRAM"],
      status: "DRAFT",
    },
  });
  revalidatePath("/drafts");
  return { draftId: draft.id };
}
