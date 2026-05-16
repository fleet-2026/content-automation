"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Rocket,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { fixLowRatedPost } from "@/app/(app)/dashboard/actions";

export type RatedPostForUI = {
  id: string;
  caption: string | null;
  hookText: string | null;
  thumbnailUrl: string | null;
  url: string | null;
  platform: string;
  publishedAt: string; // ISO — server serializes Date to string for client
  rating: {
    score: number;
    band: "low" | "average" | "good" | "viral";
    reasons: string[];
    fixable: boolean;
  };
};

export function PostRatings({ posts }: { posts: RatedPostForUI[] }) {
  if (!posts || posts.length === 0) {
    return (
      <div className="border rounded-xl bg-[var(--color-surface)] p-6 text-center">
        <p className="text-sm text-[var(--color-muted)]">
          No published posts yet. Connect a platform and sync to see ratings.
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-xl bg-[var(--color-surface)] overflow-hidden">
      <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Post performance
        </h2>
        <span className="text-[11px] text-[var(--color-muted)]">
          Sorted worst-first · {posts.length} posts
        </span>
      </div>
      <ul className="divide-y divide-[var(--color-border)]">
        {posts.map((p) => (
          <PostRow key={p.id} post={p} />
        ))}
      </ul>
    </div>
  );
}

function PostRow({ post }: { post: RatedPostForUI }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onFix() {
    setErr(null);
    start(async () => {
      try {
        const r = await fixLowRatedPost(post.id);
        // Push the user directly into Compose with the 3 viral variants
        // pre-loaded, ranked by predicted engagement. They land in
        // publish-ready state — pick a variant, tweak, ship.
        router.push(`/compose?draft=${r.draftId}`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <li className="px-5 py-4 flex items-start gap-4">
      {/* Thumbnail */}
      <div className="shrink-0 w-16 h-16 rounded-lg bg-[var(--color-surface-2)] overflow-hidden">
        {post.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            width={64}
            height={64}
            className="w-full h-full object-cover"
          />
        ) : null}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <RatingBadge score={post.rating.score} band={post.rating.band} />
          <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
            {post.platform.toLowerCase()}
          </span>
          <span className="text-[11px] text-[var(--color-muted)]">
            · {new Date(post.publishedAt).toLocaleDateString()}
          </span>
          {post.url && (
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-[var(--color-accent)] hover:underline inline-flex items-center gap-0.5 ml-auto"
            >
              View <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {post.hookText ? (
          <p className="text-sm font-medium line-clamp-1">
            {post.hookText}
          </p>
        ) : null}
        {!post.hookText && post.caption ? (
          <p className="text-sm text-[var(--color-muted)] line-clamp-1">
            {post.caption}
          </p>
        ) : null}

        {post.rating.reasons.length > 0 && (
          <p className="text-[11px] text-[var(--color-muted)] mt-1 line-clamp-2">
            {post.rating.reasons.slice(0, 3).join(" · ")}
          </p>
        )}

        {err && (
          <div className="mt-2 bg-red-100 border border-red-300 text-red-900 text-[11px] rounded p-1.5 flex gap-1.5">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{err}</span>
          </div>
        )}
      </div>

      {/* Action */}
      <div className="shrink-0">
        {post.rating.fixable ? (
          <button
            onClick={onFix}
            disabled={pending}
            className="bg-[var(--color-accent)] text-[var(--color-text-on-dark)] hover:opacity-90 rounded-md px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50"
            title="Viralize this post: 3 AI variants ranked by predicted engagement, ready to publish"
          >
            {pending ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" /> Viralizing…
              </>
            ) : (
              <>
                <Rocket className="w-3 h-3" /> Viralize
              </>
            )}
          </button>
        ) : (
          <span className="text-[11px] text-[var(--color-muted)] italic px-1">
            no fix needed
          </span>
        )}
      </div>
    </li>
  );
}

function RatingBadge({
  score,
  band,
}: {
  score: number;
  band: RatedPostForUI["rating"]["band"];
}) {
  const palette: Record<RatedPostForUI["rating"]["band"], {
    bg: string;
    text: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  }> = {
    low:     { bg: "bg-red-100",   text: "text-red-900",   icon: TrendingDown, label: "low" },
    average: { bg: "bg-amber-100", text: "text-amber-900", icon: Minus,        label: "avg" },
    good:    { bg: "bg-green-100", text: "text-green-900", icon: TrendingUp,   label: "good" },
    viral:   { bg: "bg-emerald-200", text: "text-emerald-900", icon: TrendingUp, label: "viral" },
  };
  const p = palette[band];
  const Icon = p.icon;
  return (
    <span
      className={`${p.bg} ${p.text} rounded-md px-2 py-0.5 text-[11px] font-semibold inline-flex items-center gap-1`}
    >
      <Icon className="w-3 h-3" />
      {score} · {p.label}
    </span>
  );
}
