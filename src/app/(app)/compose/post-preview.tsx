"use client";

import type { Platform } from "@prisma/client";
import { Eye } from "lucide-react";

/**
 * Visual "see the post all together" view. Shows what the assembled draft
 * will look like once published — hook + media + caption + hashtags +
 * target platforms. Updates live as the user types in the composer.
 */

// Match the same loose check used elsewhere so R2 signed URLs with query
// strings still render as images instead of falling through to "video".
const IMG_RE = /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i;
const VIDEO_RE = /\.(mp4|mov|m4v|webm)(\?|$)/i;

export function PostPreview({
  hook,
  caption,
  hashtags,
  mediaUrl,
  platforms,
}: {
  hook: string | null;
  caption: string;
  hashtags: string[];
  mediaUrl: string | null;
  platforms: Platform[];
}) {
  const isImage = mediaUrl ? IMG_RE.test(mediaUrl) : false;
  const isVideo = mediaUrl ? VIDEO_RE.test(mediaUrl) : false;
  const hasAnything =
    hook?.trim() || caption.trim() || hashtags.length > 0 || mediaUrl;

  return (
    <div className="border rounded-xl bg-[var(--color-surface)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
        <Eye className="w-4 h-4 text-[var(--color-muted)]" />
        <h3 className="text-sm font-semibold">Post preview</h3>
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
          {/* Media tile */}
          <div className="aspect-square bg-[var(--color-surface-2)] rounded-lg overflow-hidden grid place-items-center text-xs text-[var(--color-muted)]">
            {mediaUrl && isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
            ) : mediaUrl && isVideo ? (
              <video
                src={mediaUrl}
                muted
                playsInline
                className="w-full h-full object-cover"
                preload="metadata"
              />
            ) : mediaUrl ? (
              <span>media attached</span>
            ) : (
              <span>no media</span>
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
