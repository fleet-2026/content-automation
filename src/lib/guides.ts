import { prisma } from "@/lib/db";

/**
 * Server-side data access for the public /guides site and the admin
 * /daily-post page. Source of truth is the `daily_guides` Prisma table —
 * filesystem JSON was retired in favor of DB-backed rows so production
 * Vercel deploys can read them. Filesystem files are still useful as a
 * local-edit source; the migration script in scripts/import-daily-guides.ts
 * re-imports them on demand.
 */

export type GuidePublic = {
  slug: string;
  title: string;
  index: number | null;
  hook: string;
  script: string;
  caption: string;
  hashtags: string[];
  manychatKeyword: string;
  body: string;
  videoPrompt: string;
  videoUrl: string | null;
  imageUrls: string[];
  sourceUrl: string | null;
  publishedAt: Date | null;
};

export type GuideAdmin = GuidePublic & {
  id: string;
  isPublished: boolean;
  postedPlatforms: string[];
  createdAt: Date;
  updatedAt: Date;
};

/** Public-facing list — only rows the admin has flipped to published.
 *  Wrapped in try/catch so the public site (sitemap + index) doesn't
 *  crash the build or 500 at runtime if the table doesn't exist yet
 *  (e.g. before `prisma db push` has run on a fresh environment). */
export async function listPublishedGuides(): Promise<GuidePublic[]> {
  try {
    const rows = await prisma.dailyGuide.findMany({
      where: { isPublished: true },
      orderBy: [{ index: "asc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(toPublic);
  } catch (e) {
    // P2021 = table doesn't exist, P1001 = can't reach DB, etc. Logging
    // server-side is enough — the page just renders as "no guides yet"
    // which is the right UX while the schema or DB is mid-deploy.
    console.warn("[guides] listPublishedGuides failed:", (e as Error).message);
    return [];
  }
}

/** Public-facing single guide — returns null when missing or unpublished
 *  so the route handler can render a 404. */
export async function getPublishedGuide(slug: string): Promise<GuidePublic | null> {
  if (!slug) return null;
  const safe = slug.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!safe) return null;
  try {
    const row = await prisma.dailyGuide.findFirst({
      where: { slug: safe, isPublished: true },
    });
    return row ? toPublic(row) : null;
  } catch (e) {
    console.warn("[guides] getPublishedGuide failed:", (e as Error).message);
    return null;
  }
}

/** Admin variant — returns every guide regardless of publish state.
 *  Used by the dashboard /daily-post page so the user can manage drafts.
 *  Same defensive try/catch as the public variants so the admin page
 *  loads (with "no guides yet" empty state) even before db:push. */
export async function listAllGuidesAdmin(): Promise<GuideAdmin[]> {
  try {
    const rows = await prisma.dailyGuide.findMany({
      orderBy: [{ index: "asc" }, { createdAt: "desc" }],
    });
    return rows.map(toAdmin);
  } catch (e) {
    console.warn("[guides] listAllGuidesAdmin failed:", (e as Error).message);
    return [];
  }
}

export async function getGuideAdmin(slug: string): Promise<GuideAdmin | null> {
  if (!slug) return null;
  const safe = slug.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!safe) return null;
  try {
    const row = await prisma.dailyGuide.findUnique({ where: { slug: safe } });
    return row ? toAdmin(row) : null;
  } catch (e) {
    console.warn("[guides] getGuideAdmin failed:", (e as Error).message);
    return null;
  }
}

type Patchable = Partial<{
  title: string;
  hook: string;
  script: string;
  caption: string;
  hashtags: string[];
  manychatKeyword: string;
  body: string;
  videoPrompt: string;
  videoUrl: string | null;
  imageUrls: string[];
  sourceUrl: string | null;
  isPublished: boolean;
  index: number | null;
}>;

/** Update fields. Auto-stamps publishedAt the first time isPublished
 *  flips true; clears it when flipped back to false. */
export async function updateGuide(slug: string, patch: Patchable): Promise<boolean> {
  const existing = await prisma.dailyGuide.findUnique({
    where: { slug },
    select: { isPublished: true, publishedAt: true },
  });
  if (!existing) return false;

  const data: Patchable & { publishedAt?: Date | null } = { ...patch };
  if (patch.isPublished === true && !existing.isPublished) {
    data.publishedAt = new Date();
  } else if (patch.isPublished === false && existing.isPublished) {
    data.publishedAt = null;
  }

  await prisma.dailyGuide.update({ where: { slug }, data });
  return true;
}

/** Toggle the public-visibility flag in a single call — handy from the
 *  admin UI's "Publish" / "Unpublish" buttons. */
export async function setGuidePublished(slug: string, published: boolean): Promise<boolean> {
  return updateGuide(slug, { isPublished: published });
}

// ─── shape helpers ────────────────────────────────────────────────

type RawGuide = {
  id: string;
  slug: string;
  title: string;
  index: number | null;
  hook: string;
  script: string;
  caption: string;
  hashtags: string[];
  manychatKeyword: string;
  body: string;
  videoPrompt: string;
  videoUrl: string | null;
  imageUrls: string[];
  sourceUrl: string | null;
  isPublished: boolean;
  postedPlatforms: string[];
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toPublic(r: RawGuide): GuidePublic {
  return {
    slug: r.slug,
    title: r.title,
    index: r.index,
    hook: r.hook,
    script: r.script,
    caption: r.caption,
    hashtags: r.hashtags,
    manychatKeyword: r.manychatKeyword,
    body: r.body,
    videoPrompt: r.videoPrompt,
    videoUrl: r.videoUrl,
    imageUrls: r.imageUrls,
    sourceUrl: r.sourceUrl,
    publishedAt: r.publishedAt,
  };
}

function toAdmin(r: RawGuide): GuideAdmin {
  return {
    ...toPublic(r),
    id: r.id,
    isPublished: r.isPublished,
    postedPlatforms: r.postedPlatforms,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
