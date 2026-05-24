/**
 * Kinh Dich Service — Integration Tests (real handler, mock repos)
 *
 * Tests HTTP routing with real Hono handlers but mock use cases.
 *
 * P2-KD-G: createRouter now requires 6 use cases. Tests pass stub impls for
 * the 4 new use cases (historyUseCase, transitionsUseCase, backtestUseCase,
 * explainUseCase) — new endpoints covered by dedicated tests below.
 */

import { describe, it, expect, mock } from 'bun:test';
import { createRouter } from '../../interface/handlers.js';
import type {
  ReadingUseCase,
  MarketHexagramUseCase,
  ReadingHistoryUseCase,
  HexagramTransitionsUseCase,
  HexagramBacktestUseCase,
  HexagramExplainUseCase,
} from '../../application/usecases.js';
import { HexagramNotFoundError, InsufficientDataError } from '../../domain/errors.js';
import type {
  ReadingResponse,
  MarketReadingResponse,
  HistoryResponse,
  TransitionsResponse,
  BacktestResponse,
  ExplainResponse,
} from '../../application/dtos.js';

// ── Sample fixtures ────────────────────────────────────────────────────────────

const SAMPLE_READING: ReadingResponse = {
  stock: 'VCB',
  hexagram: 11,
  name: 'Thai',
  trend: 'THUẬN LỢI — mạnh',
  signal: 'MUA (tích cực)',
  confidence: 0.75,
  actionNote: 'KHUYẾN NGHỊ: MUA',
  overallReading: '[VCB] Quẻ Thai...',
  timestamp: '2026-04-24T00:00:00.000Z',
};

const SAMPLE_MARKET: MarketReadingResponse = {
  hexagram: 54,
  name: 'Gui Mei',
  trend: 'BẤT LỢI',
  signal: 'GIU (tiêu cực)',
  confidence: 0.6,
  timestamp: '2026-04-24T00:00:00.000Z',
};

const STUB_HISTORY: HistoryResponse = {
  stock: 'VCB',
  days: 30,
  total: 0,
  readings: [],
  mostFrequent: 'N/A',
};

const STUB_TRANSITIONS: TransitionsResponse = {
  hexagram: 1,
  name: 'Kiền',
  stock: 'VNINDEX',
  transitions: [],
};

const STUB_BACKTEST: BacktestResponse = {
  stock: 'VCB',
  days: 30,
  totalReadings: 0,
  accuracy: 0,
  avgReturn5d: 0,
  bestHexagram: null,
  worstHexagram: null,
};

const STUB_EXPLAIN: ExplainResponse = {
  number: 1,
  name: 'Kiền',
  chinese: '乾',
  upper: 'Qian',
  lower: 'Qian',
  coreMeaning: 'Que 1 — Kiền (乾): Thượng quán Qian, Hạ quán Qian',
  trend: 'THUẬN LỢI',
  tradingContext: 'Nhận định giao dịch: Dương quẻ — xu hướng tích cực, xem xét MUA',
};

// ── Use-case factory helpers ───────────────────────────────────────────────────

function makeReadingUseCase(result: ReadingResponse | Error): ReadingUseCase {
  return {
    execute: mock(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  } as unknown as ReadingUseCase;
}

function makeMarketUseCase(result: MarketReadingResponse | Error): MarketHexagramUseCase {
  return {
    execute: mock(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  } as unknown as MarketHexagramUseCase;
}

function makeHistoryUseCase(result: HistoryResponse | Error): ReadingHistoryUseCase {
  return {
    execute: mock(() => {
      if (result instanceof Error) throw result;
      return result;
    }),
  } as unknown as ReadingHistoryUseCase;
}

function makeTransitionsUseCase(result: TransitionsResponse | Error): HexagramTransitionsUseCase {
  return {
    execute: mock(() => {
      if (result instanceof Error) throw result;
      return result;
    }),
  } as unknown as HexagramTransitionsUseCase;
}

function makeBacktestUseCase(result: BacktestResponse | Error): HexagramBacktestUseCase {
  return {
    execute: mock(() => {
      if (result instanceof Error) throw result;
      return result;
    }),
  } as unknown as HexagramBacktestUseCase;
}

function makeExplainUseCase(result: ExplainResponse | Error): HexagramExplainUseCase {
  return {
    execute: mock(() => {
      if (result instanceof Error) throw result;
      return result;
    }),
  } as unknown as HexagramExplainUseCase;
}

/** Default router with SAMPLE_READING / SAMPLE_MARKET, stub new use cases. */
function makeDefaultRouter(
  readingResult: ReadingResponse | Error = SAMPLE_READING,
  marketResult: MarketReadingResponse | Error = SAMPLE_MARKET,
) {
  return createRouter(
    makeReadingUseCase(readingResult),
    makeMarketUseCase(marketResult),
    makeHistoryUseCase(STUB_HISTORY),
    makeTransitionsUseCase(STUB_TRANSITIONS),
    makeBacktestUseCase(STUB_BACKTEST),
    makeExplainUseCase(STUB_EXPLAIN),
  );
}

// ── GET /health ───────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with service info', async () => {
    const app = makeDefaultRouter();
    const res = await app.fetch(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; service: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('kinh-dich-service');
  });
});

