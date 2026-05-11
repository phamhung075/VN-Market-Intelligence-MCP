/**
 * Macro Indicators Application — Use Cases
 */

import type { MacroScoreService } from '../domain/services.js';
import type { MacroSnapshotRequest, MacroSnapshotResponse } from './dtos.js';

export class ComputeMacroUseCase {
  constructor(private readonly service: MacroScoreService) {}

  async execute(_request: MacroSnapshotRequest): Promise<MacroSnapshotResponse> {
    const snapshot = await this.service.buildSnapshot();
    return {
      vnIndex: snapshot.vnIndex,
      oilUsd: snapshot.oilUsd,
      goldUsd: snapshot.goldUsd,
      usdVnd: snapshot.usdVnd,
      signals: snapshot.signals,
      fetchedAt: snapshot.fetchedAt,
    };
  }
}
