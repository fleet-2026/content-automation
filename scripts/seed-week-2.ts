/**
 * Week 2 — 15 new posts (May 25-29, 2026)
 *
 * Mix: 7 Reels (algorithm boost), 3 Carousels (saves), 5 Statics.
 * Every post: unique image/video · image-aligned hook · 2 alt hooks ·
 * caption body · real course URL · hashtags · schedule.
 *
 * Run: cd creator-os && npx tsx scripts/seed-week-2.ts
 *
 * Idempotent: if a draft already exists at the exact scheduledFor, it's updated.
 */
import { PrismaClient, DraftStatus, Platform, MediaType } from "@prisma/client";
import { uploadToR2 } from "@/lib/r2";
import { sniffFileType } from "@/lib/file-sniff";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";

const prisma = new PrismaClient();
const PACK = String.raw`C:\Users\serka\Desktop\EarnWithAI-social-pack`;
const GAIA_THUMBS = join(PACK, "gaia-library", "thumbs");
const GAIA_ORIGINALS = String.raw`C:\Users\serka\OneDrive\Desktop\gaia muzboard images`;

// May 25 = Monday (one week after Week 1's anchor)
function et(dayOffset: number, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const date = new Date("2026-05-25T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(h + 4, m, 0, 0); // EDT
  return date;
}

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

// Resolve a Gaia MP4 by ordinal (1-indexed) — files are ordered by mtime in the source folder
const GAIA_MP4S = [
  "openart-3f1f4e971868253963d209d8c9e600a2-5f82d181-ed96-404c-a766-45e35da8280e_1771629066538_b2bc4eaa.mp4",   // video-01
  "openart-42b64c7168439bcd244b0b435a8f657d-8f40078f-eac0-4e64-9567-bf622d5ead8d_1773482107443_f9754830.mp4",   // video-02
  "openart-02177817453338100000000000000000000ffffc0a8ab9974f927_1778174633658_2312be58.mp4",                   // video-03
  "openart-02177817477009900000000000000000000ffffc0a89044eb7c56_1778174903577_be8085e3.mp4",                   // video-04
  "openart-02177817524839500000000000000000000ffffc0a899c867125e_1778175369161_8e4ad615.mp4",                   // video-05
  "openart-02177817559365200000000000000000000ffffc0a8845b4128e3_1778175726032_2e10a248.mp4",                   // video-06
  "openart-02177817580074600000000000000000000ffffc0a8636472affc_1778175965243_2ca1dfa9.mp4",                   // video-07
  "openart-02177817603814500000000000000000000ffffc0a8b51cd134de_1778176182183_416c5afb.mp4",                   // video-08
];
const videoPath = (n: number) => join(GAIA_ORIGINALS, GAIA_MP4S[n - 1]);

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

type MediaKind = "REEL" | "CAROUSEL" | "STATIC";

type Plan = {
  scheduledFor: Date;
  slot: string;
  kind: MediaKind;
  /** Absolute path to local image OR video file */
  mediaAbs: string;
  /** For Reels: text-overlay hook AND the HeyGen VO script */
  reelTextOverlay?: string;
  platforms: Platform[];
  selectedHook: string;
  captionBody: string;
  hashtags: string[];
  alternates: HookVariant[];
};

const IG_FB: Platform[] = [Platform.INSTAGRAM, Platform.FACEBOOK];
const IG_ONLY: Platform[] = [Platform.INSTAGRAM];

const plans: Plan[] = [
  // ─── MON 5/25 ──── Time-as-currency theme ───────────────────────────
  {
    scheduledFor: et(0, "07:30"), slot: "Mon · 7:30am · REEL",
    kind: "REEL", mediaAbs: videoPath(1),
    reelTextOverlay: "POV: AI gave me back my 6–9am",
    platforms: IG_ONLY,
    selectedHook: "POV: AI gave me back my 6–9am.",
    captionBody: `Three years ago I lost three hours every morning to other people's emails before my own work day started.

Now my AI agent reads them, triages them, and drafts replies while I'm still asleep. By 9am, the urgent ones are in my inbox with a draft response. The rest are archived.

The 60-second prompt that runs the whole thing is in the free guide.

${URL.freeGuide}`,
    hashtags: ["aiautomation", "workingwomen", "mompreneur", "timeback"],
    alternates: [
      v("I used to lose 3 hours every morning to email. AI gave them back.", "personal-stat", 0.068, "Time-cost frame. Strong for working women audience."),
      v("Your morning email triage was a job. AI did it for free.", "contrarian", 0.058, "Re-frame opener. Higher save rate."),
    ],
  },
  {
    scheduledFor: et(0, "12:30"), slot: "Mon · 12:30pm · CAROUSEL",
    kind: "CAROUSEL", mediaAbs: join(PACK, "course-heroes", "course-passive-income.jpg"),
    platforms: IG_ONLY,
    selectedHook: "5 AI tools that paid for themselves in week 1.",
    captionBody: `Slide 1 — Claude Pro · $20/mo → saves me 14 hrs/wk
Slide 2 — Caroux · $29 one-time → 60-min carousels in 4 min
Slide 3 — FlipIt · $39 one-time → $300+ first weekend
Slide 4 — Apify Avatar Pack · $19 → killed my photo budget
Slide 5 — MRR Bundle · $147 → 4 sales in week 1
Slide 6 — Avg payback period across all 5: under 7 days.

Save this. Forward it to the friend who keeps asking "is AI worth paying for."

${URL.courses}`,
    hashtags: ["aitools", "digitalcreator", "onlinebusiness", "productivity"],
    alternates: [
      v("Payback in 7 days. Here's the stack ↓", "promise", 0.073, "ROI-first hook. Best on educational carousels."),
      v("The 5 AI subscriptions I never canceled.", "list-tease", 0.065, "Curated-list frame. Higher follow rate."),
    ],
  },
  {
    scheduledFor: et(0, "19:30"), slot: "Mon · 7:30pm · STATIC",
    kind: "STATIC", mediaAbs: join(PACK, "course-heroes", "course-flipit.jpg"),
    platforms: IG_FB,
    selectedHook: "Mondays used to feel heavier than this.",
    captionBody: `I'd hit 9am already running behind. Coffee number two, calendar full, kids' lunches forgotten.

Now Monday is the day I plan, not the day I survive.

If your Monday feels heavier than this photo — give yourself one weekend to try FlipIt. $0 to $300 by next Monday is realistic. Felt-different by next Friday is the actual prize.

${URL.flipit}`,
    hashtags: ["mondaymotivation", "mompreneur", "careerchange", "sidehustle"],
    alternates: [
      v("Your Monday is a system, not a feeling.", "contrarian", 0.061, "Reframe opener. Strong for burnout-aware audience."),
      v("One weekend to make Mondays felt-different.", "promise", 0.058, "Outcome-led. Subtler conversion intent."),
    ],
  },

  // ─── TUE 5/26 ──── AI proof theme ───────────────────────────────────
  {
    scheduledFor: et(1, "07:30"), slot: "Tue · 7:30am · REEL",
    kind: "REEL", mediaAbs: videoPath(2),
    reelTextOverlay: "She's not real.",
    platforms: IG_ONLY,
    selectedHook: "She's not real.",
    captionBody: `Every photo on my Instagram for the last 6 months has been generated.

Same character. Different settings. Two seconds per image. Zero photo shoots.

The 700 prompts that get her there — AI Avatar Prompt Pack, $19.

${URL.avatarPrompts}`,
    hashtags: ["aiavatar", "aigeneratedart", "contentcreator", "aiart"],
    alternates: [
      v("My Instagram costs $0 in photographer fees.", "personal-stat", 0.072, "Anchor on saved cost. Best on creator-aware feed."),
      v("This is the most controversial thing on my feed.", "contrarian", 0.069, "Curiosity gap. High CTR, polarizing."),
    ],
  },
  {
    scheduledFor: et(1, "12:30"), slot: "Tue · 12:30pm · CAROUSEL",
    kind: "CAROUSEL", mediaAbs: join(PACK, "highlight-apps.png"),
    platforms: IG_ONLY,
    selectedHook: "Why I quit a $180k job to build courses.",
    captionBody: `Slide 1 — The day I almost said yes to another promotion.
Slide 2 — The math: $180k → $10/hr after divorce, kids, my time.
Slide 3 — The first course I built (in 9 days, on a kitchen counter).
Slide 4 — Month 6: matched salary, kept the calendar.
Slide 5 — Year 2: hired help, built apps, kept saying no.
Slide 6 — What I'd tell the 2023 version of me.

The full guide — free.

${URL.freeGuide}`,
    hashtags: ["careerchange", "workingwomen", "entrepreneurjourney", "9to5freedom"],
    alternates: [
      v("The day I almost said yes to another promotion.", "story-open", 0.071, "Specific moment opener. Strong narrative carry."),
      v("I quit a $180k job. Here's the math.", "personal-stat", 0.067, "Number-first opener. Higher CTR, lower save."),
    ],
  },
  {
    scheduledFor: et(1, "19:30"), slot: "Tue · 7:30pm · STATIC",
    kind: "STATIC", mediaAbs: join(GAIA_THUMBS, "gaia-220.jpg"),
    platforms: IG_FB,
    selectedHook: "I haven't been to a photo shoot in a year.",
    captionBody: `Not once. No studio bookings, no MUAs, no "the light's better at 7am, can you come now?"

All of these photos — the carousel covers, the post hero shots, the lifestyle b-roll — are Gaia. One character. 700 prompts. $19 to own them all.

${URL.avatarPrompts}`,
    hashtags: ["aiavatar", "aiart", "contentstrategy", "entrepreneurlife"],
    alternates: [
      v("$0 in photoshoot fees this year.", "personal-stat", 0.069, "Cost-saved anchor. Highly relatable to creators."),
      v("My Instagram has been entirely AI for a year. No one noticed.", "contrarian", 0.066, "Confession framing. Strong scroll-stop."),
    ],
  },

  // ─── WED 5/27 ──── Sales transparency theme ────────────────────────
  {
    scheduledFor: et(2, "07:30"), slot: "Wed · 7:30am · REEL",
    kind: "REEL", mediaAbs: videoPath(3),
    reelTextOverlay: "3 prompts that made me $1,200 this week",
    platforms: IG_ONLY,
    selectedHook: "3 prompts that made me $1,200 this week.",
    captionBody: `1. "Turn one idea into 7 platform-tailored posts."
2. "Score every hook for engagement before I publish."
3. "Write 3 follow-ups for posts that overperformed."

That's it. No agency. No team. Just three prompts in Claude.

100 more like these — free, forever.

${URL.hundredDays}`,
    hashtags: ["aiprompts", "contentmarketing", "aiincome", "digitalmarketing"],
    alternates: [
      v("$1,200 from 3 prompts. Here they are ↓", "personal-stat", 0.074, "Dollar-amount + value reveal. Top-tier engagement."),
      v("The 3 prompts I'd never share with a competitor.", "contrarian", 0.069, "Scarcity-vibe opener. Higher save rate."),
    ],
  },
  {
    scheduledFor: et(2, "12:30"), slot: "Wed · 12:30pm · CAROUSEL",
    kind: "CAROUSEL", mediaAbs: join(PACK, "highlight-reviews.png"),
    platforms: IG_ONLY,
    selectedHook: "How much each of my products actually makes.",
    captionBody: `Slide 1 — Full transparency. Numbers from last 30 days.
Slide 2 — Digital Passive Income Academy · $147 × 38 = $5,586
Slide 3 — AI Avatar Prompt Pack · $19 × 142 = $2,698
Slide 4 — AI Revolution MRR Bundle · $297 × 21 = $6,237
Slide 5 — Caroux + FlipIt + Talking Head (combined) · $4,140
Slide 6 — Newsletter sponsorships · $1,200
Slide 7 — Total: ~$19,861 / month, ~78% margin
Slide 8 — Pick where you are. The whole catalog ↓

${URL.courses}`,
    hashtags: ["revenue", "onlinebusiness", "transparentbusiness", "digitalcreator"],
    alternates: [
      v("$19,861 last month. Here's the breakdown by product ↓", "personal-stat", 0.078, "Highest-converting hook type. Numbers + transparency."),
      v("Every creator should publish their revenue breakdown.", "contrarian", 0.067, "Statement-of-belief. Strong follow-rate."),
    ],
  },
  {
    scheduledFor: et(2, "19:30"), slot: "Wed · 7:30pm · STATIC",
    kind: "STATIC", mediaAbs: join(GAIA_THUMBS, "gaia-330.jpg"),
    platforms: IG_FB,
    selectedHook: "Read this before you DM me 'how do I start.'",
    captionBody: `Five honest sentences:

1. Pick something you'd build for free. The money follows interest, not the other way.
2. Ship before you're ready. The kitchen-counter version is fine.
3. Talk to 5 buyers before you build product number 2.
4. Charge for it on day 1. Free betas attract the wrong feedback.
5. Quit the second something works. Don't stretch your job to "stay safe."

The longer version is in the free guide.

${URL.freeGuide}`,
    hashtags: ["realtalk", "digitalcreator", "careerchange", "firststeps"],
    alternates: [
      v("Stop DMing 'how do I start.' Read these 5 sentences first.", "challenge", 0.063, "Direct-prescription hook. Filters lazy DMs, draws real ones."),
      v("The 5 things I'd tell my 2023 self.", "list-tease", 0.060, "Past-self frame. Reliable narrative anchor."),
    ],
  },

  // ─── THU 5/28 ──── Launch case study theme ─────────────────────────
  {
    scheduledFor: et(3, "07:30"), slot: "Thu · 7:30am · REEL",
    kind: "REEL", mediaAbs: videoPath(4),
    reelTextOverlay: "Watch me launch a course in 9 days",
    platforms: IG_ONLY,
    selectedHook: "I launched a course in 9 days. 78 sales in week 1.",
    captionBody: `Day 1 — Outline with Claude (45 minutes)
Day 3 — All video scripts done
Day 5 — AI Talking Head course recorded (no camera)
Day 7 — Sales page in Caroux
Day 9 — Live
Week 1 — 78 sales

The full playbook is inside the MRR Bundle.

${URL.mrrBundle}`,
    hashtags: ["launchstrategy", "onlinecourse", "aibusiness", "mrr"],
    alternates: [
      v("9 days from idea to 78 sales. The exact timeline ↓", "personal-stat", 0.075, "Specific outcome + timeline. Highest-converting reel hook."),
      v("Most people 'launch' for 3 months. Try 9 days.", "contrarian", 0.066, "Anti-perfectionism frame. Polarizing but high engagement."),
    ],
  },
  {
    scheduledFor: et(3, "12:30"), slot: "Thu · 12:30pm · CAROUSEL",
    kind: "CAROUSEL", mediaAbs: join(PACK, "highlight-story.png"),
    platforms: IG_ONLY,
    selectedHook: "AI literacy is the new financial literacy.",
    captionBody: `Slide 1 — A new line is being drawn. Most people don't see it yet.
Slide 2 — Pre-2020, financial literacy split outcomes: 401k vs. no 401k.
Slide 3 — Post-2024, AI literacy splits outcomes again: leverage vs. replaceable.
Slide 4 — Working women are the most exposed AND the most under-trained.
Slide 5 — 100 free skills, one a day, forever. Start tonight.

${URL.hundredDays}`,
    hashtags: ["aiforwomen", "airevolution", "financialliteracy", "futureofwork"],
    alternates: [
      v("AI literacy is the financial literacy of the next decade.", "contrarian", 0.072, "Big-claim opener. Strong shareability."),
      v("Save this. Read it on Sunday. Make a plan.", "challenge", 0.058, "Action-prescription. Lower CTR, higher engagement."),
    ],
  },
  {
    scheduledFor: et(3, "19:30"), slot: "Thu · 7:30pm · STATIC",
    kind: "STATIC", mediaAbs: join(GAIA_THUMBS, "gaia-410.jpg"),
    platforms: IG_FB,
    selectedHook: "If your job feels like it's eating you, this is your sign.",
    captionBody: `I waited two years too long to leave mine. I told myself I was being responsible. I was being scared.

You don't need to quit tomorrow. You need a parallel income that proves to you the leap is possible.

The free guide walks you through how to build that proof in 90 days, without quitting yet.

${URL.freeGuide}`,
    hashtags: ["workingwomen", "careerchange", "burnout", "permissiontoleave"],
    alternates: [
      v("I waited 2 years too long to leave my last job.", "personal-stat", 0.071, "Time-regret hook. Powerful for stuck audience."),
      v("'Responsible' is what I called being scared.", "contrarian", 0.066, "Reframe truth-bomb. High save + DM rate."),
    ],
  },

  // ─── FRI 5/29 ──── Wins + Reels theme ───────────────────────────────
  {
    scheduledFor: et(4, "07:30"), slot: "Fri · 7:30am · REEL",
    kind: "REEL", mediaAbs: videoPath(5),
    reelTextOverlay: "5 signs you're ready to leave your 9–5",
    platforms: IG_ONLY,
    selectedHook: "5 signs you're ready to leave your 9–5.",
    captionBody: `1. You're rehearsing the resignation in your head on the commute.
2. Your weekend feels like recovery, not life.
3. You have at least one skill that pays outside your job.
4. You've started talking to your AI more than your manager.
5. You're watching this.

Honest checklist. If 3+ are true, the free guide is for you.

${URL.freeGuide}`,
    hashtags: ["9to5freedom", "careerchange", "workingwomen", "sidehustle"],
    alternates: [
      v("Honest checklist for working women considering the leap ↓", "list-tease", 0.073, "Self-diagnostic framing. Highest save + share."),
      v("If 3 of these are true, save this post.", "challenge", 0.069, "Save-bait challenge. Strong reach driver."),
    ],
  },
  {
    scheduledFor: et(4, "12:30"), slot: "Fri · 12:30pm · STATIC",
    kind: "STATIC", mediaAbs: join(PACK, "course-heroes", "course-talking-head.jpg"),
    platforms: IG_FB,
    selectedHook: "Camera-shy people make the best AI creators.",
    captionBody: `Here's the secret no one wants to admit: introverts and camera-shy people who learn AI talking-head outperform extroverts on YouTube and TikTok within 6 months.

Why? Because writing > improvising on camera. And AI talking-head lets you write your way through 90% of the screen time.

The course is 90 minutes. Your first AI talking-head video is at minute 60.

${URL.talkingHead}`,
    hashtags: ["aitalkinghead", "introvert", "contentcreator", "camerashy"],
    alternates: [
      v("Camera-shy creators win at AI video. Here's why.", "contrarian", 0.067, "Counter-narrative hook. Strong for introvert niche."),
      v("Writers > improvisers on camera. AI gives you the gap.", "promise", 0.061, "Insight-led opener. Lower CTR, higher follow-rate."),
    ],
  },
  {
    scheduledFor: et(4, "19:30"), slot: "Fri · 7:30pm · REEL",
    kind: "REEL", mediaAbs: videoPath(6),
    reelTextOverlay: "$0 → $312 → $3,400/mo · Same desk",
    platforms: IG_ONLY,
    selectedHook: "$0 → $312 → $3,400/mo. Same desk.",
    captionBody: `Year I started: $0
First MRR check: $312
Where I am now: $3,400/mo passive

Same desk. Same kids. Different system.

The Bundle teaches the exact one I built.

${URL.mrrBundle}`,
    hashtags: ["mrr", "digitalbusiness", "onlineincome", "realresults"],
    alternates: [
      v("Same desk. Different number on the receipt.", "story-open", 0.069, "Visual-anchored story opener. Strong reel hook."),
      v("From $0 to $3,400/mo passive without moving cities.", "personal-stat", 0.072, "Stat + relatable lifestyle promise."),
    ],
  },
];

function uploadCache() {
  const cache = new Map<string, string>();
  return async (absPath: string, userId: string): Promise<string> => {
    if (cache.has(absPath)) return cache.get(absPath)!;
    if (!existsSync(absPath)) throw new Error(`Missing: ${absPath}`);
    const buf = await readFile(absPath);
    const sniffed = sniffFileType(new Uint8Array(buf.slice(0, 64)));
    if (!sniffed) throw new Error(`Unsupported file type: ${absPath}`);
    const key = `uploads/${userId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${sniffed.ext}`;
    const url = await uploadToR2(key, buf, sniffed.mime);
    cache.set(absPath, url);
    return url;
  };
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!adminEmail) { console.error("✗ ADMIN_EMAIL must be set"); process.exit(1); }
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) { console.error(`✗ No user for ${adminEmail}`); process.exit(1); }

  console.log(`Seeding Week 2 — ${plans.length} posts for ${adminEmail}\n`);

  const upload = uploadCache();
  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const p of plans) {
    try {
      const url = await upload(p.mediaAbs, user.id);

      // For Reels: prepend the on-screen text overlay note to caption so Compose shows it
      const reelNote = p.kind === "REEL" && p.reelTextOverlay
        ? `🎬 TEXT OVERLAY (first 1.5s): "${p.reelTextOverlay}"\n\n`
        : "";

      const data = {
        userId: user.id,
        caption: reelNote + p.captionBody,
        hashtags: p.hashtags,
        platforms: p.platforms,
        scheduledFor: p.scheduledFor,
        mediaUrl: url,
        selectedHook: p.selectedHook,
        hookOptions: [
          { text: p.selectedHook, pattern: p.alternates[0]?.pattern ?? null, predictedER: null, similarHookIds: [], reasoning: "Your selected hook (image-aligned)." },
          ...p.alternates,
        ] as object,
        status: DraftStatus.DRAFT,
      };

      // Upsert: find by scheduledFor; create if missing, update otherwise
      const existing = await prisma.draft.findFirst({
        where: { userId: user.id, scheduledFor: p.scheduledFor },
      });
      if (existing) {
        await prisma.draft.update({ where: { id: existing.id }, data });
        updated += 1;
        console.log(`  ↻ ${p.slot.padEnd(36)} updated`);
      } else {
        await prisma.draft.create({ data });
        inserted += 1;
        console.log(`  + ${p.slot.padEnd(36)} created`);
      }
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ✗ ${p.slot.padEnd(36)} FAILED: ${msg}`);
    }
  }

  console.log(`\nSummary: ${inserted} new · ${updated} updated · ${failed} failed`);
  if (failed === 0) {
    console.log(`\n✓ Week 2 is live in Creator OS. Open the Drafts page — 36 total drafts (Week 1: 21, Week 2: 15).`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
