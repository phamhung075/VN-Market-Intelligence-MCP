/**
 * useFreshnessRevalidator — auto-refresh loader data on an SLA-tier interval.
 *
 * Wraps Remix's useRevalidator on a timer so FreshnessBadge stays live without
 * manual page refresh. Only tiers with a non-null client_refresh_ms set an
 * interval; daily / weekly / static tiers return immediately (EC-5).
 *
 * D5 (Architect): useRevalidator from @remix-run/react is already a project
 * dependency — used in EvalTable.tsx, dashboard.orchestration.tsx,
 * dashboard.bctc-eval.$reportId.tsx. No new package introduced.
 *
 * NFR-A2: interval is cleaned up via the useEffect return function (no leak).
 *
 * Sprint: FRONTEND-FRESHNESS-TRANSPARENCY
 * Task:   TASK-FFT-L3A
 */

import { useEffect } from "react";
import { useRevalidator } from "@remix-run/react";

// ---------------------------------------------------------------------------
// SLA tier config — co-located with FreshnessBadge SLA_TIERS const.
// Re-exported as SlaTierKey so this module can be used standalone.
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

/** Module-level SLA constants (D1, D6: named-field object, not 2-tuple). */
const SLA_TIERS: Record<SlaTierKey, SlaTierConfig> = {
  realtime: { maxStalenessMin: 15, clientRefreshMs: 60_000 },
  intraday: { maxStalenessMin: 60, clientRefreshMs: 300_000 },
  daily: { maxStalenessMin: 1560, clientRefreshMs: null },
  weekly: { maxStalenessMin: 11_520, clientRefreshMs: null },
  event: { maxStalenessMin: 1560, clientRefreshMs: 300_000 },
  static: { maxStalenessMin: null, clientRefreshMs: null },
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Sets up a client-side auto-refresh interval for the current Remix route.
 *
 * @param slaTierKey - The SLA tier of the page's primary data surface.
 *
 * Behavior:
 * - If the tier's clientRefreshMs is null (daily / weekly / static) → no-op.
 * - Otherwise → schedules revalidator.revalidate() every clientRefreshMs ms.
 * - Cleans up the interval when the component unmounts.
 */
export function useFreshnessRevalidator(slaTierKey: SlaTierKey): void {
  const revalidator = useRevalidator();
  const { clientRefreshMs } = SLA_TIERS[slaTierKey];

  useEffect(() => {
    // EC-5: no interval for tiers without client refresh cadence
    if (clientRefreshMs === null) return;

    const id = setInterval(() => {
      if (revalidator.state === "idle") {
        revalidator.revalidate();
      }
    }, clientRefreshMs);

    return () => clearInterval(id);
  }, [clientRefreshMs, revalidator]);
}
