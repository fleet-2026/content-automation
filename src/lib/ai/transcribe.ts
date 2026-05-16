import Groq from "groq-sdk";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeFetch } from "@/lib/safe-fetch";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "" });

export type TranscriptResult = {
  text: string;
  language?: string;
  durationSec?: number;
  segments?: { start: number; end: number; text: string }[];
};

/**
 * Transcribe a local audio/video file via Groq Whisper-large-v3-turbo.
 * Cheap (~$0.04/audio-hour) and fast (~10x realtime).
 */
export async function transcribeFile(filePath: string): Promise<TranscriptResult> {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set");
  const buf = await fs.readFile(filePath);
  const file = new File([buf], path.basename(filePath), {
    type: "application/octet-stream",
  });
  const res = await groq.audio.transcriptions.create({
    file,
    model: "whisper-large-v3-turbo",
    response_format: "verbose_json",
    temperature: 0,
  });
  return {
    text: res.text,
    language: (res as { language?: string }).language,
    durationSec: (res as { duration?: number }).duration,
    segments: (res as { segments?: { start: number; end: number; text: string }[] }).segments,
  };
}

/**
 * Transcribe from a URL by downloading first then sending to Groq.
 * Uses safeFetch to block SSRF — user-supplied URLs cannot reach localhost
 * or private IPs. 100 MB cap (Groq's audio limit is well under this).
 */
export async function transcribeUrl(url: string): Promise<TranscriptResult> {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set");
  const r = await safeFetch(url, { maxBytes: 100 * 1024 * 1024, timeoutMs: 60_000 });
  const file = new File([new Uint8Array(r.buffer)], "audio.bin", {
    type: "application/octet-stream",
  });
  const res = await groq.audio.transcriptions.create({
    file,
    model: "whisper-large-v3-turbo",
    response_format: "verbose_json",
    temperature: 0,
  });
  return {
    text: res.text,
    language: (res as { language?: string }).language,
    durationSec: (res as { duration?: number }).duration,
    segments: (res as { segments?: { start: number; end: number; text: string }[] }).segments,
  };
}
