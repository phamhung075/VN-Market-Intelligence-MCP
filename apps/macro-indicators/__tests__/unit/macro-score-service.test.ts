/**
 * Unit tests — MacroScoreService
 *
 * Mocks CommodityFetcherPort + SBVRatePort.
 * Tests snapshot building + signal generation + scoring logic.
 */

import { describe, it, expect, mock } from 'bun:test';
import { MacroScoreService } from '../../src/domain/services.js';
import type { CommodityFetcherPort, SBVRatePort } from '../../src/domain/repositories.js';

function makeMockCommodity(overrides: Partial<CommodityFetcherPort> = {}): CommodityFetcherPort {
  return {
    fetchOilUsd: mock(async () => 85.0),
    fetchGoldUsd: mock(async () => 2100.0),
    fetchUsdVnd: mock(async () => 24500.0),
    ...overrides,
  };
}

function makeMockSBV(overrides: Partial<SBVRatePort> = {}): SBVRatePort {
  return {
    fetchVnIndex: mock(async () => 1200.5),
    fetchSBVRates: mock(async () => ({ 'USD/VND': 24500 })),
    ...overrides,
  };
}

describe('MacroScoreService', () => {
  describe('buildSnapshot', () => {
    it('fetches all commodity + sbv sources', async () => {
      const commodity = makeMockCommodity();
      const sbv = makeMockSBV();
      const service = new MacroScoreService(commodity, sbv);

      await service.buildSnapshot();

      expect(commodity.fetchOilUsd).toHaveBeenCalled();
      expect(commodity.fetchGoldUsd).toHaveBeenCalled();
      expect(commodity.fetchUsdVnd).toHaveBeenCalled();
      expect(sbv.fetchVnIndex).toHaveBeenCalled();
    });

    it('builds snapshot with correct values', async () => {
      const service = new MacroScoreService(makeMockCommodity(), makeMockSBV());
      const snapshot = await service.buildSnapshot();

      expect(snapshot.oilUsd).toBe(85.0);
      expect(snapshot.goldUsd).toBe(2100.0);
      expect(snapshot.usdVnd).toBe(24500.0);
      expect(snapshot.vnIndex).toBe(1200.5);
      expect(snapshot.fetchedAt).toBeTruthy();
    });

    it('generates signals for each commodity', async () => {
      const service = new MacroScoreService(makeMockCommodity(), makeMockSBV());
      const snapshot = await service.buildSnapshot();

      const indicators = snapshot.signals.map((s) => s.indicator);
      expect(indicators).toContain('oil_usd');
      expect(indicators).toContain('gold_usd');
      expect(indicators).toContain('usd_vnd');
    });

    it('marks oil > 100 as BEARISH', async () => {
      const commodity = makeMockCommodity({ fetchOilUsd: mock(async () => 120.0) });
      const service = new MacroScoreService(commodity, makeMockSBV());
      const snapshot = await service.buildSnapshot();

      const oil = snapshot.signals.find((s) => s.indicator === 'oil_usd');
      expect(oil?.direction).toBe('BEARISH');
    });

    it('marks oil < 60 as BULLISH', async () => {
      const commodity = makeMockCommodity({ fetchOilUsd: mock(async () => 50.0) });
      const service = new MacroScoreService(commodity, makeMockSBV());
      const snapshot = await service.buildSnapshot();

      const oil = snapshot.signals.find((s) => s.indicator === 'oil_usd');
      expect(oil?.direction).toBe('BULLISH');
    });

    it('marks USD/VND > 25000 as BEARISH', async () => {
      const commodity = makeMockCommodity({ fetchUsdVnd: mock(async () => 26000.0) });
      const service = new MacroScoreService(commodity, makeMockSBV());
      const snapshot = await service.buildSnapshot();

      const fx = snapshot.signals.find((s) => s.indicator === 'usd_vnd');
      expect(fx?.direction).toBe('BEARISH');
    });

    it('handles null commodity values gracefully (port failures)', async () => {
      const commodity = makeMockCommodity({
        fetchOilUsd: mock(async () => null),
        fetchGoldUsd: mock(async () => null),
        fetchUsdVnd: mock(async () => null),
      });
      const service = new MacroScoreService(commodity, makeMockSBV());
      const snapshot = await service.buildSnapshot();

      expect(snapshot.oilUsd).toBeNull();
      expect(snapshot.signals.filter((s) => s.indicator === 'oil_usd')).toHaveLength(0);
    });

    it('handles port exceptions gracefully', async () => {
      const commodity = makeMockCommodity({
        fetchOilUsd: mock(async () => { throw new Error('network error'); }),
      });
      const service = new MacroScoreService(commodity, makeMockSBV());
      const snapshot = await service.buildSnapshot();

      expect(snapshot.oilUsd).toBeNull();
    });
  });

  describe('scoreIndicator', () => {
    it('scores VN indicators as VN_DIRECT with score 8-10', () => {
      const service = new MacroScoreService(makeMockCommodity(), makeMockSBV());
      const result = service.scoreIndicator('Vietnam GDP Growth Rate');
      expect(result.tier).toBe('VN_DIRECT');
      expect(result.score).toBeGreaterThanOrEqual(8);
    });

    it('scores oil as REGIONAL with score 5-7', () => {
      const service = new MacroScoreService(makeMockCommodity(), makeMockSBV());
      const result = service.scoreIndicator('Crude Oil Price');
      expect(result.tier).toBe('REGIONAL');
      expect(result.score).toBeGreaterThanOrEqual(5);
    });

    it('scores unknown as US_DOMESTIC with score 2-4', () => {
      const service = new MacroScoreService(makeMockCommodity(), makeMockSBV());
      const result = service.scoreIndicator('US housing starts');
      expect(result.tier).toBe('US_DOMESTIC');
      expect(result.score).toBeGreaterThanOrEqual(2);
      expect(result.score).toBeLessThanOrEqual(4);
    });
  });
});
