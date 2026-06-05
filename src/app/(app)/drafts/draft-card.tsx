"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, Edit, Trash2, ExternalLink, Images, Check, AlertTriangle, Eye, Music2, CheckCircle2, RefreshCw } from "lucide-react";
import type { Platform, DraftStatus } from "@prisma/client";
import { publishDraftNow, deleteDraft, saveDraft, setDraftPlatforms, getDraftCaptionUrl } from "../compose/actions";
import { parseMediaUrls, parseMusicUrl } from "@/lib/media-urls";
import { stripHookPrefix } from "@/lib/captions";
import { MediaPreviewModal } from "@/components/media-preview-modal";
import { PLATFORM_INFO } from "@/lib/platform-info";

// Hide disabled platforms (e.g. YouTube, when user has turned it off
// in PLATFORM_INFO) from all UI surfaces in this card — both the
// platform pills row AND the publishResults breakdown. Old drafts
// were saved with those platforms in their arrays, so client-side
// filtering is the cleanest fix without a destructive DB migration.
function isPlatformVisible(p: Platform): boolean {
  return PLATFORM_INFO[p]?.enabled !== false;
}

/** Build the full caption text (hook + body + hashtags) the way it'd
 *  appear under a published post — used for the TikTok "Copy caption"
 *  button since TikTok's inbox API doesn't accept a caption param.
 *
 *  TikTok-specific tweak: replaces any ManyChat "comment X to get the
 *  link" CTA with a "link in bio" CTA because TikTok doesn't have a
 *  reliable comment-to-DM bot for non-pre-approved business accounts.
 *  The keyword stays in the CTA so the user knows which guide page
 *  to find when they tap the bio link.
 */
/** Best-effort keyword extraction from a "Comment XYZ" ManyChat-style
 *  CTA in the caption body. Returns null if nothing matches. */
function extractKeyword(caption: string): string | null {
  // Match: "Comment X", "Type X in", "Drop X below", with X being an
  // uppercase word ≥3 chars (typical ManyChat keyword format).
  const re = /(?:comment|type|drop)\s+["']?([A-Z][A-Z0-9_-]{2,})["']?/i;
  const m = caption.match(re);
  return m ? m[1].toUpperCase() : null;
}

function buildShareableCaption(
  draft: {
    caption: string;
    selectedHook: string | null;
    hashtags: string[];
    publishResults: PublishResult[] | null;
  },
  opts?: { forTikTok?: boolean; tiktokKeyword?: string },
): string {
  const parts: string[] = [];
  // Hook lives at the top — saveDraft prepends it onto caption too,
  // so strip duplicate if present.
  let body = stripHookPrefix(draft.caption, draft.selectedHook);

  // Strip ManyChat-style "comment X" instructions when generating the
  // TikTok variant — they don't work on TikTok and confuse viewers.
  if (opts?.forTikTok) {
    // Common patterns the user (or AI) might use for ManyChat CTAs:
    //   "Comment KEYWORD to..."
    //   "Comment 'KEYWORD' for..."
    //   "Type KEYWORD in the comments..."
    body = body.replace(
      /(?:\n\s*)?(?:type|comment|drop)\s+["']?[A-Z][A-Z0-9_-]{2,}["']?[^.\n]*\.?/gi,
      "",
    ).trim();
  }

  if (draft.selectedHook && body.trim()) {
    parts.push(`${draft.selectedHook}\n\n${body}`);
  } else if (draft.selectedHook) {
    parts.push(draft.selectedHook);
  } else {
    parts.push(body);
  }

  // TikTok-specific CTA: "link in bio". Add the keyword if we have one
  // so viewers know exactly which guide page to tap on the bio link.
  if (opts?.forTikTok) {
    const kw = opts.tiktokKeyword?.trim().toUpperCase();
    parts.push("");
    parts.push(
      kw
        ? `📌 Full guide → link in bio → tap ${kw}`
        : "📌 Full guide → link in bio",
    );
  }

  if (Array.isArray(draft.hashtags) && draft.hashtags.length) {
    parts.push("");
    parts.push(draft.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" "));
  }
  return parts.join("\n").trim();
}

/** Tiny inline button — copies the given text to clipboard and shows
 *  a ✓ flash for a moment. Used for "Copy caption for TikTok". */
function CopyCaptionButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          /* ignore — older browsers without clipboard API */
        }
      }}
      className={
        "text-xs px-2 py-0.5 rounded font-medium inline-flex items-center gap-1 ml-1 transition " +
        (copied
          ? "bg-emerald-200 text-emerald-900"
          : "bg-emerald-100 hover:bg-emerald-200 text-emerald-900")
      }
      title="Copy the full caption (hook + body + hashtags) — paste it into the TikTok app"
    >
      {copied ? "✓ Copied" : label}
    </button>
  );
}

/** QR code button for TikTok caption — shows a QR code on click
 *  so the user can scan on their phone and paste the caption. */
