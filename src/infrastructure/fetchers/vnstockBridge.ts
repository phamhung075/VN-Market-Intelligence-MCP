/**
 * Infrastructure — vnstock Python Bridge Fetcher
 *
 * Calls vnstock Python library via subprocess to fetch VN stock data.
 * vnstock handles session cookies, WAF bypass, and API auth internally.
 *
 * Data sources (all via vnstock VCI backend):
 *   - Prices: OHLCV daily, intraday ticks
 *   - Finance: Income statement, balance sheet, cash flow, ratios (quarterly)
 *   - Company: Officers, shareholders, trading stats, events, news
 *
 * Strategy: vnstock = fast first look (available same day as BCTC filing)
 *           PDF = authoritative deep analysis (available when uploaded to SSC)
 *           Both feed the same pipeline. vnstock data is tagged source="vnstock".
 *
 * API key registered in: ~/.vnstock (managed by vnstock register_user)
 *
 * Layer: infrastructure/fetchers
 */

import { logger } from "../logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VnstockPrice {
  code: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  date: string;
  changePct: number;
}

export interface VnstockFinancials {
  code: string;
  yearReport: number;
  quarter: number;
  source: "vnstock";
  // Income statement
  revenue: number;           // billion VND
  revenueYoY: number;        // %
  netProfit: number;          // billion VND
  netProfitYoY: number;      // %
  eps: number;                // VND
  // Ratios
  pe: number;
  pb: number;
  roe: number;               // %
  roa: number;               // %
  debtToEquity: number;
  netProfitMargin: number;   // %
  // Banking specific
  nim: number | null;         // % (null for non-bank)
  npl: number | null;         // % (null for non-bank)
  fetchedAt: string;
}

export interface VnstockTradingStats {
  code: string;
  foreignRoom: number;
  foreignVolume: number;
  currentHoldingRatio: number;
  maxHoldingRatio: number;
  avgVolume2w: number;
  high52w: number;
  low52w: number;
  pctFromHigh52w: number;
  pctFromLow52w: number;
  fetchedAt: string;
}

export interface VnstockOfficer {
  code: string;
  name: string;
  position: string;
  ownPercent: number;
  quantity: number;
}

export interface VnstockShareholder {
  code: string;
  name: string;
  quantity: number;
  ownPercent: number;
}

export interface VnstockEvent {
  code: string;
  eventName: string;
  eventDate: string;   // ISO date "YYYY-MM-DD"
  eventType: string;   // "Dividend", "AGM", "Share Issuance", etc.
  description: string;
}

export interface VnstockIntradayTick {
  code: string;
  /** ISO datetime of the tick */
  time: string;
  /** Price in VND (vnstock raw × 1000) */
  price: number;
  volume: number;
  /** "Buy" | "Sell" | "Unknown" */
  matchType: string;
}

