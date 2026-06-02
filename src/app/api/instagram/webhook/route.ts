/**
 * Instagram Comment-to-DM webhook.
 *
 * GET  — Meta webhook verification challenge (hub.challenge).
 * POST — Receives comment + DM events. When a comment body contains a
 *        known ManyChat keyword, sends a button-card DM back to the
 *        commenter with a link to the guide page.
 *
 * Meta App Dashboard setup:
 *   Webhooks → Instagram → Subscribe: messages, messaging_postbacks, comments
 *   Callback URL: https://<your-domain>/api/instagram/webhook
 *   Verify token: value of INSTAGRAM_WEBHOOK_VERIFY_TOKEN env var
 *
 * Required env vars:
 *   INSTAGRAM_WEBHOOK_VERIFY_TOKEN  — your chosen verify token string
 *   META_APP_ID                     — from Meta App Dashboard
 *   META_APP_SECRET                 — from Meta App Dashboard
 *   NEXT_PUBLIC_APP_URL             — e.g. https://creator-os-delta.vercel.app
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { Platform } from "@prisma/client";

const GRAPH = "https://graph.facebook.com/v21.0";

// ─── Webhook verification (GET) ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  const expected = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  if (!expected) {
    console.error("[ig-webhook] INSTAGRAM_WEBHOOK_VERIFY_TOKEN not set");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  if (mode === "subscribe" && token === expected) {
    console.log("[ig-webhook] verified ✓");
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  console.warn("[ig-webhook] verify failed — bad token");
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

// ─── Event handler (POST) ─────────────────────────────────────────────────────

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  // 1. Parse payload
  let body: WebhookPayload;
  try {
    body = (await req.json()) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // 2. Only handle Instagram object type
  if (body.object !== "instagram") {
    return NextResponse.json({ status: "ignored" });
  }

  // 3. Process each entry in the background (Meta expects 200 fast)
  // We fire-and-forget — Meta retries on failure anyway.
  (async () => {
    for (const entry of body.entry ?? []) {
      // ─── Comments ───────────────────────────────────────────────────────
      for (const change of entry.changes ?? []) {
        if (change.field === "comments") {
          await handleComment(entry.id, change.value);
        }
      }
      // ─── Direct messages / postbacks ────────────────────────────────────
      for (const messaging of entry.messaging ?? []) {
        if (messaging.message?.text) {
          await handleDM(entry.id, messaging.sender.id, messaging.message.text);
        } else if (messaging.postback?.payload) {
          await handleDM(entry.id, messaging.sender.id, messaging.postback.payload);
        }
      }
    }
  })().catch((e) =>
    console.error("[ig-webhook] handler error:", (e as Error).message),
  );

  return NextResponse.json({ status: "ok" });
}

// ─── Comment handler ─────────────────────────────────────────────────────────

async function handleComment(igBusinessId: string, value: CommentValue) {
  // Only act on comments, not replies to comments
  if (!value?.text || value.parent_id) return;

  const keyword = extractKeyword(value.text);
  if (!keyword) return;

  const guide = await findGuideByKeyword(keyword);
  if (!guide) return;

  console.log(`[ig-webhook] comment match: "${keyword}" → ${guide.slug} (from ${value.from?.id})`);

  if (!value.from?.id) return;

  const token = await getAccessToken(igBusinessId);
  if (!token) {
    console.error(`[ig-webhook] no token for ig_business_id=${igBusinessId}`);
    return;
  }

  await Promise.all([
    // Send DM with button card
    sendButtonDM(token, value.from.id, guide),
    // Optional public reply under the comment ("Sent! Check your DMs 👇")
    replyToComment(token, value.id, "Sent! Check your DMs 👇"),
  ]);
}

// ─── DM / postback handler ───────────────────────────────────────────────────

async function handleDM(igBusinessId: string, senderId: string, text: string) {
  const keyword = extractKeyword(text);
  if (!keyword) return;

  const guide = await findGuideByKeyword(keyword);
  if (!guide) return;

  console.log(`[ig-webhook] DM match: "${keyword}" → ${guide.slug} (from ${senderId})`);

  const token = await getAccessToken(igBusinessId);
  if (!token) {
    console.error(`[ig-webhook] no token for ig_business_id=${igBusinessId}`);
    return;
  }

  await sendButtonDM(token, senderId, guide);
}

// ─── Core helpers ─────────────────────────────────────────────────────────────

/** Extract trigger keyword from a comment or DM body.
 *  Looks for a standalone uppercase word ≥ 2 chars. */
