"use server";

import { Platform } from "@prisma/client";
import { requireUser } from "@/lib/auth-helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { previewIgProfile, type BrowseProfile } from "@/lib/browse";
import { addCreator as addCreatorAction } from "@/app/(app)/creators/actions";

export async function lookupIgProfile(handle: string): Promise<BrowseProfile | null> {
  const userId = await requireUser();
  await enforceRateLimit(`scrape:${userId}`, { ...RATE_LIMITS.SCRAPE, label: "IG lookup" });
  return previewIgProfile(handle);
}

export async function watchIgProfile(handle: string, niche?: string) {
  await requireUser();
  return addCreatorAction({
    platform: Platform.INSTAGRAM,
    handle: handle.replace(/^@/, "").trim(),
    niche,
  });
}
