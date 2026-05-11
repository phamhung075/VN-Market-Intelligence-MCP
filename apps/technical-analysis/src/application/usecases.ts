/**
 * Technical Analysis Application — Use Cases
 *
 * Orchestrates domain service + DTOs. No business logic here.
 */

import type { CalculateTAService } from '../domain/services.js';
import type { ComputeTARequest, ComputeTAResponse } from './dtos.js';

export class ComputeTAUseCase {
  constructor(private readonly service: CalculateTAService) {}

  async execute(request: ComputeTARequest): Promise<ComputeTAResponse> {
    const indicators = await this.service.compute(request.code, request.days);

    return {
      code: request.code,
      rsi: indicators.rsi,
      macd: indicators.macd,
      movingAverages: indicators.movingAverages,
      bollingerBands: indicators.bollingerBands,
      trend: indicators.trend,
      computedAt: new Date().toISOString(),
    };
  }
}
