"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";

/**
 * Create a new tracker guide with just a title.
 * Generates a slug, picks the next day number, and redirects to the editor.
 */
export async function createTrackerGuide(title: string): Promise<{ ok: boolean; error?: string; slug?: string }> {
  try {
    await requireUser();
  } catch {
    return { ok: false, error: "unauthenticated" };
  }

  const trimmed = title.trim();
  if (!trimmed) return { ok: false, error: "Title is required" };

  // Build a URL-safe slug from the title
  let slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  // Ensure uniqueness — append a suffix if the slug already exists
  const existing = await prisma.dailyGuide.findUnique({ where: { slug } });
  if (existing) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  // Pick the next day number: max(index) + 1 among tracker guides
  const maxRow = await prisma.dailyGuide.findFirst({
    where: { source: "tracker" },
    orderBy: { index: "desc" },
    select: { index: true },
  });
  const nextIndex = (maxRow?.index ?? 0) + 1;

  const guide = await prisma.dailyGuide.create({
    data: {
      slug,
      title: trimmed,
      index: nextIndex,
      hook: "",
      script: "",
      caption: "",
      hashtags: [],
      manychatKeyword: "",
      body: "",
      videoPrompt: "",
      source: "tracker",
    },
  });

  revalidatePath("/tracker");
  revalidatePath("/daily-post");
  return { ok: true, slug: guide.slug };
}