function TikTokQrButton({ draftId }: { draftId: string }) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (qrUrl) { setQrUrl(null); return; }
    setLoading(true);
    try {
      const url = await getDraftCaptionUrl(draftId);
      setQrUrl(url);
    } catch { /* non-critical */ }
    finally { setLoading(false); }
  };

  return (
    <span className="inline-flex items-center">
      <button
        type="button"
        onClick={toggle}
        className="text-xs px-2 py-0.5 rounded font-medium inline-flex items-center gap-1 ml-1 bg-cyan-100 hover:bg-cyan-200 text-cyan-900 transition"
        title="Show QR code — scan on phone to copy caption"
      >
        {loading ? "…" : qrUrl ? "Hide QR" : "QR"}
      </button>
      {qrUrl && (
        <span className="ml-2 inline-block rounded bg-white p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(qrUrl)}`}
            alt="Scan to copy caption"
            width={80}
            height={80}
          />
        </span>
      )}
    </span>
  );
}

// `publishResults` is stored as `Json?` in Prisma. Each entry came from
// publishDraft() in src/lib/publish.ts and matches PublishResult.
type PublishResult = {
  platform: Platform;
  ok: boolean;
  postId?: string;
  url?: string;
  error?: string;
};

export type DraftCardData = {
  id: string;
  caption: string;
  selectedHook: string | null;
  mediaUrl: string | null;
  platforms: Platform[];
  status: DraftStatus;
  scheduledFor: Date | null;
  updatedAt: Date;
  publishResults: PublishResult[] | null;
  // Hashtags live separately on the Draft schema; surface them so the
  // preview modal can render the full assembled post (hook + caption +
  // hashtags + platform list) rather than just hook + caption.
  hashtags: string[];
};

// Loosened from the original `\.(jpg|jpeg|png|webp)$` — R2 / signed URLs often
// carry query strings (`...?X-Amz-Signature=...`) which would break the strict
// end-anchor check and prevent agent-generated images from rendering at all.
const IMG_RE = /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i;
const VIDEO_RE = /\.(mp4|mov|m4v|webm)(\?|$)/i;

// Solid, high-contrast badges so each state reads clearly on the light
// theme. Green = published, dark = draft, the rest are bold + white text
// instead of the old pale pastels the user couldn't see.
const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-stone-700 text-white",
  APPROVED: "bg-blue-600 text-white",
  SCHEDULED: "bg-amber-700 text-white",
  PUBLISHING: "bg-purple-600 text-white",
  PUBLISHED: "bg-emerald-600 text-white",
  FAILED: "bg-red-600 text-white",
};

/** Account state snapshot per platform — passed in from the server so
 *  we can tell whether a "token expired" error from a prior publish
 *  is now stale (account reconnected since), and adjust the message.
 *  Also drives the green-tick connection-health indicator on the
 *  platform toggle chips. */
export type AccountStateMap = Record<
  string,
  {
    tokenExpiry: Date | null;
    updatedAt: Date;
    lastError?: string | null;
  }
>;

/** Per-platform connection health for the green-tick UI.
 *  - 'ready'      → green ✓ — account connected + token fresh + no errors
 *  - 'warn'       → amber ⚠ — token expires in <7 days
 *  - 'broken'     → red ✗  — token expired or last publish had auth error
 *  - 'disconnected' → grey ○ — no account row found */
export type Health = "ready" | "warn" | "broken" | "disconnected";

function computeHealth(
  platform: Platform,
  acctState?: { tokenExpiry: Date | null; lastError?: string | null },
): { state: Health; reason: string } {
  if (!acctState) {
    return { state: "disconnected", reason: `${platform} not connected — click Reconnect` };
  }
  const exp = acctState.tokenExpiry?.getTime();
  const now = Date.now();
  if (exp != null && exp < now) {
    return { state: "broken", reason: `${platform} access token expired — reconnect to publish` };
  }
  // Look at lastError for auth-flavored failures from the last sync run.
  const err = (acctState.lastError ?? "").toLowerCase();
  if (
    err.includes("token") ||
    err.includes("expired") ||
    err.includes("unauthorized") ||
    err.includes("oauthexception")
  ) {
    return { state: "broken", reason: `${platform} last call failed with an auth error — reconnect to publish` };
  }
  // Tokens expiring within 7 days → warn but allow publish
  if (exp != null && exp - now < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.max(0, Math.round((exp - now) / (24 * 60 * 60 * 1000)));
    return {
      state: "warn",
      reason: `${platform} token expires in ${days}d — reconnect soon to avoid interruption`,
    };
  }
  return { state: "ready", reason: `${platform} connected and ready` };
}

