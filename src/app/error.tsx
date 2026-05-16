"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log so we surface in dev console / Vercel logs
    console.error("[root error]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          Something broke.
        </h1>
        <p className="text-sm text-[var(--color-muted)] mb-5">
          {error.message?.slice(0, 240) ||
            "We hit an unexpected error rendering this page."}
          {error.digest && (
            <span className="block mt-1 text-[11px] opacity-70">
              ref: {error.digest}
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          <button
            onClick={reset}
            className="bg-[var(--color-accent)] text-[var(--color-text-on-dark)] hover:opacity-90 rounded-lg px-4 py-2 text-sm font-medium"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] rounded-lg px-4 py-2 text-sm font-medium"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
