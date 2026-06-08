"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarClock, Trash2, Send } from "lucide-react";
import { deleteDraft, publishDraftNow, scheduleDraft } from "../compose/actions";
import { TikTokCaptionQr } from "@/components/tiktok-caption-qr";

type CarouselDraft = {
  id: string;
  caption: string;
  selectedHook: string | null;
  imageCount: number;
  firstImage: string | null;
  platforms: string[];
  status: string;
  scheduledFor: string | null;
  updatedAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
  SCHEDULED: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  PUBLISHING: "bg-purple-500/10 text-purple-300 border-purple-500/30",
  PUBLISHED: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  FAILED: "bg-red-500/10 text-red-300 border-red-500/30",
};

export function CarouselTracker({ drafts }: { drafts: CarouselDraft[] }) {
  const router = useRouter();

  const active = drafts.filter((d) => ["DRAFT", "SCHEDULED", "PUBLISHING"].includes(d.status));
  const posted = drafts.filter((d) => ["PUBLISHED", "FAILED"].includes(d.status));
  const [showPosted, setShowPosted] = useState(false);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">
        Queue
        <span className="ml-2 text-sm font-normal text-[var(--color-muted)]">{active.length} active</span>
      </h2>

      {active.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center text-sm text-[var(--color-muted)]">
          No carousels queued. Create one below.
        </div>
      ) : (
        <div className="space-y-2">
          {active.map((d) => (
            <CarouselRow key={d.id} draft={d} onRefresh={() => router.refresh()} />
          ))}
        </div>
      )}

      {posted.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowPosted((o) => !o)}
            className="flex items-center gap-2 text-sm font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)] transition"
          >
            <span className={`transition-transform ${showPosted ? "rotate-90" : ""}`}>▸</span>
            Posted ({posted.length})
          </button>
          {showPosted && (
            <div className="mt-2 space-y-2 opacity-75">
              {posted.map((d) => (
                <CarouselRow key={d.id} draft={d} onRefresh={() => router.refresh()} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CarouselRow({ draft, onRefresh }: { draft: CarouselDraft; onRefresh: () => void }) {
  const [scheduleInput, setScheduleInput] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [busy, setBusy] = useState(false);
  // When TikTok is a target we keep the row mounted after publishing so the
  // caption QR stays visible (a refresh would move the row to "Posted" and
  // unmount it). The "Done" button refreshes once the user has the caption.
  const [ttPublished, setTtPublished] = useState(false);

  const preview = (draft.selectedHook ?? draft.caption ?? "").slice(0, 80);

  async function handlePublish() {
    setBusy(true);
    try {
      await publishDraftNow(draft.id);
      if (draft.platforms.includes("TIKTOK")) {
        setTtPublished(true); // show QR, defer refresh so the row stays
      } else {
        onRefresh();
      }
    } catch {} finally { setBusy(false); }
  }

  async function handleSchedule() {
    if (!scheduleInput) return;
    setBusy(true);
    try {
      await scheduleDraft(draft.id, scheduleInput);
      setShowSchedule(false);
      onRefresh();
    } catch {} finally { setBusy(false); }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await deleteDraft(draft.id);
      onRefresh();
    } catch {} finally { setBusy(false); }
  }

  return (
    <div className="space-y-2">
    <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      {/* Thumbnail */}
      {draft.firstImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={draft.firstImage}
          alt=""
          className="w-12 h-12 rounded object-cover border border-[var(--color-border)] shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded bg-[var(--color-surface)] border border-[var(--color-border)] grid place-items-center text-[10px] text-[var(--color-muted)] shrink-0">
          {draft.imageCount}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{preview || "(no caption)"}</div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--color-muted)]">
          <span>{draft.imageCount} slides</span>
          <span className={`rounded border px-1.5 py-0.5 font-semibold uppercase ${STATUS_COLORS[draft.status] ?? ""}`}>
            {draft.status}
          </span>
          {draft.scheduledFor && (
            <span className="flex items-center gap-1">
              <CalendarClock className="w-3 h-3" />
              {new Date(draft.scheduledFor).toLocaleString()}
            </span>
          )}
          <span>{new Date(draft.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {draft.status === "DRAFT" && (
          <>
            <button
              type="button"
              onClick={() => setShowSchedule((o) => !o)}
              disabled={busy}
              className="p-1.5 rounded hover:bg-[var(--color-border)] text-[var(--color-muted)] hover:text-amber-300 transition"
              title="Schedule"
            >
              <CalendarClock className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={busy}
              className="p-1.5 rounded hover:bg-[var(--color-border)] text-[var(--color-muted)] hover:text-emerald-300 transition"
              title="Publish now"
            >
              <Send className="w-4 h-4" />
            </button>
          </>
        )}
        {["DRAFT", "SCHEDULED", "FAILED"].includes(draft.status) && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="p-1.5 rounded hover:bg-[var(--color-border)] text-[var(--color-muted)] hover:text-red-400 transition"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Schedule popover */}
      {showSchedule && (
        <div className="absolute mt-1 right-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl p-3 z-20 w-72">
          <label className="block text-[10px] uppercase tracking-wider text-[var(--color-muted)] mb-1">
            Schedule for
          </label>
          <input
            type="datetime-local"
            value={scheduleInput}
            onChange={(e) => setScheduleInput(e.target.value)}
            min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] outline-none text-sm mb-2"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSchedule}
              disabled={!scheduleInput || busy}
              className="flex-1 rounded-lg bg-amber-500/20 text-amber-200 border border-amber-500/40 px-3 py-1.5 text-xs font-semibold hover:bg-amber-500/30 disabled:opacity-50"
            >
              {busy ? "Scheduling..." : "Schedule"}
            </button>
            <button
              type="button"
              onClick={() => setShowSchedule(false)}
              className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] px-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>

    {ttPublished && (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-semibold text-emerald-300">
            ✓ Published — grab your TikTok caption:
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="text-[11px] underline text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            Done
          </button>
        </div>
        <TikTokCaptionQr draftId={draft.id} caption={draft.caption} autoOpen />
      </div>
    )}
    </div>
  );
}
