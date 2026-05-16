"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink, LinkIcon, AlertTriangle } from "lucide-react";
import type { MyLinksResult, MyLink } from "@/lib/my-links";

export function MyLinksCard({ data }: { data: MyLinksResult }) {
  if (!data.hubUrl) return null;

  return (
    <section className="border rounded-xl bg-[var(--color-surface)] overflow-hidden">
      <header className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold truncate" title={data.hubTitle}>
            {data.hubTitle || "Linked hub"}
          </h2>
          <p className="text-[11px] text-[var(--color-muted)] mt-0.5 truncate max-w-[400px]">
            {data.hubUrl.replace(/^https?:\/\//, "")}
          </p>
        </div>
        <a
          href={data.hubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] rounded-md px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5"
        >
          <ExternalLink className="w-3 h-3" /> Open hub
        </a>
      </header>

      {data.error ? (
        <div className="px-5 py-4 text-sm flex items-start gap-2 text-[var(--color-muted)]">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-700 shrink-0" />
          <div>
            <p>Couldn&apos;t fetch links from the hub page.</p>
            <p className="text-[11px] mt-0.5 opacity-70">{data.error}</p>
          </div>
        </div>
      ) : data.links.length === 0 ? (
        <div className="px-5 py-4 text-sm text-[var(--color-muted)] flex items-center justify-between gap-3">
          <span>
            This hub renders content client-side, so individual links can&apos;t
            be extracted. Use <strong>Open hub</strong> to view its contents.
          </span>
          <a
            href={data.hubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[var(--color-accent)] text-[var(--color-text-on-dark)] hover:opacity-90 rounded-md px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 shrink-0"
          >
            <ExternalLink className="w-3 h-3" /> Open
          </a>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {data.links.map((link) => (
            <LinkRow key={link.href} link={link} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LinkRow({ link }: { link: MyLink }) {
  const [copied, setCopied] = useState(false);

  function onCopy() {
    navigator.clipboard.writeText(link.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  // Display label = host + path, shortened
  const display = (() => {
    try {
      const u = new URL(link.href);
      const tail = (u.pathname + u.search).replace(/\/$/, "");
      return u.host + tail;
    } catch {
      return link.href;
    }
  })();

  return (
    <li className="px-5 py-2.5 flex items-center gap-3">
      <LinkIcon className="w-3.5 h-3.5 text-[var(--color-muted)] shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm truncate" title={link.text}>
          {link.text}
        </div>
        <div className="text-[11px] text-[var(--color-muted)] truncate" title={link.href}>
          {display}
        </div>
      </div>
      <button
        onClick={onCopy}
        className="bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] rounded-md p-1.5"
        title={copied ? "Copied!" : "Copy URL"}
        aria-label="Copy URL"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-green-700" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] rounded-md p-1.5"
        title="Open in new tab"
        aria-label="Open link in new tab"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </li>
  );
}
