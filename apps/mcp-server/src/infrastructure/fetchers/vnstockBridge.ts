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
import { ANSI_JUNK_RE, ANSI_ESCAPE_RE, BOX_DRAWING_RE } from "../../domain/utils/ansiUtils.js";

// ---------------------------------------------------------------------------
// Types — re-exported from domain (DDD fix Task 1871f)
// ---------------------------------------------------------------------------

// Infrastructure-only type (price shape used only in fetcher layer)
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

// Domain types: canonical definitions live in domain/models/vnstockTypes.ts
// Imported locally for use in function signatures + re-exported for backward compat.
import type {
  VnstockFinancials,
  VnstockTradingStats,
  VnstockOfficer,
  VnstockShareholder,
  VnstockBalanceSheet,
  VnstockCashFlow,
} from "../../domain/models/vnstockTypes.js";
export type {
  VnstockFinancials,
  VnstockTradingStats,
  VnstockOfficer,
  VnstockShareholder,
  VnstockBalanceSheet,
  VnstockCashFlow,
};

// Re-export shared types from domain (DDD fix — Task 1320)
import type {
  VnstockIntradayTick,
  VnstockEvent,
  VnstockOrderBook,
} from "../../domain/models/shared-types.js";
export type { VnstockIntradayTick, VnstockEvent, VnstockOrderBook };

export interface VnstockNewsItem {
  code: string;
  title: string;
  /** ISO date string, e.g. "2026-04-03" */
  date: string;
  source: string;
  url: string;
}

export interface VnstockRatioSummary {
  code: string;
  pe: number;
  pb: number;
  roe: number;
  eps: number;
  marketCap: number;  // billion VND
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// ANSI / junk detection helper (exported for unit tests)
// ---------------------------------------------------------------------------

/** Result of stripping ANSI and checking whether stdout is valid JSON. */
export interface JunkCheckResult {
  /** True when the cleaned output cannot be JSON (ANSI pollution, non-JSON prefix, etc.). */
  junk: boolean;
  /** True when the value is empty or the literal string "null" — caller should return null. */
  isNull: boolean;
  /** The cleaned (ANSI-stripped) string, ready for JSON.parse. Empty when junk/isNull. */
  cleaned: string;
}

/**
 * Strip ANSI escape sequences and Unicode box-drawing characters that vnstock's
 * `rich` progress bar emits to stdout, then validate that what remains looks
 * like JSON before passing it to JSON.parse.
 *
 * Exported so unit tests can exercise the logic without spawning Python.
 */
export function stripAnsiAndDetectJunk(raw: string, label: string): JunkCheckResult {
  // Strip ESC sequences (colors, cursor moves) and Unicode box-drawing / Braille ranges
  // used by the `rich` library's progress bar and spinner components.
  const cleaned = raw.replace(ANSI_JUNK_RE, "").trim();

  // Empty or literal "null" — legitimate empty result, not junk.
  if (!cleaned || cleaned === "null") {
    return { junk: false, isNull: true, cleaned: "" };
  }

  // First non-whitespace char must be '{' or '[' for valid JSON.
  if (cleaned[0] !== "{" && cleaned[0] !== "[") {
    logger.warn(`[vnstock:${label}] non-JSON stdout — possible rate-limit or ANSI output`, {
      preview: cleaned.slice(0, 120),
    });
    return { junk: true, isNull: false, cleaned: "" };
  }

  return { junk: false, isNull: false, cleaned };
}

// ---------------------------------------------------------------------------
// Global rate limiter — 50 RPM sliding window (Task 1833i)
// ---------------------------------------------------------------------------

export const GLOBAL_RATE_LIMIT_RPM = 80;

/**
 * Sliding-window rate limiter.
 * All Python subprocesses must call acquire() before spawning.
 * At most `rpm` slots available per `windowMs` milliseconds.
 */
export class VnstockRateLimiter {
  private readonly rpm: number;
  private readonly windowMs: number;
  private readonly slots: number[] = [];

  constructor(rpm: number, windowMs = 60_000) {
    this.rpm = rpm;
    this.windowMs = windowMs;
  }

