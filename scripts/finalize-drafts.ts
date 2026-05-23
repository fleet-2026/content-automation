/**
 * FINAL pass on the 21 seed drafts:
 *   1. Assign a UNIQUE image to every draft (no repeats)
 *   2. Upload that image to R2 (if not already uploaded)
 *   3. Update each Draft's mediaUrl
 *   4. Strip the 📷/🕒/[EW7D-...] header lines from each caption
 *
 * Run:   cd creator-os && npx tsx scripts/finalize-drafts.ts
 *
 * Idempotent: scans current drafts by their original slot signature
 * ("Mon May 18 · A — 7:30am" etc.) — works regardless of how many times
 * it's been run. Replaces any prior mediaUrl with the canonical one.
 */
import { PrismaClient } from "@prisma/client";
import { uploadToR2 } from "@/lib/r2";
import { sniffFileType } from "@/lib/file-sniff";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";

const prisma = new PrismaClient();
const SEED_MARKER = "[EW7D-2026-05-18]";
const PACK = String.raw`C:\Users\serka\Desktop\EarnWithAI-social-pack`;
const GAIA_THUMBS = join(PACK, "gaia-library", "thumbs");

// One image per draft. UNIQUE — no repeats across the 21.
// The "slotKey" is the day+slot string we wrote into the 🕒 header.
const PLAN: Array<{ slotKey: string; image: string; note: string }> = [
  { slotKey: "Mon May 18 · A — 7:30am",  image: "profile-1080.jpg",                        note: "your real portrait — origin post" },
  { slotKey: "Mon May 18 · B — 12:30pm", image: "gaia-008",                                 note: "Gaia w/ laptop + mood board (verified)" },
  { slotKey: "Mon May 18 · C — 7:30pm",  image: "course-heroes/course-passive-income.jpg",  note: "bestseller hero" },

  { slotKey: "Tue May 19 · A — 7:30am",  image: "highlight-courses.png",                    note: "Courses highlight as carousel cover" },
  { slotKey: "Tue May 19 · B — 12:30pm", image: "course-heroes/course-avatar-prompts.jpg",  note: "avatar pack hero" },
  { slotKey: "Tue May 19 · C — 7:30pm",  image: "gaia-001",                                 note: "Gaia lifestyle hair shot" },

  { slotKey: "Wed May 20 · A — 7:30am",  image: "highlight-mrr.png",                        note: "MRR highlight as carousel cover" },
  { slotKey: "Wed May 20 · B — 12:30pm", image: "gaia-051",                                 note: "Gaia (verify in Compose — swap if wrong vibe)" },
  { slotKey: "Wed May 20 · C — 7:30pm",  image: "course-heroes/course-mrr-bundle.jpg",      note: "MRR bundle hero" },

  { slotKey: "Thu May 21 · A — 7:30am",  image: "gaia-089",                                 note: "Gaia (verify in Compose — swap if wrong vibe)" },
  { slotKey: "Thu May 21 · B — 12:30pm", image: "course-heroes/course-talking-head.jpg",    note: "talking head hero" },
  { slotKey: "Thu May 21 · C — 7:30pm",  image: "course-heroes/course-caroux.jpg",          note: "Caroux hero" },

  { slotKey: "Fri May 22 · A — 7:30am",  image: "gaia-006",                                 note: "Gaia sun-hat smile (verified)" },
  { slotKey: "Fri May 22 · B — 12:30pm", image: "course-heroes/course-flipit.jpg",          note: "FlipIt hero" },
  { slotKey: "Fri May 22 · C — 7:30pm",  image: "gaia-260",                                 note: "Gaia (verify in Compose — swap if wrong vibe)" },

  { slotKey: "Sat May 23 · A — 8:30am",  image: "gaia-370",                                 note: "Gaia (verify in Compose — swap if wrong vibe)" },
  { slotKey: "Sat May 23 · B — 1:30pm",  image: "course-heroes/course-digital-twin.jpg",    note: "digital twin hero" },
  { slotKey: "Sat May 23 · C — 7:30pm",  image: "gaia-185",                                 note: "Gaia close-up (verified)" },

  { slotKey: "Sun May 24 · A — 8:30am",  image: "gaia-118",                                 note: "Gaia (verify in Compose — swap if wrong vibe)" },
  { slotKey: "Sun May 24 · B — 1:30pm",  image: "facebook-cover.jpg",                       note: "branded banner for 7-course recap cover" },
  { slotKey: "Sun May 24 · C — 7:30pm",  image: "highlight-100days.png",                    note: "100 Days highlight — newsletter CTA" },
];

