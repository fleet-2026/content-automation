import { google, youtube_v3 } from "googleapis";
import { Platform, MediaType } from "@prisma/client";
import {
  type FetchedPost,
  type PlatformClient,
  type ProfileInfo,
  type TokenSet,
  extractHashtags,
} from "./base";
import { env } from "@/lib/env";

export const YT_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

function buildOAuthClient(redirectUri?: string) {
  return new google.auth.OAuth2(
    env("GOOGLE_CLIENT_ID"),
    env("GOOGLE_CLIENT_SECRET"),
    redirectUri,
  );
}

export function youtubeAuthUrl(redirectUri: string, state: string): string {
  const oauth2 = buildOAuthClient(redirectUri);
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: YT_SCOPES,
    state,
    include_granted_scopes: true,
  });
}

export async function youtubeExchangeCode(code: string, redirectUri: string) {
  const oauth2 = buildOAuthClient(redirectUri);
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}

export class YouTubeClient implements PlatformClient {
  readonly platform = Platform.YOUTUBE;

  private oauth: ReturnType<typeof buildOAuthClient>;
  private youtube: youtube_v3.Youtube;

  constructor(
    private tokens: { accessToken: string; refreshToken?: string | null; expiresAt?: Date | null },
    /** uploads playlist ID (cached on SocialAccount.metadata) */
    private uploadsPlaylistId?: string,
  ) {
    this.oauth = buildOAuthClient();
    this.oauth.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken ?? undefined,
      expiry_date: tokens.expiresAt ? tokens.expiresAt.getTime() : undefined,
    });
    this.youtube = google.youtube({ version: "v3", auth: this.oauth });
  }

  async refreshIfNeeded(): Promise<TokenSet | null> {
    const expiry = this.tokens.expiresAt?.getTime();
    if (expiry && expiry > Date.now() + 60_000) return null;
    if (!this.tokens.refreshToken) return null;
    const { credentials } = await this.oauth.refreshAccessToken();
    return {
      accessToken: credentials.access_token ?? this.tokens.accessToken,
      refreshToken: credentials.refresh_token ?? this.tokens.refreshToken,
      expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
    };
  }

  async getProfile(): Promise<ProfileInfo> {
    const { data } = await this.youtube.channels.list({
      part: ["snippet", "statistics", "contentDetails"],
      mine: true,
    });
    const ch = data.items?.[0];
    if (!ch) throw new Error("No channel found for authenticated user");
    const uploads = ch.contentDetails?.relatedPlaylists?.uploads ?? null;
    if (uploads) this.uploadsPlaylistId = uploads;
    return {
      platformUserId: ch.id ?? "",
      username: ch.snippet?.customUrl ?? null,
      displayName: ch.snippet?.title ?? null,
      profileImage: ch.snippet?.thumbnails?.medium?.url ?? null,
      followerCount: Number(ch.statistics?.subscriberCount ?? 0),
      postCount: Number(ch.statistics?.videoCount ?? 0),
      metadata: {
        uploadsPlaylistId: uploads,
        viewCount: Number(ch.statistics?.viewCount ?? 0),
      },
    };
  }

  async listRecentPosts(limit = 50): Promise<FetchedPost[]> {
    let uploads = this.uploadsPlaylistId;
    if (!uploads) {
      const profile = await this.getProfile();
      uploads = (profile.metadata?.uploadsPlaylistId as string) ?? undefined;
      if (!uploads) return [];
    }

    const playlistRes = await this.youtube.playlistItems.list({
      part: ["snippet", "contentDetails"],
      playlistId: uploads,
      maxResults: Math.min(limit, 50),
    });

    const videoIds: string[] = [];
    for (const it of playlistRes.data.items ?? []) {
      const id = it.contentDetails?.videoId;
      if (id) videoIds.push(id);
    }
    if (!videoIds.length) return [];

    const videosRes = await this.youtube.videos.list({
      part: ["snippet", "statistics", "contentDetails"],
      id: videoIds,
    });

    const out: FetchedPost[] = [];
    for (const v of videosRes.data.items ?? []) {
      if (!v.id) continue;
      const isShort = isLikelyShort(v);
      out.push({
        platformPostId: v.id,
        url: `https://youtube.com/watch?v=${v.id}`,
        caption: [v.snippet?.title, v.snippet?.description].filter(Boolean).join("\n\n") || null,
        hashtags: extractHashtags(`${v.snippet?.title ?? ""} ${v.snippet?.description ?? ""}`),
        mediaType: isShort ? MediaType.SHORT : MediaType.VIDEO,
        mediaUrl: null,
        thumbnailUrl:
          v.snippet?.thumbnails?.maxres?.url ??
          v.snippet?.thumbnails?.high?.url ??
          v.snippet?.thumbnails?.medium?.url ??
          null,
        durationSec: parseISODurationToSec(v.contentDetails?.duration ?? null),
        publishedAt: new Date(v.snippet?.publishedAt ?? Date.now()),
        views: Number(v.statistics?.viewCount ?? 0),
        likes: Number(v.statistics?.likeCount ?? 0),
        comments: Number(v.statistics?.commentCount ?? 0),
        shares: 0,
        saves: Number(v.statistics?.favoriteCount ?? 0),
        reach: null,
        impressions: null,
        raw: v as unknown as Record<string, unknown>,
      });
    }
    return out;
  }
}

function isLikelyShort(v: youtube_v3.Schema$Video): boolean {
  const dur = parseISODurationToSec(v.contentDetails?.duration ?? null);
  if (dur != null && dur <= 60) return true;
  const tags = (v.snippet?.tags ?? []).map((t) => t.toLowerCase());
  if (tags.some((t) => t.includes("#shorts"))) return true;
  return false;
}

function parseISODurationToSec(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const [, h, mn, s] = m;
  return Number(h ?? 0) * 3600 + Number(mn ?? 0) * 60 + Number(s ?? 0);
}
