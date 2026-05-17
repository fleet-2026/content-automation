"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Edit,
  Images,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { parseMediaUrls } from "@/lib/media-urls";
import {
  type DemoAutomation,
  type DemoRecurringSlot,
} from "@/lib/demo-data";
import { publishDraftNow, deleteDraft } from "../compose/actions";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PLATFORM_COLORS: Record<string, string> = {
  INSTAGRAM: "bg-pink-500/15 text-pink-800 border-pink-500/30",
  TIKTOK: "bg-purple-500/15 text-purple-800 border-purple-500/30",
  YOUTUBE: "bg-red-500/15 text-red-800 border-red-500/30",
};

// Loose extension check matches the drafts page + composer so R2 signed
// URLs with `?X-Amz-Signature=...` classify correctly.
const IMG_RE = /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i;

// ─── Unified item shape ───────────────────────────────────────────────
// `isReal: true` means it's backed by a real Draft row that can be edited,
// published, or deleted. Demo placeholders have `isReal: false` and skip
// those actions — they show up only when the user has zero real drafts.
export type ScheduledItem = {
  id: string;
  isReal: boolean;
  scheduledAt: Date;
  hookText: string;
  caption: string;
  mediaUrl: string | null;
  platforms: ("INSTAGRAM" | "TIKTOK" | "YOUTUBE")[];
  status: "SCHEDULED" | "DRAFT" | "PUBLISHING" | "PUBLISHED" | "FAILED" | "APPROVED";
  mediaType: "VIDEO" | "REEL" | "SHORT" | "IMAGE" | "TEXT" | "CAROUSEL" | "STORY";
};

