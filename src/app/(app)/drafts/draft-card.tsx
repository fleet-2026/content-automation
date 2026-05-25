"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, Edit, Trash2, ExternalLink, Images, Check, AlertTriangle, Eye, Music2, CheckCircle2, RefreshCw } from "lucide-react";
import type { Platform, DraftStatus } from "@prisma/client";
import { publishDraftNow, deleteDraft, saveDraft, setDraftPlatforms } from "../compose/actions";
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

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-[var(--color-surface-2)] text-[var(--color-muted)]",
  APPROVED: "bg-blue-100 text-blue-800",
  SCHEDULED: "bg-amber-100 text-amber-800",
  PUBLISHING: "bg-purple-100 text-purple-800",
  PUBLISHED: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-800",
};

/** Account state snapshot per platform — passed in from the server so
 *  we can tell whether a "token expired" error from a prior publish
 *  is now stale (account reconnected since), and adjust the message. */
export type AccountStateMap = Record<
  string,
  { tokenExpiry: Date | null; updatedAt: Date }
>;

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
      // TikTok requires a manual finalize-in-app step for the inbox
      // upload flow (the only one we have scope for; full direct-post
      // needs TikTok-approved `video.publish` scope from their audit).
      // Make the next step painfully explicit so the user knows the
      // upload IS in their TikTok app, they just need to tap Post.
      return {
        friendly:
          "Uploaded to your TikTok inbox. Open TikTok app → tap your profile → drafts → tap the new video → tap Post.",
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
    startPub(async () => {
      try {
        // Capture the per-platform PublishResult[] returned by the action
        // so we can surface a clear "Published to X, Y" modal — instead
        // of relying only on the silent router.refresh() update.
        const results = await publishDraftNow(draft.id);
        setRecentPublish(Array.isArray(results) ? results : null);
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
        const oks = visiblePublish.filter((r) => r.ok);
        const fails = visiblePublish.filter((r) => !r.ok);
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
                  · {oks.length} succeeded · {fails.length} failed
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
                return (
                  <li key={r.platform} className="flex items-center gap-2 flex-wrap">
                    {r.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                    )}
                    <span className="font-semibold capitalize">{r.platform.toLowerCase()}</span>
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
                        // Show the message so the user knows the next
                        // action instead of just seeing "posted".
                        <span className="text-xs text-emerald-700">
                          — {cls.friendly}
                        </span>
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
                cls = "bg-amber-100 text-amber-800";
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
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    title={
                      previouslyOk
                        ? `${p.toLowerCase()} already posted last time — toggle off to skip on retry`
                        : `Click to ${selected ? "exclude" : "include"} ${p.toLowerCase()}`
                    }
                    className={
                      "text-[10px] px-2 py-0.5 rounded-full border transition uppercase tracking-wider " +
                      (selected
                        ? previouslyOk
                          ? "bg-emerald-100 border-emerald-300 text-emerald-900"
                          : "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text)]"
                        : "bg-transparent border-[var(--color-border)] text-[var(--color-muted)] line-through opacity-60")
                    }
                  >
                    {selected ? "✓ " : "✕ "}
                    {p.toLowerCase()}
                  </button>
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
            const results = await publishDraftNow(draft.id);
            setRecentPublish(Array.isArray(results) ? results : null);
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
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] font-medium"
        >
          <Edit className="w-3.5 h-3.5" />
          Edit
        </Link>

        {canPublish && (
          <>
            <button
              type="button"
              onClick={onPublishClick}
              disabled={publishing}
              className={
                "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed " +
                (pubConfirm
                  ? "bg-amber-600 text-white hover:bg-amber-700"
                  : "bg-[var(--color-accent)] text-[var(--color-text-on-dark)] hover:opacity-90")
              }
            >
              {pubConfirm ? <AlertTriangle className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
              {publishing
                ? "Publishing…"
                : pubConfirm
                  ? `Confirm: post to ${draft.platforms.join(" + ").toLowerCase()}`
                  : "Publish now"}
            </button>
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
        )}

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
