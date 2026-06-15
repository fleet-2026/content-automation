import type { Metadata } from "next";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Privacy Policy — Descon Fleet",
  description:
    "How Descon Fleet collects, uses, and protects your data. Plain-language summary of OAuth scopes, encryption, and your right to delete.",
  robots: { index: true, follow: true },
};

const BRAND =
  env("NEXT_PUBLIC_APP_URL")?.replace(/\/$/, "") ??
  "https://creator-os-delta.vercel.app";

// Updated whenever the policy materially changes. Keep this near the
// top of the page so the user can see how recent the policy is.
const LAST_UPDATED = "2026-05-24";

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl mx-auto px-6 py-12 prose-section">
      <h1 className="font-display text-4xl sm:text-5xl leading-tight">
        Privacy <span className="font-italic-accent text-blush">policy.</span>
      </h1>
      <p className="text-sm text-[var(--color-muted)] mt-2">
        Last updated: {LAST_UPDATED}
      </p>

      <h2 className="font-display text-xl mt-10 mb-3">What this is</h2>
      <p className="leading-relaxed">
        Descon Fleet is a content dashboard you use to compose, schedule, and
        publish short-form video to your own connected social-media accounts
        (Instagram, TikTok, Facebook). This page explains what data we hold
        about you, why, and how to remove it.
      </p>

      <h2 className="font-display text-xl mt-10 mb-3">What we collect</h2>
      <ul className="leading-relaxed list-disc pl-6 space-y-1.5">
        <li>
          <strong>Account info you provide</strong> — email + display name +
          password hash (bcrypt) when you sign up.
        </li>
        <li>
          <strong>OAuth tokens</strong> for each social account you connect.
          Encrypted at rest with AES-256-GCM. We use them only to publish
          posts on your behalf, refresh expired tokens, and read post metrics
          you ask us to show in /posts.
        </li>
        <li>
          <strong>Drafts + media you create</strong> — captions, hooks,
          hashtags, and the URLs of videos/images you upload. Files live in
          your Cloudflare R2 bucket; the dashboard only stores the URL.
        </li>
        <li>
          <strong>Publish history</strong> — which posts went to which
          platforms and the platform-side post IDs so we can deep-link back.
        </li>
        <li>
          <strong>Minimal request logs</strong> for debugging and rate-limit
          enforcement (IP, timestamp, route). Retained 30 days.
        </li>
      </ul>

      <h2 className="font-display text-xl mt-10 mb-3">What we DON&apos;T do</h2>
      <ul className="leading-relaxed list-disc pl-6 space-y-1.5">
        <li>We don&apos;t sell your data to third parties. Ever.</li>
        <li>
          We don&apos;t post to your social accounts without your explicit
          action (no auto-posting, no scheduled trickery — you click
          &ldquo;Publish now&rdquo; or schedule a specific time).
        </li>
        <li>We don&apos;t read your DMs, comments, or follower data.</li>
        <li>
          We don&apos;t store video files long-term on our servers — bytes
          stream from your R2 bucket through us to the destination platform
          (e.g. TikTok&apos;s FILE_UPLOAD endpoint) and the in-memory buffer
          is discarded once the upload completes.
        </li>
      </ul>

      <h2 className="font-display text-xl mt-10 mb-3">OAuth scopes we request</h2>
      <p className="leading-relaxed">
        Per-platform scopes are the minimum needed to publish + read metrics
        for your own content:
      </p>
      <ul className="leading-relaxed list-disc pl-6 space-y-1.5">
        <li>
          <strong>Instagram (Meta Graph API)</strong> —
          <code className="text-xs"> pages_show_list, pages_read_engagement, instagram_basic, instagram_content_publish, instagram_manage_insights</code>
        </li>
        <li>
          <strong>TikTok</strong> —
          <code className="text-xs"> user.info.basic, user.info.profile, user.info.stats, video.list, video.upload</code>{" "}
          (and{" "}
          <code className="text-xs">video.publish</code>{" "}
          once TikTok approves it via audit).
        </li>
        <li>
          <strong>Facebook</strong> —
          <code className="text-xs"> pages_manage_posts, pages_read_engagement, pages_show_list</code>
        </li>
      </ul>

      <h2 className="font-display text-xl mt-10 mb-3">How we secure your data</h2>
      <ul className="leading-relaxed list-disc pl-6 space-y-1.5">
        <li>HTTPS-only end-to-end (Vercel + Cloudflare).</li>
        <li>
          OAuth tokens encrypted with AES-256-GCM at rest. Encryption key is
          a 32-byte secret stored as a Vercel environment variable, not in
          source code or the database.
        </li>
        <li>Passwords are bcrypt hashed with a per-user salt.</li>
        <li>
          Postgres database (Neon) with row-level scoping in every query —
          users can only read their own data.
        </li>
      </ul>

      <h2 className="font-display text-xl mt-10 mb-3">Your right to delete</h2>
      <p className="leading-relaxed">
        You can disconnect any social account from the dashboard at any time
        — that immediately deletes the access token + refresh token + openId
        from our database. To delete your full Descon Fleet account
        (everything: drafts, media URLs, publish history, social connections),
        email{" "}
        <a
          href="mailto:hello@creator-os-delta.vercel.app"
          className="text-[var(--color-blush-deep)] hover:underline"
        >
          hello@creator-os-delta.vercel.app
        </a>{" "}
        from your registered address and we&apos;ll process the deletion
        within 7 business days.
      </p>

      <h2 className="font-display text-xl mt-10 mb-3">Cookies</h2>
      <p className="leading-relaxed">
        We use one session cookie (NextAuth) to keep you logged in, and one
        cookie for the OAuth state HMAC during a connect flow. No tracking
        cookies, no third-party analytics injected.
      </p>

      <h2 className="font-display text-xl mt-10 mb-3">Changes to this policy</h2>
      <p className="leading-relaxed">
        If we materially change how we handle your data, we&apos;ll update the
        date at the top of this page and notify connected users by email.
      </p>

      <h2 className="font-display text-xl mt-10 mb-3">Contact</h2>
      <p className="leading-relaxed">
        Questions: email <code>hello@creator-os-delta.vercel.app</code>.
      </p>

      <hr className="my-12 border-[var(--color-border)]" />
      <p className="text-sm text-[var(--color-muted)]">
        See also: <a href="/terms" className="underline">Terms of Service</a> ·{" "}
        <a href={BRAND} className="underline">Home</a>
      </p>
    </article>
  );
}
