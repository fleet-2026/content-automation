import { Platform, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { clientFor } from "@/lib/platforms";
import { calcEngagementRate, type FetchedPost } from "@/lib/platforms/base";

/**
 * Pull recent posts for one SocialAccount, upsert them, capture metric snapshots,
 * and snapshot the follower count. Returns a list of post IDs that were newly
 * inserted (so callers can fan out hook extraction / transcription jobs).
 */
export async function syncAccount(socialAccountId: string): Promise<{
  newPostIds: string[];
  totalSeen: number;
}> {
  const account = await prisma.socialAccount.findUniqueOrThrow({
    where: { id: socialAccountId },
  });
  if (!account.isActive) return { newPostIds: [], totalSeen: 0 };

  const client = clientFor(account);

  // Refresh tokens if needed
  if (client.refreshIfNeeded) {
    const fresh = await client.refreshIfNeeded();
    if (fresh) {
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          accessToken: encrypt(fresh.accessToken),
          refreshToken: fresh.refreshToken ? encrypt(fresh.refreshToken) : account.refreshToken,
          tokenExpiry: fresh.expiresAt ?? account.tokenExpiry,
        },
      });
    }
  }

  // Snapshot follower count
  try {
    const profile = await client.getProfile();
    if (typeof profile.followerCount === "number") {
      await prisma.followerSnapshot.create({
        data: {
          socialAccountId: account.id,
          followers: profile.followerCount,
          following: profile.followingCount ?? null,
          totalPosts: profile.postCount ?? null,
        },
      });
    }
  } catch {
    // Non-fatal; continue with posts.
  }

  const posts = await client.listRecentPosts(50);
  const newPostIds: string[] = [];

  for (const p of posts) {
    const newId = await upsertPost(account.userId, account.id, account.platform, p);
    if (newId) newPostIds.push(newId);
  }

  await prisma.socialAccount.update({
    where: { id: account.id },
    data: { lastSyncedAt: new Date(), lastError: null },
  });

  return { newPostIds, totalSeen: posts.length };
}

async function upsertPost(
  userId: string,
  socialAccountId: string,
  platform: Platform,
  fetched: FetchedPost,
): Promise<string | null> {
  const engagementRate = calcEngagementRate(
    fetched.views,
    fetched.likes,
    fetched.comments,
    fetched.shares,
    fetched.saves,
  );

  const data: Prisma.PostUncheckedCreateInput = {
    userId,
    socialAccountId,
    platform,
    platformPostId: fetched.platformPostId,
    url: fetched.url ?? null,
    caption: fetched.caption ?? null,
    hashtags: fetched.hashtags,
    mediaType: fetched.mediaType,
    mediaUrl: fetched.mediaUrl ?? null,
    thumbnailUrl: fetched.thumbnailUrl ?? null,
    durationSec: fetched.durationSec ?? null,
    publishedAt: fetched.publishedAt,
    views: fetched.views,
    likes: fetched.likes,
    comments: fetched.comments,
    shares: fetched.shares,
    saves: fetched.saves,
    reach: fetched.reach,
    impressions: fetched.impressions,
    engagementRate,
  };

  const existing = await prisma.post.findUnique({
    where: { platform_platformPostId: { platform, platformPostId: fetched.platformPostId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.post.update({
      where: { id: existing.id },
      data: {
        views: fetched.views,
        likes: fetched.likes,
        comments: fetched.comments,
        shares: fetched.shares,
        saves: fetched.saves,
        reach: fetched.reach,
        impressions: fetched.impressions,
        engagementRate,
      },
    });
    await prisma.metricSnapshot.create({
      data: {
        postId: existing.id,
        views: fetched.views,
        likes: fetched.likes,
        comments: fetched.comments,
        shares: fetched.shares,
        saves: fetched.saves,
        reach: fetched.reach,
      },
    });
    return null;
  }

  const created = await prisma.post.create({ data, select: { id: true } });
  await prisma.metricSnapshot.create({
    data: {
      postId: created.id,
      views: fetched.views,
      likes: fetched.likes,
      comments: fetched.comments,
      shares: fetched.shares,
      saves: fetched.saves,
      reach: fetched.reach,
    },
  });
  return created.id;
}
