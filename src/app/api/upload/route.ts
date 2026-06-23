import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth-helpers";
import { uploadToR2 } from "@/lib/r2";
import { sniffFileType } from "@/lib/file-sniff";
import { rateLimit } from "@/lib/rate-limit";

// Max duration for large uploads (Vercel serverless default is 10s).
export const maxDuration = 120;

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
            "Allowed: JPEG, PNG, WebP, GIF, MP4, MOV, WebM, MP3, M4A, WAV, PDF, DOC, DOCX, ZIP",
        },
        { status: 415 },
      );
    }

    // Build R2 key from server-generated parts ONLY — never echo the filename.
    const key = `uploads/${userId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${sniffed.ext}`;
    const url = await uploadToR2(key, buf, sniffed.mime);
    return NextResponse.json({ url, type: sniffed.ext, mime: sniffed.mime });
  } catch (e) {
    // Enhanced diagnostic: log the full stack + cause + name on Vercel
    // logs so we can root-cause the "Invalid character in header content
    // [authorization]" issue. The error itself comes from Node's HTTP
    // layer, not from R2 — the SDK builds the request, then Node refuses
    // to send it. The stack trace points back at S3Client.send() but the
    // cause chain has the actual char + position. We log everything; the
    // response body still returns just the message so we don't echo the
    // stack to the client.
    const err = e as Error & { cause?: unknown; code?: string };
    console.error(
      "[/api/upload] failed:",
      JSON.stringify(
        {
          name: err?.name,
          message: err?.message,
          code: err?.code,
          stack: err?.stack?.split("\n").slice(0, 8).join("\n"),
          cause: err?.cause
            ? {
                name: (err.cause as Error)?.name,
                message: (err.cause as Error)?.message,
              }
            : undefined,
        },
        null,
        2,
      ),
    );
    return NextResponse.json(
      {
        error: "upload_failed",
        message: err?.message ?? String(e),
        // Include a short error code in the response so the editor can
        // show something more helpful than the raw Node message. The full
        // stack stays server-side.
        code: err?.code ?? err?.name ?? "unknown",
      },
      { status: 500 },
    );
  }
}
