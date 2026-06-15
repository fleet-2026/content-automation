import { prisma } from "@/lib/db";
import { allPlanDays, planDayBySlug, PLAN_SOURCE, type PlanDay } from "./plan";

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
  return {
    slug: d.slug,
    title: d.step,
    index: d.day,
    hook: d.hook,
    // Caption seeds the written hook plus the CTA. Script stays empty for the
    // user to fill when they record.
    caption: `${d.caption}\n\n${d.cta}`,
    script: "",
    hashtags: [] as string[],
    manychatKeyword: d.keyword,
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
