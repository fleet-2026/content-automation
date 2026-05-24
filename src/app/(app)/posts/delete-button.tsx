"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deletePost } from "./actions";

/** Two-click confirm delete for a synced Post. First click arms the
 *  confirmation, second click fires the server action. On success,
 *  the page revalidates and the post disappears. */
export function DeletePostButton({ postId, platform }: { postId: string; platform: string }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const handleClick = () => {
    setMsg(null);
    if (!confirm) {
      setConfirm(true);
      // Auto-disarm after 4s so an accidental first click doesn't stay
      // armed forever.
      setTimeout(() => setConfirm(false), 4000);
      return;
    }
    start(async () => {
      const res = await deletePost(postId);
      if (!res.ok) {
        setMsg(res.error ?? "delete failed");
      } else if (res.error) {
        // Partial success — local row deleted but platform-side delete
        // wasn't possible (e.g. Instagram).
        setMsg(res.error);
      }
      setConfirm(false);
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        title={
          confirm
            ? `Click again to delete this ${platform.toLowerCase()} post`
            : `Delete this ${platform.toLowerCase()} post`
        }
        className={
          "text-xs px-2.5 py-1 rounded-md inline-flex items-center gap-1.5 transition font-medium " +
          (confirm
            ? "bg-red-600 text-white hover:bg-red-700"
            : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200")
        }
      >
        <Trash2 className="w-3.5 h-3.5" />
        {busy ? "Deleting…" : confirm ? "Confirm delete" : "Delete"}
      </button>
      {msg && (
        <p className="text-[10px] text-amber-700 max-w-[200px] text-right leading-tight">
          {msg}
        </p>
      )}
    </div>
  );
}
