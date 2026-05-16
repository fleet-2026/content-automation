"use server";

import { revalidatePath } from "next/cache";
import { Platform, DraftStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { rate } from "@/lib/post-rating";
import { fixPost, type ViralSignals, type FixVariant } from "@/lib/ai/post-fixer";
import { embed, toPgVector } from "@/lib/ai/embed";
import { getCompoundingMap } from "@/lib/compound";

/**
 * The "Fix → Viralize" flow.
 *
 * Pipeline:
 *  1. Load the user's post, recompute its rating against fresh avg ER.
 *  2. Gather viral signals from THEIR data: top hooks, viral competitor
 *     hooks in niche, concept pairs that compound.
 *  3. Ask Claude for 3 viral-tuned variants.
 *  4. Score each variant by kNN over the Hook DB (your hooks 2x weighted,
 *     niche hooks 1x) so we know which variant is most likely to perform.
 *  5. Sort variants by predicted ER, save as a Draft with all 3 as
 *     selectable hookOptions, return the draftId.
 *
 * The UI navigates to /compose?draft=<id> so the user lands directly in
 * publish-ready state — pick a variant, tweak, schedule, ship.
 */

const TOP_HOOKS_LIMIT = 5;
const NICHE_VIRAL_LIMIT = 5;
const CONCEPT_PAIRS_LIMIT = 3;

async function gatherViralSignals(userId: string, niche: string | null | undefined): Promise<ViralSignals> {
  // 1) Your top-performing hooks (MINE only, sorted by avg ER)
  const myTopRows = await prisma.$queryRaw<
    { text: string; avg_er: number | null }[]
  >`
    SELECT h.text, h."avgEngagementRate" AS avg_er
      FROM hooks h
     WHERE h."ownerType" = 'MINE' AND h."avgEngagementRate" IS NOT NULL
     ORDER BY h."avgEngagementRate" DESC
     LIMIT ${TOP_HOOKS_LIMIT}
  `;
  const myTopHooks = myTopRows.map((r) => ({
    text: r.text,
    avgER: r.avg_er ? Number(r.avg_er) : null,
  }));

  // 2) Viral competitor posts in the user's niche — top-viewed
  const nicheViralPosts = niche
    ? await prisma.competitorPost.findMany({
        where: {
          isViral: true,
          hookText: { not: null },
          creator: { niche },
        },
        orderBy: { views: "desc" },
        take: NICHE_VIRAL_LIMIT,
        select: { hookText: true, views: true },
      })
    : await prisma.competitorPost.findMany({
        where: { isViral: true, hookText: { not: null } },
        orderBy: { views: "desc" },
        take: NICHE_VIRAL_LIMIT,
        select: { hookText: true, views: true },
      });
  const nicheViralHooks = nicheViralPosts
    .filter((p) => !!p.hookText?.trim())
    .map((p) => ({ text: p.hookText as string, views: p.views }));

  // 3) Concept pairs that compound for this user (minLift=1 → only over-performers)
  const conceptPairs = await getCompoundingMap(userId, 1)
    .then((rows) =>
      rows
        .slice(0, CONCEPT_PAIRS_LIMIT)
        .map((c) => ({ a: c.a, b: c.b, lift: c.lift })),
    )
    .catch(() => []);

  return { myTopHooks, nicheViralHooks, conceptPairs };
}

/**
 * Score a candidate hook by kNN distance over the Hook DB. Higher = more
 * similar to high-performing hooks. Returns null if no labeled neighbors
 * exist (cold start).
 */
async function predictER(hookText: string): Promise<{ predictedER: number | null; similarHookIds: string[] }> {
  try {
    const vec = await embed(hookText);
    const neighbors = await prisma.$queryRawUnsafe<
      { id: string; distance: number; avg_er: number | null; weight: number }[]
    >(
      `SELECT h.id,
              h.embedding <=> $1::vector AS distance,
              h."avgEngagementRate" AS avg_er,
              CASE WHEN h."ownerType" = 'MINE' THEN 2.0 ELSE 1.0 END AS weight
         FROM hooks h
        WHERE h."avgEngagementRate" IS NOT NULL
        ORDER BY h.embedding <=> $1::vector
        LIMIT 6`,
      toPgVector(vec),
    );

    if (!neighbors.length) return { predictedER: null, similarHookIds: [] };

    const totalW = neighbors.reduce((s, n) => s + Number(n.weight), 0);
    const predictedER =
      neighbors.reduce(
        (s, n) => s + Number(n.weight) * Number(n.avg_er ?? 0),
        0,
      ) / Math.max(totalW, 0.001);

    return {
      predictedER,
      similarHookIds: neighbors.map((n) => n.id),
    };
  } catch {
    return { predictedER: null, similarHookIds: [] };
  }
}

export async function fixLowRatedPost(postId: string): Promise<{ draftId: string }> {
  const userId = await requireUser();

  // Two-layer rate limit:
  //   1. Hard cap on Viralize spend per user (~$0.06/call × 5/hr = $0.30/hr max).
  //   2. Idempotency lock: same (user, post) can only fix once per 60s. Stops
  //      double-clicks / fast back-button bounces from creating duplicate drafts.
  await enforceRateLimit(`postfix:${userId}`, { ...RATE_LIMITS.POST_FIX, label: "post fixer" });
  await enforceRateLimit(
    `postfix:${userId}:${postId}`,
    { ...RATE_LIMITS.POST_FIX_SAME, label: "same post (60s lock)" },
  );

  // ─── Load post + verify ownership ─────────────────────────
  const post = await prisma.post.findFirst({
    where: { id: postId, userId },
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
  });
  if (!post) throw new Error("Post not found.");
  if (!post.caption?.trim()) throw new Error("Post has no caption to fix.");

  // ─── Compute fresh rating ────────────────────────────────
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const avg = await prisma.post.aggregate({
    where: { userId, publishedAt: { gte: sixtyDaysAgo }, engagementRate: { not: null } },
    _avg: { engagementRate: true },
  });
  const userAvgER = avg._avg.engagementRate ?? 0;
  const rating = rate(post, userAvgER);

  // ─── Gather user context (niche + viral signals) ─────────
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { niche: true },
  });
  const signals = await gatherViralSignals(userId, user?.niche);

  // ─── Generate 3 variants ──────────────────────────────────
  // Vercel Hobby caps server actions at 60s. We're already ~1s in (Prisma
  // queries above) and still need to do 3× kNN after Claude returns. Abort
  // the Claude call at 50s so the surrounding code has time to record a
  // FAILED state and surface a clean error instead of a 504.
  const ctrl = new AbortController();
  const abortTimer = setTimeout(() => ctrl.abort(), 50_000);

  let variants;
  try {
    variants = await fixPost({
      originalCaption: post.caption,
      originalHook: post.hookText,
      niche: user?.niche,
      platform: post.platform,
      rating,
      signals,
      signal: ctrl.signal,
    });
  } catch (e) {
    if (ctrl.signal.aborted) {
      throw new Error(
        "Viralize timed out at ~50s (Vercel function limit). Try again — Claude is sometimes slow on cold starts.",
      );
    }
    throw e;
  } finally {
    clearTimeout(abortTimer);
  }
  if (variants.length === 0) {
    throw new Error("Post fixer returned no variants.");
  }

  // ─── Score each variant via kNN over Hook DB ─────────────
  const scored = await Promise.all(
    variants.map(async (v: FixVariant) => {
      const pred = v.hook ? await predictER(v.hook) : { predictedER: null, similarHookIds: [] };
      return { variant: v, ...pred };
    }),
  );

  // Sort by predicted ER desc (nulls last)
  scored.sort((a, b) => {
    if (a.predictedER == null && b.predictedER == null) return 0;
    if (a.predictedER == null) return 1;
    if (b.predictedER == null) return -1;
    return b.predictedER - a.predictedER;
  });

  const best = scored[0].variant;

  // hookOptions shape matches Composer's `Hook` type so /compose can render them
  const hookOptions = scored.map((s) => ({
    text: s.variant.hook,
    pattern: s.variant.pattern || null,
    predictedER: s.predictedER,
    similarHookIds: s.similarHookIds,
    reasoning: s.variant.rationale,
  }));

  // ─── Persist as Draft with full hook options ─────────────
  const platforms: Platform[] = [post.platform as Platform];
  const draft = await prisma.draft.create({
    data: {
      userId,
      caption: best.caption || `${best.hook}\n\n${best.cta}`,
      hashtags: best.hashtags,
      selectedHook: best.hook,
      hookOptions: hookOptions as unknown as object,
      mediaUrl: post.thumbnailUrl,
      platforms,
      status: DraftStatus.DRAFT,
    },
  });

  revalidatePath("/drafts");
  revalidatePath("/dashboard");
  return { draftId: draft.id };
}
