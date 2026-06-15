import { prisma } from "@/lib/db";
import { allPlanDays, planDayBySlug, PLAN_SOURCE, type PlanDay } from "./plan";
import { PLAN_CONTENT } from "./content";

/**
 * Server-side seeding for the 30-day plan. Each plan day maps to one
 * DailyGuide row (source = PLAN_SOURCE) so it opens in the standard
 * /daily-post editor and posts through the same social pipeline.
 *
 * These run on the server (Vercel has DB access; the dev sandbox does not).
 * Creation is idempotent — existing rows are never overwritten, so user edits
 * survive re-seeding.
 */

function seedData(d: PlanDay) {
  const c = PLAN_CONTENT[d.slug];
  return {
    slug: d.slug,
    title: d.step,
    index: d.day,
    hook: d.hook,
    // Pre-fill the finished caption + talking-head script + hashtags so the day
    // is postable immediately. Falls back to the brief if content is missing.
    caption: c?.caption ?? `${d.caption}\n\n${d.cta}`,
    script: c?.script ?? "",
    hashtags: c?.hashtags ?? ([] as string[]),
    manychatKeyword: d.keyword,
    // The DM auto-reply sent when someone comments the keyword.
    responseText: c?.dmReply ?? "",
    // Keep the on-screen text beat with the guide so it isn't lost.
    body: `On-screen text: ${d.onScreen}`,
    videoPrompt: "",
    source: PLAN_SOURCE,
  };
}

/** Ensure a single plan day's guide row exists. Returns true if the slug is a
 *  known plan day (and the row now exists), false if it isn't a plan slug. */
export async function ensurePlanGuide(slug: string): Promise<boolean> {
  const d = planDayBySlug(slug);
  if (!d) return false;
  const existing = await prisma.dailyGuide.findUnique({
    where: { slug: d.slug },
    select: { id: true },
  });
  if (existing) return true;
  try {
    await prisma.dailyGuide.create({ data: seedData(d) });
  } catch {
    // A concurrent open may have created it between the check and create —
    // treat a unique-constraint race as success.
    const now = await prisma.dailyGuide.findUnique({
      where: { slug: d.slug },
      select: { id: true },
    });
    if (!now) return false;
  }
  return true;
}

/** Create every missing plan day-guide. Never throws — returns counts so the
 *  caller can report progress. */
export async function seedAllPlanGuides(): Promise<{
  created: number;
  existing: number;
  error?: string;
}> {
  let created = 0;
  let existing = 0;
  try {
    for (const d of allPlanDays()) {
      const found = await prisma.dailyGuide.findUnique({
        where: { slug: d.slug },
        select: { id: true },
      });
      if (found) {
        existing++;
        continue;
      }
      await prisma.dailyGuide.create({ data: seedData(d) });
      created++;
    }
  } catch (e) {
    return { created, existing, error: (e as Error).message };
  }
  return { created, existing };
}

/**
 * Backfill the finished content (script, caption, hashtags, DM reply) into plan
 * rows that were created before the content existed. Only touches rows whose
 * script is still empty — the signal that a day hasn't been written or edited
 * yet — so anything the user has already recorded or rewritten is preserved.
 * Never throws; returns how many rows were filled.
 */
export async function backfillPlanContent(): Promise<{ filled: number; error?: string }> {
  let filled = 0;
  try {
    // Cheap after the first pass: only un-written plan rows come back.
    const rows = await prisma.dailyGuide.findMany({
      where: { source: PLAN_SOURCE, script: "" },
      select: { id: true, slug: true },
    });
    for (const r of rows) {
      const c = PLAN_CONTENT[r.slug];
      if (!c) continue;
      await prisma.dailyGuide.update({
        where: { id: r.id },
        data: {
          script: c.script,
          caption: c.caption,
          hashtags: c.hashtags,
          responseText: c.dmReply,
        },
      });
      filled++;
    }
  } catch (e) {
    return { filled, error: (e as Error).message };
  }
  return { filled };
}
