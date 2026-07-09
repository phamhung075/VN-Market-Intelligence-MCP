/**
 * Intelligence Cycle — Step E default production impl: sendAlerts (Telegram)
 *
 * FACTORY-SCHEDULER-split-intelligenceCycleJob: extracted verbatim from
 * intelligenceCycleJob.ts. Injected via
 * `deps.sendAlertsFn ?? defaultSendAlerts` in the orchestrator's `_runCycle`.
 */

import type { Alert } from "../../../../domain/services/alertGenerator.js";

export async function defaultSendAlerts(alerts: Alert[]): Promise<number> {
  if (alerts.length === 0) return 0;
  try {
    const { notifyTelegramAlert } = await import("../../../../infrastructure/notifiers/telegram.js");
    let sent = 0;
    for (const alert of alerts) {
      if (alert.severity === "high" || alert.severity === "critical") {
        const ok = await notifyTelegramAlert(alert);
        if (ok) sent++;
      }
    }
    return sent;
  } catch {
    // Telegram not configured or module not available — silent skip
    return 0;
  }
}
