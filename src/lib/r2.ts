import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

let _r2: S3Client | null = null;
export function r2(): S3Client {
  if (_r2) return _r2;
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
  const bucket = process.env.R2_BUCKET || "creator-os";
  await r2().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (base) return `${base}/${key}`;
  return `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${key}`;
}
