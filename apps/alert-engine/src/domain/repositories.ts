/**
 * Alert Engine — Repository Ports (domain interfaces)
 */

import type { StoredAlert, TelegramChannel } from './models.js';

/** Port for alert storage (dedup + cooldown state). */
export interface AlertRepositoryPort {
  /** Get recent alerts for a given stock within the last N minutes. */
  getRecentAlerts(stock: string, withinMinutes: number): StoredAlert[];

  /** Count how many alerts fired for this stock today. */
  countTodayAlerts(stock: string): number;

  /** Store a new alert record. Returns the new alert id. */
  storeAlert(alert: Omit<StoredAlert, 'id'>): number;

  /** Check if fingerprint was seen in the last N minutes. */
  hasDuplicateFingerprint(fingerprint: string, withinMinutes: number): boolean;
}

/** Port for mute state. */
export interface MutePort {
  /** Returns true if the stock is currently muted. */
  isStockMuted(stock: string): boolean;
}

/** Port for sending Telegram messages. */
export interface TelegramPort {
  /** Send a message to the specified channel. Returns success boolean. */
  send(channel: TelegramChannel, text: string): Promise<boolean>;
}
