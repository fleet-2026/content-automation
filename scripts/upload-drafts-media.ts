/**
 * Upload images to R2 for the 21 seed drafts, then update each Draft's mediaUrl
 * so the Compose UI shows the right image alongside the caption.
 *
 * Run:   cd creator-os && npx tsx scripts/upload-drafts-media.ts
 *
 * Parses the "📷 IMAGE: <path>" header line from each seeded draft's caption,
 * resolves it to a local file on your Desktop, uploads to R2 via the same
 * mechanism /api/upload uses, and writes the public URL back to the draft.
 *
 * Drafts whose image is a placeholder (e.g. "gaia — laptop / desk") are
 * SKIPPED and reported — you'll attach those manually after browsing the
 * Gaia contact sheet.
 *
 * Safe to re-run — if a draft already has a mediaUrl pointing at R2_PUBLIC_URL,
 * it's skipped (won't re-upload).
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
const DESKTOP_PACK = String.raw`C:\Users\serka\Desktop\EarnWithAI-social-pack`;

/** Look at a draft's "📷 IMAGE: ..." line and resolve to a real local path, or null. */
function resolveImagePath(caption: string): { absPath: string | null; raw: string } {
  const m = caption.match(/📷 IMAGE:\s*([^\n]+)/);
  const raw = (m?.[1] ?? "").trim();
  if (!raw) return { absPath: null, raw: "" };

  // First try: whole line is the file path
  const direct = join(DESKTOP_PACK, raw);
  if (existsSync(direct)) return { absPath: direct, raw };

  // Otherwise: pull any embedded "filename.ext" or "course-heroes/file.jpg" tokens
  // and try each. Lets us resolve descriptors like
  //   "profile-1080.jpg + 'Sunday note' overlay"
  //   "split: profile-1080.jpg + 1 Gaia (or course-heroes/course-talking-head.jpg)"
  const fileTokens = raw.match(/[A-Za-z0-9_\-/]+\.(?:jpg|jpeg|png|gif|webp|mp4)/gi) ?? [];
  for (const tok of fileTokens) {
    const p = join(DESKTOP_PACK, tok);
    if (existsSync(p)) return { absPath: p, raw };
  }
  return { absPath: null, raw };
}

async function uploadOne(localPath: string, userId: string): Promise<string> {
  const buf = await readFile(localPath);
  const sniffed = sniffFileType(new Uint8Array(buf.slice(0, 64)));
  if (!sniffed) {
    throw new Error(`Unsupported file type: ${localPath}`);
  }
  const key = `uploads/${userId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${sniffed.ext}`;
  const url = await uploadToR2(key, buf, sniffed.mime);
  return url;
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!adminEmail) {
    console.error("✗ ADMIN_EMAIL must be set");
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) {
    console.error(`✗ No user for ${adminEmail}`);
    process.exit(1);
  }

  const drafts = await prisma.draft.findMany({
    where: { userId: user.id, caption: { contains: SEED_MARKER } },
    orderBy: { scheduledFor: "asc" },
  });
  console.log(`Found ${drafts.length} seeded drafts for ${adminEmail}\n`);

  const r2Base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "") ?? "";
  let uploaded = 0;
  let skippedPlaceholder = 0;
  let skippedAlreadyUploaded = 0;
  let failed = 0;
  const placeholders: { id: string; slot: string; raw: string }[] = [];

  for (const d of drafts) {
    // Pull the "🕒 ..." line for a friendly label
    const slotMatch = d.caption.match(/🕒\s*([^\n]+)/);
    const slot = slotMatch?.[1] ?? "?";

    // Skip if already uploaded
    if (d.mediaUrl && r2Base && d.mediaUrl.startsWith(r2Base)) {
      skippedAlreadyUploaded += 1;
      console.log(`  ⊙ ${slot.padEnd(30)} already has mediaUrl, skipping`);
      continue;
    }

    const { absPath, raw } = resolveImagePath(d.caption);
    if (!absPath) {
      skippedPlaceholder += 1;
      placeholders.push({ id: d.id, slot, raw });
      console.log(`  · ${slot.padEnd(30)} placeholder: "${raw.slice(0, 50)}"`);
      continue;
    }

    try {
      const url = await uploadOne(absPath, user.id);
      await prisma.draft.update({
        where: { id: d.id },
        data: { mediaUrl: url },
      });
      uploaded += 1;
      console.log(`  ✓ ${slot.padEnd(30)} → ${raw}`);
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ✗ ${slot.padEnd(30)} FAILED: ${msg}`);
    }
  }

  console.log(
    `\nSummary: ${uploaded} uploaded · ${skippedAlreadyUploaded} already had image · ${skippedPlaceholder} placeholders · ${failed} failed`,
  );

  if (placeholders.length) {
    console.log(`\nDrafts still needing manual image attach (open in Compose):`);
    for (const p of placeholders) {
      console.log(`  · ${p.slot.padEnd(30)} ${p.raw}`);
    }
    console.log(
      `\nFor Gaia picks: browse contact sheets at ` +
        `C:\\Users\\serka\\Desktop\\EarnWithAI-social-pack\\gaia-library\\contact-sheet-0*.png`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
