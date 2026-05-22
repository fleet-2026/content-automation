"use server";

import { Platform, DraftStatus } from "@prisma/client";
import * as flipit from "@/lib/flipit";
import { extractVideoUrl as extractVideoUrlImpl } from "@/lib/video-extract";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
import {
  generateImagePrompts,
  generateVideoPrompts,
  rewriteScriptWithClaude,
  generateNicheIdeas,
  type ImagePrompt,
  type VideoPrompt,
} from "@/lib/ai/native-prompts";
import {
  generateImageWithImagen,
  isGeminiConfigured,
  type ImagenAspect,
} from "@/lib/ai/gemini";

/**
 * Server actions used by /flip.
 *
 * URL extract still uses FlipIt's external API (its uniquely valuable
 * service — it parses social URLs to get the original caption). The other
 * 4 endpoints have been replaced with local Claude calls for reliability.
 *
 * Every action requires auth + rate-limit. These helpers spend money on
 * Anthropic / FlipIt every call.
 */

async function gate(label: string) {
  const userId = await requireUser();
  await enforceRateLimit(`flipit:${userId}`, { ...RATE_LIMITS.FLIPIT, label });
  return userId;
}

export async function flipFromUrl(url: string) {
  await gate("URL extract");
  return flipit.extractAndTwist(url);
}

export async function flipScript(input: { script: string; tone?: string; platform?: string }) {
  await gate("script rewrite");
  return rewriteScriptWithClaude(input);
}

export async function ideasForNiche(input: { niche: string; description: string }) {
  await gate("niche ideas");
  return generateNicheIdeas(input);
}

export async function buildImagePrompts(
  input:
    | { flippedScript: string; count?: number; sourceImages?: string[] }
    | {
        niche: string;
        event?: string;
        customEvent?: string;
        style?: string;
        count?: number;
        extra?: string;
        sourceImages?: string[];
      },
): Promise<{ prompts: ImagePrompt[] }> {
  await gate("image prompts");
  const prompts = await generateImagePrompts(input);
  return { prompts };
}

export async function buildVideoPrompts(input: {
  flippedScript: string;
  platform?: string;
}): Promise<{ prompts: VideoPrompt[] }> {
  await gate("video prompts");
  const prompts = await generateVideoPrompts(input);
  return { prompts };
}

export async function analyzeImage(input: { imageUrl: string; slideNumber?: number }) {
  await gate("image analysis");
  return flipit.analyzeImage(input);
}

export async function trending(input: { niche?: string; hashtag?: string; count?: number }) {
  await gate("trending");
  return flipit.trending(input);
}

/**
 * Extract the downloadable video URL from a TikTok / Instagram URL.
 * Used by the /flip URL tab "Download original video" button. FlipIt's
 * own API only returns image thumbnails, so this is a separate path
 * that uses tikwm (fast, free) for TikTok and Apify for Instagram.
 *
 * Rate-limited per user via the existing FLIPIT bucket so we don't
 * accidentally burn an Apify quota.
 */
export async function extractVideo(url: string) {
  await gate("video extract");
  return extractVideoUrlImpl(url);
}

/**
 * Generate a single image directly from a flipped script. Used by the
 * "Create image" button on /flip → URL extract — the user has just
 * flipped a viral post and wants matching artwork in one click.
 *
 * Goes through Imagen 4 (Gemini Omni). Creates a MediaAsset row so the
 * generation lands in the user's library and gets the same lifecycle
 * (poll status, retry, etc.) as anything else made in /studio.
 *
 * Rate-limited via IMAGE_GEN, shared with the Studio image tabs.
 */
export async function createImageFromFlip(input: {
  prompt: string;
  aspectRatio?: ImagenAspect;
}): Promise<{ url: string; assetId: string; prompt: string }> {
  const userId = await requireUser();
  await enforceRateLimit(`imagegen:${userId}`, {
    ...RATE_LIMITS.IMAGE_GEN,
    label: "flip → image",
  });
  if (!input.prompt?.trim()) throw new Error("Need a prompt to generate an image.");
  if (!isGeminiConfigured()) {
    throw new Error(
      "GOOGLE_GEMINI_API_KEY is not configured. Add it from https://aistudio.google.com/apikey to Vercel env vars to enable image generation here.",
    );
  }

  // Persist a placeholder so the image shows up in the user's library
  // even before the (10-30s) generation finishes — matches the Studio
  // image flow.
  const placeholder = await prisma.mediaAsset.create({
    data: {
      userId,
      type: "IMAGE",
      prompt: input.prompt.trim(),
      url: "",
      model: "imagen-4.0-generate-preview-06-06",
      size: input.aspectRatio ?? "1:1",
      status: "GENERATING",
    },
  });

  try {
    const out = await generateImageWithImagen({
      userId,
      prompt: input.prompt.trim(),
      aspectRatio: input.aspectRatio ?? "1:1",
    });
    await prisma.mediaAsset.update({
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
    return { url: out.url, assetId: placeholder.id, prompt: out.prompt };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.mediaAsset.update({
      where: { id: placeholder.id },
      data: { status: "FAILED", error: msg },
    });
    throw new Error(msg);
  }
}

/**
 * Create a Draft from a /flip output. Used by the "Create post" button —
 * one click from "I have a flipped script" to "draft ready in /compose".
 *
 * Defaults the platform list to IG + TikTok + FB (the three with
 * working publish backends right now); the user can refine in compose.
 */
export async function createDraftFromFlip(input: {
  caption: string;
  hook?: string | null;
  mediaUrl?: string | null;
  platforms?: Platform[];
}): Promise<{ draftId: string }> {
  const userId = await requireUser();
  if (!input.caption?.trim()) {
    throw new Error("Need a caption to create a draft.");
  }

  const draft = await prisma.draft.create({
    data: {
      userId,
      caption: input.caption.trim(),
      hashtags: [],
      selectedHook: input.hook?.trim() || null,
      mediaUrl: input.mediaUrl?.trim() || null,
      platforms: input.platforms ?? [
        Platform.INSTAGRAM,
        Platform.TIKTOK,
        Platform.FACEBOOK,
      ],
      status: DraftStatus.DRAFT,
    },
  });
  revalidatePath("/drafts");
  return { draftId: draft.id };
}
