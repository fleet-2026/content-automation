"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { setGuidePublished } from "@/lib/guides";
import { allPlanDays, PLAN_SOURCE } from "./plan";

/**
 * Idempotently create the 30 plan day-guides in the DB.
 *
 * Runs server-side (so it works on Vercel, which has DB access — this sandbox
 * does not). Each day becomes a DailyGuide tagged source = PLAN_SOURCE, which
 * makes it open in the standard /daily-post editor and post to social through
 * the same pipeline. Existing rows are left untouched so re-running never
 * clobbers edits the user has made.
 */
export async function setupThirtyDayPlan(): Promise<{
  ok: boolean;
  created: number;
  existing: number;
  error?: string;
}> {
  try {
    await requireUser();
  } catch {
    return { ok: false, created: 0, existing: 0, error: "unauthenticated" };
  }

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
      await prisma.dailyGuide.create({
        data: {
          slug: d.slug,
          title: d.step,
          index: d.day,
          hook: d.hook,
          // Caption seeds the written hook plus the CTA — the two text beats
          // that go straight into the post caption. Script stays empty for the
          // user to fill when they record.
          caption: `${d.caption}\n\n${d.cta}`,
          script: "",
          hashtags: [],
          manychatKeyword: d.keyword,
          // Keep the on-screen text beat with the guide so it isn't lost.
          body: `On-screen text: ${d.onScreen}`,
          videoPrompt: "",
          source: PLAN_SOURCE,
        },
      });
      created++;
    }
  } catch (e) {
    return {
      ok: false,
      created,
      existing,
      error: (e as Error).message,
    };
  }

  revalidatePath("/30-days");
  return { ok: true, created, existing };
}

/**
 * Bulk-publish to the public /guides site — scoped to the 30-day plan only,
 * so it never touches the main Daily post library. Publishes every plan guide
 * that has a non-empty script.
 */
export async function publishAllPlanReady(): Promise<{
  ok: boolean;
  published: number;
  skipped: number;
}> {
  await requireUser();

  const rows = await prisma.dailyGuide.findMany({
    where: { source: PLAN_SOURCE, isPublished: false },
    select: { slug: true, script: true },
  });

  let published = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!r.script?.trim()) {
      skipped++;
      continue;
    }
    await setGuidePublished(r.slug, true);
    published++;
  }

  revalidatePath("/30-days");
  revalidatePath("/published");
  return { ok: true, published, skipped };
}
