/**
 * Wrapper around the youtube-transcript package.
 * Pulls captions for free (no API key needed) when they exist.
 */
import { YoutubeTranscript } from "youtube-transcript";

export type FetchedYoutubeTranscript = {
  text: string;
  segments: { start: number; end: number; text: string }[];
  durationSec: number | null;
};

export async function fetchYoutubeTranscript(
  videoId: string,
): Promise<FetchedYoutubeTranscript | null> {
  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId);
    if (!items.length) return null;
    const segments = items.map((it) => ({
      start: it.offset / 1000,
      end: (it.offset + it.duration) / 1000,
      text: it.text,
    }));
    const text = segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
    const last = segments[segments.length - 1];
    return { text, segments, durationSec: last ? Math.ceil(last.end) : null };
  } catch {
    // No captions available, captions disabled, or video private — soft-fail.
    return null;
  }
}
