"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, Edit, Trash2, ExternalLink, Images, Check, AlertTriangle, Eye } from "lucide-react";
import type { Platform, DraftStatus } from "@prisma/client";
import { publishDraftNow, deleteDraft } from "../compose/actions";
import { parseMediaUrls } from "@/lib/media-urls";
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

  // mediaUrl may contain a newline-packed list of URLs when the draft is a
  // carousel. Pull out the primary for the thumbnail and keep the count so
  // we can badge multi-image drafts.
  const allMediaUrls = parseMediaUrls(draft.mediaUrl);
  const primary = allMediaUrls[0] ?? null;
  const isImage = primary ? IMG_RE.test(primary) : false;
  const isVideo = primary ? VIDEO_RE.test(primary) : false;
  const isCarousel = allMediaUrls.length > 1;

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
        await publishDraftNow(draft.id);
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
    <article className="border rounded-xl bg-[var(--color-surface)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {draft.selectedHook && (
            <p className="font-medium leading-snug">&ldquo;{draft.selectedHook}&rdquo;</p>
          )}
          <p className="text-sm text-[var(--color-muted)] mt-1 line-clamp-2">
            {draft.caption}
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
          </div>

          {/* Per-platform publish results, when present. Surfaces "delivered
              to inbox" for TikTok and any platform-specific errors. */}
          {draft.publishResults && draft.publishResults.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs">
              {draft.publishResults.map((r) => (
                <li key={r.platform} className="flex items-center gap-2">
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
                  ) : r.error ? (
                    <span className="text-[var(--color-muted)]">— {r.error}</span>
                  ) : null}
                </li>
              ))}
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
          hook={draft.selectedHook}
          caption={draft.caption}
          hashtags={draft.hashtags}
          platforms={draft.platforms}
          status={draft.status}
          canEdit={true}
          canPublish={canPublish}
          canDelete={canDelete}
          onPublish={async () => {
            await publishDraftNow(draft.id);
            router.refresh();
          }}
          onDelete={async () => {
            await deleteDraft(draft.id);
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
