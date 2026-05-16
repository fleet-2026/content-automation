import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  images: {
    remotePatterns: [
      // Instagram CDN (also used for Threads / FB)
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.fbcdn.net" },
      // TikTok CDN
      { protocol: "https", hostname: "**.tiktokcdn.com" },
      { protocol: "https", hostname: "**.tiktokcdn-us.com" },
      // YouTube + Google avatars
      { protocol: "https", hostname: "**.ytimg.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
      // R2 — both API and public endpoints
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "**.r2.dev" },
      // HeyGen avatar previews + rendered videos (if served direct)
      { protocol: "https", hostname: "**.heygen.com" },
      { protocol: "https", hostname: "**.heygen.ai" },
      { protocol: "https", hostname: "resource.heygen.ai" },
      { protocol: "https", hostname: "files2.heygen.ai" },
      // OpenAI image generation responses (rare, mostly base64 but defensive)
      { protocol: "https", hostname: "oaidalleapiprodscus.blob.core.windows.net" },
    ],
  },
};

export default nextConfig;
