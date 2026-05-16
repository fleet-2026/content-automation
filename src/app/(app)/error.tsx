"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <div className="px-8 py-10 max-w-3xl">
      <div className="border border-red-300 bg-red-50 text-red-900 rounded-xl p-6">
        <div className="flex items-start gap-3 mb-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <h2 className="font-semibold mb-1">Something went wrong on this page.</h2>
            <p className="text-sm leading-relaxed">
              {error.message?.slice(0, 320) ||
                "An unexpected error occurred while rendering."}
              {error.digest && (
                <span className="block mt-1 text-[11px] opacity-70">
                  ref: {error.digest}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={reset}
            className="bg-red-900 text-white hover:opacity-90 rounded-md px-3 py-1.5 text-xs font-medium"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="bg-white border border-red-300 text-red-900 rounded-md px-3 py-1.5 text-xs font-medium"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