  async acquire(): Promise<void> {
    while (true) {
      const now = Date.now();
      while (this.slots.length > 0 && now - this.slots[0]! >= this.windowMs) {
        this.slots.shift();
      }
      if (this.slots.length < this.rpm) {
        this.slots.push(now);
        return;
      }
      const waitMs = this.windowMs - (now - this.slots[0]!);
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs + 1));
    }
  }
}

const _rateLimiter = new VnstockRateLimiter(GLOBAL_RATE_LIMIT_RPM);

// ---------------------------------------------------------------------------
// Rate-limit detection and exponential backoff (Task 1780)
// ---------------------------------------------------------------------------

/**
 * Returns true when the raw Python stdout looks like a vnstock rate-limit
 * response — i.e. it contains box-drawing characters from the `rich` UI.
 *
 * Distinct from generic errors (AttributeError, etc.) which are NOT rate-limit.
 * Empty or "null" strings are NOT rate-limit (they are legitimate null results).
 *
 * Exported for unit tests.
 */
export function isRateLimitResponse(raw: string): boolean {
  if (!raw || raw.trim() === "null") return false;
  // Strip ANSI escape sequences only (keep box-drawing chars so we can detect them)
  const stripped = raw.replace(ANSI_ESCAPE_RE, "");
  return BOX_DRAWING_RE.test(stripped);
}

/** Options for calcBackoffMs. */
export interface BackoffOptions {
  baseMs: number;
  jitterMs: number;
  maxMs: number;
}

/**
 * Exponential backoff with random jitter.
 * Formula: min(baseMs * 2^attempt + rand(0, jitterMs), maxMs)
 *
 * Exported for unit tests.
 */
export function calcBackoffMs(attempt: number, opts: BackoffOptions): number {
  const exponential = opts.baseMs * Math.pow(2, attempt);
  const jitter = Math.random() * opts.jitterMs;
  return Math.min(exponential + jitter, opts.maxMs);
}

const BACKOFF_OPTS: BackoffOptions = { baseMs: 2_000, jitterMs: 1_000, maxMs: 30_000 };
const MAX_RATE_LIMIT_RETRIES = 3;

// ---------------------------------------------------------------------------
// Python helper: run script and parse JSON
// ---------------------------------------------------------------------------

/** Default per-call wall-clock budget for any python subprocess. */
const PYTHON_TIMEOUT_MS = 45_000;

