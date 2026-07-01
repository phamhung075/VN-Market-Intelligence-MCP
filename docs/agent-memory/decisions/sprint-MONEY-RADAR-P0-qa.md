# Decision Journal — Sprint MONEY-RADAR-P0 · qa

**Sprint goal:** Money Radar (Radar Dòng Tiền) — fusion + DIVERGENCE layer over 9 live money-flow tools. Phase-0-first: no new crawls, real non-null readings day one.
**Agent:** qa
**Started:** 2026-07-01T10:20:00Z

---

### STEP qa-S1 · qa · 2026-07-01T10:35:00Z
**task-id:** MONEY-RADAR-P0-T2-COMPOSITE
**what-done:** Live-data verification of `get_money_radar_composite` (commit 0026f9e1) via bun harness against a docker-cp'd live-DB snapshot + real sibling services (stock-price:5010, ta:5003, macro:5004). 7/7 gate items evidenced with real observed values.
**what-considered:**
- Run inside container (docker exec) vs copy live DB to host + point env at host-mapped ports — chose host copy (simpler TS execution, avoids mutating production DB with QA-artifact rows).
- Found real bug: `computeForeignAccumRank({})` (getMoneyRadarComposite.ts:174) never passes ticker codes; client DTO field `tickers` (clients.ts:489) mismatches Go service's actual `codes` field (foreign_accum_dtos.go:9) — foreign_accum_z_market deterministically null in prod (confirmed via curl with/without correct field).
- D2 could not be shown via composite's own live code path today (market_prices_history table-wide only ~1 day retention) — sourced 754-day VNINDEX history from daily_ohlcv instead to prove D2 mechanics on real historical data (2026-06-24 real window fired AMBER/D2 as spec'd).
**why-decision:** CHANGES_REQUESTED — foreign_accum_z_market bug is real, reproducible, in-scope, and defeats one of gate item 1's 4 required non-null legs; safe (not fabrication) but a genuine data-completeness defect worth fixing before deploy.
**why-change:** none from plan — live-data verification surfaced exactly the class of bug unit tests (stubbed fetch) cannot catch.

### STEP qa-S2 · qa · 2026-07-01T11:35:00Z
**task-id:** MONEY-RADAR-P0-T4-QA-GATE
**what-done:** Terminal Phase-0 DoD gate: RAW-verified (a)(b)(c)(d) + 3 HN spot-checks live; 30+39 tests pass, tsc clean both packages. Report: reports/TASK_REPORT_MONEY-RADAR-P0-T4-QA-GATE.md
**what-considered:**
- (b) re-confirmed qa-S1's market_prices_history 1-day-depth finding is structural (24h prune by design, pushPricesHandler.ts:231-243), not transient — escalated from "observation" to CONDITIONAL blocking item since it permanently kills D1+D2 on the live tool.
- (c) 404 root-caused to stale frontend image (built 06-30T07:31Z, route commit 07-01T11:02Z) — not a code defect; static+test verify only.
**why-decision:** SPRINT-DoD=REJECT(b) — detector logic proven via real 754-day daily_ohlcv replay (99 fire-days, e.g. 2026-06-24) but live wiring reads wrong table; bounce to dev-mcp-server for one-line datasource swap in moneyRadarStore.ts:48-66.
**why-change:** escalated (b) beyond qa-S1's non-blocking treatment — same root cause, more severe framing on independent full-DoD review.
