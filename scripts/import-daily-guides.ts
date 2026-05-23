/**
 * One-time backfill: read every `<slug>.json` from the local POSTS_DIR
 * (where the user's Python pipeline writes generated guides) and upsert
 * each into the new `daily_guides` table.
 *
 * Run after `npx prisma db push` has applied the new schema:
 *   npx tsx scripts/import-daily-guides.ts
 *
 * Idempotent — uses `upsert` keyed on slug so re-running just refreshes
 * existing rows with whatever's in the JSON. Useful when the user
 * regenerates a guide via the local pipeline and wants to push the
 * updated content into production.
 *
 * isPublished defaults to false on insert so freshly imported guides
 * stay off the public site until the admin explicitly flips them.
 * Existing rows preserve their publish state on re-import.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const POSTS_DIR =
  process.env.FADIA_POSTS_DIR ?? "C:/Users/serka/namaha/data/posts";

type GeneratedFields = {
  hook?: string;
  script?: string;
  caption?: string;
  hashtags?: string[];
  keyword?: string;
};

type SourceGuide = {
  slug?: string;
  title?: string;
  url?: string; // original Instagram/TikTok URL (for sourceUrl)
  file?: string;
  index?: number;
  generated?: GeneratedFields;
  generated_at?: string;
  model?: string;
};

async function main() {
  const prisma = new PrismaClient();
  try {
    let entries: string[];
    try {
      entries = await fs.readdir(POSTS_DIR);
    } catch (e) {
      console.error(`Couldn't read POSTS_DIR (${POSTS_DIR}):`, (e as Error).message);
      console.error("Set FADIA_POSTS_DIR=/path/to/posts if your local path differs.");
      process.exit(1);
    }

    const jsons = entries.filter((n) => n.endsWith(".json"));
    if (jsons.length === 0) {
      console.warn(`No .json files found in ${POSTS_DIR}.`);
      return;
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const name of jsons) {
      const fullPath = path.join(POSTS_DIR, name);
      let raw: string;
      try {
        raw = await fs.readFile(fullPath, "utf8");
      } catch (e) {
        console.warn(`Skip ${name}: read failed (${(e as Error).message})`);
        skipped++;
        continue;
      }

      let post: SourceGuide;
      try {
        post = JSON.parse(raw);
      } catch (e) {
        console.warn(`Skip ${name}: invalid JSON (${(e as Error).message})`);
        skipped++;
        continue;
      }

      // Derive slug from filename if the JSON doesn't carry one.
      const slug = (post.slug ?? name.replace(/\.json$/i, "")).trim();
      if (!slug) {
        console.warn(`Skip ${name}: no usable slug`);
        skipped++;
        continue;
      }

      // Skip guides that don't have a script yet — no point publishing an
      // empty page. They stay in JSON for the admin to finish, then get
      // imported on a later run.
      const g = post.generated ?? {};
      if (!g.script?.trim()) {
        skipped++;
        continue;
      }

      const data = {
        slug,
        title: (post.title ?? slug).trim(),
        index: post.index ?? null,
        hook: g.hook?.trim() ?? "",
        script: g.script.trim(),
        caption: g.caption?.trim() ?? "",
        hashtags: g.hashtags ?? [],
        manychatKeyword: g.keyword?.trim() ?? "",
        sourceUrl: post.url?.trim() || null,
      };

      // Check first so we can report insert vs update — Prisma's upsert
      // doesn't return that distinction. Cheap extra query.
      const existing = await prisma.dailyGuide.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (existing) {
        await prisma.dailyGuide.update({
          where: { slug },
          data, // isPublished + publishedAt preserved
        });
        updated++;
      } else {
        await prisma.dailyGuide.create({ data });
        inserted++;
      }
    }

    console.log(`Done. ${inserted} new · ${updated} updated · ${skipped} skipped`);
    console.log(`All imported rows start with isPublished=false — flip them in the dashboard when ready.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
