/**
 * Shim that keeps the existing /daily-post admin page importing from this
 * file but now backs onto the new `daily_guides` Prisma table via
 * src/lib/guides.ts. The filesystem-JSON code path is gone — production
 * (Vercel) can't read C:/Users/serka/namaha/data/posts and the JSON files
 * were always a brittle source of truth.
 *
 * The shape exported here matches what /daily-post/page.tsx + /daily-post/
 * [slug]/post-editor.tsx expect, so the admin UI keeps working unchanged.
 * To backfill from JSON, run: npx tsx scripts/import-daily-guides.ts.
 */

import {
  listAllGuidesAdmin,
  getGuideAdmin,
  updateGuide,
} from "@/lib/guides";

export type GeneratedFields = {
  hook: string;
  script: string;
  caption: string;
  hashtags: string[];
  keyword: string;
};

export type DailyPost = {
  slug: string;
  title: string;
  url: string;
  file?: string;
  index?: number;
  generated?: GeneratedFields;
  generated_at?: string;
  model?: string;
  // Long-form article body — the "full guide" content rendered on
  // /guides/<slug>. Empty by default; admin fills it in from the editor.
  body?: string;
  // AI-video production brief (SCENES + VOICEOVER + CAPTIONS).
  videoPrompt?: string;
  // Talking-head video URL (R2). Optional.
  videoUrl?: string | null;
  // Carousel image URLs (R2). Empty array if not set.
  imageUrls?: string[];
  // New fields surfaced by the DB-backed source (used by the admin UI's
  // Publish toggle — render conditional on `isPublished`).
  isPublished?: boolean;
  publishedAt?: string | null;
  // Platforms this guide has been successfully published to via publishToSocial.
  postedPlatforms?: string[];
};

// Kept as an exported constant so the existing /daily-post page can still
// reference it for the "source:" hint. With the DB migration that hint
// now lives in the import script's logs, but keeping the export avoids a
// breaking import in admin code paths we haven't audited.
export const POSTS_DIR =
  process.env.FADIA_POSTS_DIR ?? "C:/Users/serka/namaha/data/posts";

export async function listPosts(): Promise<DailyPost[]> {
  const guides = await listAllGuidesAdmin();
  return guides.map(toDailyPost);
}

export async function getPost(slug: string): Promise<DailyPost | null> {
  const g = await getGuideAdmin(slug);
  return g ? toDailyPost(g) : null;
}

export async function savePost(
  slug: string,
  patch: Partial<GeneratedFields> & { body?: string },
): Promise<boolean> {
  // The old shape lumped everything under `generated`. The DB stores
  // each field at the top level, so we translate. `keyword` → `manychatKeyword`.
  // `body` is a sibling of `generated` in the new shape (it's not script-y),
  // so it passes straight through.
  return updateGuide(slug, {
    hook: patch.hook,
    script: patch.script,
    caption: patch.caption,
    hashtags: patch.hashtags,
    manychatKeyword: patch.keyword,
    body: patch.body,
  });
}

// ─── shape translation ───────────────────────────────────────────

type GuideAdminShape = Awaited<ReturnType<typeof listAllGuidesAdmin>>[number];

function toDailyPost(g: GuideAdminShape): DailyPost {
  return {
    slug: g.slug,
    title: g.title,
    url: g.sourceUrl ?? "", // sourceUrl plays the role of the legacy "url"
    index: g.index ?? undefined,
    generated: {
      hook: g.hook,
      script: g.script,
      caption: g.caption,
      hashtags: g.hashtags,
      keyword: g.manychatKeyword,
    },
    body: g.body,
    videoPrompt: g.videoPrompt,
    videoUrl: g.videoUrl,
    imageUrls: g.imageUrls,
    isPublished: g.isPublished,
    publishedAt: g.publishedAt ? g.publishedAt.toISOString() : null,
    postedPlatforms: g.postedPlatforms,
  };
}
