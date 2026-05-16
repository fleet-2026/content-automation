import { prisma } from "@/lib/db";

/**
 * Content compounding map — which concept-pairs perform best for the user.
 * For each concept tag pair (A, B), compute average engagement across posts
 * that have BOTH tags, vs. the user's overall average.
 */
export async function getCompoundingMap(userId: string, minPosts = 2) {
  return prisma.$queryRawUnsafe<
    {
      a: string;
      b: string;
      n: number;
      avg_er: number;
      lift: number;
    }[]
  >(
    `WITH base AS (
       SELECT id, "conceptTags", COALESCE("engagementRate", 0) AS er
         FROM posts
        WHERE "userId" = $1 AND array_length("conceptTags", 1) >= 2
     ),
     overall AS (
       SELECT AVG(COALESCE("engagementRate", 0))::float AS avg_er
         FROM posts WHERE "userId" = $1
     ),
     pairs AS (
       SELECT LEAST(a, b) AS a, GREATEST(a, b) AS b, er
         FROM base, UNNEST("conceptTags") AS a, UNNEST("conceptTags") AS b
        WHERE a < b
     )
     SELECT a, b,
            COUNT(*)::int AS n,
            AVG(er)::float AS avg_er,
            CASE WHEN (SELECT avg_er FROM overall) > 0
                 THEN AVG(er) / (SELECT avg_er FROM overall)
                 ELSE 0 END AS lift
       FROM pairs
       GROUP BY a, b
       HAVING COUNT(*) >= $2
       ORDER BY lift DESC
       LIMIT 20`,
    userId,
    minPosts,
  );
}
