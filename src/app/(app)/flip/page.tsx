import { Suspense } from "react";
import { FlipUI } from "./flip-ui";

export const dynamic = "force-dynamic";

export default function FlipPage() {
  return (
    <div className="px-8 py-10 max-w-5xl">
      <h1 className="font-display text-3xl sm:text-4xl">
        <span className="font-italic-accent text-blush">Flip</span> anything.
      </h1>
      <p className="text-[var(--color-muted)] mt-1 mb-8">
        Paste any viral post → get a flipped script, hooks, and AI image / video
        prompts. Powered by FlipIt.
      </p>
      <Suspense fallback={<div className="text-sm text-[var(--color-muted)]">Loading…</div>}>
        <FlipUI />
      </Suspense>
    </div>
  );
}
