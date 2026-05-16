import { prisma } from "@/lib/db";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";

let cachedId: string | null = null;

/**
 * Dev-open mode: when AUTH_DEV_OPEN === "1" (and we're not in production),
 * server actions can fall back to this User row instead of requiring a real
 * session. Production NEVER falls back — even if ADMIN_EMAIL is set.
 *
 * Reads ADMIN_EMAIL from env and upserts a User row on first call. Cached for
 * the process lifetime.
 */
export async function ensureDefaultUserId(): Promise<string | null> {
  // Hard gate: never auto-provision in production unless explicitly opted in.
  if (process.env.NODE_ENV === "production" && process.env.AUTH_DEV_OPEN !== "1") {
    return null;
  }
  if (process.env.AUTH_DEV_OPEN === "0") return null;

  if (cachedId) return cachedId;
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!email) return null;
  try {
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Use a random unguessable placeholder hash — never used to log in
      // (Credentials provider rejects this), but defense-in-depth.
      const placeholder = randomBytes(32).toString("hex");
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: await hash(placeholder, 8),
          name: email.split("@")[0],
        },
      });
    }
    cachedId = user.id;
    return cachedId;
  } catch (e) {
    // Surface in logs so DB issues are visible in Vercel without leaking via API.
    console.error(
      "[ensureDefaultUserId] failed:",
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}

export function isDevOpenMode(): boolean {
  if (process.env.NODE_ENV === "production") {
    return process.env.AUTH_DEV_OPEN === "1";
  }
  return process.env.AUTH_DEV_OPEN !== "0";
}
