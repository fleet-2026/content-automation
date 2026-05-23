import type { Metadata } from "next";
import Link from "next/link";
import { listPublishedGuides } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Guides — daily AI content for creators",
  description:
    "Hooks, talking-head scripts, captions, and hashtags for every daily AI post. Free to read, ready to record.",
  // Public site — open to search engines.
  robots: { index: true, follow: true },
  openGraph: {
    title: "Daily AI Guides",
    description:
      "Hooks, scripts, captions, and hashtags for every daily AI post.",
    type: "website",
  },
};

// Revalidate every 5 minutes — the admin saves new guides + flips
// publish state from /daily-post. ISR-style cache so visitors don't
// hammer the DB but new guides appear within the window.
export const revalidate = 300;

export default async function GuidesIndexPage() {
  const guides = await listPublishedGuides();

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <header className="mb-12 max-w-2xl">
        <h1 className="font-display text-4xl sm:text-5xl leading-tight">
          Daily AI <span className="font-italic-accent text-blush">guides.</span>
        </h1>
        <p className="text-[var(--color-muted)] mt-4 text-lg leading-relaxed">
          A new content guide every day — hook, script, caption, and hashtags
          ready to record. Pick one, talk to your camera, post.
        </p>
      </header>

      {guides.length === 0 ? (
        <div className="rounded-2xl border bg-[var(--color-surface)] p-12 text-center text-[var(--color-muted)]">
          <p className="text-sm">No guides published yet. Check back soon.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {guides.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/guides/${g.slug}`}
                className="block h-full rounded-2xl border bg-[var(--color-surface)] p-6 hover:border-[var(--color-text)]/30 transition group"
              >
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] mb-2">
                  {g.index != null ? `Day ${g.index}` : "Guide"}
                </div>
                <h2 className="font-display text-2xl leading-tight mb-3 group-hover:text-[var(--color-blush-deep)] transition">
                  {g.title}
                </h2>
                {g.hook && (
                  <p className="text-sm text-[var(--color-muted)] leading-relaxed line-clamp-3">
                    {g.hook}
                  </p>
                )}
                <div className="mt-4 inline-flex items-center text-xs font-medium text-[var(--color-blush-deep)]">
                  Read the guide →
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
