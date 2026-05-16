import { runActor } from "@/lib/apify";
import { extractHashtags } from "@/lib/platforms/base";

/**
 * One-off Instagram profile lookup for the /browse page.
 *
 * Unlike scrapeAndIngest (which writes Creator + CompetitorPost rows),
 * this returns a transient preview so the user can peek at any handle
 * without polluting their watchlist.
 *
 * Single Apify call: `resultsType: "details"` returns profile metadata
 * plus latestPosts embedded in one response.
 */

export type BrowseProfile = {
  handle: string;
  displayName: string | null;
  profileImage: string | null;
  bio: string | null;
  followers: number | null;
  following: number | null;
  totalPosts: number | null;
  isVerified: boolean;
  isPrivate: boolean;
  externalUrl: string | null;
  posts: BrowsePost[];
};

export type BrowsePost = {
  shortCode: string | null;
  url: string | null;
  caption: string | null;
  hashtags: string[];
  mediaType: "IMAGE" | "VIDEO" | "REEL" | "CAROUSEL";
  thumbnailUrl: string | null;
  videoUrl: string | null;
  durationSec: number | null;
  publishedAt: string | null;
  views: number;
  likes: number;
  comments: number;
};

type IGScrapedDetails = {
  username?: string;
  fullName?: string;
  profilePicUrl?: string;
  biography?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  verified?: boolean;
  private?: boolean;
  externalUrl?: string;
  latestPosts?: IGScrapedPost[];
};

type IGScrapedPost = {
  id?: string;
  shortCode?: string;
  type?: string;
  productType?: string;
  caption?: string;
  url?: string;
  videoUrl?: string;
  displayUrl?: string;
  videoDuration?: number;
  timestamp?: string;
  videoPlayCount?: number;
  videoViewCount?: number;
  likesCount?: number;
  commentsCount?: number;
};

export async function previewIgProfile(handle: string): Promise<BrowseProfile | null> {
  const clean = handle.replace(/^@/, "").trim().toLowerCase();
  if (!clean) throw new Error("Handle is required.");
  if (!/^[a-z0-9._]+$/.test(clean)) {
    throw new Error("Invalid handle. Use letters, digits, dots, and underscores only.");
  }

  const items = await runActor<IGScrapedDetails>("apify/instagram-scraper", {
    directUrls: [`https://www.instagram.com/${clean}/`],
    resultsType: "details",
    resultsLimit: 12,
    addParentData: false,
  });

  const profile = items[0];
  if (!profile) return null;

  const posts: BrowsePost[] = (profile.latestPosts ?? [])
    .filter((p) => p && (p.id || p.shortCode))
    .slice(0, 12)
    .map((p) => {
      const isVideo = p.type === "Video" || !!p.videoUrl;
      const isReel = p.productType === "clips";
      const isCarousel = p.type === "Sidecar";
      const mediaType: BrowsePost["mediaType"] = isReel
        ? "REEL"
        : isCarousel
          ? "CAROUSEL"
          : isVideo
            ? "VIDEO"
            : "IMAGE";
      return {
        shortCode: p.shortCode ?? null,
        url: p.url ?? (p.shortCode ? `https://instagram.com/p/${p.shortCode}` : null),
        caption: p.caption ?? null,
        hashtags: extractHashtags(p.caption ?? ""),
        mediaType,
        thumbnailUrl: p.displayUrl ?? null,
        videoUrl: p.videoUrl ?? null,
        durationSec: p.videoDuration ?? null,
        publishedAt: p.timestamp ?? null,
        views: p.videoPlayCount ?? p.videoViewCount ?? 0,
        likes: p.likesCount ?? 0,
        comments: p.commentsCount ?? 0,
      };
    });

  return {
    handle: profile.username ?? clean,
    displayName: profile.fullName ?? null,
    profileImage: profile.profilePicUrl ?? null,
    bio: profile.biography ?? null,
    followers: profile.followersCount ?? null,
    following: profile.followsCount ?? null,
    totalPosts: profile.postsCount ?? null,
    isVerified: !!profile.verified,
    isPrivate: !!profile.private,
    externalUrl: profile.externalUrl ?? null,
    posts,
  };
}
