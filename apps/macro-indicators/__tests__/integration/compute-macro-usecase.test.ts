/**
 * Integration tests — ComputeMacroUseCase
 *
 * Real MacroScoreService + mocked ports.
 * Tests use case orchestration + DTO mapping.
 */

import { describe, it, expect, mock } from 'bun:test';
import { ComputeMacroUseCase } from '../../src/application/usecases.js';
import { MacroScoreService } from '../../src/domain/services.js';
import type { CommodityFetcherPort, SBVRatePort } from '../../src/domain/repositories.js';

describe('ComputeMacroUseCase (integration)', () => {
  it('returns MacroSnapshotResponse with all fields', async () => {
    const commodity: CommodityFetcherPort = {
      fetchOilUsd: mock(async () => 85.0),
      fetchGoldUsd: mock(async () => 2050.0),
      fetchUsdVnd: mock(async () => 24300.0),
    };
    const sbv: SBVRatePort = {
      fetchVnIndex: mock(async () => 1215.0),
      fetchSBVRates: mock(async () => ({})),
    };
    const service = new MacroScoreService(commodity, sbv);
    const useCase = new ComputeMacroUseCase(service);

    const result = await useCase.execute({});

    expect(result.vnIndex).toBe(1215.0);
    expect(result.oilUsd).toBe(85.0);
    expect(result.goldUsd).toBe(2050.0);
    expect(result.usdVnd).toBe(24300.0);
    expect(Array.isArray(result.signals)).toBe(true);
    expect(result.fetchedAt).toBeTruthy();
  });

  it('returns empty signals when all fetchers fail', async () => {
    const commodity: CommodityFetcherPort = {
      fetchOilUsd: mock(async () => null),
      fetchGoldUsd: mock(async () => null),
      fetchUsdVnd: mock(async () => null),
    };
    const sbv: SBVRatePort = {
      fetchVnIndex: mock(async () => null),
      fetchSBVRates: mock(async () => ({})),
    };
    const service = new MacroScoreService(commodity, sbv);
    const useCase = new ComputeMacroUseCase(service);

    const result = await useCase.execute({});

    expect(result.signals).toHaveLength(0);
    expect(result.vnIndex).toBeNull();
  });

  it('signals have valid structure', async () => {
    const commodity: CommodityFetcherPort = {
      fetchOilUsd: mock(async () => 90.0),
      fetchGoldUsd: mock(async () => 2200.0),
      fetchUsdVnd: mock(async () => 25500.0),
    };
    const sbv: SBVRatePort = {
      fetchVnIndex: mock(async () => 1100.0),
      fetchSBVRates: mock(async () => ({})),
    };
    const service = new MacroScoreService(commodity, sbv);
    const useCase = new ComputeMacroUseCase(service);

    const result = await useCase.execute({});

    for (const signal of result.signals) {
      expect(signal.indicator).toBeTruthy();
      expect(typeof signal.value).toBe('number');
      expect(['BULLISH', 'BEARISH', 'NEUTRAL']).toContain(signal.direction);
      expect(['HIGH', 'MEDIUM', 'LOW']).toContain(signal.impact);
    }

    const usdVndSignal = result.signals.find((s) => s.indicator === 'usd_vnd');
    expect(usdVndSignal?.direction).toBe('BEARISH'); // 25500 > 25000
  });
});
