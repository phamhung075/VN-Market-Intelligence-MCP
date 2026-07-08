/**
 * vnstock Python template — Shareholders.
 *
 * FACTORY-INFRA-split-vnstockBridge: extracted from vnstockBridge.ts's
 * SHAREHOLDERS_SCRIPT, now built through the shared `wrapVnstockScript`
 * preamble.
 *
 * Layer: infrastructure/fetchers
 */
import { wrapVnstockScript } from "../runtime.js";

export function buildShareholdersScript(symbol: string): string {
  return wrapVnstockScript({
    symbol,
    errorLabel: "shareholders",
    emptyValue: "[]",
    fetch: "df = stock.company.shareholders()",
    body: `        results = []
        for _, r in df.iterrows():
            results.append({
                'code': '${symbol}',
                'name': str(r.get('share_holder', '')),
                'quantity': int(r.get('quantity', 0) or 0),
                'ownPercent': round(float(r.get('share_own_percent', 0) or 0) * 100, 2)
            })
        print(json.dumps(results))`,
  });
}
