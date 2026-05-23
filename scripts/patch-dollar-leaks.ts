/**
 * Surgical patch for the last 6 $-leaks found by find-dollar-leaks.ts.
 *
 * Run: cd creator-os && npx tsx scripts/patch-dollar-leaks.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function et(weekStart: "w1" | "w2", dayOffset: number, hhmm: string): Date {
  const anchor = weekStart === "w1" ? "2026-05-18T00:00:00Z" : "2026-05-25T00:00:00Z";
  const [h, m] = hhmm.split(":").map(Number);
  const date = new Date(anchor);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(h + 4, m, 0, 0);
  return date;
}

// Each rule: locate the draft by scheduledFor; apply surgical text replacements
// in caption + hookOptions JSON.
type Rule = {
  scheduledFor: Date;
  slot: string;
  // [pattern, replacement] tuples applied to caption
  captionPatches?: Array<[RegExp | string, string]>;
  // applied to the stringified hookOptions JSON, then re-parsed
  altPatches?: Array<[RegExp | string, string]>;
};

const rules: Rule[] = [
  // W1 Wed 7:30pm — MRR Bundle: alt "The bundle that makes the average buyer $200 in week 1."
  {
    scheduledFor: et("w1", 2, "19:30"),
    slot: "W1 Wed · 7:30pm",
    altPatches: [
      ["The bundle that makes the average buyer $200 in week 1.",
       "The bundle that makes the average buyer their first sales in week 1."],
    ],
  },
  // W1 Sat 8:30am — courses menu: "($19)"
  {
    scheduledFor: et("w1", 5, "08:30"),
    slot: "W1 Sat · 8:30am",
    captionPatches: [
      [" ($19)", ""],
    ],
  },
  // W1 Sun 1:30pm — 7 courses recap: "Popular, $19"
  {
    scheduledFor: et("w1", 6, "13:30"),
    slot: "W1 Sun · 1:30pm",
    captionPatches: [
      [", $19", ""],
    ],
  },
  // W2 Mon 7:30pm — FlipIt static: "$0 to $300 by next Monday is realistic"
  {
    scheduledFor: et("w2", 0, "19:30"),
    slot: "W2 Mon · 7:30pm",
    captionPatches: [
      ["$0 to $300 by next Monday is realistic", "your first paid customer by next Monday is realistic"],
    ],
  },
  // W2 Tue 7:30am — Avatar Reel "She's not real": "AI Avatar Prompt Pack, $19." + alt "$0 in photoshoot fees"
  {
    scheduledFor: et("w2", 1, "07:30"),
    slot: "W2 Tue · 7:30am",
    captionPatches: [
      ["AI Avatar Prompt Pack, $19.", "AI Avatar Prompt Pack."],
    ],
    altPatches: [
      ["My Instagram costs $0 in photographer fees.", "My Instagram costs nothing in photographer fees."],
    ],
  },
  // W2 Tue 7:30pm — Photo shoot static: "$19 to own them all"
  {
    scheduledFor: et("w2", 1, "19:30"),
    slot: "W2 Tue · 7:30pm",
    captionPatches: [
      ["$19 to own them all", "one prompt pack to own them all"],
    ],
    altPatches: [
      ["$0 in photoshoot fees this year.", "Zero photoshoot fees this year."],
    ],
  },
];

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim()!;
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) throw new Error("no user");

  let patched = 0;
  for (const r of rules) {
    const d = await prisma.draft.findFirst({
      where: { userId: user.id, scheduledFor: r.scheduledFor },
    });
    if (!d) {
      console.log(`  ✗ ${r.slot.padEnd(22)} not found`);
      continue;
    }

    let nextCaption = d.caption;
    for (const [from, to] of r.captionPatches ?? []) {
      const re = typeof from === "string" ? from : from;
      nextCaption = nextCaption.replaceAll(re as any, to);
    }

    let nextHookOptions = d.hookOptions;
    if (r.altPatches && r.altPatches.length) {
      let json = JSON.stringify(d.hookOptions ?? []);
      for (const [from, to] of r.altPatches) {
        json = json.replaceAll(from as any, to);
      }
      nextHookOptions = JSON.parse(json);
    }

    await prisma.draft.update({
      where: { id: d.id },
      data: { caption: nextCaption, hookOptions: nextHookOptions as object },
    });
    patched += 1;
    console.log(`  ✓ ${r.slot.padEnd(22)} patched`);
  }

  // Final scan
  console.log(`\nFinal $-scan:`);
  const all = await prisma.draft.findMany({ where: { userId: user.id } });
  const leaks = all.filter(d => {
    const json = JSON.stringify(d.hookOptions ?? []);
    return /\$\d/.test(d.caption) || (d.selectedHook && /\$\d/.test(d.selectedHook)) || /\$\d/.test(json);
  });
  if (leaks.length === 0) {
    console.log(`  ✓ Zero $ amounts remain across all 36 drafts.`);
  } else {
    console.log(`  ⚠ ${leaks.length} drafts still have $-leaks:`);
    for (const d of leaks) {
      const stamp = d.scheduledFor.toISOString().slice(5, 16);
      const captionMatch = (d.caption.match(/\$\d[\d,.]*\w*/) ?? [])[0];
      const hookMatch = d.selectedHook && (d.selectedHook.match(/\$\d[\d,.]*\w*/) ?? [])[0];
      const altMatch = (JSON.stringify(d.hookOptions ?? []).match(/\$\d[\d,.]*\w*/) ?? [])[0];
      console.log(`    · ${stamp}  caption: ${captionMatch ?? "-"}  hook: ${hookMatch ?? "-"}  alt: ${altMatch ?? "-"}`);
    }
  }
  console.log(`\nSummary: ${patched} drafts patched.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
