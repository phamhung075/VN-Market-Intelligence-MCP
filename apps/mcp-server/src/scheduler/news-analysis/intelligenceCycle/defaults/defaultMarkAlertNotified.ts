/**
 * Intelligence Cycle — Step E default production impl: markAlertNotified
 *
 * FACTORY-SCHEDULER-split-intelligenceCycleJob: extracted verbatim from
 * intelligenceCycleJob.ts. Injected via
 * `deps.markAlertNotifiedFn ?? ((id) => defaultMarkAlertNotified(id))` in the
 * orchestrator's `_runCycle`.
 */

export async function defaultMarkAlertNotified(alertId: string): Promise<void> {
  const { markAlertNotified } = await import("../../../../infrastructure/db/alertStore.js");
  markAlertNotified(alertId);
}
