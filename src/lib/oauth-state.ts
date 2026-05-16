import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "oauth_state";

/**
 * Cookie format: `<nonce>.<payload-b64url>.<hmac-b64url>`
 *
 * The HMAC binds nonce + payload, signed with the same key we already use
 * for token encryption. An attacker who plants a cookie cannot forge a valid
 * payload — they don't know the secret. This closes the userId-tampering
 * vector flagged in the security audit.
 */

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("TOKEN_ENCRYPTION_KEY missing or wrong length (need 64 hex chars).");
  }
  return Buffer.from(hex, "hex");
}

function sign(parts: string[]): string {
  const h = crypto.createHmac("sha256", getKey());
  for (const p of parts) h.update(p);
  return h.digest("base64url");
}

function timingSafeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function setOauthState(payload: { userId: string; platform: string }): Promise<string> {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = sign([nonce, ".", payloadB64]);
  const value = `${nonce}.${payloadB64}.${sig}`;
  const jar = await cookies();
  jar.set(COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return nonce;
}

export async function consumeOauthState(
  receivedNonce: string,
): Promise<{ userId: string; platform: string } | null> {
  const jar = await cookies();
  const value = jar.get(COOKIE)?.value;
  if (!value) return null;

  // ⚠️ Do NOT delete the cookie up front. A previous version of this code
  // deleted on read, which created a DOS vector: any attacker-controlled
  // GET to /api/connect/*/callback (sameSite=lax allows top-level cross-
  // origin GETs) would destroy the legitimate user's pending state cookie
  // before they could complete the real flow. We now delete ONLY on a
  // successful match (the actual replay-prevention case). Mismatched
  // attempts leave the cookie alone — it will still expire via maxAge=600.

  // Cap receivedNonce so a 1 MB query-string can't blow up Buffer allocation.
  if (typeof receivedNonce !== "string" || receivedNonce.length > 256) return null;

  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [nonce, payloadB64, sig] = parts;

  // Constant-time comparisons — don't leak timing data on either field.
  if (!timingSafeEq(nonce, receivedNonce)) return null;
  let expected: string;
  try {
    expected = sign([nonce, ".", payloadB64]);
  } catch {
    // Key not configured — fail closed.
    return null;
  }
  if (!timingSafeEq(sig, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const p = payload as { userId?: unknown; platform?: unknown };
  if (typeof p?.userId !== "string" || typeof p?.platform !== "string") {
    return null;
  }

  // Authenticated payload validated. NOW consume the cookie so a replayed
  // OAuth code (same `state`) can't be redeemed twice on this session.
  jar.delete(COOKIE);
  return { userId: p.userId, platform: p.platform };
}
