import { prisma } from "@/lib/db";
import { calcEngagementRate, type FetchedPost } from "@/lib/platforms/base";
import { scrapeFor } from "./scrapers";

/**
 * Scrape a creator's recent posts and upsert them as CompetitorPost rows.
 * Returns the IDs of newly inserted posts (so callers can fan out enrichment).
 */
export async function scrapeAndIngest(creatorId: string): Promise<{ newIds: string[]; total: number }> {
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId } });
  const fetched = await scrapeFor(creator.platform, creator.handle, 15);

  const newIds: string[] = [];

  for (const p of fetched) {
    const existing = await prisma.competitorPost.findUnique({
      where: { platform_platformPostId: { platform: creator.platform, platformPostId: p.platformPostId } },
      select: { id: true },
    });
    if (existing) {
      // refresh metrics
      await prisma.competitorPost.update({
        where: { id: existing.id },
        data: {
          views: p.views,
          likes: p.likes,
          comments: p.comments,
          shares: p.shares ?? 0,
        },
      });
      continue;
    }
    const created = await prisma.competitorPost.create({
      data: rowFor(creatorId, creator.platform, p),
      select: { id: true },
    });
    newIds.push(created.id);
  }

  // Mark viral: > 5x creator's median view count
  await prisma.$executeRawUnsafe(
    `UPDATE competitor_posts cp
        SET "isViral" = (cp.views > COALESCE((SELECT 5 * percentile_cont(0.5) WITHIN GROUP (ORDER BY views)
                                                FROM competitor_posts WHERE "creatorId" = $1), 1e12))
      WHERE cp."creatorId" = $1`,
    creatorId,
  );

  await prisma.creator.update({
    where: { id: creatorId },
    data: { lastScrapedAt: new Date() },
  });

  return { newIds, total: fetched.length };
}

function rowFor(creatorId: string, platform: import("@prisma/client").Platform, p: FetchedPost) {
  return {
    creatorId,
    platform,
    platformPostId: p.platformPostId,
    url: p.url,
    caption: p.caption,
    hashtags: p.hashtags,
    mediaType: p.mediaType,
    mediaUrl: p.mediaUrl,
    thumbnailUrl: p.thumbnailUrl,
    durationSec: p.durationSec,
    publishedAt: p.publishedAt,
    views: p.views,
    likes: p.likes,
    comments: p.comments,
    shares: p.shares ?? 0,
    // engagementRate column lives only on Post; we omit it here
  };
}

void calcEngagementRate; // (kept for future use; prevents unused-import warning)
