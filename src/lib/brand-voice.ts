import { prisma } from "@/lib/db";
import { embed, toPgVector } from "@/lib/ai/embed";

export type VoiceSample = {
  id: string;
  text: string;
  createdAt: Date;
};

/**
 * Add a writing sample to the user's brand voice memory.
 * Embeds via OpenAI text-embedding-3-small (1536 dims) and stores in pgvector.
 */
export async function addVoiceSample(userId: string, text: string): Promise<{ id: string }> {
  const trimmed = text.trim();
  if (trimmed.length < 30) throw new Error("Sample must be at least 30 characters");
  if (trimmed.length > 2000) throw new Error("Sample must be at most 2000 characters");

  const created = await prisma.brandVoiceSample.create({
    data: { userId, text: trimmed },
    select: { id: true },
  });

  const vec = await embed(trimmed);
  await prisma.$executeRawUnsafe(
    `UPDATE brand_voice_samples SET embedding = $1::vector WHERE id = $2`,
    toPgVector(vec),
    created.id,
  );
  return created;
}

/**
 * Top-K voice samples most similar to a query.
 * Used by the drafter to pull voice context that matches the topic.
 */
export async function getSimilarVoiceSamples(
  userId: string,
  query: string,
  k = 5,
): Promise<VoiceSample[]> {
  if (!query.trim()) return listVoiceSamples(userId, k);
  const vec = await embed(query.slice(0, 4000));
  const rows = await prisma.$queryRawUnsafe<
    { id: string; text: string; created_at: Date; distance: number }[]
  >(
    `SELECT id, text, "createdAt" AS created_at, embedding <=> $1::vector AS distance
       FROM brand_voice_samples
      WHERE "userId" = $2 AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $3`,
    toPgVector(vec),
    userId,
    Math.min(Math.max(k, 1), 10),
  );
  return rows.map((r) => ({ id: r.id, text: r.text, createdAt: r.created_at }));
}

export async function listVoiceSamples(userId: string, limit = 50): Promise<VoiceSample[]> {
  const rows = await prisma.brandVoiceSample.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, text: true, createdAt: true },
  });
  return rows;
}

export async function deleteVoiceSample(userId: string, id: string): Promise<{ ok: boolean }> {
  const r = await prisma.brandVoiceSample.deleteMany({ where: { id, userId } });
  return { ok: r.count > 0 };
}
