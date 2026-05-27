"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import {
  Search,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Eye,
  Heart,
  MessageCircle,
  Lock,
  AlertTriangle,
  Plus,
  BadgeCheck,
  Star,
  X,
} from "lucide-react";
import { lookupIgProfile, watchIgProfile } from "./actions";
import type { BrowseProfile, BrowsePost } from "@/lib/browse";

const FAV_KEY = "browse-ig-favorites";

type FavEntry = {
  handle: string;
  displayName?: string;
  profileImage?: string;
};

function loadFavorites(): FavEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveFavorites(favs: FavEntry[]) {
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
}

export function BrowseUI() {
  const [handle, setHandle] = useState("");
  const [profile, setProfile] = useState<BrowseProfile | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [watchedOk, setWatchedOk] = useState(false);
  const [watching, setWatching] = useState(false);
  const [favorites, setFavorites] = useState<FavEntry[]>([]);

  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  const isFavorited = profile
    ? favorites.some((f) => f.handle.toLowerCase() === profile.handle.toLowerCase())
    : false;

  const toggleFavorite = useCallback(
    (p: BrowseProfile) => {
      setFavorites((prev) => {
        const exists = prev.some(
          (f) => f.handle.toLowerCase() === p.handle.toLowerCase(),
        );
        const next = exists
          ? prev.filter((f) => f.handle.toLowerCase() !== p.handle.toLowerCase())
          : [
              ...prev,
              {
                handle: p.handle,
                displayName: p.displayName ?? undefined,
                profileImage: p.profileImage ?? undefined,
              },
            ];
        saveFavorites(next);
        return next;
      });
    },
    [],
  );

  const removeFavorite = useCallback((handle: string) => {
    setFavorites((prev) => {
      const next = prev.filter(
        (f) => f.handle.toLowerCase() !== handle.toLowerCase(),
      );
      saveFavorites(next);
      return next;
    });
  }, []);

  function search(h: string) {
    const clean = h.trim().replace(/^@/, "");
    if (!clean) return;
    setHandle(clean);
    setErr(null);
    setProfile(null);
    setWatchedOk(false);
    start(async () => {
      try {
        const p = await lookupIgProfile(clean);
        if (!p) {
          setErr("No profile found. Check the handle and try again.");
          return;
        }
        setProfile(p);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function go() {
    const clean = handle.trim();
    if (!clean) {
      setErr("Type a handle.");
      return;
    }
    search(clean);
  }

  async function onWatch() {
    if (!profile) return;
    setWatching(true);
    setErr(null);
    try {
      await watchIgProfile(profile.handle);
      setWatchedOk(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setWatching(false);
    }
  }

  return (
    <div>
      {/* ── Favorites bar ── */}
      {favorites.length > 0 && (
        <div className="mb-5">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] mb-2">
            Favorites
          </div>
          <div className="flex flex-wrap gap-2">
            {favorites.map((f) => (
              <div
                key={f.handle}
                className="group flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] pl-1 pr-2 py-1 hover:border-amber-500/50 transition cursor-pointer"
              >
                <button
                  onClick={() => search(f.handle)}
                  disabled={pending}
                  className="flex items-center gap-2 disabled:opacity-50"
                >
                  {f.profileImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.profileImage}
                      alt=""
                      width={24}
                      height={24}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-[10px] font-semibold text-[var(--color-muted)]">
                      {f.handle.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-medium">@{f.handle}</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFavorite(f.handle);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--color-muted)] hover:text-rose-400"
                  title="Remove from favorites"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Search bar ── */}
      <div className="flex flex-col sm:flex-row gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder="@username  e.g. @zuck, @kyliejenner"
            aria-label="Instagram handle to look up"
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
        </div>
        <button
          onClick={go}
          disabled={pending || !handle.trim()}
          className="bg-[var(--color-accent)] text-[var(--color-text-on-dark)] hover:opacity-90 rounded-lg px-5 py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </>
          ) : (
            <>
              <Search className="w-4 h-4" />
              Look up
            </>
          )}
        </button>
        <a
          href={`https://www.instagram.com/${handle.replace(/^@/, "").trim() || ""}/`}
          target="_blank"
          rel="noreferrer"
          className="bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] text-[var(--color-text)] rounded-lg px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-2"
          title="Open this handle on instagram.com"
        >
          <ExternalLink className="w-4 h-4" />
          Open on IG
        </a>
      </div>

      {err && (
        <div className="bg-red-100 border border-red-300 text-red-900 text-sm rounded-lg p-3 flex gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {pending && !profile && <PendingSkeleton />}

      {profile && (
        <ProfileCard
          profile={profile}
          onWatch={onWatch}
          watching={watching}
          watchedOk={watchedOk}
          isFavorited={isFavorited}
          onToggleFavorite={() => toggleFavorite(profile)}
        />
      )}

      {!profile && !pending && !err && (
        <div className="border rounded-xl bg-[var(--color-surface)] p-10 text-center">
          <Search className="w-8 h-8 text-[var(--color-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--color-muted)]">
            Search any Instagram handle above to preview their profile and 12
            most recent posts.
          </p>
          <p className="text-xs text-[var(--color-muted)] mt-2">
            Tip: looking won&apos;t add them to your watchlist. Use{" "}
            <strong>+ Watch</strong> on the result if you want to track them.
          </p>
        </div>
      )}
    </div>
  );
}

function ProfileCard({
  profile,
  onWatch,
  watching,
  watchedOk,
  isFavorited,
  onToggleFavorite,
}: {
  profile: BrowseProfile;
  onWatch: () => void;
  watching: boolean;
  watchedOk: boolean;
  isFavorited: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Profile header */}
      <div className="border rounded-xl bg-[var(--color-surface)] p-6 flex flex-col sm:flex-row gap-5">
        <div className="shrink-0 self-center sm:self-start">
          {profile.profileImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.profileImage}
              alt={profile.handle}
              loading="lazy"
              decoding="async"
              width={80}
              height={80}
              className="w-20 h-20 rounded-full object-cover border border-[var(--color-border)]"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-2xl text-[var(--color-muted)] font-semibold">
              {profile.handle.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-semibold">@{profile.handle}</h2>
            {profile.isVerified && (
              <BadgeCheck className="w-5 h-5 text-blue-700" />
            )}
            {profile.isPrivate && (
              <span className="text-[10px] uppercase tracking-wider bg-[var(--color-surface-2)] text-[var(--color-muted)] rounded-full px-2 py-0.5 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Private
              </span>
            )}
          </div>
          {profile.displayName && (
            <p className="text-sm font-medium mt-0.5">{profile.displayName}</p>
          )}
          {profile.bio && (
            <p className="text-sm text-[var(--color-muted)] mt-2 whitespace-pre-line line-clamp-4">
              {profile.bio}
            </p>
          )}
          {profile.externalUrl && (
            <a
              href={profile.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[var(--color-accent)] hover:underline mt-1 inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              {profile.externalUrl.replace(/^https?:\/\//, "")}
            </a>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm">
            <Stat label="posts" value={fmt(profile.totalPosts)} />
            <Stat label="followers" value={fmt(profile.followers)} />
            <Stat label="following" value={fmt(profile.following)} />
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={onToggleFavorite}
            className={`rounded-lg px-4 py-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
              isFavorited
                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25"
                : "bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] text-[var(--color-text)]"
            }`}
          >
            <Star
              className="w-3.5 h-3.5"
              fill={isFavorited ? "currentColor" : "none"}
            />
            {isFavorited ? "Favorited" : "Favorite"}
          </button>
          <a
            href={`https://www.instagram.com/${profile.handle}/`}
            target="_blank"
            rel="noreferrer"
            className="bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] rounded-lg px-4 py-2 text-xs font-medium flex items-center justify-center gap-2"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open on IG
          </a>
          {watchedOk ? (
            <span className="bg-green-100 text-green-900 rounded-lg px-4 py-2 text-xs font-medium flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Watching
            </span>
          ) : (
            <button
              onClick={onWatch}
              disabled={watching}
              className="bg-[var(--color-accent)] text-[var(--color-text-on-dark)] hover:opacity-90 rounded-lg px-4 py-2 text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {watching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              Watch
            </button>
          )}
        </div>
      </div>

      {/* Latest posts grid */}
      {profile.posts.length === 0 ? (
        <div className="border rounded-xl bg-[var(--color-surface)] p-10 text-center text-sm text-[var(--color-muted)]">
          {profile.isPrivate
            ? "This account is private — posts can't be previewed."
            : "No recent posts found."}
        </div>
      ) : (
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--color-muted)] mb-3">
            Latest {profile.posts.length} posts
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {profile.posts.map((p, i) => (
              <PostThumb key={p.shortCode ?? i} post={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PostThumb({ post }: { post: BrowsePost }) {
  return (
    <a
      href={post.url ?? "#"}
      target="_blank"
      rel="noreferrer"
      className="block group border rounded-lg overflow-hidden bg-[var(--color-surface)] hover:border-[var(--color-accent)] transition"
    >
      <div className="relative aspect-square bg-[var(--color-surface-2)] overflow-hidden">
        {post.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            width={400}
            height={400}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--color-muted)] text-xs">
            no preview
          </div>
        )}
        <span className="absolute top-1.5 right-1.5 text-[9px] uppercase tracking-wider bg-black/70 text-white px-1.5 py-0.5 rounded">
          {post.mediaType.toLowerCase()}
        </span>
      </div>
      <div className="p-2.5">
        {post.caption && (
          <p className="text-[11px] text-[var(--color-muted)] line-clamp-2 mb-1.5">
            {post.caption}
          </p>
        )}
        <div className="flex items-center gap-2.5 text-[10px] text-[var(--color-muted)]">
          {post.views > 0 && (
            <span className="flex items-center gap-0.5">
              <Eye className="w-3 h-3" /> {fmt(post.views)}
            </span>
          )}
          <span className="flex items-center gap-0.5">
            <Heart className="w-3 h-3" /> {fmt(post.likes)}
          </span>
          <span className="flex items-center gap-0.5">
            <MessageCircle className="w-3 h-3" /> {fmt(post.comments)}
          </span>
        </div>
      </div>
    </a>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-semibold">{value}</span>{" "}
      <span className="text-[var(--color-muted)]">{label}</span>
    </div>
  );
}

function PendingSkeleton() {
  return (
    <div className="border rounded-xl bg-[var(--color-surface)] p-6 animate-pulse">
      <div className="flex gap-5">
        <div className="w-20 h-20 rounded-full bg-[var(--color-surface-2)]" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-40 bg-[var(--color-surface-2)] rounded" />
          <div className="h-4 w-64 bg-[var(--color-surface-2)] rounded" />
          <div className="h-4 w-3/4 bg-[var(--color-surface-2)] rounded" />
        </div>
      </div>
      <p className="text-xs text-[var(--color-muted)] mt-4 text-center">
        Scraping profile via Apify… (5-15s)
      </p>
    </div>
  );
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}
