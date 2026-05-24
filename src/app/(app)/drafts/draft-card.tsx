"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, Edit, Trash2, ExternalLink, Images, Check, AlertTriangle, Eye, Music2, CheckCircle2, RefreshCw } from "lucide-react";
import type { Platform, DraftStatus } from "@prisma/client";
import { publishDraftNow, deleteDraft, saveDraft } from "../compose/actions";
import { parseMediaUrls, parseMusicUrl } from "@/lib/media-urls";
import { stripHookPrefix } from "@/lib/captions";
import { MediaPreviewModal } from "@/components/media-preview-modal";

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

export function DraftCard({ draft }: { draft: DraftCardData }) {
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
  const successfulPosts = (draft.publishResults ?? []).filter((r) => r.ok);

  // Per-platform error classifier. Maps Meta/Instagram-specific token-
  // expiry messages to a friendlier "Reconnect Instagram" hint instead of
  // showing the raw "Unsupported state or unable to authenticate data"
  // string the user saw in the screenshot.
  function classifyError(platform: string, raw: string | undefined): {
    friendly: string;
    needsReconnect: boolean;
  } {
    if (!raw) return { friendly: "", needsReconnect: false };
    const lower = raw.toLowerCase();
    if (
      lower.includes("unsupported state") ||
      lower.includes("authenticate data") ||
      lower.includes("token") ||
      lower.includes("expired") ||
      lower.includes("invalid_token") ||
      lower.includes("oauthexception")
    ) {
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
      return {
        friendly: `${platform} is missing the video-upload permission — reconnect to grant it.`,
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
      return {
        friendly: "Delivered to TikTok inbox — finalize inside the app.",
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
        const oks = recentPublish.filter((r) => r.ok);
        const fails = recentPublish.filter((r) => !r.ok);
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
              {recentPublish.map((r) => {
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
            <span
              className={
                "text-[10px] px-2 py-0.5 rounded uppercase tracking-wider " +
                (STATUS_COLORS[draft.status] ?? "")
              }
            >
              {draft.status.toLowerCase()}
            </span>
            {draft.platforms.map((p) => (
              <span key={p}>{p.toLowerCase()}</span>
            ))}
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
          {draft.publishResults && draft.publishResults.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs">
              {draft.publishResults.map((r) => {
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
