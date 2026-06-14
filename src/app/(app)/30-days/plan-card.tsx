import type { PlanDay } from "./plan";

/** Presentational card for a single day of the 30-day plan. Mirrors the
 *  daily-post PostCard surface (rounded-xl border + warm surface) but lays
 *  out the four scripting beats — verbal hook, on-screen text, caption hook,
 *  and CTA — as a labelled stack instead of an editor link. */
export function PlanCard({ d }: { d: PlanDay }) {
  return (
    <article className="relative rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-text)]/30 transition">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
          Day {d.day}
        </span>
      </div>

      <div className="font-semibold leading-snug mb-3">{d.step}</div>

      <dl className="space-y-2.5 text-xs leading-relaxed">
        <Beat label="Verbal hook" value={d.hook} />
        <Beat label="On-screen text" value={d.onScreen} />
        <Beat label="Caption hook" value={d.caption} />
        <Beat label="CTA" value={d.cta} />
      </dl>
    </article>
  );
}

function Beat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] mb-0.5">
        {label}
      </dt>
      <dd className="text-[var(--color-text)]">{value}</dd>
    </div>
  );
}
