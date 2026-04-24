/**
 * Alert Engine — Application DTOs
 */

import type { AlertSeverity } from '../domain/models.js';

export interface EvaluateAlertRequest {
  stock: string;
  severity: AlertSeverity;
  message: string;
  signalTypes?: string[];
  actionCode?: string;
  sendTelegram?: boolean;
}

export interface EvaluateAlertResponse {
  fired: boolean;
  cooldown_sec: number;
  reason: string;
  fingerprint: string;
}
