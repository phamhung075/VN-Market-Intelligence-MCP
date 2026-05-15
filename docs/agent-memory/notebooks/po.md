# PO Notebook

## Last updated: 2026-05-15T21:04Z · Sprint: 1920 ARMED (DB Pipeline Completeness)

### This session — user-directed sprint kickoff
User goal: "every microservice DB table must have an active data pipeline; cowork agents need complete VN market picture." Audit + sprint plan executed despite Docker DNS still down (1919).

### Audit method
- Schema enumeration: 74 CREATE TABLE entries across `apps/mcp-server/src/infrastructure/db/schema-*.ts` (8 slices) + Go services (alert-engine adds `alert_engine_records`, `market_prices_cache`; stock-price ditto) + Python services (`pdf_documents`, `pdf_extracted_text`, `rag_entries`).
- Writer search: regex `(INSERT|UPDATE|REPLACE)\s+(OR\s+(IGNORE|REPLACE)\s+)?(INTO\s+)?<table>` across TS/Go/Py.
- Scheduler wiring: cross-referenced each writer with `scheduler/**/*.ts` callers + `cronConfig.ts` (59 active crons).

### Findings — 10 zombie / orphan tables
**Tier 1 fundamentals (analyst-critical):**
- `vnstockStore` writers (7 tables: financials, balance_sheet, cash_flow, events, officers, shareholders, trading_stats) → ZERO scheduler caller. Financial-analyst PE/PB/ROE peer comparisons silently fall back to NULL.
- `bondMaturityStore.insertBondMaturity` → no scheduler. `bond_maturity` zero-rows.

**Tier 2 macro:**
- `commodityTracker` + `shippingIndex` writers exist; no cron → `commodity_prices` stale.

**Tier 3 intelligence:**
- `brokerSanctionStore` → no scheduler caller.
- `BacktestResultRepo.recordRun` → ZERO callers (cascadeBacktest only updates cascade_rule_hits, never persists run aggregate).

**Tier 4 observability:**
- `signal_quality_audit` → schema exists, signalValidator.ts:183 says "future-use" — no INSERT.
- `prediction_claims` → only written from interactive evidenceTools MCP call, no autonomous cron.

**Tier 5 retire:**
- `skips` + `user_requests` → ZERO writers anywhere. `user_requests` superseded by `ask_queue` per docs.

### Sprint 1920 written
SPRINT_GOAL.md updated (top entry "Sprint 1920 — DB Pipeline Completeness"). TASKS.md Backlog gained 10 rows: ARCH-1920 (cadence brief, blocks 1920a–d), 1920a–i. Task IDs and priority/owner/zone all set. Docker dependency noted — code can ship on main today, deploy queued post-1919.

### Channel audit — abbreviated (Docker DNS still down)
- MARKET: no traffic since 09:04 UTC (1919 blocks).
- WORK: send_telegram MCP call failed silently (curl no-output) — gateway routing affected by Docker DNS. Sprint summary is in SPRINT_GOAL.md (durable SSOT), TASKS.md, and this notebook. Will retry next cycle.
- BUG: no new reports filed (agents can't reach MCP).

### Decisions / non-decisions
- DECISION: ship Sprint 1920 plan even with Docker frozen (codebase changes don't need running containers).
- DECISION: did NOT decompose 1920a into 7 sub-tasks per vnstock table — single scheduler file covers all 7 (architect can re-split if needed).
- DECISION: 1920h chose "annotate DEPRECATED" path over DROP TABLE (safer default; reversible).

### Open questions for BA spec authoring
- 1920a: quarterly cadence per ticker — coordinate with `bctcReparseJob` (post-BCTC) or independent calendar?
- 1920b: bond source — is HSX/HNX calendar scrape-able from VPS, or another vendor?
- 1920c: which commodity codes? — propose: BRENT, WTI, IRON_ORE, COAL, RUBBER, RICE, COFFEE, STEEL_HRC, BDI, USD_DXY (10 codes).
- 1920d: SSC enforcement page — verify URL stability before scheduling.

### Carry-over for next cycle
- Retry WORK telegram once Docker DNS recovers (1919 user-action gate).
- Watch for ARCH-1920 brief landing — that unblocks 1920a/b/c/d for BA decomposition.
- 1919 still CRITICAL F1 USER ACTION (Docker Desktop restart).
- fa-shape-guard cycle-3 observation still deferred (Docker blocked).
- alert-precision-488-unknowns still HOLD.
