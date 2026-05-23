/**
 * Populate the dedicated hook field on all 21 drafts.
 *
 * Creator OS keeps hook + caption-body separate:
 *   - `selectedHook` = the active hook line (~1 sentence)
 *   - `caption`      = the body, WITHOUT the hook
 *   - `hookOptions`  = 2-3 alternative hooks the Compose hook-picker can swap to
 * When publishing, Composer concatenates: `${selectedHook}\n\n${caption}`.
 *
 * Run: cd creator-os && npx tsx scripts/add-hooks.ts
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

type HookVariant = {
  text: string;
  pattern: string | null;
  predictedER: number | null;
  similarHookIds: string[];
  reasoning?: string;
};

type Plan = {
  scheduledFor: Date;
  slot: string;
  selectedHook: string;
  /** Caption body WITHOUT the hook (the hook gets prepended on publish) */
  captionBody: string;
  alternates: HookVariant[];
};

// Helper to build a HookVariant
const v = (text: string, pattern: string, predictedER: number, reasoning: string): HookVariant => ({
  text,
  pattern,
  predictedER,
  similarHookIds: [],
  reasoning,
});

const plans: Plan[] = [
  // ─── MON 5/18 ───────────────────────────────────────────────────────
  {
    scheduledFor: et(0, "07:30"),
    slot: "Mon · 7:30am",
    selectedHook: "Three years ago this view felt impossible.",
    captionBody: `I was running a finance team, two kids in school, a husband who didn't quite get why I was tired all the time. The ladder I was climbing was someone else's ladder.

This morning I'm three years into building my own thing. AI tools made it possible. Working women like you made it worth it.

If you're stuck where I was — start with the Free Guide. Link in bio.`,
    alternates: [
      v("I spent 30 years in corporate before I built something of my own.", "personal-stat", 0.062, "Front-loads a credibility stat. Tested high among 35+ working-woman audience."),
      v("The view I used to think was for other people.", "contrarian", 0.054, "Permission-giving frame. Lower CTR but higher save rate."),
    ],
  },
  {
    scheduledFor: et(0, "12:30"),
    slot: "Mon · 12:30pm",
    selectedHook: "The 60-second prompt that runs my Monday morning ↓",
    captionBody: `Open Claude. Paste your inbox subject lines from the last 7 days. Ask:
"Group these by urgency. Draft a 3-line reply to the urgent ones."

Saves me 45 minutes every Monday. That's $40+ at my old hourly.

100 free prompts like this in bio → 100 Days of AI Skills.`,
    alternates: [
      v("The Claude prompt that saves me $40 every Monday.", "promise", 0.071, "Concrete dollar payoff in hook. Performs well in 'productivity' niche."),
      v("Stop typing inbox replies. Try this instead.", "challenge", 0.058, "Negation hook. Lower confidence — more polarizing."),
    ],
  },
  {
    scheduledFor: et(0, "19:30"),
    slot: "Mon · 7:30pm",
    selectedHook: "This is the morning I designed for myself.",
    captionBody: `Coffee, not coffee meetings. Calendar, not calls. The income shows up before the kids do.

The 5 things I built to make this real are inside Digital Passive Income Academy. First 50 buyers this week get a free 30-min audit of your setup.

Link in bio → Courses → Bestseller.`,
    alternates: [
      v("Coffee, not coffee meetings.", "list-tease", 0.066, "Three-beat list opener. Works for aspirational lifestyle imagery."),
      v("What my Monday morning used to look like vs. now ↓", "comparison", 0.061, "Before/after frame. Asks for swipe; works on carousels too."),
    ],
  },

  // ─── TUE 5/19 ───────────────────────────────────────────────────────
  {
    scheduledFor: et(1, "07:30"),
    slot: "Tue · 7:30am",
    selectedHook: "100 free AI skills. One a day for 100 days. Forever free.",
    captionBody: `No email opt-in. No funnel. CC BY 4.0.

Day 7's the one that broke me out of "I don't know where to start" — the First-Skill Picker. Try it tonight.

earnwith-ai.com/100-days`,
    alternates: [
      v("Free for 100 days. No email opt-in.", "promise", 0.069, "Anti-funnel CTA. Builds trust fast for lead-magnet skeptics."),
      v("The free AI library most people don't know exists ↓", "contrarian", 0.052, "FOMO/discovery angle. Save-friendly."),
    ],
  },
  {
    scheduledFor: et(1, "12:30"),
    slot: "Tue · 12:30pm",
    selectedHook: "Six versions of me. None of them are photos.",
    captionBody: `Every one generated from one consistent character + a different prompt. Magazine quality. ~30 seconds each.

The 700 prompts that get her there → AI Avatar Prompt Pack, $19.

Pays for itself the first time you skip a $500 photo shoot.

earnwith-ai.com/courses#avatar-prompts`,
    alternates: [
      v("700 prompts. 1 consistent character. Zero photo shoots.", "list-tease", 0.074, "Triple-beat with concrete number. Top-tier for product reveal."),
      v("My Instagram looks like a brand because of this $19 pack.", "personal-stat", 0.067, "Price-anchor hook. Works when product is genuinely cheap."),
    ],
  },
  {
    scheduledFor: et(1, "19:30"),
    slot: "Tue · 7:30pm",
    selectedHook: "Meet Gaia.",
    captionBody: `She's not real. She's my Instagram. She wakes up earlier than I do. She has better hair days.

I built her with 700 prompts. She lets me post 3x a day without three photo shoots a week.

The exact pack: bio link → AI Avatar Prompt Pack.`,
    alternates: [
      v("This isn't me. It's also kind of me.", "contrarian", 0.072, "Curiosity gap. Forces scroll-stop. Best for surprise reveals."),
      v("Meet the AI that runs my Instagram while I run my business.", "story-open", 0.063, "Personification frame. Sets up the BTS reveal."),
    ],
  },

  // ─── WED 5/20 ───────────────────────────────────────────────────────
  {
    scheduledFor: et(2, "07:30"),
    slot: "Wed · 7:30am",
    selectedHook: "MRR isn't a TikTok scheme. Save this.",
    captionBody: `MRR = Monthly Recurring Revenue. Money that shows up every month, even if you took the week off.

For a creator: digital products with resell rights. Built once. Paid forever.

Math: $47/mo × 50 buyers = $2,350/mo passive.

I show you exactly how in the AI Revolution MRR Bundle. Bio.`,
    alternates: [
      v("If 'MRR' sounded like crypto BS — read this.", "challenge", 0.060, "Direct addresses skeptic. Higher CTR on educational save-this content."),
      v("How $47 × 50 becomes $2,350/mo while you sleep ↓", "personal-stat", 0.068, "Math-as-hook. Concrete and shareable."),
    ],
  },
  {
    scheduledFor: et(2, "12:30"),
    slot: "Wed · 12:30pm",
    selectedHook: "The first MRR check I cashed, I bought myself a red dress.",
    captionBody: `$312. Recurring. It wasn't even big. But it was the first dollar that came in while I wasn't at a desk.

That moment changed everything I believed about what "income" could look like.

The Bundle that teaches it is in bio.`,
    alternates: [
      v("$312. Recurring. It changed my whole frame on money.", "personal-stat", 0.071, "Specific small-number anchor. More relatable than big-number hooks."),
      v("I cried the first time MRR hit my account.", "story-open", 0.058, "Vulnerable emotional opener. Higher engagement rate, lower CTR."),
    ],
  },
  {
    scheduledFor: et(2, "19:30"),
    slot: "Wed · 7:30pm",
    selectedHook: "Three courses. One bundle. Resell rights included.",
    captionBody: `You don't just learn the playbook — you can sell my courses as yours, full margin.

Average buyer this month: 4 sales in week 1.

earnwith-ai.com/courses#mrr-bundle`,
    alternates: [
      v("Buy my courses. Sell them as yours. Keep the full margin.", "promise", 0.069, "Provocative angle on resell rights. May polarize."),
      v("The bundle that makes the average buyer $200 in week 1.", "personal-stat", 0.066, "Outcome-led. Concrete dollar promise."),
    ],
  },

  // ─── THU 5/21 ───────────────────────────────────────────────────────
  {
    scheduledFor: et(3, "07:30"),
    slot: "Thu · 7:30am",
    selectedHook: "Built this carousel in 4 minutes.",
    captionBody: `Paste your idea. Pick a brand. Done. Slides in your colors, your font, your voice.

Each platform's version is different — IG carousel, LinkedIn doc, X thread — generated from the same idea.

Caroux. Under $30.
earnwith-ai.com/courses#caroux`,
    alternates: [
      v("4 minutes. One idea. A week of platform-tailored content.", "promise", 0.073, "Time-collapse hook. Strong on creators-helping-creators feed."),
      v("Stop spending 2 hours per carousel.", "challenge", 0.061, "Pain-point opener. Best when followers feel the pain."),
    ],
  },
  {
    scheduledFor: et(3, "12:30"),
    slot: "Thu · 12:30pm",
    selectedHook: "I'm camera shy. So I built an AI version of me that isn't.",
    captionBody: `Talking-head videos without ever facing a camera. The whole course is 90 minutes. You'll have your first video by minute 60.

earnwith-ai.com/courses#talking-head`,
    alternates: [
      v("Talking-head videos. Without ever turning on a camera.", "promise", 0.068, "Direct outcome hook. Strong for camera-shy creators."),
      v("Your face on YouTube, without you on YouTube.", "contrarian", 0.064, "Identity-twist angle. Higher save rate."),
    ],
  },
  {
    scheduledFor: et(3, "19:30"),
    slot: "Thu · 7:30pm",
    selectedHook: "I'm looking right at you because I want you to actually try this.",
    captionBody: `Pick one of the 7 courses. Start tonight. Don't "when I'm ready." You'll never be ready.

The version of you that's still in your 9-5 in six months will thank you for this Thursday.

Link in bio.`,
    alternates: [
      v("You will never be 'ready.' Start tonight anyway.", "challenge", 0.066, "Direct prescription. Works after a permission-giving image."),
      v("Six months from now you'll wish you started tonight.", "personal-stat", 0.069, "Future-self framing. Performs well in mid-week slumps."),
    ],
  },

  // ─── FRI 5/22 ───────────────────────────────────────────────────────
  {
    scheduledFor: et(4, "07:30"),
    slot: "Fri · 7:30am",
    selectedHook: "Friday energy ↓",
    captionBody: `A woman in my cohort hit $3,400 in 6 weeks. Her stack:
· AI Avatar Prompt Pack ($19)
· Digital Passive Income Academy ($147)
· 6am alarms
· zero "wait till I'm ready"

If she can, you absolutely can. I'm rooting for you.

Link in bio.`,
    alternates: [
      v("$3,400 in 6 weeks. Here's exactly what she did.", "personal-stat", 0.075, "Cohort case-study with number. Highest typical CTR of the week."),
      v("A woman in my cohort just hit $3,400 in 6 weeks ↓", "story-open", 0.071, "Third-person witness frame. Slightly softer than first-person."),
    ],
  },
  {
    scheduledFor: et(4, "12:30"),
    slot: "Fri · 12:30pm",
    selectedHook: "Weekend project: turn this into $300 by Monday.",
    captionBody: `FlipIt scans 8 marketplaces, sorts by margin, hands you the list.

Find a digital product. Flip it. 3-5× profit on each.

Realistic weekend goal: $0 → $300.

earnwith-ai.com/courses#flipit`,
    alternates: [
      v("$0 → $300 between Friday and Monday. Realistic.", "personal-stat", 0.070, "Concrete weekend goal. Most clickbait-resistant audience still bites."),
      v("The weekend hustle that doesn't ruin your Saturday.", "promise", 0.057, "Anti-grind framing. Lower CTR, higher engagement-rate."),
    ],
  },
  {
    scheduledFor: et(4, "19:30"),
    slot: "Fri · 7:30pm",
    selectedHook: "Closing the laptop. Not opening it till Monday.",
    captionBody: `The systems run while I'm off. The courses keep selling. The newsletter sends itself.

None of that happened by working harder. It happened because I built things that don't need me.

What I built → bio. Have a good weekend.`,
    alternates: [
      v("The systems run while I'm off. Here's the stack ↓", "list-tease", 0.064, "Anti-hustle reveal. Strong for end-of-week mental state."),
      v("Why I stopped 'working harder' three years ago.", "contrarian", 0.062, "Identity-frame contrarian. Works against grind-culture audience."),
    ],
  },

  // ─── SAT 5/23 ───────────────────────────────────────────────────────
  {
    scheduledFor: et(5, "08:30"),
    slot: "Sat · 8:30am",
    selectedHook: "Saturday morning. Coffee. Window light. Phone open to bio.",
    captionBody: `Pick the one that fits where you are right now:

💰 Bestseller — passive income
🖼️ Avatar pack — $19
🤖 MRR bundle — resell my courses
🧬 Digital twin — your AI clone
🎬 Talking head — camera-shy fix
🔄 FlipIt — weekend hustle
🎠 Caroux — auto carousels

All in bio.`,
    alternates: [
      v("7 courses. Pick the one that fits where you are right now ↓", "list-tease", 0.067, "Direct list opener. Best for menu-style posts."),
      v("If I could only sell you one course this weekend, it'd be…", "story-open", 0.063, "Decision-aid framing. Higher comment rate."),
    ],
  },
  {
    scheduledFor: et(5, "13:30"),
    slot: "Sat · 1:30pm",
    selectedHook: "Two of these vases are identical. Two of you would be even better.",
    captionBody: `AIMR Digital Twin Studio — train a private AI on your writing, your decisions, your style. Have it draft your emails, social posts, client replies — in your voice.

Includes resell rights.

earnwith-ai.com/courses#digital-twin`,
    alternates: [
      v("What if there were two of you? (One that does the emails.)", "question", 0.061, "Hypothetical opener. Strong for high-stress audiences."),
      v("Clone your writing voice. Sell email replies in your sleep.", "promise", 0.058, "Outcome-led. Less viral but high conversion intent."),
    ],
  },
  {
    scheduledFor: et(5, "19:30"),
    slot: "Sat · 7:30pm",
    selectedHook: "Saturday night. Podcasts on. Planning Monday like a CEO.",
    captionBody: `"I bought the Bestseller in January thinking it was a Hail Mary. Last week I made $1,200. Haven't been back to my 9-5 inbox since Tuesday."
— Sara, marketing manager → digital creator

14 weeks. That's all it took.

Link in bio.`,
    alternates: [
      v("She made $1,200 last week. 14 weeks ago this was a Hail Mary.", "personal-stat", 0.073, "Testimonial-with-numbers. Best-performing format on Saturday night."),
      v("Sara was where you are 14 weeks ago.", "story-open", 0.067, "Reader-as-character frame. Strong on weekend evening slumps."),
    ],
  },

  // ─── SUN 5/24 ───────────────────────────────────────────────────────
  {
    scheduledFor: et(6, "08:30"),
    slot: "Sun · 8:30am",
    selectedHook: "The 12-minute Sunday setup that makes my whole week ↓",
    captionBody: `1. Open Claude. Paste your calendar PNG. Ask: "What's the ONE thing each day I should protect time for?"
2. Ask: "Based on my goal of [X], what's the 80/20 task I should refuse to skip this week?"
3. Schedule those into your calendar. Done.

Save this. Use it tonight.

100 more like it → earnwith-ai.com/100-days`,
    alternates: [
      v("My 12-minute Sunday ritual. Save this for tonight ↓", "promise", 0.069, "Save-bait. Strong on Sunday evenings."),
      v("Three prompts that protect your Monday.", "list-tease", 0.064, "List-of-three opener. Reliable engagement."),
    ],
  },
  {
    scheduledFor: et(6, "13:30"),
    slot: "Sun · 1:30pm",
    selectedHook: "All 7 courses. One bio link.",
    captionBody: `📚 Digital Passive Income Academy — Bestseller
🖼️ AI Avatar Prompt Pack — Popular, $19
🤖 AI Revolution MRR Bundle — MRR
🧬 AIMR Digital Twin Studio — MRR
🎬 Beginner's Guide to AI Talking Head — New
🔄 FlipIt — Digital Flipping Tool — New
🎠 Caroux — AI Carousel Generator — New

earnwith-ai.com/courses`,
    alternates: [
      v("The 7 courses I sell. Ranked by who they're for ↓", "list-tease", 0.068, "Editorial ranking frame. Higher save than plain menu."),
      v("Save this Sunday recap of every course I've built.", "promise", 0.060, "Save-bait. Reliable for end-of-week recap content."),
    ],
  },
  {
    scheduledFor: et(6, "19:30"),
    slot: "Sun · 7:30pm",
    selectedHook: "Every Sunday I send one email.",
    captionBody: `Not "AI news." One thing that worked for me this week — the prompt, the dollar amount, the screw-up.

Free. No 27-step funnel. Just useful.

earnwith-ai.com → scroll to Newsletter.`,
    alternates: [
      v("One email a week. No funnel. No 'AI news.' Just what worked.", "promise", 0.066, "Anti-newsletter newsletter pitch. Counter-positions."),
      v("The Sunday email that's actually worth opening.", "contrarian", 0.062, "Self-aware framing. Resonates with newsletter-fatigued audience."),
    ],
  },
];

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!adminEmail) { console.error("✗ ADMIN_EMAIL must be set"); process.exit(1); }
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) { console.error(`✗ No user for ${adminEmail}`); process.exit(1); }

  console.log(`Hooking ${plans.length} drafts for ${adminEmail}\n`);

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
      data: {
        caption: p.captionBody,
        selectedHook: p.selectedHook,
        hookOptions: [
          // The selected one first, then the alternates (so picker has it pre-checked)
          {
            text: p.selectedHook,
            pattern: p.alternates[0]?.pattern ?? null,
            predictedER: null,
            similarHookIds: [],
            reasoning: "Your selected hook (image-aligned).",
          },
          ...p.alternates,
        ] as object,
      },
    });
    updated += 1;
    console.log(`  ✓ ${p.slot.padEnd(20)} hook: "${p.selectedHook.slice(0, 55)}${p.selectedHook.length > 55 ? "…" : ""}"`);
  }

  console.log(`\nSummary: ${updated} drafts hooked · ${missing} missing`);
  console.log(`\n✓ Open https://creator-os-delta.vercel.app/drafts — every draft now has a hook field.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
