"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MinusCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type IntegrationStatus = "ok" | "missing_env" | "error" | "skipped";

type IntegrationCheck = {
  id: string;
  label: string;
  status: IntegrationStatus;
  detail?: string;
  latencyMs?: number;
};

type HealthReport = {
  checkedAt: string;
  overall: "ok" | "degraded" | "down";
  integrations: IntegrationCheck[];
};

const AUTO_REFRESH_MS = 60_000;

export function IntegrationStatus() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as HealthReport;
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const t = setInterval(fetchHealth, AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [fetchHealth]);

  // Bucketed counts so the collapsed view can show "X failures" inline.
  const counts = report
    ? report.integrations.reduce(
        (acc, c) => {
          acc[c.status]++;
          return acc;
        },
        { ok: 0, missing_env: 0, error: 0, skipped: 0 } as Record<IntegrationStatus, number>,
      )
    : null;

  return (
    <section className="border rounded-xl bg-[var(--color-surface)] overflow-hidden">
      <header className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-left min-w-0"
          aria-expanded={expanded}
          aria-controls="integration-status-details"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-[var(--color-muted)] shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[var(--color-muted)] shrink-0" />
          )}
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Integration health
          </h2>
          <OverallBadge report={report} loading={loading} error={error} counts={counts} />
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {report && (
            <span className="text-[11px] text-[var(--color-muted)] hidden sm:inline">
              checked {timeAgo(report.checkedAt)}
            </span>
          )}
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] rounded-md p-1.5 disabled:opacity-50"
            title="Refresh"
            aria-label="Refresh integration health"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </header>

      {expanded && (
        <div id="integration-status-details">
          {error && (
            <div className="px-5 py-3 text-sm flex items-start gap-2 text-red-900 bg-red-100 border-b border-red-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Failed to load health report: {error}</span>
            </div>
          )}
          {!report && loading && (
            <div className="px-5 py-4 flex items-center gap-2 text-sm text-[var(--color-muted)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Checking integrations…
            </div>
          )}
          {report && (
            <ul className="divide-y divide-[var(--color-border)]">
              {report.integrations.map((c) => (
                <CheckRow key={c.id} check={c} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function OverallBadge({
  report,
  loading,
  error,
  counts,
}: {
  report: HealthReport | null;
  loading: boolean;
  error: string | null;
  counts: Record<IntegrationStatus, number> | null;
}) {
  if (error) {
    return (
      <span className="bg-red-100 text-red-900 rounded-md px-2 py-0.5 text-[11px] font-semibold inline-flex items-center gap-1">
        <XCircle className="w-3 h-3" /> unreachable
      </span>
    );
  }
  if (!report) {
    return (
      <span className="bg-[var(--color-surface-2)] text-[var(--color-muted)] rounded-md px-2 py-0.5 text-[11px] font-semibold inline-flex items-center gap-1">
        <Loader2 className={cn("w-3 h-3", loading && "animate-spin")} />
        {loading ? "checking…" : "idle"}
      </span>
    );
  }
  if (report.overall === "ok") {
    return (
      <span className="bg-green-100 text-green-900 rounded-md px-2 py-0.5 text-[11px] font-semibold inline-flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" /> All systems operational
      </span>
    );
  }
  if (report.overall === "degraded") {
    return (
      <span className="bg-amber-100 text-amber-900 rounded-md px-2 py-0.5 text-[11px] font-semibold inline-flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" />
        {counts?.missing_env ?? 0} env missing
      </span>
    );
  }
  return (
    <span className="bg-red-100 text-red-900 rounded-md px-2 py-0.5 text-[11px] font-semibold inline-flex items-center gap-1">
      <XCircle className="w-3 h-3" />
      {counts?.error ?? 0} failure{(counts?.error ?? 0) === 1 ? "" : "s"}
    </span>
  );
}

function CheckRow({ check }: { check: IntegrationCheck }) {
  const palette: Record<
    IntegrationStatus,
    {
      icon: React.ComponentType<{ className?: string }>;
      iconClass: string;
      label: string;
      labelClass: string;
    }
  > = {
    ok: {
      icon: CheckCircle2,
      iconClass: "text-green-700",
      label: "ok",
      labelClass: "text-green-900 bg-green-100",
    },
    missing_env: {
      icon: AlertTriangle,
      iconClass: "text-amber-700",
      label: "missing env",
      labelClass: "text-amber-900 bg-amber-100",
    },
    error: {
      icon: XCircle,
      iconClass: "text-red-700",
      label: "error",
      labelClass: "text-red-900 bg-red-100",
    },
    skipped: {
      icon: MinusCircle,
      iconClass: "text-[var(--color-muted)]",
      label: "skipped",
      labelClass: "text-[var(--color-muted)] bg-[var(--color-surface-2)]",
    },
  };
  const p = palette[check.status];
  const Icon = p.icon;

  return (
    <li className="px-5 py-2.5 flex items-start gap-3">
      <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", p.iconClass)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium">{check.label}</span>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              p.labelClass,
            )}
          >
            {p.label}
          </span>
          {typeof check.latencyMs === "number" && (
            <span className="text-[11px] text-[var(--color-muted)]">
              {check.latencyMs}ms
            </span>
          )}
        </div>
        {check.detail && (
          <p className="text-[11px] text-[var(--color-muted)] mt-0.5 break-words">
            {check.detail}
          </p>
        )}
      </div>
    </li>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}
