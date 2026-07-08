/**
 * vnstock Python template — OHLCV prices (multi-symbol batch).
 *
 * Bespoke control flow (not built through wrapVnstockScript): loops over
 * multiple symbols in one Python process, redirecting stdout per-iteration
 * around each `Vnstock().stock()` init so one bad ticker doesn't abort the
 * whole batch. FACTORY-INFRA-split-vnstockBridge: extracted verbatim from
 * vnstockBridge.ts's PRICE_SCRIPT.
 *
 * Layer: infrastructure/fetchers
 */
export function buildPricesScript(symbols: string[], days: number): string {
  return `
import json, sys, io as _io
# FIX-FUNDAMENTALS-REFRESH-CRON-DEAD: suppress vnstock deprecation banner on stdout
_real_stdout = sys.stdout
sys.stdout = _io.StringIO()
try:
    from vnstock import Vnstock
    from datetime import datetime, timedelta
finally:
    sys.stdout = _real_stdout
try:
    end = datetime.now().strftime('%Y-%m-%d')
    start = (datetime.now() - timedelta(days=${days})).strftime('%Y-%m-%d')
    results = []
    for sym in ${JSON.stringify(symbols)}:
        try:
            _buf = _io.StringIO()
            sys.stdout = _buf
            try:
                stock = Vnstock().stock(symbol=sym, source='VCI')
            finally:
                sys.stdout = _real_stdout
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
            sys.stdout = _real_stdout
            sys.stderr.write(f'vnstock error {sym}: {e}\\n')
    print(json.dumps(results))
except Exception as e:
    sys.stdout = _real_stdout
    sys.stderr.write(f'vnstock fatal: {e}\\n')
    print('[]')
`;
}
