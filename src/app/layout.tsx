import type { Metadata } from "next";
import { Playfair_Display, Fraunces, Inter } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creator OS",
  description: "AI dashboard for everything you post and everyone you watch.",
};

// ─── EDITORIAL DISPLAY (headlines, hero text, italic flourishes) ───────
// Fraunces is the closest free Google-Fonts match to the "PP Editorial New
// Black + Italic" look in the reference: very high contrast, slab terminals,
// pronounced italic curves. Variable axes let us crank `wght` to 900 and the
// `SOFT` axis up for the editorial-magazine feel on the heaviest weights.
// `opsz` 144 picks the display-optimized cut.
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["italic", "normal"],
  // `weight: "variable"` (not a static list) is required by next/font/google
  // when also declaring `axes`. With variable weight the CSS can pick any
  // value via font-weight: 600/700/900 or font-variation-settings, so we're
  // not losing anything compared to enumerating weights.
  weight: "variable",
  display: "swap",
  variable: "--font-fraunces",
  axes: ["opsz", "SOFT", "WONK"],
});

// Kept around because the hook-on-image canvas editor renders text with this
// family on its <canvas>, and changing that would force a re-render flow.
// New editorial italic accents in UI prefer Fraunces from now on though.
const playfair = Playfair_Display({
  subsets: ["latin"],
  style: ["italic", "normal"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
  variable: "--font-playfair",
});

// ─── BODY (paragraph, UI labels, small text) ────────────────────────────
// Inter is the modern UI workhorse — clean at small sizes, has the geometric
// feel that the reference image's body paragraphs use. Replaces the system
// stack which was rendering as -apple-system / Segoe UI / Roboto depending
// on platform and looked inconsistent.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${fraunces.variable} ${playfair.variable} ${inter.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
