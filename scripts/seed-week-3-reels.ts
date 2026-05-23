/**
 * Week 3 — 7 Reels for June 1-7, 2026
 *
 * One Reel per product:
 *   1. Digital Passive Income Academy   (Bestseller)
 *   2. AI Avatar Prompt Pack            (Popular)
 *   3. AI Revolution MRR Bundle         (MRR)
 *   4. AIMR Digital Twin Studio         (MRR)
 *   5. Beginner's Guide to AI Talking Head (New)
 *   6. FlipIt                           (New)
 *   7. Caroux                           (New)
 *
 * Each Reel: image-led hook · caption body · 2 alt hooks · real product URL.
 * NO prices anywhere. Hook = on-screen text overlay = caption first line.
 *
 * Posting times are varied (morning / lunch / evening / weekend) so you can
 * see which slot drives the most reach for Reels specifically.
 *
 * Run: cd creator-os && npx tsx scripts/seed-week-3-reels.ts
 */
import { PrismaClient, DraftStatus, Platform } from "@prisma/client";
import { uploadToR2 } from "@/lib/r2";
import { sniffFileType } from "@/lib/file-sniff";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";

const prisma = new PrismaClient();
const GAIA_ORIGINALS = String.raw`C:\Users\serka\OneDrive\Desktop\gaia muzboard images`;

