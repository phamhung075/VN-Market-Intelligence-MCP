/**
 * 1292-hose-staleness.test.ts — RED Phase
 *
 * Test suite for HOSE price staleness detection logic.
 * All 4 test cases assert against NOT-YET-IMPLEMENTED functions
 * in src/application/services/market-data/marketDataValidator.ts
 *
 * Baseline: 6321 assertions
 * Expected: 6333 assertions (+12)
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { getDb, initDatabase, closeDb } from '../infrastructure/db/schema.js';

describe('HOSE Staleness Detection (RED Phase)', () => {
  beforeEach(async () => {
    // Reset database to fresh in-memory instance for each test
    closeDb();
    Bun.env['DB_PATH'] = ':memory:';
    await initDatabase();
  });

  afterEach(async () => {
    // Cleanup
    closeDb();
  });

  describe('Test Case 1: isPriceFresh() returns true for recent HOSE prices', () => {
    test('should return true when max(updated_at) is within 2h', async () => {
      const db = getDb();

      // Setup: Insert 2 rows with recent timestamps
      const now = new Date();
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
      const oneHour45MinutesAgo = new Date(now.getTime() - 105 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO market_prices (code, price, updated_at, exchange)
        VALUES (?, ?, ?, 'HOSE')
      `).run('VNM', 100.0, thirtyMinutesAgo);

      db.prepare(`
        INSERT INTO market_prices (code, price, updated_at, exchange)
        VALUES (?, ?, ?, 'HOSE')
      `).run('FPT', 95.0, oneHour45MinutesAgo);

      // Import the NOT-YET-IMPLEMENTED function
      const { isPriceFresh } = await import(
        '../application/services/market-data/marketDataValidator.js'
      );

      // RED assertion: function should return true (prices are within 2h)
      const fresh = isPriceFresh({
        maxAgeMs: 2 * 60 * 60 * 1000, // 2 hours in milliseconds
      });

      expect(fresh).toBe(true);
    });
  });

  describe('Test Case 2: isPriceFresh() returns false for stale HOSE prices', () => {
    test('should return false when max(updated_at) exceeds 2h', async () => {
      const db = getDb();

      // Setup: Insert 1 row with stale timestamp
      const now = new Date();
      const twoHours30MinutesAgo = new Date(
        now.getTime() - 2.5 * 60 * 60 * 1000
      ).toISOString();

      db.prepare(`
        INSERT INTO market_prices (code, price, updated_at, exchange)
        VALUES (?, ?, ?, 'HOSE')
      `).run('VNM', 100.0, twoHours30MinutesAgo);

      // Import the NOT-YET-IMPLEMENTED function
      const { isPriceFresh } = await import(
        '../application/services/market-data/marketDataValidator.js'
      );

      // RED assertion: function should return false (prices are >2h old)
      const fresh = isPriceFresh({
        maxAgeMs: 2 * 60 * 60 * 1000, // 2 hours in milliseconds
      });

      expect(fresh).toBe(false);
    });
  });

  describe('Test Case 3: getMarketDataStalenessStatus() returns { isFresh, ageMs, statusLabel }', () => {
    test('should return detailed status object with all properties and correct values', async () => {
      const db = getDb();

      // Setup: Insert 1 row with very stale timestamp
      const now = new Date();
      const threeHoursAgo = new Date(
        now.getTime() - 3 * 60 * 60 * 1000
      ).toISOString();

      db.prepare(`
        INSERT INTO market_prices (code, price, updated_at, exchange)
        VALUES (?, ?, ?, 'HOSE')
      `).run('VNM', 100.0, threeHoursAgo);

      // Import the NOT-YET-IMPLEMENTED function
      const { getMarketDataStalenessStatus } = await import(
        '../application/services/market-data/marketDataValidator.js'
      );

      // RED assertion: function should return detailed status object
      const status = getMarketDataStalenessStatus({
        maxAgeMs: 2 * 60 * 60 * 1000, // 2 hours threshold
      });

      // Property assertions (3 assertions)
      expect(status).toHaveProperty('isFresh');
      expect(status).toHaveProperty('ageMs');
      expect(status).toHaveProperty('statusLabel');

      // Value assertions (4 assertions total in test case)
      expect(status.isFresh).toBe(false); // 3h > 2h threshold
      expect(status.statusLabel).toMatch(/stale|degraded/i);
    });
  });

  describe('Test Case 4: suppressPriceAlerts() returns true when isFresh=false', () => {
    test('should suppress price-based alerts during staleness', async () => {
      // Setup: Create a mock price alert with isFresh=false
      const mockAlert = {
        code: 'VNM',
        type: 'breakout' as const,
        severity: 'HIGH' as const,
      };

      // Import the NOT-YET-IMPLEMENTED function
      const { suppressPriceAlerts } = await import(
        '../application/services/market-data/marketDataValidator.js'
      );

      // RED assertion: function should suppress price-based alerts when isFresh=false
      const shouldSuppress = suppressPriceAlerts({
        isFresh: false,
        alert: mockAlert,
      });

      expect(shouldSuppress).toBe(true);
    });
  });
});
