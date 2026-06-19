"use server";

/**
 * Server actions for the per-draft guide markdown.
 *
 * Each carousel Draft has an associated long-form guide that gets delivered
 * to subscribers after the email-gate flow on launchedpost.com/g/<keyword>.
 * The guide markdown is stored on the Draft itself, inside
 * `hookOptions.trackerMeta.guide_md`, so it round-trips with the rest of the
 * tracker metadata without needing its own column.
 *
 * Read/write helpers below are deliberately surgical — they only touch the
 * trackerMeta.guide_md path. Other hookOptions data is preserved intact.
 */

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";

type HookOptionsObject = Record<string, unknown>;
type TrackerMeta = Record<string, unknown>;

function asObject(value: unknown): HookOptionsObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as HookOptionsObject) };
  }
  return {};
}

async function assertOwned(userId: string, draftId: string) {
  const d = await prisma.draft.findFirst({
    where: { id: draftId, userId },
    select: { id: true },
  });
  if (!d) throw new Error("not_found_or_forbidden");
}

export type GuideInfo = {
  guideMd: string;
  wordCount: number;
  updatedAt: string | null;
  guideFile: string | null;
};

/** Read the current guide markdown for a draft. Empty string if none set. */
export async function getDraftGuide(draftId: string): Promise<GuideInfo> {
  const userId = await requireUser();
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId },
    select: { hookOptions: true },
  });
  if (!draft) throw new Error("not_found_or_forbidden");

  const hookOptions = asObject(draft.hookOptions);
  const trackerMeta = asObject(hookOptions.trackerMeta);
  const guideMd = typeof trackerMeta.guide_md === "string" ? (trackerMeta.guide_md as string) : "";
  const wordCount = typeof trackerMeta.guide_word_count === "number"
    ? (trackerMeta.guide_word_count as number)
    : guideMd.split(/\s+/).filter(Boolean).length;
  const updatedAt = typeof trackerMeta.guide_updated_at === "string"
    ? (trackerMeta.guide_updated_at as string)
    : null;
  const guideFile = typeof trackerMeta.guide_file === "string"
    ? (trackerMeta.guide_file as string)
    : null;
  return { guideMd, wordCount, updatedAt, guideFile };
}

/** Persist the guide markdown back to the draft. Preserves everything else. */
export async function saveDraftGuide(
  draftId: string,
  guideMd: string,
): Promise<GuideInfo> {
  const userId = await requireUser();
  await assertOwned(userId, draftId);

  // Pull the full hookOptions object so we can merge cleanly without dropping
  // anything else the carousel tracker / publish pipeline relies on.
  const existing = await prisma.draft.findFirst({
    where: { id: draftId, userId },
    select: { hookOptions: true },
  });

  const hookOptions = asObject(existing?.hookOptions);
  const trackerMeta: TrackerMeta = asObject(hookOptions.trackerMeta);

  const wordCount = guideMd.split(/\s+/).filter(Boolean).length;
  const updatedAt = new Date().toISOString();

  trackerMeta.guide_md = guideMd;
  trackerMeta.guide_word_count = wordCount;
  trackerMeta.guide_updated_at = updatedAt;
  hookOptions.trackerMeta = trackerMeta;

  await prisma.draft.update({
    where: { id: draftId },
    data: { hookOptions: hookOptions as object },
  });

  return {
    guideMd,
    wordCount,
    updatedAt,
    guideFile: typeof trackerMeta.guide_file === "string"
      ? (trackerMeta.guide_file as string)
      : null,
  };
}

/** Persist (or clear) the guide FILE the bot delivers when someone comments the
 *  keyword. Surgical — only touches trackerMeta.guide_file, preserving the
 *  markdown and everything else. Pass null to remove it. */
export async function saveDraftGuideFile(
  draftId: string,
  fileUrl: string | null,
): Promise<GuideInfo> {
  const userId = await requireUser();
  await assertOwned(userId, draftId);

  const existing = await prisma.draft.findFirst({
    where: { id: draftId, userId },
    select: { hookOptions: true },
  });
  const hookOptions = asObject(existing?.hookOptions);
  const trackerMeta: TrackerMeta = asObject(hookOptions.trackerMeta);

  if (fileUrl) trackerMeta.guide_file = fileUrl;
  else delete trackerMeta.guide_file;
  hookOptions.trackerMeta = trackerMeta;

  await prisma.draft.update({
    where: { id: draftId },
    data: { hookOptions: hookOptions as object },
  });

  const guideMd = typeof trackerMeta.guide_md === "string" ? (trackerMeta.guide_md as string) : "";
  return {
    guideMd,
    wordCount: typeof trackerMeta.guide_word_count === "number"
      ? (trackerMeta.guide_word_count as number)
      : guideMd.split(/\s+/).filter(Boolean).length,
    updatedAt: typeof trackerMeta.guide_updated_at === "string"
      ? (trackerMeta.guide_updated_at as string)
      : null,
    guideFile: fileUrl,
  };
}
