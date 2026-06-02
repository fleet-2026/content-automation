"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const NEXT_ACTION: Record<string, { action: string; label: string } | null> = {
  REQUESTED: { action: "assign", label: "Assign driver" },
  ASSIGNED: { action: "start", label: "Start trip" },
  EN_ROUTE: { action: "start", label: "Start trip" },
  IN_PROGRESS: { action: "complete", label: "Complete" },
  COMPLETED: null,
  CANCELLED: null,
};

export function TripActions({ tripId, status }: { tripId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const next = NEXT_ACTION[status];

  async function run(action: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error ?? "Action failed");
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!next) return <span className="muted">—</span>;

  return (
    <span style={{ display: "inline-flex", gap: 8 }}>
      <button className="btn" disabled={busy} onClick={() => run(next.action)}>
        {busy ? "…" : next.label}
      </button>
      <button className="btn ghost" disabled={busy} onClick={() => run("cancel")}>
        Cancel
      </button>
    </span>
  );
}
