import { anthropic, MODELS, assertAnthropicConfigured } from "@/lib/ai/claude";
import { prisma } from "@/lib/db";
import { getTrendVelocity, getViralCompetitorPosts } from "@/lib/competitors/velocity";
import { getBestTimeToPost } from "@/lib/analytics";

export type MorningBrief = {
  generatedAt: string;
  trendingTopics: { topic: string; lift: number; recentViews: number }[];
  viralPosts: {
    handle: string;
    platform: string;
    hookText: string | null;
    views: number;
    url: string | null;
  }[];
  bestPostHourToday: number | null;
  recentNews: { title: string; url: string; source: string | null }[];
  summary: string;
};

export async function generateMorningBrief(userId: string): Promise<MorningBrief> {
  assertAnthropicConfigured();

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const niche = user?.niche ?? undefined;

  const [trends, viral, bestTime, news] = await Promise.all([
    getTrendVelocity({ niche, minPosts: 2 }),
    getViralCompetitorPosts(5),
    getBestTimeToPost(userId),
    prisma.newsItem.findMany({
      where: niche ? { niche } : {},
      orderBy: { publishedAt: "desc" },
      take: 5,
    }),
  ]);

  const bestHour = bestTime
    .filter((b) => b.avgER > 0)
    .sort((a, b) => b.avgER - a.avgER)[0]?.hour ?? null;

  const briefForLLM = `Niche: ${niche ?? "general"}

Trending topics (lift = recent7d / prior7d median views):
${trends.slice(0, 6).map((t) => `- ${t.topic} (lift ${Number(t.lift).toFixed(1)}x, ${Number(t.recent_views).toFixed(0)} median views)`).join("\n")}

Viral competitor posts last 7 days:
${viral.map((v) => `- @${v.creator.handle} (${v.platform}): "${v.hookText ?? v.caption?.slice(0, 80) ?? ""}" — ${v.views.toLocaleString()} views`).join("\n")}

News:
${news.map((n) => `- ${n.title} (${n.source ?? ""})`).join("\n")}

Best hour to post (your data): ${bestHour ?? "n/a"}h`;

  const res = await anthropic.messages.create({
    model: MODELS.default,
    max_tokens: 600,
    system: "You write a single tight paragraph (4-6 sentences) summarizing the day for a creator. Punchy, specific, no fluff. Tell them what to do today.",
    messages: [{ role: "user", content: briefForLLM }],
  });
  const summary = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();

  return {
    generatedAt: new Date().toISOString(),
    trendingTopics: trends.slice(0, 5).map((t) => ({
      topic: t.topic,
      lift: Number(t.lift),
      recentViews: Number(t.recent_views),
    })),
    viralPosts: viral.map((v) => ({
      handle: v.creator.handle,
      platform: v.platform,
      hookText: v.hookText,
      views: v.views,
      url: v.url,
    })),
    bestPostHourToday: bestHour,
    recentNews: news.map((n) => ({ title: n.title, url: n.url, source: n.source })),
    summary,
  };
}
