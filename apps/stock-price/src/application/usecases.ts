/**
 * Stock Price Application — Use Cases
 */

import type { ResolvePriceService } from '../domain/services.js';
import type { PriceHistoryPort } from '../domain/repositories.js';
import type { FetchPriceRequest, FetchPriceResponse, PriceHistoryRequest, PriceHistoryResponse } from './dtos.js';

export class FetchPriceUseCase {
  constructor(private readonly service: ResolvePriceService) {}

  async execute(request: FetchPriceRequest): Promise<FetchPriceResponse> {
    const quote = await this.service.fetchPrice(request.code.toUpperCase());
    return {
      code: quote.code,
      price: quote.price,
      volume: quote.volume,
      change: quote.change,
      changePercent: quote.changePercent,
      source: quote.source,
      latencyMs: quote.latencyMs,
      fetchedAt: quote.fetchedAt,
    };
  }
}

export class PriceHistoryUseCase {
  constructor(private readonly historyRepo: PriceHistoryPort) {}

  async execute(request: PriceHistoryRequest): Promise<PriceHistoryResponse> {
    const history = await this.historyRepo.getHistory(request.code.toUpperCase(), request.days);
    return { code: request.code.toUpperCase(), history };
  }
}
