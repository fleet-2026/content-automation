/**
 * Seed 21 ready-made drafts for the May 18-24 calendar.
 *
 * Run:   cd creator-os && npx tsx scripts/seed-7-day-calendar.ts
 *
 * Reads ADMIN_EMAIL from env to find the owning user. Inserts 21 drafts with
 * status=DRAFT and scheduledFor set to upcoming Mon-Sun.
 *
 * Each caption begins with a one-line note ("📷 IMAGE: ...") telling the user
 * which file to attach from C:\Users\serka\Desktop\EarnWithAI-social-pack\.
 * Remove that line before publishing.
 *
 * mediaUrl is left null — attach in the Creator OS UI before scheduling.
 *
 * SAFE to re-run: it deletes any prior drafts whose caption contains the
 * marker "[EW7D-2026-05-18]" before inserting fresh ones, so you won't get
 * duplicates if you tweak and re-seed.
 */
import { PrismaClient, DraftStatus, Platform } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_MARKER = "[EW7D-2026-05-18]";

// Monday May 18, 2026 — week start. Times are US/Eastern (EDT = UTC-4 in May).
const W = "2026-05-18"; // anchor Monday

// Convert "YYYY-MM-DD" + "HH:MM" ET → UTC Date.
// May is EDT (UTC-4), so add 4 hours to ET to get UTC.
function et(dayOffset: number, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const date = new Date(`${W}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  // ET → UTC: add 4 hours (EDT)
  date.setUTCHours(h + 4, m, 0, 0);
  return date;
}

type Seed = {
  day: string;
  slot: string;
  scheduledFor: Date;
  image: string;
  platforms: Platform[];
  caption: string;
  hashtags: string[];
};

const drafts: Seed[] = [
  // ─── DAY 1 — Monday, May 18 ─────────────────────────────────────────
  {
    day: "Mon May 18", slot: "A — 7:30am",
    scheduledFor: et(0, "07:30"),
    image: "profile-1080.jpg",
    platforms: [Platform.INSTAGRAM, Platform.FACEBOOK],
    caption:
`I spent 30 years in corporate before I figured out that the same skills that built someone else's company can build mine.

I'm Fadia. I teach AI to working women who don't have time to figure it out alone.

7 courses. One a day for 100 days, free. Built around what I actually shipped, not theory.

If you're in a job you'd quit if you had a way out — start with the Free Guide. Link in bio.`,
    hashtags: ["aiforwomen", "digitalcreator", "careerchange", "passiveincome"],
  },
  {
    day: "Mon May 18", slot: "B — 12:30pm",
    scheduledFor: et(0, "12:30"),
    image: "gaia — laptop / desk / over-shoulder working",
    platforms: [Platform.INSTAGRAM, Platform.FACEBOOK],
    caption:
`The fastest AI win that pays for itself by lunch:

Open Claude. Paste your inbox subject lines from the last 7 days. Ask: "Group these by urgency. Draft a 3-line reply to the urgent ones."

Saves me ~45 min every Monday morning. That's $40+ at my old hourly.

Try it. DM me what it caught for you.`,
    hashtags: ["aitips", "productivity", "claudeai"],
  },
  {
    day: "Mon May 18", slot: "C — 7:30pm",
    scheduledFor: et(0, "19:30"),
    image: "course-heroes/course-passive-income.jpg",
    platforms: [Platform.INSTAGRAM, Platform.FACEBOOK],
    caption:
`Digital Passive Income Academy — the course that built this business.

What you get inside:
· The 5 income streams I actually run (with numbers)
· The "Sunday in, money by Friday" launch sprint
· 30+ AI workflows that print money while I sleep

First 50 buyers this week get a free 30-min loom audit of your setup.

Link in bio → Courses → Digital Passive Income Academy.`,
    hashtags: ["passiveincome", "digitalbusiness", "aientrepreneur"],
  },

  // ─── DAY 2 — Tuesday, May 19 ────────────────────────────────────────
  {
    day: "Tue May 19", slot: "A — 7:30am",
    scheduledFor: et(1, "07:30"),
    image: "CAROUSEL · 5 slides · brand-color flat design",
    platforms: [Platform.INSTAGRAM],
    caption:
`Save this. Use one every morning this week.

They take 90 seconds each. They save me ~2 hours.

Slide 1 — "5 prompts I use every morning before my first meeting"
Slide 2 — "Triage my inbox by intent — reply/file/delete"
Slide 3 — "Pull my 3 highest-impact tasks from today's calendar"
Slide 4 — "Draft a 4-line standup update from yesterday's commits"
Slide 5 — "All 100 free at earnwith-ai.com/100-days. Save this carousel."

Want all 100? Link in bio → 100 Days of AI Skills. Free forever.`,
    hashtags: ["aitips", "morningroutine", "productivity"],
  },
  {
    day: "Tue May 19", slot: "B — 12:30pm",
    scheduledFor: et(1, "12:30"),
    image: "course-heroes/course-avatar-prompts.jpg",
    platforms: [Platform.INSTAGRAM, Platform.FACEBOOK],
    caption:
`I built an AI version of myself.

700+ tested prompts → consistent character, any setting, magazine quality. My Instagram looks like a brand because of this pack.

"Popular" badge for a reason. $19. Pays for itself the first time you skip a $500 photo shoot.

earnwith-ai.com/courses#avatar-prompts`,
    hashtags: ["aiavatar", "contentcreator", "aiart"],
  },
  {
    day: "Tue May 19", slot: "C — 7:30pm",
    scheduledFor: et(1, "19:30"),
    image: "CAROUSEL · profile-1080.jpg + 2 Gaia (lifestyle + working)",
    platforms: [Platform.INSTAGRAM],
    caption:
`Yes, this is "me" and also not me. Her name is Gaia.

She lets me post 3x a day without doing 3 photo shoots a week. 700+ prompts that get her consistent every time → in the pack.

Slide 1 — your portrait + "Meet my AI twin →"
Slide 2 — Gaia lifestyle + "She runs my Instagram while I run my business."
Slide 3 — Gaia working + "The exact prompts I used → AI Avatar Prompt Pack."

earnwith-ai.com/courses#avatar-prompts`,
    hashtags: ["aiclone", "aiavatar", "digitalcreator"],
  },

  // ─── DAY 3 — Wednesday, May 20 — MRR Wednesday ──────────────────────
  {
    day: "Wed May 20", slot: "A — 7:30am",
    scheduledFor: et(2, "07:30"),
    image: "CAROUSEL · 6 slides on plum/cream brand background",
    platforms: [Platform.INSTAGRAM],
    caption:
`Save this and read it on your lunch break.

If "MRR" sounded like crypto BS — it's the opposite. It's how every SaaS company you've ever paid for is structured.

1. MRR isn't a TikTok scheme. It's how every SaaS founder thinks.
2. MRR = Monthly Recurring Revenue. Money that shows up every month.
3. For a creator: digital products with resell rights.
4. Sell the same course 10 times = 10 monthly customers. Built once, paid forever.
5. Math: $47/mo × 50 buyers = $2,350/mo passive.
6. I show you how in the AI Revolution MRR Bundle.

Bundle link in bio.`,
    hashtags: ["mrr", "passiveincome", "digitalproducts"],
  },
  {
    day: "Wed May 20", slot: "B — 12:30pm",
    scheduledFor: et(2, "12:30"),
    image: "gaia — thoughtful / coffee / journaling (or profile-1080.jpg)",
    platforms: [Platform.INSTAGRAM, Platform.FACEBOOK],
    caption:
`I made $1,847 last month from a course I built in 9 days in February.

I haven't touched it since.

That's the entire pitch for MRR. You front-load 9 days of effort. The money trails you for years.

Bundle is in bio if you want the playbook.`,
    hashtags: ["mrr", "onlinecourse", "digitalbusiness"],
  },
  {
    day: "Wed May 20", slot: "C — 7:30pm",
    scheduledFor: et(2, "19:30"),
    image: "course-heroes/course-mrr-bundle.jpg",
    platforms: [Platform.INSTAGRAM, Platform.FACEBOOK],
    caption:
`AI Revolution MRR Course Bundle.

3 courses + full resell rights. You don't just learn the playbook — you can sell my courses as yours.

Average buyer this month: 4 sales in week 1.

earnwith-ai.com/courses#mrr-bundle`,
    hashtags: ["mrr", "resellrights", "aibusiness"],
  },

  // ─── DAY 4 — Thursday, May 21 — Thumbnail Thursday ──────────────────
  {
    day: "Thu May 21", slot: "A — 7:30am",
    scheduledFor: et(3, "07:30"),
    image: "CAROUSEL · 8 Gaia images (range: cafe, beach, studio, casual, workspace, etc.)",
    platforms: [Platform.INSTAGRAM],
    caption:
`8 outfits. 8 settings. Zero photo shoots.

Every image generated from one consistent character + a different prompt. Magazine quality. ~30 seconds each.

The exact 700+ prompts: AI Avatar Prompt Pack. earnwith-ai.com/courses#avatar-prompts`,
    hashtags: ["aiavatar", "consistentcharacter", "aiart"],
  },
  {
    day: "Thu May 21", slot: "B — 12:30pm",
    scheduledFor: et(3, "12:30"),
    image: "split: profile-1080.jpg + 1 Gaia (or course-heroes/course-talking-head.jpg)",
    platforms: [Platform.INSTAGRAM, Platform.FACEBOOK],
    caption:
`3-step recipe for a content-ready AI avatar:

1. Generate one anchor portrait. Save the character ID.
2. Lock the prompt structure: lighting + setting + outfit + emotion.
3. Re-roll till it matches the anchor. Don't accept "close enough."

Full pack: earnwith-ai.com/courses#avatar-prompts`,
    hashtags: ["aiavatar", "howto", "contentcreator"],
  },
  {
    day: "Thu May 21", slot: "C — 7:30pm",
    scheduledFor: et(3, "19:30"),
    image: "course-heroes/course-caroux.jpg",
    platforms: [Platform.INSTAGRAM, Platform.FACEBOOK],
    caption:
`The carousel you just swiped? Built in 4 minutes with Caroux.

Paste an idea. Pick a brand. Done. Slides in your colors, your font, your voice.

earnwith-ai.com/courses#caroux — under $30.`,
    hashtags: ["carousel", "contentcreation", "aitools"],
  },

  // ─── DAY 5 — Friday, May 22 — Friday Wins ───────────────────────────
  {
    day: "Fri May 22", slot: "A — 7:30am",
    scheduledFor: et(4, "07:30"),
    image: "gaia — relaxed Friday vibe (coffee, light clothing, smile)",
    platforms: [Platform.INSTAGRAM, Platform.FACEBOOK],
    caption:
`Friday energy: a woman in my last cohort just hit $3,400 in 6 weeks.

Her stack: AI Avatar Prompt Pack ($19) + Digital Passive Income Academy ($147) + 6am alarms + zero "wait till I'm ready."

If she can do it, you absolutely can. I'm rooting for you.

Link in bio.`,
    hashtags: ["fridaywins", "aicreator", "onlineincome"],
  },
  {
    day: "Fri May 22", slot: "B — 12:30pm",
    scheduledFor: et(4, "12:30"),
    image: "course-heroes/course-flipit.jpg",
    platforms: [Platform.INSTAGRAM, Platform.FACEBOOK],
    caption:
`FlipIt — find digital products people are flipping for 3-5× profit, automated.

It scans 8 marketplaces, sorts by margin, hands you the list.

Weekend project. $0 to $300 by Monday is realistic.

earnwith-ai.com/courses#flipit`,
    hashtags: ["digitalflipping", "weekendmoney", "aiautomation"],
  },
  {
    day: "Fri May 22", slot: "C — 7:30pm",
    scheduledFor: et(4, "19:30"),
    image: "gaia — casual Friday evening (or your real candid, drink in hand)",
    platforms: [Platform.INSTAGRAM, Platform.FACEBOOK],
    caption:
`Closing the laptop at 7pm and not opening it till Monday.

This is the version of work I built. Not because I work less — I work hard — but because I built systems that don't need me when I'm not at them.

The systems are in the courses. Link in bio.

Have a good weekend.`,
    hashtags: ["fridayreset", "worklifebalance", "digitalcreator"],
  },

  // ─── DAY 6 — Saturday, May 23 — Slow Saturday ───────────────────────
  {
    day: "Sat May 23", slot: "A — 8:30am",
    scheduledFor: et(5, "08:30"),
    image: "gaia — slow morning (bed / coffee / book / window light)",
    platforms: [Platform.INSTAGRAM, Platform.FACEBOOK],
    caption:
`Saturday mornings used to be me catching up on emails I didn't have time for during the week.

Now they're this.

The unlock wasn't motivation. It was building 5 things that earn while I sleep. Bestseller course shows you the same 5. Link in bio if you're curious.`,
    hashtags: ["slowmorning", "womensupportingwomen", "aientrepreneur"],
  },
  {
    day: "Sat May 23", slot: "B — 1:30pm",
    scheduledFor: et(5, "13:30"),
    image: "course-heroes/course-digital-twin.jpg",
    platforms: [Platform.INSTAGRAM, Platform.FACEBOOK],
    caption:
`AIMR Digital Twin Studio.

Train a private AI on your writing, your decisions, your style. Have it draft your emails, your social posts, your client replies — in your voice.

The course shows you how end to end. Includes resell rights.

earnwith-ai.com/courses#digital-twin`,
    hashtags: ["digitaltwin", "aiclone", "personalbrand"],
  },
  {
    day: "Sat May 23", slot: "C — 7:30pm",
    scheduledFor: et(5, "19:30"),
    image: "real DM testimonial screenshot (or Gaia portrait + quote overlay)",
    platforms: [Platform.INSTAGRAM, Platform.FACEBOOK],
    caption:
`"I bought the Bestseller in January thinking it was a Hail Mary. Last week I made $1,200. I haven't been back to my 9-5 inbox since Tuesday."

— Sara, marketing manager → digital creator, 14 weeks in.

If she can, you can. Link in bio → Digital Passive Income Academy.`,
    hashtags: ["realresults", "digitalcreator", "careerchange"],
  },

  // ─── DAY 7 — Sunday, May 24 — Sunday Setup ──────────────────────────
  {
    day: "Sun May 24", slot: "A — 8:30am",
    scheduledFor: et(6, "08:30"),
    image: "CAROUSEL · 4 slides · gaia journaling + your handwriting overlay",
    platforms: [Platform.INSTAGRAM],
    caption:
`Save this. Use it tonight.

The 12-min Sunday setup that makes my whole week:

1. Open Claude. Paste your calendar PNG. Ask: "What's the ONE thing each day I should protect time for?"
2. Ask Claude: "Based on my goal of [X], what's the 80/20 task I should refuse to skip this week?"
3. Schedule those into your calendar. Done.

Save this carousel — use it every Sunday.

100 free prompts like this at earnwith-ai.com/100-days.`,
    hashtags: ["sundayreset", "aiprompts", "productivity"],
  },
  {
    day: "Sun May 24", slot: "B — 1:30pm",
    scheduledFor: et(6, "13:30"),
    image: "CAROUSEL · 7 slides · one course hero per slide",
    platforms: [Platform.INSTAGRAM],
    caption:
`All 7 courses, one swipe.

Pick where you are:
· Just curious → Bestseller (Digital Passive Income Academy)
· Want to look pro online → Avatar Prompt Pack
· Want recurring revenue → MRR Bundle
· Want to clone yourself → Digital Twin Studio
· Camera shy but want to teach → AI Talking Head
· Want a weekend side hustle → FlipIt
· Want to crank out carousels → Caroux

earnwith-ai.com/courses`,
    hashtags: ["aieducation", "onlinecourse", "digitalcreator"],
  },
  {
    day: "Sun May 24", slot: "C — 7:30pm",
    scheduledFor: et(6, "19:30"),
    image: "profile-1080.jpg + 'Sunday note' overlay",
    platforms: [Platform.INSTAGRAM, Platform.FACEBOOK],
    caption:
`Every Sunday I send one email.

Not "AI news." One specific thing that worked for me this week — the prompt, the dollar amount, the screw-up.

Free. No 27-step funnel. Just useful.

earnwith-ai.com → scroll to Newsletter.`,
    hashtags: ["newsletter", "sundayemail", "aitips"],
  },
];

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!adminEmail) {
    console.error("✗ ADMIN_EMAIL must be set in .env or .env.local first.");
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) {
    console.error(`✗ No user found for ${adminEmail}. Run: npm run seed:user first.`);
    process.exit(1);
  }
  console.log(`Seeding for user: ${adminEmail} (${user.id})`);

  // Wipe prior seed run (idempotent re-run)
  const wiped = await prisma.draft.deleteMany({
    where: { userId: user.id, caption: { contains: SEED_MARKER } },
  });
  if (wiped.count) {
    console.log(`  cleaned ${wiped.count} prior drafts from this seed`);
  }

  let i = 0;
  for (const d of drafts) {
    i += 1;
    const header = `📷 IMAGE: ${d.image}\n🕒 ${d.day} · ${d.slot}\n${SEED_MARKER}\n\n`;
    await prisma.draft.create({
      data: {
        userId: user.id,
        caption: header + d.caption,
        hashtags: d.hashtags,
        platforms: d.platforms,
        scheduledFor: d.scheduledFor,
        status: DraftStatus.DRAFT, // explicit — user attaches image, then schedules
      },
    });
    console.log(`  ${String(i).padStart(2, "0")}. ${d.day} ${d.slot.padEnd(14)}  ${d.image.slice(0, 50)}`);
  }
  console.log(`\n✓ Inserted ${drafts.length} drafts. Open the Drafts tab in Creator OS.`);
  console.log(`  Remove the 📷/🕒 header lines from each caption before publishing.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