export function ScheduleUI({
  scheduled,
  recurring,
  automations,
}: {
  scheduled: ScheduledItem[];
  recurring: DemoRecurringSlot[];
  automations: DemoAutomation[];
}) {
  const [slots, setSlots] = useState(recurring);
  const [autos, setAutos] = useState(automations);

  // ─── Day buckets ────────────────────────────────────────────────────
  // Compute today at local midnight and step forward by exact 24-hour
  // increments. Using setDate(getDate()+i) rather than millisecond addition
  // sidesteps DST transitions (where a "24h later" day would otherwise be
  // 23h or 25h). The day labels are then derived from the resulting Date
  // object, so they always match the row's actual calendar date — no
  // possibility of "Monday" being labeled "today" when today is Sunday.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = isoDate(today);

  const days: {
    date: Date;
    items: ScheduledItem[];
    recurringHere: DemoRecurringSlot[];
  }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const items = scheduled.filter((s) => sameDay(s.scheduledAt, d));
    const recurringHere = slots.filter((r) => r.active && r.dayMask.includes(d.getDay()));
    days.push({ date: d, items, recurringHere });
  }

  return (
    <div className="space-y-10">
      {/* ─── Calendar / next 14 days ─── */}
      <section>
        <SectionHeader
          icon={CalendarClock}
          title="Posting calendar"
          subtitle="Next 14 days. Edit, publish, or remove anything you've scheduled."
        />
        <ol className="space-y-2">
          {days.map((d, idx) => {
            const isToday = isoDate(d.date) === todayKey;
            const isTomorrow = idx === 1;
            return (
              <li
                key={idx}
                className={
                  "border rounded-xl bg-[var(--color-surface)] p-4 flex flex-col sm:flex-row gap-4 " +
                  (isToday ? "ring-2 ring-[var(--color-accent)]/60" : "")
                }
              >
                <div className="sm:w-32 shrink-0">
                  <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
                    {DAY_LABELS[d.date.getDay()]}
                  </div>
                  <div className="text-2xl font-semibold mt-0.5">
                    {d.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                  {isToday && (
                    <span className="inline-block mt-1.5 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-medium">
                      Today
                    </span>
                  )}
                  {isTomorrow && (
                    <span className="inline-block mt-1.5 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-muted)]">
                      Tomorrow
                    </span>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  {d.items.length === 0 && d.recurringHere.length === 0 ? (
                    <Link
                      href={`/compose?scheduledFor=${encodeURIComponent(d.date.toISOString())}`}
                      className="block w-full text-left text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] border border-dashed rounded-lg px-3 py-3"
                    >
                      + Nothing scheduled — add a post
                    </Link>
                  ) : (
                    <>
                      {d.items.map((it) => (
                        <ScheduledCard key={it.id} item={it} />
                      ))}
                      {/* Recurring "ghost" slots not yet filled by a real draft */}
                      {d.recurringHere
                        .filter(
                          (r) =>
                            !d.items.some((it) => {
                              const itHour = it.scheduledAt.getHours();
                              const itMin = it.scheduledAt.getMinutes();
                              return itHour === r.hour && itMin === r.minute;
                            }),
                        )
                        .map((r) => (
                          <GhostSlotCard key={r.id} slot={r} />
                        ))}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ─── Recurring slots ─── */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <SectionHeader
            icon={Repeat}
            title="Recurring posting slots"
            subtitle="Define the times you always want to post. Drafts auto-fill into matching slots."
          />
          <button className="text-xs px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-medium inline-flex items-center gap-1 hover:opacity-90">
            <Plus className="w-3 h-3" /> Add slot
          </button>
        </div>
        <ul className="space-y-2">
          {slots.map((s) => (
            <li
              key={s.id}
              className="border rounded-xl bg-[var(--color-surface)] p-4 flex items-center gap-4"
            >
              <button
                onClick={() =>
                  setSlots((cur) => cur.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x)))
                }
                className={
                  "w-10 h-6 rounded-full relative transition shrink-0 " +
                  (s.active ? "bg-[var(--color-accent)]" : "bg-[var(--color-surface-2)]")
                }
                aria-label={s.active ? "Pause slot" : "Activate slot"}
              >
                <span
                  className={
                    "absolute top-0.5 w-5 h-5 rounded-full bg-white transition " +
                    (s.active ? "left-[18px]" : "left-0.5")
                  }
                />
              </button>

              <div className="flex-1 min-w-0">
                <div className="font-medium">{s.label}</div>
                <div className="text-xs text-[var(--color-muted)] mt-0.5 flex flex-wrap items-center gap-2">
                  <span>{formatDays(s.dayMask)}</span>
                  <span>·</span>
                  <span>
                    {String(s.hour).padStart(2, "0")}:{String(s.minute).padStart(2, "0")}
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    {s.platforms.map((p) => (
                      <span
                        key={p}
                        className={"text-[10px] px-1.5 py-0.5 rounded border " + (PLATFORM_COLORS[p] ?? "")}
                      >
                        {p.toLowerCase()}
                      </span>
                    ))}
                  </span>
                </div>
              </div>

              <button
                className="text-[var(--color-muted)] hover:text-red-800 p-1.5"
                aria-label="Remove slot"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ─── Background automations ─── */}
      <section>
        <SectionHeader
          icon={Sparkles}
          title="Background automations"
          subtitle="Cron jobs and event triggers. Toggle off to pause."
        />
        <ul className="space-y-2">
          {autos.map((a) => (
            <li
              key={a.id}
              className="border rounded-xl bg-[var(--color-surface)] p-4 flex items-start gap-4"
            >
              <button
                onClick={() =>
                  setAutos((cur) =>
                    cur.map((x) => (x.id === a.id ? { ...x, active: !x.active } : x)),
                  )
                }
                className={
                  "w-10 h-6 rounded-full relative transition shrink-0 mt-0.5 " +
                  (a.active ? "bg-[var(--color-accent)]" : "bg-[var(--color-surface-2)]")
                }
                aria-label={a.active ? "Pause automation" : "Activate automation"}
              >
                <span
                  className={
                    "absolute top-0.5 w-5 h-5 rounded-full bg-white transition " +
                    (a.active ? "left-[18px]" : "left-0.5")
                  }
                />
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{a.name}</span>
                  <CategoryBadge category={a.category} />
                </div>
                <p className="text-xs text-[var(--color-muted)] mt-1">{a.description}</p>
                <div className="text-[11px] text-[var(--color-muted)] mt-2 flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {a.schedule}
                  </span>
                  <span className="flex items-center gap-1">
                    {a.lastStatus === "success" ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-800" />
                    ) : (
                      <Pause className="w-3 h-3 text-amber-800" />
                    )}
                    last run {timeAgo(a.lastRunAt)}
                  </span>
                </div>
              </div>

              <button
                className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] px-2 py-1 rounded inline-flex items-center gap-1 shrink-0"
                title="Run now"
              >
                {a.active ? <RefreshCw className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                Run
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ─── Scheduled card ───────────────────────────────────────────────────
function ScheduledCard({ item }: { item: ScheduledItem }) {
  const router = useRouter();
  const [publishing, startPub] = useTransition();
  const [deleting, startDel] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // mediaUrl may be a newline-packed carousel — pull primary + count.
  const allMediaUrls = parseMediaUrls(item.mediaUrl);
  const primary = allMediaUrls[0] ?? null;
  const isImage = primary ? IMG_RE.test(primary) : false;
  const isCarousel = allMediaUrls.length > 1;
  const canPublish =
    item.isReal &&
    (item.status === "SCHEDULED" ||
      item.status === "DRAFT" ||
      item.status === "FAILED" ||
      item.status === "APPROVED");
  const canDelete = item.isReal && item.status !== "PUBLISHING";

  function onPublish() {
    if (item.platforms.length === 0) {
      setErr("Pick at least one platform first (Edit → Platforms).");
      return;
    }
    if (
      !confirm(
        `Publish now to ${item.platforms.join(", ")}? Posts to your live accounts.`,
      )
    )
      return;
    setErr(null);
    startPub(async () => {
      try {
        await publishDraftNow(item.id);
        router.refresh();
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      }
    });
  }

  function onDelete() {
    if (!confirm("Delete this scheduled draft? This cannot be undone.")) return;
    setErr(null);
    startDel(async () => {
      try {
        await deleteDraft(item.id);
        router.refresh();
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      }
    });
  }

  return (
    <div className="border rounded-lg bg-[var(--color-surface-2)] p-3">
      <div className="flex items-start gap-3">
        {/* Image thumbnail — same robust regex used elsewhere so signed
            URLs render correctly. Falls back to a media pill for videos.
            Multi-image carousels get a small "+N" badge so the intent is
            visible without expanding the card. */}
        {primary && isImage ? (
          <div className="relative w-16 h-16 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={primary}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-16 h-16 object-cover rounded-md bg-[var(--color-surface)]"
            />
            {isCarousel && (
              <span className="absolute top-0.5 right-0.5 inline-flex items-center gap-0.5 text-[9px] bg-black/70 text-white rounded px-1 py-0.5 font-medium">
                <Images className="w-2.5 h-2.5" />+{allMediaUrls.length - 1}
              </span>
            )}
          </div>
        ) : primary ? (
          <div className="w-16 h-16 grid place-items-center text-[10px] uppercase tracking-wider text-[var(--color-muted)] rounded-md bg-[var(--color-surface)] shrink-0">
            {item.mediaType.toLowerCase()}
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="text-xs text-[var(--color-muted)] flex items-center flex-wrap gap-2">
            <Clock className="w-3 h-3" />
            {item.scheduledAt.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
            <span>·</span>
            <span className="lowercase">{item.mediaType}</span>
            <span>·</span>
            <StatusBadge status={item.status} />
            {!item.isReal && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                demo
              </span>
            )}
          </div>
          {item.hookText && (
            <p className="font-medium leading-snug mt-1">&ldquo;{item.hookText}&rdquo;</p>
          )}
          <p className="text-xs text-[var(--color-muted)] mt-1 line-clamp-2">{item.caption}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {item.platforms.map((p) => (
              <span
                key={p}
                className={"text-[10px] px-1.5 py-0.5 rounded border " + (PLATFORM_COLORS[p] ?? "")}
              >
                {p.toLowerCase()}
              </span>
            ))}
          </div>

          {err && (
            <p className="mt-2 text-xs text-red-700" role="alert">
              {err}
            </p>
          )}
        </div>
      </div>

      {/* Demo cards get a "Use as template" link so the user isn't stuck —
          a click prefills /compose with the demo's hook + caption text and
          lets them start a real draft from it. No /compose?draft=s1 (which
          would 404 since demo IDs aren't real Draft rows). */}
      {!item.isReal && (
        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-[var(--color-border)]">
          <Link
            href={`/compose?prefill=${encodeURIComponent(
              item.hookText ? `${item.hookText}\n\n${item.caption}` : item.caption,
            )}`}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-medium"
          >
            <Edit className="w-3 h-3" /> Use as template
          </Link>
          <span className="text-[10px] text-[var(--color-muted)] ml-2">
            Demo post — make it real to edit
          </span>
        </div>
      )}

      {/* Real-draft action row. */}
      {item.isReal && (
        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-[var(--color-border)]">
          <Link
            href={`/compose?draft=${item.id}`}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md bg-[var(--color-surface)] hover:bg-[var(--color-border)] font-medium"
          >
            <Edit className="w-3 h-3" /> Edit
          </Link>
          {canPublish && (
            <button
              type="button"
              onClick={onPublish}
              disabled={publishing}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-medium disabled:opacity-50"
            >
              <Send className="w-3 h-3" />
              {publishing ? "Publishing…" : "Publish now"}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md text-red-700 hover:bg-red-50 font-medium disabled:opacity-50 ml-auto"
            >
              <Trash2 className="w-3 h-3" />
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function GhostSlotCard({ slot }: { slot: DemoRecurringSlot }) {
  return (
    <div className="border border-dashed rounded-lg px-3 py-2.5 flex items-center gap-3">
      <Clock className="w-3.5 h-3.5 text-[var(--color-muted)] shrink-0" />
      <div className="text-xs text-[var(--color-muted)] flex-1 min-w-0">
        <span className="font-medium text-[var(--color-text)]">
          {String(slot.hour).padStart(2, "0")}:{String(slot.minute).padStart(2, "0")}
        </span>
        {" — "}
        Recurring slot ({slot.label}) needs a draft
      </div>
      <Link
        href="/compose"
        className="text-xs text-[var(--color-accent)] hover:underline shrink-0"
      >
        + Fill
      </Link>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: "text-[var(--color-muted)]",
    APPROVED: "text-blue-800",
    SCHEDULED: "text-amber-800",
    PUBLISHING: "text-purple-800",
    PUBLISHED: "text-emerald-800",
    FAILED: "text-red-800",
  };
  return (
    <span className={"uppercase tracking-wider text-[10px] " + (colors[status] ?? "")}>
      {status.toLowerCase()}
    </span>
  );
}

function CategoryBadge({ category }: { category: DemoAutomation["category"] }) {
  const colors: Record<string, string> = {
    ingestion: "bg-blue-500/15 text-blue-800 border-blue-500/30",
    ai: "bg-emerald-500/15 text-emerald-800 border-emerald-500/30",
    publish: "bg-amber-500/15 text-amber-800 border-amber-500/30",
    intel: "bg-purple-500/15 text-purple-800 border-purple-500/30",
  };
  return (
    <span className={"text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border " + (colors[category] ?? "")}>
      {category}
    </span>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-[var(--color-muted)]" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          {title}
        </h2>
      </div>
      {subtitle && <p className="text-xs text-[var(--color-muted)] mt-1">{subtitle}</p>}
    </div>
  );
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ISO local-date key used to identify "today" without comparing time parts.
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDays(mask: number[]): string {
  if (mask.length === 7) return "Daily";
  if (mask.length === 5 && [1, 2, 3, 4, 5].every((d) => mask.includes(d))) return "Weekdays";
  if (mask.length === 2 && mask.includes(0) && mask.includes(6)) return "Weekends";
  return mask.map((d) => DAY_LABELS[d]).join(" · ");
}

function timeAgo(d: Date): string {
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