// ── GET /reading/:code ────────────────────────────────────────────────────────

describe('GET /reading/:code', () => {
  it('returns 200 with reading for valid code', async () => {
    const app = makeDefaultRouter();
    const res = await app.fetch(new Request('http://localhost/reading/VCB?days=30'));
    expect(res.status).toBe(200);
    const body = await res.json() as ReadingResponse;
    expect(body.stock).toBe('VCB');
    expect(body.hexagram).toBe(11);
    expect(body.confidence).toBe(0.75);
  });

  it('returns 404 when hexagram not found', async () => {
    const app = makeDefaultRouter(new HexagramNotFoundError('UNKNOWN'));
    const res = await app.fetch(new Request('http://localhost/reading/UNKNOWN'));
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid days param', async () => {
    const app = makeDefaultRouter();
    const res = await app.fetch(new Request('http://localhost/reading/VCB?days=-5'));
    expect(res.status).toBe(400);
  });

  it('normalises stock code to uppercase', async () => {
    let capturedCode = '';
    const uc = {
      execute: mock(async ({ stockCode }: { stockCode: string }) => {
        capturedCode = stockCode;
        return SAMPLE_READING;
      }),
    } as unknown as ReadingUseCase;
    const app = createRouter(
      uc,
      makeMarketUseCase(SAMPLE_MARKET),
      makeHistoryUseCase(STUB_HISTORY),
      makeTransitionsUseCase(STUB_TRANSITIONS),
      makeBacktestUseCase(STUB_BACKTEST),
      makeExplainUseCase(STUB_EXPLAIN),
    );
    await app.fetch(new Request('http://localhost/reading/vcb'));
    expect(capturedCode).toBe('VCB');
  });
});

// ── GET /market ───────────────────────────────────────────────────────────────

describe('GET /market', () => {
  it('returns 200 with market reading', async () => {
    const app = makeDefaultRouter();
    const res = await app.fetch(new Request('http://localhost/market'));
    expect(res.status).toBe(200);
    const body = await res.json() as MarketReadingResponse;
    expect(body.hexagram).toBe(54);
    expect(body.name).toBe('Gui Mei');
  });

  it('returns 422 when insufficient data', async () => {
    const app = makeDefaultRouter(SAMPLE_READING, new InsufficientDataError('VNINDEX', 30));
    const res = await app.fetch(new Request('http://localhost/market'));
    expect(res.status).toBe(422);
  });
});

// ── GET /readings/:code/history ───────────────────────────────────────────────

describe('GET /readings/:code/history', () => {
  it('returns 200 with history response', async () => {
    const app = makeDefaultRouter();
    const res = await app.fetch(new Request('http://localhost/readings/VCB/history?days=30'));
    expect(res.status).toBe(200);
    const body = await res.json() as HistoryResponse;
    expect(body.stock).toBe('VCB');
    expect(body.days).toBe(30);
    expect(Array.isArray(body.readings)).toBe(true);
  });

  it('returns 400 for invalid days param', async () => {
    const app = makeDefaultRouter();
    const res = await app.fetch(new Request('http://localhost/readings/VCB/history?days=0'));
    expect(res.status).toBe(400);
  });
});

// ── GET /hexagram/:number/transitions ─────────────────────────────────────────

describe('GET /hexagram/:number/transitions', () => {
  it('returns 200 with transitions response', async () => {
    const app = makeDefaultRouter();
    const res = await app.fetch(new Request('http://localhost/hexagram/1/transitions'));
    expect(res.status).toBe(200);
    const body = await res.json() as TransitionsResponse;
    expect(body.hexagram).toBe(1);
    expect(Array.isArray(body.transitions)).toBe(true);
  });

  it('returns 400 for hexagram number out of range', async () => {
    const app = makeDefaultRouter();
    const res = await app.fetch(new Request('http://localhost/hexagram/65/transitions'));
    expect(res.status).toBe(400);
  });
});

// ── GET /backtest/:code ───────────────────────────────────────────────────────

describe('GET /backtest/:code', () => {
  it('returns 200 with backtest response', async () => {
    const app = makeDefaultRouter();
    const res = await app.fetch(new Request('http://localhost/backtest/VCB'));
    expect(res.status).toBe(200);
    const body = await res.json() as BacktestResponse;
    expect(body.stock).toBe('VCB');
    expect(typeof body.accuracy).toBe('number');
  });

  it('returns 400 for invalid days param', async () => {
    const app = makeDefaultRouter();
    const res = await app.fetch(new Request('http://localhost/backtest/VCB?days=0'));
    expect(res.status).toBe(400);
  });
});

// ── GET /hexagram/:number/explain ─────────────────────────────────────────────

describe('GET /hexagram/:number/explain', () => {
  it('returns 200 with explain response', async () => {
    const app = makeDefaultRouter();
    const res = await app.fetch(new Request('http://localhost/hexagram/1/explain'));
    expect(res.status).toBe(200);
    const body = await res.json() as ExplainResponse;
    expect(body.number).toBe(1);
    expect(body.name).toBe('Kiền');
  });

  it('returns 400 for hexagram number out of range', async () => {
    const app = makeDefaultRouter();
    const res = await app.fetch(new Request('http://localhost/hexagram/0/explain'));
    expect(res.status).toBe(400);
  });
});
