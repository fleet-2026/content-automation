import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DraftStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { safe } from "@/lib/safe";
import { tryGetUser } from "@/lib/auth-helpers";
import { listPosts, isPostPublished, type DailyPost } from "../daily-post/data";
import { PostCard } from "../daily-post/post-card";
import { DraftCard, type DraftCardData } from "../drafts/draft-card";
import { TikTokCaptionQr } from "@/components/tiktok-caption-qr";

export const metadata: Metadata = {
  title: "Published — Creator OS",
  description: "Everything you've published, from every page, in one place.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
// Publishing a Reel waits on Instagram's video processing (up to ~2 min);
// give the publish server action room so it isn't killed mid-publish.
export const maxDuration = 150;

/** Assemble caption + hashtags for the desktop "Copy caption" fallback. */
function dailyCaption(p: DailyPost): string {
  const tags = (p.generated?.hashtags ?? []).join(" ");
  return [p.generated?.caption?.trim(), tags].filter(Boolean).join("\n\n");
}

export default async function PublishedPage() {
  const userId = await tryGetUser();
  if (!userId) redirect("/login");

  // Pull from BOTH pipelines so this is the single home for everything
  // published: DailyGuide posts (daily-post) + Drafts (compose/drafts/
  // carousel/schedule/tracker). A post is "published" if it's live on
  // /guides, was posted to a social platform, or its draft went out.
  const [posts, drafts, socialAccounts] = await Promise.all([
    listPosts(),
    safe(
      () =>
        prisma.draft.findMany({
          where: {
            userId,
            status: { in: [DraftStatus.PUBLISHED, DraftStatus.FAILED] },
          },
          orderBy: { updatedAt: "desc" },
          // High ceiling so a prolific publisher never loses older posts off
          // the bottom of /published. Was 100 — meant published posts silently
          // dropped off once the queue grew past that. A single creator won't
          // realistically exceed 1000 drafts; if they ever do, paginate.
          take: 1000,
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
  ]);

  const dailyPublished = posts
    .filter(isPostPublished)
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0));

  // Daily-post social publishes create an ephemeral Draft to drive the
  // publish pipeline. Going forward publishToSocial deletes it, but older
  // ones linger in the DB — hide any Queue draft whose caption matches a
  // Daily post already shown here so the same post isn't listed twice.
  const dailyCaptions = new Set(
    dailyPublished
      .map((p) => p.generated?.caption?.trim())
      .filter((c): c is string => !!c),
  );
  const queueDrafts = drafts.filter((d) => !dailyCaptions.has(d.caption.trim()));

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

  const total = dailyPublished.length + queueDrafts.length;

  return (
    <div className="px-8 py-10 max-w-7xl">
      <div className="mb-6 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">
            Published <span className="font-italic-accent text-blush">posts.</span>
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {total} published · everything you post — from any page — lands here.
          </p>
        </div>
        <Link
          href="/daily-post"
          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] underline"
        >
          ← Back to daily post
        </Link>
      </div>

      {total === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-center text-sm text-[var(--color-muted)]">
          Nothing published yet. Posts move here automatically the moment you
          publish — from{" "}
          <Link href="/daily-post" className="underline">
            daily post
          </Link>
          ,{" "}
          <Link href="/compose" className="underline">
            compose
          </Link>
          ,{" "}
          <Link href="/drafts" className="underline">
            drafts
          </Link>
          , carousel, or schedule.
        </div>
      ) : (
        <div className="space-y-10">
          {/* Daily posts (DailyGuide pipeline) */}
          {dailyPublished.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3">
                Daily posts
                <span className="ml-2 text-sm font-normal text-[var(--color-muted)]">
                  {dailyPublished.length}
                </span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {dailyPublished.map((p) => (
                  <div key={p.slug} className="space-y-2">
                    <PostCard p={p} />
                    {(p.postedPlatforms ?? []).includes("TIKTOK") && (
                      <TikTokCaptionQr slug={p.slug} caption={dailyCaption(p)} />
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Queue posts (Draft pipeline — compose/drafts/carousel/schedule) */}
          {queueDrafts.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3">
                Queue posts
                <span className="ml-2 text-sm font-normal text-[var(--color-muted)]">
                  {queueDrafts.length}
                </span>
              </h2>
              <div className="space-y-3">
                {queueDrafts.map((d) => (
                  <DraftCard
                    key={d.id}
                    draft={toCardData(d)}
                    accountStateByPlatform={accountStateByPlatform}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
