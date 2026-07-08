/**
 * vnstock Python template — Cash Flow (Gap 5).
 *
 * Column names discovered empirically for VCI source:
 *   'Net cash inflows/outflows from operating activities'  (both bank and non-bank)
 *   'Net Cash Flows from Investing Activities'
 *   'Cash flows from financial activities'
 *   'Net increase/decrease in cash and cash equivalents'
 *
 * Values are in raw VND — divide by 1e9 to get billion VND.
 *
 * FACTORY-INFRA-split-vnstockBridge: extracted from vnstockBridge.ts's
 * CASH_FLOW_SCRIPT, now built through the shared `wrapVnstockScript`
 * preamble.
 *
 * Layer: infrastructure/fetchers
 */
import { wrapVnstockScript } from "../runtime.js";

export function buildCashFlowScript(symbol: string): string {
  return wrapVnstockScript({
    symbol,
    errorLabel: "cash_flow",
    emptyValue: "null",
    fetch: "df = stock.finance.cash_flow(period='quarter')",
    body: `        last = df.iloc[0]
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
        print(json.dumps(result))`,
  });
}
