import type { MetadataRoute } from "next";
import { listPublishedGuides } from "@/lib/guides";
import { env } from "@/lib/env";

/**
 * Next.js auto-serves this at /sitemap.xml. Lists the public /guides
 * pages so Google + Bing + LinkedIn / Slack unfurlers can crawl them.
 *
 * Only published guides — drafts and unpublished rows stay out of the
 * sitemap (and out of search) until the admin flips isPublished.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base =
    env("NEXT_PUBLIC_APP_URL")?.replace(/\/$/, "") ??
    "https://creator-os-delta.vercel.app";

  const guides = await listPublishedGuides();

  return [
    {
      url: `${base}/guides`,
      lastModified: guides[0]?.publishedAt ?? new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...guides.map((g) => ({
      url: `${base}/guides/${g.slug}`,
      lastModified: g.publishedAt ?? new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
