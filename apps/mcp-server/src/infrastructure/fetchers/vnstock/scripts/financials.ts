/**
 * vnstock Python template — Financials (Income + Ratios), the "fast BCTC".
 *
 * FACTORY-INFRA-split-vnstockBridge: extracted from vnstockBridge.ts's
 * FINANCE_SCRIPT. Two-dataframe variant of wrapVnstockScript (fetches
 * `income_statement` then `ratio`, each with its own stdout reset) — passes
 * `resultVar: "inc"` + `extraInit: "ratio = None"` so the shared
 * empty/error/exception handling still applies.
 *
 * Layer: infrastructure/fetchers
 */
import { wrapVnstockScript } from "../runtime.js";

export function buildFinancialsScript(symbol: string): string {
  return wrapVnstockScript({
    symbol,
    resultVar: "inc",
    extraInit: "ratio = None",
    errorLabel: "finance",
    emptyValue: "null",
    fetch: `inc = stock.finance.income_statement(period='quarter')
    sys.stdout = _io.StringIO()
    ratio = stock.finance.ratio(period='quarter')`,
    body: `        last = inc.iloc[0]
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
        # FIX-ERRAUDIT-W2-MCP-DATALAYER: initialise all ratio vars to None (not 0.0).
        # A 0.0 fallback collides with legitimate 0 values (e.g. bank ROE=0 is implausible
        # but vnstock schema drift silently zeroed it). None = "missing" is discriminated.
        # The JS type VnstockFinancials now has pe/pb/roe/roa as number|null.
        pe = pb = roe = roa = de = npm = None
        nim_val = npl_val = None
        if r is not None:
            try:
                _pe_raw = r.get(('Chỉ tiêu định giá', 'P/E'), None)
                _pb_raw = r.get(('Chỉ tiêu định giá', 'P/B'), None)
                _roe_raw = r.get(('Chỉ tiêu khả năng sinh lợi', 'ROE (%)'), None)
                _roa_raw = r.get(('Chỉ tiêu khả năng sinh lợi', 'ROA (%)'), None)
                _de_raw = r.get(('Chỉ tiêu cơ cấu nguồn vốn', 'Debt/Equity'), None)
                _npm_raw = r.get(('Chỉ tiêu khả năng sinh lợi', 'Net Profit Margin (%)'), None)
                pe = float(_pe_raw) if _pe_raw is not None else None
                pb = float(_pb_raw) if _pb_raw is not None else None
                roe = float(_roe_raw) if _roe_raw is not None else None
                roa = float(_roa_raw) if _roa_raw is not None else None
                de = float(_de_raw) if _de_raw is not None else None
                npm = float(_npm_raw) if _npm_raw is not None else None
            except Exception as ratio_err:
                # FIX-ERRAUDIT-W2-MCP-DATALAYER: column-key mismatch → log via stderr,
                # leave ratio vars as None (missing) NOT 0.0 (implausible-but-non-empty).
                sys.stderr.write(f'[degraded:vnstockBridge.ratios[${symbol}]] {ratio_err}\\n')

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
            'pe': round(pe, 2) if pe is not None else None,
            'pb': round(pb, 2) if pb is not None else None,
            'roe': round(roe * 100, 2) if roe is not None else None,
            'roa': round(roa * 100, 2) if roa is not None else None,
            'debtToEquity': round(de, 2) if de is not None else None,
            'netProfitMargin': round(npm * 100, 2) if npm is not None else None,
            'nim': None,
            'npl': None,
            'fetchedAt': __import__('datetime').datetime.now().isoformat()
        }
        print(json.dumps(result))`,
  });
}
