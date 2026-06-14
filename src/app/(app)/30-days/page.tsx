import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { tryGetUser } from "@/lib/auth-helpers";
import { PLAN } from "./plan";
import { PlanCard } from "./plan-card";

export const metadata: Metadata = {
  title: "30 Days — Creator OS",
  description:
    "A 30-day Claude Code content plan across four modules: Website, Funnel, App, and Ship & Grow.",
  robots: { index: false, follow: false },
};

export default async function ThirtyDaysPage() {
  const userId = await tryGetUser();
  if (!userId) redirect("/login");

  const totalDays = PLAN.reduce((n, m) => n + m.days.length, 0);

  return (
    <div className="px-8 py-10 max-w-7xl">
      <div className="mb-6 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">
            30 days of{" "}
            <span className="font-italic-accent text-blush">Claude Code.</span>
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {totalDays} days · {PLAN.length} modules · website → funnel → app → growth
          </p>
        </div>
        <nav className="flex items-center gap-2 flex-wrap">
          {PLAN.map((m) => (
            <a
              key={m.id}
              href={`#${m.id}`}
              className="text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-text)]/30 transition"
            >
              {m.number}. {m.title}
            </a>
          ))}
        </nav>
      </div>

      <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 leading-relaxed">
        <strong>How this works.</strong> One short-form video per day for 30
        days. Each card is a ready-to-record brief: the <em>teaching step</em>{" "}
        plus the four beats — verbal hook, on-screen text, caption hook, and
        CTA. Work through the four modules in order and you&apos;ll have shipped a
        real product by day 30.
      </div>

      <div className="space-y-10">
        {PLAN.map((m) => (
          <section key={m.id} id={m.id} className="scroll-mt-6">
            <div className="mb-3">
              <h2 className="text-lg font-semibold">
                <span className="text-[var(--color-muted)] font-normal">
                  Module {m.number} ·{" "}
                </span>
                {m.title}
                <span className="ml-2 text-sm font-normal text-[var(--color-muted)]">
                  {m.days.length} days
                </span>
              </h2>
              <p className="text-sm text-[var(--color-muted)] mt-0.5">
                {m.subtitle}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {m.days.map((d) => (
                <PlanCard key={d.day} d={d} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
