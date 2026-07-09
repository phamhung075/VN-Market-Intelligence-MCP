/**
 * Intelligence Cycle — Step E default production impl: readUnnotifiedAlerts
 *
 * FACTORY-SCHEDULER-split-intelligenceCycleJob: extracted verbatim from
 * intelligenceCycleJob.ts. Injected via
 * `deps.readUnnotifiedAlertsFn ?? ((windowMs) => defaultReadUnnotifiedAlerts(windowMs))`
 * in the orchestrator's `_runCycle`, called with the orchestrator's
 * `ALERT_WINDOW_MS` named constant (kept in intelligenceCycleJob.ts — that
 * is where it is consumed).
 */

import type { Alert } from "../../../../domain/services/alertGenerator.js";

export async function defaultReadUnnotifiedAlerts(windowMs: number): Promise<Alert[]> {
  const { readUnnotifiedAlerts } = await import("../../../../infrastructure/db/alertStore.js");
  const windowMinutes = windowMs / 60_000;
  return readUnnotifiedAlerts(windowMinutes);
}
