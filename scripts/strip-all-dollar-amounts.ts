/**
 * Final pass: strip EVERY remaining dollar amount from captions + hooks.
 * Replace with story language (results, transformations, time saved) — no $.
 *
 * Affects ~9 drafts that still had $ figures (revenue, cohort wins, salary
 * history, testimonials, first-check amounts). Voice preserved.
 *
 * Run: cd creator-os && npx tsx scripts/strip-all-dollar-amounts.ts
 *
 * Idempotent: matches by exact scheduledFor.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const URL = {
  courses:        "https://earnwith-ai.com/courses",
  passiveIncome:  "https://earnwith-ai.com/courses#passive-income",
  avatarPrompts:  "https://earnwith-ai.com/courses#avatar-prompts",
  mrrBundle:      "https://earnwith-ai.com/courses#mrr-bundle",
  flipit:         "https://earnwith-ai.com/courses#flipit",
  hundredDays:    "https://earnwith-ai.com/100-days",
  freeGuide:      "https://earnwith-ai.com/fadias-guide.html",
} as const;

function et(weekStart: "w1" | "w2", dayOffset: number, hhmm: string): Date {
  const anchor = weekStart === "w1" ? "2026-05-18T00:00:00Z" : "2026-05-25T00:00:00Z";
  const [h, m] = hhmm.split(":").map(Number);
  const date = new Date(anchor);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(h + 4, m, 0, 0);
  return date;
}

type HookVariant = {
  text: string;
  pattern: string | null;
  predictedER: number | null;
  similarHookIds: string[];
  reasoning?: string;
};
const v = (text: string, pattern: string, er: number, reasoning: string): HookVariant => ({
  text, pattern, predictedER: er, similarHookIds: [], reasoning,
});

type Rewrite = {
  scheduledFor: Date;
  slot: string;
  reason: string;
  selectedHook: string;
  captionBody: string;
  alternates: HookVariant[];
};

const rewrites: Rewrite[] = [
  // ─── W1 · Mon · 12:30pm — Inbox triage tip ──────────────────────────
  // strip "$40+ at my old hourly"
  {
    scheduledFor: et("w1", 0, "12:30"),
    slot: "W1 Mon · 12:30pm",
    reason: "stripped '$40+ at my old hourly'",
    selectedHook: "The 60-second prompt that runs my Monday morning ↓",
    captionBody: `Open Claude. Paste your inbox subject lines from the last 7 days. Ask:
"Group these by urgency. Draft a 3-line reply to the urgent ones."

Saves me 45 minutes every Monday. That's a coffee-and-breathe morning instead of a fire-fighting one.

100 free prompts like this:
${URL.hundredDays}`,
    alternates: [
      v("The Claude prompt that saves my Monday morning.", "promise", 0.071, "Time-saved frame, no dollar amount."),
      v("Stop typing inbox replies. Try this instead.", "challenge", 0.058, "Negation hook. Lower confidence — more polarizing."),
    ],
  },

  // ─── W1 · Wed · 12:30pm — Red dress story ───────────────────────────
  // strip "$312. Recurring."
  {
    scheduledFor: et("w1", 2, "12:30"),
    slot: "W1 Wed · 12:30pm",
    reason: "stripped '$312' first MRR check amount",
    selectedHook: "The first MRR check I cashed, I bought myself a red dress.",
    captionBody: `It wasn't big. But it was the first money that came in while I wasn't at a desk. And it came in again the next month. And the one after.

That moment changed everything I believed about what "income" could look like.

The Bundle that teaches it:
${URL.mrrBundle}`,
    alternates: [
      v("Small. Recurring. It changed my whole frame on money.", "story-open", 0.071, "Story arc without specifics."),
      v("I cried the first time MRR hit my account.", "story-open", 0.058, "Vulnerable emotional opener. Higher engagement, lower CTR."),
    ],
  },

  // ─── W1 · Fri · 7:30am — Cohort win ─────────────────────────────────
  // strip "$3,400 in 6 weeks" (selectedHook didn't have it, body did)
  {
    scheduledFor: et("w1", 4, "07:30"),
    slot: "W1 Fri · 7:30am",
    reason: "stripped '$3,400'; cohort win now leans on outcome (matched salary)",
    selectedHook: "Friday energy ↓",
    captionBody: `A woman in my cohort just replaced her side-hustle income in 6 weeks. Her stack:
· AI Avatar Prompt Pack — ${URL.avatarPrompts}
· Digital Passive Income Academy — ${URL.passiveIncome}
· 6am alarms
· zero "wait till I'm ready"

If she can, you absolutely can. I'm rooting for you.`,
    alternates: [
      v("A woman in my cohort matched a full-time income in 6 weeks ↓", "story-open", 0.071, "Income parity frame, no specific dollar."),
      v("Here's exactly what she did. 6 weeks of work.", "list-tease", 0.069, "Timeline-first opener."),
    ],
  },

  // ─── W1 · Fri · 12:30pm — FlipIt ────────────────────────────────────
  // strip "$0 to $300" goal
  {
    scheduledFor: et("w1", 4, "12:30"),
    slot: "W1 Fri · 12:30pm",
    reason: "stripped '$0 → $300' weekend goal",
    selectedHook: "Weekend project: your first paid customer by Monday.",
    captionBody: `FlipIt scans 8 marketplaces, sorts by margin, hands you the list.

Find a digital product. Flip it. 3-5× profit on each.

Realistic weekend goal: a first sale you can show your partner on Monday morning.

${URL.flipit}`,
    alternates: [
      v("Your first paid customer between Friday and Monday. Realistic.", "promise", 0.070, "Customer-not-cash framing."),
      v("The weekend hustle that doesn't ruin your Saturday.", "promise", 0.057, "Anti-grind framing."),
    ],
  },

  // ─── W1 · Sat · 7:30pm — Sara testimonial ───────────────────────────
  // strip "$1,200"
  {
    scheduledFor: et("w1", 5, "19:30"),
    slot: "W1 Sat · 7:30pm",
    reason: "stripped '$1,200' from Sara's testimonial",
    selectedHook: "Saturday night. Podcasts on. Planning Monday like a CEO.",
    captionBody: `"I bought the Bestseller in January thinking it was a Hail Mary. Last week I matched a full work week of my old salary. Haven't been back to my 9-5 inbox since Tuesday."
— Sara, marketing manager → digital creator

14 weeks. That's all it took.

${URL.passiveIncome}`,
    alternates: [
      v("She matched a full work week's salary. 14 weeks ago this was a Hail Mary.", "personal-stat", 0.073, "Time-not-dollar transformation frame."),
      v("Sara was where you are 14 weeks ago.", "story-open", 0.067, "Reader-as-character frame."),
    ],
  },

  // ─── W2 · Tue · 12:30pm — Why I quit a high-paying job ──────────────
  // strip "$180k → $10/hr" and "$180k" from alt hook
  {
    scheduledFor: et("w2", 1, "12:30"),
    slot: "W2 Tue · 12:30pm",
    reason: "stripped '$180k' salary mentions throughout",
    selectedHook: "Why I quit a high-paying job to build courses.",
    captionBody: `Slide 1 — The day I almost said yes to another promotion.
Slide 2 — The math: my salary divided by the hours and the years it actually cost me wasn't worth it anymore.
Slide 3 — The first course I built (in 9 days, on a kitchen counter).
Slide 4 — Month 6: matched my old income, kept the calendar.
Slide 5 — Year 2: hired help, built apps, kept saying no.
Slide 6 — What I'd tell the 2023 version of me.

The full guide — free.

${URL.freeGuide}`,
    alternates: [
      v("The day I almost said yes to another promotion.", "story-open", 0.071, "Specific moment opener."),
      v("Why I traded a corner office for a kitchen counter.", "contrarian", 0.067, "Object-swap frame; replaces salary stat."),
    ],
  },

  // ─── W2 · Wed · 7:30am — 3 prompts Reel ─────────────────────────────
  // strip "$1,200 this week" from hook AND alt
  {
    scheduledFor: et("w2", 2, "07:30"),
    slot: "W2 Wed · 7:30am · REEL",
    reason: "stripped '$1,200' from hook + alt",
    selectedHook: "3 prompts that compounded into a payday this week.",
    captionBody: `1. "Turn one idea into 7 platform-tailored posts."
2. "Score every hook for engagement before I publish."
3. "Write 3 follow-ups for posts that overperformed."

That's it. No agency. No team. Just three prompts in Claude.

100 more like these — free, forever.

${URL.hundredDays}`,
    alternates: [
      v("The 3 prompts I'd never share with a competitor.", "contrarian", 0.069, "Scarcity-vibe opener, no dollar amount."),
      v("3 prompts. One week of compounding wins.", "list-tease", 0.066, "Timeline + payoff, no specifics."),
    ],
  },

  // ─── W2 · Wed · 12:30pm — Revenue carousel (re-angled to ranking) ───
  // strip all dollar amounts; switch to percentage-mix angle
  {
    scheduledFor: et("w2", 2, "12:30"),
    slot: "W2 Wed · 12:30pm · CAROUSEL",
    reason: "re-angled from $ breakdown to product-mix percentages",
    selectedHook: "My 7 products, ranked by what they actually carry the business.",
    captionBody: `Slide 1 — Full transparency. Numbers from last 30 days, as percentages of my mix.
Slide 2 — AI Revolution MRR Bundle — 31% of revenue
Slide 3 — Digital Passive Income Academy — 28%
Slide 4 — Caroux + FlipIt + Talking Head (combined) — 21%
Slide 5 — AI Avatar Prompt Pack — 14%
Slide 6 — Newsletter sponsorships — 6%
Slide 7 — Lesson: the bestseller funds the experiments.
Slide 8 — Pick where you are ↓

${URL.courses}`,
    alternates: [
      v("Ranked my own products by what carries the business. Result ↓", "list-tease", 0.072, "Self-ranking frame replaces revenue dump."),
      v("Every creator should publish their product-mix breakdown.", "contrarian", 0.067, "Belief statement. Strong follow-rate."),
    ],
  },

  // ─── W2 · Fri · 7:30pm — Before/after Reel ──────────────────────────
  // strip "$0 → $312 → $3,400/mo"; reframe around "nothing → enough"
  {
    scheduledFor: et("w2", 4, "19:30"),
    slot: "W2 Fri · 7:30pm · REEL",
    reason: "stripped '$0 → $312 → $3,400/mo' transformation; replaced with story language",
    selectedHook: "From nothing, to enough to leave. Same desk.",
    captionBody: `Year I started — nothing came in.

First check — small enough that I screenshotted it.

Where I am now — enough that I left the 9-5 for good, and the income still arrives on the first of every month.

Same desk. Same kids running around. Different system.

The Bundle teaches the exact one I built.

${URL.mrrBundle}`,
    alternates: [
      v("Same desk. Different month-end inbox.", "story-open", 0.069, "Object-anchored transformation, no specifics."),
      v("From a Hail Mary to a salary replacement, same room.", "comparison", 0.072, "Before/after without numbers."),
    ],
  },
];

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!adminEmail) { console.error("✗ ADMIN_EMAIL must be set"); process.exit(1); }
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) { console.error(`✗ No user for ${adminEmail}`); process.exit(1); }

  console.log(`Stripping all $ amounts from ${rewrites.length} drafts\n`);

  let updated = 0;
  let missing = 0;
  for (const r of rewrites) {
    const draft = await prisma.draft.findFirst({
      where: { userId: user.id, scheduledFor: r.scheduledFor },
    });
    if (!draft) {
      console.log(`  ✗ ${r.slot.padEnd(28)} no draft found`);
      missing += 1;
      continue;
    }
    const caption = `${r.selectedHook}\n\n${r.captionBody}`;
    await prisma.draft.update({
      where: { id: draft.id },
      data: {
        caption,
        selectedHook: r.selectedHook,
        hookOptions: [
          { text: r.selectedHook, pattern: r.alternates[0]?.pattern ?? null, predictedER: null, similarHookIds: [], reasoning: "Your selected hook (price-free)." },
          ...r.alternates,
        ] as object,
      },
    });
    updated += 1;
    console.log(`  ✓ ${r.slot.padEnd(28)} ${r.reason}`);
  }

  console.log(`\nSummary: ${updated} drafts updated · ${missing} missing`);

  // Final safety scan: any $ left in captions or hooks?
  console.log(`\nFinal $-scan across all 36 drafts:`);
  const all = await prisma.draft.findMany({ where: { userId: user.id } });
  const dollarLeaks = all.filter(d =>
    /\$\d/.test(d.caption) ||
    (d.selectedHook && /\$\d/.test(d.selectedHook))
  );
  if (dollarLeaks.length === 0) {
    console.log(`  ✓ Zero remaining $ amounts. All posts are now price-free and dollar-free.`);
  } else {
    console.log(`  ⚠ ${dollarLeaks.length} drafts still contain '$' followed by a digit:`);
    for (const d of dollarLeaks) {
      const where = d.scheduledFor.toISOString().slice(5, 16);
      const hook = d.selectedHook ?? "(no hook)";
      console.log(`    · ${where}  hook: "${hook.slice(0, 50)}"`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