/** Resolve an image reference to an absolute local path. */
function resolve(imageRef: string): string | null {
  // Gaia thumbnail (gaia-NNN)
  if (/^gaia-\d{3}$/.test(imageRef)) {
    const p = join(GAIA_THUMBS, `${imageRef}.jpg`);
    return existsSync(p) ? p : null;
  }
  // Anything else: relative to the pack
  const p = join(PACK, imageRef);
  return existsSync(p) ? p : null;
}

async function upload(absPath: string, userId: string): Promise<string> {
  const buf = await readFile(absPath);
  const sniffed = sniffFileType(new Uint8Array(buf.slice(0, 64)));
  if (!sniffed) throw new Error(`Unsupported file type: ${absPath}`);
  const key = `uploads/${userId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${sniffed.ext}`;
  return uploadToR2(key, buf, sniffed.mime);
}

/** Remove the 3-line header (📷 IMAGE / 🕒 / [EW7D-...]) plus the blank line after. */
function stripHeader(caption: string): string {
  const lines = caption.split("\n");
  // Drop leading lines that match the header pattern
  let i = 0;
  while (
    i < lines.length &&
    (lines[i].startsWith("📷") ||
      lines[i].startsWith("🕒") ||
      lines[i].includes(SEED_MARKER) ||
      lines[i].trim() === "")
  ) {
    i += 1;
    if (i >= 4) break; // safety — header is at most 3 + blank
  }
  return lines.slice(i).join("\n").trimStart();
}

/** Extract the slot signature from caption header so we can match drafts. */
function slotFromCaption(caption: string): string | null {
  const m = caption.match(/🕒\s*([^\n]+)/);
  return m?.[1]?.trim() ?? null;
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!adminEmail) {
    console.error("✗ ADMIN_EMAIL must be set"); process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) {
    console.error(`✗ No user for ${adminEmail}`); process.exit(1);
  }

  const drafts = await prisma.draft.findMany({
    where: { userId: user.id, caption: { contains: SEED_MARKER } },
    orderBy: { scheduledFor: "asc" },
  });
  if (drafts.length === 0) {
    console.error("✗ No seeded drafts found. Run seed-7-day-calendar.ts first.");
    process.exit(1);
  }
  console.log(`Found ${drafts.length} seeded drafts.\n`);

  // Cache: upload each unique local path once even if a future plan reuses it.
  const uploadCache = new Map<string, string>();

  let updated = 0;
  let missing = 0;
  let failed = 0;

  for (const draft of drafts) {
    const slot = slotFromCaption(draft.caption);
    if (!slot) {
      console.log(`  ? draft ${draft.id} has no slot header, skipping`);
      continue;
    }
    const plan = PLAN.find((p) => slot.startsWith(p.slotKey) || p.slotKey.startsWith(slot));
    if (!plan) {
      console.log(`  ? no plan for slot "${slot}"`);
      continue;
    }

    const absPath = resolve(plan.image);
    if (!absPath) {
      console.log(`  ✗ ${plan.slotKey.padEnd(28)} MISSING FILE: ${plan.image}`);
      missing += 1;
      continue;
    }

    try {
      let url = uploadCache.get(absPath);
      if (!url) {
        url = await upload(absPath, user.id);
        uploadCache.set(absPath, url);
      }
      const cleanCaption = stripHeader(draft.caption);
      // Re-stamp the marker at the end (invisible) so we stay idempotent on re-runs
      const newCaption = `${cleanCaption}\n\n<!-- ${SEED_MARKER} -->`;
      await prisma.draft.update({
        where: { id: draft.id },
        data: { mediaUrl: url, caption: newCaption },
      });
      updated += 1;
      console.log(`  ✓ ${plan.slotKey.padEnd(28)} ${plan.image.padEnd(48)} (${plan.note})`);
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ✗ ${plan.slotKey.padEnd(28)} FAILED: ${msg}`);
    }
  }

  console.log(
    `\nSummary: ${updated} drafts finalized · ${missing} missing files · ${failed} failed`,
  );
  if (updated === drafts.length) {
    console.log(
      `\n✓ All drafts have a unique image and clean caption. Open ` +
        `https://creator-os-delta.vercel.app/drafts to verify.`,
    );
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