export interface VnstockOrderBook {
  code: string;
  /** Top 10 bid levels (price in VND × 1000) */
  bids: Array<{ price: number; volume: number }>;
  /** Top 10 ask levels (price in VND × 1000) */
  asks: Array<{ price: number; volume: number }>;
  bidTotal: number;
  askTotal: number;
  /** bidTotal / askTotal — > 1 means more buy-side pressure */
  imbalanceRatio: number;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Python helper: run script and parse JSON
// ---------------------------------------------------------------------------

async function runPython<T>(script: string, label: string): Promise<T | null> {
  try {
    const proc = Bun.spawn(["python3", "-c", script], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    if (stderr.trim()) {
      logger.warn(`[vnstock:${label}] stderr`, { stderr: stderr.slice(0, 300) });
    }

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      logger.warn(`[vnstock:${label}] exit code ${exitCode}`);
      return null;
    }

    const trimmed = stdout.trim();
    if (!trimmed || trimmed === "null") return null;
    return JSON.parse(trimmed) as T;
  } catch (err) {
    logger.warn(`[vnstock:${label}] error`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. Prices
// ---------------------------------------------------------------------------

const PRICE_SCRIPT = (symbols: string[], days: number) => `
import json, sys
try:
    from vnstock import Vnstock
    from datetime import datetime, timedelta
    end = datetime.now().strftime('%Y-%m-%d')
    start = (datetime.now() - timedelta(days=${days})).strftime('%Y-%m-%d')
    results = []
    for sym in ${JSON.stringify(symbols)}:
        try:
            stock = Vnstock().stock(symbol=sym, source='VCI')
            df = stock.quote.history(start=start, end=end, interval='1D')
            if df is not None and len(df) > 0:
                last = df.iloc[-1]
                prev_close = df.iloc[-2]['close'] if len(df) > 1 else last['open']
                change_pct = ((last['close'] - prev_close) / prev_close * 100) if prev_close > 0 else 0
                results.append({
                    'code': sym,
                    'open': float(last['open']) * 1000,
                    'high': float(last['high']) * 1000,
                    'low': float(last['low']) * 1000,
                    'close': float(last['close']) * 1000,
                    'volume': int(last['volume']),
                    'date': str(last['time'])[:10],
                    'changePct': round(change_pct, 2)
                })
        except Exception as e:
            sys.stderr.write(f'vnstock error {sym}: {e}\\n')
    print(json.dumps(results))
except Exception as e:
    sys.stderr.write(f'vnstock fatal: {e}\\n')
    print('[]')
`;

export async function fetchVnstockPrices(
  codes: string[],
  days = 3,
): Promise<VnstockPrice[]> {
  if (codes.length === 0) return [];
  const result = await runPython<VnstockPrice[]>(PRICE_SCRIPT(codes, days), "prices");
  if (result) {
    logger.info("[vnstock] fetched prices", { requested: codes.length, received: result.length });
  }
  return result ?? [];
}

// ---------------------------------------------------------------------------
// 2. Financials (Income + Ratios) — the "fast BCTC"
// ---------------------------------------------------------------------------

const FINANCE_SCRIPT = (symbol: string) => `
import json, sys
try:
    from vnstock import Vnstock
    stock = Vnstock().stock(symbol='${symbol}', source='VCI')

    inc = stock.finance.income_statement(period='quarter')
    ratio = stock.finance.ratio(period='quarter')

    if inc is None or len(inc) == 0:
        print('null')
        sys.exit(0)

    last = inc.iloc[0]
    r = ratio.iloc[0] if ratio is not None and len(ratio) > 0 else None

    rev = float(last.get('Revenue (Bn. VND)', 0) or 0)
    net = float(last.get('Attributable to parent company', 0) or 0)

    # Ratios - handle multi-level columns
    pe = pb = roe = roa = de = npm = 0.0
    nim_val = npl_val = None
    if r is not None:
        try:
            pe = float(r.get(('Chỉ tiêu định giá', 'P/E'), 0) or 0)
            pb = float(r.get(('Chỉ tiêu định giá', 'P/B'), 0) or 0)
            roe = float(r.get(('Chỉ tiêu khả năng sinh lợi', 'ROE (%)'), 0) or 0)
            roa = float(r.get(('Chỉ tiêu khả năng sinh lợi', 'ROA (%)'), 0) or 0)
            de = float(r.get(('Chỉ tiêu cơ cấu nguồn vốn', 'Debt/Equity'), 0) or 0)
            npm = float(r.get(('Chỉ tiêu khả năng sinh lợi', 'Net Profit Margin (%)'), 0) or 0)
        except: pass

    result = {
        'code': '${symbol}',
        'yearReport': int(last.get('yearReport', 0)),
        'quarter': int(last.get('lengthReport', 0)),
        'source': 'vnstock',
        'revenue': round(rev / 1e9, 2),
        'revenueYoY': round(float(last.get('Revenue YoY (%)', 0) or 0) * 100, 2),
        'netProfit': round(net / 1e9, 2),
        'netProfitYoY': round(float(last.get('Attribute to parent company YoY (%)', 0) or 0) * 100, 2),
        'eps': int(last.get('EPS_basis', 0) or 0),
        'pe': round(pe, 2),
        'pb': round(pb, 2),
        'roe': round(roe * 100, 2),
        'roa': round(roa * 100, 2),
        'debtToEquity': round(de, 2),
        'netProfitMargin': round(npm * 100, 2),
        'nim': None,
        'npl': None,
        'fetchedAt': __import__('datetime').datetime.now().isoformat()
    }
    print(json.dumps(result))
except Exception as e:
    sys.stderr.write(f'vnstock finance error: {e}\\n')
    print('null')
`;

export async function fetchVnstockFinancials(code: string): Promise<VnstockFinancials | null> {
  const result = await runPython<VnstockFinancials>(FINANCE_SCRIPT(code), `finance:${code}`);
  if (result) {
    logger.info("[vnstock] fetched financials", {
      code, year: result.yearReport, quarter: result.quarter,
      revenue: result.revenue, eps: result.eps,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// 3. Trading Stats (foreign room, 52-week range)
// ---------------------------------------------------------------------------

const TRADING_STATS_SCRIPT = (symbol: string) => `
import json, sys
try:
    from vnstock import Vnstock
    stock = Vnstock().stock(symbol='${symbol}', source='VCI')
    df = stock.company.trading_stats()
    if df is None or len(df) == 0:
        print('null')
        sys.exit(0)
    r = df.iloc[0]
    result = {
        'code': '${symbol}',
        'foreignRoom': int(r.get('foreign_room', 0) or 0),
        'foreignVolume': int(r.get('foreign_volume', 0) or 0),
        'currentHoldingRatio': round(float(r.get('current_holding_ratio', 0) or 0), 4),
        'maxHoldingRatio': round(float(r.get('max_holding_ratio', 0) or 0), 4),
        'avgVolume2w': int(r.get('avg_match_volume_2w', 0) or 0),
        'high52w': float(r.get('high_price_1y', 0) or 0) * 1000,
        'low52w': float(r.get('low_price_1y', 0) or 0) * 1000,
        'pctFromHigh52w': round(float(r.get('pct_high_change_1y', 0) or 0) * 100, 2),
        'pctFromLow52w': round(float(r.get('pct_low_change_1y', 0) or 0) * 100, 2),
        'fetchedAt': __import__('datetime').datetime.now().isoformat()
    }
    print(json.dumps(result))
except Exception as e:
    sys.stderr.write(f'vnstock trading_stats error: {e}\\n')
    print('null')
`;

export async function fetchVnstockTradingStats(code: string): Promise<VnstockTradingStats | null> {
  const result = await runPython<VnstockTradingStats>(TRADING_STATS_SCRIPT(code), `stats:${code}`);
  if (result) {
    logger.info("[vnstock] fetched trading stats", {
      code, foreignRoom: result.foreignRoom, high52w: result.high52w,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// 4. Officers (for insider tracking)
// ---------------------------------------------------------------------------

const OFFICERS_SCRIPT = (symbol: string) => `
import json, sys
try:
    from vnstock import Vnstock
    stock = Vnstock().stock(symbol='${symbol}', source='VCI')
    df = stock.company.officers()
    if df is None or len(df) == 0:
        print('[]')
        sys.exit(0)
    results = []
    for _, r in df.iterrows():
        results.append({
            'code': '${symbol}',
            'name': str(r.get('officer_name', '')),
            'position': str(r.get('officer_position', '')),
            'ownPercent': round(float(r.get('officer_own_percent', 0) or 0) * 100, 4),
            'quantity': int(r.get('quantity', 0) or 0)
        })
    print(json.dumps(results))
except Exception as e:
    sys.stderr.write(f'vnstock officers error: {e}\\n')
    print('[]')
`;

export async function fetchVnstockOfficers(code: string): Promise<VnstockOfficer[]> {
  const result = await runPython<VnstockOfficer[]>(OFFICERS_SCRIPT(code), `officers:${code}`);
  return result ?? [];
}

// ---------------------------------------------------------------------------
// 5. Shareholders
// ---------------------------------------------------------------------------

const SHAREHOLDERS_SCRIPT = (symbol: string) => `
import json, sys
try:
    from vnstock import Vnstock
    stock = Vnstock().stock(symbol='${symbol}', source='VCI')
    df = stock.company.shareholders()
    if df is None or len(df) == 0:
        print('[]')
        sys.exit(0)
    results = []
    for _, r in df.iterrows():
        results.append({
            'code': '${symbol}',
            'name': str(r.get('share_holder', '')),
            'quantity': int(r.get('quantity', 0) or 0),
            'ownPercent': round(float(r.get('share_own_percent', 0) or 0) * 100, 2)
        })
    print(json.dumps(results))
except Exception as e:
    sys.stderr.write(f'vnstock shareholders error: {e}\\n')
    print('[]')
`;

export async function fetchVnstockShareholders(code: string): Promise<VnstockShareholder[]> {
  const result = await runPython<VnstockShareholder[]>(SHAREHOLDERS_SCRIPT(code), `shareholders:${code}`);
  return result ?? [];
}

// ---------------------------------------------------------------------------
// 6. Intraday ticks — last 100 ticks
// ---------------------------------------------------------------------------

const INTRADAY_SCRIPT = (symbol: string) => `
import json, sys
try:
    from vnstock import Vnstock
    stock = Vnstock().stock(symbol='${symbol}', source='VCI')
    df = stock.quote.intraday()
    if df is None or len(df) == 0:
        print('[]')
        sys.exit(0)
    df = df.tail(100)
    results = []
    for _, r in df.iterrows():
        mt = str(r.get('match_type', 'Unknown'))
        if mt == 'Bu': mt = 'Buy'
        elif mt == 'Se': mt = 'Sell'
        results.append({
            'code': '${symbol}',
            'time': str(r.get('time', r.get('datetime', ''))),
            'price': float(r.get('price', 0)) * 1000,
            'volume': int(r.get('volume', 0)),
            'matchType': mt
        })
    print(json.dumps(results))
except Exception as e:
    sys.stderr.write(f'vnstock intraday error: {e}\\n')
    print('[]')
`;

export async function fetchVnstockIntraday(code: string): Promise<VnstockIntradayTick[]> {
  const result = await runPython<VnstockIntradayTick[]>(INTRADAY_SCRIPT(code), `intraday:${code}`);
  if (result && result.length > 0) {
    logger.info("[vnstock] fetched intraday ticks", { code, count: result.length });
  }
  return result ?? [];
}

// ---------------------------------------------------------------------------
// 7. Order book (price depth)
// ---------------------------------------------------------------------------

const ORDER_BOOK_SCRIPT = (symbol: string) => `
import json, sys
try:
    from vnstock import Vnstock
    stock = Vnstock().stock(symbol='${symbol}', source='VCI')
    df = stock.quote.price_depth()
    if df is None or len(df) == 0:
        print('null')
        sys.exit(0)
    bids = []
    asks = []
    for _, r in df.iterrows():
        side = str(r.get('side', r.get('type', ''))).lower()
        price = float(r.get('price', 0)) * 1000
        vol = int(r.get('volume', r.get('quantity', 0)))
        if side in ('bid', 'buy', 'b'):
            bids.append({'price': price, 'volume': vol})
        elif side in ('ask', 'sell', 's'):
            asks.append({'price': price, 'volume': vol})
    bids = sorted(bids, key=lambda x: -x['price'])[:10]
    asks = sorted(asks, key=lambda x: x['price'])[:10]
    bid_total = sum(b['volume'] for b in bids)
    ask_total = sum(a['volume'] for a in asks)
    imbalance = bid_total / ask_total if ask_total > 0 else 0
    result = {
        'code': '${symbol}',
        'bids': bids,
        'asks': asks,
        'bidTotal': bid_total,
        'askTotal': ask_total,
        'imbalanceRatio': round(imbalance, 4),
        'fetchedAt': __import__('datetime').datetime.now().isoformat()
    }
    print(json.dumps(result))
except Exception as e:
    sys.stderr.write(f'vnstock price_depth error: {e}\\n')
    print('null')
`;

export async function fetchVnstockOrderBook(code: string): Promise<VnstockOrderBook | null> {
  const result = await runPython<VnstockOrderBook>(ORDER_BOOK_SCRIPT(code), `orderbook:${code}`);
  if (result) {
    logger.info("[vnstock] fetched order book", {
      code, bids: result.bids.length, asks: result.asks.length,
      imbalanceRatio: result.imbalanceRatio,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// 8. Corporate Events
// ---------------------------------------------------------------------------

const EVENTS_SCRIPT = (symbol: string) => `
import json, sys
try:
    from vnstock import Vnstock
    stock = Vnstock().stock(symbol='${symbol}', source='VCI')
    df = stock.company.events()
    if df is None or len(df) == 0:
        print('[]')
        sys.exit(0)
    results = []
    for _, r in df.iterrows():
        event_date = str(r.get('event_date', r.get('exrights_date', r.get('date', '')))).strip()
        if event_date and len(event_date) >= 10:
            event_date = event_date[:10]
        else:
            continue
        results.append({
            'code': '${symbol}',
            'eventName': str(r.get('event_name', r.get('title', ''))),
            'eventDate': event_date,
            'eventType': str(r.get('event_type', r.get('type', 'Other'))),
            'description': str(r.get('description', r.get('content', '')))
        })
    print(json.dumps(results))
except Exception as e:
    sys.stderr.write(f'vnstock events error: {e}\\n')
    print('[]')
`;

export async function fetchVnstockEvents(code: string): Promise<VnstockEvent[]> {
  const result = await runPython<VnstockEvent[]>(EVENTS_SCRIPT(code), `events:${code}`);
  if (result && result.length > 0) {
    logger.info("[vnstock] fetched events", { code, count: result.length });
  }
  return result ?? [];
}

// ---------------------------------------------------------------------------
// 9. Batch: all data for one stock (for morning briefing / on-demand)
// ---------------------------------------------------------------------------

export interface VnstockFullSnapshot {
  price: VnstockPrice | null;
  financials: VnstockFinancials | null;
  tradingStats: VnstockTradingStats | null;
  officers: VnstockOfficer[];
  shareholders: VnstockShareholder[];
}

export async function fetchVnstockSnapshot(code: string): Promise<VnstockFullSnapshot> {
  const [prices, financials, tradingStats, officers, shareholders] = await Promise.all([
    fetchVnstockPrices([code]),
    fetchVnstockFinancials(code),
    fetchVnstockTradingStats(code),
    fetchVnstockOfficers(code),
    fetchVnstockShareholders(code),
  ]);

  return {
    price: prices[0] ?? null,
    financials,
    tradingStats,
    officers,
    shareholders,
  };
}
