"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setupThirtyDayPlan, publishAllPlanReady, createCustomPlanDay } from "./actions";

/** Controls for the /30-days index:
 *  - "Set up / sync" creates any missing day-guides (idempotent), so the user
 *    can stand the whole plan up with one click on the live site.
 *  - "Publish ready" pushes any scripted plan day live on /guides (scoped to
 *    the plan only — never touches the main Daily post library). */
export function SetupBar({
  totalDays,
  setupCount,
  draftCount,
}: {
  totalDays: number;
  setupCount: number;
  draftCount: number;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const allSetUp = setupCount >= totalDays;

  const runSetup = () => {
    setMsg(null);
    start(async () => {
      const res = await setupThirtyDayPlan();
      if (res.ok) {
        setMsg(
          res.created > 0
            ? `✓ Set up ${res.created} day${res.created === 1 ? "" : "s"}`
            : "✓ All days already set up",
        );
        router.refresh();
      } else {
        setMsg(res.error === "unauthenticated" ? "Please sign in again" : "Setup failed");
      }
      setTimeout(() => setMsg(null), 4000);
    });
  };

  const runAddCustom = () => {
    setMsg(null);
    start(async () => {
      const res = await createCustomPlanDay();
      if (res.ok && res.slug) {
        // Jump straight into the editor for the new blank post.
        router.push(`/daily-post/${res.slug}`);
      } else {
        setMsg(res.error === "unauthenticated" ? "Please sign in again" : "Couldn't add post");
        setTimeout(() => setMsg(null), 4000);
      }
    });
  };

  const runPublish = () => {
    if (draftCount === 0) return;
    if (!confirm(`Publish all scripted plan days to the public /guides site?`)) return;
    setMsg(null);
    start(async () => {
      const res = await publishAllPlanReady();
      if (res.ok) {
        const skip = res.skipped > 0 ? ` (${res.skipped} skipped — no script yet)` : "";
        setMsg(`✓ Published ${res.published}${skip}`);
        router.refresh();
      } else {
        setMsg("Publish failed");
      }
      setTimeout(() => setMsg(null), 4000);
    });
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="text-sm">
        <strong>{setupCount}</strong>
        <span className="text-[var(--color-muted)]"> / {totalDays} days set up</span>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {msg && <span className="text-xs text-[var(--color-muted)]">{msg}</span>}
        <button
          type="button"
          onClick={runAddCustom}
          disabled={busy}
          className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--color-surface-2)] disabled:opacity-50"
          title="Create your own post on the 30-day page and edit it like the rest"
        >
          {busy ? "Working…" : "+ Add your own post"}
        </button>
        <button
          type="button"
          onClick={runSetup}
          disabled={busy}
          className="rounded-lg bg-[var(--color-text)] px-4 py-2 text-sm font-semibold text-[var(--color-text-on-dark)] hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Working…" : allSetUp ? "Sync plan" : "Set up the 30-day plan"}
        </button>
        {allSetUp && (
          <button
            type="button"
            onClick={runPublish}
            disabled={busy || draftCount === 0}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--color-surface-2)] disabled:opacity-50"
          >
            Publish ready ({draftCount})
          </button>
        )}
      </div>
    </div>
  );
}
