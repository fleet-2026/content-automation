"use server";

import { revalidatePath } from "next/cache";
import { savePost, type GeneratedFields } from "./data";

export async function updatePost(slug: string, patch: Partial<GeneratedFields>) {
  // Normalize hashtags if provided as a string
  let p: Partial<GeneratedFields> = { ...patch };
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
  return { ok };
}
