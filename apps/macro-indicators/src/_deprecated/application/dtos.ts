/**
 * Macro Indicators Application — DTOs
 */

import type { PriceSignal } from '../domain/models.js';

export interface MacroSnapshotRequest {
  // Future: could add filters like { currency: 'VND' }
}

export interface MacroSnapshotResponse {
  vnIndex: number | null;
  oilUsd: number | null;
  goldUsd: number | null;
  usdVnd: number | null;
  signals: PriceSignal[];
  fetchedAt: string;
}