async function runPython<T>(script: string, label: string): Promise<T | null> {
  try {
    await _rateLimiter.acquire();
    const proc = Bun.spawn(["python3", "-c", script], {
      stdout: "pipe",
      stderr: "pipe",
    });

    // Local hard timeout: vnstock occasionally hangs on slow VCI responses.
    // We want a clean SIGTERM with a clear log line instead of letting an
    // outer step-timeout kill us with no attribution (the source of the
    // mysterious "exit code 143" reports — Loop #29).
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill(); } catch { /* already exited */ }
    }, PYTHON_TIMEOUT_MS);

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    clearTimeout(timer);

    // Python libs (vnstock, pandas, urllib) routinely emit DeprecationWarnings
    // and progress bars to stderr even on successful runs. Only surface stderr
    // as a warning when the process actually failed — otherwise demote to debug
    // to keep RECENT ERRORS actionable.
    // exit code 143 = SIGTERM (killed by our local timer or an outer step
    // timeout). Always benign — demote to debug so RECENT ERRORS stays clean.
    const killedBySignal = exitCode === 143 || timedOut;

    if (stderr.trim()) {
      if (exitCode !== 0 && !killedBySignal) {
        logger.warn(`[vnstock:${label}] stderr`, { stderr: stderr.slice(0, 300) });
      } else {
        logger.debug(`[vnstock:${label}] stderr (non-fatal)`, { stderr: stderr.slice(0, 300) });
      }
    }

    if (timedOut) {
      logger.debug(`[vnstock:${label}] timeout after ${PYTHON_TIMEOUT_MS}ms — killed (SIGTERM)`);
      return null;
    }

    if (exitCode !== 0) {
      if (killedBySignal) {
        logger.debug(`[vnstock:${label}] exit code ${exitCode} (SIGTERM, benign)`);
      } else {
        logger.warn(`[vnstock:${label}] exit code ${exitCode}`);
      }
      return null;
    }

    const trimmed = stdout.trim();

    // Detect rate-limit (box-drawing) response BEFORE generic junk check.
    // Rate-limit = VCI is throttling us → back off and retry (handled by caller loop).
    // Generic junk (non-JSON text) = Python error → no point retrying immediately.
    if (isRateLimitResponse(trimmed)) {
      return "RATE_LIMITED" as unknown as T;
    }

    const check = stripAnsiAndDetectJunk(trimmed, label);
    if (check.isNull || check.junk) return null;
    return JSON.parse(check.cleaned) as T;
  } catch (err) {
    logger.warn(`[vnstock:${label}] error`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Sentinel returned by runPython when the VCI API returns a rate-limit response. */
const RATE_LIMITED = "RATE_LIMITED" as const;

/**
 * Wraps runPython with exponential backoff on RATE_LIMITED responses.
 * On each rate-limit detection, logs WARN with {label, attempt, wait_ms}
 * and waits before retrying. Gives up after MAX_RATE_LIMIT_RETRIES.
 */
async function runPythonWithBackoff<T>(script: string, label: string): Promise<T | null> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    const result = await runPython<T | typeof RATE_LIMITED>(script, label);

    if (result !== RATE_LIMITED) {
      return result as T | null;
    }

    // Rate-limited — log and back off (unless this was the last attempt)
    if (attempt < MAX_RATE_LIMIT_RETRIES) {
      const wait_ms = Math.round(calcBackoffMs(attempt, BACKOFF_OPTS));
      logger.warn(`[vnstock:${label}] RATE_LIMITED — backing off before retry`, {
        label,
        attempt,
        wait_ms,
      });
      await new Promise((resolve) => setTimeout(resolve, wait_ms));
    } else {
      logger.warn(`[vnstock:${label}] RATE_LIMITED — max retries exhausted, giving up`, {
        label,
        attempts: MAX_RATE_LIMIT_RETRIES + 1,
      });
    }
  }
  return null;
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
  const result = await runPythonWithBackoff<VnstockPrice[]>(PRICE_SCRIPT(codes, days), "prices");
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
    _ni_keys = [
        'Attributable to parent company',
        'Net Profit After Tax (Bn. VND)',
        'Lợi nhuận sau thuế',
    ]
    _ni_raw = next((last.get(k) for k in _ni_keys if last.get(k) not in (None, 0)), None)
    net = float(_ni_raw) if _ni_raw is not None else 0  # keep 0 for ratio math; None only when truly absent

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
  const result = await runPythonWithBackoff<VnstockFinancials>(FINANCE_SCRIPT(code), `finance:${code}`);
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
    # FIX-B-1: also fetch market cap from ratio API (best-effort; null on failure)
    market_cap_bn = None
    try:
        ratio_df = stock.finance.ratio(period='quarter')
        if ratio_df is not None and len(ratio_df) > 0:
            rr = ratio_df.iloc[0]
            mc_raw = rr.get(('Chỉ tiêu định giá', 'Market Cap (Bn. VND)'), None)
            if mc_raw is None:
                mc_raw = rr.get('market_cap', None)
            if mc_raw is not None:
                market_cap_bn = round(float(mc_raw), 2)
    except Exception:
        pass
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
        'marketCapBn': market_cap_bn,
        'fetchedAt': __import__('datetime').datetime.now().isoformat()
    }
    print(json.dumps(result))
except Exception as e:
    sys.stderr.write(f'vnstock trading_stats error: {e}\\n')
    print('null')
`;

export async function fetchVnstockTradingStats(code: string): Promise<VnstockTradingStats | null> {
  const result = await runPythonWithBackoff<VnstockTradingStats>(TRADING_STATS_SCRIPT(code), `stats:${code}`);
  if (result) {
    logger.info("[vnstock] fetched trading stats", {
      code, foreignRoom: result.foreignRoom, high52w: result.high52w, marketCapBn: result.marketCapBn,
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
//
// vnstock v4.0.3 broke the Vnstock().stock() path: importing
// vnstock.common.viz raises ImportError when neither vnstock_chart nor
// vnstock_ezchart is installed. The fix bypasses the Vnstock wrapper by
// importing vnstock.explorer.vci.company.Company directly — after
// pre-mocking the viz module so the import chain does not raise.
//
// Column name changes in v4 (vs v3):
//   v3: event_date, event_name, event_type, description/content
//   v4: public_date, event_name_en / event_title_en, event_code / category
//
// Strategy: try v4 columns first (public_date), fall back to v3 names so
// the script survives a future vnstock downgrade.
// ---------------------------------------------------------------------------

const EVENTS_SCRIPT = (symbol: string) => `
import json, sys, io, types

