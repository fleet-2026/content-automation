import { Flame, Eye, Newspaper } from "lucide-react";
import type { MorningBrief } from "@/lib/brief";

export function MorningBriefCard({ brief }: { brief: MorningBrief | null }) {
  if (!brief) {
    return (
      <div className="border rounded-xl bg-[var(--color-surface)] p-5">
        <div className="text-sm font-medium mb-1">Today&apos;s brief</div>
        <p className="text-xs text-[var(--color-muted)]">
          Brief generates daily at 7am Central. Add some watched creators and a niche to populate.
        </p>
      </div>
    );
  }
  return (
    <div className="border rounded-xl bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-surface-2)] p-5">
      <div className="text-xs uppercase tracking-wider text-[var(--color-accent)] mb-2">
        Today&apos;s brief
      </div>
      <p className="text-sm leading-relaxed">{brief.summary}</p>

      {brief.trendingTopics.length > 0 && (
        <section className="mt-5">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-muted)] mb-2">
            Trending
          </div>
          <ul className="space-y-1.5">
            {brief.trendingTopics.slice(0, 3).map((t, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="capitalize">{t.topic}</span>
                <span className="flex items-center gap-1 text-xs font-semibold text-amber-800">
                  <Flame className="w-3 h-3" /> {t.lift.toFixed(1)}×
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {brief.viralPosts.length > 0 && (
        <section className="mt-5">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-muted)] mb-2 flex items-center gap-1">
            <Eye className="w-3 h-3" /> Viral in your niche
          </div>
          <ul className="space-y-1.5 text-sm">
            {brief.viralPosts.slice(0, 2).map((v, i) => (
              <li key={i} className="text-[var(--color-muted)]">
                <span className="text-[var(--color-text)]">@{v.handle}</span>{" "}
                {v.hookText && <em>"{v.hookText.slice(0, 80)}"</em>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {brief.recentNews.length > 0 && (
        <section className="mt-5">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-muted)] mb-2 flex items-center gap-1">
            <Newspaper className="w-3 h-3" /> News
          </div>
          <ul className="space-y-1.5 text-sm">
            {brief.recentNews.slice(0, 3).map((n, i) => (
              <li key={i} className="line-clamp-1">
                <a
                  href={n.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  {n.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
