/**
 * Serves a mobile-friendly page with a TikTok caption ready to copy.
 *
 * After publishing a video to TikTok's inbox, the desktop editor shows
 * a QR code linking here. The user scans it on their phone, taps "Copy",
 * and pastes into TikTok — bridging the desktop→mobile gap.
 *
 * URL: /api/tt-caption?slug=<slug>&h=<hmac>&t=<timestamp>
 *
 * The HMAC prevents random access. It's computed from the slug + hour
 * bucket + AUTH_SECRET, so the link expires roughly every hour.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";

const SECRET = () => process.env.AUTH_SECRET ?? "fallback-caption-secret";

/** Generate an HMAC for a slug + time bucket (valid for ~1 hour). */
export function captionHmac(slug: string): { h: string; t: string } {
  const t = String(Math.floor(Date.now() / 3_600_000)); // hour bucket
  const h = crypto
    .createHmac("sha256", SECRET())
    .update(`${slug}:${t}`)
    .digest("hex")
    .slice(0, 16);
  return { h, t };
}

function verify(slug: string, h: string, t: string): boolean {
  // Allow current hour and previous hour (so links don't break mid-hour)
  const now = Math.floor(Date.now() / 3_600_000);
  for (const bucket of [String(now), String(now - 1)]) {
    const expected = crypto
      .createHmac("sha256", SECRET())
      .update(`${slug}:${bucket}`)
      .digest("hex")
      .slice(0, 16);
    if (h === expected) return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  const draftId = req.nextUrl.searchParams.get("draft") ?? "";
  const h = req.nextUrl.searchParams.get("h") ?? "";
  const t = req.nextUrl.searchParams.get("t") ?? "";

  const key = slug || draftId;
  if (!key || !h || !verify(key, h, t)) {
    return new NextResponse("Link expired or invalid. Publish again to get a fresh QR code.", {
      status: 403,
      headers: { "Content-Type": "text/plain" },
    });
  }

  let title = "";
  let fullCaption = "";

  if (slug) {
    const guide = await prisma.dailyGuide.findUnique({
      where: { slug },
      select: { title: true, caption: true, hashtags: true },
    });
    if (!guide) {
      return new NextResponse("Post not found.", { status: 404, headers: { "Content-Type": "text/plain" } });
    }
    title = title;
    fullCaption = [
      guide.caption?.trim(),
      guide.hashtags?.length
        ? guide.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")
        : "",
    ].filter(Boolean).join("\n\n");
  } else {
    const draft = await prisma.draft.findUnique({
      where: { id: draftId },
      select: { caption: true, selectedHook: true, hashtags: true },
    });
    if (!draft) {
      return new NextResponse("Draft not found.", { status: 404, headers: { "Content-Type": "text/plain" } });
    }
    title = draft.selectedHook ?? "TikTok Post";
    const parts: string[] = [];
    if (draft.selectedHook && draft.caption) {
      parts.push(`${draft.selectedHook}\n\n${draft.caption.replace(new RegExp(`^${draft.selectedHook.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`), "")}`);
    } else {
      parts.push(draft.caption ?? "");
    }
    if (draft.hashtags?.length) {
      parts.push(draft.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" "));
    }
    fullCaption = parts.filter(Boolean).join("\n\n");
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>TikTok Caption — ${escHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #111; color: #eee; padding: 20px; min-height: 100dvh; }
    h1 { font-size: 16px; color: #999; margin-bottom: 8px; }
    h2 { font-size: 20px; margin-bottom: 16px; }
    .caption { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 16px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; max-height: 50vh; overflow-y: auto; -webkit-user-select: all; user-select: all; }
    .btn { display: block; width: 100%; margin-top: 16px; padding: 16px; border: none; border-radius: 12px; font-size: 18px; font-weight: 700; cursor: pointer; transition: opacity .15s; }
    .btn:active { opacity: .8; }
    .copy-btn { background: #fff; color: #111; }
    .done { background: #22c55e; color: #fff; }
    .hint { text-align: center; color: #666; font-size: 12px; margin-top: 12px; }
  </style>
</head>
<body>
  <h1>TikTok Caption</h1>
  <h2>${escHtml(title)}</h2>
  <div class="caption" id="cap">${escHtml(fullCaption)}</div>
  <button class="btn copy-btn" id="copyBtn" onclick="copyCaption()">Copy Caption</button>
  <p class="hint">Paste into TikTok → Post</p>
  <script>
    const text = ${JSON.stringify(fullCaption)};
    async function copyCaption() {
      const btn = document.getElementById('copyBtn');
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = '✓ Copied!';
        btn.className = 'btn done';
        setTimeout(() => { btn.textContent = 'Copy Caption'; btn.className = 'btn copy-btn'; }, 3000);
      } catch {
        // Fallback: select the text
        const el = document.getElementById('cap');
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        btn.textContent = 'Text selected — long press to copy';
        btn.className = 'btn done';
      }
    }
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
