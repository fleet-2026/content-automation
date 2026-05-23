/**
 * Re-export the Week-3 Reels folder as a SINGLE-FILE DASHBOARD.
 *
 * Outputs to C:\Users\serka\Desktop\EarnWithAI-Reels-Week-3\index.html
 *
 * Open that one file in your browser — you'll see all 7 Reels in a clean
 * scrollable view with:
 *   - Video preview (plays inline)
 *   - Hook (with one-click copy)
 *   - Voiceover script (with copy)
 *   - Caption (with copy)
 *   - Hashtags (with copy)
 *   - Open-in-Creator-OS link
 *
 * No more navigating 7 subfolders and 5 file types. Just one HTML file.
 */
import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const prisma = new PrismaClient();
const DEST_ROOT = String.raw`C:\Users\serka\Desktop\EarnWithAI-Reels-Week-3`;

const slugMap = [
  { iso: "2026-06-01T11:30:00.000Z", slug: "01-mon-passive-income", title: "Mon · 7:30am — Digital Passive Income Academy", folder: "01-mon-passive-income" },
  { iso: "2026-06-02T23:30:00.000Z", slug: "02-tue-avatar-pack",    title: "Tue · 7:30pm — AI Avatar Prompt Pack",     folder: "02-tue-avatar-pack" },
  { iso: "2026-06-03T16:30:00.000Z", slug: "03-wed-mrr-bundle",     title: "Wed · 12:30pm — AI Revolution MRR Bundle",  folder: "03-wed-mrr-bundle" },
  { iso: "2026-06-04T11:30:00.000Z", slug: "04-thu-digital-twin",   title: "Thu · 7:30am — AIMR Digital Twin Studio",   folder: "04-thu-digital-twin" },
  { iso: "2026-06-05T23:30:00.000Z", slug: "05-fri-talking-head",   title: "Fri · 7:30pm — AI Talking Head",            folder: "05-fri-talking-head" },
  { iso: "2026-06-06T13:00:00.000Z", slug: "06-sat-flipit",         title: "Sat · 9:00am — FlipIt",                      folder: "06-sat-flipit" },
  { iso: "2026-06-07T23:30:00.000Z", slug: "07-sun-caroux",         title: "Sun · 7:30pm — Caroux",                      folder: "07-sun-caroux" },
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim()!;
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) throw new Error("no user");

  const sections: string[] = [];

  for (const entry of slugMap) {
    const draft = await prisma.draft.findFirst({
      where: { userId: user.id, scheduledFor: new Date(entry.iso) },
    });
    if (!draft) continue;

    const hook = draft.selectedHook ?? draft.caption.split("\n")[0];
    const body = draft.caption.startsWith(hook) ? draft.caption.slice(hook.length).trim() : draft.caption;
    const hashtags = draft.hashtags.map(h => `#${h}`).join(" ");
    const composeUrl = `https://creator-os-delta.vercel.app/compose?draft=${draft.id}`;

    sections.push(`
<section class="reel">
  <header>
    <h2>${escapeHtml(entry.title)}</h2>
    <a class="cta" href="${composeUrl}" target="_blank">Open in Creator OS →</a>
  </header>

  <div class="grid">
    <div class="video-col">
      <video controls preload="metadata" loop muted>
        <source src="${entry.folder}/broll.mp4" type="video/mp4">
        Your browser can't play the b-roll.
      </video>
      <p class="muted">B-roll: 3-5s. Loop in CapCut to match audio length.</p>
    </div>

    <div class="text-col">
      <div class="field">
        <div class="label">
          <span>🎬 HOOK (on-screen text + first line of caption)</span>
          <button class="copy" data-text="${escapeHtml(hook)}">Copy</button>
        </div>
        <div class="value hook">${escapeHtml(hook)}</div>
      </div>

      <div class="field">
        <div class="label">
          <span>🎤 VOICEOVER (paste into HeyGen)</span>
          <button class="copy" data-text="${escapeHtml(body)}">Copy</button>
        </div>
        <pre class="value">${escapeHtml(body)}</pre>
      </div>

      <div class="field">
        <div class="label">
          <span>📝 FULL CAPTION (paste into Instagram on upload)</span>
          <button class="copy" data-text="${escapeHtml(draft.caption)}">Copy</button>
        </div>
        <pre class="value">${escapeHtml(draft.caption)}</pre>
      </div>

      <div class="field">
        <div class="label">
          <span>#️⃣ HASHTAGS</span>
          <button class="copy" data-text="${escapeHtml(hashtags)}">Copy</button>
        </div>
        <div class="value hashtags">${escapeHtml(hashtags)}</div>
      </div>
    </div>
  </div>
</section>
`);
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>EarnWithAI · Week 3 Reels Dashboard</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root {
      --sage: #A5A57E; --sage-deep: #84855E;
      --sand: #E8DCC0; --sand-deep: #DCC9A5;
      --cream: #F5EDDC; --mustard: #D4AB5F; --mustard-deep: #B8893E;
      --olive: #3F422C; --ink: #2A2520; --plum: #5B2C39;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      background: var(--sand);
      color: var(--ink);
      line-height: 1.5;
    }
    .top {
      background: var(--plum);
      color: var(--cream);
      padding: 40px 48px;
    }
    .top h1 {
      margin: 0 0 8px;
      font-family: Georgia, serif;
      font-style: italic;
      font-size: 44px;
      font-weight: 400;
    }
    .top .sub { opacity: 0.8; font-size: 16px; }
    .top .dot { color: var(--mustard); }
    main { max-width: 1280px; margin: 0 auto; padding: 32px 24px 96px; }
    .reel {
      background: var(--cream);
      border-radius: 16px;
      margin-bottom: 32px;
      padding: 24px 28px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    }
    .reel header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 16px;
      border-bottom: 1px solid rgba(42,37,32,0.12);
      padding-bottom: 16px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }
    .reel h2 {
      margin: 0;
      font-family: Georgia, serif;
      font-style: italic;
      font-size: 26px;
      font-weight: 500;
      color: var(--ink);
    }
    .cta {
      background: var(--mustard);
      color: var(--ink);
      text-decoration: none;
      padding: 10px 18px;
      border-radius: 999px;
      font-weight: 600;
      font-size: 13px;
      letter-spacing: 0.04em;
    }
    .cta:hover { background: var(--mustard-deep); color: var(--cream); }
    .grid {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 32px;
    }
    @media (max-width: 800px) {
      .grid { grid-template-columns: 1fr; }
    }
    .video-col video {
      width: 100%;
      border-radius: 12px;
      background: #000;
      aspect-ratio: 9/16;
      object-fit: cover;
    }
    .muted { color: var(--olive); font-size: 12px; margin: 8px 0 0; }
    .field { margin-bottom: 20px; }
    .label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--olive);
      margin-bottom: 8px;
    }
    .copy {
      background: var(--ink);
      color: var(--cream);
      border: 0;
      padding: 5px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      letter-spacing: 0.06em;
    }
    .copy:hover { background: var(--plum); }
    .copy.copied { background: var(--mustard); color: var(--ink); }
    .value {
      background: #fff;
      border: 1px solid rgba(42,37,32,0.08);
      border-radius: 10px;
      padding: 14px 16px;
      font-size: 14.5px;
    }
    .value.hook {
      font-family: Georgia, serif;
      font-style: italic;
      font-size: 19px;
      color: var(--plum);
    }
    pre.value {
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: -apple-system, "Segoe UI", sans-serif;
      margin: 0;
    }
    .hashtags { font-family: Consolas, monospace; color: var(--mustard-deep); }
    .toc {
      position: sticky; top: 0;
      background: var(--sand);
      border-bottom: 1px solid rgba(42,37,32,0.12);
      padding: 12px 24px;
      z-index: 10;
      display: flex; gap: 12px; flex-wrap: wrap;
      font-size: 12px;
    }
    .toc a {
      color: var(--ink);
      text-decoration: none;
      padding: 6px 12px;
      border-radius: 999px;
      background: var(--cream);
    }
    .toc a:hover { background: var(--mustard); }
  </style>
</head>
<body>
  <div class="top">
    <h1>EarnWith<span class="dot">·</span>AI · Week 3 Reels</h1>
    <div class="sub">June 1-7, 2026 · 7 Reels, one per product · scroll for everything you need to ship them</div>
  </div>

  <div class="toc">
    ${slugMap.map((e, i) => `<a href="#${e.slug}">${i + 1}. ${e.folder.split("-").slice(1, 3).join(" ")}</a>`).join("")}
  </div>

  <main>
    ${sections.map((s, i) => s.replace('<section class="reel">', `<section class="reel" id="${slugMap[i].slug}">`)).join("")}
  </main>

  <script>
    document.querySelectorAll('button.copy').forEach(btn => {
      btn.addEventListener('click', async () => {
        const text = btn.dataset.text;
        try {
          await navigator.clipboard.writeText(text);
          btn.classList.add('copied');
          const original = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.textContent = original;
          }, 1500);
        } catch (e) {
          alert('Copy failed — select and copy manually.');
        }
      });
    });
  </script>
</body>
</html>`;

  const out = join(DEST_ROOT, "index.html");
  await writeFile(out, html, "utf8");
  console.log(`✓ Dashboard written to ${out}`);
  console.log(`\n  Open it: explorer "${out}"`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
