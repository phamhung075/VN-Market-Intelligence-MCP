/**
 * Macro Indicators Domain — MacroScoreService
 *
 * Pure business logic: fetches prices via ports, builds signals, scores indicators.
 * Zero I/O — all network calls delegated to injected ports.
 */

import type { MacroSnapshot, PriceSignal, ScoredIndicator, SignalDirection } from './models.js';
import type { CommodityFetcherPort, SBVRatePort } from './repositories.js';

export class MacroScoreService {
  constructor(
    private readonly commodity: CommodityFetcherPort,
    private readonly sbv: SBVRatePort,
  ) {}

  async buildSnapshot(): Promise<MacroSnapshot> {
    const [oil, gold, usdVnd, vnIndex] = await Promise.all([
      this.commodity.fetchOilUsd().catch(() => null),
      this.commodity.fetchGoldUsd().catch(() => null),
      this.commodity.fetchUsdVnd().catch(() => null),
      this.sbv.fetchVnIndex().catch(() => null),
    ]);

    const signals: PriceSignal[] = [];

    if (oil !== null) {
      signals.push({
        indicator: 'oil_usd',
        value: oil,
        unit: 'USD/barrel',
        direction: this.oilDirection(oil),
        impact: 'HIGH',
      });
    }

    if (gold !== null) {
      signals.push({
        indicator: 'gold_usd',
        value: gold,
        unit: 'USD/oz',
        direction: this.goldDirection(gold),
        impact: 'MEDIUM',
      });
    }

    if (usdVnd !== null) {
      signals.push({
        indicator: 'usd_vnd',
        value: usdVnd,
        unit: 'VND/USD',
        direction: this.usdVndDirection(usdVnd),
        impact: 'HIGH',
      });
    }

    return {
      vnIndex,
      oilUsd: oil,
      goldUsd: gold,
      usdVnd,
      signals,
      fetchedAt: new Date().toISOString(),
    };
  }

  /** Score an indicator name to get impact score 2–10 + tier. */
  scoreIndicator(name: string): { tier: 'VN_DIRECT' | 'REGIONAL' | 'US_DOMESTIC'; score: number } {
    const lower = name.toLowerCase();

    const vnKeywords = ['vietnam', 'viet nam', 'vn gdp', 'vn cpi', 'sbv', 'nhnn', 'vnd', 'vnindex', 'hose', 'hnx'];
    if (vnKeywords.some((k) => lower.includes(k))) {
      return { tier: 'VN_DIRECT', score: 8 + Math.floor(Math.random() * 3) };
    }

    const regionalKeywords = ['federal reserve', 'fed rate', 'fed fund', 'oil', 'crude', 'gold', 'china', 'pboc'];
    if (regionalKeywords.some((k) => lower.includes(k))) {
      return { tier: 'REGIONAL', score: 5 + Math.floor(Math.random() * 3) };
    }

    return { tier: 'US_DOMESTIC', score: 2 + Math.floor(Math.random() * 3) };
  }

  private oilDirection(oil: number): SignalDirection {
    if (oil > 100) return 'BEARISH';   // high oil = cost pressure for VN
    if (oil < 60) return 'BULLISH';
    return 'NEUTRAL';
  }

  private goldDirection(gold: number): SignalDirection {
    if (gold > 2200) return 'BULLISH'; // safe haven demand
    if (gold < 1800) return 'BEARISH';
    return 'NEUTRAL';
  }

  private usdVndDirection(usdVnd: number): SignalDirection {
    if (usdVnd > 25000) return 'BEARISH'; // VND depreciation = import cost pressure
    if (usdVnd < 23000) return 'BULLISH';
    return 'NEUTRAL';
  }
}
