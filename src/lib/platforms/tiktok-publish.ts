/**
 * TikTok publishing via Content Posting API.
 *
 * Two modes:
 *  - DIRECT_POST: requires TikTok-approved scope; auto-publishes
 *  - INBOX (default): video lands in the user's TikTok app inbox; they finalize there.
 *
 * Inbox mode works without special review and is the safest default.
 *
 * FILE_UPLOAD uses chunked transfer for videos > 64 MB (TikTok caps
 * chunk_size at 64 MB). We calculate evenly-sized chunks so every
 * chunk — including the last — stays within the 5–64 MB range.
 */

const API = "https://open.tiktokapis.com/v2";

/** TikTok chunk constraints: 5 MB min, 64 MB max.
 *  Use 10 MB as the standard chunk size — matches TikTok's own
 *  documentation examples and avoids "invalid chunk count" errors
 *  that happen with computed even-split sizes. */
const TT_MAX_CHUNK = 64 * 1024 * 1024; // 64 MB (single-chunk threshold)
const TT_STD_CHUNK = 10 * 1024 * 1024; // 10 MB (standard multi-chunk size)

export type TTPublishInput = {
  videoUrl?: string;
  videoBuffer?: Buffer;
  title?: string;
};

/**
 * Calculate chunk parameters for TikTok's FILE_UPLOAD.
 *
 * For videos ≤ 64 MB: single chunk (chunk_size = video_size).
 * For videos > 64 MB: fixed 10 MB chunk size.
 *
 * TikTok requires total_chunk_count = FLOOR(video_size / chunk_size). The
 * leftover bytes ride along on the FINAL chunk, so the last chunk is larger
 * than chunk_size (between 1× and 2× chunk_size) — it is NOT an extra short
 * chunk. Using Math.ceil sends one chunk too many and init fails with
 * `invalid_params: "The total chunk count is invalid"`.
 */
function computeChunks(videoSize: number) {
  if (videoSize <= TT_MAX_CHUNK) {
    return { chunkSize: videoSize, totalChunks: 1 };
  }
  const totalChunks = Math.floor(videoSize / TT_STD_CHUNK);
  return { chunkSize: TT_STD_CHUNK, totalChunks };
}

export async function ttPublishToInbox(
  accessToken: string,
  input: TTPublishInput,
): Promise<{ publishId: string }> {
  const videoSize = input.videoBuffer?.length ?? 0;
  const { chunkSize, totalChunks } = input.videoUrl
    ? { chunkSize: 0, totalChunks: 0 }
    : computeChunks(videoSize);

  // Log chunk params so we can debug "invalid chunk count" rejections.
  console.log(
    `[tiktok-publish] videoSize=${videoSize} chunkSize=${chunkSize} totalChunks=${totalChunks}` +
    ` (${(videoSize / 1024 / 1024).toFixed(1)} MB, ${(chunkSize / 1024 / 1024).toFixed(1)} MB/chunk)`,
  );

  // 1. Init the upload
  const sourceInfo = input.videoUrl
    ? { source: "PULL_FROM_URL", video_url: input.videoUrl }
    : {
        source: "FILE_UPLOAD",
        video_size: videoSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunks,
      };

  // TikTok's Content Posting API v2 now requires post_info even for
  // inbox mode — without it the init returns 400 invalid_params.
  const postInfo: Record<string, unknown> = {
    privacy_level: "SELF_ONLY",
  };
  // TikTok's title field doubles as the video caption. The API docs
  // say 150 chars but recent API versions accept up to 2200 chars
  // for most regions. Send the full caption so it's pre-filled in
  // the TikTok inbox — user just taps "Post".
  if (input.title) postInfo.title = input.title.slice(0, 2200);

  const initRes = await fetch(`${API}/post/publish/inbox/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ source_info: sourceInfo, post_info: postInfo }),
  });
  if (!initRes.ok) {
    const body = await initRes.text();
    throw new Error(
      `TT init: ${initRes.status} ${body} [sent: video_size=${videoSize} chunk_size=${chunkSize} total_chunk_count=${totalChunks}]`,
    );
  }
  const init = (await initRes.json()) as {
    data?: { publish_id?: string; upload_url?: string };
    error?: { code?: string; message?: string };
  };

  const publishId = init.data?.publish_id;
  if (!publishId) throw new Error(`TT init: no publish_id (${JSON.stringify(init.error)})`);

  // 2. If FILE_UPLOAD, PUT the bytes to upload_url (chunked for large files)
  if (input.videoBuffer && init.data?.upload_url) {
    const buf = input.videoBuffer;
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      // The final chunk runs to the end of the file and absorbs the remainder
      // (TikTok puts leftover bytes on the last chunk — see computeChunks).
      // Capping it at start+chunkSize would silently drop the tail bytes.
      const end = i === totalChunks - 1 ? videoSize : start + chunkSize;
      const chunk = new Uint8Array(buf.slice(start, end));
      const uploadRes = await fetch(init.data.upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(chunk.length),
          "Content-Range": `bytes ${start}-${end - 1}/${videoSize}`,
        },
        body: chunk,
      });
      if (!uploadRes.ok) {
        throw new Error(`TT upload chunk ${i + 1}/${totalChunks}: ${uploadRes.status}`);
      }
    }
  }

  return { publishId };
}

export async function ttPublishStatus(accessToken: string, publishId: string) {
  const res = await fetch(`${API}/post/publish/status/fetch/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ publish_id: publishId }),
  });
  if (!res.ok) throw new Error(`TT status: ${res.status} ${await res.text()}`);
  return res.json();
}
