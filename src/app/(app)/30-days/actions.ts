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
 * Create a blank CUSTOM day on the 30-day page — a DailyGuide tagged
 * source = PLAN_SOURCE whose slug is NOT one of the predefined plan slugs. It
 * appears in the "Your own posts" section of /30-days and opens in the standard
 * editor (hook, script, caption, ManyChat wiring, rating, publish). Returns the
 * new slug so the client can navigate straight into the editor to fill it in.
 */
export async function createCustomPlanDay(): Promise<{
  ok: boolean;
  slug?: string;
  error?: string;
}> {
  try {
    await requireUser();
  } catch {
    return { ok: false, error: "unauthenticated" };
  }
  // URL-safe slug — getPost() sanitizes to [a-z0-9_-], so keep to that set.
  const slug = `custom-${Date.now().toString(36)}`;
  // Sort custom posts after the 30 predefined days.
  const top = await prisma.dailyGuide.aggregate({
    where: { source: PLAN_SOURCE },
    _max: { index: true },
  });
  const index = Math.max(top._max.index ?? 0, 30) + 1;
  try {
    await prisma.dailyGuide.create({
      data: {
        slug,
        title: "Untitled post",
        index,
        hook: "",
        script: "",
        caption: "",
        manychatKeyword: "",
        source: PLAN_SOURCE,
      },
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/30-days");
  return { ok: true, slug };
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
