import { fetchAllHubs } from "@/lib/my-links";
import { safe } from "@/lib/safe";
import { MyLinksCard } from "./my-links";
import { Loader2 } from "lucide-react";

/**
 * Async server component that fetches every configured hub in parallel.
 * Mounted inside a <Suspense> boundary on the dashboard so the rest of
 * the page streams immediately — the 16s worst-case (2 hubs × 8s timeout)
 * never blocks first paint.
 */
export async function MyLinksSection() {
  const hubs = await safe(() => fetchAllHubs(), [], "fetchAllHubs");
  if (hubs.length === 0) return null;
  return (
    <section className="mb-10 space-y-4">
      {hubs.map((h) => (
        <MyLinksCard key={h.hubUrl} data={h} />
      ))}
    </section>
  );
}

/** Skeleton rendered while MyLinksSection's fetch is in flight. */
export function MyLinksSectionSkeleton() {
  return (
    <section className="mb-10 space-y-4">
      <div className="border rounded-xl bg-[var(--color-surface)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-muted)]" />
          <span className="text-xs text-[var(--color-muted)]">Loading your links…</span>
        </div>
        <div className="p-5 space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-9 bg-[var(--color-surface-2)] rounded-md animate-pulse"
              style={{ animationDelay: `${i * 100}ms` }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
