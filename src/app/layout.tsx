import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creator OS",
  description: "AI dashboard for everything you post and everyone you watch.",
};

// Loaded site-wide so the hook-on-image canvas editor (and anywhere else
// that uses --font-playfair) can render text with this typeface. Italic
// + weight 700 covers the visual we want for image overlays. `display:
// swap` lets the canvas fall back to a system serif while the woff2 is
// still in flight — the editor re-renders once `document.fonts.ready`
// resolves so the final output uses the actual Playfair glyphs.
const playfair = Playfair_Display({
  subsets: ["latin"],
  style: ["italic", "normal"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
  variable: "--font-playfair",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={playfair.variable}>{children}</body>
    </html>
  );
}
