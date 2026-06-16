"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deletePost } from "./actions";

/** Two-click confirm delete for a daily-post guide card. First click arms
 *  the confirmation (turns red), second click fires the server action and
 *  the card disappears on revalidate. Lives on top of the card's overlay
 *  link, so clicks here never navigate into the editor. */
export function DeleteGuideButton({
  slug,
  title,
  className = "",
}: {
  slug: string;
  title: string;
  className?: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const handleClick = (e: React.MouseEvent) => {
    // Belt-and-suspenders: never let the click bubble to the card's
    // overlay <Link> and navigate away mid-delete.
    e.preventDefault();
    e.stopPropagation();
    setErr(null);
    if (!confirm) {
      setConfirm(true);
      // Auto-disarm after 5s so a stray first click doesn't stay armed.
      setTimeout(() => setConfirm(false), 5000);
      return;
    }
    start(async () => {
      try {
        const res = await deletePost(slug);
        if (!res.ok) {
          const msg = res.error ?? "Delete failed";
          setErr(msg);
          // Make a server-side failure VISIBLE instead of dying silently in
          // a tooltip — this is why "delete does nothing" went unnoticed.
          if (typeof window !== "undefined") {
            window.alert(`Couldn't delete "${title}": ${msg}`);
          }
        } else {
          // Force the queue to re-fetch. revalidatePath alone sometimes
          // doesn't repaint the client list, leaving the deleted card on
          // screen — which reads as "delete didn't work."
          router.refresh();
        }
      } catch (e2) {
        const msg = (e2 as Error)?.message ?? "Delete failed";
        setErr(msg);
        if (typeof window !== "undefined") {
          window.alert(`Couldn't delete "${title}": ${msg}`);
        }
      } finally {
        setConfirm(false);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title={
        err
          ? err
          : confirm
            ? `Click again to delete "${title}"`
            : `Delete "${title}"`
      }
      aria-label={confirm ? `Confirm delete ${title}` : `Delete ${title}`}
      className={
        "inline-flex items-center gap-1 rounded-md text-[10px] font-semibold uppercase tracking-wider transition " +
        (confirm
          ? "bg-red-600 text-white hover:bg-red-700 px-2 py-1"
          : "bg-white/80 text-[var(--color-muted)] hover:text-red-700 hover:bg-red-50 border border-[var(--color-border)] p-1.5 backdrop-blur-sm") +
        " " +
        className
      }
    >
      <Trash2 className="w-3.5 h-3.5 shrink-0" />
      {busy ? "Deleting…" : confirm ? "Delete?" : ""}
    </button>
  );
}
