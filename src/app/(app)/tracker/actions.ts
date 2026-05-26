"use server";

// Server actions for the 31-day tracker.
//
// All data flows through the existing Draft model. We don't add columns —
// tracker fields live in Draft.hookOptions.trackerMeta (see meta.ts).
//
// Actions:
//   seedTrackerRows     one-shot: ensure a Draft exists for each of the 31
//                       days. Matches existing drafts by trackerMeta.dayNumber.
//   patchTrackerRow     update IG URL / wired / keyword on a single row
//   publishRow          alias to existing publishDraftNow but revalidates the
//                       tracker page after success

import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { tryGetUser } from "@/lib/auth-helpers";
import { publishDraft } from "@/lib/publish";
import { uploadToR2 } from "@/lib/r2";
import { sniffFileType } from "@/lib/file-sniff";
import { trackerSeedData, type TrackerSeed } from "./seed-data";
import { readTrackerMeta, writeTrackerMeta, type TrackerMeta } from "./meta";

// All 4 publishable platforms — we target every day at all of them so the
// user can post with one click. Drafts.platforms is a Postgres enum array.
const DEFAULT_PLATFORMS = ["INSTAGRAM", "FACEBOOK", "TIKTOK", "LINKEDIN"] as const;

export async function seedTrackerRows(): Promise<{
  ok: boolean;
  inserted: number;
  enriched: number;
  total: number;
  error?: string;
}> {
  const userId = await tryGetUser();
  if (!userId) return { ok: false, inserted: 0, enriched: 0, total: 0, error: "not signed in" };

  try {
    // Pull all this user's existing drafts that already have a tracker dayNumber.
    const existingDrafts = await prisma.draft.findMany({
      where: { userId },
      select: { id: true, hookOptions: true, caption: true, mediaUrl: true },
    });
    const byDay = new Map<number, (typeof existingDrafts)[number]>();
    for (const d of existingDrafts) {
      const meta = readTrackerMeta(d.hookOptions);
      if (meta?.dayNumber !== undefined) byDay.set(meta.dayNumber, d);
    }

    let inserted = 0;
    let enriched = 0;

    for (const seed of trackerSeedData) {
      const existing = byDay.get(seed.dayNumber);
      if (existing) {
        // Enrich missing fields without clobbering edits the user has made.
        const meta = readTrackerMeta(existing.hookOptions) ?? {};
        const patch: Partial<TrackerMeta> = {};
        if (meta.dayNumber === undefined) patch.dayNumber = seed.dayNumber;
        if (!meta.keyword) patch.keyword = seed.keyword;
        if (!meta.guideLink) patch.guideLink = seed.guideLink;
        if (!meta.manychatDmText) patch.manychatDmText = seed.manychatDmText;
        if (meta.manychatWired === undefined) patch.manychatWired = false;
        if (Object.keys(patch).length > 0) {
          await prisma.draft.update({
            where: { id: existing.id },
            data: { hookOptions: writeTrackerMeta(existing.hookOptions, patch) },
          });
        }
        enriched++;
        continue;
      }
      // Create a fresh Draft for this day.
      const hookOptions = writeTrackerMeta(null, {
        dayNumber: seed.dayNumber,
        keyword: seed.keyword,
        guideLink: seed.guideLink,
        manychatDmText: seed.manychatDmText,
        manychatWired: false,
      });
      await prisma.draft.create({
        data: {
          userId,
          caption: seed.caption,
          hashtags: [],
          selectedHook: seed.hook,
          mediaUrl: seed.imageUrl ?? null,
          platforms: [...DEFAULT_PLATFORMS],
          status: "DRAFT",
          hookOptions,
        },
      });
      inserted++;
    }

    revalidatePath("/tracker");
    return { ok: true, inserted, enriched, total: trackerSeedData.length };
  } catch (err) {
    return {
      ok: false,
      inserted: 0,
      enriched: 0,
      total: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type RowPatch = {
  igPostUrl?: string;
  manychatWired?: boolean;
  keyword?: string;
};

export async function patchTrackerRow(
  draftId: string,
  patch: RowPatch,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await tryGetUser();
  if (!userId) return { ok: false, error: "not signed in" };
  try {
    // Verify ownership before mutating.
    const draft = await prisma.draft.findFirst({
      where: { id: draftId, userId },
      select: { id: true, hookOptions: true },
    });
    if (!draft) return { ok: false, error: "row not found" };

    const cleanedPatch: Partial<TrackerMeta> = {};
    if (patch.igPostUrl !== undefined) {
      cleanedPatch.igPostUrl = patch.igPostUrl || undefined;
    }
    if (patch.manychatWired !== undefined) cleanedPatch.manychatWired = patch.manychatWired;
    if (patch.keyword !== undefined) cleanedPatch.keyword = patch.keyword || undefined;

    const nextHookOptions = writeTrackerMeta(draft.hookOptions, cleanedPatch);
    await prisma.draft.update({
      where: { id: draftId },
      data: { hookOptions: nextHookOptions },
    });
    revalidatePath("/tracker");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Publish a single draft to all its targeted platforms (existing pipeline).
// Returns the per-platform results so the UI can show a green/red badge each.
export async function publishRow(
  draftId: string,
): Promise<{
  ok: boolean;
  results?: Awaited<ReturnType<typeof publishDraft>>;
  error?: string;
}> {
  const userId = await tryGetUser();
  if (!userId) return { ok: false, error: "not signed in" };
  try {
    const draft = await prisma.draft.findFirst({
      where: { id: draftId, userId },
      select: { id: true },
    });
    if (!draft) return { ok: false, error: "row not found" };
    const results = await publishDraft(draftId);
    revalidatePath("/tracker");
    return { ok: true, results };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Upload an image/video for a tracker row and set it as the Draft's mediaUrl. */
export async function uploadRowImage(
  draftId: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const userId = await tryGetUser();
  if (!userId) return { ok: false, error: "not signed in" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "missing_file" };
  }
  if (file.size > 200 * 1024 * 1024) {
    return { ok: false, error: "file_too_large (max 200 MB)" };
  }

  // Verify ownership
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId },
    select: { id: true },
  });
  if (!draft) return { ok: false, error: "row not found" };

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffFileType(new Uint8Array(buf.slice(0, 64)));
    if (!sniffed) return { ok: false, error: "unsupported_type" };

    const key = `uploads/${userId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${sniffed.ext}`;
    const url = await uploadToR2(key, buf, sniffed.mime);

    await prisma.draft.update({
      where: { id: draftId },
      data: { mediaUrl: url },
    });

    revalidatePath("/tracker");
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? String(e) };
  }
}
