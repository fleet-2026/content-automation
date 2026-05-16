import { auth } from "@/auth";
import { ensureDefaultUserId } from "@/lib/default-user";

/**
 * Single source of truth for "who is this request?"
 *
 * Resolution order:
 *  1. Real NextAuth session
 *  2. ensureDefaultUserId() — only returns non-null in dev-open mode
 *
 * Throws if neither produces a user. Replaces the copy-pasted requireUser()
 * that was duplicated across 6+ actions files.
 */
export async function requireUser(): Promise<string> {
  const session = await auth().catch(() => null);
  if (session?.user?.id) return session.user.id;
  const fallback = await ensureDefaultUserId();
  if (fallback) return fallback;
  throw new Error("unauthenticated");
}

/** Same as requireUser but returns null instead of throwing. */
export async function tryGetUser(): Promise<string | null> {
  try {
    return await requireUser();
  } catch {
    return null;
  }
}
