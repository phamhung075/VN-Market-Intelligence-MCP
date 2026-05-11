/**
 * Alert Engine — Application Use Cases
 *
 * Orchestrates domain services + repository ports.
 * No direct I/O — only ports.
 */

import { computeFingerprint, shouldSuppressAlert, isDuplicate } from '../domain/services.js';
import { DEFAULT_COOLDOWN_CONFIG } from '../domain/models.js';
import type { AlertRepositoryPort, MutePort, TelegramPort } from '../domain/repositories.js';
import type { EvaluateAlertRequest, EvaluateAlertResponse } from './dtos.js';

export class EvaluateAlertUseCase {
  constructor(
    private readonly alertRepo: AlertRepositoryPort,
    private readonly mutePort: MutePort,
    private readonly telegram: TelegramPort,
  ) {}

  async execute(req: EvaluateAlertRequest): Promise<EvaluateAlertResponse> {
    const {
      stock,
      severity,
      message,
      signalTypes = [],
      actionCode,
      sendTelegram = true,
    } = req;

    const config = DEFAULT_COOLDOWN_CONFIG;
    const fingerprint = computeFingerprint({ stock, signalTypes, message });

    // 1. Mute check
    if (this.mutePort.isStockMuted(stock)) {
      return {
        fired: false,
        cooldown_sec: 0,
        reason: `${stock} is muted`,
        fingerprint,
      };
    }

    // 2. Dedup check (last 60 min)
    const recentFingerprints = this.alertRepo
      .getRecentAlerts(stock, 60)
      .map((a) => a.fingerprint);
    if (isDuplicate(fingerprint, recentFingerprints)) {
      return {
        fired: false,
        cooldown_sec: config.cooldownMinutes * 60,
        reason: 'duplicate fingerprint within 60min',
        fingerprint,
      };
    }

    // 3. Cooldown / daily cap check
    const recentAlerts = this.alertRepo.getRecentAlerts(stock, config.cooldownMinutes);
    const { suppress, reason } = shouldSuppressAlert(
      { stock, severity, message, signalTypes, actionCode },
      recentAlerts,
      config,
    );

    if (suppress) {
      return {
        fired: false,
        cooldown_sec: config.cooldownMinutes * 60,
        reason,
        fingerprint,
      };
    }

    // 4. Store the alert
    const now = new Date().toISOString();
    this.alertRepo.storeAlert({
      stocks: stock,
      signalTypes: signalTypes.join(','),
      message,
      fingerprint,
      severity,
      triggeredAt: now,
      sentToTelegram: 0,
    });

    // 5. Send to Telegram if requested
    if (sendTelegram) {
      const channel = severity === 'critical' || severity === 'high' ? 'market' : 'work';
      const text = `[${severity.toUpperCase()}] ${stock}: ${message}`;
      await this.telegram.send(channel, text);
    }

    return {
      fired: true,
      cooldown_sec: config.cooldownMinutes * 60,
      reason: 'alert fired',
      fingerprint,
    };
  }
}
