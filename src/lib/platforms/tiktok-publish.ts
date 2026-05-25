/**
 * TikTok publishing via Content Posting API.
 *
 * Two modes:
 *  - DIRECT_POST: requires TikTok-approved scope; auto-publishes
 *  - INBOX (default): video lands in the user's TikTok app inbox; they finalize there.
 *
 * Inbox mode works without special review and is the safest default.
 *
 * FILE_UPLOAD uses chunked transfer for videos > 50 MB (TikTok caps
 * chunk_size at 64 MB; we default to 50 MB for safety margin).
 */

const API = "https://open.tiktokapis.com/v2";

/** TikTok allows 5 MB – 64 MB per chunk. We pick 50 MB as a safe default. */
const MAX_CHUNK = 50 * 1024 * 1024; // 50 MB

export type TTPublishInput = {
  videoUrl?: string;
  videoBuffer?: Buffer;
  title?: string;
};

export async function ttPublishToInbox(
  accessToken: string,
  input: TTPublishInput,
): Promise<{ publishId: string }> {
  const videoSize = input.videoBuffer?.length ?? 0;
  const chunkSize = input.videoUrl
    ? 0
    : Math.min(videoSize, MAX_CHUNK);
  const totalChunks = input.videoUrl
    ? 0
    : Math.ceil(videoSize / chunkSize);

  // 1. Init the upload
  const initRes = await fetch(`${API}/post/publish/inbox/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source_info: input.videoUrl
        ? { source: "PULL_FROM_URL", video_url: input.videoUrl }
        : {
            source: "FILE_UPLOAD",
            video_size: videoSize,
            chunk_size: chunkSize,
            total_chunk_count: totalChunks,
          },
    }),
  });
  if (!initRes.ok) throw new Error(`TT init: ${initRes.status} ${await initRes.text()}`);
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
      const end = Math.min(start + chunkSize, videoSize);
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
