"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { setGuidePublished } from "@/lib/guides";
import { PLAN_SOURCE } from "./plan";
import { seedAllPlanGuides } from "./seed";

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

  const { created, existing, error } = await seedAllPlanGuides();
  if (error) return { ok: false, created, existing, error };

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
