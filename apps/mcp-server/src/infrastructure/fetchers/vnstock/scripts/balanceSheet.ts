/**
 * vnstock Python template — Balance Sheet (Gap 5).
 *
 * Column names discovered empirically for VCI source:
 *   - Non-bank (FPT):  'TOTAL ASSETS (Bn. VND)', 'LIABILITIES (Bn. VND)', "OWNER'S EQUITY(Bn.VND)",
 *                      'Cash and cash equivalents (Bn. VND)', 'Short-term borrowings (Bn. VND)',
 *                      'Long-term borrowings (Bn. VND)', 'Accounts receivable (Bn. VND)',
 *                      'Net Inventories' or 'Inventories, Net (Bn. VND)'
 *   - Bank (VCB):      Same 'TOTAL ASSETS' key; equity = "OWNER'S EQUITY(Bn.VND)";
 *                      short debt = deposits; long debt = 'Convertible bonds/CDs and other valuable papers issued'
 *
 * Values are in raw VND in the DataFrame — we divide by 1e9 to get billion VND.
 *
 * FACTORY-INFRA-split-vnstockBridge: extracted from vnstockBridge.ts's
 * BALANCE_SHEET_SCRIPT, now built through the shared `wrapVnstockScript`
 * preamble.
 *
 * Layer: infrastructure/fetchers
 */
import { wrapVnstockScript } from "../runtime.js";

export function buildBalanceSheetScript(symbol: string): string {
  return wrapVnstockScript({
    symbol,
    errorLabel: "balance_sheet",
    emptyValue: "null",
    fetch: "df = stock.finance.balance_sheet(period='quarter')",
    body: `        last = df.iloc[0]
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
        print(json.dumps(result))`,
  });
}
