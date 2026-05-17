"use client";

import type { Platform } from "@prisma/client";
import { Eye, Images } from "lucide-react";
import { isImageUrl, isVideoUrl } from "@/lib/media-urls";

/**
 * Visual "see the post all together" view. Shows what the assembled draft
 * will look like once published — hook + media + caption + hashtags +
 * target platforms. Updates live as the user types in the composer.
 *
 * When the draft has multiple images attached (Instagram carousel), the
 * preview shows the primary tile large with the remaining tiles as a
 * thumbnail strip below it, plus a "1 / 3" counter so the multi-image
 * intent is unambiguous.
 */

export function PostPreview({
  hook,
  caption,
  hashtags,
  mediaUrls,
  platforms,
}: {
  hook: string | null;
  caption: string;
  hashtags: string[];
  mediaUrls: string[];
  platforms: Platform[];
}) {
  const primary = mediaUrls[0] ?? null;
  const hasAnything =
    hook?.trim() ||
    caption.trim() ||
    hashtags.length > 0 ||
    mediaUrls.length > 0;

  return (
    <div className="border rounded-xl bg-[var(--color-surface)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
        <Eye className="w-4 h-4 text-[var(--color-muted)]" />
        <h3 className="text-sm font-semibold">Post preview</h3>
        {mediaUrls.length > 1 && (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)]">
            <Images className="w-3.5 h-3.5" />
            {mediaUrls.length} images · carousel
          </span>
        )}
        {platforms.length > 0 && (
          <span className="ml-auto text-xs text-[var(--color-muted)]">
            {platforms.map((p) => p.toLowerCase()).join(" · ")}
          </span>
        )}
      </div>

      {!hasAnything ? (
        <div className="p-8 text-center text-sm text-[var(--color-muted)]">
          Your assembled post will appear here as you write.
        </div>
      ) : (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4">
          {/* Media tile + carousel thumbnails */}
          <div className="space-y-2">
            <div className="aspect-square bg-[var(--color-surface-2)] rounded-lg overflow-hidden grid place-items-center text-xs text-[var(--color-muted)] relative">
              {primary && isImageUrl(primary) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={primary}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              ) : primary && isVideoUrl(primary) ? (
                <video
                  src={primary}
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                  preload="metadata"
                />
              ) : primary ? (
                <span>media attached</span>
              ) : (
                <span>no media</span>
              )}
              {mediaUrls.length > 1 && (
                <span className="absolute top-1.5 right-1.5 text-[10px] bg-black/70 text-white rounded px-1.5 py-0.5 font-medium">
                  1 / {mediaUrls.length}
                </span>
              )}
            </div>
            {/* Remaining carousel thumbnails */}
            {mediaUrls.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto">
                {mediaUrls.slice(1).map((u, i) => (
                  <div
                    key={`${u}-${i}`}
                    className="w-12 h-12 shrink-0 rounded-md overflow-hidden bg-[var(--color-surface-2)]"
                  >
                    {isImageUrl(u) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-[9px] uppercase tracking-wider text-[var(--color-muted)]">
                        video
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Text content */}
          <div className="min-w-0 space-y-2">
            {hook?.trim() && (
              <p className="font-semibold leading-snug text-[var(--color-text)]">
                {hook}
              </p>
            )}
            {caption.trim() && (
              <p className="text-sm whitespace-pre-wrap leading-relaxed text-[var(--color-text)]">
                {caption}
              </p>
            )}
            {hashtags.length > 0 && (
              <p className="text-sm text-[var(--color-accent)] leading-relaxed break-words">
                {hashtags.map((h) => `#${h}`).join(" ")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
