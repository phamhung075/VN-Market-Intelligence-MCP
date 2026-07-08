/**
 * vnstock Python template — Trading Stats (foreign room, 52-week range).
 *
 * FACTORY-INFRA-split-vnstockBridge: extracted from vnstockBridge.ts's
 * TRADING_STATS_SCRIPT, now built through the shared `wrapVnstockScript`
 * preamble.
 *
 * Layer: infrastructure/fetchers
 */
import { wrapVnstockScript } from "../runtime.js";

export function buildTradingStatsScript(symbol: string): string {
  return wrapVnstockScript({
    symbol,
    errorLabel: "trading_stats",
    emptyValue: "null",
    fetch: "df = stock.company.trading_stats()",
    body: `        r = df.iloc[0]
        # --- Column mapping updated for vnstock schema (2026-06-04 FIX-B) ---
        # New schema: free_float, foreigner_percentage, maximum_foreign_percentage,
        #             average_match_volume1_month, highest_price1_year, lowest_price1_year,
        #             current_price, market_cap (raw VND), number_of_shares_mkt_cap
        # Prices in new schema are already in VND (no *1000 needed).
        # market_cap is available directly here — ratio() call removed (was broken).
        mc_raw = r.get('market_cap', None)
        market_cap_bn = round(float(mc_raw) / 1e9, 2) if mc_raw is not None else None
        if market_cap_bn is None:
            sys.stderr.write(f'vnstock trading_stats: market_cap missing for ${symbol}\\n')
        hp = float(r.get('highest_price1_year', 0) or 0)
        lp = float(r.get('lowest_price1_year', 0) or 0)
        cp = float(r.get('current_price', 0) or 0)
        pct_from_high = round((cp - hp) / hp * 100, 2) if hp else 0.0
        pct_from_low = round((cp - lp) / lp * 100, 2) if lp else 0.0
        # foreignVolume: derived as foreigner_percentage * shares (cumulative foreign holding)
        # foreignRoom: free_float (shares available for foreign purchase)
        foreigner_pct = float(r.get('foreigner_percentage', 0) or 0)
        shares = float(r.get('number_of_shares_mkt_cap', 0) or 0)
        foreign_vol_derived = int(foreigner_pct * shares)
        result = {
            'code': '${symbol}',
            'foreignRoom': int(r.get('free_float', 0) or 0),
            'foreignVolume': foreign_vol_derived,
            'currentHoldingRatio': round(foreigner_pct, 4),
            'maxHoldingRatio': round(float(r.get('maximum_foreign_percentage', 0) or 0), 4),
            'avgVolume2w': int(r.get('average_match_volume1_month', 0) or 0),
            'high52w': hp,
            'low52w': lp,
            'pctFromHigh52w': pct_from_high,
            'pctFromLow52w': pct_from_low,
            'marketCapBn': market_cap_bn,
            'fetchedAt': __import__('datetime').datetime.now().isoformat()
        }
        print(json.dumps(result))`,
  });
}
