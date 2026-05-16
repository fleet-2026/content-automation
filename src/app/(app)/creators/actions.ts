"use server";

import { Platform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { scrapeAndIngest } from "@/lib/competitors/ingest";

export async function addCreator(input: { platform: Platform; handle: string; niche?: string }) {
  const userId = await requireUser();
  await enforceRateLimit(`scrape:${userId}`, { ...RATE_LIMITS.SCRAPE, label: "creator scraping" });
  const handle = input.handle.replace(/^@/, "").trim();
  const created = await prisma.creator.upsert({
    where: { userId_platform_handle: { userId, platform: input.platform, handle } },
    create: { userId, platform: input.platform, handle, niche: input.niche ?? null },
    update: { isWatching: true, niche: input.niche ?? null },
  });

  // Fire-and-forget scrape so the form returns instantly; posts populate in
  // the creator detail page over the next 10-30 seconds.
  scrapeAndIngest(created.id).catch((e) => {
    console.error("[addCreator] scrape failed:", e);
  });

  return created;
}

export async function toggleWatching(creatorId: string, isWatching: boolean) {
  const userId = await requireUser();
  // Scope by userId so one user can't toggle another user's row.
  const r = await prisma.creator.updateMany({
    where: { id: creatorId, userId },
    data: { isWatching },
  });
  if (r.count === 0) throw new Error("not_found_or_forbidden");
  return { ok: true };
}

export async function deleteCreator(creatorId: string) {
  const userId = await requireUser();
  const r = await prisma.creator.deleteMany({ where: { id: creatorId, userId } });
  if (r.count === 0) throw new Error("not_found_or_forbidden");
  return { ok: true };
}

export async function rescrapeCreator(creatorId: string) {
  const userId = await requireUser();
  await enforceRateLimit(`scrape:${userId}`, { ...RATE_LIMITS.SCRAPE, label: "rescrape" });
  // Verify ownership BEFORE kicking off the (potentially expensive) scrape.
  const owned = await prisma.creator.findFirst({
    where: { id: creatorId, userId },
    select: { id: true },
  });
  if (!owned) throw new Error("not_found_or_forbidden");
  await scrapeAndIngest(creatorId);
  return { ok: true };
}