export function DraftCard({
  draft,
  accountStateByPlatform,
}: {
  draft: DraftCardData;
  accountStateByPlatform?: AccountStateMap;
}) {
  const router = useRouter();
  const [publishing, startPub] = useTransition();
  const [deleting, startDel] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  // Inline two-stage confirms instead of window.confirm(). Browser dialogs
  // get auto-blocked after a few in-session prompts on Chrome/Edge — when
  // that happens, confirm() returns false instantly and the user sees the
  // button as "broken" (click → nothing). Inline state is bulletproof.
  const [pubConfirm, setPubConfirm] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Result modal — populated after a Publish-now action finishes so the
  // user gets explicit per-platform success/fail confirmation instead of
  // just seeing the card silently update.
  const [recentPublish, setRecentPublish] = useState<PublishResult[] | null>(null);

  // Per-draft platform selection — lets the user enable/disable each
  // platform before clicking Publish now. Default seeded from the
  // server-stored platforms list; persists via setDraftPlatforms server
  // action so the choice survives navigation + re-renders.
  const [selectedPlatforms, setSelectedPlatformsLocal] = useState<Platform[]>(
    draft.platforms,
  );
  // Force-retry list — per-platform opt-in to bypass the skip-on-success
  // logic. Used when the user deleted the prior post on a platform (e.g.
  // a duplicate FB post) and wants to republish from this draft.
  // Session-local only (not persisted) — fresh choice every visit.
  const [forceRetryPlatforms, setForceRetryPlatforms] = useState<Platform[]>([]);
  function togglePlatform(p: Platform) {
    const next = selectedPlatforms.includes(p)
      ? selectedPlatforms.filter((x) => x !== p)
      : [...selectedPlatforms, p];
    setSelectedPlatformsLocal(next);
    // Fire-and-forget persistence — UI updates instantly; the server
    // action sync is non-blocking. If it fails (network blip) the next
    // Publish-now call falls back to the optimistically-set list anyway.
    void setDraftPlatforms(draft.id, next).catch(() => {});
  }
  function toggleForceRetry(p: Platform) {
    setForceRetryPlatforms((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
    );
  }
  // Per-publish snapshot of which platforms were carry-overs (not
  // freshly attempted). Lets the result modal mark them clearly so
  // the user sees "1 newly attempted, 2 carried over" instead of an
  // ambiguous "3 succeeded".
  const [lastCarriedOver, setLastCarriedOver] = useState<Set<Platform>>(
    new Set(),
  );

  // mediaUrl may contain a newline-packed list of URLs when the draft is a
  // carousel. Pull out the primary for the thumbnail and keep the count so
  // we can badge multi-image drafts. Background music URL (if any) is
  // packed in the same field with the `audio::` prefix — surfaced as a
  // small badge next to the platform list.
  const allMediaUrls = parseMediaUrls(draft.mediaUrl);
  const draftMusicUrl = parseMusicUrl(draft.mediaUrl);
  const primary = allMediaUrls[0] ?? null;
  const isImage = primary ? IMG_RE.test(primary) : false;
  const isVideo = primary ? VIDEO_RE.test(primary) : false;
  const isCarousel = allMediaUrls.length > 1;

  // Posted state: PUBLISHED status + at least one successful per-platform
  // result. We render a prominent "Posted ✓" banner at the top of the card
  // when this is true, with quick view links to each platform's live post.
  const isPosted = draft.status === "PUBLISHED";
  // Filter to visible (enabled) platforms only — successful posts to
  // disabled platforms (e.g. YouTube after the user turned it off)
  // shouldn't show up in the "Posted" banner.
  const successfulPosts = (draft.publishResults ?? []).filter(
    (r) => r.ok && isPlatformVisible(r.platform),
  );

  // Per-platform error classifier. Maps Meta/Instagram-specific token-
  // expiry messages to a friendlier "Reconnect Instagram" hint instead of
  // showing the raw "Unsupported state or unable to authenticate data"
  // string the user saw in the screenshot.
  // Helper: detect if the user reconnected this platform's account
  // SINCE the failed publish was recorded. If SocialAccount.updatedAt
  // is after draft.updatedAt, the OAuth was refreshed and the "expired
  // token" error from publishResults is stale.
  function platformReconnectedSinceFailure(platform: string): boolean {
    const acct = accountStateByPlatform?.[platform];
    if (!acct) return false;
    // The draft's updatedAt is the publish-attempt timestamp.
    if (acct.updatedAt.getTime() <= draft.updatedAt.getTime()) return false;
    // Also confirm the token isn't already expired again — fresh
    // reconnect should have set tokenExpiry to a future date.
    if (acct.tokenExpiry && acct.tokenExpiry.getTime() < Date.now()) return false;
    return true;
  }

  function classifyError(platform: string, raw: string | undefined): {
    friendly: string;
    needsReconnect: boolean;
  } {
    if (!raw) return { friendly: "", needsReconnect: false };
    const lower = raw.toLowerCase();
    const tokenError =
      lower.includes("unsupported state") ||
      lower.includes("authenticate data") ||
      lower.includes("token") ||
      lower.includes("expired") ||
      lower.includes("invalid_token") ||
      lower.includes("oauthexception");
    if (tokenError) {
      // If the user has reconnected since the failure, the error is stale.
      // Tell them to just hit Publish — no second reconnect needed.
      if (platformReconnectedSinceFailure(platform)) {
        return {
          friendly: `${platform} reconnected — click Publish now to retry.`,
          needsReconnect: false,
        };
      }
      return {
        friendly: `${platform} access token expired — reconnect to publish.`,
        needsReconnect: true,
      };
    }
    // TikTok-specific: scope wasn't granted at connect time (we recently
    // added `video.upload`, but pre-existing connections kept the older
    // read-only scope set). Reconnecting re-prompts TikTok for the full
    // scope list and grants the upload permission.
    if (
      lower.includes("scope_not_authorized") ||
      lower.includes("scope not authorized") ||
      lower.includes("did not authorize the scope")
    ) {
      if (platformReconnectedSinceFailure(platform)) {
        return {
          friendly: `${platform} reconnected — click Publish now to retry.`,
          needsReconnect: false,
        };
      }
      return {
        friendly: `${platform} is missing the video-upload permission — reconnect to grant it.`,
        needsReconnect: true,
      };
    }
    // Meta GraphMethodException — usually "object does not exist" or
    // "access denied for this object". Happens after IG Business
    // account is unlinked from the FB page or the page-scoped token
    // can't reach the IG account anymore. A plain reconnect won't
    // fix this — the user has to relink the IG Business account in
    // Meta Business Suite (or remove + reconnect from scratch).
    if (
      lower.includes("graphmethodexception") ||
      (lower.includes("authorization error") && lower.includes("code\":100")) ||
      lower.includes("error_subcode\":33") ||
      lower.includes("error_subcode\":2069008")
    ) {
      if (platformReconnectedSinceFailure(platform)) {
        return {
          friendly: `${platform} reconnected — click Publish now to retry.`,
          needsReconnect: false,
        };
      }
      return {
        friendly:
          "Instagram Business account isn't linked to the Page. Open Meta Business Suite → Settings → Connected Accounts → re-link IG Business → then disconnect + reconnect IG here.",
        needsReconnect: true,
      };
    }
    // TikTok-specific: the PULL_FROM_URL source rejects URLs whose
    // domain isn't on the developer's verified-domain list. We've
    // switched to FILE_UPLOAD which doesn't have this constraint —
    // but show a friendly message if it ever leaks through.
    if (
      lower.includes("url_ownership_unverified") ||
      lower.includes("url ownership")
    ) {
      return {
        friendly:
          "TikTok rejected the source URL. The upload method has been switched — re-publish to try again.",
        needsReconnect: false,
      };
    }
    if (lower.includes("delivered_to_inbox")) {
      // TikTok's inbox API doesn't accept a caption/title — the video
      // arrives in the TikTok app with no text, and the user has to
      // type or paste it manually. (Full direct-post with pre-filled
      // caption requires `video.publish` scope, which needs TikTok
      // audit approval.) The card surfaces a "Copy TikTok caption"
      // button — it generates a TikTok-flavored version that uses
      // "link in bio" instead of ManyChat "Comment X" (which doesn't
      // work on TikTok for most accounts).
      return {
        friendly:
          "Uploaded to your TikTok inbox. Set your TikTok bio link to /guides, then: open TikTok app → drafts → paste the caption (use the green button →) → Post.",
        needsReconnect: false,
      };
    }
    if (lower.includes("no_connected_account")) {
      return {
        friendly: `No ${platform} account connected.`,
        needsReconnect: true,
      };
    }
    if (lower.includes("missing_video") || lower.includes("missing_media")) {
      return {
        friendly: "Missing video — attach media before publishing.",
        needsReconnect: false,
      };
    }
    return { friendly: raw, needsReconnect: false };
  }

  // Publish is only meaningful for editable states. PUBLISHING is mid-flight
  // (don't double-fire). PUBLISHED would be a republish, which we deliberately
  // don't expose — that's a new-post action, not a draft action.
  const canPublish =
    draft.status === "DRAFT" ||
    draft.status === "FAILED" ||
    draft.status === "APPROVED" ||
    draft.status === "SCHEDULED";
  const canDelete = draft.status !== "PUBLISHING";

  function onPublishClick() {
    setErr(null);
    if (draft.platforms.length === 0) {
      setErr("Pick at least one platform first (Edit → Platforms).");
      return;
    }
    // First click → arm confirmation. Second click → actually publish.
    if (!pubConfirm) {
      setPubConfirm(true);
      setDelConfirm(false);
      return;
    }
    setPubConfirm(false);
    // Snapshot platforms that were already-ok BEFORE this publish, so
    // the result modal can label them as "(skipped — already posted)"
    // instead of pretending they were just attempted.
    const carriedOverSnapshot = new Set(
      (draft.publishResults ?? [])
        .filter((r) => r.ok && !forceRetryPlatforms.includes(r.platform))
        .map((r) => r.platform),
    );
    setLastCarriedOver(carriedOverSnapshot);
    startPub(async () => {
      try {
        // Capture the per-platform PublishResult[] returned by the action
        // so we can surface a clear "Published to X, Y" modal — instead
        // of relying only on the silent router.refresh() update.
        // Pass forceRetryPlatforms so previously-ok platforms the user
        // ticked ↻ on get re-attempted instead of auto-skipped.
        const results = await publishDraftNow(draft.id, forceRetryPlatforms);
        setRecentPublish(Array.isArray(results) ? results : null);
        // Clear the force list after publish so it doesn't accidentally
        // apply to a future publish on the same card.
        setForceRetryPlatforms([]);
        router.refresh();
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      }
    });
  }

  function onDeleteClick() {
    setErr(null);
    if (!delConfirm) {
      setDelConfirm(true);
      setPubConfirm(false);
      return;
    }
    setDelConfirm(false);
    startDel(async () => {
      try {
        await deleteDraft(draft.id);
        router.refresh();
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      }
    });
  }

  return (
    <article
      className={
        "border rounded-xl bg-[var(--color-surface)] p-5 " +
        (isPosted ? "border-emerald-500/40" : "")
      }
    >
      {/* Just-published modal — shows immediately after a Publish-now
          action returns. Lists EVERY platform attempted with explicit
          ✓ / ✗ + per-platform link or error. Persists until the user
          dismisses it (router.refresh updates the underlying card with
          the same data, but this modal stays prominent so the user
          gets a clear "what just happened" snapshot). */}
      {recentPublish && recentPublish.length > 0 && (() => {
        // Hide disabled platforms from the just-published modal — same
        // policy as the rest of the card.
        const visiblePublish = recentPublish.filter((r) => isPlatformVisible(r.platform));
        if (visiblePublish.length === 0) return null;
        // Split into "freshly attempted" vs "carried over from prior
        // successful publish" so the user sees the TRUTH about what
        // just happened — only the newly-attempted platforms got new
        // API calls; carry-overs are unchanged from before.
        const fresh = visiblePublish.filter((r) => !lastCarriedOver.has(r.platform));
        const carried = visiblePublish.filter((r) => lastCarriedOver.has(r.platform));
        const oks = fresh.filter((r) => r.ok);
        const fails = fresh.filter((r) => !r.ok);
        const headerColor =
          fails.length === 0
            ? "bg-emerald-50 border-emerald-300 text-emerald-900"
            : oks.length === 0
              ? "bg-red-50 border-red-300 text-red-900"
              : "bg-amber-50 border-amber-300 text-amber-900";
        const headerIcon =
          fails.length === 0 ? "✓ Published" : oks.length === 0 ? "✗ Publish failed" : "⚠ Partial publish";
        return (
          <div className={`mb-4 rounded-lg border-2 ${headerColor}`}>
            <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-current/20">
              <strong className="text-sm">
                {headerIcon}{" "}
                <span className="font-normal text-xs opacity-80">
                  · {oks.length + fails.length} attempted this time
                  {carried.length > 0 ? ` · ${carried.length} skipped (already posted)` : ""}
                </span>
              </strong>
              <button
                type="button"
                onClick={() => setRecentPublish(null)}
                className="text-xs px-2 py-1 rounded hover:bg-black/5 font-medium"
                aria-label="Dismiss"
              >
                Dismiss ✕
              </button>
            </div>
            <ul className="px-4 py-3 space-y-1.5 text-sm">
              {visiblePublish.map((r) => {
                const cls = classifyError(r.platform, r.error);
                const isCarryOver = lastCarriedOver.has(r.platform);
                return (
                  <li key={r.platform} className="flex items-center gap-2 flex-wrap">
                    {r.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                    )}
                    <span className="font-semibold capitalize">{r.platform.toLowerCase()}</span>
                    {isCarryOver && (
                      <span
                        className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-zinc-100 text-zinc-700 border border-zinc-200 font-medium"
                        title="This platform was NOT attempted this time — it succeeded in a previous publish and was auto-skipped to prevent duplicate posts. Click ↻ on the chip to force a retry."
                      >
                        skipped — already posted
                      </span>
                    )}
                    {r.ok ? (
                      r.url ? (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-2 py-0.5 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-medium inline-flex items-center gap-1 ml-1"
                        >
                          view post <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : cls.friendly ? (
                        // ok=true WITH a friendly note (e.g. TikTok's
                        // "delivered to inbox" — finalize-in-app step).
                        // Show the message + a Copy-caption button so
                        // the user can paste the caption into TikTok in
                        // one tap (TikTok inbox doesn't accept caption
                        // via API).
                        <>
                          <span className="text-xs text-emerald-700">
                            — {cls.friendly}
                          </span>
                          {r.platform === "TIKTOK" && (
                            <>
                              <CopyCaptionButton
                                text={buildShareableCaption(draft, {
                                  forTikTok: true,
                                  tiktokKeyword:
                                    extractKeyword(draft.caption) ?? undefined,
                                })}
                                label="Copy caption for TikTok"
                              />
                              <TikTokQrButton draftId={draft.id} />
                            </>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-emerald-700">posted</span>
                      )
                    ) : (
                      <>
                        <span className="text-xs text-red-700">
                          — {cls.friendly || r.error || "failed"}
                        </span>
                        {cls.needsReconnect && (
                          <a
                            href={`/api/connect/${r.platform.toLowerCase()}`}
                            className="text-xs px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-medium inline-flex items-center gap-1 ml-1"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Reconnect
                          </a>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })()}

      {/* Posted banner — shown prominently when the draft has been
          successfully published. Quick links to each platform's live post
          on the right side so the user can jump straight to the URL. */}
      {isPosted && successfulPosts.length > 0 && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
            <CheckCircle2 className="w-4 h-4" />
            Posted
            {draft.publishResults && draft.publishResults.length > 0 && (
              <span className="text-xs font-normal text-emerald-700">
                · {new Date(draft.updatedAt).toLocaleString()}
              </span>
            )}
          </span>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {successfulPosts.map((r) => (
              <a
                key={r.platform}
                href={r.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="text-xs px-2 py-1 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-medium inline-flex items-center gap-1"
              >
                {r.platform.toLowerCase()} <ExternalLink className="w-3 h-3" />
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {draft.selectedHook && (
            <p className="font-medium leading-snug">&ldquo;{draft.selectedHook}&rdquo;</p>
          )}
          <p className="text-sm text-[var(--color-muted)] mt-1 line-clamp-2">
            {/* Saved caption may have the hook baked in at the front
                (saveDraft prepends it). Strip on render so the hook
                isn't shown twice — once as the title, once at the
                start of the caption body. */}
            {stripHookPrefix(draft.caption, draft.selectedHook)}
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-[var(--color-muted)]">
            {/* Derived status label: if status==FAILED but some visible
                platforms actually succeeded, call it "partial" — that's
                what's true. If ALL visible platforms succeeded but the
                row is FAILED (because a disabled platform like YouTube
                "failed"), just call it "posted". The raw enum is kept
                in the DB; this is presentation only. */}
            {(() => {
              const visibleResults = (draft.publishResults ?? []).filter((r) =>
                isPlatformVisible(r.platform),
              );
              const visibleOks = visibleResults.filter((r) => r.ok).length;
              const visibleFails = visibleResults.filter((r) => !r.ok).length;
              let label: string = draft.status.toLowerCase();
              let cls = STATUS_COLORS[draft.status] ?? "";
              if (draft.status === "FAILED" && visibleOks > 0 && visibleFails > 0) {
                label = "partial";
                cls = "bg-amber-700 text-white";
              } else if (
                draft.status === "FAILED" &&
                visibleOks > 0 &&
                visibleFails === 0
              ) {
                label = "posted";
                cls = STATUS_COLORS["PUBLISHED"] ?? "bg-emerald-100 text-emerald-800";
              }
              return (
                <span
                  className={
                    "text-[10px] px-2 py-0.5 rounded uppercase tracking-wider " +
                    cls
                  }
                >
                  {label}
                </span>
              );
            })()}
            {/* Interactive platform toggles. Click any to include/exclude
                from the NEXT publish. A previously-successful platform
                is automatically already excluded from the publish retry
                (skip-on-success logic in publish.ts) — toggling here
                lets the user override that decision either way. */}
            {/* Show ALL configured platforms, even if not in the current
                draft.platforms list, so the user can re-add one they
                turned off. (Restricted to enabled platforms — YouTube
                etc. stays hidden.) */}
            {(() => {
              const allVisible = (
                ["INSTAGRAM", "TIKTOK", "FACEBOOK", "LINKEDIN"] as Platform[]
              ).filter(isPlatformVisible);
              return allVisible.map((p) => {
                const selected = selectedPlatforms.includes(p);
                const previouslyOk = (draft.publishResults ?? []).some(
                  (r) => r.platform === p && r.ok,
                );
                const forceRetry = forceRetryPlatforms.includes(p);
                const health = computeHealth(p, accountStateByPlatform?.[p]);
                const dotColor =
                  health.state === "ready"
                    ? "bg-emerald-500"
                    : health.state === "warn"
                      ? "bg-amber-500"
                      : health.state === "broken"
                        ? "bg-red-500"
                        : "bg-zinc-400";
                // Visual states:
                //   not selected   → strike-through grey
                //   selected + already-ok + force-retry → AMBER (will retry)
                //   selected + already-ok                → emerald (will skip)
                //   selected (fresh / failed before)     → cream
                const chipBg = !selected
                  ? "bg-transparent border-[var(--color-border)] text-[var(--color-muted)] line-through opacity-60"
                  : previouslyOk && forceRetry
                    ? "bg-amber-100 border-amber-300 text-amber-900"
                    : previouslyOk
                      ? "bg-emerald-100 border-emerald-300 text-emerald-900"
                      : "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text)]";
                return (
                  <span
                    key={p}
                    className="inline-flex items-center gap-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => togglePlatform(p)}
                      title={
                        previouslyOk
                          ? forceRetry
                            ? "Will RE-POST to this platform even though it already succeeded. Click ↻ to undo, or this chip to deselect."
                            : `Already posted last time — will be skipped on retry. ${health.reason}`
                          : `${health.reason}. Click to ${selected ? "exclude" : "include"} on next publish.`
                      }
                      className={
                        "inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-l-full border transition uppercase tracking-wider " +
                        chipBg
                      }
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                      {p.toLowerCase()}
                      {forceRetry && (
                        <span className="text-[9px] font-bold ml-0.5">↻ force</span>
                      )}
                    </button>
                    {/* Force-retry mini-button — only shown for platforms
                        that previously succeeded. Lets the user override
                        the auto-skip when they've manually deleted the
                        prior post and want to republish fresh. */}
                    {previouslyOk && selected && (
                      <button
                        type="button"
                        onClick={() => toggleForceRetry(p)}
                        title={
                          forceRetry
                            ? `Cancel force-retry on ${p.toLowerCase()}`
                            : `Force retry on ${p.toLowerCase()} (use only if you deleted the previous post)`
                        }
                        className={
                          "text-[10px] px-1.5 py-0.5 rounded-r-full border-y border-r transition uppercase tracking-wider " +
                          (forceRetry
                            ? "bg-amber-200 border-amber-300 text-amber-900 hover:bg-amber-300"
                            : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]")
                        }
                      >
                        ↻
                      </button>
                    )}
                  </span>
                );
              });
            })()}
            {draft.scheduledFor && (
              <span>scheduled for {new Date(draft.scheduledFor).toLocaleString()}</span>
            )}
            {draftMusicUrl && (
              <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-accent)] bg-[var(--color-surface-2)] px-1.5 py-0.5 rounded">
                <Music2 className="w-2.5 h-2.5" /> music
              </span>
            )}
          </div>

          {/* Per-platform publish results. Errors now run through
              classifyError() to produce friendlier messages + surface a
              "Reconnect" CTA when the failure looks like an expired or
              invalid OAuth token (the IG "Unsupported state" case). */}
          {draft.publishResults && draft.publishResults.filter((r) => isPlatformVisible(r.platform)).length > 0 && (
            <ul className="mt-3 space-y-1 text-xs">
              {draft.publishResults.filter((r) => isPlatformVisible(r.platform)).map((r) => {
                const cls = classifyError(r.platform, r.error);
                return (
                  <li key={r.platform} className="flex items-center gap-2 flex-wrap">
                    <span
                      className={
                        "inline-block w-2 h-2 rounded-full " +
                        (r.ok ? "bg-emerald-500" : "bg-red-500")
                      }
                    />
                    <span className="font-medium">{r.platform.toLowerCase()}</span>
                    {r.url ? (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--color-accent)] hover:underline flex items-center gap-1"
                      >
                        view <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : cls.friendly ? (
                      <span className="text-[var(--color-muted)]">— {cls.friendly}</span>
                    ) : null}
                    {cls.needsReconnect && (
                      <a
                        href={`/api/connect/${r.platform.toLowerCase()}`}
                        className="text-xs px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-medium inline-flex items-center gap-1 ml-1"
                        title={`Reconnect your ${r.platform.toLowerCase()} account`}
                      >
                        <RefreshCw className="w-3 h-3" />
                        Reconnect
                      </a>
                    )}
                    {/* TikTok inbox uploads arrive with NO caption (API
                        limitation). One-tap copy button + QR code so the
                        user can paste the caption into TikTok app. */}
                    {r.platform === "TIKTOK" && r.ok && cls.friendly && (
                      <>
                        <CopyCaptionButton
                          text={buildShareableCaption(draft, {
                            forTikTok: true,
                            tiktokKeyword:
                              extractKeyword(draft.caption) ?? undefined,
                          })}
                          label="Copy TikTok caption"
                        />
                        <TikTokQrButton draftId={draft.id} />
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {err && (
            <p className="mt-3 text-xs text-red-700" role="alert">
              {err}
            </p>
          )}
        </div>

        {/* Media thumbnail. Strict regex was hiding agent-generated R2 images
            because their signed URLs end with `?token=...` rather than `.png`.
            Multi-image drafts get a small "+N" badge in the corner so the
            carousel intent is visible without expanding the card. */}
        {primary && isImage ? (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="relative w-24 h-24 shrink-0 group cursor-pointer"
            title="Click to preview full size"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={primary}
              alt=""
              loading="lazy"
              decoding="async"
              width={96}
              height={96}
              className="w-24 h-24 object-cover rounded-lg bg-[var(--color-surface-2)] group-hover:opacity-80 transition"
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 rounded-lg transition">
              <Eye className="w-5 h-5 text-white" />
            </div>
            {isCarousel && (
              <span className="absolute top-1 right-1 inline-flex items-center gap-0.5 text-[10px] bg-black/70 text-white rounded px-1.5 py-0.5 font-medium">
                <Images className="w-3 h-3" />+{allMediaUrls.length - 1}
              </span>
            )}
          </button>
        ) : primary && isVideo ? (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="w-24 h-24 grid place-items-center text-xs text-[var(--color-muted)] rounded-lg bg-[var(--color-surface-2)] shrink-0 hover:bg-[var(--color-border)] transition"
            title="Click to preview"
          >
            <Eye className="w-4 h-4 mb-1" />
            <span className="text-[10px]">video</span>
          </button>
        ) : primary ? (
          // Unknown extension — still indicate media is attached.
          <div className="w-24 h-24 grid place-items-center text-xs text-[var(--color-muted)] rounded-lg bg-[var(--color-surface-2)] shrink-0">
            media
          </div>
        ) : null}
      </div>

      {/* Preview modal — rendered conditionally inside the card. Closes on
          Esc, on backdrop click, or via the X button. Carousel keyboard
          arrows work while open. Now also exposes Edit / Publish / Delete
          directly inside the modal so the user can publish from preview
          without bouncing back to the card. */}
      {previewOpen && (
        <MediaPreviewModal
          draftId={draft.id}
          mediaUrls={allMediaUrls}
          musicUrl={draftMusicUrl}
          hook={draft.selectedHook}
          caption={draft.caption}
          hashtags={draft.hashtags}
          platforms={draft.platforms}
          status={draft.status}
          canEdit={true}
          canPublish={canPublish}
          canDelete={canDelete}
          onPublish={async () => {
            const results = await publishDraftNow(draft.id, forceRetryPlatforms);
            setRecentPublish(Array.isArray(results) ? results : null);
            setForceRetryPlatforms([]);
            router.refresh();
          }}
          onDelete={async () => {
            await deleteDraft(draft.id);
            router.refresh();
          }}
          onSaveDraft={async ({ caption, selectedHook, hashtags }) => {
            // Inline edit from preview: only mutates the text fields.
            // Media + platforms + scheduledFor stay as-is — the full
            // editor is the path for those.
            await saveDraft({
              draftId: draft.id,
              caption,
              hashtags,
              selectedHook,
              mediaUrl: draft.mediaUrl,
              platforms: draft.platforms,
              scheduledFor: draft.scheduledFor
                ? draft.scheduledFor.toISOString()
                : null,
            });
            router.refresh();
          }}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {/* Action row */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[var(--color-border)]">
        {primary && (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] font-medium"
            title="See the post as it'll appear (full-size media + carousel + caption)"
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
          </button>
        )}
        <Link
          href={`/compose?draft=${draft.id}`}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 font-semibold"
          title="Edit caption, hook, hashtags, media, platforms"
        >
          <Edit className="w-3.5 h-3.5" />
          Edit
        </Link>

        {canPublish && (() => {
          // Compute health for every CURRENTLY-SELECTED platform on the
          // draft. Any 'broken' or 'disconnected' blocks the Publish-now
          // button until the user fixes it — surfaces a clear "click
          // Reconnect on X first" message right next to the button.
          const selectedHealth = selectedPlatforms
            .filter(isPlatformVisible)
            .map((p) => ({
              platform: p,
              ...computeHealth(p, accountStateByPlatform?.[p]),
            }));
          const blocked = selectedHealth.filter(
            (h) => h.state === "broken" || h.state === "disconnected",
          );
          const warns = selectedHealth.filter((h) => h.state === "warn");
          const allReady = selectedHealth.length > 0 && blocked.length === 0;
          const noSelection = selectedPlatforms.filter(isPlatformVisible).length === 0;
          // Platforms that ACTUALLY get attempted on next Publish: the
          // backend skips any platform that previously succeeded (no
          // duplicate posts) UNLESS the user explicitly opts in via
          // the per-platform ↻ force button.
          const previouslyOkPlatforms = new Set(
            (draft.publishResults ?? []).filter((r) => r.ok).map((r) => r.platform),
          );
          const forceSet = new Set(forceRetryPlatforms);
          const platformsWillRetry = selectedPlatforms
            .filter(isPlatformVisible)
            .filter((p) => !previouslyOkPlatforms.has(p) || forceSet.has(p));
          const platformsSkipped = selectedPlatforms
            .filter(isPlatformVisible)
            .filter((p) => previouslyOkPlatforms.has(p) && !forceSet.has(p));
          return (
          <>
            {/* Pre-publish status badge — green tick when everything is
                ready, red banner when something is broken. User sees
                this BEFORE clicking Publish so there are no surprises. */}
            {!publishing && !noSelection && (
              <div
                className={
                  "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md mr-1 " +
                  (allReady
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : blocked.length > 0
                      ? "bg-red-50 text-red-800 border border-red-200"
                      : "bg-amber-50 text-amber-800 border border-amber-200")
                }
                title={
                  blocked.length > 0
                    ? blocked.map((b) => b.reason).join(" · ")
                    : warns.length > 0
                      ? warns.map((w) => w.reason).join(" · ")
                      : "All selected platforms ready"
                }
              >
                {allReady ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {platformsWillRetry.length === 0
                      ? "Already posted to all"
                      : platformsWillRetry.length === selectedHealth.length
                        ? `All ${selectedHealth.length} ready`
                        : `Will post to ${platformsWillRetry.length} of ${selectedHealth.length}`}
                  </>
                ) : blocked.length > 0 ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {blocked.length} need{blocked.length === 1 ? "s" : ""} reconnect:{" "}
                    {blocked.map((b) => b.platform.toLowerCase()).join(", ")}
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {warns.length} expir{warns.length === 1 ? "es" : "e"} soon
                  </>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={onPublishClick}
              disabled={publishing || (blocked.length > 0 && !pubConfirm) || noSelection}
              className={
                "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed " +
                (pubConfirm
                  ? "bg-amber-600 text-white hover:bg-amber-700"
                  : "bg-[var(--color-accent)] text-[var(--color-text-on-dark)] hover:opacity-90")
              }
              title={
                blocked.length > 0
                  ? `Reconnect first: ${blocked.map((b) => b.platform.toLowerCase()).join(", ")}`
                  : noSelection
                    ? "Select at least one platform"
                    : undefined
              }
            >
              {pubConfirm ? <AlertTriangle className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
              {publishing
                ? "Publishing…"
                : pubConfirm
                  ? platformsWillRetry.length > 0
                    ? `Confirm: post to ${platformsWillRetry.join(" + ").toLowerCase()}`
                    : "Nothing to retry — all selected platforms already posted"
                  : platformsWillRetry.length === 0 && platformsSkipped.length > 0
                    ? "Already posted to all"
                    : "Publish now"}
            </button>
            {/* Show what's being skipped so the user knows we won't
                double-post to platforms that already succeeded. */}
            {platformsSkipped.length > 0 && !pubConfirm && (
              <span
                className="text-[10px] text-[var(--color-muted)] mr-1"
                title={`Skipping ${platformsSkipped.map((p) => p.toLowerCase()).join(", ")} — already posted last time. Untick to override.`}
              >
                (skipping {platformsSkipped.length} already posted)
              </span>
            )}
            {pubConfirm && !publishing && (
              <button
                type="button"
                onClick={() => setPubConfirm(false)}
                className="text-xs px-2 py-1.5 text-[var(--color-muted)] hover:text-[var(--color-text)]"
              >
                Cancel
              </button>
            )}
          </>
        );
        })()}

        {canDelete && (
          <>
            <button
              type="button"
              onClick={onDeleteClick}
              disabled={deleting}
              className={
                "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 ml-auto " +
                (delConfirm
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "text-red-700 hover:bg-red-50")
              }
            >
              {delConfirm ? <Check className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
              {deleting
                ? "Deleting…"
                : delConfirm
                  ? "Confirm delete"
                  : "Delete"}
            </button>
            {delConfirm && !deleting && (
              <button
                type="button"
                onClick={() => setDelConfirm(false)}
                className="text-xs px-2 py-1.5 text-[var(--color-muted)] hover:text-[var(--color-text)]"
              >
                Cancel
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
