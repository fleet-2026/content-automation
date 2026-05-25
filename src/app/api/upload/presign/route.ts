import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth-helpers";
import { presignR2Upload } from "@/lib/r2";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/upload/presign
 *
 * Returns a presigned PUT URL for direct browser → R2 upload.
 * Bypasses Vercel's 4.5 MB serverless body limit — the video
 * goes straight from the browser to Cloudflare R2.
 *
 * Body: { contentType: string; ext: string }
 */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireUser();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const rl = await rateLimit(`upload:${userId}`, {
    max: 50,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: { contentType?: string; ext?: string };
  try {
    body = (await req.json()) as { contentType?: string; ext?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const contentType = body.contentType ?? "application/octet-stream";
  const ext = body.ext ?? "bin";

  // Validate extension against allowed types
  const ALLOWED = new Set([
    "jpg", "jpeg", "png", "webp", "gif",
    "mp4", "mov", "webm",
    "mp3", "m4a", "wav",
  ]);
  if (!ALLOWED.has(ext.toLowerCase())) {
    return NextResponse.json(
      { error: "unsupported_type", allowed: [...ALLOWED] },
      { status: 415 },
    );
  }

  const key = `uploads/${userId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;

  try {
    const { uploadUrl, publicUrl } = await presignR2Upload(key, contentType);
    return NextResponse.json({ uploadUrl, publicUrl });
  } catch (e) {
    console.error("[/api/upload/presign] failed:", e);
    return NextResponse.json(
      { error: "presign_failed", message: (e as Error)?.message ?? String(e) },
      { status: 500 },
    );
  }
}
