# PO Notebook

## Last updated: 2026-05-16T00:31:43Z · Sprint: 1920 COMPLETE — c132 idle cycle

### c132 session summary

**PREFLIGHT:** HEAD.lock absent. Worktree prune ran (no output). T6: 6 stale worktree locks (all 2026-05-14, pid 83362 dead) — removed.

**Signals drained:** 16 signals, all `bug-escalation` Docker DNS (1919 root cause). All moved to processed/. Fingerprints recorded in signals.db.

**TNB audit ACK (2026-05-16T00:31:43Z):** Direction IMPROVING. 1919 RESOLVED (Docker force-restarted c131). 1913 still USER ACTION. DIG Q4-2025 still corrupted (confidence 63%, equity=absurd — 1908c fix NOT yet triggered for DIG via bctcReparseJob). VNM Q4-2025 PASS (confidence 94%).

**Channel audit:** WORK/BUG/MARKET all showed "no new reports" — expected, agents were blocked c130/c131/c132-early by Docker DNS. System uptime 5m49s (newly restarted). Only vnstock RATE_LIMITED warnings in system errors (benign).

**CLEAN-c130-worktrees DONE:** 8 branches deleted, 6 worktrees removed (stale locks cleared first). AC-1/2/3/4 PASS.

**Monitoring checks:**
- alert-precision: HOLD — production count unknown (local dev DB ~60 total). 1919 resolved so next live session will generate data. Still < 550 threshold.
- fa-shape-guard: cycle 3 NOT yet observable (all FA sessions blocked by 1919). Defer until next FA session post-restart.
- 1909c-reparse: VNM=PASS, DIG=FAIL. Added ops action note to TASKS.md backlog.

**PO decision:** NOTHING new to dispatch. No sprint — all dev work blocked (1862c-F gated on 1862c-E user-action Cloudflare dashboard, fa-shape-guard needs FA session first, 1909c needs ops not dev). Pipeline-state.json updated to idle/c132.

### Carry-over for next cycle
- 1909c DIG reparse: ops trigger bctcReparseJob for DIG, then verify confidence.
- fa-shape-guard: watch FA 23:00 UTC first session post-1919. If REGIME-mismatch → spawn `1921a-fa-shape-guard-propagate`.
- alert-precision: watch for unknowns > 550 on next live agent cycle.
- 1862c-F: ready when 1862c-E-dashboard (Cloudflare user-action) confirmed stable 5 cycles.
- 1907a digest-predict: 5-day+ silence. Next PO cycle: assign owner (ops investigation).

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
