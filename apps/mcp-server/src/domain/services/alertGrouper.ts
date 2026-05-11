/**
 * Alert Grouper — Task 131
 *
 * Pure domain function that clusters related alerts into a single GroupedAlert
 * to reduce notification noise.
 *
 * Grouping criteria:
 *   1. Alerts must be within `windowMinutes` of each other (default 15 min).
 *   2. They must share at least one overlapping signal type.
 *
 * Severity of a group = the maximum severity among its members.
 * Affected stocks = union of all stocks in the group (deduped).
 *
 * No I/O — pure transformation.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GroupedAlert {
  /** Stable group identifier (reuses id of the earliest alert in the group) */
  id: string;
  /** Max severity among merged alerts */
  severity: string;
  /** Title of the earliest alert's message (used as "root event") */
  rootEvent: string;
  /** Union of all stock codes in the group */
  affectedStocks: string[];
  /** Union of all signal types in the group */
  signals: string[];
  /** Human-readable summary */
  message: string;
  /** Number of individual alerts merged into this group */
  individualAlerts: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function maxSeverity(a: string, b: string): string {
  const ra = SEVERITY_RANK[a] ?? 0;
  const rb = SEVERITY_RANK[b] ?? 0;
  return ra >= rb ? a : b;
}

function arraysOverlap(a: string[], b: string[]): boolean {
  const setA = new Set(a);
  return b.some((x) => setA.has(x));
}

function buildGroupMessage(stocks: string[], signals: string[], count: number): string {
  if (count === 1) {
    return `${stocks[0]} alert: ${signals.join(", ")}`;
  }
  const stockSummary =
    stocks.length <= 3 ? stocks.join(", ") : `${stocks.slice(0, 3).join(", ")} +${stocks.length - 3} more`;
  const signalSummary = signals.join(", ");
  return `${count} alerts — ${stockSummary} affected by ${signalSummary}`;
}

function generateGroupId(): string {
  return `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cluster a list of raw alerts into grouped alerts.
 *
 * @param alerts        - Flat list of alerts to group.
 * @param windowMinutes - Time window for grouping (default 15).
 * @returns             - Array of GroupedAlert (may be fewer than input).
 */
export function groupRelatedAlerts(
  alerts: Array<{
    id: string;
    severity: string;
    stocks: string[];
    signals: string[];
    message: string;
    triggeredAt: string;
  }>,
  windowMinutes = 15,
): GroupedAlert[] {
  if (alerts.length === 0) return [];

  const windowMs = windowMinutes * 60_000;

  // Sort by time ascending so we always anchor to the earliest alert
  const sorted = [...alerts].sort(
    (a, b) => new Date(a.triggeredAt).getTime() - new Date(b.triggeredAt).getTime(),
  );

  // Union-Find / greedy grouping: iterate and assign each alert to an
  // existing group if compatible, otherwise open a new group.
  interface Group {
    id: string;
    severity: string;
    stocks: Set<string>;
    signals: Set<string>;
    rootEvent: string;
    count: number;
    anchorTs: number;   // timestamp of earliest alert in group
    latestTs: number;   // timestamp of most recent alert in group
  }

  const groups: Group[] = [];

  for (const alert of sorted) {
    const alertTs = new Date(alert.triggeredAt).getTime();
    const alertSignals = alert.signals;

    // Find a compatible existing group
    let placed = false;
    for (const grp of groups) {
      // Time check: alert must be within windowMs of the group's latest alert
      if (alertTs - grp.latestTs > windowMs) continue;

      // Signal overlap check
      if (!arraysOverlap(alertSignals, Array.from(grp.signals))) continue;

      // Compatible — merge into this group
      alert.stocks.forEach((s) => grp.stocks.add(s));
      alertSignals.forEach((sig) => grp.signals.add(sig));
      grp.severity = maxSeverity(grp.severity, alert.severity);
      grp.count += 1;
      grp.latestTs = Math.max(grp.latestTs, alertTs);
      placed = true;
      break;
    }

    if (!placed) {
      // Open a new group anchored on this alert
      groups.push({
        id: alert.id,
        severity: alert.severity,
        stocks: new Set(alert.stocks),
        signals: new Set(alertSignals),
        rootEvent: alert.message,
        count: 1,
        anchorTs: alertTs,
        latestTs: alertTs,
      });
    }
  }

  return groups.map((grp) => {
    const stocksArr = Array.from(grp.stocks);
    const signalsArr = Array.from(grp.signals);
    return {
      id: grp.id,
      severity: grp.severity,
      rootEvent: grp.rootEvent,
      affectedStocks: stocksArr,
      signals: signalsArr,
      message: buildGroupMessage(stocksArr, signalsArr, grp.count),
      individualAlerts: grp.count,
    };
  });
}
