import { prisma } from "@/lib/db";
import { safe } from "@/lib/safe";
import { tryGetUser } from "@/lib/auth-helpers";
import { Composer, type InitialDraft } from "./composer";
import type { Platform } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string; prefill?: string; mediaUrl?: string }>;
}) {
  const sp = await searchParams;
  const userId = (await tryGetUser()) ?? undefined;

  // Allowlist mediaUrl: only http(s) URLs are accepted. This is reflected
  // into form state on the client, so untrusted upstream content (e.g. a
  // crafted link in a phishing email) can't smuggle a `javascript:` URL
  // or other non-http scheme into the composer.
  const initialMediaUrl =
    sp.mediaUrl && /^https?:\/\//i.test(sp.mediaUrl) ? sp.mediaUrl : null;

  const accounts = userId
    ? await safe(
        () =>
          prisma.socialAccount.findMany({
            where: { userId, isActive: true },
            select: { platform: true },
          }),
        [],
      )
    : [];
  const connected = [...new Set(accounts.map((a) => a.platform))] as Platform[];

  // ─── Optional: hydrate from an existing draft (?draft=<id>) ────
  // Used by the dashboard "Fix" button to drop the user into Compose with
  // viral variants pre-loaded. Ownership is verified before hydrating.
  // If the draft ID was passed but no row matched (deleted, wrong user,
  // demo placeholder ID like "s1"), we surface that explicitly instead
  // of rendering an empty composer that looks broken.
  let initialDraft: InitialDraft | undefined;
  let draftNotFound = false;
  if (sp.draft && userId) {
    const d = await safe(
      () =>
        prisma.draft.findFirst({
          where: { id: sp.draft, userId },
          select: {
            id: true,
            caption: true,
            hashtags: true,
            hookOptions: true,
            selectedHook: true,
            mediaUrl: true,
            platforms: true,
            scheduledFor: true,
          },
        }),
      null,
      "load-draft",
    );
    if (d) {
      initialDraft = {
        id: d.id,
        caption: d.caption ?? "",
        hashtags: d.hashtags ?? [],
        hookOptions: (d.hookOptions as unknown as InitialDraft["hookOptions"]) ?? [],
        selectedHook: d.selectedHook,
        mediaUrl: d.mediaUrl,
        platforms: d.platforms ?? [],
        scheduledFor: d.scheduledFor ? d.scheduledFor.toISOString().slice(0, 16) : "",
      };
    } else {
      draftNotFound = true;
    }
  }

  return (
    <div className="px-8 py-10 max-w-6xl">
      <h1 className="text-3xl font-semibold tracking-tight">Compose</h1>
      <p className="text-[var(--color-muted)] mt-1 mb-4">
        {initialDraft
          ? "Loaded from your dashboard fix. Pick the strongest variant, tweak, then publish."
          : `Write once, predict the hook, publish to ${connected.length || "your"} connected ${connected.length === 1 ? "platform" : "platforms"}.`}
      </p>
      {draftNotFound && (
        <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-lg px-4 py-3">
          <strong>Draft not found.</strong> The post you tried to open was
          either deleted, doesn&apos;t belong to your account, or was a demo
          placeholder. The form below is empty so you can start a new post —
          or head back to{" "}
          <a href="/drafts" className="underline font-medium">
            /drafts
          </a>{" "}
          to pick a real one.
        </div>
      )}
      <Composer
        connectedPlatforms={connected}
        initialDraft={initialDraft}
        initialCaptionPrefill={sp.prefill ?? null}
        initialMediaUrl={initialMediaUrl}
      />
    </div>
  );
}
