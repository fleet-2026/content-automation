import type { MediaType, Platform } from "@prisma/client";

export type ProfileInfo = {
  platformUserId: string;
  username: string | null;
  displayName: string | null;
  profileImage: string | null;
  followerCount: number | null;
  followingCount?: number | null;
  postCount?: number | null;
  metadata?: Record<string, unknown>;
};

export type FetchedPost = {
  platformPostId: string;
  url: string | null;
  caption: string | null;
  hashtags: string[];
  mediaType: MediaType;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  publishedAt: Date;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number | null;
  impressions: number | null;
  raw?: Record<string, unknown>;
};

export type TokenSet = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string | null;
};

export interface PlatformClient {
  readonly platform: Platform;
  getProfile(): Promise<ProfileInfo>;
  listRecentPosts(limit?: number): Promise<FetchedPost[]>;
  /** Should ensure the access token is fresh. Returns updated token set if rotated. */
  refreshIfNeeded?(): Promise<TokenSet | null>;
}

export function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(/#[\p{L}\p{N}_]+/gu);
  if (!matches) return [];
  return [...new Set(matches.map((h) => h.slice(1).toLowerCase()))];
}

export function calcEngagementRate(
  views: number,
  likes: number,
  comments: number,
  shares: number,
  saves: number,
): number | null {
  const denom = views > 0 ? views : null;
  if (!denom) return null;
  return ((likes + comments + shares + saves) / denom) * 100;
}
