import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { tryGetUser } from "@/lib/auth-helpers";
import { listAllGuidesAdmin } from "@/lib/guides";
import { ScriptCard } from "./script-card";

export const metadata: Metadata = {
  title: "All scripts — Daily Post",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * One-page list of every guide's talking-head script with copy buttons.
 *
 * Designed for the recording session: scroll, copy the script, record
 * the talking head on phone, upload, run the Remotion edit. No
 * navigation per guide needed.
 *
 * Scripts are ordered by guide.index (recording order) — so you can
 * work through them sequentially.
 */
export default async function AllScriptsPage() {
  const userId = await tryGetUser();
  if (!userId) redirect("/login");

  const guides = await listAllGuidesAdmin();
  // Sort by index ascending (post #1 first), guides without an index land at end
  const sorted = [...guides].sort((a, b) => {
    if (a.index == null && b.index == null) return 0;
    if (a.index == null) return 1;
    if (b.index == null) return -1;
    return a.index - b.index;
  });
  const withScript = sorted.filter((g) => g.script.trim().length > 0);

  return (
    <div className="px-8 py-10 max-w-4xl mx-auto">
      <div className="mb-6 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">
            All <span className="font-italic-accent text-blush">scripts.</span>
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {withScript.length} ready-to-record scripts · ordered by index
          </p>
        </div>
        <Link
          href="/daily-post"
          className="text-xs underline text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          ← Back to daily post
        </Link>
      </div>

      <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm leading-relaxed">
        <strong>Recording workflow:</strong> Click <em>Copy script</em> on any
        card → record yourself reading it on phone (vertical 9:16, 60-90 sec)
        → upload the MP4 to that guide&apos;s editor → run{" "}
        <code className="text-xs font-mono">
          npx tsx scripts/render-guide-reel.ts --slug=&lt;slug&gt;
        </code>{" "}
        → done. Pipeline adds captions, B-roll, logos automatically.
      </div>

      <div className="space-y-6">
        {withScript.map((g) => (
          <ScriptCard
            key={g.slug}
            index={g.index ?? null}
            slug={g.slug}
            title={g.title}
            hook={g.hook}
            script={g.script}
            isPublished={g.isPublished}
          />
        ))}
      </div>
    </div>
  );
}
