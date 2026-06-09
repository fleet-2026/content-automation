import { cookies } from "next/headers";
import { SESSION_COOKIE, verifyToken, type SessionUser } from "./auth";

/** Resolve the current user inside a Server Component / page. */
export async function getServerSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return token ? verifyToken(token) : null;
}
