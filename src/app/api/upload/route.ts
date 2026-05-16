import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth-helpers";
import { uploadToR2 } from "@/lib/r2";
import { sniffFileType } from "@/lib/file-sniff";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  // Auth
  let userId: string;
  try {
    userId = await requireUser();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Rate limit: 50 uploads / hour per user
  const rl = await rateLimit(`upload:${userId}`, { max: 50, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  const MAX = 200 * 1024 * 1024;
  if (file.size > MAX) {
    return NextResponse.json(
      { error: "file_too_large", maxBytes: MAX },
      { status: 413 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "empty_file" }, { status: 400 });
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());

    // Sniff magic bytes — never trust file.name or file.type.
    const sniffed = sniffFileType(new Uint8Array(buf.slice(0, 64)));
    if (!sniffed) {
      return NextResponse.json(
        {
          error: "unsupported_type",
          message:
            "Allowed: JPEG, PNG, WebP, GIF, MP4, MOV, WebM, MP3, M4A, WAV",
        },
        { status: 415 },
      );
    }

    // Build R2 key from server-generated parts ONLY — never echo the filename.
    const key = `uploads/${userId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${sniffed.ext}`;
    const url = await uploadToR2(key, buf, sniffed.mime);
    return NextResponse.json({ url, type: sniffed.ext, mime: sniffed.mime });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[/api/upload] failed:", msg);
    return NextResponse.json(
      { error: "upload_failed", message: msg },
      { status: 500 },
    );
  }
}
