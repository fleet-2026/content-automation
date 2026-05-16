"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Platform = "INSTAGRAM" | "YOUTUBE" | "TIKTOK";

export function ConnectButton({
  platform,
  connected,
}: {
  platform: Platform;
  connected: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const slug = platform.toLowerCase();

  if (!connected) {
    return (
      <a
        href={`/api/connect/${slug}`}
        className="text-xs mt-3 inline-block px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-black font-medium hover:opacity-90"
      >
        Connect
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-3">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await fetch(`/api/sync/${slug}`, { method: "POST" });
          setBusy(false);
          if (res.ok) router.refresh();
        }}
        className="text-xs px-3 py-1.5 rounded-md bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] disabled:opacity-50"
      >
        {busy ? "Syncing…" : "Sync now"}
      </button>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            await fetch(`/api/disconnect/${slug}`, { method: "POST" });
            router.refresh();
          })
        }
        className="text-xs px-3 py-1.5 rounded-md text-[var(--color-muted)] hover:text-red-800"
      >
        Disconnect
      </button>
    </div>
  );
}
