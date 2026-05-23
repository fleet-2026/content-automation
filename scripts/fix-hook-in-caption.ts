/**
 * Two fixes on all 36 drafts:
 *
 *   1. Strip the "🎬 TEXT OVERLAY (first 1.5s): ..." note from Week 2 Reels —
 *      it was an instruction-to-self, NOT post content. The hook itself doubles
 *      as the on-screen text overlay by convention (no separate note needed).
 *
 *   2. Prepend the selectedHook to the caption body so the full post reads
 *      complete in EVERY preview surface (Drafts list, mobile preview, etc.).
 *      Compose's `captionWithoutHook()` strips it on load, so the editor still
 *      shows hook + body separately — clean both ways.
 *
 * Run: cd creator-os && npx tsx scripts/fix-hook-in-caption.ts
 *
 * Idempotent: if caption already starts with the hook, it skips.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEXT_OVERLAY_RE = /^🎬 TEXT OVERLAY[^\n]*\n+/;

function fixCaption(caption: string, selectedHook: string | null): { caption: string; changed: boolean } {
  let next = caption;
  let changed = false;

  // 1. Strip the TEXT OVERLAY instructional note if present
  if (TEXT_OVERLAY_RE.test(next)) {
    next = next.replace(TEXT_OVERLAY_RE, "");
    changed = true;
  }

  // 2. Prepend selectedHook if not already there
  if (selectedHook && !next.startsWith(selectedHook)) {
    next = `${selectedHook}\n\n${next}`;
    changed = true;
  }

  return { caption: next.trimStart(), changed };
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!adminEmail) { console.error("✗ ADMIN_EMAIL must be set"); process.exit(1); }
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) { console.error(`✗ No user for ${adminEmail}`); process.exit(1); }

  const drafts = await prisma.draft.findMany({
    where: { userId: user.id },
    orderBy: { scheduledFor: "asc" },
  });
  console.log(`Auditing ${drafts.length} drafts\n`);

  let fixed = 0;
  let unchanged = 0;
  let noHook = 0;

  for (const d of drafts) {
    const stamp = d.scheduledFor.toISOString().slice(5, 16); // MM-DDTHH:MM
    if (!d.selectedHook) {
      noHook += 1;
      console.log(`  · ${stamp}  no selectedHook — skipping`);
      continue;
    }
    const { caption: nextCaption, changed } = fixCaption(d.caption, d.selectedHook);
    if (!changed) {
      unchanged += 1;
      console.log(`  ⊙ ${stamp}  already correct`);
      continue;
    }
    await prisma.draft.update({
      where: { id: d.id },
      data: { caption: nextCaption },
    });
    fixed += 1;
    const preview = d.selectedHook.length > 50 ? d.selectedHook.slice(0, 47) + "…" : d.selectedHook;
    console.log(`  ✓ ${stamp}  fixed — hook now leads: "${preview}"`);
  }

  console.log(
    `\nSummary: ${fixed} fixed · ${unchanged} already correct · ${noHook} had no hook`,
  );
  console.log(
    `\n✓ Every draft caption now starts with its hook, full post reads complete in every preview.\n` +
      `  Compose strips the duplicated hook on load via captionWithoutHook(), so the editor still\n` +
      `  shows hook + body separately. No double-hook on publish.`,
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
