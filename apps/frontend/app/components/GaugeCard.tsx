/**
 * GaugeCard — shared card shell for a single P0/P1 indicator gauge.
 *
 * Extracted from dashboard.indicator-gauges.tsx (AC-M1, TASK-502-MOMENTUM-FRONTEND).
 * Previously inline; now shared across P0 and P1 dashboard pages.
 *
 * Props:
 *   - title, subtitle: header copy
 *   - scalar: main display value (pre-formatted string; "—" = null state)
 *   - badge: regime/quality badge with color
 *   - details: up to 2 supporting detail rows
 *   - dataAsof: ISO string for FreshnessBadge
 *   - nullReason: shown when scalar == "—"
 *   - expandContent: optional collapsible source-link / detail panel (P1 extension, M1)
 *
 * DDD layer: interface — pure presentational component; no direct API call.
 *
 * Sprint: BA-IND-P1-MOMENTUM-FRONTEND
 * Task:   TASK-502-MOMENTUM-FRONTEND AC-M1
 */

import type { ReactNode } from "react";
import { FreshnessBadge } from "~/components/FreshnessBadge";

// ---------------------------------------------------------------------------
// Color class map — badge color tokens
// ---------------------------------------------------------------------------

export const REGIME_COLOR_CLASSES: Record<
  "green" | "amber" | "red" | "gray",
  string
> = {
  green:
    "inline-flex items-center rounded border border-green-700 bg-green-950 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-green-400",
  amber:
    "inline-flex items-center rounded border border-amber-700 bg-amber-950 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-400",
  red: "inline-flex items-center rounded border border-red-700 bg-red-950 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-400",
  gray: "inline-flex items-center rounded border border-slate-600 bg-slate-700 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GaugeCardProps {
  title: string;
  subtitle: string;
  /** Main scalar value display (pre-formatted string) */
  scalar: string;
  /** Regime/quality badge */
  badge: { label: string; color: "green" | "amber" | "red" | "gray" };
  /** Supporting detail lines (max 2) */
  details?: Array<{ label: string; value: string }>;
  /** ISO string for freshness badge */
  dataAsof: string | null;
  /** Null-reason shown when scalar == "—" */
  nullReason?: string | null;
  /**
   * Optional collapsible expand content (source-link dropdown, detail panel).
   * P1 extension (AC-M1) — backward-compatible: P0 page omits this prop.
   */
  expandContent?: ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GaugeCard({
  title,
  subtitle,
  scalar,
  badge,
  details,
  dataAsof,
  nullReason,
  expandContent,
}: GaugeCardProps) {
  const isNull = scalar === "—";
  return (
    <article className="rounded-lg border border-slate-700 bg-slate-800 p-5 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-100">{title}</p>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <FreshnessBadge dataAsof={dataAsof} slaTierKey="daily" />
      </div>

      {/* Main scalar */}
      <p
        className={[
          "text-3xl font-bold",
          isNull ? "text-slate-500" : "text-slate-100",
        ].join(" ")}
      >
        {scalar}
      </p>

      {/* Regime/quality badge */}
      <span className={REGIME_COLOR_CLASSES[badge.color]}>{badge.label}</span>

      {/* Null reason */}
      {isNull && nullReason && (
        <p className="text-xs text-slate-500 leading-relaxed">{nullReason}</p>
      )}

      {/* Detail rows */}
      {!isNull && details && details.length > 0 && (
        <dl className="space-y-1">
          {details.map((d) => (
            <div key={d.label} className="flex justify-between text-xs">
              <dt className="text-slate-500">{d.label}</dt>
              <dd className="text-slate-300 font-medium">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Expand content — source-link dropdown / detail panel (P1 extension) */}
      {expandContent != null && (
        <div className="border-t border-slate-700 pt-3">{expandContent}</div>
      )}
    </article>
  );
}
