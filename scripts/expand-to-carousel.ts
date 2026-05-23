/**
 * Expand the 5 short static posts into 4-5 paragraph beats so each maps
 * cleanly to a carousel slide. Hook stays the same; body grows into a
 * proper story arc (cover → setup → reveal → proof → CTA).
 *
 * Run: cd creator-os && npx tsx scripts/expand-to-carousel.ts
 *
 * Idempotent: matches drafts by exact scheduledFor.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const URL = {
  courses:        "https://earnwith-ai.com/courses",
  passiveIncome:  "https://earnwith-ai.com/courses#passive-income",
  avatarPrompts:  "https://earnwith-ai.com/courses#avatar-prompts",
  mrrBundle:      "https://earnwith-ai.com/courses#mrr-bundle",
  digitalTwin:    "https://earnwith-ai.com/courses#digital-twin",
  talkingHead:    "https://earnwith-ai.com/courses#talking-head",
  flipit:         "https://earnwith-ai.com/courses#flipit",
  caroux:         "https://earnwith-ai.com/courses#caroux",
  hundredDays:    "https://earnwith-ai.com/100-days",
} as const;

function et(weekStart: "w1" | "w2", dayOffset: number, hhmm: string): Date {
  const anchor = weekStart === "w1" ? "2026-05-18T00:00:00Z" : "2026-05-25T00:00:00Z";
  const [h, m] = hhmm.split(":").map(Number);
  const date = new Date(anchor);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(h + 4, m, 0, 0);
  return date;
}

type Rewrite = {
  scheduledFor: Date;
  slot: string;
  selectedHook: string;
  /** Caption body — each \n\n separated paragraph = one carousel slide. */
  captionBody: string;
};

const rewrites: Rewrite[] = [
  // 1) W1 Thu 12:30pm — Talking Head pitch
  {
    scheduledFor: et("w1", 3, "12:30"),
    slot: "W1 Thu · 12:30pm — Talking Head",
    selectedHook: "I'm camera shy. So I built an AI version of me that isn't.",
    captionBody: `Every time I tried to record a YouTube intro I froze. 47 takes. Trash all of them. Try again Tuesday.

Then I learned: you don't need to be on camera to make camera-quality video. You need the right script + the right AI avatar setup.

90-minute course. First AI talking-head video rendered by minute 60. By minute 90 you have a workflow you'll never give up.

${URL.talkingHead}`,
  },

  // 2) W1 Fri 7:30am — Cohort win
  {
    scheduledFor: et("w1", 4, "07:30"),
    slot: "W1 Fri · 7:30am — Cohort win",
    selectedHook: "Friday energy ↓",
    captionBody: `A woman in my cohort just replaced her side-hustle income in 6 weeks.

Her stack:
· AI Avatar Prompt Pack — ${URL.avatarPrompts}
· Digital Passive Income Academy — ${URL.passiveIncome}
· 6am alarms
· zero "wait till I'm ready"

Six weeks isn't long. It's a school term. A wedding season. A pregnancy trimester. You can absolutely do this in six weeks.

If she can, you can. I'm rooting for you.`,
  },

  // 3) W1 Sat 8:30am — Courses menu
  {
    scheduledFor: et("w1", 5, "08:30"),
    slot: "W1 Sat · 8:30am — Courses menu",
    selectedHook: "Saturday morning. Coffee. Window light. Phone open to bio.",
    captionBody: `Pick the one that fits where you are right now ↓

If you want results today:
💰 Bestseller — ${URL.passiveIncome}
🖼️ Avatar pack — ${URL.avatarPrompts}
🤖 MRR bundle — ${URL.mrrBundle}
🧬 Digital twin — ${URL.digitalTwin}

If you want something newer or lighter:
🎬 Talking head — ${URL.talkingHead}
🔄 FlipIt — ${URL.flipit}
🎠 Caroux — ${URL.caroux}

All in one place → ${URL.courses}`,
  },

  // 4) W2 Wed 12:30pm — Revenue mix (currently 3p — restructure into 5 beats)
  {
    scheduledFor: et("w2", 2, "12:30"),
    slot: "W2 Wed · 12:30pm — Revenue mix",
    selectedHook: "My 7 products, ranked by what actually carries the business.",
    captionBody: `Numbers from last 30 days, as percentages of my mix.

The top two carry over half the business: AI Revolution MRR Bundle (31%) and Digital Passive Income Academy (28%).

The middle stack: Caroux + FlipIt + Talking Head combined (21%) and AI Avatar Prompt Pack (14%). Newsletter sponsorships round out at 6%.

Lesson: the bestseller funds the experiments. The experiments are what compound.

Pick where you are → ${URL.courses}`,
  },

  // 5) W2 Thu 12:30pm — AI literacy thesis
  {
    scheduledFor: et("w2", 3, "12:30"),
    slot: "W2 Thu · 12:30pm — AI literacy",
    selectedHook: "AI literacy is the new financial literacy.",
    captionBody: `A new line is being drawn. Most people don't see it yet.

Pre-2020, financial literacy split outcomes: 401k vs. no 401k. Compounded over decades.

Post-2024, AI literacy splits outcomes again: leverage vs. replaceable. Compounding by the quarter.

Working women are the most exposed AND the most under-trained. Both at the same time.

Start tonight → ${URL.hundredDays}`,
  },
];

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim()!;
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) throw new Error("no user");

  console.log(`Expanding ${rewrites.length} short posts → 4-5 slide carousel structure\n`);

  let updated = 0;
  for (const r of rewrites) {
    const d = await prisma.draft.findFirst({
      where: { userId: user.id, scheduledFor: r.scheduledFor },
    });
    if (!d) {
      console.log(`  ✗ ${r.slot}: not found`);
      continue;
    }
    const newCaption = `${r.selectedHook}\n\n${r.captionBody}`;
    await prisma.draft.update({
      where: { id: d.id },
      data: { caption: newCaption, selectedHook: r.selectedHook },
    });
    const paras = newCaption.split(/\n\s*\n/).filter(p => p.trim()).length;
    console.log(`  ✓ ${r.slot.padEnd(40)} → ${paras} slides`);
    updated += 1;
  }
  console.log(`\nSummary: ${updated} drafts expanded to carousel structure.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
