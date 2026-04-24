/**
 * Alert Engine — Domain Models
 *
 * Pure types. No I/O, no infrastructure imports.
 */

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type TelegramChannel = 'market' | 'work' | 'bug';

export interface AlertRequest {
  stock: string;
  severity: AlertSeverity;
  message: string;
  signalTypes?: string[];
  actionCode?: string;
}

export interface CooldownConfig {
  /** Minutes to suppress same stock+signal combo. Default: 30 */
  cooldownMinutes: number;
  /** Max alerts per stock per day. Default: 3 */
  maxAlertsPerStockPerDay: number;
}

export const DEFAULT_COOLDOWN_CONFIG: CooldownConfig = {
  cooldownMinutes: 30,
  maxAlertsPerStockPerDay: 3,
};

export interface StoredAlert {
  id?: number;
  stocks: string;
  signalTypes: string;
  message: string;
  fingerprint: string;
  severity: AlertSeverity;
  triggeredAt: string;
  sentToTelegram: number; // 0 | 1
}

export interface AlertPolicy {
  /** Channel to send to when alert fires. Default: 'market' */
  channel: TelegramChannel;
  cooldown: CooldownConfig;
}

export interface EvaluateAlertResult {
  fired: boolean;
  cooldown_sec: number;
  reason: string;
  fingerprint?: string;
}
