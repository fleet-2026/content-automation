/**
 * CREATIVE DIRECTOR PASS — rewrites all 21 seed drafts so image + caption + hook + hashtags
 * are designed together. Every image picked for what it visually says; every caption
 * written to land that specific photo.
 *
 * Run:  cd creator-os && npx tsx scripts/creative-rewrite.ts
 *
 * Idempotent: matches drafts by exact scheduledFor.
 */
import { PrismaClient, DraftStatus, Platform } from "@prisma/client";
import { uploadToR2 } from "@/lib/r2";
import { sniffFileType } from "@/lib/file-sniff";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";

const prisma = new PrismaClient();
const PACK = String.raw`C:\Users\serka\Desktop\EarnWithAI-social-pack`;
const GAIA_THUMBS = join(PACK, "gaia-library", "thumbs");

// May 18, 2026 anchor — EDT (UTC-4 in May)
function et(dayOffset: number, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const date = new Date(`2026-05-18T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(h + 4, m, 0, 0);
  return date;
}

type Post = {
  scheduledFor: Date;
  slot: string;
  image: string;
  platforms: Platform[];
  caption: string;
  hashtags: string[];
};

const IG_FB: Platform[] = [Platform.INSTAGRAM, Platform.FACEBOOK];
const IG_ONLY: Platform[] = [Platform.INSTAGRAM];

const posts: Post[] = [
  // ─── MON 5/18 — Origin & Setup ──────────────────────────────────────
  {
    scheduledFor: et(0, "07:30"), slot: "Mon · 7:30am",
    image: "profile-1080.jpg",
    platforms: IG_FB,
    caption: `Three years ago this view felt impossible.

I was running a finance team, two kids in school, a husband who didn't quite get why I was tired all the time. The ladder I was climbing was someone else's ladder.

This morning I'm three years into building my own thing. AI tools made it possible. Working women like you made it worth it.

If you're stuck where I was — start with the Free Guide. Link in bio.`,
    hashtags: ["aiforwomen", "careerchange", "digitalcreator", "workingwomen"],
  },
  {
    scheduledFor: et(0, "12:30"), slot: "Mon · 12:30pm",
    image: "gaia-008",
    platforms: IG_FB,
    caption: `The 60-second prompt that runs my Monday morning ↓

Open Claude. Paste your inbox subject lines from the last 7 days. Ask:
"Group these by urgency. Draft a 3-line reply to the urgent ones."

Saves me 45 minutes every Monday. That's $40+ at my old hourly.

100 free prompts like this in bio → 100 Days of AI Skills.`,
    hashtags: ["aitips", "claudeai", "productivity", "monday"],
  },
  {
    scheduledFor: et(0, "19:30"), slot: "Mon · 7:30pm",
    image: "course-heroes/course-passive-income.jpg",
    platforms: IG_FB,
    caption: `This is the morning I designed for myself.

Coffee, not coffee meetings. Calendar, not calls. The income shows up before the kids do.

The 5 things I built to make this real are inside Digital Passive Income Academy. First 50 buyers this week get a free 30-min audit of your setup.

Link in bio → Courses → Bestseller.`,
    hashtags: ["passiveincome", "digitalbusiness", "aientrepreneur", "bestseller"],
  },

  // ─── TUE 5/19 — Free First → Avatar Pack ────────────────────────────
  {
    scheduledFor: et(1, "07:30"), slot: "Tue · 7:30am",
    image: "highlight-100days.png",
    platforms: IG_ONLY,
    caption: `100 free AI skills. One a day for 100 days. Forever free.

No email opt-in. No funnel. CC BY 4.0.

Day 7's the one that broke me out of "I don't know where to start" — the First-Skill Picker. Try it tonight.

earnwith-ai.com/100-days`,
    hashtags: ["freeaitools", "100daysofai", "aiforwomen", "learnai"],
  },
  {
    scheduledFor: et(1, "12:30"), slot: "Tue · 12:30pm",
    image: "course-heroes/course-avatar-prompts.jpg",
    platforms: IG_FB,
    caption: `Six versions of me. None of them are photos.

Every one generated from one consistent character + a different prompt. Magazine quality. ~30 seconds each.

The 700 prompts that get her there → AI Avatar Prompt Pack, $19.

Pays for itself the first time you skip a $500 photo shoot.

earnwith-ai.com/courses#avatar-prompts`,
    hashtags: ["aiavatar", "contentcreator", "aiart", "700prompts"],
  },
  {
    scheduledFor: et(1, "19:30"), slot: "Tue · 7:30pm",
    image: "gaia-001",
    platforms: IG_ONLY,
    caption: `Meet Gaia.

She's not real. She's my Instagram. She wakes up earlier than I do. She has better hair days.

I built her with 700 prompts. She lets me post 3x a day without three photo shoots a week.

The exact pack: bio link → AI Avatar Prompt Pack.`,
    hashtags: ["aiclone", "aiavatar", "behindthescenes", "digitalcreator"],
  },

  // ─── WED 5/20 — MRR Wednesday ───────────────────────────────────────
  {
    scheduledFor: et(2, "07:30"), slot: "Wed · 7:30am",
    image: "highlight-mrr.png",
    platforms: IG_ONLY,
    caption: `MRR isn't a TikTok scheme. Save this.

MRR = Monthly Recurring Revenue. Money that shows up every month, even if you took the week off.

For a creator: digital products with resell rights. Built once. Paid forever.

Math: $47/mo × 50 buyers = $2,350/mo passive.

I show you exactly how in the AI Revolution MRR Bundle. Bio.`,
    hashtags: ["mrr", "passiveincome", "digitalproducts", "onlinecourse"],
  },
  {
    scheduledFor: et(2, "12:30"), slot: "Wed · 12:30pm",
    image: "gaia-051",
    platforms: IG_FB,
    caption: `The first MRR check I cashed, I bought myself a red dress.

$312. Recurring. It wasn't even big. But it was the first dollar that came in while I wasn't at a desk.

That moment changed everything I believed about what "income" could look like.

The Bundle that teaches it is in bio.`,
    hashtags: ["mrr", "workingwomen", "firstwin", "digitalbusiness"],
  },
  {
    scheduledFor: et(2, "19:30"), slot: "Wed · 7:30pm",
    image: "course-heroes/course-mrr-bundle.jpg",
    platforms: IG_FB,
    caption: `Three courses. One bundle. Resell rights included.

You don't just learn the playbook — you can sell my courses as yours, full margin.

Average buyer this month: 4 sales in week 1.

earnwith-ai.com/courses#mrr-bundle`,
    hashtags: ["mrr", "resellrights", "aibusiness", "digitalproducts"],
  },

  // ─── THU 5/21 — Show the Work ───────────────────────────────────────
  {
    scheduledFor: et(3, "07:30"), slot: "Thu · 7:30am",
    image: "course-heroes/course-caroux.jpg",
    platforms: IG_FB,
    caption: `Built this carousel in 4 minutes.

Paste your idea. Pick a brand. Done. Slides in your colors, your font, your voice.

Each platform's version is different — IG carousel, LinkedIn doc, X thread — generated from the same idea.

Caroux. Under $30.
earnwith-ai.com/courses#caroux`,
    hashtags: ["carousel", "contentcreation", "aitools", "designtools"],
  },
  {
    scheduledFor: et(3, "12:30"), slot: "Thu · 12:30pm",
    image: "course-heroes/course-talking-head.jpg",
    platforms: IG_FB,
    caption: `I'm camera shy. So I built an AI version of me that isn't.

Talking-head videos without ever facing a camera. The whole course is 90 minutes. You'll have your first video by minute 60.

earnwith-ai.com/courses#talking-head`,
    hashtags: ["aitalkinghead", "contentcreator", "camerashy", "aiavatar"],
  },
  {
    scheduledFor: et(3, "19:30"), slot: "Thu · 7:30pm",
    image: "gaia-185",
    platforms: IG_FB,
    caption: `I'm looking right at you because I want you to actually try this.

Pick one of the 7 courses. Start tonight. Don't "when I'm ready." You'll never be ready.

The version of you that's still in your 9-5 in six months will thank you for this Thursday.

Link in bio.`,
    hashtags: ["realtalk", "noBS", "aientrepreneur", "workingwomen"],
  },

  // ─── FRI 5/22 — Friday Wins ─────────────────────────────────────────
  {
    scheduledFor: et(4, "07:30"), slot: "Fri · 7:30am",
    image: "gaia-006",
    platforms: IG_FB,
    caption: `Friday energy ↓

A woman in my cohort hit $3,400 in 6 weeks. Her stack:
· AI Avatar Prompt Pack ($19)
· Digital Passive Income Academy ($147)
· 6am alarms
· zero "wait till I'm ready"

If she can, you absolutely can. I'm rooting for you.

Link in bio.`,
    hashtags: ["fridaywins", "aicreator", "onlineincome", "cohort"],
  },
  {
    scheduledFor: et(4, "12:30"), slot: "Fri · 12:30pm",
    image: "course-heroes/course-flipit.jpg",
    platforms: IG_FB,
    caption: `Weekend project: turn this into $300 by Monday.

FlipIt scans 8 marketplaces, sorts by margin, hands you the list.

Find a digital product. Flip it. 3-5× profit on each.

Realistic weekend goal: $0 → $300.

earnwith-ai.com/courses#flipit`,
    hashtags: ["weekendhustle", "digitalflipping", "sidehustle", "aiautomation"],
  },
  {
    scheduledFor: et(4, "19:30"), slot: "Fri · 7:30pm",
    image: "gaia-370",
    platforms: IG_FB,
    caption: `Closing the laptop. Not opening it till Monday.

The systems run while I'm off. The courses keep selling. The newsletter sends itself.

None of that happened by working harder. It happened because I built things that don't need me.

What I built → bio. Have a good weekend.`,
    hashtags: ["workboundaries", "fridayreset", "digitalcreator", "worklifebalance"],
  },

  // ─── SAT 5/23 — Slow Saturday ───────────────────────────────────────
  {
    scheduledFor: et(5, "08:30"), slot: "Sat · 8:30am",
    image: "highlight-courses.png",
    platforms: IG_FB,
    caption: `Saturday morning. Coffee. Window light. Phone open to bio.

Pick the one that fits where you are right now:

💰 Bestseller — passive income
🖼️ Avatar pack — $19
🤖 MRR bundle — resell my courses
🧬 Digital twin — your AI clone
🎬 Talking head — camera-shy fix
🔄 FlipIt — weekend hustle
🎠 Caroux — auto carousels

All in bio.`,
    hashtags: ["aieducation", "saturdayshopping", "workingwomen", "onlinecourse"],
  },
  {
    scheduledFor: et(5, "13:30"), slot: "Sat · 1:30pm",
    image: "course-heroes/course-digital-twin.jpg",
    platforms: IG_FB,
    caption: `Two of these vases are identical. Two of you would be even better.

AIMR Digital Twin Studio — train a private AI on your writing, your decisions, your style. Have it draft your emails, social posts, client replies — in your voice.

Includes resell rights.

earnwith-ai.com/courses#digital-twin`,
    hashtags: ["digitaltwin", "aiclone", "personalbrand", "workingwomen"],
  },
  {
    scheduledFor: et(5, "19:30"), slot: "Sat · 7:30pm",
    image: "gaia-118",
    platforms: IG_FB,
    caption: `Saturday night. Podcasts on. Planning Monday like a CEO.

"I bought the Bestseller in January thinking it was a Hail Mary. Last week I made $1,200. Haven't been back to my 9-5 inbox since Tuesday."
— Sara, marketing manager → digital creator

14 weeks. That's all it took.

Link in bio.`,
    hashtags: ["testimonial", "realresults", "saturdaynight", "digitalcreator"],
  },

  // ─── SUN 5/24 — Sunday Setup ────────────────────────────────────────
  {
    scheduledFor: et(6, "08:30"), slot: "Sun · 8:30am",
    image: "highlight-stack.png",
    platforms: IG_ONLY,
    caption: `The 12-minute Sunday setup that makes my whole week ↓

1. Open Claude. Paste your calendar PNG. Ask: "What's the ONE thing each day I should protect time for?"
2. Ask: "Based on my goal of [X], what's the 80/20 task I should refuse to skip this week?"
3. Schedule those into your calendar. Done.

Save this. Use it tonight.

100 more like it → earnwith-ai.com/100-days`,
    hashtags: ["sundayreset", "aiprompts", "productivity", "weeklyplanning"],
  },
  {
    scheduledFor: et(6, "13:30"), slot: "Sun · 1:30pm",
    image: "facebook-cover.jpg",
    platforms: IG_FB,
    caption: `All 7 courses. One bio link.

📚 Digital Passive Income Academy — Bestseller
🖼️ AI Avatar Prompt Pack — Popular, $19
🤖 AI Revolution MRR Bundle — MRR
🧬 AIMR Digital Twin Studio — MRR
🎬 Beginner's Guide to AI Talking Head — New
🔄 FlipIt — Digital Flipping Tool — New
🎠 Caroux — AI Carousel Generator — New

earnwith-ai.com/courses`,
    hashtags: ["aieducation", "onlinecourse", "digitalcreator", "sevencourses"],
  },
  {
    scheduledFor: et(6, "19:30"), slot: "Sun · 7:30pm",
    image: "highlight-about.png",
    platforms: IG_FB,
    caption: `Every Sunday I send one email.

Not "AI news." One thing that worked for me this week — the prompt, the dollar amount, the screw-up.

Free. No 27-step funnel. Just useful.

earnwith-ai.com → scroll to Newsletter.`,
    hashtags: ["newsletter", "sundayemail", "aitips", "workingwomen"],
  },
];

