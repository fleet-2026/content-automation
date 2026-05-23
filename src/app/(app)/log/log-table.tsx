"use client";

import { useEffect, useMemo, useState } from "react";

export type LogItem = {
  id: string;
  type: "ig" | "web" | "diff";
  title: string;
  url: string;
  owner: string;
  postedAt: string;
  thumb: string;
  ingestedAt: string;
};

type Persisted = {
  keyword?: string;
  wired?: boolean;
};

const STORE_KEY = "fadia_inspo_log_v1";

function loadStore(): Record<string, Persisted> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveStore(map: Record<string, Persisted>) {
  localStorage.setItem(STORE_KEY, JSON.stringify(map));
}

function typeBadge(t: LogItem["type"]) {
  switch (t) {
    case "ig":
      return "bg-pink-500/10 text-pink-300 border-pink-500/30";
    case "web":
      return "bg-sky-500/10 text-sky-300 border-sky-500/30";
    case "diff":
      return "bg-amber-500/10 text-amber-300 border-amber-500/30";
  }
}

export default function LogTable({ items }: { items: LogItem[] }) {
  const [store, setStore] = useState<Record<string, Persisted>>({});
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | LogItem["type"]>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setStore(loadStore());
  }, []);

  const update = (id: string, patch: Persisted) => {
    setStore((prev) => {
      const next = { ...prev };
      const cur = { ...(prev[id] ?? {}), ...patch };
      // Trim empties to keep the store small
      if (!cur.keyword && !cur.wired) delete next[id];
      else next[id] = cur;
      saveStore(next);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (typeFilter !== "all" && it.type !== typeFilter) return false;
      if (!q) return true;
      return (
        it.title.toLowerCase().includes(q) ||
        it.owner.toLowerCase().includes(q) ||
        it.url.toLowerCase().includes(q) ||
        (store[it.id]?.keyword ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, query, typeFilter, store]);

  const copy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1200);
    } catch {
      /* ignore */
    }
  };

  const exportCsv = () => {
    const rows: string[][] = [["keyword", "wired", "url", "title", "owner", "type"]];
    for (const it of items) {
      const p = store[it.id] ?? {};
      rows.push([
        p.keyword ?? "",
        p.wired ? "true" : "false",
        it.url,
        it.title,
        it.owner,
        it.type,
      ]);
    }
    const csv = rows
      .map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "fadia_manychat_log.csv";
    a.click();
  };

  const wiredCount = items.filter((i) => store[i.id]?.wired).length;
  const kwCount = items.filter((i) => store[i.id]?.keyword).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by title, owner, URL, or keyword…"
          className="flex-1 min-w-[260px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        >
          <option value="all">all types</option>
          <option value="ig">instagram</option>
          <option value="web">web</option>
          <option value="diff">diff</option>
        </select>
        <button
          onClick={exportCsv}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm hover:bg-[var(--color-surface-hover)]"
        >
          Export CSV
        </button>
        <span className="text-xs text-[var(--color-muted)]">
          {filtered.length} shown · {kwCount} keyworded · {wiredCount} wired
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full text-sm">
          <thead className="bg-black/20 text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
            <tr>
              <th className="px-3 py-2 text-left">Thumb</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left w-[34%]">Title</th>
              <th className="px-3 py-2 text-left">URL</th>
              <th className="px-3 py-2 text-left">Copy</th>
              <th className="px-3 py-2 text-left">Keyword</th>
              <th className="px-3 py-2 text-left">Wired</th>
              <th className="px-3 py-2 text-left">Open</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => {
              const p = store[it.id] ?? {};
              const wired = !!p.wired;
              return (
                <tr
                  key={it.id}
                  className="border-t border-[var(--color-border)] align-top"
                >
                  <td className="px-3 py-2">
                    {it.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`http://localhost:8780${it.thumb}`}
                        alt=""
                        className="h-12 w-12 rounded object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded bg-black/20" />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${typeBadge(it.type)}`}
                    >
                      {it.type}
                    </span>
                    <div className="mt-1 text-[10px] text-[var(--color-muted)]">
                      @{it.owner}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium leading-snug">
                      {it.title || "—"}
                    </div>
                    {it.postedAt && (
                      <div className="text-[10px] text-[var(--color-muted)]">
                        {it.postedAt.slice(0, 10)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={it.url}
                      readOnly
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      className="w-full rounded bg-black/20 px-2 py-1 text-[11px] font-mono"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => copy(it.id, it.url)}
                      className="rounded border border-[var(--color-border)] px-2 py-1 text-[11px] hover:bg-[var(--color-surface-hover)]"
                    >
                      {copiedId === it.id ? "Copied!" : "Copy"}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={p.keyword ?? ""}
                      onChange={(e) =>
                        update(it.id, { keyword: e.target.value.toUpperCase() })
                      }
                      placeholder="CLAUDE10"
                      className="w-28 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] font-mono uppercase"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={wired}
                        onChange={(e) =>
                          update(it.id, { wired: e.target.checked })
                        }
                      />
                      <span
                        className={`text-[10px] ${wired ? "text-emerald-300" : "text-[var(--color-muted)]"}`}
                      >
                        {wired ? "✓" : "—"}
                      </span>
                    </label>
                  </td>
                  <td className="px-3 py-2">
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] underline"
                    >
                      open ↗
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
