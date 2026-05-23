"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { savePost, type GeneratedFields } from "./data";
import {
  listAllGuidesAdmin,
  setGuidePublished,
  updateGuide,
} from "@/lib/guides";
import { generateVideoPromptText } from "@/lib/ai/video-prompt";
import { rateHookForVirality, type HookRating } from "@/lib/ai/rate-hook";
import { requireUser } from "@/lib/auth-helpers";
import { rateLimit } from "@/lib/rate-limit";

export async function updatePost(
  slug: string,
  patch: Partial<GeneratedFields> & { body?: string },
) {
  // Normalize hashtags if provided as a string
  let p: Partial<GeneratedFields> & { body?: string } = { ...patch };
  if (typeof (patch as unknown as { hashtagsRaw?: string }).hashtagsRaw === "string") {
    const raw = (patch as unknown as { hashtagsRaw: string }).hashtagsRaw;
    p.hashtags = raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s.startsWith("#") ? s : "#" + s));
    delete (p as unknown as { hashtagsRaw?: string }).hashtagsRaw;
  }
  const ok = await savePost(slug, p);
  revalidatePath(`/daily-post/${slug}`);
  revalidatePath(`/daily-post`);
  // Also revalidate the public page so body edits on a published guide
  // show up without waiting for the 5-min ISR cache to expire.
  revalidatePath(`/guides/${slug}`);
  return { ok };
}

/** Single-guide publish/unpublish — used by the per-post editor toggle. */
export async function setPublished(slug: string, published: boolean) {
  const ok = await setGuidePublished(slug, published);
  revalidatePath(`/daily-post/${slug}`);
  revalidatePath(`/daily-post`);
  revalidatePath(`/guides`);
  revalidatePath(`/guides/${slug}`);
  revalidatePath(`/sitemap.xml`);
  return { ok };
}

/** Bulk publish — flips every guide with a non-empty script to isPublished=true.
 *  Skips rows that are missing the script field (still placeholder content)
 *  so the public site doesn't show empty cards. */
export async function publishAllReady() {
  const all = await listAllGuidesAdmin();
  let published = 0;
  let skipped = 0;
  for (const g of all) {
    if (g.isPublished) continue;
    if (!g.script || !g.script.trim()) {
      skipped++;
      continue;
    }
    await setGuidePublished(g.slug, true);
    published++;
  }
  revalidatePath(`/daily-post`);
  revalidatePath(`/guides`);
  revalidatePath(`/sitemap.xml`);
  return { ok: true, published, skipped };
}

/** Generate a SCENES + VOICEOVER + CAPTIONS video brief for the guide
 *  by feeding its title + hook + script + body + caption to Claude.
 *  Saves the result to DailyGuide.videoPrompt and returns it so the
 *  client can show the new text without a page reload.
 *
 *  Gates: auth (admin user) + 20 generations/hour per user (Claude calls
 *  aren't free). */
export async function generateVideoPrompt(slug: string): Promise<{
  ok: boolean;
  text?: string;
  error?: string;
}> {
  let userId: string;
  try {
    userId = await requireUser();
  } catch {
    return { ok: false, error: "unauthenticated" };
  }

  const rl = await rateLimit(`video-prompt:${userId}`, {
    max: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Rate limit hit — try again in ${rl.retryAfterSec}s`,
    };
  }

  const guide = await prisma.dailyGuide.findUnique({
    where: { slug },
    select: {
      title: true,
      hook: true,
      script: true,
      caption: true,
      body: true,
    },
  });
  if (!guide) return { ok: false, error: "guide_not_found" };
  if (!guide.script.trim() && !guide.hook.trim()) {
    return {
      ok: false,
      error: "Guide has no script or hook to derive a brief from",
    };
  }

  try {
    const text = await generateVideoPromptText({
      title: guide.title,
      hook: guide.hook,
      script: guide.script,
      caption: guide.caption,
      body: guide.body,
    });
    await prisma.dailyGuide.update({
      where: { slug },
      data: { videoPrompt: text },
    });
    revalidatePath(`/daily-post/${slug}`);
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Rate the guide's hook for virality and return rewrites the admin
 *  can swap in if the score is weak. No DB persistence — this is a
 *  pure analysis tool, called on-demand from the "Rate this post"
 *  button in the editor. */
export async function rateHook(slug: string): Promise<{
  ok: boolean;
  rating?: HookRating;
  error?: string;
}> {
  let userId: string;
  try {
    userId = await requireUser();
  } catch {
    return { ok: false, error: "unauthenticated" };
  }
  const rl = await rateLimit(`rate-hook:${userId}`, {
    max: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Rate limit hit — try again in ${rl.retryAfterSec}s`,
    };
  }
  const guide = await prisma.dailyGuide.findUnique({
    where: { slug },
    select: { title: true, hook: true, script: true, caption: true },
  });
  if (!guide) return { ok: false, error: "guide_not_found" };
  if (!guide.hook.trim()) {
    return { ok: false, error: "No hook to rate — fill in the Hook field first" };
  }
  try {
    const rating = await rateHookForVirality({
      title: guide.title,
      hook: guide.hook,
      script: guide.script,
      caption: guide.caption,
    });
    return { ok: true, rating };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Replace the guide's hook (one-click "Use this rewrite" from the
 *  rating panel). Saves to DailyGuide.hook + revalidates. */
export async function replaceHook(slug: string, newHook: string) {
  try {
    await requireUser();
  } catch {
    return { ok: false };
  }
  if (!newHook.trim()) return { ok: false };
  const ok = await updateGuide(slug, { hook: newHook.trim() });
  revalidatePath(`/daily-post/${slug}`);
  revalidatePath(`/guides/${slug}`);
  return { ok };
}

/** Manual save for the video-prompt textarea (after the admin edits the
 *  AI-generated brief). */
export async function saveVideoPrompt(slug: string, text: string) {
  try {
    await requireUser();
  } catch {
    return { ok: false };
  }
  const ok = await updateGuide(slug, { videoPrompt: text });
  revalidatePath(`/daily-post/${slug}`);
  return { ok };
}

/** Save media URLs for a guide. Either videoUrl, imageUrls, or both.
 *  Used by the post-editor's media upload section after /api/upload
 *  returns an R2 URL. */
export async function setMedia(
  slug: string,
  patch: { videoUrl?: string | null; imageUrls?: string[] },
) {
  const ok = await updateGuide(slug, patch);
  revalidatePath(`/daily-post/${slug}`);
  revalidatePath(`/daily-post`);
  revalidatePath(`/guides/${slug}`);
  return { ok };
}

/** Bulk unpublish — flips every published guide back to draft. */
export async function unpublishAll() {
  const all = await listAllGuidesAdmin();
  let unpublished = 0;
  for (const g of all) {
    if (!g.isPublished) continue;
    await setGuidePublished(g.slug, false);
    unpublished++;
  }
  revalidatePath(`/daily-post`);
  revalidatePath(`/guides`);
  revalidatePath(`/sitemap.xml`);
  return { ok: true, unpublished };
}
