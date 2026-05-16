import { Platform, PostStatus, MediaType, type Draft } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { igPublish } from "@/lib/platforms/instagram-publish";
import { ytPublish } from "@/lib/platforms/youtube-publish";
import { ttPublishToInbox } from "@/lib/platforms/tiktok-publish";

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
          const isVideo = draft.mediaUrl?.match(/\.(mp4|mov|m4v)$/i);
          const out = await igPublish(account.platformUserId, accessToken, {
            caption: combineCaption(draft),
            videoUrl: isVideo ? draft.mediaUrl ?? undefined : undefined,
            imageUrl: !isVideo ? draft.mediaUrl ?? undefined : undefined,
            isReel: !!isVideo,
          });
          return { platform, ok: true, postId: out.platformPostId, url: out.permalink };
        }

        if (platform === Platform.YOUTUBE) {
          if (!draft.mediaUrl) return { platform, ok: false, error: "missing_video" };
          const out = await ytPublish(
            { accessToken, refreshToken, expiresAt: account.tokenExpiry },
            {
              title: extractTitle(draft.caption),
              description: draft.caption,
              tags: draft.hashtags,
              videoUrl: draft.mediaUrl,
            },
          );
          return { platform, ok: true, postId: out.platformPostId, url: out.url };
        }

        if (platform === Platform.TIKTOK) {
          if (!draft.mediaUrl) return { platform, ok: false, error: "missing_video" };
          const out = await ttPublishToInbox(accessToken, { videoUrl: draft.mediaUrl });
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
        mediaType: inferMediaType(draft),
        mediaUrl: draft.mediaUrl ?? null,
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
