"use client";

/**
 * Reusable TikTok-caption QR bridge.
 *
 * TikTok publishes land in the app inbox without a caption, so the user
 * has to paste it on their phone. This renders a QR code that opens the
 * mobile caption page (/api/tt-caption) where they tap "Copy Caption".
 *
 * Works for both pipelines:
 *   - <TikTokCaptionQr draftId={id} />  — Draft pipeline (compose/drafts/…)
 *   - <TikTokCaptionQr slug={slug} />   — DailyGuide pipeline (daily-post)
 *
 * `autoOpen` expands + fetches immediately (use right after a publish).
 * Without it, it renders a collapsed "TikTok caption (QR)" button that
 * fetches lazily on first expand (use on list/card surfaces).
 */

import { useEffect, useRef, useState } from "react";
import { getDraftCaptionUrl } from "@/app/(app)/compose/actions";
import { getTikTokCaptionUrl } from "@/app/(app)/daily-post/actions";

type Props = {
  draftId?: string;
  slug?: string;
  /** Full caption text for the desktop "Copy caption" fallback (optional). */
  caption?: string;
  /** Expand + fetch immediately — used right after publishing. */
  autoOpen?: boolean;
  className?: string;
};

export function TikTokCaptionQr({
  draftId,
  slug,
  caption,
  autoOpen = false,
  className,
}: Props) {
  const [open, setOpen] = useState(autoOpen);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const fetchedRef = useRef(false);

  async function load() {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const u = draftId
        ? await getDraftCaptionUrl(draftId)
        : await getTikTokCaptionUrl(slug!);
      setUrl(u);
    } catch (e) {
      console.error("[TikTokCaptionQr] failed to build caption URL:", e);
      setFailed(true);
      fetchedRef.current = false; // allow a retry on next expand
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (autoOpen) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  if (!draftId && !slug) return null;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void load();
  }

  async function copyCaption() {
    if (!caption) return;
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — user can still scan the QR */
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1.5 rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-700 px-2.5 py-1 text-xs font-semibold hover:bg-cyan-500/20"
      >
        {open ? "Hide TikTok caption" : "TikTok caption (QR)"}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          {loading && (
            <div className="text-xs text-[var(--color-muted)]">Building QR…</div>
          )}
          {failed && (
            <div className="text-xs text-red-500">
              Couldn&apos;t build the QR link.{" "}
              {caption ? "Use Copy caption below." : "Try again in a moment."}
            </div>
          )}
          {url && (
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-lg bg-white p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(url)}`}
                  alt="Scan to copy the TikTok caption on your phone"
                  width={120}
                  height={120}
                />
              </div>
              <div className="space-y-0.5 text-[11px] text-[var(--color-muted)]">
                <p>
                  <strong className="text-[var(--color-text)]">On your phone:</strong>
                </p>
                <p>1. Scan this QR code</p>
                <p>2. Tap &quot;Copy Caption&quot;</p>
                <p>3. Open TikTok → paste</p>
              </div>
            </div>
          )}
          {caption && (
            <button
              type="button"
              onClick={copyCaption}
              className="rounded bg-[var(--color-text)] text-[var(--color-text-on-dark)] px-2.5 py-1 text-xs font-semibold hover:opacity-90"
            >
              {copied ? "✓ Copied" : "Copy caption (desktop)"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
