import { Platform, MediaType } from "@prisma/client";
import {
  type FetchedPost,
  type PlatformClient,
  type ProfileInfo,
  type TokenSet,
  extractHashtags,
} from "./base";
import { env } from "@/lib/env";

const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const API_BASE = "https://open.tiktokapis.com/v2";

// TikTok scopes — note the difference between read and write:
//   user.info.*  / video.list   → READ only (profile + own posts)
//   video.upload                → REQUIRED to push a video into the
//                                 user's TikTok inbox via Content
//                                 Posting API (/post/publish/inbox/...).
//                                 Without this scope, init returns
//                                 401 scope_not_authorized.
//   video.publish               → Direct-post (skips the inbox draft
//                                 step). We don't use it; we send to
//                                 inbox so the creator can review +
//                                 hit Post inside the TikTok app.
//
// When this list changes, EXISTING connections must be re-authorized:
// TikTok bakes the granted scopes into the access token at connect
// time, so newly-added scopes only apply after the user re-clicks
// Connect TikTok in /settings.
export const TT_SCOPES = [
  "user.info.basic",
  "user.info.profile",
  "user.info.stats",
  "video.list",
  "video.upload",
];

export function tiktokAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_key: env("TIKTOK_CLIENT_KEY") ?? "",
    response_type: "code",
    scope: TT_SCOPES.join(","),
    redirect_uri: redirectUri,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function tiktokExchangeCode(
  code: string,
  redirectUri: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
  openId: string;
  scope: string;
}> {
  const body = new URLSearchParams({
    client_key: env("TIKTOK_CLIENT_KEY") ?? "",
    client_secret: env("TIKTOK_CLIENT_SECRET") ?? "",
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  // 15s timeout — TikTok auth endpoint should resolve well under this; longer
  // would just hold a Vercel function slot for nothing.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: ctrl.signal,
    });
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error("TT exchange: timeout after 15s");
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`TT exchange: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as Partial<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    refresh_expires_in: number;
    open_id: string;
    scope: string;
  }>;
  // Validate the JSON shape before we encrypt or persist — a non-OK error
  // body would otherwise crash mid-upsert with a confusing stack.
  if (
    typeof json.access_token !== "string" ||
    typeof json.refresh_token !== "string" ||
    typeof json.open_id !== "string" ||
    typeof json.expires_in !== "number" ||
    typeof json.refresh_expires_in !== "number"
  ) {
    throw new Error("TT exchange: malformed token response");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    refreshExpiresAt: new Date(Date.now() + json.refresh_expires_in * 1000),
    openId: json.open_id,
    scope: json.scope ?? "",
  };
}

export async function tiktokRefresh(refreshToken: string) {
  const body = new URLSearchParams({
    client_key: env("TIKTOK_CLIENT_KEY") ?? "",
    client_secret: env("TIKTOK_CLIENT_SECRET") ?? "",
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`TT refresh: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
  };
}

export class TikTokClient implements PlatformClient {
  readonly platform = Platform.TIKTOK;

  constructor(
    private tokens: { accessToken: string; refreshToken?: string | null; expiresAt?: Date | null },
  ) {}

  async refreshIfNeeded(): Promise<TokenSet | null> {
    const expiry = this.tokens.expiresAt?.getTime();
    if (expiry && expiry > Date.now() + 60_000) return null;
    if (!this.tokens.refreshToken) return null;
    const fresh = await tiktokRefresh(this.tokens.refreshToken);
    this.tokens = fresh;
    return {
      accessToken: fresh.accessToken,
      refreshToken: fresh.refreshToken,
      expiresAt: fresh.expiresAt,
    };
  }

  async getProfile(): Promise<ProfileInfo> {
    const fields = [
      "open_id",
      "union_id",
      "avatar_url",
      "display_name",
      "username",
      "follower_count",
      "following_count",
      "likes_count",
      "video_count",
    ].join(",");
    const res = await fetch(`${API_BASE}/user/info/?fields=${fields}`, {
      headers: { Authorization: `Bearer ${this.tokens.accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`TT user/info: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { data?: { user?: TTUser } };
    const u = json.data?.user;
    if (!u) throw new Error("TT user/info returned no data");
    return {
      platformUserId: u.open_id,
      username: u.username ?? null,
      displayName: u.display_name ?? null,
      profileImage: u.avatar_url ?? null,
      followerCount: u.follower_count ?? null,
      followingCount: u.following_count ?? null,
      postCount: u.video_count ?? null,
      metadata: { likesCount: u.likes_count ?? 0, unionId: u.union_id ?? null },
    };
  }

  async listRecentPosts(limit = 20): Promise<FetchedPost[]> {
    const fields = [
      "id",
      "title",
      "video_description",
      "duration",
      "cover_image_url",
      "embed_link",
      "share_url",
      "view_count",
      "like_count",
      "comment_count",
      "share_count",
      "create_time",
    ].join(",");
    const res = await fetch(`${API_BASE}/video/list/?fields=${fields}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ max_count: Math.min(limit, 20) }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`TT video/list: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { data?: { videos?: TTVideo[] } };
    const videos = json.data?.videos ?? [];
    return videos.map((v) => {
      const caption = [v.title, v.video_description].filter(Boolean).join("\n\n") || null;
      return {
        platformPostId: v.id,
        url: v.share_url ?? v.embed_link ?? null,
        caption,
        hashtags: extractHashtags(caption),
        mediaType: MediaType.VIDEO,
        mediaUrl: null,
        thumbnailUrl: v.cover_image_url ?? null,
        durationSec: v.duration ?? null,
        publishedAt: new Date((v.create_time ?? 0) * 1000),
        views: v.view_count ?? 0,
        likes: v.like_count ?? 0,
        comments: v.comment_count ?? 0,
        shares: v.share_count ?? 0,
        saves: 0,
        reach: null,
        impressions: null,
        raw: v as unknown as Record<string, unknown>,
      };
    });
  }
}

type TTUser = {
  open_id: string;
  union_id?: string;
  avatar_url?: string;
  display_name?: string;
  username?: string;
  follower_count?: number;
  following_count?: number;
  likes_count?: number;
  video_count?: number;
};

type TTVideo = {
  id: string;
  title?: string;
  video_description?: string;
  duration?: number;
  cover_image_url?: string;
  embed_link?: string;
  share_url?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  create_time?: number;
};
