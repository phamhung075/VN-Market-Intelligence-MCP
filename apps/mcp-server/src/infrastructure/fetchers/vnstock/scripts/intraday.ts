/**
 * vnstock Python template — Intraday ticks (last 100).
 *
 * FACTORY-INFRA-split-vnstockBridge: extracted from vnstockBridge.ts's
 * INTRADAY_SCRIPT, now built through the shared `wrapVnstockScript` preamble.
 *
 * Layer: infrastructure/fetchers
 */
import { wrapVnstockScript } from "../runtime.js";

export function buildIntradayScript(symbol: string): string {
  return wrapVnstockScript({
    symbol,
    errorLabel: "intraday",
    emptyValue: "[]",
    fetch: "df = stock.quote.intraday()",
    body: `        df = df.tail(100)
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
        print(json.dumps(results))`,
  });
}
