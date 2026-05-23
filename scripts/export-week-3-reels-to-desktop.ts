/**
 * Export Week-3 Reels to your desktop so you can find everything locally.
 *
 * Output: C:\Users\serka\Desktop\EarnWithAI-Reels-Week-3\
 *   ├── 01-mon-passive-income\
 *   │     ├── broll.mp4          (the Gaia b-roll, copied locally)
 *   │     ├── hook.txt           (the on-screen overlay text)
 *   │     ├── voiceover.txt      (paste this into HeyGen)
 *   │     ├── caption.txt        (paste this into Instagram on upload)
 *   │     └── README.md          (everything together, with the URL)
 *   ├── 02-tue-avatar-pack\
 *   ├── 03-wed-mrr-bundle\
 *   ├── ... (7 total)
 *   └── README.md                (overview)
 */
import { PrismaClient } from "@prisma/client";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

const DEST_ROOT = String.raw`C:\Users\serka\Desktop\EarnWithAI-Reels-Week-3`;
const GAIA_ORIGINALS = String.raw`C:\Users\serka\OneDrive\Desktop\gaia muzboard images`;

// Map: scheduledFor (ms) → { slug, sourceBrollFilename }
// These mirror what seed-week-3-reels.ts uploaded, so we copy the
// matching local file into each Reel folder.
const reelMap = [
  { iso: "2026-06-01T11:30:00.000Z", slug: "01-mon-passive-income",
    broll: "openart-02177817580074600000000000000000000ffffc0a8636472affc_1778175965243_2ca1dfa9.mp4" }, // video-07
  { iso: "2026-06-02T23:30:00.000Z", slug: "02-tue-avatar-pack",
    broll: "openart-02177817603814500000000000000000000ffffc0a8b51cd134de_1778176182183_416c5afb.mp4" }, // video-08
  { iso: "2026-06-03T16:30:00.000Z", slug: "03-wed-mrr-bundle",
    broll: "openart-3f1f4e971868253963d209d8c9e600a2-5f82d181-ed96-404c-a766-45e35da8280e_1771629066538_b2bc4eaa.mp4" }, // video-01
  { iso: "2026-06-04T11:30:00.000Z", slug: "04-thu-digital-twin",
    broll: "openart-42b64c7168439bcd244b0b435a8f657d-8f40078f-eac0-4e64-9567-bf622d5ead8d_1773482107443_f9754830.mp4" }, // video-02
  { iso: "2026-06-05T23:30:00.000Z", slug: "05-fri-talking-head",
    broll: "openart-02177817453338100000000000000000000ffffc0a8ab9974f927_1778174633658_2312be58.mp4" }, // video-03
  { iso: "2026-06-06T13:00:00.000Z", slug: "06-sat-flipit",
    broll: "openart-02177817477009900000000000000000000ffffc0a89044eb7c56_1778174903577_be8085e3.mp4" }, // video-04
  { iso: "2026-06-07T23:30:00.000Z", slug: "07-sun-caroux",
    broll: "openart-02177817524839500000000000000000000ffffc0a899c867125e_1778175369161_8e4ad615.mp4" }, // video-05
];

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim()!;
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) throw new Error("no user");

  await mkdir(DEST_ROOT, { recursive: true });

  const summaryRows: string[] = [];

  for (const entry of reelMap) {
    const sched = new Date(entry.iso);
    const draft = await prisma.draft.findFirst({
      where: { userId: user.id, scheduledFor: sched },
    });
    if (!draft) {
      console.log(`  ✗ ${entry.slug.padEnd(28)} not found in DB`);
      continue;
    }

    const dir = join(DEST_ROOT, entry.slug);
    await mkdir(dir, { recursive: true });

    // 1. Copy the b-roll MP4
    const brollSrc = join(GAIA_ORIGINALS, entry.broll);
    const brollDst = join(dir, "broll.mp4");
    if (existsSync(brollSrc)) {
      await copyFile(brollSrc, brollDst);
    } else {
      await writeFile(brollDst + ".MISSING", `Source not found: ${brollSrc}`);
    }

    // 2. Extract hook + body from caption
    const caption = draft.caption;
    const hook = draft.selectedHook ?? caption.split("\n")[0];
    const body = caption.startsWith(hook) ? caption.slice(hook.length).trim() : caption;

    // 3. Write text files
    await writeFile(join(dir, "hook.txt"), hook, "utf8");
    await writeFile(join(dir, "voiceover.txt"), body, "utf8");
    await writeFile(join(dir, "caption.txt"), caption, "utf8");
    await writeFile(
      join(dir, "hashtags.txt"),
      draft.hashtags.map((h) => `#${h}`).join(" "),
      "utf8",
    );

    // 4. README per Reel
    const ts = sched.toUTCString();
    const readme = `# Reel — ${entry.slug}

Scheduled: ${ts}
Draft ID:  ${draft.id}
Open in Creator OS: https://creator-os-delta.vercel.app/compose?draft=${draft.id}

---

## 🎬 HOOK (burn this on screen for first 1.5s in CapCut)

${hook}

---

## 🎤 VOICEOVER (paste this into HeyGen — uses your avatar + voice)

${body}

---

## 📝 FULL CAPTION (paste into Instagram on upload)

${caption}

---

## #️⃣ HASHTAGS

${draft.hashtags.map((h) => "#" + h).join(" ")}

---

## 🎞️ FILES IN THIS FOLDER

- broll.mp4         — Gaia b-roll (3-5 sec — loop in CapCut for the full Reel length)
- hook.txt          — just the hook (paste as a CapCut text overlay)
- voiceover.txt     — HeyGen script
- caption.txt       — full IG caption
- hashtags.txt      — copy-paste-ready hashtags

---

## ✏️ HOW TO BUILD THIS REEL

1. Open HeyGen → New Project → use your avatar+voice IDs
2. Paste \`voiceover.txt\` → render → download the audio/video MP4
3. Open CapCut → drop \`broll.mp4\` on track 1 (loop to match audio length)
4. Drop the HeyGen audio on track 2
5. Add a text overlay using \`hook.txt\` → position frame 1, hold 1.5s, fade out
6. Export 1080×1920 (vertical)
7. Open this Reel in Creator OS (link above) → re-upload the exported MP4 as the media
8. Schedule or Publish Now
`;
    await writeFile(join(dir, "README.md"), readme, "utf8");

    summaryRows.push(
      `${entry.slug.padEnd(28)} — ${sched.toISOString().slice(0, 16).replace("T", " ")} UTC — "${hook.slice(0, 50)}${hook.length > 50 ? "…" : ""}"`,
    );
    console.log(`  ✓ ${entry.slug}`);
  }

  // 5. Top-level README
  const topReadme = `# EarnWithAI · Week-3 Reels (June 1-7, 2026)

7 Reels, one per product. Each subfolder is self-contained:
b-roll + hook text + HeyGen voiceover script + IG caption + hashtags + a per-Reel README.

---

## The 7 Reels

${summaryRows.map((r, i) => `${i + 1}. ${r}`).join("\n")}

---

## Suggested production order

Knock out Mon's Reel first so it's ready by Sunday night. Then batch-render
Tue-Thu over one evening (each takes ~15 min in HeyGen + CapCut). Save Fri-Sun
for the weekend if you want to add fresh selfie B-roll instead of using Gaia.

---

## If you want to swap the b-roll

The b-roll files here are just *copies* of the 8 Gaia MP4s at
\`C:\\Users\\serka\\OneDrive\\Desktop\\gaia muzboard images\\\`. Replace any
\`broll.mp4\` in a subfolder with a different file (rename it) — the rest of
the workflow doesn't care.

Source MP4 list (in case you want to pick a different one):
- video-01: openart-3f1f4e971868253963d209d8c9e600a2-...
- video-02: openart-42b64c7168439bcd244b0b435a8f657d-...
- video-03 through 08: openart-021778... (chronologically the latest set)

---

## After publishing

The drafts in Creator OS still point at the *placeholder* Gaia b-roll, not your
finished Reel. After you upload the final MP4 to Instagram (manually for now),
either:

- **Mark the draft as PUBLISHED in Creator OS** (so it tracks performance)
- Or **upload the finished MP4** through Compose to replace the mediaUrl, then
  click "Publish Now" — Creator OS will post it to IG for you if the IG
  account is connected.
`;
  await writeFile(join(DEST_ROOT, "README.md"), topReadme, "utf8");

  console.log(`\n✓ Exported to ${DEST_ROOT}`);
  console.log(`\n  Open the folder: explorer "${DEST_ROOT}"`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
