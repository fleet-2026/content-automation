"use client";

import { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Images } from "lucide-react";
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
  mediaUrls,
  hook,
  caption,
  hashtags,
  platforms,
  status,
  onClose,
}: {
  mediaUrls: string[];
  hook: string | null;
  caption: string;
  hashtags: string[];
  platforms: Platform[];
  status?: string;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const total = mediaUrls.length;

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
      </div>
    </div>
  );
}