function extractKeyword(text: string): string | null {
  // Match words that are all-caps (user might comment "CREATOR" or "creator")
  const words = text
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (const word of words) {
    if (word.length >= 2) {
      // Return first word — we'll look it up. If no guide found, move on.
      return word;
    }
  }
  return null;
}

/** Find a DailyGuide by keyword (case-insensitive). */
async function findGuideByKeyword(
  keyword: string,
): Promise<{ slug: string; title: string; responseText: string } | null> {
  const guide = await prisma.dailyGuide.findFirst({
    where: {
      manychatKeyword: {
        equals: keyword,
        mode: "insensitive",
      },
      isPublished: true,
    },
    select: { slug: true, title: true, responseText: true },
  });
  return guide ?? null;
}

/** Get the decrypted access token for an IG business account. */
async function getAccessToken(igBusinessId: string): Promise<string | null> {
  const account = await prisma.socialAccount.findFirst({
    where: {
      platform: Platform.INSTAGRAM,
      platformUserId: igBusinessId,
      isActive: true,
    },
    select: { accessToken: true },
  });
  if (!account) return null;
  try {
    return decrypt(account.accessToken);
  } catch {
    return null;
  }
}

/** Build the guide page URL. */
function guideUrl(slug: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://creator-os-delta.vercel.app";
  return `${base}/guides/${slug}`;
}

/** Send a DM with a button card (text + CTA button → guide page). */
async function sendButtonDM(
  accessToken: string,
  recipientIgId: string,
  guide: { slug: string; title: string; responseText: string },
): Promise<void> {
  const dmText =
    guide.responseText?.trim() ||
    `Here it is! Hope it's SUPER helpful 🤩\n\nIf you have any questions, just let me know.`;

  const url = guideUrl(guide.slug);

  // Attempt generic template (button card). Falls back to plain text if
  // instagram_manage_messages isn't approved yet.
  const payload = {
    recipient: { id: recipientIgId },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: dmText,
          buttons: [
            {
              type: "web_url",
              url,
              title: "Get Free Guide",
            },
          ],
        },
      },
    },
  };

  const res = await fetch(`${GRAPH}/me/messages?access_token=${accessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    // If template isn't allowed, fall back to plain text + URL
    if (err.includes("(#100)") || err.includes("template")) {
      await sendPlainDM(accessToken, recipientIgId, `${dmText}\n\n${url}`);
    } else {
      console.error(`[ig-webhook] sendButtonDM failed:`, err.slice(0, 300));
    }
  } else {
    console.log(`[ig-webhook] DM sent to ${recipientIgId} → ${guide.slug}`);
  }
}

/** Plain-text DM fallback. */
async function sendPlainDM(
  accessToken: string,
  recipientIgId: string,
  text: string,
): Promise<void> {
  const res = await fetch(`${GRAPH}/me/messages?access_token=${accessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientIgId },
      message: { text },
    }),
  });
  if (!res.ok) {
    console.error(`[ig-webhook] sendPlainDM failed:`, (await res.text()).slice(0, 200));
  }
}

/** Reply to a comment publicly. */
async function replyToComment(
  accessToken: string,
  commentId: string,
  text: string,
): Promise<void> {
  const res = await fetch(
    `${GRAPH}/${commentId}/replies?access_token=${accessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    },
  );
  if (!res.ok) {
    // Non-fatal — comment reply isn't critical
    console.warn(`[ig-webhook] comment reply failed:`, (await res.text()).slice(0, 200));
  }
}

// ─── Type definitions ─────────────────────────────────────────────────────────

type WebhookPayload = {
  object: string;
  entry?: WebhookEntry[];
};

type WebhookEntry = {
  id: string; // IG business account ID
  time?: number;
  changes?: { field: string; value: CommentValue }[];
  messaging?: MessagingEvent[];
};

type CommentValue = {
  id: string;
  text: string;
  from?: { id: string; username?: string };
  media?: { id: string };
  parent_id?: string; // present on replies-to-comments
};

type MessagingEvent = {
  sender: { id: string };
  recipient: { id: string };
  message?: { mid: string; text: string };
  postback?: { payload: string; title?: string };
};