function resolveImage(ref: string): string | null {
  if (/^gaia-\d{3}$/.test(ref)) {
    const p = join(GAIA_THUMBS, `${ref}.jpg`);
    return existsSync(p) ? p : null;
  }
  const p = join(PACK, ref);
  return existsSync(p) ? p : null;
}

async function uploadImage(absPath: string, userId: string): Promise<string> {
  const buf = await readFile(absPath);
  const sniffed = sniffFileType(new Uint8Array(buf.slice(0, 64)));
  if (!sniffed) throw new Error(`Unsupported file: ${absPath}`);
  const key = `uploads/${userId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${sniffed.ext}`;
  return uploadToR2(key, buf, sniffed.mime);
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!adminEmail) { console.error("✗ ADMIN_EMAIL must be set"); process.exit(1); }
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) { console.error(`✗ No user for ${adminEmail}`); process.exit(1); }

  // Sanity: all 21 unique images?
  const imageCount = new Map<string, number>();
  for (const p of posts) imageCount.set(p.image, (imageCount.get(p.image) ?? 0) + 1);
  const dups = [...imageCount.entries()].filter(([, n]) => n > 1);
  if (dups.length) {
    console.error("✗ Duplicate images in plan:", dups);
    process.exit(1);
  }
  console.log(`Plan: ${posts.length} posts, all images unique.\n`);

  const uploadCache = new Map<string, string>();
  let updated = 0;
  let failed = 0;

  for (const p of posts) {
    const absPath = resolveImage(p.image);
    if (!absPath) {
      console.log(`  ✗ ${p.slot.padEnd(20)} MISSING FILE: ${p.image}`);
      failed += 1;
      continue;
    }

    // Find the draft by exact scheduledFor
    const draft = await prisma.draft.findFirst({
      where: { userId: user.id, scheduledFor: p.scheduledFor },
    });
    if (!draft) {
      console.log(`  ✗ ${p.slot.padEnd(20)} no draft at ${p.scheduledFor.toISOString()}`);
      failed += 1;
      continue;
    }

    try {
      let url = uploadCache.get(absPath);
      if (!url) {
        url = await uploadImage(absPath, user.id);
        uploadCache.set(absPath, url);
      }
      await prisma.draft.update({
        where: { id: draft.id },
        data: {
          caption: p.caption,
          hashtags: p.hashtags,
          platforms: p.platforms,
          mediaUrl: url,
        },
      });
      updated += 1;
      console.log(`  ✓ ${p.slot.padEnd(20)} ${p.image.padEnd(46)}  ${p.caption.split("\n")[0].slice(0, 60)}…`);
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ✗ ${p.slot.padEnd(20)} FAILED: ${msg}`);
    }
  }

  console.log(`\nSummary: ${updated} drafts rewritten · ${failed} failed`);
  if (updated === posts.length) {
    console.log("\n✓ Every draft has a unique, image-aligned post. Refresh the Drafts page.");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
