import { tryGetUser } from "@/lib/auth-helpers";
import { safe } from "@/lib/safe";
import { getRankedHooks } from "@/lib/analytics";
import { formatNumber } from "@/lib/utils";
import { DEMO, demoHooks } from "@/lib/demo-data";

export const dynamic = "force-dynamic";

export default async function HooksPage() {
  const userId = (await tryGetUser()) ?? undefined;

  const hooks = DEMO
    ? demoHooks
    : userId
      ? await safe(() => getRankedHooks(userId, 50), [])
      : [];

  return (
    <div className="px-8 py-10 max-w-5xl">
      <h1 className="font-display text-3xl sm:text-4xl">
        Your hooks, <span className="font-italic-accent text-blush">ranked.</span>
      </h1>
      <p className="text-[var(--color-muted)] mt-1 mb-6">
        Sorted by average engagement rate across posts that opened with them.
      </p>

      {hooks.length === 0 ? (
        <div className="border rounded-xl bg-[var(--color-surface)] p-10 text-center text-sm text-[var(--color-muted)]">
          No hooks extracted yet. Sync a few posts and the AI lifts hooks out
          automatically.
        </div>
      ) : (
        <div className="border rounded-xl bg-[var(--color-surface)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-xs uppercase tracking-wider text-[var(--color-muted)]">
              <tr>
                <th className="text-left px-4 py-3">#</th>
                <th className="text-left px-4 py-3">Hook</th>
                <th className="text-left px-4 py-3">Pattern</th>
                <th className="text-right px-4 py-3">Uses</th>
                <th className="text-right px-4 py-3">Avg ER</th>
                <th className="text-right px-4 py-3">Best views</th>
              </tr>
            </thead>
            <tbody>
              {hooks.map((h, i) => (
                <tr key={h.id} className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-3 text-[var(--color-muted)]">{i + 1}</td>
                  <td className="px-4 py-3 max-w-md">
                    <span className="line-clamp-2">"{h.text}"</span>
                  </td>
                  <td className="px-4 py-3">
                    {h.pattern ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-muted)]">
                        {h.pattern.replace(/_/g, " ")}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--color-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{Number(h.uses)}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {h.avg_er ? `${Number(h.avg_er).toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--color-muted)]">
                    {h.best_views ? formatNumber(Number(h.best_views)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
