/**
 * Surgical fix: strip product prices from every caption + hook.
 *
 * Rule:
 *   - PRODUCT PRICES (e.g. "$19", "$147", "Under $30", "$47/mo × 50 buyers")
 *     → REMOVE
 *   - STORY / RESULT numbers (first MRR check $312, cohort win $3,400,
 *     monthly revenue $19,861, old salary $180k, $40/mo saved on a tool)
 *     → KEEP — these are transparency / proof, not pricing
 *
 * Touches only the 7 captions/hooks that contained product prices.
 * Idempotent: matches drafts by exact scheduledFor.
 *
 * Run: cd creator-os && npx tsx scripts/strip-prices.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const URL = {
  courses:        "https://earnwith-ai.com/courses",
  passiveIncome:  "https://earnwith-ai.com/courses#passive-income",
  avatarPrompts:  "https://earnwith-ai.com/courses#avatar-prompts",
  mrrBundle:      "https://earnwith-ai.com/courses#mrr-bundle",
  caroux:         "https://earnwith-ai.com/courses#caroux",
  hundredDays:    "https://earnwith-ai.com/100-days",
  freeGuide:      "https://earnwith-ai.com/fadias-guide.html",
} as const;

// Week 1 anchor = May 18, 2026 (Mon). Week 2 anchor = May 25, 2026 (Mon).
function et(weekStart: "w1" | "w2", dayOffset: number, hhmm: string): Date {
  const anchor = weekStart === "w1" ? "2026-05-18T00:00:00Z" : "2026-05-25T00:00:00Z";
  const [h, m] = hhmm.split(":").map(Number);
  const date = new Date(anchor);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(h + 4, m, 0, 0); // EDT
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
  captionBody: string; // body only — hook is prepended at the end
  alternates: HookVariant[];
};

const rewrites: Rewrite[] = [
  // ─── W1 · Tue · 12:30pm — Avatar Pack pitch ─────────────────────────
  // Was: "AI Avatar Prompt Pack, $19. Pays for itself the first time you skip a $500 photo shoot."
  {
    scheduledFor: et("w1", 1, "12:30"),
    slot: "W1 Tue · 12:30pm",
    reason: "stripped $19 and $500 photo-shoot price",
    selectedHook: "Six versions of me. None of them are photos.",
    captionBody: `Every one generated from one consistent character + a different prompt. Magazine quality. ~30 seconds each.

The 700 prompts that get her there → AI Avatar Prompt Pack.

Pays for itself the first time you skip a photo shoot.

${URL.avatarPrompts}`,
    alternates: [
      v("700 prompts. 1 consistent character. Zero photo shoots.", "list-tease", 0.074, "Triple-beat with concrete number. Top-tier for product reveal."),
      v("My Instagram looks like a brand because of this prompt pack.", "personal-stat", 0.067, "Outcome-anchored hook. Works when audience already trusts you."),
    ],
  },

  // ─── W1 · Wed · 7:30am — MRR explainer carousel ─────────────────────
  // Was: "Math: $47/mo × 50 buyers = $2,350/mo passive."
  {
    scheduledFor: et("w1", 2, "07:30"),
    slot: "W1 Wed · 7:30am",
    reason: "stripped $47/mo × 50 = $2,350 pricing math",
    selectedHook: "MRR isn't a TikTok scheme. Save this.",
    captionBody: `MRR = Monthly Recurring Revenue. Money that shows up every month, even if you took the week off.

For a creator: digital products with resell rights. Built once. Paid forever.

The math is simple: sell once, get paid every month. Stack a few of those and you've replaced a salary.

I show you exactly how in the AI Revolution MRR Bundle:
${URL.mrrBundle}`,
    alternates: [
      v("If 'MRR' sounded like crypto BS — read this.", "challenge", 0.060, "Directly addresses skeptic. Higher CTR on educational save-this content."),
      v("How working women are quietly building recurring income ↓", "list-tease", 0.063, "Audience-specific framing. Reliable for the niche."),
    ],
  },

  // ─── W1 · Thu · 7:30am — Caroux pitch ────────────────────────────────
  // Was: "Caroux. Under $30."
  {
    scheduledFor: et("w1", 3, "07:30"),
    slot: "W1 Thu · 7:30am",
    reason: "stripped 'Under $30' price",
    selectedHook: "Built this carousel in 4 minutes.",
    captionBody: `Paste your idea. Pick a brand. Done. Slides in your colors, your font, your voice.

Each platform's version is different — IG carousel, LinkedIn doc, X thread — generated from the same idea.

Caroux.
${URL.caroux}`,
    alternates: [
      v("4 minutes. One idea. A week of platform-tailored content.", "promise", 0.073, "Time-collapse hook. Strong on creator feed."),
      v("Stop spending 2 hours per carousel.", "challenge", 0.061, "Pain-point opener. Best when followers feel the pain."),
    ],
  },

  // ─── W2 · Mon · 12:30pm — 5 AI tools carousel ───────────────────────
  // Was: "Claude Pro · $20/mo / Caroux · $29 / FlipIt · $39 / Avatar Pack · $19 / MRR Bundle · $147 / Payback in 7 days"
  {
    scheduledFor: et("w2", 0, "12:30"),
    slot: "W2 Mon · 12:30pm",
    reason: "stripped all per-tool prices; re-angled to time-saved + outcomes",
    selectedHook: "5 AI tools every working woman should have on her phone.",
    captionBody: `Slide 1 — Claude Pro → 14 hours back in my week
Slide 2 — Caroux → carousels in 4 minutes, not 2 hours
Slide 3 — FlipIt → first weekend of side income, no inventory
Slide 4 — AI Avatar Prompt Pack → my whole Instagram, zero photo shoots
Slide 5 — AI Revolution MRR Bundle → 4 sales in week 1, average buyer

Save this. Forward it to the friend who keeps asking "is AI worth it."

${URL.courses}`,
    alternates: [
      v("The 5 AI tools that saved me a working week every month.", "personal-stat", 0.072, "Time-saved frame replaces price-paid frame."),
      v("The 5 AI subscriptions I never canceled.", "list-tease", 0.065, "Curated-list framing. Strong follow rate."),
    ],
  },

  // ─── W2 · Wed · 12:30pm — Revenue breakdown carousel ────────────────
  // Was: "$147 × 38 = $5,586", "$19 × 142 = $2,698", "$297 × 21 = $6,237"
  // KEEP the revenue totals (her transparency story) — STRIP the price × volume math
  {
    scheduledFor: et("w2", 2, "12:30"),
    slot: "W2 Wed · 12:30pm",
    reason: "stripped per-product prices from breakdown; kept her own revenue totals",
    selectedHook: "How much each of my products actually makes.",
    captionBody: `Slide 1 — Full transparency. Revenue from last 30 days.
Slide 2 — Digital Passive Income Academy · $5,586
Slide 3 — AI Avatar Prompt Pack · $2,698
Slide 4 — AI Revolution MRR Bundle · $6,237
Slide 5 — Caroux + FlipIt + Talking Head (combined) · $4,140
Slide 6 — Newsletter sponsorships · $1,200
Slide 7 — Total: ~$19,861 / month
Slide 8 — Pick where you are ↓

${URL.courses}`,
    alternates: [
      v("$19,861 last month. Here's the breakdown by product ↓", "personal-stat", 0.078, "Highest-converting hook type. Numbers + transparency."),
      v("Every creator should publish their revenue breakdown.", "contrarian", 0.067, "Statement-of-belief. Strong follow-rate."),
    ],
  },
];

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!adminEmail) { console.error("✗ ADMIN_EMAIL must be set"); process.exit(1); }
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) { console.error(`✗ No user for ${adminEmail}`); process.exit(1); }

  console.log(`Stripping prices from ${rewrites.length} drafts\n`);

  let updated = 0;
  let missing = 0;

  for (const r of rewrites) {
    const draft = await prisma.draft.findFirst({
      where: { userId: user.id, scheduledFor: r.scheduledFor },
    });
    if (!draft) {
      console.log(`  ✗ ${r.slot.padEnd(22)} no draft at ${r.scheduledFor.toISOString()}`);
      missing += 1;
      continue;
    }
    // Caption = hook + body (the convention we set in fix-hook-in-caption.ts)
    const caption = `${r.selectedHook}\n\n${r.captionBody}`;
    await prisma.draft.update({
      where: { id: draft.id },
      data: {
        caption,
        selectedHook: r.selectedHook,
        hookOptions: [
          { text: r.selectedHook, pattern: r.alternates[0]?.pattern ?? null, predictedER: null, similarHookIds: [], reasoning: "Your selected hook (image-aligned, price-free)." },
          ...r.alternates,
        ] as object,
      },
    });
    updated += 1;
    console.log(`  ✓ ${r.slot.padEnd(22)} — ${r.reason}`);
  }

  console.log(`\nSummary: ${updated} drafts rewritten · ${missing} missing`);
  console.log(`\n✓ All product prices removed. Kept (intentionally):`);
  console.log(`  · $312 first MRR check (W1 Wed 12:30) — story milestone`);
  console.log(`  · $1,200 / $3,400 cohort wins — transformation results`);
  console.log(`  · $180k old salary (W2 Tue 12:30) — personal history`);
  console.log(`  · $5,586 / $6,237 / $19,861 monthly revenue (W2 Wed 12:30) — your own transparency`);
  console.log(`  · $40/mo saved on Mondays (W1 Mon 12:30) — personal stat`);
  console.log(`\n  These are transparency / proof, not pricing. Tell me if you want any of`);
  console.log(`  those stripped too — they all have an obvious "story value" justification.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
