"use server";

import { revalidatePath } from "next/cache";
import { savePost, type GeneratedFields } from "./data";
import { listAllGuidesAdmin, setGuidePublished } from "@/lib/guides";

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
