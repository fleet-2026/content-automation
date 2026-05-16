import { Platform } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function getFollowerGrowth(userId: string, days = 60) {
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await prisma.$queryRaw<{ day: Date; followers: number }[]>`
    SELECT DATE_TRUNC('day', fs."capturedAt") AS day,
           MAX(fs.followers)::int AS followers
      FROM follower_snapshots fs
      JOIN social_accounts sa ON sa.id = fs."socialAccountId"
     WHERE sa."userId" = ${userId}
       AND fs."capturedAt" >= ${since}
     GROUP BY 1
     ORDER BY 1 ASC
  `;
  return rows.map((r) => ({
    date: new Date(r.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    followers: r.followers,
  }));
}

export async function getBestTimeToPost(userId: string, platform?: Platform) {
  const rows = platform
    ? await prisma.$queryRaw<{ hour: number; avg_er: number; n: number }[]>`
        SELECT EXTRACT(HOUR FROM "publishedAt")::int AS hour,
               AVG(COALESCE("engagementRate", 0))::float AS avg_er,
               COUNT(*)::int AS n
          FROM posts
         WHERE "userId" = ${userId} AND platform = ${platform}::"Platform"
         GROUP BY 1
         ORDER BY 1 ASC
      `
    : await prisma.$queryRaw<{ hour: number; avg_er: number; n: number }[]>`
        SELECT EXTRACT(HOUR FROM "publishedAt")::int AS hour,
               AVG(COALESCE("engagementRate", 0))::float AS avg_er,
               COUNT(*)::int AS n
          FROM posts
         WHERE "userId" = ${userId}
         GROUP BY 1
         ORDER BY 1 ASC
      `;
  // Fill missing hours
  const map = new Map(rows.map((r) => [Number(r.hour), Number(r.avg_er)]));
  return Array.from({ length: 24 }, (_, h) => ({ hour: h, avgER: map.get(h) ?? 0 }));
}

export async function getTopPosts(userId: string, limit = 12) {
  return prisma.post.findMany({
    where: { userId },
    orderBy: [{ engagementRate: "desc" }, { views: "desc" }],
    take: limit,
    select: {
      id: true,
      url: true,
      caption: true,
      hookText: true,
      thumbnailUrl: true,
      mediaType: true,
      platform: true,
      publishedAt: true,
      views: true,
      likes: true,
      comments: true,
      engagementRate: true,
    },
  });
}

export async function getRankedHooks(userId: string, limit = 50) {
  return prisma.$queryRaw<
    { id: string; text: string; pattern: string | null; uses: number; avg_er: number; best_views: number | null }[]
  >`
    SELECT h.id,
           h.text,
           h.pattern,
           COUNT(p.id)::int AS uses,
           AVG(COALESCE(p."engagementRate", 0))::float AS avg_er,
           MAX(p.views) AS best_views
      FROM hooks h
      JOIN posts p ON p."hookId" = h.id
     WHERE p."userId" = ${userId} AND h."ownerType" = 'MINE'
     GROUP BY h.id, h.text, h.pattern
     ORDER BY avg_er DESC, uses DESC
     LIMIT ${limit}
  `;
}
