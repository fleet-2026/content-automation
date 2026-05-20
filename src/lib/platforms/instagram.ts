import { Platform, MediaType } from "@prisma/client";
import {
  type FetchedPost,
  type PlatformClient,
  type ProfileInfo,
  extractHashtags,
} from "./base";
import { env } from "@/lib/env";

const GRAPH = "https://graph.facebook.com/v21.0";

type FBPage = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
};

export class InstagramClient implements PlatformClient {
  readonly platform = Platform.INSTAGRAM;

  constructor(
    private readonly accessToken: string,
    /** ig_business_account_id stored in SocialAccount.platformUserId */
    private readonly igBusinessId: string,
  ) {}

  async getProfile(): Promise<ProfileInfo> {
    const url = `${GRAPH}/${this.igBusinessId}?fields=id,username,name,profile_picture_url,followers_count,follows_count,media_count&access_token=${this.accessToken}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`IG profile failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as {
      id: string;
      username?: string;
      name?: string;
      profile_picture_url?: string;
      followers_count?: number;
      follows_count?: number;
      media_count?: number;
    };
    return {
      platformUserId: data.id,
      username: data.username ?? null,
      displayName: data.name ?? null,
      profileImage: data.profile_picture_url ?? null,
      followerCount: data.followers_count ?? null,
      followingCount: data.follows_count ?? null,
      postCount: data.media_count ?? null,
    };
  }

  async listRecentPosts(limit = 50): Promise<FetchedPost[]> {
    const fields = [
      "id",
      "caption",
      "media_type",
      "media_product_type",
      "media_url",
      "thumbnail_url",
      "permalink",
      "timestamp",
      "like_count",
      "comments_count",
    ].join(",");
    const url = `${GRAPH}/${this.igBusinessId}/media?fields=${fields}&limit=${limit}&access_token=${this.accessToken}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`IG media failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { data?: IGMedia[] };
    const items = json.data ?? [];
    const out: FetchedPost[] = [];
    for (const item of items) {
      const insights = await this.getMediaInsights(item.id, item.media_product_type);
      const mediaType = mapMediaType(item.media_type, item.media_product_type);
      out.push({
        platformPostId: item.id,
        url: item.permalink ?? null,
        caption: item.caption ?? null,
        hashtags: extractHashtags(item.caption),
        mediaType,
        mediaUrl: item.media_url ?? null,
        thumbnailUrl: item.thumbnail_url ?? item.media_url ?? null,
        durationSec: null,
        publishedAt: new Date(item.timestamp),
        views: insights.views ?? insights.plays ?? 0,
        likes: item.like_count ?? insights.likes ?? 0,
        comments: item.comments_count ?? insights.comments ?? 0,
        shares: insights.shares ?? 0,
        saves: insights.saved ?? 0,
        reach: insights.reach ?? null,
        impressions: insights.impressions ?? null,
        raw: item as unknown as Record<string, unknown>,
      });
    }
    return out;
  }

  private async getMediaInsights(
    mediaId: string,
    productType?: string,
  ): Promise<Record<string, number>> {
    // Reels / video have different metric names than feed images
    const isReel = productType === "REELS";
    const metrics = isReel
      ? ["views", "reach", "likes", "comments", "shares", "saved", "total_interactions"]
      : ["impressions", "reach", "likes", "comments", "shares", "saved"];
    const url = `${GRAPH}/${mediaId}/insights?metric=${metrics.join(",")}&access_token=${this.accessToken}`;
    const res = await fetch(url);
    if (!res.ok) {
      // Insights endpoint can fail for older posts or stories — soft-fail.
      return {};
    }
    const json = (await res.json()) as {
      data?: { name: string; values?: { value?: number }[] }[];
    };
    const map: Record<string, number> = {};
    for (const m of json.data ?? []) {
      const v = m.values?.[0]?.value;
      if (typeof v === "number") map[m.name] = v;
    }
    return map;
  }
}

type IGMedia = {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_product_type?: "FEED" | "REELS" | "STORY" | "AD";
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
};

function mapMediaType(t: IGMedia["media_type"], p?: string): MediaType {
  if (p === "REELS") return MediaType.REEL;
  if (p === "STORY") return MediaType.STORY;
  if (t === "VIDEO") return MediaType.VIDEO;
  if (t === "CAROUSEL_ALBUM") return MediaType.CAROUSEL;
  return MediaType.IMAGE;
}

// ─── OAuth helpers ────────────────────────────────────────

export function instagramAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env("META_APP_ID") ?? "",
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    // CRITICAL: instagram_content_publish is required by the Graph API
    // endpoints POST /{ig-user-id}/media and /media_publish that
    // instagram-publish.ts uses. Without it, Meta returns the cryptic
    // "Unsupported state or unable to authenticate data" error which
    // looks like a token expiry but is actually a missing-scope failure.
    //
    // Order: keep instagram_basic first — Meta's consent screen renders
    // the first listed scope as the primary "what this app wants" line.
    scope: [
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_insights",
      "pages_show_list",
      "pages_read_engagement",
      "business_management",
    ].join(","),
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

/**
 * Fetch wrapper with a 15s AbortController timeout. Meta's graph endpoints
 * can occasionally hang; without a cap, the two sequential calls below could
 * eat the full 60s Vercel function budget and leave the user staring at a
 * loading dashboard.
 */
async function fetchWithTimeout(url: string, ms = 15_000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, cache: "no-store" });
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error(`IG fetch: timeout after ${ms}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function instagramExchangeCode(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; expiresAt: Date | null }> {
  const params = new URLSearchParams({
    client_id: env("META_APP_ID") ?? "",
    client_secret: env("META_APP_SECRET") ?? "",
    redirect_uri: redirectUri,
    code,
  });
  const short = await fetchWithTimeout(`${GRAPH}/oauth/access_token?${params.toString()}`);
  if (!short.ok) throw new Error(`IG short token: ${short.status} ${await short.text()}`);
  const shortJson = (await short.json()) as Partial<{ access_token: string }>;
  if (typeof shortJson.access_token !== "string" || shortJson.access_token.length === 0) {
    throw new Error("IG short token: malformed response");
  }

  const longParams = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: env("META_APP_ID") ?? "",
    client_secret: env("META_APP_SECRET") ?? "",
    fb_exchange_token: shortJson.access_token,
  });
  const long = await fetchWithTimeout(`${GRAPH}/oauth/access_token?${longParams.toString()}`);
  if (!long.ok) throw new Error(`IG long token: ${long.status} ${await long.text()}`);
  const longJson = (await long.json()) as Partial<{ access_token: string; expires_in?: number }>;
  if (typeof longJson.access_token !== "string" || longJson.access_token.length === 0) {
    throw new Error("IG long token: malformed response");
  }

  const expiresAt = longJson.expires_in
    ? new Date(Date.now() + longJson.expires_in * 1000)
    : null;
  return { accessToken: longJson.access_token, expiresAt };
}

export async function instagramListConnectedAccounts(
  userAccessToken: string,
): Promise<
  Array<{
    pageId: string;
    pageName: string;
    pageAccessToken: string;
    igBusinessId: string;
  }>
> {
  const res = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${userAccessToken}`,
  );
  if (!res.ok) throw new Error(`me/accounts: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { data?: FBPage[] };
  const out: ReturnType<typeof instagramListConnectedAccounts> extends Promise<infer R> ? R : never = [];
  for (const page of json.data ?? []) {
    if (!page.instagram_business_account) continue;
    out.push({
      pageId: page.id,
      pageName: page.name,
      pageAccessToken: page.access_token,
      igBusinessId: page.instagram_business_account.id,
    });
  }
  return out;
}
