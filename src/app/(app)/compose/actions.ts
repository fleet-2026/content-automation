"use server";

import { Platform, DraftStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { suggestHooks, type HookVariant } from "@/lib/ai/hook-suggester";
import { publishDraft as publishNow } from "@/lib/publish";
import { requireUser } from "@/lib/auth-helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { inngest } from "../../../../inngest/client";

export async function generateHookVariants(input: { topic: string; caption?: string; count?: number }) {
  const userId = await requireUser();
  await enforceRateLimit(`hookgen:${userId}`, { ...RATE_LIMITS.HOOK_GEN, label: "hook generation" });
  const variants = await suggestHooks({ userId, ...input });
  return variants;
}

/**
 * Assert a draft belongs to the calling user before mutating. Returns the
 * draft for follow-up reads, or throws "not_found_or_forbidden".
 */
async function ownedDraft(userId: string, draftId: string) {
  const d = await prisma.draft.findFirst({
    where: { id: draftId, userId },
    select: { id: true },
  });
  if (!d) throw new Error("not_found_or_forbidden");
  return d;
}

export async function saveDraft(input: {
  draftId?: string;
  caption: string;
  hashtags: string[];
  hookOptions?: HookVariant[];
  selectedHook?: string | null;
  mediaUrl?: string | null;
  platforms: Platform[];
  scheduledFor?: string | null;
}) {
  const userId = await requireUser();
  const data = {
    caption: input.caption,
    hashtags: input.hashtags,
    hookOptions: (input.hookOptions ?? []) as unknown as object,
    selectedHook: input.selectedHook ?? null,
    mediaUrl: input.mediaUrl ?? null,
    platforms: input.platforms,
    scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
    status: input.scheduledFor ? DraftStatus.SCHEDULED : DraftStatus.DRAFT,
  };
  if (input.draftId) {
    await ownedDraft(userId, input.draftId);
    return prisma.draft.update({ where: { id: input.draftId }, data });
  }
  return prisma.draft.create({ data: { ...data, userId } });
}

export async function publishDraftNow(
  draftId: string,
  /** Optional: platforms to force-retry even if they succeeded last time.
   *  Used when the user deleted the previous post (e.g. a duplicate FB
   *  post) and wants to republish from this draft. Without this list,
   *  publish.ts auto-skips platforms with ok=true in publishResults. */
  forceRetryPlatforms?: Platform[],
) {
  const userId = await requireUser();
  await ownedDraft(userId, draftId);
  await prisma.draft.update({ where: { id: draftId }, data: { status: DraftStatus.PUBLISHING } });
  return publishNow(draftId, forceRetryPlatforms);
}

export async function scheduleDraft(draftId: string, when: string) {
  const userId = await requireUser();
  await ownedDraft(userId, draftId);
  const scheduledFor = new Date(when);
  await prisma.draft.update({
    where: { id: draftId },
    data: { scheduledFor, status: DraftStatus.SCHEDULED },
  });
  // Best-effort Inngest dispatch. The publishDuePollers cron is the safety
  // net — even if Inngest is down or the key is missing, due drafts publish.
  if (process.env.INNGEST_EVENT_KEY) {
    try {
      await inngest.send({
        name: "creator-os/draft.schedule",
        data: { draftId, runAt: scheduledFor.toISOString() },
      });
    } catch (e) {
      console.error("[scheduleDraft] inngest.send failed (cron will catch):", (e as Error).message);
    }
  }
  return { ok: true };
}

export async function deleteDraft(draftId: string) {
  const userId = await requireUser();
  // Single-statement scoped delete — no need to fetch first.
  const r = await prisma.draft.deleteMany({ where: { id: draftId, userId } });
  if (r.count === 0) throw new Error("not_found_or_forbidden");
  return { ok: true };
}

/** Update which platforms a draft will publish to. Lets the user
 *  toggle each platform on/off from the draft card before re-publishing
 *  (e.g. exclude already-posted TikTok + Facebook, retry only IG). */
export async function setDraftPlatforms(
  draftId: string,
  platforms: Platform[],
): Promise<{ ok: boolean }> {
  const userId = await requireUser();
  const r = await prisma.draft.updateMany({
    where: { id: draftId, userId },
    data: { platforms },
  });
  if (r.count === 0) throw new Error("not_found_or_forbidden");
  return { ok: true };
}
