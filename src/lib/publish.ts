import { Platform, PostStatus, MediaType, type Draft } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { igPublish } from "@/lib/platforms/instagram-publish";
import { ytPublish } from "@/lib/platforms/youtube-publish";
import { ttPublishToInbox } from "@/lib/platforms/tiktok-publish";
import { fbPublish } from "@/lib/platforms/facebook-publish";
import { liPublishText } from "@/lib/platforms/linkedin-publish";
import { primaryMediaUrl } from "@/lib/media-urls";
import { PLATFORM_INFO } from "@/lib/platform-info";

export type PublishResult = {
  platform: Platform;
  ok: boolean;
  postId?: string;
  url?: string;
  error?: string;
};

/**
 * Publishes a Draft to all selected platforms in parallel.
 * Returns a per-platform result list and updates the draft.publishResults JSON.
 */
export async function publishDraft(draftId: string): Promise<PublishResult[]> {
  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } });
  // Draft.mediaUrl may be newline-packed (carousel). The publishing layer is
  // currently single-media per platform — pull the primary URL and use that
  // for all three. Carousel publishing (IG only) is a future enhancement;
  // until then a multi-image draft publishes its primary image and the rest
  // are still saved on the draft so the user doesn't lose them.
  const primaryUrl = primaryMediaUrl(draft.mediaUrl);
  // All visual URLs (newline-packed in Draft.mediaUrl) so we can publish
  // carousels to platforms that support them (Instagram). Filters out
  // the `audio::` prefix used for background music.
  const allMediaUrls = (draft.mediaUrl ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("audio::"));
  const accounts = await prisma.socialAccount.findMany({
    where: {
      userId: draft.userId,
      platform: { in: draft.platforms },
      isActive: true,
    },
  });

  // Drop platforms that have been globally disabled via PLATFORM_INFO
  // (e.g. YouTube). Old drafts saved with these platforms in their
  // platforms[] would otherwise keep trying to publish to them on
  // every retry. The user expressly turned YouTube off — honor it.
  const enabledPlatforms = draft.platforms.filter(
    (p) => PLATFORM_INFO[p]?.enabled !== false,
  );

  // Retry-aware platform selection: if this is a re-publish on a draft
  // that already has prior results, SKIP any platform that succeeded
  // last time so we don't post duplicates. Failed platforms get retried.
  // The TikTok "delivered_to_inbox_finish_in_app" sentinel counts as a
  // success — the video is already in the user's TikTok app.
  const previousResults = (draft.publishResults ?? []) as unknown as PublishResult[];
  const previousOkPlatforms = new Set(
    Array.isArray(previousResults)
      ? previousResults.filter((r) => r && r.ok).map((r) => r.platform)
      : [],
  );
  const platformsToTry = enabledPlatforms.filter(
    (p) => !previousOkPlatforms.has(p),
  );

  // Build the carry-over results for skipped (already-ok) platforms so
  // the returned PublishResult[] still describes ALL platforms, not just
  // the ones we just attempted. Lets the UI show the full picture.
  const carryOver: PublishResult[] = (previousResults ?? []).filter(
    (r) => r && r.ok && draft.platforms.includes(r.platform),
  );

  const results = await Promise.all(
    platformsToTry.map(async (platform): Promise<PublishResult> => {
      const account = accounts.find((a) => a.platform === platform);
      if (!account) {
        return { platform, ok: false, error: "no_connected_account" };
      }
      try {
        const accessToken = decrypt(account.accessToken);
        const refreshToken = account.refreshToken ? decrypt(account.refreshToken) : null;

        if (platform === Platform.INSTAGRAM) {
          const isVideo = primaryUrl?.match(/\.(mp4|mov|m4v)(\?|$)/i);
          // Use the IG carousel endpoint when the draft has ≥2 visual
          // attachments. IG ignores the imageUrl/videoUrl single-item
          // fields when imageUrls[] is set.
          const isCarousel = allMediaUrls.length >= 2 && !isVideo;
          const out = await igPublish(account.platformUserId, accessToken, {
            caption: combineCaption(draft),
            videoUrl: isVideo ? primaryUrl ?? undefined : undefined,
            imageUrl: !isVideo && !isCarousel ? primaryUrl ?? undefined : undefined,
            imageUrls: isCarousel ? allMediaUrls : undefined,
            isReel: !!isVideo,
          });
          return { platform, ok: true, postId: out.platformPostId, url: out.permalink };
        }

        if (platform === Platform.YOUTUBE) {
          if (!primaryUrl) return { platform, ok: false, error: "missing_video" };
          const out = await ytPublish(
            { accessToken, refreshToken, expiresAt: account.tokenExpiry },
            {
              title: extractTitle(draft.caption),
              description: draft.caption,
              tags: draft.hashtags,
              videoUrl: primaryUrl,
            },
          );
          return { platform, ok: true, postId: out.platformPostId, url: out.url };
        }

        if (platform === Platform.TIKTOK) {
          if (!primaryUrl) return { platform, ok: false, error: "missing_video" };
          // TikTok's Content Posting API requires the PULL_FROM_URL
          // source to be from a verified domain (configured in TikTok's
          // developer console). Our R2 dev URLs (*.r2.dev) aren't
          // verified, so PULL_FROM_URL returns 403 url_ownership_unverified.
          //
          // Fix: download the bytes to a Buffer and use FILE_UPLOAD
          // instead — TikTok hosts the bytes itself, no domain check.
          const videoRes = await fetch(primaryUrl);
          if (!videoRes.ok) {
            return {
              platform,
              ok: false,
              error: `Failed to fetch video for TikTok upload: ${videoRes.status}`,
            };
          }
          const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
          const out = await ttPublishToInbox(accessToken, { videoBuffer });
          return {
            platform,
            ok: true,
            postId: out.publishId,
            url: undefined,
            error: "delivered_to_inbox_finish_in_app",
          };
        }

        if (platform === Platform.LINKEDIN) {
          // SocialAccount.platformUserId for LinkedIn is the bare `sub`
          // from /userinfo — liPublishText prepends `urn:li:person:`.
          // Currently text-only. If the draft has media attached we still
          // post the text body; image/video posting is a future enhancement
          // requiring the asset upload flow.
          const text = combineCaption(draft).trim();
          if (!text) {
            return { platform, ok: false, error: "missing_text" };
          }
          const out = await liPublishText(account.platformUserId, accessToken, {
            message: text,
          });
          return {
            platform,
            ok: true,
            postId: out.platformPostId,
            url: out.permalink,
            error: primaryUrl ? "media_not_yet_posted_text_only_for_now" : undefined,
          };
        }

        if (platform === Platform.FACEBOOK) {
          // For Facebook the SocialAccount.platformUserId is the FB Page id
          // and SocialAccount.accessToken is the per-page access token.
          // Text-only posts are fine — we don't require primaryUrl here.
          const isVideo = primaryUrl?.match(/\.(mp4|mov|m4v|webm)(\?|$)/i);
          const out = await fbPublish(account.platformUserId, accessToken, {
            message: combineCaption(draft),
            imageUrl: !isVideo ? primaryUrl ?? undefined : undefined,
            videoUrl: isVideo ? primaryUrl ?? undefined : undefined,
          });
          return {
            platform,
            ok: true,
            postId: out.platformPostId,
            url: out.permalink,
          };
        }

        return { platform, ok: false, error: "unsupported_platform" };
      } catch (e) {
        return { platform, ok: false, error: String((e as Error).message ?? e) };
      }
    }),
  );

  // Combine: previously-successful platforms (carried over, untouched)
  // + just-attempted platforms (this run's results). The merged array
  // describes every platform in the draft so the UI can render the
  // full picture without losing the prior wins.
  const merged: PublishResult[] = [...carryOver, ...results];
  const allOk = merged.length > 0 && merged.every((r) => r.ok);
  await prisma.draft.update({
    where: { id: draftId },
    data: {
      status: allOk ? "PUBLISHED" : "FAILED",
      publishResults: merged as unknown as object,
    },
  });

  // Insert as first-class Posts so they show up in /posts immediately.
  // Only iterate over the JUST-attempted results — carry-over platforms
  // already had their Post rows created in a previous run, so doing it
  // again would either be a no-op (upsert) or create dupes if the
  // postId differs (it won't on a true retry, but defensive).
  for (const r of results) {
    if (!r.ok || !r.postId) continue;
    const account = accounts.find((a) => a.platform === r.platform);
    if (!account) continue;
    await prisma.post.upsert({
      where: { platform_platformPostId: { platform: r.platform, platformPostId: r.postId } },
      create: {
        userId: draft.userId,
        socialAccountId: account.id,
        platform: r.platform,
        platformPostId: r.postId,
        url: r.url ?? null,
        caption: draft.caption,
        hashtags: draft.hashtags,
        mediaType: inferMediaType({ mediaUrl: primaryUrl }),
        mediaUrl: primaryUrl,
        thumbnailUrl: null,
        publishedAt: new Date(),
        status: PostStatus.PUBLISHED,
      },
      update: {},
    });
  }

  return merged;
}

function combineCaption(d: Pick<Draft, "caption" | "hashtags">) {
  if (!d.hashtags?.length) return d.caption;
  return `${d.caption}\n\n${d.hashtags.map((h) => `#${h}`).join(" ")}`;
}

function extractTitle(caption: string): string {
  const firstLine = caption.split("\n")[0]?.trim() ?? "Untitled";
  return firstLine.slice(0, 100) || "Untitled";
}

function inferMediaType(d: Pick<Draft, "mediaUrl">): MediaType {
  if (!d.mediaUrl) return MediaType.TEXT;
  if (/\.(mp4|mov|m4v|webm)$/i.test(d.mediaUrl)) return MediaType.VIDEO;
  return MediaType.IMAGE;
}
