import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creator OS",
  description: "AI dashboard for everything you post and everyone you watch.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
