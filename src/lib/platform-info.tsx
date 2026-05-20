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
  /** When false, the platform is hidden from all UI surfaces (pickers,
   *  dashboard Connect grid). Existing drafts that reference the
   *  platform still publish normally — only NEW post creation hides
   *  the option. Flip to true to re-enable. */
  enabled: boolean;
};

export const PLATFORM_INFO: Record<Platform, PlatformInfo> = {
  INSTAGRAM: {
    label: "Instagram",
    brandColor: "#E1306C",
    icon: ({ className }) => <Instagram className={className} />,
    publishSupported: true,
    enabled: true,
  },
  TIKTOK: {
    label: "TikTok",
    brandColor: "#000000",
    // Lucide has no TikTok glyph. Music2 is a near-enough abstract stand-in
    // (musical-note silhouette) that reads as TikTok in context — the
    // label next to it disambiguates.
    icon: ({ className }) => <Music2 className={className} />,
    publishSupported: true,
    enabled: true,
  },
  YOUTUBE: {
    label: "YouTube",
    brandColor: "#FF0000",
    icon: ({ className }) => <Youtube className={className} />,
    publishSupported: true,
    // User asked to hide YouTube from the active picker — flip to true
    // when you want it back.
    enabled: false,
  },
  FACEBOOK: {
    label: "Facebook",
    brandColor: "#1877F2",
    icon: ({ className }) => <Facebook className={className} />,
    publishSupported: true,
    enabled: true,
  },
  LINKEDIN: {
    label: "LinkedIn",
    brandColor: "#0A66C2",
    icon: ({ className }) => <Linkedin className={className} />,
    publishSupported: true,
    // User asked to hide LinkedIn from the active picker — flip to true
    // when you want it back.
    enabled: false,
  },
};

/** Full ordered list — Instagram first because that's the primary target.
 *  Includes platforms that are currently hidden via `enabled: false`. Use
 *  this for back-compat reads (existing drafts may reference hidden
 *  platforms). Use ENABLED_PLATFORMS_ORDERED for new-post UI. */
export const ALL_PLATFORMS_ORDERED: Platform[] = [
  "INSTAGRAM",
  "TIKTOK",
  "YOUTUBE",
  "FACEBOOK",
  "LINKEDIN",
];

/** Visible-in-UI ordered list. Drops platforms with `enabled: false`. */
export const ENABLED_PLATFORMS_ORDERED: Platform[] =
  ALL_PLATFORMS_ORDERED.filter((p) => PLATFORM_INFO[p].enabled);
