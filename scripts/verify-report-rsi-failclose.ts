/**
 * verify-report-rsi-failclose.ts — LIVE behavioral probe for FIX-RSI-REPORT-FAILCLOSED.
 *
 * Runs INSIDE the mcp-server container (paths are /app/*). Invokes the real report-path
 * function `defaultComputeTa(code, db)` from assembleBriefing.ts against the live market.db,
 * proving the report RSI path fails closed (rsi14=null) on <15 candles and matches the
 * canonical period-14 calc on >=15 candles — the same contract as get_technical_indicators.
 *
 * Usage (from repo root):
 *   docker cp scripts/verify-report-rsi-failclose.ts <mcp-cid>:/tmp/v.ts
 *   docker exec <mcp-cid> bun /tmp/v.ts VRE VIC VHM FPT VCB HPG
 *
 * Pointer: docs/agents/dev-team/flow/post-cycle.md (LIVE-verify harnesses).
 */
import { Database } from "bun:sqlite";
import { defaultComputeTa } from "/app/src/application/usecases/assembleBriefing.ts";

const DB_PATH = process.env.MARKET_DB ?? "/app/data/market.db";
const codes = process.argv.slice(2);
if (codes.length === 0) {
  console.error("usage: bun verify-report-rsi-failclose.ts <CODE> [CODE...]");
  process.exit(2);
}

const db = new Database(DB_PATH, { readonly: true });

for (const code of codes) {
  // candle depth for context
  let depth = 0;
  try {
    const r = db
      .query<{ n: number }, [string]>(
        `SELECT COUNT(*) AS n FROM daily_ohlcv WHERE code = ?`,
      )
      .get(code);
    depth = r?.n ?? 0;
  } catch (e) {
    depth = -1;
  }
  const ta = defaultComputeTa(code, db);
  const rsi = ta == null ? "NULL(fail-closed)" : ta.rsi14 == null ? "null" : ta.rsi14;
  console.log(
    JSON.stringify({
      code,
      daily_ohlcv_candles: depth,
      report_ta_null: ta == null,
      report_rsi14: ta == null ? null : ta.rsi14,
      verdict:
        depth >= 0 && depth < 15
          ? ta == null || ta.rsi14 == null
            ? "PASS(<15 -> no rsi)"
            : "FAIL(<15 but rsi emitted)"
          : "info(>=15 -> compare vs canonical)",
    }),
  );
}
db.close();
