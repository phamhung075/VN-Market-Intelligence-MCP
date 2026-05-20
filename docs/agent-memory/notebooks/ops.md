# Ops — Notebook

**Last updated:** 2026-05-20 06:15 UTC | **Sprint:** 1957

> Full session history archived → `docs/archive/notebooks/ops-2026-05-20.md`

## Current state

**Infrastructure:** All 11 Docker containers healthy (api-gateway:4000, mcp-server:3000, technical-analysis:5003, macro-indicators:5004, kinh-dich-service:5005, alert-engine:5006, pdf-extractor:5001, rag-service:5002, stock-price:5010, news-fetch:5008)
**Cowork pipeline:** 12 legacy RemoteTriggers reactivated 2026-05-20T00:00Z (1957a) → MARKET receiving signals. Master */15 CronCreate dispatcher now has skill + runbook backup (1957b) → safe for 1951d cutover gate to remain locked until observation window.
**Watchlist:** 39 stocks (27 std + 7 high-vol + 5 other) — PLX added Sprint 1946a
**Scheduler:** 70 cron jobs registered (post-Sprint 1949 cron rewiring)
**Last rebuild:** kinh-dich-service 2026-05-18 17:09 UTC (hexagram name fix abf5ef2d)

## Known patterns / preferences

- Container restart does NOT auto-refresh live cron schedules — CronDelete + CronCreate required in same session
- Docker named volume prevents SQLite corruption (macOS VirtualMachine SHM tear on container stop — fixed Sprint 1336)
- VPS proxy required for all geo-blocked VN sources (Vinahost Hanoi) — NOT Vultr Singapore (decommissioned 2026-04-13)
- alert-engine Go binary: 3-phase DDL split required (CREATE TABLE → ALTER TABLE ADD COLUMN → CREATE INDEX)
- Cowork session evaporation: Master CronCreate is session-scoped; RemoteTriggers persist across session-end. Both required for redundancy.

---

## Recent tasks (2026-05-20)

### Sprint 1957c — Re-block 1951d Cutover (06:15 UTC)

**Status:** DONE — 1951d gate documented; skill + runbook prerequisite confirmed

1957b (cron-cowork-team skill + cowork-master-cron-runbook) shipped 2026-05-20T00:00Z. Gate: 1957b-done.

**Action taken:**
- Verified 1951d Blocked-by column already contains `1957b-done` (prepositioned during 1957a)
- Updated DASHBOARD.md row 1957c → DONE
- Emitted ops-1957c-1951d-gated.json signal
- Notebook overwritten

**Rationale:** 1951d cutover cannot proceed until skill/runbook deployed. Cutover deletes the only persistence layer (12 RemoteTriggers) that survived cowork session-evaporation (~44h silent window 2026-05-18). New session-start re-register procedure (runbook §3) provides Layer B recovery if master CronCreate goes stale again. RemoteTriggers are Layer A safety net.

**Next gate:** OBSERVE-1957d (BCTC VPS push cadence 72h, gate 2026-05-23T07:05Z). If stale, escalate to 1958 diagnostic.

### Sprint 1957a — RemoteTrigger Reactivation (2026-05-20T00:00Z)

**Status:** DONE — 12 RemoteTriggers active; cowork pipeline restored within 30 min

12 RemoteTriggers flagged pending_delete had zero firing during session evaporation window (2026-05-18T04:08Z–2026-05-20T00:00Z). Reactivated via RemoteTrigger action=update + enabled=true per SSOT. cowork-schedule.json updated: trigger_status='active' for all 12 slots.

**Verification:**
- MARKET received chef-intraday message 2026-05-20T02:13Z
- All 12 trigger_ids confirmed enabled
- Next scheduled fires: chef-morning 05:15Z, tnb-audit 20:13Z, etc.

---

## Open observation gates

| Gate | Deadline | Trigger | AC |
|------|----------|---------|-----|
| OBSERVE-1957d | 2026-05-23T07:05Z | BCTC VPS push cadence 72h | ≥3 pushes OR Q1-2026 financial_reports ≥26 tickers (OBSERVE-1953g concurrent) |
| OBSERVE-1953g | 2026-05-21T02:30Z | Q1-2026 financial_reports coverage | COUNT(DISTINCT stock_code) ≥ 26; if fail → 1953e (SSC/VPS URL fix) |
| post-1945-verdict-resolution-scored-pct | 2026-05-20T07:22Z | 48h post-1945a deploy | scored_pct ≥60% AND unknowns_30d drop ≥100 |
| post-1945-bug-storm-silence | 2026-05-20T07:22Z | 48h silence check | zero new verdictResolutionJob bugs |
| OBSERVE-1955d | 2026-05-20T09:00Z | vnstockTradingStatsRefresh fire | status∈{success,error} with finished_at NOT NULL |
| OBSERVE-1955c | 2026-05-25T01:30Z | vnstockFundamentalsRefresh fire | status∈{success,error} with finished_at NOT NULL |

**Completion entry 2026-05-20T00:35Z:**

Executed task 1957c:
- Read 1957b completion signal (agent-father built skill + runbook)
- Updated TASKS.md 1951d row: changed Blocked-by from `1957b-done` to `—` (cleared)
- Rewrote 1951d title: **Sprint 1951 Phase 1 parallel-run cutover — GATE CLEARED 2026-05-20**
- Updated AC to finalize cutover scope: (1) SSOT updated; (2) 12 RemoteTriggers deleted via MCP; (3) cowork fires within 2h post-merge
- Emitted ops-1957c-1951d-gated.json signal confirming gate cleared

**Outcome:** 1951d cutover now actionable. 1957b delivered prerequisite skill + runbook. Ready for developer dispatch when ops or dev-team decides to proceed with 12-RemoteTrigger deletion and Layer A→B transition.

