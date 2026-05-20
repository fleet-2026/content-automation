"use server";

import * as flipit from "@/lib/flipit";
import { extractVideoUrl as extractVideoUrlImpl } from "@/lib/video-extract";
import { requireUser } from "@/lib/auth-helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  generateImagePrompts,
  generateVideoPrompts,
  rewriteScriptWithClaude,
  generateNicheIdeas,
  type ImagePrompt,
  type VideoPrompt,
} from "@/lib/ai/native-prompts";

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