# ── viz mock: prevents ImportError when charting libs are absent ──────────
_viz = types.ModuleType('vnstock.common.viz')
_viz.Chart = None  # type: ignore
sys.modules.setdefault('vnstock.common.viz', _viz)

try:
    from vnstock.explorer.vci.company import Company

    # ── stdout capture: vnstock v4 events() prints a box-drawing banner to
    # stdout (not stderr), which runPython detects as a RATE_LIMITED signal.
    # Capture + discard it so only our JSON reaches the caller.
    _real_stdout = sys.stdout
    _buf = io.StringIO()
    sys.stdout = _buf
    try:
        comp = Company(symbol='${symbol}', show_log=False)
        df = comp.events()
    finally:
        sys.stdout = _real_stdout  # always restore, even on error

    if df is None or len(df) == 0:
        print('[]')
        sys.exit(0)
    results = []
    for _, r in df.iterrows():
        # Date: v4 uses public_date; fall back to v3 names
        event_date = str(r.get('public_date',
                     r.get('display_date1',
                     r.get('event_date',
                     r.get('exrights_date',
                     r.get('date', '')))))).strip()
        if event_date and len(event_date) >= 10:
            event_date = event_date[:10]
        else:
            continue
        # Name: prefer English title (descriptive) → English name → vi name → fallback
        event_name = str(r.get('event_title_en',
                     r.get('event_name_en',
                     r.get('event_title_vi',
                     r.get('event_name',
                     r.get('title', ''))))))
        # Type: prefer event_code (short code like ISS/DIV) → category → old names
        event_type = str(r.get('event_code',
                     r.get('category',
                     r.get('event_type',
                     r.get('type', 'Other')))))
        description = str(r.get('event_title_vi',
                      r.get('description',
                      r.get('content', ''))))
        results.append({
            'code': '${symbol}',
            'eventName': event_name,
            'eventDate': event_date,
            'eventType': event_type,
            'description': description
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
// 9. Balance Sheet (Gap 5)
// ---------------------------------------------------------------------------

/**
 * Balance sheet extraction script.
 * Column names discovered empirically for VCI source:
 *   - Non-bank (FPT):  'TOTAL ASSETS (Bn. VND)', 'LIABILITIES (Bn. VND)', "OWNER'S EQUITY(Bn.VND)",
 *                      'Cash and cash equivalents (Bn. VND)', 'Short-term borrowings (Bn. VND)',
 *                      'Long-term borrowings (Bn. VND)', 'Accounts receivable (Bn. VND)',
 *                      'Net Inventories' or 'Inventories, Net (Bn. VND)'
 *   - Bank (VCB):      Same 'TOTAL ASSETS' key; equity = "OWNER'S EQUITY(Bn.VND)";
 *                      short debt = deposits; long debt = 'Convertible bonds/CDs and other valuable papers issued'
 *
 * Values are in raw VND in the DataFrame — we divide by 1e9 to get billion VND.
 */
const BALANCE_SHEET_SCRIPT = (symbol: string) => `
import json, sys
try:
    from vnstock import Vnstock
    stock = Vnstock().stock(symbol='${symbol}', source='VCI')
    df = stock.finance.balance_sheet(period='quarter')
    if df is None or len(df) == 0:
        print('null')
        sys.exit(0)
    last = df.iloc[0]
    def g(key, default=0):
        v = last.get(key, default)
        return float(v or 0)
    # Total assets / liabilities / equity (common to both bank and non-bank)
    total_assets = g('TOTAL ASSETS (Bn. VND)') / 1e9
    total_liab = g('LIABILITIES (Bn. VND)') / 1e9
    total_equity = g("OWNER'S EQUITY(Bn.VND)") / 1e9
    cash = g('Cash and cash equivalents (Bn. VND)') / 1e9
    # Debt: non-bank has explicit short/long; bank approximated from bonds
    short_debt = g('Short-term borrowings (Bn. VND)') / 1e9
    long_debt = g('Long-term borrowings (Bn. VND)') / 1e9
    if short_debt == 0 and long_debt == 0:
        # Bank: use convertible bonds/CDs as long debt proxy
        long_debt = g('Convertible bonds/CDs and other valuable papers issued') / 1e9
    # Receivables
    receivables = g('Accounts receivable (Bn. VND)') / 1e9
    # Inventory (non-bank)
    inventory = g('Net Inventories') / 1e9
    if inventory == 0:
        inventory = g('Inventories, Net (Bn. VND)') / 1e9
    result = {
        'code': '${symbol}',
        'yearReport': int(last.get('yearReport', 0)),
        'quarter': int(last.get('lengthReport', 0)),
        'totalAssets': round(total_assets, 2),
        'totalLiabilities': round(total_liab, 2),
        'totalEquity': round(total_equity, 2),
        'cash': round(cash, 2),
        'shortTermDebt': round(short_debt, 2),
        'longTermDebt': round(long_debt, 2),
        'receivables': round(receivables, 2),
        'inventory': round(inventory, 2),
        'source': 'vnstock',
        'fetchedAt': __import__('datetime').datetime.now().isoformat()
    }
    print(json.dumps(result))
except Exception as e:
    sys.stderr.write(f'vnstock balance_sheet error: {e}\\n')
    print('null')
`;

export async function fetchVnstockBalanceSheet(code: string): Promise<VnstockBalanceSheet | null> {
  const result = await runPythonWithBackoff<VnstockBalanceSheet>(BALANCE_SHEET_SCRIPT(code), `balance_sheet:${code}`);
  if (result) {
    logger.info("[vnstock] fetched balance sheet", {
      code, year: result.yearReport, quarter: result.quarter,
      totalAssets: result.totalAssets, totalEquity: result.totalEquity,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// 10. Cash Flow (Gap 5)
// ---------------------------------------------------------------------------

/**
 * Cash flow extraction script.
 * Column names discovered empirically for VCI source:
 *   'Net cash inflows/outflows from operating activities'  (both bank and non-bank)
 *   'Net Cash Flows from Investing Activities'
 *   'Cash flows from financial activities'
 *   'Net increase/decrease in cash and cash equivalents'
 *
 * Values are in raw VND — divide by 1e9 to get billion VND.
 */
const CASH_FLOW_SCRIPT = (symbol: string) => `
import json, sys
try:
    from vnstock import Vnstock
    stock = Vnstock().stock(symbol='${symbol}', source='VCI')
    df = stock.finance.cash_flow(period='quarter')
    if df is None or len(df) == 0:
        print('null')
        sys.exit(0)
    last = df.iloc[0]
    def g(key, default=0):
        v = last.get(key, default)
        return float(v or 0)
    # Fallback keys: VCI column name varies by sector (banking, steel, tech)
    _ocf_keys = [
        'Net cash inflows/outflows from operating activities',
        'Lưu chuyển tiền thuần từ hoạt động kinh doanh',
        'Net Cash From Operating Activities',
    ]
    operating_raw = next((last.get(k) for k in _ocf_keys if last.get(k) not in (None, 0)), None)
    operating = float(operating_raw) / 1e9 if operating_raw is not None else None
    investing = g('Net Cash Flows from Investing Activities') / 1e9
    financing = g('Cash flows from financial activities') / 1e9
    net = g('Net increase/decrease in cash and cash equivalents') / 1e9
    result = {
        'code': '${symbol}',
        'yearReport': int(last.get('yearReport', 0)),
        'quarter': int(last.get('lengthReport', 0)),
        'operatingCashFlow': round(operating, 2) if operating is not None else None,
        'investingCashFlow': round(investing, 2),
        'financingCashFlow': round(financing, 2),
        'netCashFlow': round(net, 2),
        'source': 'vnstock',
        'fetchedAt': __import__('datetime').datetime.now().isoformat()
    }
    print(json.dumps(result))
except Exception as e:
    sys.stderr.write(f'vnstock cash_flow error: {e}\\n')
    print('null')
`;

export async function fetchVnstockCashFlow(code: string): Promise<VnstockCashFlow | null> {
  const result = await runPythonWithBackoff<VnstockCashFlow>(CASH_FLOW_SCRIPT(code), `cash_flow:${code}`);
  if (result) {
    logger.info("[vnstock] fetched cash flow", {
      code, year: result.yearReport, quarter: result.quarter,
      operatingCF: result.operatingCashFlow, netCF: result.netCashFlow,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// 11. Company News (Gap 6) — 6th news source
// ---------------------------------------------------------------------------

/**
 * Company news from vnstock VCI backend.
 * Column names discovered empirically:
 *   'news_title', 'news_source_link', 'public_date' (epoch ms), 'lang_code'
 */
const NEWS_SCRIPT = (symbol: string, limit: number) => `
import json, sys
try:
    from vnstock import Vnstock
    stock = Vnstock().stock(symbol='${symbol}', source='VCI')
    df = stock.company.news()
    if df is None or len(df) == 0:
        print('[]')
        sys.exit(0)
    df = df.head(${limit})
    results = []
    for _, r in df.iterrows():
        pub = r.get('public_date', None)
        if pub:
            try:
                from datetime import datetime, timezone
                ts = int(pub) / 1000
                date_str = datetime.fromtimestamp(ts, tz=timezone.utc).strftime('%Y-%m-%d')
            except:
                date_str = str(pub)[:10]
        else:
            date_str = ''
        results.append({
            'code': '${symbol}',
            'title': str(r.get('news_title', '')),
            'date': date_str,
            'source': str(r.get('lang_code', 'vi')),
            'url': str(r.get('news_source_link', ''))
        })
    print(json.dumps(results))
except Exception as e:
    sys.stderr.write(f'vnstock news error: {e}\\n')
    print('[]')
`;

/**
 * Fetch recent company news items from vnstock.
 * @param code - Stock ticker symbol
 * @param limit - Maximum number of news items to return (default 20)
 */
export async function fetchVnstockNews(code: string, limit = 20): Promise<VnstockNewsItem[]> {
  const result = await runPython<VnstockNewsItem[]>(NEWS_SCRIPT(code, limit), `news:${code}`);
  if (result && result.length > 0) {
    logger.info("[vnstock] fetched company news", { code, count: result.length });
  }
  return result ?? [];
}

// ---------------------------------------------------------------------------
// 12. Batch: all data for one stock (for morning briefing / on-demand)
// ---------------------------------------------------------------------------

export interface VnstockFullSnapshot {
  price: VnstockPrice | null;
  financials: VnstockFinancials | null;
  tradingStats: VnstockTradingStats | null;
  officers: VnstockOfficer[];
  shareholders: VnstockShareholder[];
  balanceSheet: VnstockBalanceSheet | null;
  cashFlow: VnstockCashFlow | null;
}

/**
 * Fetch all data for one stock sequentially to avoid concurrent rate-limit floods.
 *
 * The old Promise.all([7 calls]) fired 7 Python subprocesses simultaneously.
 * With 30 watchlist tickers that became up to 210 concurrent VCI requests,
 * causing the RATE_LIMITED WARNs observed on D2D, VCB, CTG.
 * Sequential execution keeps the per-ticker cost at 7 serial calls but
 * eliminates the burst. Latency is acceptable — this runs in a background job.
 */
export async function fetchVnstockSnapshot(code: string): Promise<VnstockFullSnapshot> {
  const prices = await fetchVnstockPrices([code]);
  const financials = await fetchVnstockFinancials(code);
  const tradingStats = await fetchVnstockTradingStats(code);
  const officers = await fetchVnstockOfficers(code);
  const shareholders = await fetchVnstockShareholders(code);
  const balanceSheet = await fetchVnstockBalanceSheet(code);
  const cashFlow = await fetchVnstockCashFlow(code);

  return {
    price: prices[0] ?? null,
    financials,
    tradingStats,
    officers,
    shareholders,
    balanceSheet,
    cashFlow,
  };
}
