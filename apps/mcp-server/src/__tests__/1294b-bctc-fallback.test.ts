/**
 * Task 1294b: BCTC PDF Timeout Fallback to News Chain Signals
 *
 * RED tests only — GREEN implementation in fetchParseAndStoreBctc.ts + signalToBctcMapper.ts
 * Run: bun test 1294b-bctc-fallback.test.ts
 *
 * Note: signal created_at timestamps use dynamic relative dates so tests remain
 * valid regardless of wall-clock date. BCTC_FALLBACK_SIGNAL_MAX_AGE_DAYS is
 * reset after each test that mutates it to prevent env bleed.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { getDb, closeDb, initDatabase } from '../infrastructure/db/schema.js';
import { fetchParseAndStoreBctc } from '../application/usecases/fetchParseAndStoreBctc.js';
import { tryNewsChainFallback } from '../application/usecases/bctc/newsChainFallback.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBctcFullTools } from '../interface/mcp/tools/financial-reports/bctcFullTools.js';
import type { Database } from 'bun:sqlite';

let db: Database;

// Dynamic helpers — produce timestamps relative to now so tests never go stale
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}
function daysAgo(d: number): string {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
}
function daysFromNow(d: number): string {
  return new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString();
}

// Reused from fix-bctc-identity-serve-guard.test.ts:38-53 — invoke a
// registered MCP tool directly, bypassing SSE transport.
async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const registry = (server as unknown as {
    _registeredTools: Record<string, {
      handler: (args: Record<string, unknown>) => Promise<unknown>;
    }>;
  })._registeredTools;
  const entry = registry[toolName];
  if (!entry) throw new Error(`Tool "${toolName}" not registered`);
  return entry.handler(args) as Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
}

beforeAll(async () => {
  // Use in-memory DB for tests
  Bun.env['DB_PATH'] = ':memory:';
  // Default window large enough for all "recent" signals
  Bun.env['BCTC_FALLBACK_SIGNAL_MAX_AGE_DAYS'] = '30';
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
      hoursAgo(2),
      daysFromNow(7)
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
      hoursAgo(1),
      daysFromNow(7)
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

    // VERIFY (FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET): NO row lands in
    // financial_reports — this fallback path never writes there anymore, since
    // the hardcoded all-zero balance sheet would be byte-indistinguishable from
    // OCR corruption at serve time.
    const frCount = db.prepare(`
      SELECT COUNT(*) as cnt FROM financial_reports WHERE action_code = ? AND sort_key = ?
    `).get('VCB', '2024-Q1') as { cnt: number };
    expect(frCount.cnt).toBe(0);

    // VERIFY: hint row landed in the new non-authoritative
    // bctc_news_fallback_hints table instead.
    const row = db.prepare(`
      SELECT confidence, extraction_source_note
      FROM bctc_news_fallback_hints
      WHERE action_code = ? AND sort_key = ?
      LIMIT 1
    `).get('VCB', '2024-Q1') as any;

    expect(row).toBeDefined();
    expect(row.confidence).toBeGreaterThanOrEqual(0.45);
    expect(row.confidence).toBeLessThanOrEqual(0.65);
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
    const tenDaysAgo = daysAgo(10);
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

    // Restore default window so subsequent tests are not affected
    Bun.env['BCTC_FALLBACK_SIGNAL_MAX_AGE_DAYS'] = '30';
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
      hoursAgo(3),
      daysFromNow(7)
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
      hoursAgo(2),
      daysFromNow(7)
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
      hoursAgo(1),
      daysFromNow(7)
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
      hoursAgo(2),
      daysFromNow(7)
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
      hoursAgo(1),
      daysFromNow(7)
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

    // VERIFY (FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET): the three
    // extracted hint fields land in bctc_news_fallback_hints, NOT
    // financial_reports — financial_reports stays at 0 rows for this period.
    const row = db.prepare(`
      SELECT revenue_growth_qoq, margin_trend, debt_ratio_hint, extraction_source_note
      FROM bctc_news_fallback_hints
      WHERE action_code = ? AND sort_key = ?
      LIMIT 1
    `).get('VIC', '2024-Q2') as any;

    expect(row).toBeDefined();
    expect(row.revenue_growth_qoq).not.toBeNull(); // Extracted from signal
    expect(row.margin_trend).not.toBeNull(); // +1 (expansion)
    expect(row.debt_ratio_hint).toBeCloseTo(45, 0); // Extracted: 45%
    expect(row.extraction_source_note).toContain('chain signals');
    expect(row.extraction_source_note).toContain('2');

    const frCount = db.prepare(`
      SELECT COUNT(*) as cnt FROM financial_reports WHERE action_code = ? AND sort_key = ?
    `).get('VIC', '2024-Q2') as { cnt: number };
    expect(frCount.cnt).toBe(0);
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
      hoursAgo(2),
      daysFromNow(7)
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
      hoursAgo(1),
      daysFromNow(7)
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

    // VERIFY (FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET): temporal-discount
    // -reduced confidence now lives in bctc_news_fallback_hints.confidence.
    const row = db.prepare(`
      SELECT confidence
      FROM bctc_news_fallback_hints
      WHERE action_code = ? AND sort_key = ?
      LIMIT 1
    `).get('BSR', '2024-Q1') as any;

    expect(row.confidence).toBeLessThan(0.55); // Default 0.55 reduced by 0.8x multiplier
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
      hoursAgo(2),
      daysFromNow(7)
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
      hoursAgo(1),
      daysFromNow(7)
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

    // VERIFY (FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET): NO row landed
    // in financial_reports on the fallback branch — instead a hints row landed
    // in bctc_news_fallback_hints. `extraction_source_note` non-null is the
    // "fallback ran" signal (this table has no extraction_method column).
    let frRow = db.prepare(`
      SELECT id FROM financial_reports WHERE action_code = ? AND sort_key = ?
    `).get('VJC', '2024-Q2') as any;
    expect(frRow).toBeNull();

    let hintRow = db.prepare(`
      SELECT extraction_source_note FROM bctc_news_fallback_hints WHERE action_code = ? AND sort_key = ?
    `).get('VJC', '2024-Q2') as any;
    expect(hintRow).toBeDefined();
    expect(hintRow.extraction_source_note).not.toBeNull();

    // SECOND CALL: PDF now succeeds → OCR extraction succeeds
    // FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET fixture correction: the
    // original English pdfTextOverride text below never actually parsed as a
    // valid BCTC balance sheet (the extractor requires the Vietnamese labels,
    // e.g. "TỔNG CỘNG TÀI SẢN") — it always produced a zero-confidence/empty
    // extraction that storeReport() itself refuses to persist. Pre-fix, this
    // was masked: the FIRST call's fallback write had already created a
    // financial_reports row, and fetchParseAndStoreBctc.ts's separate "Bug
    // 1352a" extraction_method-only UPDATE stamped 'pdf-parse' onto that
    // pre-existing row regardless of storeReport()'s own guard verdict — so
    // the old assertion passed for the wrong reason. Now that the fallback
    // branch correctly never creates a financial_reports row, that masking
    // stale row is gone, exposing the fixture defect. Replaced with a real,
    // properly-labeled minimal Vietnamese BCTC text (same pattern as
    // 048-ssc-pipeline.test.ts's MINIMAL_BCTC_TEXT) so this call genuinely
    // succeeds — matching the test's own stated intent ("PDF now succeeds →
    // OCR extraction succeeds").
    const second = await fetchParseAndStoreBctc({
      actionCode: 'VJC',
      year: 2024,
      quarter: 'Q2',
      enableBctcFallback: true,
      pdfUrl: 'https://example.com/vjc.pdf',
      pdfTextOverride: `
CÔNG TY CỔ PHẦN VJC
BÁO CÁO TÀI CHÍNH QUÝ 2/2024

BẢNG CÂN ĐỐI KẾ TOÁN
Tài sản ngắn hạn                                    50.000.000
  Tiền và tương đương tiền                            5.000.000
  Hàng tồn kho                                       12.000.000
TỔNG CỘNG TÀI SẢN                                   80.000.000

Nợ phải trả                                         30.000.000
  Vay và nợ thuê tài chính ngắn hạn                   8.000.000
  Vay và nợ thuê tài chính dài hạn                   10.000.000
Vốn chủ sở hữu                                      50.000.000
TỔNG CỘNG NGUỒN VỐN                                 80.000.000

BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Doanh thu thuần                                     39.500.000
Giá vốn hàng bán                                    25.000.000
Lợi nhuận gộp                                       14.500.000
Lợi nhuận thuần từ hoạt động kinh doanh              8.500.000
Lợi nhuận trước thuế                                 8.600.000
Thuế TNDN hiện hành                                  1.720.000
Lợi nhuận sau thuế                                   6.880.000

BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Lưu chuyển tiền thuần từ hoạt động kinh doanh        5.880.000
Lưu chuyển tiền thuần từ hoạt động đầu tư           (3.000.000)
Lưu chuyển tiền thuần từ hoạt động tài chính         1.000.000
Tiền và tương đương tiền đầu kỳ                      4.000.000
Tiền và tương đương tiền cuối kỳ                     7.880.000
`,
    });

    expect(second).not.toBeNull();

    // VERIFY: normal storeReport() path — a plain FIRST insert into
    // financial_reports (nothing existed there before; not a "transition").
    const row = db.prepare(`
      SELECT extraction_method FROM financial_reports WHERE action_code = ? AND sort_key = ?
    `).get('VJC', '2024-Q2') as any;
    expect(row.extraction_method).toBe('pdf-parse'); // pdfTextOverride bypasses OCR, stamps pdf-parse

    // VERIFY: the earlier hints-table row from the first call is still present
    // — harmless history, no cross-table cleanup required (no requirement demands it).
    hintRow = db.prepare(`
      SELECT extraction_source_note FROM bctc_news_fallback_hints WHERE action_code = ? AND sort_key = ?
    `).get('VJC', '2024-Q2') as any;
    expect(hintRow).toBeDefined();
  }, { timeout: 15000 });

  test('FR-5: fallback branch never invokes insertAnalysisFn (RAG-non-leak, AC-6)', async () => {
    // SETUP: 2 confirming signals for a fresh ticker.
    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'news_scout', 'market_watcher', 'chain_catalyst', 'RAGCHK', '{}',
      JSON.stringify({
        event_type: 'earnings', direction: 'bullish', confidence: 0.8,
        affected_stocks: ['RAGCHK'], affected_sectors: ['tech'],
        headline: 'RAGCHK Revenue Growth Outperforms Expectations',
        source: 'reuters', newsSentiment: 0.6,
      }),
      hoursAgo(2), daysFromNow(7),
    );
    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'market_watcher', 'alert_commander', 'price_confirmation', 'RAGCHK', '{}',
      JSON.stringify({
        price_change_pct: 2.5, volume_ratio: 1.8,
        confirms_direction: true, fully_priced: false, confidence: 0.75,
      }),
      hoursAgo(1), daysFromNow(7),
    );

    let insertAnalysisCalled = false;
    const result = await fetchParseAndStoreBctc({
      actionCode: 'RAGCHK',
      year: 2024,
      quarter: 'Q1',
      enableBctcFallback: true,
      pdfUrl: 'https://example.com/ragchk.pdf',
      pdfHttpClient: {
        get: async () => {
          const e = new Error('timeout');
          (e as any).name = 'TimeoutError';
          throw e;
        },
      } as any,
      insertAnalysisFn: async () => { insertAnalysisCalled = true; },
    });

    expect(result?.fallback).toBe(true);
    expect(insertAnalysisCalled).toBe(false); // Step 4 must never fire on the fallback branch
  });

  test('AC-4/verification-gate(a): fallback hint recorded, get_bctc_full still serves honest absence, never CORRUPT', async () => {
    // SETUP: 2 confirming signals for a ticker with NO prior financial_reports row.
    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'news_scout', 'market_watcher', 'chain_catalyst', 'SERVEHINT', '{}',
      JSON.stringify({
        event_type: 'earnings', direction: 'bullish', confidence: 0.8,
        affected_stocks: ['SERVEHINT'], affected_sectors: ['tech'],
        headline: 'SERVEHINT Revenue Growth Outperforms Expectations',
        source: 'reuters', newsSentiment: 0.6,
      }),
      hoursAgo(2), daysFromNow(7),
    );
    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'market_watcher', 'alert_commander', 'price_confirmation', 'SERVEHINT', '{}',
      JSON.stringify({
        price_change_pct: 2.5, volume_ratio: 1.8,
        confirms_direction: true, fully_priced: false, confidence: 0.75,
      }),
      hoursAgo(1), daysFromNow(7),
    );

    const result = await tryNewsChainFallback('SERVEHINT', 2024, 'Q1');
    expect(result.fallback).toBe(true);

    const frCount = db.prepare(`
      SELECT COUNT(*) c FROM financial_reports WHERE action_code=? AND sort_key=?
    `).get('SERVEHINT', '2024-Q1') as { c: number };
    expect(frCount.c).toBe(0);

    const hintRow = db.prepare(`
      SELECT confidence FROM bctc_news_fallback_hints WHERE action_code=? AND sort_key=?
    `).get('SERVEHINT', '2024-Q1');
    expect(hintRow).not.toBeNull();

    // Serving-plane proof, not DB-plane-only (verification gate (a)'s explicit requirement):
    const server = new McpServer({ name: 't', version: '0.0.1' }, { capabilities: { tools: {} } });
    registerBctcFullTools(server);
    const res = await callTool(server, 'get_bctc_full', { code: 'SERVEHINT', year: 2024, quarter: 'Q1' });
    const text = res.content[0]!.text;
    expect(text).toContain('Chưa có dữ liệu BCTC'); // stable substring, EC-2
    expect(text).not.toContain('[CORRUPT DATA');      // never the corrupt-data marker
  });
});
