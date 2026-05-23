/**
 * READ-ONLY audit of all 43 drafts. Shows:
 *   - When it's scheduled
 *   - The hook
 *   - What image is attached right now (filename only — parsed from R2 URL)
 *   - My category guess: PROFILE / COURSE-HERO / GAIA / HIGHLIGHT-TILE / OTHER
 *   - Suggested replacement (no swaps performed)
 *
 * Run: cd creator-os && npx tsx scripts/audit-images.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function categorize(mediaUrl: string | null): string {
  if (!mediaUrl) return "NO IMAGE";
  // Look at the R2 key path; tail is a hashed filename so we infer from content type/size.
  // Better: look at how big the file is via type extension in URL (.png vs .jpg).
  const isPng = mediaUrl.endsWith(".png");
  const isMp4 = mediaUrl.endsWith(".mp4");
  if (isMp4) return "VIDEO (Reel)";
  if (isPng) return "HIGHLIGHT-TILE (abstract letterform — the ones she said look like nav)";
  return "JPG (course-hero / Gaia / portrait)";
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim()!;
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) throw new Error("no user");
  const drafts = await prisma.draft.findMany({
    where: { userId: user.id },
    orderBy: { scheduledFor: "asc" },
  });

  console.log(`AUDIT — ${drafts.length} drafts\n`);

  const buckets = {
    tile: [] as typeof drafts,
    video: [] as typeof drafts,
    jpg: [] as typeof drafts,
    missing: [] as typeof drafts,
  };

  for (const d of drafts) {
    const cat = categorize(d.mediaUrl);
    const stamp = d.scheduledFor.toISOString().slice(5, 16).replace("T", " ");
    const hook = (d.selectedHook ?? d.caption.split("\n")[0]).slice(0, 55);
    const tag = cat.startsWith("HIGHLIGHT") ? "🟥"
              : cat.startsWith("VIDEO")     ? "🎬"
              : cat.startsWith("JPG")        ? "🟩"
              : "⬜";
    console.log(`${tag} ${stamp}  ${cat.split(" ")[0].padEnd(16)}  ${hook}`);
    if (cat.startsWith("HIGHLIGHT")) buckets.tile.push(d);
    else if (cat.startsWith("VIDEO")) buckets.video.push(d);
    else if (cat.startsWith("JPG")) buckets.jpg.push(d);
    else buckets.missing.push(d);
  }

  console.log(`\n── Summary ──`);
  console.log(`  🟥 ${buckets.tile.length} drafts use HIGHLIGHT TILE (abstract letterform — NEEDS REPLACEMENT)`);
  console.log(`  🎬 ${buckets.video.length} drafts use VIDEO (Reels — kept as-is)`);
  console.log(`  🟩 ${buckets.jpg.length} drafts use JPG (course-hero / Gaia / portrait — most are fine)`);
  console.log(`  ⬜ ${buckets.missing.length} drafts have no image`);

  if (buckets.tile.length > 0) {
    console.log(`\n── HIGHLIGHT TILES to replace (the abstract S/R/C/M/F letter ones) ──`);
    for (const d of buckets.tile) {
      const stamp = d.scheduledFor.toISOString().slice(5, 16).replace("T", " ");
      const hook = (d.selectedHook ?? "").slice(0, 70);
      console.log(`  · ${stamp}  "${hook}"`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
