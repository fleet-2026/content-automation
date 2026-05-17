import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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
