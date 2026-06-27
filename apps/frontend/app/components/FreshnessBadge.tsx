/**
 * FreshnessBadge — displays freshness state for any data surface.
 *
 * Renders a color-coded badge (green / amber / red) with a plain-Vietnamese
 * label based on how old `dataAsof` is relative to the surface's SLA tier.
 *
 * Design decisions (from [Architect] Brownfield Findings):
 *   D1: SLA tier constants baked at module level — no runtime JSON fetch.
 *   D2: ClientTimeString requires non-null iso prop; FreshnessBadge null-guards
 *       dataAsof before delegating (RISK-5).
 *   D6: SLA_TIERS uses named-field objects, not 2-tuples, for readability.
 *
 * Edge cases handled:
 *   EC-1: dataAsof = null → gray "Chưa có dữ liệu" (no ClientTimeString call)
 *   EC-3: marketHoursOnly=true + stale + off-hours → amber "Số liệu phiên gần nhất"
 *   EC-4: slaTierKey = "static" → "Nội dung tĩnh" plain text, no badge
 *
 * Sprint: FRONTEND-FRESHNESS-TRANSPARENCY
 * Task:   TASK-FFT-L3A
 */

import { ClientTimeString } from "~/components/ClientTimestamp";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SlaTierKey =
  | "realtime"
  | "intraday"
  | "daily"
  | "weekly"
  | "event"
  | "static";

type SlaTierConfig = {
  maxStalenessMin: number | null;
  clientRefreshMs: number | null;
};

// ---------------------------------------------------------------------------
// Module-level SLA constants (D1, D6)
// Source: docs/data/frontend-data-coverage-map.json § sla_tiers
// Named-field objects for readability + type safety.
// ---------------------------------------------------------------------------

const SLA_TIERS: Record<SlaTierKey, SlaTierConfig> = {
  realtime: { maxStalenessMin: 15, clientRefreshMs: 60_000 },
  intraday: { maxStalenessMin: 60, clientRefreshMs: 300_000 },
  daily: { maxStalenessMin: 1560, clientRefreshMs: null },
  weekly: { maxStalenessMin: 11_520, clientRefreshMs: null },
  event: { maxStalenessMin: 1560, clientRefreshMs: 300_000 },
  static: { maxStalenessMin: null, clientRefreshMs: null },
};

// ---------------------------------------------------------------------------
// Market hours gate (EC-3, STALE_RISK rows)
// VN market: 02:00–08:59 UTC Mon–Fri (per BA spec)
// ---------------------------------------------------------------------------

/**
 * Returns true when `now` falls within VN market hours (02:00–08:59 UTC,
 * Monday through Friday). Used for STALE_RISK rows (alerts, foreign-flow)
 * to suppress red badges outside trading hours.
 */
export function isVnMarketHours(now: Date = new Date()): boolean {
  const utcDay = now.getUTCDay(); // 0=Sun, 6=Sat
  if (utcDay === 0 || utcDay === 6) return false;
  const utcHour = now.getUTCHours();
  // 02:00 <= hour <= 08:59 UTC
  return utcHour >= 2 && utcHour <= 8;
}

// ---------------------------------------------------------------------------
// Color + label derivation
// ---------------------------------------------------------------------------

type BadgeColor = "green" | "amber" | "red" | "gray";

const COLOR_CLASSES: Record<BadgeColor, string> = {
  green:
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800",
  amber:
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800",
  red: "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800",
  gray: "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-500",
};

const DOT_CLASSES: Record<BadgeColor, string> = {
  green: "h-1.5 w-1.5 rounded-full bg-green-500",
  amber: "h-1.5 w-1.5 rounded-full bg-amber-500",
  red: "h-1.5 w-1.5 rounded-full bg-red-500",
  gray: "h-1.5 w-1.5 rounded-full bg-slate-400",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FreshnessBadgeProps {
  /** ISO 8601 UTC string from loader data. Null → gray EC-1 path. */
  dataAsof: string | null;
  /** SLA tier key determining color thresholds and refresh cadence. */
  slaTierKey: SlaTierKey;
  /**
   * Set true for STALE_RISK rows (alerts, foreign-flow): suppresses red badge
   * when stale but outside VN market hours (EC-3).
   */
  marketHoursOnly?: boolean;
  /** Extra Tailwind classes forwarded to the outer element. */
  className?: string;
  /**
   * Injectable "now" for deterministic testing (default: new Date()).
   * @internal — not part of the public API; omit in production usage.
   */
  _now?: Date;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * FreshnessBadge renders a colored freshness badge with plain-Vietnamese label.
 *
 * Time portion is delegated to ClientTimeString (SSR-safe; no hydration
 * mismatch). The component null-guards dataAsof before that delegation (D2).
 */
export function FreshnessBadge({
  dataAsof,
  slaTierKey,
  marketHoursOnly = false,
  className = "",
  _now,
}: FreshnessBadgeProps) {
  // EC-4: static tier → plain text label, no badge, no ClientTimeString
  if (slaTierKey === "static") {
    return (
      <span className={`text-xs text-slate-500 ${className}`.trim()}>
        Nội dung tĩnh
      </span>
    );
  }

  // EC-1: null → gray badge (never pass null to ClientTimeString — D2/RISK-5)
  if (dataAsof === null) {
    return (
      <span className={`${COLOR_CLASSES.gray} ${className}`.trim()}>
        <span className={DOT_CLASSES.gray} />
        Chưa có dữ liệu
      </span>
    );
  }

  // Compute age in minutes
  const now = _now ?? new Date();
  const asofMs = new Date(dataAsof).getTime();
  const ageMin = isNaN(asofMs)
    ? Infinity
    : (now.getTime() - asofMs) / 60_000;

  const { maxStalenessMin } = SLA_TIERS[slaTierKey];

  // Derive badge color
  let color: BadgeColor;
  let qualifier: string | null = null;

  if (maxStalenessMin === null) {
    // No staleness threshold defined (should not happen for non-static tiers)
    color = "gray";
  } else if (ageMin <= 0.5 * maxStalenessMin) {
    color = "green";
  } else if (ageMin <= maxStalenessMin) {
    color = "amber";
  } else {
    // Age exceeds threshold
    if (marketHoursOnly && !isVnMarketHours(now)) {
      // EC-3: outside market hours → amber + qualifier
      color = "amber";
      qualifier = "Số liệu phiên gần nhất";
    } else {
      color = "red";
    }
  }

  // Label: "Cập nhật lúc <time>" with qualifier when applicable (EC-3)
  return (
    <span className={`${COLOR_CLASSES[color]} ${className}`.trim()}>
      <span className={DOT_CLASSES[color]} />
      {qualifier ? (
        qualifier
      ) : (
        <>
          Cập nhật lúc{" "}
          {/* D2: dataAsof is confirmed non-null at this point */}
          <ClientTimeString iso={dataAsof} />
        </>
      )}
    </span>
  );
}
