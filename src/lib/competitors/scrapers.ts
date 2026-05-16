import { google } from "googleapis";
import { Platform, MediaType } from "@prisma/client";
import { runActor } from "@/lib/apify";
import { extractHashtags } from "@/lib/platforms/base";
import type { FetchedPost } from "@/lib/platforms/base";

/**
 * Per-platform competitor scrapers. Returns the same FetchedPost shape as our
 * own-account clients so downstream code is uniform.
 *
 * - Instagram → Apify "apify/instagram-scraper"
 * - TikTok    → Apify "clockworks/free-tiktok-scraper"
 * - YouTube   → Official YouTube Data API (free with API key — set GOOGLE_CLIENT_ID/SECRET app-level key or YT_API_KEY)
 */

export async function scrapeInstagramHandle(
  handle: string,
  postsPerHandle = 12,
): Promise<FetchedPost[]> {
  const items = await runActor<IGScraped>("apify/instagram-scraper", {
    directUrls: [`https://www.instagram.com/${handle.replace(/^@/, "")}/`],
    resultsType: "posts",
    resultsLimit: postsPerHandle,
    addParentData: false,
  });
  return items
    .filter((it) => it && (it.id || it.shortCode))
    .map((it) => {
      const isVideo = it.type === "Video" || !!it.videoUrl;
      const isReel = it.productType === "clips";
      return {
        platformPostId: String(it.id ?? it.shortCode ?? ""),
        url: it.url ?? (it.shortCode ? `https://instagram.com/p/${it.shortCode}` : null),
        caption: it.caption ?? null,
        hashtags: extractHashtags(it.caption ?? ""),
        mediaType: isReel ? MediaType.REEL : isVideo ? MediaType.VIDEO : MediaType.IMAGE,
        mediaUrl: it.videoUrl ?? it.displayUrl ?? null,
        thumbnailUrl: it.displayUrl ?? null,
        durationSec: it.videoDuration ?? null,
        publishedAt: it.timestamp ? new Date(it.timestamp) : new Date(),
        views: it.videoPlayCount ?? it.videoViewCount ?? 0,
        likes: it.likesCount ?? 0,
        comments: it.commentsCount ?? 0,
        shares: 0,
        saves: 0,
        reach: null,
        impressions: null,
        raw: it as unknown as Record<string, unknown>,
      };
    });
}

export async function scrapeTikTokHandle(
  handle: string,
  postsPerHandle = 12,
): Promise<FetchedPost[]> {
  const items = await runActor<TTScraped>("clockworks/free-tiktok-scraper", {
    profiles: [handle.replace(/^@/, "")],
    resultsPerPage: postsPerHandle,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
  });
  return items
    .filter((it) => it && it.id)
    .map((it) => ({
      platformPostId: String(it.id),
      url: it.webVideoUrl ?? null,
      caption: it.text ?? null,
      hashtags: extractHashtags(it.text ?? ""),
      mediaType: MediaType.VIDEO,
      mediaUrl: it.videoMeta?.downloadAddr ?? null,
      thumbnailUrl: it.videoMeta?.coverUrl ?? null,
      durationSec: it.videoMeta?.duration ?? null,
      publishedAt: it.createTimeISO ? new Date(it.createTimeISO) : new Date((it.createTime ?? 0) * 1000),
      views: it.playCount ?? 0,
      likes: it.diggCount ?? 0,
      comments: it.commentCount ?? 0,
      shares: it.shareCount ?? 0,
      saves: it.collectCount ?? 0,
      reach: null,
      impressions: null,
      raw: it as unknown as Record<string, unknown>,
    }));
}

export async function scrapeYouTubeChannel(
  handle: string,
  postsPerHandle = 12,
): Promise<FetchedPost[]> {
  // YouTube Data API allows public channel lookups with a server-side API key.
  // We use the same Google client; the data API works with API key auth too.
  const apiKey = process.env.YT_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("YT_API_KEY (or GOOGLE_API_KEY) required to scrape YouTube channels");
  }
  const youtube = google.youtube({ version: "v3", auth: apiKey });

  // Resolve handle → channelId → uploads playlist
  const search = await youtube.search.list({
    part: ["snippet"],
    q: handle.replace(/^@/, ""),
    type: ["channel"],
    maxResults: 1,
  });
  const channelId = search.data.items?.[0]?.snippet?.channelId;
  if (!channelId) return [];

  const channel = await youtube.channels.list({
    part: ["contentDetails"],
    id: [channelId],
  });
  const uploads = channel.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return [];

  const playlist = await youtube.playlistItems.list({
    part: ["contentDetails"],
    playlistId: uploads,
    maxResults: postsPerHandle,
  });
  const ids = (playlist.data.items ?? [])
    .map((it) => it.contentDetails?.videoId)
    .filter((id): id is string => !!id);
  if (!ids.length) return [];

  const videos = await youtube.videos.list({
    part: ["snippet", "statistics", "contentDetails"],
    id: ids,
  });

  return (videos.data.items ?? []).map((v) => {
    const dur = parseISODurationToSec(v.contentDetails?.duration ?? null);
    const isShort = (dur ?? 0) <= 60;
    return {
      platformPostId: v.id ?? "",
      url: v.id ? `https://youtube.com/watch?v=${v.id}` : null,
      caption: [v.snippet?.title, v.snippet?.description].filter(Boolean).join("\n\n") || null,
      hashtags: extractHashtags(`${v.snippet?.title ?? ""} ${v.snippet?.description ?? ""}`),
      mediaType: isShort ? MediaType.SHORT : MediaType.VIDEO,
      mediaUrl: null,
      thumbnailUrl: v.snippet?.thumbnails?.high?.url ?? null,
      durationSec: dur,
      publishedAt: new Date(v.snippet?.publishedAt ?? Date.now()),
      views: Number(v.statistics?.viewCount ?? 0),
      likes: Number(v.statistics?.likeCount ?? 0),
      comments: Number(v.statistics?.commentCount ?? 0),
      shares: 0,
      saves: 0,
      reach: null,
      impressions: null,
      raw: v as unknown as Record<string, unknown>,
    };
  });
}

export async function scrapeFor(platform: Platform, handle: string, limit = 12): Promise<FetchedPost[]> {
  switch (platform) {
    case Platform.INSTAGRAM:
      return scrapeInstagramHandle(handle, limit);
    case Platform.TIKTOK:
      return scrapeTikTokHandle(handle, limit);
    case Platform.YOUTUBE:
      return scrapeYouTubeChannel(handle, limit);
    default:
      throw new Error(`No scraper for platform ${platform}`);
  }
}

function parseISODurationToSec(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const [, h, mn, s] = m;
  return Number(h ?? 0) * 3600 + Number(mn ?? 0) * 60 + Number(s ?? 0);
}

type IGScraped = {
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

type TTScraped = {
  id: string;
  text?: string;
  webVideoUrl?: string;
  videoMeta?: {
    downloadAddr?: string;
    coverUrl?: string;
    duration?: number;
  };
  createTimeISO?: string;
  createTime?: number;
  playCount?: number;
  diggCount?: number;
  commentCount?: number;
  shareCount?: number;
  collectCount?: number;
};
