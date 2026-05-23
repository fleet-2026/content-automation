/**
 * Replace the 8 abstract-letterform highlight tiles with matching JPGs
 * already on disk. Zero API calls, zero new generations.
 *
 * Run: cd creator-os && npx tsx scripts/fix-8-tile-images.ts
 *
 * Idempotent: matches drafts by exact scheduledFor.
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

const swaps = [
  { scheduledFor: et("w1", 1, "07:30"), slot: "Tue 5/19 — 100 Days",     newImage: "gaia-001" },
  { scheduledFor: et("w1", 2, "07:30"), slot: "Wed 5/20 — MRR explainer", newImage: "course-heroes/course-mrr-bundle.jpg" },
  { scheduledFor: et("w1", 5, "08:30"), slot: "Sat 5/23 — Courses menu",  newImage: "course-heroes/course-avatar-prompts.jpg" },
  { scheduledFor: et("w1", 6, "08:30"), slot: "Sun 5/24 — Sunday setup",  newImage: "course-heroes/course-caroux.jpg" },
  { scheduledFor: et("w1", 6, "19:30"), slot: "Sun 5/24 — Newsletter",    newImage: "gaia-118" },
  { scheduledFor: et("w2", 1, "12:30"), slot: "Tue 5/26 — Quit job",      newImage: "gaia-185" },
  { scheduledFor: et("w2", 2, "12:30"), slot: "Wed 5/27 — Products mix",  newImage: "course-heroes/course-passive-income.jpg" },
  { scheduledFor: et("w2", 3, "12:30"), slot: "Thu 5/28 — AI literacy",   newImage: "gaia-220" },
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

  console.log(`Swapping ${swaps.length} highlight-tile images for editorial JPGs\n`);
  const uploadCache = new Map<string, string>();
  let updated = 0;
  let failed = 0;

  for (const s of swaps) {
    const abs = resolve(s.newImage);
    if (!abs) {
      console.log(`  ✗ ${s.slot.padEnd(32)} missing local file: ${s.newImage}`);
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
      console.log(`  ✗ ${s.slot.padEnd(32)} draft not found`);
      failed += 1;
      continue;
    }
    await prisma.draft.update({ where: { id: d.id }, data: { mediaUrl: url } });
    updated += 1;
    console.log(`  ✓ ${s.slot.padEnd(32)} → ${s.newImage}`);
  }
  console.log(`\nSummary: ${updated} swapped · ${failed} failed`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
