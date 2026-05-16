import { prisma } from "@/lib/db";
import { embed, toPgVector } from "@/lib/ai/embed";

export type RagChunk = {
  source: "post" | "competitor" | "news";
  id: string;
  text: string;
  meta: Record<string, unknown>;
  score: number;
};

/**
 * Vector search across all knowledge sources for a given user.
 * Returns top-k chunks across post transcripts, competitor transcripts, and news.
 */
export async function ragRetrieve(input: {
  userId: string;
  query: string;
  k?: number;
}): Promise<RagChunk[]> {
  const k = input.k ?? 8;
  const vec = toPgVector(await embed(input.query));

  // Your own post transcripts
  const ownTranscripts = await prisma.$queryRawUnsafe<
    { id: string; text: string; postId: string; distance: number; caption: string | null; url: string | null; views: number; published: Date }[]
  >(`
    SELECT t.id, LEFT(t.text, 1200) AS text, t."postId" AS "postId",
           t.embedding <=> $1::vector AS distance,
           p.caption, p.url, p.views, p."publishedAt" AS published
      FROM transcripts t
      JOIN posts p ON p.id = t."postId"
     WHERE p."userId" = $2 AND t.embedding IS NOT NULL
     ORDER BY t.embedding <=> $1::vector
     LIMIT $3
  `, vec, input.userId, k);

  // Competitor transcripts
  const competitorTranscripts = await prisma.$queryRawUnsafe<
    { id: string; text: string; cpId: string; distance: number; handle: string; url: string | null; views: number; published: Date }[]
  >(`
    SELECT t.id, LEFT(t.text, 1200) AS text, t."competitorPostId" AS "cpId",
           t.embedding <=> $1::vector AS distance,
           c.handle, cp.url, cp.views, cp."publishedAt" AS published
      FROM transcripts t
      JOIN competitor_posts cp ON cp.id = t."competitorPostId"
      JOIN creators c ON c.id = cp."creatorId"
     WHERE c."userId" = $2 AND t.embedding IS NOT NULL
     ORDER BY t.embedding <=> $1::vector
     LIMIT $3
  `, vec, input.userId, k);

  // News
  const news = await prisma.$queryRawUnsafe<
    { id: string; title: string; summary: string | null; url: string; published: Date; distance: number }[]
  >(`
    SELECT id, title, summary, url, "publishedAt" AS published,
           embedding <=> $1::vector AS distance
      FROM news_items
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2
  `, vec, k);

  const chunks: RagChunk[] = [
    ...ownTranscripts.map((r) => ({
      source: "post" as const,
      id: r.postId,
      text: r.text,
      meta: { caption: r.caption, url: r.url, views: r.views, publishedAt: r.published },
      score: 1 - Number(r.distance),
    })),
    ...competitorTranscripts.map((r) => ({
      source: "competitor" as const,
      id: r.cpId,
      text: r.text,
      meta: { handle: r.handle, url: r.url, views: r.views, publishedAt: r.published },
      score: 1 - Number(r.distance),
    })),
    ...news.map((r) => ({
      source: "news" as const,
      id: r.id,
      text: `${r.title}\n${r.summary ?? ""}`,
      meta: { url: r.url, publishedAt: r.published },
      score: 1 - Number(r.distance),
    })),
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  return chunks;
}
