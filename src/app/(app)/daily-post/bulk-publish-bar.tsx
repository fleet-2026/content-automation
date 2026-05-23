"use client";

/**
 * Bulk publish/unpublish bar for /daily-post index. Keeps the index page
 * itself a server component (it's the one that queries the DB) and only
 * pulls in client-side React for the actual button transition.
 */

import { useTransition, useState } from "react";
import { publishAllReady, unpublishAll } from "./actions";

export default function BulkPublishBar({
  totalDrafts,
  totalPublished,
}: {
  totalDrafts: number;
  totalPublished: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const runPublishAll = () => {
    if (totalDrafts === 0) return;
    const ok = confirm(
      `Publish all ${totalDrafts} draft guides to the public /guides site?`,
    );
    if (!ok) return;
    setMessage(null);
    startTransition(async () => {
      const res = await publishAllReady();
      if (res.ok) {
        const skippedNote = res.skipped > 0 ? ` (${res.skipped} skipped — no script yet)` : "";
        setMessage(`✓ Published ${res.published} guide${res.published === 1 ? "" : "s"}${skippedNote}`);
      } else {
        setMessage("Publish failed");
      }
      setTimeout(() => setMessage(null), 4000);
    });
  };

  const runUnpublishAll = () => {
    if (totalPublished === 0) return;
    const ok = confirm(
      `Unpublish all ${totalPublished} live guides? They'll be hidden from /guides.`,
    );
    if (!ok) return;
    setMessage(null);
    startTransition(async () => {
      const res = await unpublishAll();
      if (res.ok) {
        setMessage(`✓ Unpublished ${res.unpublished} guide${res.unpublished === 1 ? "" : "s"}`);
      } else {
        setMessage("Unpublish failed");
      }
      setTimeout(() => setMessage(null), 4000);
    });
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="text-sm">
        <strong>{totalPublished}</strong> live ·{" "}
        <strong>{totalDrafts}</strong> draft
      </div>
      <div className="flex-1" />
      {message && (
        <span className="text-xs text-emerald-300">{message}</span>
      )}
      <button
        type="button"
        onClick={runPublishAll}
        disabled={isPending || totalDrafts === 0}
        className="rounded bg-[var(--color-text)] text-[var(--color-text-on-dark)] px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
      >
        {isPending ? "Working…" : `Publish all drafts (${totalDrafts})`}
      </button>
      <button
        type="button"
        onClick={runUnpublishAll}
        disabled={isPending || totalPublished === 0}
        className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)] disabled:opacity-40"
      >
        Unpublish all
      </button>
      <a
        href="/guides"
        target="_blank"
        rel="noreferrer"
        className="rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-3 py-1.5 text-xs hover:bg-emerald-500/20"
      >
        View /guides ↗
      </a>
    </div>
  );
}
