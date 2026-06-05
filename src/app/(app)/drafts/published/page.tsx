import { prisma } from "@/lib/db";
import { safe } from "@/lib/safe";
import { tryGetUser } from "@/lib/auth-helpers";
import Link from "next/link";
import { DraftStatus } from "@prisma/client";
import { DraftCard, type DraftCardData } from "../draft-card";

export const dynamic = "force-dynamic";

// Dedicated home for drafts that have already gone live (or failed in the
// attempt). These used to live in a collapsed "Posted" section at the bottom
// of /drafts — now they get their own page so the queue stays focused on
// what's still to publish. Mirrors the /daily-post → /published split.
export default async function PublishedDraftsPage() {
  const userId = (await tryGetUser()) ?? undefined;

  const [drafts, socialAccounts] = userId
    ? await Promise.all([
        safe(
          () =>
            prisma.draft.findMany({
              where: { userId, status: { in: [DraftStatus.PUBLISHED, DraftStatus.FAILED] } },
              orderBy: { updatedAt: "desc" },
              take: 100,
            }),
          [],
        ),
        safe(
          () =>
            prisma.socialAccount.findMany({
              where: { userId, isActive: true },
              select: {
                platform: true,
                tokenExpiry: true,
                updatedAt: true,
                lastError: true,
              },
            }),
          [],
        ),
      ])
    : [[], []];

  const accountStateByPlatform: Record<
    string,
    { tokenExpiry: Date | null; updatedAt: Date; lastError: string | null }
  > = {};
  for (const a of socialAccounts) {
    accountStateByPlatform[a.platform] = {
      tokenExpiry: a.tokenExpiry,
      updatedAt: a.updatedAt,
      lastError: a.lastError,
    };
  }

  function toCardData(d: (typeof drafts)[number]): DraftCardData {
    return {
      id: d.id,
      caption: d.caption,
      selectedHook: d.selectedHook,
      mediaUrl: d.mediaUrl,
      platforms: d.platforms,
      status: d.status,
      scheduledFor: d.scheduledFor,
      updatedAt: d.updatedAt,
      hashtags: d.hashtags,
      publishResults: Array.isArray(d.publishResults)
        ? (d.publishResults as DraftCardData["publishResults"])
        : null,
    };
  }

  return (
    <div className="px-8 py-10 max-w-5xl">
      <div className="mb-6 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">
            Posted &amp; <span className="font-italic-accent text-blush">published.</span>
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {drafts.length} post{drafts.length === 1 ? "" : "s"} you&apos;ve published from the queue.
          </p>
        </div>
        <Link
          href="/drafts"
          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] underline"
        >
          ← Back to drafts &amp; queue
        </Link>
      </div>

      {drafts.length === 0 ? (
        <div className="border rounded-xl bg-[var(--color-surface)] p-12 text-center text-sm text-[var(--color-muted)]">
          Nothing published yet. Posts you publish from{" "}
          <Link href="/drafts" className="underline">
            drafts &amp; queue
          </Link>{" "}
          move here automatically.
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.map((d) => (
            <DraftCard
              key={d.id}
              draft={toCardData(d)}
              accountStateByPlatform={accountStateByPlatform}
            />
          ))}
        </div>
      )}
    </div>
  );
}
