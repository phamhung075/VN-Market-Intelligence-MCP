# PO Notebook

## 2026-06-15T10:3xZ — Step-1 triage: drain 36 stale health-recheck reports → BATCH(4 ready + 1 held)

**Stale backlog was 36 reports (3142..3180, 06-13 00:09Z → 06-15 10:07Z), never drained.** Almost
all dedup to THIS session's shipped work or self-recovered live state. RAW-verified live before any
mint (get_pipeline_health / get_macro_snapshot / get_vps_proxy_health / get_alerts / get_market_foreign_flow).

**DEDUP → resolved (false-positive / already-done), NOT re-minted:**
- I11/R2/R3 mcp-server "~2h crash cadence" = intentional force-recreate deploys. `FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE` done_verified. RestartCount=0.
- TA all-N/A + single-digit RSI = `FIX-TA-GOSVC-*` + `FIX-ALERT-ENGINE-RSI-SINGLEDIGIT` (review[]). Live RSI now mid-band (25-48), DAG=100 real.
- 8-tool schema-drift cluster (get_patterns/sentiment_trend/kinhdich/bctc_full/agent_signals/foreign_flow/market_summary/financial_summary) = `FIX-MCP-TOOL-PARAM-SCHEMA-DRIFT-DOCS` done_verified (commit 0e81b642, 11 docs). Spot-verified foreign_flow(code)/market_summary(period) live OK.
- vnstock fundamentals crash + rate-limit storms (B1/N1/N2/N3) = `FIX-FUNDAMENTALS-REFRESH-CRON-DEAD` + `FIX-VNSTOCK-FUNDAMENTAL-RATELIMIT` done_verified.
- I10 WTI>$95.5 oil corrupt = RECOVERED (oilUsd $82.81, tier-1 live). I7 sbv-fetch + I2/news = RECOVERED (sbv 21 pushes/24h 0 err; news 93 pushes/24h). pollNews-0-items transient.
- D4 orch/head divergence (3176) = stale claim; head.active_task_id is already FIX-ALERT-ENGINE-RSI, not CI-RED. False-positive.
- OHLCV-aggregator stale = FOLDED into in_progress ARCH-CRON-SCHEDULER-RELIABILITY (aggregator now last-run 06-15). BCTC-VPS stale = HANDOFF (tracked).

**BATCH → router (4 promoted ready, 1 held):** all were already-minted backlog IDs (06-13 detect→fix bridge c68edcfa) — enriched/promoted, NOT duplicated.
1. `FIX-HNX-UPCOM-PRICE-SOURCES-DEAD` P1 → dev-stock-price [apps/stock-price/] — LIVE-CONFIRMED real: BDI/DLC/JSH/SIS/VDC rows=0 day-9.
2. `FIX-FB-POSTER-NOARG-MARKET-TOOLS` P1 → cowork-refactory-expert [cross-service/] — flow/main.md:78/81 still no-arg at HEAD (report 3180 "RESOLVED" = FALSE-POSITIVE); fix = switch to get_market_foreign_flow({}) (no-arg, live-OK).
3. `FIX-VNSTOCK-TRADINGSTATS-CRASH` P1 → dev-mcp-server [apps/mcp-server/] — NEW mint; 50% crash, syncVnstockData.ts timeout guard (fundamentals-fix family).
4. `FIX-MARKET-HEXAGRAM-TOOL-MISSING` P2 → dev-kinh-dich [apps/kinh-dich-service/] — LIVE-CONFIRMED get_market_hexagram absent; Sunday digest-predict broken.
HELD (backlog, depends FIX-ALERT-ENGINE-RSI-SINGLEDIGIT): `FIX-ALERT-OPEN-ZERO-PRICE-RACE` — NEW; bb/taAlertScanJob giá=0 + single-digit RSI at 02:00Z open, self-normalize by 06:08Z. Same open-window as the RSI gate → sequence AFTER 06-16T01:00Z, do not double-touch.

**Did NOT push** (held bundle per 2026-06-16 RSI gate). WIP<=2 respected — router dispatches at most 2 of the 4 ready.

### Carry-over
- After 2026-06-16T01:00Z RSI gate clears FIX-ALERT-ENGINE-RSI-SINGLEDIGIT: release `FIX-ALERT-OPEN-ZERO-PRICE-RACE` from HELD → ready (route dev-mcp-server).
- Triage script: `scripts/po-s55-health-recheck-wave2-triage.jq` (atomic temp→[ -s ]→jq empty→conservation→rename; commit orch-state by EXPLICIT PATH).
- All 36 reports drained (read_telegram_reports(new) = empty). Next cron tick starts clean.
