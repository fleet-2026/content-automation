import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { promises as fs } from "fs";
import path from "path";
import { tryGetUser } from "@/lib/auth-helpers";
import LogTable, { type LogItem } from "./log-table";

export const metadata: Metadata = {
  title: "Inspo Log — Descon Fleet",
  description:
    "Every scraped post + diffed guide in one table — pick keywords, copy URLs, build ManyChat triggers.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Where the Fadia Python dashboard saves its scraped items.
// Override with FADIA_INSPO_DIR env var if your path is different.
const FADIA_INSPO_DIR =
  process.env.FADIA_INSPO_DIR ?? "C:/Users/serka/namaha/data/inspo";

async function loadInspo(): Promise<LogItem[]> {
  const items: LogItem[] = [];
  let entries: string[] = [];
  try {
    entries = await fs.readdir(FADIA_INSPO_DIR);
  } catch {
    return items;
  }
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(FADIA_INSPO_DIR, name), "utf8");
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) continue;
      const type = (obj.type as string) || "ig";
      const title: string =
        (obj.title as string) ||
        (obj.caption as string) ||
        (obj.transcript?.hook as string) ||
        "";
      const shortcode =
        (obj.shortcode as string) ||
        ((obj.url as string) || "").replace(/\/$/, "").split("/").pop() ||
        name.replace(/\.json$/, "");
      items.push({
        id: shortcode,
        type: type as LogItem["type"],
        title: String(title).slice(0, 300),
        url: (obj.url as string) || "",
        owner: (obj.owner as string) || "",
        postedAt: (obj.posted_at as string) || "",
        thumb: (obj.local_thumb as string) || "",
        ingestedAt: (obj.ingested_at as string) || "",
      });
    } catch {
      // skip bad files
    }
  }
  // newest first
  items.sort((a, b) => {
    const x = a.ingestedAt || a.postedAt || "";
    const y = b.ingestedAt || b.postedAt || "";
    return y.localeCompare(x);
  });
  return items;
}

export default async function LogPage() {
  const userId = await tryGetUser();
  if (!userId) redirect("/login");

  const items = await loadInspo();
  const counts = {
    total: items.length,
    ig: items.filter((i) => i.type === "ig").length,
    web: items.filter((i) => i.type === "web").length,
    diff: items.filter((i) => i.type === "diff").length,
  };

  return (
    <div className="px-8 py-10 max-w-7xl">
      <div className="mb-6">
        <h1 className="font-display text-3xl sm:text-4xl">
          Inspo <span className="font-italic-accent text-blush">log.</span>
        </h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          {counts.total} items · {counts.ig} IG · {counts.web} web · {counts.diff} from diff ·
          source: <code className="text-xs">{FADIA_INSPO_DIR}</code>
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200 leading-relaxed">
        <strong>How to use this.</strong> Each row has a URL ready to copy and a
        keyword field for your ManyChat trigger. Keywords auto-save to your
        browser. When you&apos;re done mapping, click <em>Export CSV</em> to
        get a <code>keyword,url,title</code> file you can import into ManyChat.
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-center text-sm text-[var(--color-muted)]">
          No items in <code>{FADIA_INSPO_DIR}</code>. Run the Fadia dashboard
          (<code>scripts/content_dashboard.py</code>) and scrape some posts
          first — they&apos;ll show up here automatically.
        </div>
      ) : (
        <LogTable items={items} />
      )}
    </div>
  );
}
