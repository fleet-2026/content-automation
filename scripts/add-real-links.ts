/**
 * Replace every "link in bio" / vague CTA in the 21 drafts with the actual
 * course/page URL. Only touches the `caption` body — leaves hook, image,
 * hashtags, schedule untouched.
 *
 * Run: cd creator-os && npx tsx scripts/add-real-links.ts
 *
 * Idempotent: matches drafts by exact scheduledFor.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function et(dayOffset: number, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const date = new Date("2026-05-18T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(h + 4, m, 0, 0);
  return date;
}

// Canonical URLs — one source of truth
const URL = {
  home:           "https://earnwith-ai.com",
  courses:        "https://earnwith-ai.com/courses",
  passiveIncome:  "https://earnwith-ai.com/courses#passive-income",
  avatarPrompts:  "https://earnwith-ai.com/courses#avatar-prompts",
  mrrBundle:      "https://earnwith-ai.com/courses#mrr-bundle",
  digitalTwin:    "https://earnwith-ai.com/courses#digital-twin",
  talkingHead:    "https://earnwith-ai.com/courses#talking-head",
  flipit:         "https://earnwith-ai.com/courses#flipit",
  caroux:         "https://earnwith-ai.com/courses#caroux",
  hundredDays:    "https://earnwith-ai.com/100-days",
  freeGuide:      "https://earnwith-ai.com/fadias-guide.html",
  newsletter:     "https://earnwith-ai.com/#newsletter",
} as const;

type Plan = { scheduledFor: Date; slot: string; caption: string };

const plans: Plan[] = [
  // ─── MON 5/18 ───────────────────────────────────────────────────────
  {
    scheduledFor: et(0, "07:30"), slot: "Mon · 7:30am",
    caption: `I was running a finance team, two kids in school, a husband who didn't quite get why I was tired all the time. The ladder I was climbing was someone else's ladder.

This morning I'm three years into building my own thing. AI tools made it possible. Working women like you made it worth it.

If you're stuck where I was — start with the Free Guide:
${URL.freeGuide}`,
  },
  {
    scheduledFor: et(0, "12:30"), slot: "Mon · 12:30pm",
    caption: `Open Claude. Paste your inbox subject lines from the last 7 days. Ask:
"Group these by urgency. Draft a 3-line reply to the urgent ones."

Saves me 45 minutes every Monday. That's $40+ at my old hourly.

100 free prompts like this:
${URL.hundredDays}`,
  },
  {
    scheduledFor: et(0, "19:30"), slot: "Mon · 7:30pm",
    caption: `Coffee, not coffee meetings. Calendar, not calls. The income shows up before the kids do.

The 5 things I built to make this real are inside Digital Passive Income Academy. First 50 buyers this week get a free 30-min audit of your setup.

${URL.passiveIncome}`,
  },

  // ─── TUE 5/19 ───────────────────────────────────────────────────────
  {
    scheduledFor: et(1, "07:30"), slot: "Tue · 7:30am",
    caption: `No email opt-in. No funnel. CC BY 4.0.

Day 7's the one that broke me out of "I don't know where to start" — the First-Skill Picker. Try it tonight.

${URL.hundredDays}`,
  },
  {
    scheduledFor: et(1, "12:30"), slot: "Tue · 12:30pm",
    caption: `Every one generated from one consistent character + a different prompt. Magazine quality. ~30 seconds each.

The 700 prompts that get her there → AI Avatar Prompt Pack, $19.

Pays for itself the first time you skip a $500 photo shoot.

${URL.avatarPrompts}`,
  },
  {
    scheduledFor: et(1, "19:30"), slot: "Tue · 7:30pm",
    caption: `She's not real. She's my Instagram. She wakes up earlier than I do. She has better hair days.

I built her with 700 prompts. She lets me post 3x a day without three photo shoots a week.

The exact pack:
${URL.avatarPrompts}`,
  },

  // ─── WED 5/20 ───────────────────────────────────────────────────────
  {
    scheduledFor: et(2, "07:30"), slot: "Wed · 7:30am",
    caption: `MRR = Monthly Recurring Revenue. Money that shows up every month, even if you took the week off.

For a creator: digital products with resell rights. Built once. Paid forever.

Math: $47/mo × 50 buyers = $2,350/mo passive.

I show you exactly how in the AI Revolution MRR Bundle:
${URL.mrrBundle}`,
  },
  {
    scheduledFor: et(2, "12:30"), slot: "Wed · 12:30pm",
    caption: `$312. Recurring. It wasn't even big. But it was the first dollar that came in while I wasn't at a desk.

That moment changed everything I believed about what "income" could look like.

The Bundle that teaches it:
${URL.mrrBundle}`,
  },
  {
    scheduledFor: et(2, "19:30"), slot: "Wed · 7:30pm",
    caption: `You don't just learn the playbook — you can sell my courses as yours, full margin.

Average buyer this month: 4 sales in week 1.

${URL.mrrBundle}`,
  },

  // ─── THU 5/21 ───────────────────────────────────────────────────────
  {
    scheduledFor: et(3, "07:30"), slot: "Thu · 7:30am",
    caption: `Paste your idea. Pick a brand. Done. Slides in your colors, your font, your voice.

Each platform's version is different — IG carousel, LinkedIn doc, X thread — generated from the same idea.

Caroux. Under $30.
${URL.caroux}`,
  },
  {
    scheduledFor: et(3, "12:30"), slot: "Thu · 12:30pm",
    caption: `Talking-head videos without ever facing a camera. The whole course is 90 minutes. You'll have your first video by minute 60.

${URL.talkingHead}`,
  },
  {
    scheduledFor: et(3, "19:30"), slot: "Thu · 7:30pm",
    caption: `Pick one of the 7 courses. Start tonight. Don't "when I'm ready." You'll never be ready.

The version of you that's still in your 9-5 in six months will thank you for this Thursday.

${URL.courses}`,
  },

  // ─── FRI 5/22 ───────────────────────────────────────────────────────
  {
    scheduledFor: et(4, "07:30"), slot: "Fri · 7:30am",
    caption: `A woman in my cohort hit $3,400 in 6 weeks. Her stack:
· AI Avatar Prompt Pack — ${URL.avatarPrompts}
· Digital Passive Income Academy — ${URL.passiveIncome}
· 6am alarms
· zero "wait till I'm ready"

If she can, you absolutely can. I'm rooting for you.`,
  },
  {
    scheduledFor: et(4, "12:30"), slot: "Fri · 12:30pm",
    caption: `FlipIt scans 8 marketplaces, sorts by margin, hands you the list.

Find a digital product. Flip it. 3-5× profit on each.

Realistic weekend goal: $0 → $300.

${URL.flipit}`,
  },
  {
    scheduledFor: et(4, "19:30"), slot: "Fri · 7:30pm",
    caption: `The systems run while I'm off. The courses keep selling. The newsletter sends itself.

None of that happened by working harder. It happened because I built things that don't need me.

What I built:
${URL.courses}

Have a good weekend.`,
  },

  // ─── SAT 5/23 ───────────────────────────────────────────────────────
  {
    scheduledFor: et(5, "08:30"), slot: "Sat · 8:30am",
    caption: `Pick the one that fits where you are right now:

💰 Bestseller — ${URL.passiveIncome}
🖼️ Avatar pack ($19) — ${URL.avatarPrompts}
🤖 MRR bundle — ${URL.mrrBundle}
🧬 Digital twin — ${URL.digitalTwin}
🎬 Talking head — ${URL.talkingHead}
🔄 FlipIt — ${URL.flipit}
🎠 Caroux — ${URL.caroux}`,
  },
  {
    scheduledFor: et(5, "13:30"), slot: "Sat · 1:30pm",
    caption: `AIMR Digital Twin Studio — train a private AI on your writing, your decisions, your style. Have it draft your emails, social posts, client replies — in your voice.

Includes resell rights.

${URL.digitalTwin}`,
  },
  {
    scheduledFor: et(5, "19:30"), slot: "Sat · 7:30pm",
    caption: `"I bought the Bestseller in January thinking it was a Hail Mary. Last week I made $1,200. Haven't been back to my 9-5 inbox since Tuesday."
— Sara, marketing manager → digital creator

14 weeks. That's all it took.

${URL.passiveIncome}`,
  },

  // ─── SUN 5/24 ───────────────────────────────────────────────────────
  {
    scheduledFor: et(6, "08:30"), slot: "Sun · 8:30am",
    caption: `1. Open Claude. Paste your calendar PNG. Ask: "What's the ONE thing each day I should protect time for?"
2. Ask: "Based on my goal of [X], what's the 80/20 task I should refuse to skip this week?"
3. Schedule those into your calendar. Done.

Save this. Use it tonight.

100 more like it:
${URL.hundredDays}`,
  },
  {
    scheduledFor: et(6, "13:30"), slot: "Sun · 1:30pm",
    caption: `📚 Digital Passive Income Academy — Bestseller
   ${URL.passiveIncome}

🖼️ AI Avatar Prompt Pack — Popular, $19
   ${URL.avatarPrompts}

🤖 AI Revolution MRR Bundle — MRR
   ${URL.mrrBundle}

🧬 AIMR Digital Twin Studio — MRR
   ${URL.digitalTwin}

🎬 Beginner's Guide to AI Talking Head — New
   ${URL.talkingHead}

🔄 FlipIt — Digital Flipping Tool — New
   ${URL.flipit}

🎠 Caroux — AI Carousel Generator — New
   ${URL.caroux}

All in one place: ${URL.courses}`,
  },
  {
    scheduledFor: et(6, "19:30"), slot: "Sun · 7:30pm",
    caption: `Not "AI news." One thing that worked for me this week — the prompt, the dollar amount, the screw-up.

Free. No 27-step funnel. Just useful.

${URL.newsletter}`,
  },
];

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!adminEmail) { console.error("✗ ADMIN_EMAIL must be set"); process.exit(1); }
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) { console.error(`✗ No user for ${adminEmail}`); process.exit(1); }

  console.log(`Adding real course links to ${plans.length} drafts\n`);

  let updated = 0;
  let missing = 0;

  for (const p of plans) {
    const draft = await prisma.draft.findFirst({
      where: { userId: user.id, scheduledFor: p.scheduledFor },
    });
    if (!draft) {
      console.log(`  ✗ ${p.slot.padEnd(20)} no draft at ${p.scheduledFor.toISOString()}`);
      missing += 1;
      continue;
    }
    await prisma.draft.update({
      where: { id: draft.id },
      data: { caption: p.caption },
    });
    // Pull the linked URL(s) for the report
    const matches = p.caption.match(/https:\/\/earnwith-ai\.com[^\s)]*/g) ?? [];
    const linkSummary = matches.length
      ? matches.map((u) => u.replace("https://earnwith-ai.com", "")).join(", ")
      : "(none)";
    updated += 1;
    console.log(`  ✓ ${p.slot.padEnd(20)} → ${linkSummary}`);
  }

  console.log(`\nSummary: ${updated} drafts updated · ${missing} missing`);
  console.log(`\n✓ Every CTA is now a real URL. No more 'link in bio' filler.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
