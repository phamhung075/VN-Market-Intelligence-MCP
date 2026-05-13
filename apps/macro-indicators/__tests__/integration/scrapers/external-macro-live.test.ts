/**
 * Integration tests — External Macro Scrapers (live endpoints)
 *
 * Tests real HTTP calls against actual endpoints.
 * Rate-limited: 1 test per 2-5s.
 *
 * Skip in CI unless INTEGRATION=true env var is set.
 * Run manually: INTEGRATION=true bun test --testPathPattern=external-macro-live
 *
 * Each test uses a 15s timeout to account for slow World Bank API pagination.
 */

import { describe, it, expect } from 'bun:test';

const SKIP = process.env['INTEGRATION'] !== 'true';
const REASON = 'Set INTEGRATION=true to run live endpoint tests';

function itLive(name: string, fn: () => Promise<void>, timeoutMs = 15_000) {
  if (SKIP) {
    it.skip(`[live] ${name} — ${REASON}`, fn);
  } else {
    it(`[live] ${name}`, fn, timeoutMs);
  }
}

/** Extended timeout variant for slow APIs (e.g. ADB KIDB ~15-20s). */
function itLiveSlow(name: string, fn: () => Promise<void>) {
  return itLive(name, fn, 45_000);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe('Live endpoint integration — external macro scrapers', () => {
  describe('WorldBankMacroAdapter', () => {
    itLive('fetchVnIndicator(NY.GDP.MKTP.CD) returns data points', async () => {
      const { WorldBankMacroAdapter } = await import(
        '../../../src/infrastructure/scrapers/world-bank-macro.js'
      );
      const adapter = new WorldBankMacroAdapter();
      const result = await adapter.fetchVnIndicator('NY.GDP.MKTP.CD', 5);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.indicator).toBe('NY.GDP.MKTP.CD');
      expect(typeof result[0]!.date).toBe('string');
      await sleep(2_000);
    });

    itLive('fetchVnIndicator returns null value for unpublished year', async () => {
      const { WorldBankMacroAdapter } = await import(
        '../../../src/infrastructure/scrapers/world-bank-macro.js'
      );
      const adapter = new WorldBankMacroAdapter();
      // 2025 GDP not yet published — value should be null
      const result = await adapter.fetchVnIndicator('NY.GDP.MKTP.CD', 2);
      const point2025 = result.find((p) => p.date === '2025');
      if (point2025) expect(point2025.value).toBeNull();
      await sleep(2_000);
    });
  });

  describe('YahooFxIndicesAdapter', () => {
    itLive('fetchSymbol(EURUSD=X) returns valid quote', async () => {
      const { YahooFxIndicesAdapter } = await import(
        '../../../src/infrastructure/scrapers/yahoo-finance-fx-indices.js'
      );
      const adapter = new YahooFxIndicesAdapter();
      const result = await adapter.fetchSymbol('EURUSD=X');

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe('EURUSD=X');
      expect(result!.price).toBeGreaterThan(0.5);
      expect(result!.price).toBeLessThan(2.5); // sanity bounds for EUR/USD
      await sleep(2_000);
    });

    itLive('fetchSymbol(USDVND=X) returns VND rate > 20000', async () => {
      const { YahooFxIndicesAdapter } = await import(
        '../../../src/infrastructure/scrapers/yahoo-finance-fx-indices.js'
      );
      const adapter = new YahooFxIndicesAdapter();
      const result = await adapter.fetchSymbol('USDVND=X');

      expect(result).not.toBeNull();
      expect(result!.price).toBeGreaterThan(20_000);
      await sleep(2_000);
    });

    itLive('fetchSymbol(^GSPC) returns S&P 500 index', async () => {
      const { YahooFxIndicesAdapter } = await import(
        '../../../src/infrastructure/scrapers/yahoo-finance-fx-indices.js'
      );
      const adapter = new YahooFxIndicesAdapter();
      const result = await adapter.fetchSymbol('^GSPC');

      expect(result).not.toBeNull();
      expect(result!.price).toBeGreaterThan(1000); // S&P 500 always >1000
      await sleep(2_000);
    });
  });

  describe('CnbcWorldMarketsAdapter', () => {
    itLive('fetchQuote(SP500) returns valid CNBC quote', async () => {
      const { CnbcWorldMarketsAdapter } = await import(
        '../../../src/infrastructure/scrapers/cnbc-world-markets.js'
      );
      const adapter = new CnbcWorldMarketsAdapter();
      const result = await adapter.fetchQuote('SP500');

      // CNBC quote API may return null for some symbols depending on market hours
      if (result !== null) {
        expect(result.symbol).toBeTruthy();
        expect(result.last).toBeTruthy();
        expect(result.fetchedAt).toBeTruthy();
      }
      await sleep(2_000);
    });
  });

  describe('TradingEconomicsVnAdapter', () => {
    itLive('fetchIndicator(gdp) returns Vietnam GDP Dataset', async () => {
      const { TradingEconomicsVnAdapter } = await import(
        '../../../src/infrastructure/scrapers/trading-economics-vn.js'
      );
      const adapter = new TradingEconomicsVnAdapter();
      const result = await adapter.fetchIndicator('gdp');

      expect(result).not.toBeNull();
      expect(result!.name.toLowerCase()).toContain('vietnam');
      expect(result!.temporalCoverage).toBeTruthy();
      await sleep(3_000);
    });
  });

  describe('FredMacroAdapter (requires FRED_API_KEY)', () => {
    itLive('fetchSeries(FEDFUNDS) returns observations when key set', async () => {
      if (!process.env['FRED_API_KEY']) {
        console.log('[live] FRED_API_KEY not set — skipping FRED live test');
        return;
      }
      const { FredMacroAdapter } = await import(
        '../../../src/infrastructure/scrapers/fred-macro.js'
      );
      const adapter = new FredMacroAdapter();

      if (!adapter.isAvailable()) {
        console.log('[live] FRED key not 32 chars — skipping');
        return;
      }

      const result = await adapter.fetchSeries('FEDFUNDS', 3);
      expect(result).not.toBeNull();
      expect(result!.observations.length).toBeGreaterThan(0);
      expect(result!.observations[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      await sleep(1_000);
    });
  });

  describe('AdbKidbAdapter', () => {
    // ADB KIDB API is slow (~15-20s per request) — use 45s timeout
    itLiveSlow('fetchIndicator(EO_NA_CONST_GOO, NGDP_R_PTX_PS) returns VN GDP growth', async () => {
      const { AdbKidbAdapter } = await import(
        '../../../src/infrastructure/scrapers/adb-kidb.js'
      );
      const adapter = new AdbKidbAdapter();

      const result = await adapter.fetchIndicator('EO_NA_CONST_GOO', 'NGDP_R_PTX_PS');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.year).toMatch(/^\d{4}$/);
      expect(typeof result[0]!.value).toBe('number');
      // Vietnam GDP growth should be positive in recent years
      const latest = result.at(-1)!;
      expect(latest.value).toBeGreaterThan(0);
      await sleep(2_000);
    });

    itLiveSlow('fetchIndicator(MFP_PR, PCPI_PC_PP_PT) returns VN CPI', async () => {
      const { AdbKidbAdapter } = await import(
        '../../../src/infrastructure/scrapers/adb-kidb.js'
      );
      const adapter = new AdbKidbAdapter();

      const result = await adapter.fetchIndicator('MFP_PR', 'PCPI_PC_PP_PT');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      // CPI % change should be a realistic inflation number (0-20% for VN)
      const latest = result.at(-1)!;
      expect(latest.value).toBeGreaterThan(-5);
      expect(latest.value).toBeLessThan(30);
      await sleep(2_000);
    });
  });

  describe('ImfWeoAdapter', () => {
    itLive('fetchIndicator(NGDP_RPCH) returns VN GDP growth + forecasts', async () => {
      const { ImfWeoAdapter } = await import(
        '../../../src/infrastructure/scrapers/imf-weo.js'
      );
      const adapter = new ImfWeoAdapter();

      const result = await adapter.fetchIndicator('NGDP_RPCH');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(10); // Historical + forecasts
      expect(result[0]!.year).toMatch(/^\d{4}$/);
      // Should include forecast years
      const years = result.map((d) => d.year);
      expect(years).toContain('2025'); // WEO forecast year
      // Vietnam GDP growth reasonable bounds
      const year2024 = result.find((d) => d.year === '2024');
      if (year2024) {
        expect(year2024.value).toBeGreaterThan(0);
        expect(year2024.value).toBeLessThan(20);
      }
      await sleep(2_000);
    });

    itLive('fetchIndicator(PCPIPCH) returns VN inflation data', async () => {
      const { ImfWeoAdapter } = await import(
        '../../../src/infrastructure/scrapers/imf-weo.js'
      );
      const adapter = new ImfWeoAdapter();

      const result = await adapter.fetchIndicator('PCPIPCH');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(5);
      const recent = result.filter((d) => parseInt(d.year, 10) >= 2020);
      expect(recent.length).toBeGreaterThan(0);
      await sleep(2_000);
    });
  });
});
