import { prisma } from "@/lib/db";
import { tavilySearch } from "./tavily";
import { embed, toPgVector } from "@/lib/ai/embed";

export async function ingestNicheNews(niche: string, lookbackDays = 3): Promise<number> {
  const queries = [
    `${niche} news`,
    `${niche} trends`,
    `viral ${niche}`,
    `${niche} TikTok Instagram trending`,
  ];
  let inserted = 0;
  for (const q of queries) {
    const { results } = await tavilySearch({
      query: q,
      topic: "news",
      maxResults: 6,
      days: lookbackDays,
    });
    for (const r of results) {
      const exists = await prisma.newsItem.findUnique({ where: { url: r.url } });
      if (exists) continue;
      const created = await prisma.newsItem.create({
        data: {
          url: r.url,
          title: r.title,
          source: new URL(r.url).hostname.replace(/^www\./, ""),
          publishedAt: r.publishedDate ? new Date(r.publishedDate) : new Date(),
          summary: r.content?.slice(0, 1000) ?? null,
          niche,
        },
        select: { id: true, title: true, summary: true },
      });
      try {
        const vec = await embed(`${created.title}\n\n${created.summary ?? ""}`);
        await prisma.$executeRawUnsafe(
          `UPDATE news_items SET embedding = $1::vector WHERE id = $2`,
          toPgVector(vec),
          created.id,
        );
      } catch {
        // embed errors shouldn't tank ingestion
      }
      inserted++;
    }
  }
  return inserted;
}
