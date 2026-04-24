/**
 * Stock Price Application — DTOs
 */

import type { PriceSource, DailyOHLCV } from '../domain/models.js';

export interface FetchPriceRequest {
  code: string;
}

export interface FetchPriceResponse {
  code: string;
  price: number;
  volume: number;
  change: number;
  changePercent: number;
  source: PriceSource;
  latencyMs: number;
  fetchedAt: string;
}

export interface PriceHistoryRequest {
  code: string;
  days: number;
}

export interface PriceHistoryResponse {
  code: string;
  history: DailyOHLCV[];
}
