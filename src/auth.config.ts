import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token?.id) session.user.id = token.id as string;
      return session;
    },
    authorized({ auth: session, request }) {
      const { pathname } = request.nextUrl;
      const isLogin = pathname === "/login";
      const isPublicAsset =
        pathname.startsWith("/_next") ||
        pathname.startsWith("/favicon") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/inngest");
      if (isLogin || isPublicAsset) return true;
      const devOpen =
        process.env.NODE_ENV === "production"
          ? process.env.AUTH_DEV_OPEN === "1"
          : process.env.AUTH_DEV_OPEN !== "0";
      if (devOpen) return true;
      return !!session;
    },
  },
} satisfies NextAuthConfig;
