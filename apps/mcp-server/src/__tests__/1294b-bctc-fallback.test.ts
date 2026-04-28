/**
 * Task 1294b: BCTC PDF Timeout Fallback to News Chain Signals
 *
 * RED tests only — GREEN implementation in fetchParseAndStoreBctc.ts + signalToBctcMapper.ts
 * Run: bun test 1294b-bctc-fallback.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { getDb, closeDb, initDatabase } from '../infrastructure/db/schema.js';
import { fetchParseAndStoreBctc } from '../application/usecases/fetchParseAndStoreBctc.js';
import type { Database } from 'bun:sqlite';

let db: Database;

beforeAll(async () => {
  // Use in-memory DB for tests
  Bun.env['DB_PATH'] = ':memory:';
  db = getDb();
  await initDatabase(db);
});

afterAll(() => {
  closeDb();
});

describe('1294b: BCTC PDF Timeout Fallback', () => {

  test('RED 1: PDF timeout → query signals → create fallback row with news_inference', async () => {
    // SETUP: Insert mock signals with BCTC keywords
    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'news_scout',
      'market_watcher',
      'chain_catalyst',
      'VCB',
      '{}',
      JSON.stringify({
        event_type: 'earnings',
        direction: 'bullish',
        confidence: 0.8,
        affected_stocks: ['VCB'],
        affected_sectors: ['banking'],
        headline: 'VCB Revenue Growth Outperforms Expectations',
        source: 'reuters',
        newsSentiment: 0.6,
      }),
      '2026-04-23T10:00:00Z',
      '2026-04-30T23:59:59Z'
    );

    // SETUP: Insert second signal (≥2 required for fallback)
    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'market_watcher',
      'alert_commander',
      'price_confirmation',
      'VCB',
      '{}',
      JSON.stringify({
        price_change_pct: +2.5,
        volume_ratio: 1.8,
        confirms_direction: true,
        fully_priced: false,
        confidence: 0.75,
      }),
      '2026-04-23T11:00:00Z',
      '2026-04-30T23:59:59Z'
    );

    // MOCK: fetchParseAndStoreBctc with PDF timeout error
    // This requires mocking the PDF extraction to throw TimeoutError
    // In real test, would inject mock pdfHttpClient that times out
    const result = await fetchParseAndStoreBctc({
      actionCode: 'VCB',
      year: 2024,
      quarter: 'Q1',
      enableBctcFallback: true,
      pdfUrl: 'https://example.com/bctc.pdf', // Provide URL to skip SSC step
      // Mock: PDF extraction fails with timeout
      pdfHttpClient: {
        get: async () => {
          const err = new Error('PDF extraction timeout after 10s');
          (err as any).name = 'TimeoutError';
          throw err;
        },
      } as any,
    });

    // VERIFY: Fallback was used
    expect(result).not.toBeNull();
    expect(result?.fallback).toBe(true);
    expect(result?.extraction_method).toBe('news_inference');
    expect(result?.confidence).toBeGreaterThanOrEqual(0.45);
    expect(result?.confidence).toBeLessThanOrEqual(0.65);

    // VERIFY: Row inserted into financial_reports with correct metadata
    const row = db.prepare(`
      SELECT extraction_method, extraction_confidence, extraction_source_note
      FROM financial_reports
      WHERE action_code = ? AND sort_key = ?
      LIMIT 1
    `).get('VCB', '2024-Q1') as any;

    expect(row).toBeDefined();
    expect(row.extraction_method).toBe('news_inference');
    expect(row.extraction_confidence).toBeGreaterThanOrEqual(0.45);
    expect(row.extraction_source_note).toContain('chain signals');
    expect(row.extraction_source_note).toContain('PDF');
  });

  test('RED 2: Fallback disabled → throw timeout error instead of fallback', async () => {
    const promise = fetchParseAndStoreBctc({
      actionCode: 'HPG',
      year: 2024,
      quarter: 'Q2',
      enableBctcFallback: false, // Explicitly disabled
      pdfUrl: 'https://example.com/hpg.pdf',
      pdfHttpClient: {
        get: async () => {
          const err = new Error('PDF timeout');
          (err as any).name = 'TimeoutError';
          throw err;
        },
      } as any,
    });

    await expect(promise).rejects.toThrow(/timeout|extraction|error/i);
  });

  test('RED 3: Signals >7 days old → skip fallback (respect BCTC_FALLBACK_SIGNAL_MAX_AGE_DAYS)', async () => {
    Bun.env['BCTC_FALLBACK_SIGNAL_MAX_AGE_DAYS'] = '7';

    // SETUP: Insert old signal (created 10 days ago)
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'news_scout',
      'market_watcher',
      'chain_catalyst',
      'NVL',
      '{}',
      JSON.stringify({
        event_type: 'earnings',
        direction: 'bullish',
        confidence: 0.8,
        affected_stocks: ['NVL'],
        affected_sectors: ['real_estate'],
        headline: 'NVL Debt Ratio Improves',
        source: 'cafef',
        newsSentiment: 0.5,
      }),
      tenDaysAgo,
      tenDaysAgo // already expired
    );

    const result = await fetchParseAndStoreBctc({
      actionCode: 'NVL',
      year: 2024,
      quarter: 'Q1',
      enableBctcFallback: true,
      pdfUrl: 'https://example.com/nvl.pdf',
      pdfHttpClient: {
        get: async () => {
          const err = new Error('PDF timeout');
          (err as any).name = 'TimeoutError';
          throw err;
        },
      } as any,
    });

    // VERIFY: Fallback skipped (signals too old) → fetchParseAndStoreBctc returns null
    expect(result).toBeNull();

    // VERIFY: No row inserted
    const count = db.prepare(`
      SELECT COUNT(*) as cnt FROM financial_reports WHERE action_code = ? AND sort_key = ?
    `).get('NVL', '2024-Q1') as { cnt: number };
    expect(count.cnt).toBe(0);
  });

  test('RED 4: Contradictory signals (bullish + bearish) → skip fallback', async () => {
    // SETUP: Two signals with conflicting directions
    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'agent1',
      'agent2',
      'chain_catalyst',
      'HPG',
      '{}',
      JSON.stringify({
        event_type: 'earnings',
        direction: 'bullish',
        confidence: 0.8,
        affected_stocks: ['HPG'],
        affected_sectors: ['steel'],
        headline: 'HPG Revenue Up 20%',
        source: 'vnexpress',
        newsSentiment: 0.6,
      }),
      '2026-04-23T10:00:00Z',
      '2026-04-30T23:59:59Z'
    );

    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'agent1',
      'agent2',
      'chain_catalyst',
      'HPG',
      '{}',
      JSON.stringify({
        event_type: 'earnings',
        direction: 'bearish',
        confidence: 0.75,
        affected_stocks: ['HPG'],
        affected_sectors: ['steel'],
        headline: 'HPG Margin Compression Risk',
        source: 'cafef',
        newsSentiment: -0.4,
      }),
      '2026-04-23T11:00:00Z',
      '2026-04-30T23:59:59Z'
    );

    const result = await fetchParseAndStoreBctc({
      actionCode: 'HPG',
      year: 2024,
      quarter: 'Q3',
      enableBctcFallback: true,
      pdfUrl: 'https://example.com/hpg-q3.pdf',
      pdfHttpClient: {
        get: async () => {
          const err = new Error('PDF timeout');
          (err as any).name = 'TimeoutError';
          throw err;
        },
      } as any,
    });

    // VERIFY: Fallback skipped (contradictory signals) → fetchParseAndStoreBctc returns null
    expect(result).toBeNull();
  });

  test('RED 5: Only 1 signal with BCTC keywords → skip fallback (need ≥2)', async () => {
    // SETUP: Only 1 signal (need ≥2 credible signals)
    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'news_scout',
      'market_watcher',
      'chain_catalyst',
      'FPT',
      '{}',
      JSON.stringify({
        event_type: 'earnings',
        direction: 'bullish',
        confidence: 0.8,
        affected_stocks: ['FPT'],
        affected_sectors: ['tech'],
        headline: 'FPT Revenue Growth',
        source: 'reuters',
        newsSentiment: 0.6,
      }),
      '2026-04-23T10:00:00Z',
      '2026-04-30T23:59:59Z'
    );

    const result = await fetchParseAndStoreBctc({
      actionCode: 'FPT',
      year: 2024,
      quarter: 'Q1',
      enableBctcFallback: true,
      pdfUrl: 'https://example.com/fpt.pdf',
      pdfHttpClient: {
        get: async () => {
          const err = new Error('PDF timeout');
          (err as any).name = 'TimeoutError';
          throw err;
        },
      } as any,
    });

    // VERIFY: Fallback skipped (insufficient signals) → fetchParseAndStoreBctc returns null
    expect(result).toBeNull();
  });

  test('RED 6: Fallback extracts revenue_growth_qoq + margin_trend + debt_ratio_hint', async () => {
    // SETUP: Signals with extractable BCTC field hints
    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'news_scout',
      'market_watcher',
      'chain_catalyst',
      'VIC',
      '{}',
      JSON.stringify({
        event_type: 'earnings',
        direction: 'bullish',
        confidence: 0.8,
        affected_stocks: ['VIC'],
        affected_sectors: ['real_estate'],
        headline: 'VIC Revenue increased by 15%, margin expansion expected',
        source: 'vnexpress',
        newsSentiment: 0.7,
      }),
      '2026-04-23T10:00:00Z',
      '2026-04-30T23:59:59Z'
    );

    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'analyst',
      'market_watcher',
      'chain_catalyst',
      'VIC',
      '{}',
      JSON.stringify({
        event_type: 'earnings',
        direction: 'bullish',
        confidence: 0.75,
        affected_stocks: ['VIC'],
        affected_sectors: ['real_estate'],
        headline: 'VIC Debt ratio at 45%, debt reduction ongoing',
        source: 'cafef',
        newsSentiment: 0.5,
      }),
      '2026-04-23T11:00:00Z',
      '2026-04-30T23:59:59Z'
    );

    const result = await fetchParseAndStoreBctc({
      actionCode: 'VIC',
      year: 2024,
      quarter: 'Q2',
      enableBctcFallback: true,
      pdfUrl: 'https://example.com/vic.pdf',
      pdfHttpClient: {
        get: async () => {
          const err = new Error('PDF timeout');
          (err as any).name = 'TimeoutError';
          throw err;
        },
      } as any,
    });

    expect(result?.fallback).toBe(true);

    // VERIFY: Fields extracted from signals
    const row = db.prepare(`
      SELECT revenue_growth_qoq, margin_trend, debt_ratio_hint, extraction_source_note
      FROM financial_reports
      WHERE action_code = ? AND sort_key = ?
      LIMIT 1
    `).get('VIC', '2024-Q2') as any;

    expect(row).toBeDefined();
    expect(row.revenue_growth_qoq).not.toBeNull(); // Extracted from signal
    expect(row.margin_trend).not.toBeNull(); // +1 (expansion)
    expect(row.debt_ratio_hint).toBeCloseTo(45, 0); // Extracted: 45%
    expect(row.extraction_source_note).toContain('chain signals');
    expect(row.extraction_source_note).toContain('2');
  });

  test('RED 7: Temporal discount — signal mentions 2023 data for Q1-2024 → confidence reduced', async () => {
    // SETUP: Signal mentions outdated period
    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'news_scout',
      'market_watcher',
      'chain_catalyst',
      'BSR',
      '{}',
      JSON.stringify({
        event_type: 'earnings',
        direction: 'bullish',
        confidence: 0.8,
        affected_stocks: ['BSR'],
        affected_sectors: ['retail'],
        headline: 'BSR 2023 Revenue Up 20%, margins stable',
        source: 'reuters',
        newsSentiment: 0.6,
      }),
      '2026-04-23T10:00:00Z',
      '2026-04-30T23:59:59Z'
    );

    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'analyst',
      'market_watcher',
      'chain_catalyst',
      'BSR',
      '{}',
      JSON.stringify({
        event_type: 'earnings',
        direction: 'bullish',
        confidence: 0.75,
        affected_stocks: ['BSR'],
        affected_sectors: ['retail'],
        headline: 'BSR 2023 debt ratio declining',
        source: 'cafef',
        newsSentiment: 0.5,
      }),
      '2026-04-23T11:00:00Z',
      '2026-04-30T23:59:59Z'
    );

    const result = await fetchParseAndStoreBctc({
      actionCode: 'BSR',
      year: 2024,
      quarter: 'Q1',
      enableBctcFallback: true,
      pdfUrl: 'https://example.com/bsr.pdf',
      pdfHttpClient: {
        get: async () => {
          const err = new Error('PDF timeout');
          (err as any).name = 'TimeoutError';
          throw err;
        },
      } as any,
    });

    expect(result?.fallback).toBe(true);

    // VERIFY: Confidence reduced due to temporal mismatch
    const row = db.prepare(`
      SELECT extraction_confidence
      FROM financial_reports
      WHERE action_code = ? AND sort_key = ?
      LIMIT 1
    `).get('BSR', '2024-Q1') as any;

    expect(row.extraction_confidence).toBeLessThan(0.55); // Default 0.55 reduced by 0.8x multiplier
  });

  test('RED 8: E2E — OCR fails (fallback inserted), then succeeds → OCR overwrites news_inference', async () => {
    // SETUP: Signals available
    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'news_scout',
      'market_watcher',
      'chain_catalyst',
      'VJC',
      '{}',
      JSON.stringify({
        event_type: 'earnings',
        direction: 'bullish',
        confidence: 0.8,
        affected_stocks: ['VJC'],
        affected_sectors: ['aviation'],
        headline: 'VJC Revenue recovery underway',
        source: 'reuters',
        newsSentiment: 0.6,
      }),
      '2026-04-23T10:00:00Z',
      '2026-04-30T23:59:59Z'
    );

    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'analyst',
      'market_watcher',
      'chain_catalyst',
      'VJC',
      '{}',
      JSON.stringify({
        event_type: 'earnings',
        direction: 'bullish',
        confidence: 0.75,
        affected_stocks: ['VJC'],
        affected_sectors: ['aviation'],
        headline: 'VJC Debt management improving',
        source: 'cafef',
        newsSentiment: 0.5,
      }),
      '2026-04-23T11:00:00Z',
      '2026-04-30T23:59:59Z'
    );

    // FIRST CALL: PDF times out → fallback inserted
    const first = await fetchParseAndStoreBctc({
      actionCode: 'VJC',
      year: 2024,
      quarter: 'Q2',
      enableBctcFallback: true,
      pdfUrl: 'https://example.com/vjc.pdf',
      pdfHttpClient: {
        get: async () => {
          const err = new Error('PDF timeout');
          (err as any).name = 'TimeoutError';
          throw err;
        },
      } as any,
    });

    expect(first?.extraction_method).toBe('news_inference');

    // VERIFY: news_inference row inserted
    let row = db.prepare(`
      SELECT extraction_method FROM financial_reports WHERE action_code = ? AND sort_key = ?
    `).get('VJC', '2024-Q2') as any;
    expect(row.extraction_method).toBe('news_inference');

    // SECOND CALL: PDF now succeeds → OCR extraction succeeds
    const second = await fetchParseAndStoreBctc({
      actionCode: 'VJC',
      year: 2024,
      quarter: 'Q2',
      enableBctcFallback: true,
      pdfUrl: 'https://example.com/vjc.pdf',
      pdfTextOverride: 'balance sheet:\ntotal assets: 500000 million\nrevenue: 50000 million\nnet profit: 5000 million\ncash: 100 million', // Success with proper BCTC fields
    });

    expect(second).not.toBeNull();

    // VERIFY: OCR row overwrites (due to UNIQUE constraint on action_code + sort_key)
    row = db.prepare(`
      SELECT extraction_method FROM financial_reports WHERE action_code = ? AND sort_key = ?
    `).get('VJC', '2024-Q2') as any;
    expect(row.extraction_method).toBe('pdf-parse'); // pdfTextOverride bypasses OCR, stamps pdf-parse
  }, { timeout: 15000 });
});
