import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getPublishedGuide } from "@/lib/guides";

export const revalidate = 300; // 5-min ISR cache, matches the index page

// Generates good OG previews when someone shares /guides/<slug> on
// social — the hook is short enough to fit the description and the
// title is the headline.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getPublishedGuide(slug);
  if (!guide) {
    return {
      title: "Guide not found",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: `${guide.title} — Daily AI Guide`,
    description: guide.hook.slice(0, 160),
    robots: { index: true, follow: true },
    openGraph: {
      title: guide.title,
      description: guide.hook,
      type: "article",
      // publishedAt + tags help OG-aware crawlers / Slack unfurls.
      publishedTime: guide.publishedAt?.toISOString(),
      tags: guide.hashtags,
    },
    twitter: {
      card: "summary_large_image",
      title: guide.title,
      description: guide.hook,
    },
  };
}

export default async function GuideDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = await getPublishedGuide(slug);
  if (!guide) notFound();

  return (
    <article className="max-w-3xl mx-auto px-6 py-12">
      {/* Crumb */}
      <Link
        href="/guides"
        className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] inline-flex items-center gap-1"
      >
        ← All guides
      </Link>

      {/* Header */}
      <header className="mt-6 mb-8">
        {guide.index != null && (
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-blush-deep)] font-medium mb-3">
            Day {guide.index}
          </div>
        )}
        <h1 className="font-display text-4xl sm:text-5xl leading-tight">
          {guide.title}
        </h1>
        {guide.publishedAt && (
          <time
            dateTime={guide.publishedAt.toISOString()}
            className="text-xs text-[var(--color-muted)] mt-3 block"
          >
            {guide.publishedAt.toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
        )}
      </header>

      {/* Hook — pulled into a quoted blockquote so it reads as the
          "hero line" of the article. Italic Fraunces for visual weight. */}
      {guide.hook && (
        <blockquote className="border-l-4 border-[var(--color-blush)] pl-6 my-10 font-italic-accent text-2xl sm:text-3xl text-[var(--color-text)] leading-snug">
          “{guide.hook}”
        </blockquote>
      )}

      {/* Primary CTA to the full source guide — promoted up top so it's
          the first thing readers reach for after the hook. Bottom-of-
          page link below stays as a secondary, lower-friction option. */}
      {guide.sourceUrl && (
        <div className="my-10">
          <a
            href={guide.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-blush-deep)] text-white px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition"
          >
            Read the full guide
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      )}

      {/* Script — the meat. Pre-wrap preserves line breaks the user
          intentionally added in their script. */}
      <section className="prose-section">
        <h2 className="font-display text-xl mb-4 mt-12 text-[var(--color-muted)]">
          The talking-head script
        </h2>
        <p className="whitespace-pre-wrap leading-relaxed text-[var(--color-text)] text-lg">
          {guide.script}
        </p>
      </section>

      {/* Caption (the actual post text) */}
      {guide.caption && (
        <section className="mt-12">
          <h2 className="font-display text-xl mb-4 text-[var(--color-muted)]">
            Caption to use
          </h2>
          <div className="rounded-xl border bg-[var(--color-surface)] p-5 text-sm whitespace-pre-wrap leading-relaxed">
            {guide.caption}
          </div>
        </section>
      )}

      {/* Hashtags + ManyChat keyword */}
      {(guide.hashtags.length > 0 || guide.manychatKeyword) && (
        <section className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {guide.hashtags.length > 0 && (
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] mb-2">
                Hashtags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {guide.hashtags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-1 rounded-md bg-[var(--color-surface-2)] text-[var(--color-text)]"
                  >
                    #{tag.replace(/^#/, "")}
                  </span>
                ))}
              </div>
            </div>
          )}
          {guide.manychatKeyword && (
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] mb-2">
                ManyChat trigger word
              </h3>
              <code className="text-sm font-mono px-3 py-1.5 rounded-md bg-[var(--color-surface-2)] inline-block">
                {guide.manychatKeyword}
              </code>
            </div>
          )}
        </section>
      )}

      {/* Secondary outbound link at the foot of the page for readers
          who scrolled past the hero CTA. Same href, lower visual weight. */}
      {guide.sourceUrl && (
        <div className="mt-12 pt-6 border-t border-[var(--color-border)]">
          <a
            href={guide.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm text-[var(--color-blush-deep)] hover:underline font-medium"
          >
            Read the full guide <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Subtle CTA back to index */}
      <div className="mt-16 text-center">
        <Link
          href="/guides"
          className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] inline-flex items-center gap-1"
        >
          ← More daily guides
        </Link>
      </div>
    </article>
  );
}
