"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Images,
  Send,
  Edit,
  Trash2,
  AlertTriangle,
  Check,
} from "lucide-react";
import type { Platform } from "@prisma/client";
import { isImageUrl, isVideoUrl } from "@/lib/media-urls";

/**
 * Full-screen media preview for drafts / scheduled posts.
 *
 * Renders the primary tile at the largest size that fits the viewport,
 * with carousel navigation (arrow buttons, dot indicator, ← → keyboard,
 * loop-around). Videos play with native HTML5 controls and auto-pause
 * when navigating away from their slide. The assembled post text (hook,
 * caption, hashtags, target platforms) appears in a sidebar on desktop
 * and below the media on mobile so the user can see what the post
 * actually looks like as a whole.
 *
 * Self-contained — no portal needed; rendered conditionally at the root
 * of the host card.
 */
export function MediaPreviewModal({
  draftId,
  mediaUrls,
  hook,
  caption,
  hashtags,
  platforms,
  status,
  canPublish = false,
  canDelete = false,
  canEdit = false,
  onPublish,
  onDelete,
  onClose,
}: {
  /** Backing draft id — used to build Edit link when `canEdit` is true. */
  draftId?: string;
  mediaUrls: string[];
  hook: string | null;
  caption: string;
  hashtags: string[];
  platforms: Platform[];
  status?: string;
  /** Show Publish button — caller provides onPublish. */
  canPublish?: boolean;
  /** Show Delete button — caller provides onDelete. */
  canDelete?: boolean;
  /** Show Edit link to /compose?draft=<draftId>. */
  canEdit?: boolean;
  /** Returns a promise so the modal can show a Publishing… state and
   *  close on success. Caller decides what to do with errors. */
  onPublish?: () => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const total = mediaUrls.length;
  // Two-stage confirms inside the modal so the user doesn't need a
  // separate browser dialog (which Chrome auto-blocks after a few).
  const [pubConfirm, setPubConfirm] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);
  const [actionBusy, setActionBusy] = useState<"publish" | "delete" | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  async function runPublish() {
    if (!onPublish) return;
    if (platforms.length === 0) {
      setActionErr("Pick at least one platform first (Edit).");
      return;
    }
    if (!pubConfirm) {
      setPubConfirm(true);
      setDelConfirm(false);
      return;
    }
    setPubConfirm(false);
    setActionBusy("publish");
    setActionErr(null);
    try {
      await onPublish();
      onClose(); // success — close modal so the user sees the refreshed list
    } catch (e) {
      setActionErr(String((e as Error)?.message ?? e));
    } finally {
      setActionBusy(null);
    }
  }

  async function runDelete() {
    if (!onDelete) return;
    if (!delConfirm) {
      setDelConfirm(true);
      setPubConfirm(false);
      return;
    }
    setDelConfirm(false);
    setActionBusy("delete");
    setActionErr(null);
    try {
      await onDelete();
      onClose();
    } catch (e) {
      setActionErr(String((e as Error)?.message ?? e));
    } finally {
      setActionBusy(null);
    }
  }

  // Clamp index if mediaUrls shrinks underneath us.
  useEffect(() => {
    if (idx >= total) setIdx(Math.max(0, total - 1));
  }, [idx, total]);

  const prev = useCallback(() => {
    setIdx((i) => (i === 0 ? total - 1 : i - 1));
  }, [total]);
  const next = useCallback(() => {
    setIdx((i) => (i + 1) % total);
  }, [total]);

  // Keyboard: Esc closes, ← / → navigate the carousel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && total > 1) prev();
      else if (e.key === "ArrowRight" && total > 1) next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next, total]);

  const current = mediaUrls[idx];
  const hasText = (hook?.trim() || caption.trim() || hashtags.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-surface)] border rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-base font-semibold truncate">Post preview</h2>
            {total > 1 && (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)]">
                <Images className="w-3.5 h-3.5" />
                {idx + 1} / {total}
              </span>
            )}
            {status && (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-muted)]">
                {status.toLowerCase()}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[var(--color-surface-2)]"
            aria-label="Close"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: media on left/top, text on right/bottom */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-0 flex-1 min-h-0">
          {/* Media stage */}
          <div className="relative bg-black flex items-center justify-center min-h-[300px] md:min-h-0">
            {total === 0 ? (
              <div className="text-sm text-[var(--color-muted)] p-8 text-center">
                No media attached.
              </div>
            ) : isVideoUrl(current) ? (
              // `key` forces React to remount the video element when the
              // user navigates between carousel slides — otherwise the
              // browser keeps playing the previous slide's audio.
              <video
                key={current}
                src={current}
                controls
                autoPlay
                playsInline
                className="max-w-full max-h-[70vh] object-contain"
              />
            ) : isImageUrl(current) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current}
                alt=""
                loading="eager"
                decoding="async"
                className="max-w-full max-h-[70vh] object-contain"
              />
            ) : (
              <div className="text-sm text-[var(--color-muted)] p-8 text-center">
                Unknown media type. URL: <code>{current}</code>
              </div>
            )}

            {/* Carousel navigation — only when there's more than one slide. */}
            {total > 1 && (
              <>
                <button
                  type="button"
                  onClick={prev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white"
                  aria-label="Previous"
                  title="Previous (←)"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={next}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white"
                  aria-label="Next"
                  title="Next (→)"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                {/* Dot indicator */}
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                  {mediaUrls.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setIdx(i)}
                      className={
                        "w-2 h-2 rounded-full transition " +
                        (i === idx ? "bg-white" : "bg-white/40 hover:bg-white/70")
                      }
                      aria-label={`Go to slide ${i + 1}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Text panel */}
          <aside className="overflow-y-auto p-5 border-t md:border-t-0 md:border-l border-[var(--color-border)]">
            {platforms.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {platforms.map((p) => (
                  <span
                    key={p}
                    className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-muted)]"
                  >
                    {p.toLowerCase()}
                  </span>
                ))}
              </div>
            )}

            {!hasText ? (
              <p className="text-sm text-[var(--color-muted)] italic">
                No caption.
              </p>
            ) : (
              <>
                {hook?.trim() && (
                  <p className="font-semibold leading-snug mb-3">{hook}</p>
                )}
                {caption.trim() && (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed mb-3">
                    {caption}
                  </p>
                )}
                {hashtags.length > 0 && (
                  <p className="text-sm text-[var(--color-accent)] leading-relaxed break-words">
                    {hashtags.map((h) => `#${h}`).join(" ")}
                  </p>
                )}
              </>
            )}

            {actionErr && (
              <div className="mt-3 bg-red-100 border border-red-300 text-red-900 text-xs rounded-md p-2.5">
                {actionErr}
              </div>
            )}

            {/* Thumbnail strip — quick visual map of the carousel + tap-to-jump */}
            {total > 1 && (
              <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
                <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] mb-2">
                  All slides
                </p>
                <div className="grid grid-cols-4 gap-1.5">
                  {mediaUrls.map((u, i) => (
                    <button
                      key={`${u}-${i}`}
                      type="button"
                      onClick={() => setIdx(i)}
                      className={
                        "aspect-square rounded overflow-hidden border-2 transition " +
                        (i === idx
                          ? "border-[var(--color-accent)]"
                          : "border-transparent hover:border-[var(--color-muted)]")
                      }
                    >
                      {isImageUrl(u) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={u}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-[9px] uppercase tracking-wider text-[var(--color-muted)] bg-[var(--color-surface-2)]">
                          video
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>

        {/* Action footer — Edit / Publish / Delete. Hidden entirely when no
            action is available (e.g. preview of an already-published post
            or a demo placeholder). */}
        {(canEdit || canPublish || canDelete) && (
          <div className="flex items-center gap-2 px-5 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]">
            {canEdit && draftId && (
              <Link
                href={`/compose?draft=${draftId}`}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--color-surface)] hover:bg-[var(--color-border)] font-medium"
              >
                <Edit className="w-3.5 h-3.5" />
                Edit
              </Link>
            )}

            {canPublish && onPublish && (
              <>
                <button
                  type="button"
                  onClick={runPublish}
                  disabled={actionBusy === "publish"}
                  className={
                    "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 " +
                    (pubConfirm
                      ? "bg-amber-600 text-white hover:bg-amber-700"
                      : "bg-[var(--color-accent)] text-[var(--color-text-on-dark)] hover:opacity-90")
                  }
                >
                  {pubConfirm ? (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  {actionBusy === "publish"
                    ? "Publishing…"
                    : pubConfirm
                      ? `Confirm: post to ${platforms.map((p) => p.toLowerCase()).join(" + ")}`
                      : "Publish now"}
                </button>
                {pubConfirm && actionBusy !== "publish" && (
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

            {canDelete && onDelete && (
              <>
                <button
                  type="button"
                  onClick={runDelete}
                  disabled={actionBusy === "delete"}
                  className={
                    "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 ml-auto " +
                    (delConfirm
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "text-red-700 hover:bg-red-50")
                  }
                >
                  {delConfirm ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  {actionBusy === "delete"
                    ? "Deleting…"
                    : delConfirm
                      ? "Confirm delete"
                      : "Delete"}
                </button>
                {delConfirm && actionBusy !== "delete" && (
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
        )}
      </div>
    </div>
  );
}
