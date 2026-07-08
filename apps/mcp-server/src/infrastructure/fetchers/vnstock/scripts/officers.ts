/**
 * vnstock Python template — Officers (insider tracking).
 *
 * FACTORY-INFRA-split-vnstockBridge: extracted from vnstockBridge.ts's
 * OFFICERS_SCRIPT, now built through the shared `wrapVnstockScript` preamble.
 *
 * Layer: infrastructure/fetchers
 */
import { wrapVnstockScript } from "../runtime.js";

export function buildOfficersScript(symbol: string): string {
  return wrapVnstockScript({
    symbol,
    errorLabel: "officers",
    emptyValue: "[]",
    fetch: "df = stock.company.officers()",
    body: `        results = []
        for _, r in df.iterrows():
            results.append({
                'code': '${symbol}',
                'name': str(r.get('officer_name', '')),
                'position': str(r.get('officer_position', '')),
                'ownPercent': round(float(r.get('officer_own_percent', 0) or 0) * 100, 4),
                'quantity': int(r.get('quantity', 0) or 0)
            })
        print(json.dumps(results))`,
  });
}
