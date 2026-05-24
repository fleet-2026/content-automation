"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * One card per guide on the all-scripts page. Big readable script
 * with a copy button. Click → text on clipboard → ready to read off
 * the phone screen / teleprompter app.
 */
export function ScriptCard({
  index,
  slug,
  title,
  hook,
  script,
  isPublished,
}: {
  index: number | null;
  slug: string;
  title: string;
  hook: string;
  script: string;
  isPublished: boolean;
}) {
  const [copied, setCopied] = useState<null | "script" | "hook" | "both">(null);

  const copy = async (kind: "script" | "hook" | "both") => {
    let text = "";
    if (kind === "script") text = script;
    else if (kind === "hook") text = hook;
    else text = `${hook}\n\n${script}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      /* ignore */
    }
  };

  const wordCount = script.trim().split(/\s+/).filter(Boolean).length;
  // Rough estimate at 150 wpm conversational pace
  const estReadingSec = Math.round((wordCount / 150) * 60);

  return (
    <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Card header */}
      <div className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/40 flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-bold">
            {index != null ? `#${index}` : "—"}
          </span>
          <Link
            href={`/daily-post/${slug}`}
            className="font-display text-lg leading-tight hover:underline"
          >
            {title}
          </Link>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-muted)]">
          <span>{wordCount} words · ~{estReadingSec}s</span>
          {isPublished && (
            <span className="rounded border px-1.5 py-0.5 bg-emerald-500/10 text-emerald-300 border-emerald-500/30 font-semibold uppercase tracking-wider">
              live
            </span>
          )}
        </div>
      </div>

      {/* Hook callout */}
      {hook.trim() && (
        <div className="px-5 pt-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-blush-deep)] font-bold mb-1.5">
            Hook
          </div>
          <p className="font-italic-accent text-base text-[var(--color-text)] leading-snug">
            “{hook}”
          </p>
        </div>
      )}

      {/* Full script — big & readable */}
      <div className="px-5 py-4">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-bold mb-1.5">
          Script
        </div>
        <pre className="font-body whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--color-text)] font-normal">
          {script}
        </pre>
      </div>

      {/* Action bar */}
      <div className="px-5 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => copy("script")}
          className="rounded bg-[var(--color-text)] text-[var(--color-text-on-dark)] px-3 py-1.5 text-xs font-semibold hover:opacity-90"
        >
          {copied === "script" ? "✓ Copied" : "Copy script"}
        </button>
        {hook.trim() && (
          <button
            type="button"
            onClick={() => copy("hook")}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)]"
          >
            {copied === "hook" ? "✓ Copied" : "Copy hook only"}
          </button>
        )}
        {hook.trim() && (
          <button
            type="button"
            onClick={() => copy("both")}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)]"
          >
            {copied === "both" ? "✓ Copied" : "Hook + script"}
          </button>
        )}
        <div className="flex-1" />
        <Link
          href={`/daily-post/${slug}`}
          className="text-xs underline text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          Open editor →
        </Link>
      </div>
    </article>
  );
}
