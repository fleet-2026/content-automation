import { S3Client, PutObjectCommand, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

// IMPORTANT: read every R2 env via the BOM-stripping helper. A previous
// outage was caused by reading these with raw process.env.* — when one of
// the Vercel env values had a UTF-8 BOM at byte 0, the AWS SDK silently
// included the U+FEFF character in the HMAC signature and the resulting
// Authorization header was rejected by Node's HTTP layer with:
//   "Invalid character in header content ["authorization"]"
// All /api/upload calls (and therefore the hook-on-image canvas editor's
// "Apply" button) failed with that exact message. Migrating to env() keeps
// the bug from ever resurfacing if a new env var gets pasted in with a BOM.

let _r2: S3Client | null = null;
export function r2(): S3Client {
  if (_r2) return _r2;
  const accountId = env("R2_ACCOUNT_ID");
  const accessKeyId = env("R2_ACCESS_KEY_ID");
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY");
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 env vars missing (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)");
  }
  _r2 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _r2;
}

export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
): Promise<string> {
  const bucket = env("R2_BUCKET") || "creator-os";
  await r2().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  const base = env("R2_PUBLIC_URL")?.replace(/\/$/, "");
  if (base) return `${base}/${key}`;
  const accountId = env("R2_ACCOUNT_ID") ?? "";
  return `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${key}`;
}

/** Ensure the R2 bucket has CORS rules allowing browser PUT uploads.
 *  Called lazily on first presign request — idempotent, safe to call
 *  repeatedly. Cloudflare R2 supports S3-compatible PutBucketCors. */
let _corsConfigured = false;
export async function ensureR2Cors(): Promise<void> {
  if (_corsConfigured) return;
  const bucket = env("R2_BUCKET") || "creator-os";
  const appUrl = env("NEXT_PUBLIC_APP_URL") ?? "https://creator-os-delta.vercel.app";
  try {
    await r2().send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: [appUrl, "http://localhost:3000"],
              AllowedMethods: ["PUT", "GET", "HEAD"],
              AllowedHeaders: ["*"],
              ExposeHeaders: ["ETag"],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
    _corsConfigured = true;
    console.log("[r2] CORS configured for bucket", bucket);
  } catch (e) {
    // Log but don't throw — upload can still work via server-side proxy
    console.warn("[r2] Failed to set CORS (non-fatal):", (e as Error).message);
  }
}

/** Generate a presigned PUT URL so the browser can upload directly to R2,
 *  bypassing Vercel's 4.5 MB body limit. Expires after 10 minutes. */
export async function presignR2Upload(
  key: string,
  contentType: string,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const bucket = env("R2_BUCKET") || "creator-os";
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uploadUrl = await getSignedUrl(r2() as any, cmd, { expiresIn: 600 });
  const base = env("R2_PUBLIC_URL")?.replace(/\/$/, "");
  const publicUrl = base
    ? `${base}/${key}`
    : `https://${bucket}.${env("R2_ACCOUNT_ID") ?? ""}.r2.cloudflarestorage.com/${key}`;
  return { uploadUrl, publicUrl };
}
