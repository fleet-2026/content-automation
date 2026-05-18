import { Instagram, Facebook, Youtube, Linkedin, Music2 } from "lucide-react";
import type { Platform } from "@prisma/client";
import type { ReactNode } from "react";

/**
 * Per-platform branding + capability metadata.
 *
 * Used by the dashboard Quick Post card, the composer, and any other UI
 * surface that needs to render a platform pill. Centralized so the brand
 * colors, labels, and "publish supported?" flag don't drift between
 * components.
 *
 * `publishSupported = false` means we have no working publish backend
 * yet — even if the user has connected the account, the pill will be
 * disabled with a "Coming soon" tooltip. As soon as the publish-side
 * client lands in src/lib/platforms/<x>-publish.ts, flip this to true.
 */
export type PlatformInfo = {
  label: string;
  brandColor: string; // hex — used for selected-state bg + icon tint
  icon: (props: { className?: string }) => ReactNode;
  publishSupported: boolean;
};

export const PLATFORM_INFO: Record<Platform, PlatformInfo> = {
  INSTAGRAM: {
    label: "Instagram",
    brandColor: "#E1306C",
    icon: ({ className }) => <Instagram className={className} />,
    publishSupported: true,
  },
  TIKTOK: {
    label: "TikTok",
    brandColor: "#000000",
    // Lucide has no TikTok glyph. Music2 is a near-enough abstract stand-in
    // (musical-note silhouette) that reads as TikTok in context — the
    // label next to it disambiguates.
    icon: ({ className }) => <Music2 className={className} />,
    publishSupported: true,
  },
  YOUTUBE: {
    label: "YouTube",
    brandColor: "#FF0000",
    icon: ({ className }) => <Youtube className={className} />,
    publishSupported: true,
  },
  FACEBOOK: {
    label: "Facebook",
    brandColor: "#1877F2",
    icon: ({ className }) => <Facebook className={className} />,
    publishSupported: false,
  },
  LINKEDIN: {
    label: "LinkedIn",
    brandColor: "#0A66C2",
    icon: ({ className }) => <Linkedin className={className} />,
    publishSupported: false,
  },
};

/** Ordered list — Instagram first because that's the primary target. */
export const ALL_PLATFORMS_ORDERED: Platform[] = [
  "INSTAGRAM",
  "TIKTOK",
  "YOUTUBE",
  "FACEBOOK",
  "LINKEDIN",
];
