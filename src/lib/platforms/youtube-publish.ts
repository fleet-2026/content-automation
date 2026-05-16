import { google } from "googleapis";
import { Readable } from "node:stream";
import { safeFetch } from "@/lib/safe-fetch";
import { env } from "@/lib/env";

export type YTPublishInput = {
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: "private" | "unlisted" | "public";
  videoBuffer?: Buffer;
  videoUrl?: string;
};

export async function ytPublish(
  tokens: { accessToken: string; refreshToken?: string | null; expiresAt?: Date | null },
  input: YTPublishInput,
): Promise<{ platformPostId: string; url: string }> {
  const oauth2 = new google.auth.OAuth2(
    env("GOOGLE_CLIENT_ID"),
    env("GOOGLE_CLIENT_SECRET"),
  );
  oauth2.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken ?? undefined,
    expiry_date: tokens.expiresAt ? tokens.expiresAt.getTime() : undefined,
    scope: "https://www.googleapis.com/auth/youtube.upload",
  });
  const youtube = google.youtube({ version: "v3", auth: oauth2 });

  let body: Readable;
  if (input.videoBuffer) {
    body = Readable.from(input.videoBuffer);
  } else if (input.videoUrl) {
    // SSRF-safe: blocks localhost/private IPs even though videoUrl typically
    // comes from R2 (a Draft.mediaUrl). Defense in depth.
    const res = await safeFetch(input.videoUrl, {
      maxBytes: 500 * 1024 * 1024,
      timeoutMs: 120_000,
    });
    body = Readable.from(res.buffer);
  } else {
    throw new Error("ytPublish needs videoBuffer or videoUrl");
  }

  const inserted = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: input.title.slice(0, 100),
        description: input.description?.slice(0, 4900) ?? "",
        tags: input.tags?.slice(0, 12) ?? [],
        categoryId: "22", // People & Blogs — safe default
      },
      status: { privacyStatus: input.privacyStatus ?? "public" },
    },
    media: { body, mimeType: "video/*" },
  });

  const id = inserted.data.id;
  if (!id) throw new Error("YouTube insert returned no id");
  return { platformPostId: id, url: `https://youtube.com/watch?v=${id}` };
}
