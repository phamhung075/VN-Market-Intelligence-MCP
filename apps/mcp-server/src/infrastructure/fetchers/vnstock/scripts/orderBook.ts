/**
 * vnstock Python template — Order book (price depth).
 *
 * FACTORY-INFRA-split-vnstockBridge: extracted from vnstockBridge.ts's
 * ORDER_BOOK_SCRIPT, now built through the shared `wrapVnstockScript`
 * preamble.
 *
 * Layer: infrastructure/fetchers
 */
import { wrapVnstockScript } from "../runtime.js";

export function buildOrderBookScript(symbol: string): string {
  return wrapVnstockScript({
    symbol,
    errorLabel: "price_depth",
    emptyValue: "null",
    fetch: "df = stock.quote.price_depth()",
    body: `        bids = []
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
        print(json.dumps(result))`,
  });
}
