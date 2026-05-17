import { Platform, PostStatus, MediaType, type Draft } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { igPublish } from "@/lib/platforms/instagram-publish";
import { ytPublish } from "@/lib/platforms/youtube-publish";
import { ttPublishToInbox } from "@/lib/platforms/tiktok-publish";
import { primaryMediaUrl } from "@/lib/media-urls";

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
  const accounts = await prisma.socialAccount.findMany({
    where: {
      userId: draft.userId,
      platform: { in: draft.platforms },
      isActive: true,
    },
  });

  const results = await Promise.all(
    draft.platforms.map(async (platform): Promise<PublishResult> => {
      const account = accounts.find((a) => a.platform === platform);
      if (!account) {
        return { platform, ok: false, error: "no_connected_account" };
      }
      try {
        const accessToken = decrypt(account.accessToken);
        const refreshToken = account.refreshToken ? decrypt(account.refreshToken) : null;

        if (platform === Platform.INSTAGRAM) {
          const isVideo = primaryUrl?.match(/\.(mp4|mov|m4v)(\?|$)/i);
          const out = await igPublish(account.platformUserId, accessToken, {
            caption: combineCaption(draft),
            videoUrl: isVideo ? primaryUrl ?? undefined : undefined,
            imageUrl: !isVideo ? primaryUrl ?? undefined : undefined,
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
          const out = await ttPublishToInbox(accessToken, { videoUrl: primaryUrl });
          return {
            platform,
            ok: true,
            postId: out.publishId,
            url: undefined,
            error: "delivered_to_inbox_finish_in_app",
          };
        }

        return { platform, ok: false, error: "unsupported_platform" };
      } catch (e) {
        return { platform, ok: false, error: String((e as Error).message ?? e) };
      }
    }),
  );

  const allOk = results.every((r) => r.ok);
  await prisma.draft.update({
    where: { id: draftId },
    data: {
      status: allOk ? "PUBLISHED" : "FAILED",
      publishResults: results as unknown as object,
    },
  });

  // Insert as first-class Posts so they show up in /posts immediately.
  // Store the PRIMARY URL on Post.mediaUrl so single-URL renderers (analytics,
  // post grids) keep working; the rest of the carousel lives only on the
  // originating Draft until we have a proper schema for multi-media Posts.
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

  return results;
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
