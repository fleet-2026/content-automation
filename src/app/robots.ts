import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * Next.js auto-serves this at /robots.txt. Allows crawlers on /guides
 * (the public content) and blocks them from every dashboard route so
 * private app pages (/drafts, /studio, etc.) stay out of search.
 */
export default function robots(): MetadataRoute.Robots {
  const base =
    env("NEXT_PUBLIC_APP_URL")?.replace(/\/$/, "") ??
    "https://creator-os-delta.vercel.app";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/guides", "/guides/"],
        // Everything else on this domain is private dashboard surface.
        disallow: ["/api/", "/dashboard", "/drafts", "/studio", "/compose", "/schedule", "/trends", "/hooks", "/posts", "/voice", "/creators", "/notes", "/log", "/tracker", "/flip", "/chat", "/browse", "/daily-post", "/access"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