// June 1, 2026 = Monday. EDT (UTC-4).
function et(dayOffset: number, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const date = new Date("2026-06-01T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(h + 4, m, 0, 0);
  return date;
}

const URL = {
  passiveIncome:  "https://earnwith-ai.com/courses#passive-income",
  avatarPrompts:  "https://earnwith-ai.com/courses#avatar-prompts",
  mrrBundle:      "https://earnwith-ai.com/courses#mrr-bundle",
  digitalTwin:    "https://earnwith-ai.com/courses#digital-twin",
  talkingHead:    "https://earnwith-ai.com/courses#talking-head",
  flipit:         "https://earnwith-ai.com/courses#flipit",
  caroux:         "https://earnwith-ai.com/courses#caroux",
} as const;

const GAIA_MP4S = [
  "openart-3f1f4e971868253963d209d8c9e600a2-5f82d181-ed96-404c-a766-45e35da8280e_1771629066538_b2bc4eaa.mp4",
  "openart-42b64c7168439bcd244b0b435a8f657d-8f40078f-eac0-4e64-9567-bf622d5ead8d_1773482107443_f9754830.mp4",
  "openart-02177817453338100000000000000000000ffffc0a8ab9974f927_1778174633658_2312be58.mp4",
  "openart-02177817477009900000000000000000000ffffc0a89044eb7c56_1778174903577_be8085e3.mp4",
  "openart-02177817524839500000000000000000000ffffc0a899c867125e_1778175369161_8e4ad615.mp4",
  "openart-02177817559365200000000000000000000ffffc0a8845b4128e3_1778175726032_2e10a248.mp4",
  "openart-02177817580074600000000000000000000ffffc0a8636472affc_1778175965243_2ca1dfa9.mp4",
  "openart-02177817603814500000000000000000000ffffc0a8b51cd134de_1778176182183_416c5afb.mp4",
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

type Reel = {
  scheduledFor: Date;
  slot: string;
  product: string;
  mediaAbs: string;
  selectedHook: string;
  captionBody: string;
  hashtags: string[];
  alternates: HookVariant[];
};

// 8 unique reuse slots: videos 7 + 8 are unused-in-W2; 1-5 are reused with
// completely different overlay text & VO so the same 3-sec b-roll reads new.
const reels: Reel[] = [
  // ─── Mon June 1 · 7:30am · Digital Passive Income Academy ───────────
  {
    scheduledFor: et(0, "07:30"), slot: "Mon · 7:30am",
    product: "Digital Passive Income Academy",
    mediaAbs: videoPath(7), // unused-in-W2
    selectedHook: "The morning I stopped opening someone else's inbox first.",
    captionBody: `For 27 years, the first thing I did at 6am was read Slack messages from people I didn't choose. Their priorities became my morning.

Now the first thing I do is open my own dashboard. Money came in overnight. My day starts with me.

The 5 income streams I built to make this real are inside the Bestseller.

${URL.passiveIncome}`,
    hashtags: ["passiveincome", "workingwomen", "careerchange", "mompreneur"],
    alternates: [
      v("Stop opening someone else's inbox at 6am.", "challenge", 0.069, "Direct prescription. Strong with overwhelmed corporate audience."),
      v("What 'passive income' actually looks like on a Tuesday morning.", "contrarian", 0.064, "Anti-influencer framing. Higher save rate."),
    ],
  },

  // ─── Tue June 2 · 7:30pm · AI Avatar Prompt Pack ────────────────────
  {
    scheduledFor: et(1, "19:30"), slot: "Tue · 7:30pm",
    product: "AI Avatar Prompt Pack",
    mediaAbs: videoPath(8), // unused-in-W2
    selectedHook: "How I post 3 times a day without ever picking up a camera.",
    captionBody: `One consistent character. 700 prompts. Magazine-quality photos generated in 30 seconds each.

My entire Instagram for the past year — every cafe shot, every workspace, every outfit change — is the same AI avatar. No studios. No MUAs. No "the light's better at 7am, can you be there."

The pack I built her with is in the link.

${URL.avatarPrompts}`,
    hashtags: ["aiavatar", "aiart", "contentcreator", "contentstrategy"],
    alternates: [
      v("Every photo on my feed is fake. Here's how.", "contrarian", 0.073, "Confession-style scroll-stopper. Highest reel CTR."),
      v("I haven't picked up a camera in 12 months.", "personal-stat", 0.069, "Time-collapsed anchor. Highly relatable for creators."),
    ],
  },

  // ─── Wed June 3 · 12:30pm · AI Revolution MRR Bundle ────────────────
  {
    scheduledFor: et(2, "12:30"), slot: "Wed · 12:30pm",
    product: "AI Revolution MRR Bundle",
    mediaAbs: videoPath(1),
    selectedHook: "I sold my course 7 times this week. Zero of them were during my work hours.",
    captionBody: `That's the whole pitch for MRR.

Build it once. Charge once. Get paid every month, indefinitely, while you do literally anything else.

My MRR Bundle teaches the playbook AND gives you resell rights — so you can sell my courses as yours, full margin.

${URL.mrrBundle}`,
    hashtags: ["mrr", "passiveincome", "digitalproducts", "resellrights"],
    alternates: [
      v("Why I built recurring revenue before I built a salary again.", "personal-stat", 0.071, "Counter-conventional career path. Strong shareability."),
      v("Resell rights are the cheat code most working women never get told about.", "contrarian", 0.067, "Niche-specific insight. High save + DM rate."),
    ],
  },

  // ─── Thu June 4 · 7:30am · AIMR Digital Twin Studio ─────────────────
  {
    scheduledFor: et(3, "07:30"), slot: "Thu · 7:30am",
    product: "AIMR Digital Twin Studio",
    mediaAbs: videoPath(2),
    selectedHook: "There's another version of me writing my emails right now.",
    captionBody: `I trained a private AI on my writing, my decisions, my voice. It drafts my emails, my LinkedIn posts, my client replies — in the way I'd actually say them. Then I edit and send.

I haven't written a cold reply from scratch in 4 months.

Digital Twin Studio. Includes resell rights so you can build twins for clients too.

${URL.digitalTwin}`,
    hashtags: ["digitaltwin", "aiclone", "personalbrand", "workingwomen"],
    alternates: [
      v("Train an AI on YOU. Have it work the night shift.", "promise", 0.072, "Anthropomorphized AI as employee. Strong scroll-stop."),
      v("The version of me that handles emails is the one that doesn't get tired.", "story-open", 0.066, "Empathetic self-reference. Higher engagement, lower CTR."),
    ],
  },

  // ─── Fri June 5 · 7:30pm · Beginner's Guide to AI Talking Head ──────
  {
    scheduledFor: et(4, "19:30"), slot: "Fri · 7:30pm",
    product: "AI Talking Head",
    mediaAbs: videoPath(3),
    selectedHook: "I'm camera shy. So I built a version of me that isn't.",
    captionBody: `Talking-head videos without ever facing a camera.

Write the script. Pick the voice. Render. Done.

90-minute course. Your first AI talking-head video is rendered by minute 60. By minute 90 you have a workflow you'll never give up.

${URL.talkingHead}`,
    hashtags: ["aitalkinghead", "contentcreator", "camerashy", "introvert"],
    alternates: [
      v("Camera-shy creators win at YouTube. Here's the unfair part.", "contrarian", 0.068, "Counter-narrative + curiosity gap."),
      v("Writers > improvisers on camera. AI closes the gap.", "promise", 0.062, "Insight opener for word-people audience."),
    ],
  },

  // ─── Sat June 6 · 9:00am · FlipIt ───────────────────────────────────
  {
    scheduledFor: et(5, "09:00"), slot: "Sat · 9:00am",
    product: "FlipIt",
    mediaAbs: videoPath(4),
    selectedHook: "Weekend project: your first paid customer before Monday.",
    captionBody: `FlipIt scans 8 marketplaces, sorts by margin, hands you a list of digital products to flip.

Find one. Flip it. 3-5× profit per flip.

Realistic Saturday-to-Monday goal: a first sale you can screenshot and send to your partner.

${URL.flipit}`,
    hashtags: ["weekendhustle", "digitalflipping", "sidehustle", "aiautomation"],
    alternates: [
      v("What I'd start tomorrow if I were 25 again with no savings.", "story-open", 0.070, "Past-self-from-scratch framing. Engagement-heavy."),
      v("Find a flippable product before noon. Sell it before Sunday.", "promise", 0.067, "Specific timeline frame. Action-driving."),
    ],
  },

  // ─── Sun June 7 · 7:30pm · Caroux ───────────────────────────────────
  {
    scheduledFor: et(6, "19:30"), slot: "Sun · 7:30pm",
    product: "Caroux",
    mediaAbs: videoPath(5),
    selectedHook: "Watch me turn one idea into a week of platform-tailored content.",
    captionBody: `Paste an idea into Caroux. It drafts:
· an IG carousel
· a LinkedIn document
· an X thread
· a TikTok caption + script

All in your colors. All in your voice. All scheduled for the right platform at the right time.

The Sunday I stop dreading is the one Caroux pre-loads.

${URL.caroux}`,
    hashtags: ["contentcreation", "aitools", "carousel", "contentstrategy"],
    alternates: [
      v("Stop writing the same idea 4 times for 4 platforms.", "challenge", 0.069, "Pain-point opener. Strong creator pain point."),
      v("One idea. Four platforms. Four minutes.", "list-tease", 0.071, "Triple-beat hook. Top-tier for product reveal Reels."),
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

  console.log(`Seeding Week 3 — ${reels.length} Reels for ${adminEmail}\n`);

  const upload = uploadCache();
  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const r of reels) {
    try {
      const url = await upload(r.mediaAbs, user.id);
      const caption = `${r.selectedHook}\n\n${r.captionBody}`;

      const data = {
        userId: user.id,
        caption,
        hashtags: r.hashtags,
        platforms: [Platform.INSTAGRAM, Platform.TIKTOK] as Platform[], // Reels cross to TikTok well
        scheduledFor: r.scheduledFor,
        mediaUrl: url,
        selectedHook: r.selectedHook,
        hookOptions: [
          { text: r.selectedHook, pattern: r.alternates[0]?.pattern ?? null, predictedER: null, similarHookIds: [], reasoning: "Your selected hook (image-aligned)." },
          ...r.alternates,
        ] as object,
        status: DraftStatus.DRAFT,
      };

      const existing = await prisma.draft.findFirst({
        where: { userId: user.id, scheduledFor: r.scheduledFor },
      });
      if (existing) {
        await prisma.draft.update({ where: { id: existing.id }, data });
        updated += 1;
        console.log(`  ↻ ${r.slot.padEnd(18)} ${r.product.padEnd(34)}  updated`);
      } else {
        await prisma.draft.create({ data });
        inserted += 1;
        console.log(`  + ${r.slot.padEnd(18)} ${r.product.padEnd(34)}  created`);
      }
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ✗ ${r.slot.padEnd(18)} FAILED: ${msg}`);
    }
  }

  console.log(`\nSummary: ${inserted} new · ${updated} updated · ${failed} failed`);

  // Final $-scan on Week 3 only
  const w3Drafts = await prisma.draft.findMany({
    where: { userId: user.id, scheduledFor: { gte: et(0, "00:00"), lt: et(7, "00:00") } },
  });
  const leaks = w3Drafts.filter(d => {
    const json = JSON.stringify(d.hookOptions ?? []);
    return /\$\d/.test(d.caption) || (d.selectedHook && /\$\d/.test(d.selectedHook)) || /\$\d/.test(json);
  });
  console.log(`\nWeek 3 $-scan: ${leaks.length === 0 ? "✓ price-free" : `⚠ ${leaks.length} leaks`}`);

  if (failed === 0 && leaks.length === 0) {
    console.log(`\n✓ Week 3 is live. 43 total drafts now in Creator OS (W1: 21, W2: 15, W3: 7).`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
