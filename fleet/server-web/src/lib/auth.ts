import { SignJWT, jwtVerify } from "jose";

// Shared JWT auth used by BOTH the web admin (httpOnly cookie) and the mobile
// app (Bearer token). One secret, one verify path. This module is Edge-safe
// (no next/headers) so it can be imported from middleware; the Server Component
// helper lives in auth-server.ts.

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-insecure-secret-change-me"
);
export const SESSION_COOKIE = "fleet_session";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

export async function signToken(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return {
      id: String(payload.sub),
      email: String(payload.email),
      name: String(payload.name),
      role: String(payload.role),
    };
  } catch {
    return null;
  }
}

/** Extract a token from the Authorization header (mobile) or session cookie (web). */
export function tokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const cookie = req.headers.get("cookie");
  if (cookie) {
    const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

/** Resolve the current user from an API Request, or null if unauthenticated. */
export async function getAuth(req: Request): Promise<SessionUser | null> {
  const token = tokenFromRequest(req);
  return token ? verifyToken(token) : null;
}
