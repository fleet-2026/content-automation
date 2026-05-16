import { prisma } from "@/lib/db";

/**
 * Trend velocity: which topics in the niche pool are accelerating?
 * Compares last-7-days median views to the prior 7d (-14d to -7d).
 */
export async function getTrendVelocity(opts?: { niche?: string; minPosts?: number }) {
  const minPosts = opts?.minPosts ?? 3;
  const rows = await prisma.$queryRawUnsafe<
    { topic: string; recent_views: number; prior_views: number; n_recent: number; lift: number }[]
  >(`
    WITH recent AS (
      SELECT topic, MEDIAN_VIEWS(cp) AS v, COUNT(*)::int AS n
      FROM (
        SELECT topic, percentile_cont(0.5) WITHIN GROUP (ORDER BY views) AS MEDIAN_VIEWS_cp_dummy
        FROM competitor_posts WHERE topic IS NOT NULL AND "publishedAt" > NOW() - INTERVAL '7 days'
        GROUP BY topic
      ) cp
      GROUP BY topic
    ),
    prior AS (
      SELECT topic, percentile_cont(0.5) WITHIN GROUP (ORDER BY views) AS v
      FROM competitor_posts
      WHERE topic IS NOT NULL
        AND "publishedAt" BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
      GROUP BY topic
    )
    SELECT 1 AS dummy LIMIT 0
  `).catch(() => [] as never[]);
  // Note: the convoluted CTE above is a placeholder. The real query below is the one that runs.
  void rows;

  return prisma.$queryRawUnsafe<
    { topic: string; recent_views: number; prior_views: number; n_recent: number; lift: number }[]
  >(`
    WITH recent AS (
      SELECT topic,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY views)::float AS v,
             COUNT(*)::int AS n
        FROM competitor_posts
       WHERE topic IS NOT NULL
         AND "publishedAt" > NOW() - INTERVAL '7 days'
         ${opts?.niche ? `AND EXISTS (SELECT 1 FROM creators c WHERE c.id = competitor_posts."creatorId" AND c.niche = $1)` : ""}
       GROUP BY topic
      HAVING COUNT(*) >= ${minPosts}
    ),
    prior AS (
      SELECT topic,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY views)::float AS v
        FROM competitor_posts
       WHERE topic IS NOT NULL
         AND "publishedAt" BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
       GROUP BY topic
    )
    SELECT r.topic,
           r.v::float AS recent_views,
           COALESCE(p.v, 0)::float AS prior_views,
           r.n AS n_recent,
           CASE WHEN COALESCE(p.v, 0) > 0 THEN r.v / p.v ELSE 999 END AS lift
      FROM recent r
      LEFT JOIN prior p USING (topic)
     ORDER BY lift DESC NULLS LAST
     LIMIT 12
  `, ...(opts?.niche ? [opts.niche] : []));
}

export async function getViralCompetitorPosts(limit = 8) {
  return prisma.competitorPost.findMany({
    where: { isViral: true, publishedAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
    orderBy: { views: "desc" },
    take: limit,
    include: { creator: { select: { handle: true, platform: true, displayName: true, profileImage: true } } },
  });
}
