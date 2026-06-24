import type { Metadata } from "next";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Terms of Service — Descon Fleet",
  description:
    "Terms of Service for Descon Fleet. What you can and can't do with the dashboard, who's responsible for what, and the limits of our liability.",
  robots: { index: true, follow: true },
};

const BRAND =
  env("NEXT_PUBLIC_APP_URL")?.replace(/\/$/, "") ??
  "https://creator-os-delta.vercel.app";

const LAST_UPDATED = "2026-05-24";

export default function TermsPage() {
  return (
    <article className="max-w-3xl mx-auto px-6 py-12 prose-section">
      <h1 className="font-display text-4xl sm:text-5xl leading-tight">
        Terms of <span className="font-italic-accent text-blush">service.</span>
      </h1>
      <p className="text-sm text-[var(--color-muted)] mt-2">
        Last updated: {LAST_UPDATED}
      </p>

      <h2 className="font-display text-xl mt-10 mb-3">1. What this is</h2>
      <p className="leading-relaxed">
        Descon Fleet (&ldquo;the service&rdquo;, &ldquo;we&rdquo;,
        &ldquo;us&rdquo;) is a self-serve content dashboard for creators to
        compose, schedule, and publish short-form content to their own
        connected social-media accounts. By creating an account or using the
        service, you agree to these terms.
      </p>

      <h2 className="font-display text-xl mt-10 mb-3">2. Your account</h2>
      <ul className="leading-relaxed list-disc pl-6 space-y-1.5">
        <li>You&apos;re responsible for keeping your password safe.</li>
        <li>
          One person per account. Sharing accounts violates these terms and
          may result in suspension.
        </li>
        <li>
          You must be at least 13 (or the digital-consent age of your country,
          whichever is higher) to use the service.
        </li>
      </ul>

      <h2 className="font-display text-xl mt-10 mb-3">
        3. Your content
      </h2>
      <ul className="leading-relaxed list-disc pl-6 space-y-1.5">
        <li>
          You own everything you upload. We don&apos;t claim any rights to
          your videos, images, captions, or hooks.
        </li>
        <li>
          You grant us a limited, non-exclusive license to store, process,
          and transmit your content for the sole purpose of operating the
          dashboard (e.g. uploading your videos to TikTok / Instagram /
          Facebook when you click Publish).
        </li>
        <li>
          You are solely responsible for ensuring you have the rights to
          publish whatever you upload — including any third-party music,
          imagery, or branded content references.
        </li>
      </ul>

      <h2 className="font-display text-xl mt-10 mb-3">4. Acceptable use</h2>
      <p className="leading-relaxed">You agree NOT to use Descon Fleet to:</p>
      <ul className="leading-relaxed list-disc pl-6 space-y-1.5">
        <li>Post content that violates the destination platform&apos;s rules (Instagram Community Guidelines, TikTok Community Guidelines, Facebook Community Standards).</li>
        <li>Publish hate speech, harassment, sexual content involving minors, terrorism-promoting material, or anything illegal in your jurisdiction.</li>
        <li>Spam — high-volume posting designed to manipulate engagement metrics or game algorithmic distribution.</li>
        <li>Impersonate another person or brand without authorization.</li>
        <li>Reverse-engineer, scrape, or attempt to bypass authentication, rate limits, or content moderation on the dashboard.</li>
        <li>Resell access to the dashboard or operate it on behalf of unauthorized third parties.</li>
      </ul>
      <p className="leading-relaxed">
        We may suspend or terminate accounts that violate this section without
        prior notice.
      </p>

      <h2 className="font-display text-xl mt-10 mb-3">5. Social platform terms</h2>
      <p className="leading-relaxed">
        When you publish to Instagram, TikTok, or Facebook through Descon Fleet,
        you remain subject to each platform&apos;s own terms and community
        guidelines:
      </p>
      <ul className="leading-relaxed list-disc pl-6 space-y-1.5">
        <li>
          Meta:{" "}
          <a
            href="https://www.facebook.com/legal/terms"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Meta Terms of Service
          </a>
        </li>
        <li>
          TikTok:{" "}
          <a
            href="https://www.tiktok.com/legal/page/us/terms-of-service/en"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            TikTok Terms of Service
          </a>
        </li>
      </ul>

      <h2 className="font-display text-xl mt-10 mb-3">6. Service availability</h2>
      <ul className="leading-relaxed list-disc pl-6 space-y-1.5">
        <li>We aim for high availability but make no uptime guarantee.</li>
        <li>
          Publishing depends on third-party platform APIs (Meta, TikTok).
          If those platforms experience outages, your publishes may queue,
          fail, or be delayed; we&apos;ll show the platform&apos;s error in
          the dashboard so you know what happened.
        </li>
        <li>
          We may release breaking changes, retire features, or modify these
          terms with notice (banner on the dashboard or email).
        </li>
      </ul>

      <h2 className="font-display text-xl mt-10 mb-3">7. Disclaimers</h2>
      <p className="leading-relaxed">
        The service is provided &ldquo;as is.&rdquo; We don&apos;t guarantee
        that posts will perform well, that AI-generated hooks will go viral,
        or that connected platforms will keep their APIs stable. You use the
        service at your own discretion.
      </p>

      <h2 className="font-display text-xl mt-10 mb-3">8. Limit of liability</h2>
      <p className="leading-relaxed">
        To the maximum extent allowed by law, Descon Fleet is not liable for
        indirect, incidental, or consequential damages arising from your use
        of the service. Our total liability, if any, is limited to the amount
        you paid us in the past 12 months (currently zero for free-tier
        users).
      </p>

      <h2 className="font-display text-xl mt-10 mb-3">9. Termination</h2>
      <p className="leading-relaxed">
        You can delete your account at any time by emailing{" "}
        <code>hello@creator-os-delta.vercel.app</code>. We can suspend or
        terminate accounts that violate Section 4 (Acceptable use) or that
        we reasonably believe pose a security or legal risk.
      </p>

      <h2 className="font-display text-xl mt-10 mb-3">10. Governing law</h2>
      <p className="leading-relaxed">
        These terms are governed by the laws of the user&apos;s country of
        residence unless otherwise required by mandatory local law. Disputes
        we can&apos;t resolve directly go to the courts of the user&apos;s
        country of residence.
      </p>

      <h2 className="font-display text-xl mt-10 mb-3">11. Changes</h2>
      <p className="leading-relaxed">
        If we change these terms materially, we&apos;ll update the date at the
        top and notify you via the dashboard. Continued use after the update
        means you accept the new terms.
      </p>

      <h2 className="font-display text-xl mt-10 mb-3">12. Contact</h2>
      <p className="leading-relaxed">
        Questions, complaints, or legal requests:{" "}
        <a
          href="mailto:hello@creator-os-delta.vercel.app"
          className="text-[var(--color-blush-deep)] hover:underline"
        >
          hello@creator-os-delta.vercel.app
        </a>
      </p>

      <hr className="my-12 border-[var(--color-border)]" />
      <p className="text-sm text-[var(--color-muted)]">
        See also: <a href="/privacy" className="underline">Privacy Policy</a> ·{" "}
        <a href={BRAND} className="underline">Home</a>
      </p>
    </article>
  );
}
