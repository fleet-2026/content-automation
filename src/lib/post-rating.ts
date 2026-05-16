import { prisma } from "@/lib/db";

/**
 * Post rating — 0-100 score for one of the user's published posts.
 *
 * Scoring is a weighted composite of:
 *  1. Performance vs YOUR average (60% weight) — engagement rate relative to
 *     your own baseline, not some global benchmark
 *  2. Hook quality (15%) — does it have a hook? Is it the right length?
 *  3. Caption craft (15%) — sane length, includes a CTA, well-formatted
 *  4. Discoverability (10%) — uses hashtags
 *
 * Result < 50 = "Fix this" candidate. 50-75 = average. 75+ = top tier.
 */

export type PostScore = {
  score: number;            // 0..100
  band: "low" | "average" | "good" | "viral";
  reasons: string[];        // human-readable factors that affected score
  fixable: boolean;         // worth running "Fix" on (low + has caption)
  breakdown: {
    performance: number;    // 0..60
    hook: number;           // 0..15
    caption: number;        // 0..15
    discoverability: number; // 0..10
  };
};

export type RatablePost = {
  id: string;
  caption: string | null;
  hookText: string | null;
  hashtags: string[];
  engagementRate: number | null;
  views: number;
  likes: number;
  comments: number;
  publishedAt: Date;
  mediaType: string;
  platform: string;
  thumbnailUrl: string | null;
  url: string | null;
};

export function rate(post: RatablePost, userAvgER: number): PostScore {
  const reasons: string[] = [];

  // ─── 1. Performance vs YOUR average (0..60) ────────────────
  let perf = 30; // neutral baseline when ER unknown
  if (post.engagementRate != null && userAvgER > 0) {
    const ratio = post.engagementRate / userAvgER;
    // Map ratio → 0..60:
    //   ratio = 0   → 0    (no engagement)
    //   ratio = 0.5 → 15   (half your avg)
    //   ratio = 1   → 30   (matches avg)
    //   ratio = 2   → 60   (2x avg — top performer)
    //   ratio = 3+  → 60   (capped)
    perf = Math.min(60, Math.round(ratio * 30));
    if (ratio >= 2) reasons.push(`${ratio.toFixed(1)}× your average engagement`);
    else if (ratio >= 1.2) reasons.push("above your average engagement");
    else if (ratio < 0.5) reasons.push("under half your average engagement");
    else if (ratio < 0.8) reasons.push("below your average engagement");
  } else if (post.engagementRate == null) {
    reasons.push("no engagement rate data yet");
  }

  // ─── 2. Hook quality (0..15) ────────────────────────────
  let hook = 0;
  if (post.hookText && post.hookText.trim().length > 0) {
    const wordCount = post.hookText.trim().split(/\s+/).length;
    if (wordCount >= 6 && wordCount <= 14) {
      hook = 15;
    } else if (wordCount < 6) {
      hook = 8;
      reasons.push("hook is too short");
    } else {
      hook = 8;
      reasons.push("hook is too long (>14 words)");
    }
  } else {
    reasons.push("no clear hook extracted");
  }

  // ─── 3. Caption craft (0..15) ──────────────────────────
  let caption = 0;
  const text = post.caption ?? "";
  const len = text.length;
  if (len > 0) {
    // Length sweet spot varies by platform but generally 80-1500 chars works
    if (len >= 80 && len <= 1500) caption += 8;
    else if (len < 80) {
      caption += 3;
      reasons.push("caption is very short");
    } else {
      caption += 4;
      reasons.push("caption is very long (>1500 chars)");
    }
    // CTA detection — simple heuristic
    const hasCta = /\b(comment|tap|click|follow|save|share|dm|link in bio|swipe|try|join|sign up|subscribe|let me know|drop)\b/i.test(
      text,
    );
    if (hasCta) caption += 7;
    else reasons.push("no clear call-to-action");
  } else {
    reasons.push("no caption");
  }

  // ─── 4. Discoverability (0..10) ─────────────────────────
  let discoverability = 0;
  if (post.hashtags.length === 0) {
    reasons.push("no hashtags");
  } else if (post.hashtags.length <= 3) {
    discoverability = 4;
    reasons.push("few hashtags (<=3)");
  } else if (post.hashtags.length <= 10) {
    discoverability = 10;
  } else if (post.hashtags.length <= 20) {
    discoverability = 8;
  } else {
    discoverability = 5;
    reasons.push("hashtag spam (20+)");
  }

  const score = Math.max(0, Math.min(100, perf + hook + caption + discoverability));
  const band: PostScore["band"] =
    score < 50 ? "low" : score < 75 ? "average" : score < 90 ? "good" : "viral";
  const fixable = band === "low" && !!post.caption;

  return {
    score,
    band,
    reasons,
    fixable,
    breakdown: { performance: perf, hook, caption, discoverability },
  };
}

/**
 * Compute user's average engagement rate from their last 60 days of posts.
 * Returns 0 if no posts have engagement data.
 */
async function getUserAvgER(userId: string): Promise<number> {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const agg = await prisma.post.aggregate({
    where: {
      userId,
      publishedAt: { gte: sixtyDaysAgo },
      engagementRate: { not: null },
    },
    _avg: { engagementRate: true },
  });
  return agg._avg.engagementRate ?? 0;
}

/**
 * Pull the user's last N posts + rate each. Returns sorted with the worst
 * (most-fixable) first by default, so the dashboard naturally surfaces them.
 */
export async function ratePosts(
  userId: string,
  opts: { limit?: number; sort?: "worst-first" | "recent" } = {},
): Promise<(RatablePost & { rating: PostScore })[]> {
  const limit = opts.limit ?? 10;
  const sort = opts.sort ?? "worst-first";

  const [avgER, posts] = await Promise.all([
    getUserAvgER(userId),
    prisma.post.findMany({
      where: { userId },
      orderBy: { publishedAt: "desc" },
      take: 30, // grab a wider window, we'll trim after rating
      select: {
        id: true,
        caption: true,
        hookText: true,
        hashtags: true,
        engagementRate: true,
        views: true,
        likes: true,
        comments: true,
        publishedAt: true,
        mediaType: true,
        platform: true,
        thumbnailUrl: true,
        url: true,
      },
    }),
  ]);

  const rated = posts.map((p) => ({ ...p, rating: rate(p, avgER) }));

  if (sort === "worst-first") {
    rated.sort((a, b) => a.rating.score - b.rating.score);
  }
  return rated.slice(0, limit);
}
