/**
 * Replace the simple letterform "S" / "R" / "C" / "M" / "F" placeholder tiles
 * with editorial Gaia + course-hero images that read as "digital marketing
 * influencer" content (her actual brand vibe), not boring nav tiles.
 *
 * Also covers all OTHER drafts currently using highlight tiles.
 *
 * Run: cd creator-os && npx tsx scripts/swap-placeholder-images.ts
 */
import { PrismaClient } from "@prisma/client";
import { uploadToR2 } from "@/lib/r2";
import { sniffFileType } from "@/lib/file-sniff";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";

const prisma = new PrismaClient();
const PACK = String.raw`C:\Users\serka\Desktop\EarnWithAI-social-pack`;
const GAIA_THUMBS = join(PACK, "gaia-library", "thumbs");

function et(weekStart: "w1" | "w2", dayOffset: number, hhmm: string): Date {
  const anchor = weekStart === "w1" ? "2026-05-18T00:00:00Z" : "2026-05-25T00:00:00Z";
  const [h, m] = hhmm.split(":").map(Number);
  const date = new Date(anchor);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(h + 4, m, 0, 0);
  return date;
}

// Swap plan: each entry replaces the current highlight-* placeholder with a
// proper editorial image. Each picked from your existing pack — no new
// uploads needed; just re-attach a better mediaUrl.
const swaps = [
  // ─── The 3 visible in her screenshot ──────────────────────────────
  {
    scheduledFor: et("w2", 3, "12:30"),
    slot: "Thu W2 · AI literacy",
    oldImage: "highlight-story.png",
    newImage: "gaia-220",
    why: "editorial Gaia in clean modern setting — reads creator-economy, not abstract S",
  },
  {
    scheduledFor: et("w2", 2, "12:30"),
    slot: "Wed W2 · Revenue breakdown",
    oldImage: "highlight-reviews.png",
    newImage: "course-heroes/course-passive-income.jpg",
    why: "editorial laptop+coffee still life — directly says 'income' visually, not abstract R",
  },
  {
    scheduledFor: et("w1", 5, "08:30"),
    slot: "Sat W1 · Courses menu",
    oldImage: "highlight-courses.png",
    newImage: "course-heroes/course-avatar-prompts.jpg",
    why: "the gallery-wall of 6 portraits visually says 'browse 7 courses' better than C tile",
  },
  // ─── Other placeholder-tile drafts also fixed ─────────────────────
  {
    scheduledFor: et("w1", 1, "07:30"),
    slot: "Tue W1 · 100 Days free",
    oldImage: "highlight-100days.png",
    newImage: "gaia-001",
    why: "morning-routine Gaia reads 'one a day, one skill' better than 100 tile",
  },
  {
    scheduledFor: et("w1", 2, "07:30"),
    slot: "Wed W1 · MRR explainer",
    oldImage: "highlight-mrr.png",
    newImage: "course-heroes/course-mrr-bundle.jpg",
    why: "stacked-books-with-plum-ribbon visualizes the 'bundle' concept",
  },
  {
    scheduledFor: et("w1", 6, "08:30"),
    slot: "Sun W1 · Sunday setup",
    oldImage: "highlight-stack.png",
    newImage: "course-heroes/course-caroux.jpg",
    why: "postcard flat-lay visually says 'system / weekly setup' better than abstract T",
  },
  {
    scheduledFor: et("w1", 6, "19:30"),
    slot: "Sun W1 · Newsletter",
    oldImage: "highlight-about.png",
    newImage: "gaia-118",
    why: "thoughtful Gaia portrait reads more 'personal Sunday note' than F tile",
  },
  {
    scheduledFor: et("w2", 1, "12:30"),
    slot: "Tue W2 · Why I quit $180k",
    oldImage: "highlight-apps.png",
    newImage: "gaia-185",
    why: "close-up Gaia portrait carries the personal-story weight better than 'A apps' tile",
  },
];

function resolve(ref: string): string | null {
  if (/^gaia-\d{3}$/.test(ref)) {
    const p = join(GAIA_THUMBS, `${ref}.jpg`);
    return existsSync(p) ? p : null;
  }
  const p = join(PACK, ref);
  return existsSync(p) ? p : null;
}

async function upload(absPath: string, userId: string): Promise<string> {
  const buf = await readFile(absPath);
  const s = sniffFileType(new Uint8Array(buf.slice(0, 64)));
  if (!s) throw new Error(`Unsupported: ${absPath}`);
  const key = `uploads/${userId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${s.ext}`;
  return uploadToR2(key, buf, s.mime);
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim()!;
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) throw new Error("no user");

  console.log(`Swapping ${swaps.length} placeholder tile images for editorial Gaia / course-hero images\n`);
  const uploadCache = new Map<string, string>();
  let updated = 0;
  let failed = 0;

  for (const s of swaps) {
    const abs = resolve(s.newImage);
    if (!abs) {
      console.log(`  ✗ ${s.slot.padEnd(36)} missing file: ${s.newImage}`);
      failed += 1;
      continue;
    }
    let url = uploadCache.get(abs);
    if (!url) {
      url = await upload(abs, user.id);
      uploadCache.set(abs, url);
    }
    const d = await prisma.draft.findFirst({
      where: { userId: user.id, scheduledFor: s.scheduledFor },
    });
    if (!d) {
      console.log(`  ✗ ${s.slot.padEnd(36)} draft not found`);
      failed += 1;
      continue;
    }
    await prisma.draft.update({ where: { id: d.id }, data: { mediaUrl: url } });
    updated += 1;
    console.log(`  ✓ ${s.slot.padEnd(36)} ${s.oldImage.padEnd(22)} → ${s.newImage}`);
  }
  console.log(`\nSummary: ${updated} swapped · ${failed} failed`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
