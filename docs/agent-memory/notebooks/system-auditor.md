# System Auditor — Tier-1 Notebook

## c1000 · 2026-08-24T03:09Z
### Audit Run Tier-3 (02:53–03:10 UTC 2026-08-24)
- Tier: 3 | Services: 13 up | DB checks: 16 (C-01..C-16) + A-22..A-28, A-31, B-08 | Doc/memory steps 1-6
- Anomalies: 4 new (C 0, W 4, I 0) | 6 folded (already-tracked / caller-directed)
- Status: DEGRADED
- Scope: caller scoped tiers DISJOINT — Tier-1 runtime ping + Tier-2 freshness sweep NOT run (see CONTRACT-CONTRADICTION)

**RAW-PROBE:**
```
docker ps: 13/13 host_runtime_set containers Up+healthy (mcp-server 13h, pdf-extractor 11h, rag-service 8d)
A-22/23/24: /usr/bin/pdftoppm rc=0 | /usr/bin/tesseract rc=0 | vie lang present -> PASS
A-25..A-28: stock-price:5000=200 technical-analysis:5003=200 alert-engine:5006=200 pdf-extractor:5001=200 -> PASS
A-31: docker logs --since=30m | grep -c "EPIPE|ECONNRESET" = 0 -> PASS
B-08: ls /app/data/pdfs | wc -l = 323 -> PASS
NULL-guard: date('now','-3 day') IS NULL = 0 ; datetime('now','-7 days') IS NULL = 0 -> modifiers valid
Window: VN dow=1 (Mon 2026-08-24 09:59 ICT) -> '-1 day' window per weekend guard
C-01 96 (>=25 PASS) | C-02 96 (>0 PASS) | C-03 45 (>=26 PASS) | C-04 6 (<=5 FAIL)
C-05 0 (PASS) | C-06 3 (>0 PASS) | C-07 50 (>0 PASS) | C-08 0 (PASS) | C-09 3 (>=3 PASS)
C-10 0 (<=2 PASS) | C-11 0 (KNOWN-BROKEN predicate) | C-12 ok x5 DBs | C-13 max WAL 4132392B (<50MB PASS)
C-14 3.1% (<60 PASS) | C-15 4/4 columns present (PASS) | C-16 1 (expected 0 FAIL)
pdf_documents status dist: failed=16802 processing=578 success=203 (no 'done' rows exist -> C-11 inert)
/app/data df: 234G size / 220G used / 14G avail / 95% use
Doc step1 INDEX.md 5/5 pointers dead | step2 cron catalog 70 vs 88 | step3 42 agent files, 0 real dangling
step4 size-cap jq exit=5 (aborts) ; null-safe=77/80 ; sprint_goal.entries=16 (>15) ; CLAUDE.md 57L (<120)
step5 integrity_check=ok all | step6 gen-project-stats --dry-run == committed (toolCount 184, cronJobCount 88)
```

**Findings (4 new, filed):**
- C-16 WARN sys-20260824T030458-5510 — bctc_vps_queue id=255870 BID 2025 Q4 pending since 2026-04-28 (118d), attempts=0, HNX BaoCaoQuanTri URL. Status dist: deferred_infra=328 done=194 enrich_failed=65 url_not_found=26 pending=1.
- C-13b WARN sys-20260824T030524-5850 — 7 abandoned market.db copies (~2.36GB) in live /app/data, oldest 36d, volume 95% full. Detect-only, retention call belongs to ops/dev-mcp-server.
- DOC-AUDIT-2 WARN sys-20260824T030556-6dc3 — system-map.json mcp-server .crons = 70 vs gen-project-stats cronJobCount = 88; 26 live crons absent from catalog, 5 catalog entries no longer crons. NOT the A-29 fire-gap class.
- DOC-AUDIT-4 WARN sys-20260824T030752-699e — flow/main.md:821 + .claude/skills/doc-heal-system/reference.md:45 run `[.task_board.active_sprints[].tasks[]] | length` unguarded; 2 SPRINT-S rows carry subtasks[] and no tasks[] -> jq exit=5, no value, 38d silent wedge. Write-path consumers verified null-safe.

**Folded (already tracked / caller-directed, NOT re-filed):**
- mem_creep 85.11% pdf-extractor — caller-directed FOLD, Tier-2 already folded it tonight.
- A-29 cron class — 2 triaged aggregate rows + 8 per-cron rows live; caller-directed.
- INDEX.md 5 dead session pointers — exact dup of backlog FIX-AGENTMEMORY-INDEX-DEAD-SESSION-POINTERS (P3, 2026-08-14). Re-verified still dead this cycle.
- C-04 (6 rows <0.2 conf in 7d, all one 2026-08-23T14:38-14:49Z batch) — parent row FIX-BCTCREPARSEJOB-NOT-FIRING-40H-LOWCONF-BACKLOG-ACCUMULATING (P1). Measurement update: 52 of 263 rows now <0.2 (was 45 when that row was written) — still growing, fix has not landed.
- C-11 status='done' predicate can never match — tracked by backlog FIX-AUDITOR-C11-PDFX-STATUS-PREDICATE.
- sprint_goal.entries=16 > 15 cap — tracked by backlog FIX-SPRINTGOAL-STATUSLESS-ENTRY-STRUCTURALLY-UNEVICTABLE.

**Checked, explicitly NOT a finding (false-positive candidates resolved):**
- 4 CCATO subtask ids absent from the live board resolve to real done_tasks rows in docs/data/orch/archive/2026-08.json (437-440) — completed + archived normally, not dangling.
- Notebook compose dropped=4 on the 02:44Z Tier-2 write is cap-driven, not data loss (notebook-compose.sh backstop loop, retention is 3 sections AND a total line cap).
- financial_reports.period_quarter stores 6 TEXT 'Q1' rows vs 257 INTEGER — no live predicate is affected today (the 6 are period_year=2025; C-03 filters 2026), so recorded here as latent, not filed.
- .claude/agents/*.md single "dangling" pointer is the fb-post-YYYY-MM-DD.md template placeholder.

**Notebook numbering anomaly (INFO, not filed):** the 02:41Z Tier-2 cycle wrote `## c999` instead of the derived c118 (prior headings were c114-c117), so this cycle's deterministic derivation yields c1000. Numbering continuity with the c1xx series is broken; harmless mechanically, but the next reader should know the jump is a peer cycle's hand-picked number, not 880 missing cycles.

CONTRACT-CONTRADICTION: check=TIER-3-SCOPE spec=docs/agents/system-auditor/flow/main.md:141=`TIER=3 -> run Tier-1 + Existing Doc/Memory Audit (steps 1-6) + Tier-3 DB Integrity` caller_value=tiers are DISJOINT, skip Tier-1/Tier-2 caller_quote="Tiers are DISJOINT, not nested — do NOT re-run Tier-1 runtime pings or Tier-2 freshness sweeps." resolution=CALLER_SCOPE_HONORED_FOR_TIER1_PROBE — §Tier-1 Runtime Ping / tier1-probe.md was NOT executed this cycle. AUD-CP-1 makes the caller authoritative for AUDIT_TIER only, so this deviation is recorded, not silently absorbed: the Tier-3-owned container/inter-service checks (A-22..A-28, A-31, B-08) DID run, only the Tier-1 probe battery (A-01..A-32) did not.

[DURABILITY-SWEEP] swept=0 malformed=0 found=0 schedule_gap_t1=0 schedule_gap_t2=0 schedule_gap_t3=0

## d4-auto · 2026-08-24T03:00:01.675Z
D4 candidates: none

## c999 · 2026-08-24T02:41Z
### Audit Run Tier-2 (02:41–02:45 UTC 2026-08-24)
- Tier: 2 | Services: N/A | Sources: 27 | DB checks: 2 (C-06, C-07)
- Anomalies: 3 new (C 1, W 2, I 0) | 11 signal-emit-blocked (quality gate)
- Status: DEGRADED

### A-29 Cron Fire Check
**Raw Probe:**
```
layer_a_count=89 (server crons), layer_b_count=23 (Claude-Code crons)
Verdict: STALE=13, MISSED=1, ON_TIME=66, NEVER_FIRED=9, UNRESOLVED-JOIN=9
```

**STALE crons (13 total):**
- alertDigest (228.7h overdue, last 2026-08-14 14:00)
- eveningSummary (227.2h overdue, last 2026-08-14 15:30)
- foreignFlowAlert (138.5h overdue, last 2026-08-18 08:13)
- franceSummary (138.2h overdue, last 2026-08-18 08:30)
- signalOutcomeJob (138.2h overdue, last 2026-08-18 08:30)
- ohlcvStalenessCheck (138.5h overdue, last 2026-08-18 08:15)
- marketEarningYield (233.2h overdue, last 2026-08-14 09:30)
- alertOutcomeJob (138.0h overdue, last 2026-08-18 08:45)
- vnstockTradingStatsRefresh (138.2h overdue, last 2026-08-18 08:30)
- brokerSanctionsSweep (570.7h overdue, last 2026-07-31 08:00)
- breadthHistoryPersister (138.1h overdue, last 2026-08-18 08:37)
- ohlcvSanityCheck (227.6h overdue, last 2026-08-14 15:05)
- ragFtsRebuildCron (822.5h overdue, last 2026-07-20 20:15) ← CRITICAL

**MISSED crons (1 total):**
- monthlySignalQualityAudit (2018.7h overdue, last 2026-06-01 00:00)

**UNRESOLVED-JOIN (9 total — join fell through to fallback, status unclear):**
- marketOpen, marketClose, dataAuditDaily, summaryWeekly, summaryMonthly, summaryQuarterly, summaryYearly, foreignFlowFetch, publicContractsRefresh

**Findings:**
- A-29 (Cron Fire Gap): 1 CRITICAL (ragFtsRebuildCron 822.5h), 13 WARN (STALE group), 1 WARN (monthlySignalQualityAudit MISSED), 9 INFO (UNRESOLVED-JOIN)
- **Signal Quality Gate Issue:** 11 of 14 audit signals were rejected by post_agent_signal quality gate — detail-json insufficient for auditor-mode signals (FIX-AUDITOR-SIGNAL-QUALITY-GATE-STRICTNESS)
- **Trigger:** Last Tier-2 run 2026-08-23T14:42:59Z (11.7h ago) — threshold is 480 min (8h) — Tier-2 is now 3.7h overdue

### Per-Source Fetch Freshness (B-series) — SKIPPED
Could not complete B-series checks (pipeline API unavailable / requires live MCP tool invocation). Recheck next cycle.

### DB Freshness Spot Checks (C-06, C-07)
**C-06 (market_messages in last 3 hours):** > 0 ✓ PASS (last message 2026-08-24 02:15)
**C-07 (agent_signals in last 24 hours):** > 0 ✓ PASS

**Conclusion:** Runtime services and DB freshness OK. Cron infrastructure degraded (14 fire gaps detected, 1 production-critical).

CONTRACT-CONTRADICTION: NONE

[DURABILITY-SWEEP] swept=0 malformed=0 found=0 schedule_gap_t1=0 schedule_gap_t2=1 schedule_gap_t3=0

### Findings Summary

| Check | Verdict | Detail |
|-------|---------|--------|
| A-29-CRIT | CRITICAL | ragFtsRebuildCron stale 822.5h (35 days) — last run 2026-07-20 |
| A-29-WARN | WARN | 13 other crons stale (138–570h overdue) + 1 MISSED quarterly audit |
| A-29-INFO | INFO | 9 cron names unresolved (join fell through) — status unclear |
| Tier-2-GAP | WARN | Schedule gap detected — this Tier-2 run is 3.7h overdue vs 8h cadence |
| B-series | INCOMPLETE | Requires MCP tool access (deferred) |
| C-06 | PASS | Market messages fresh |
| C-07 | PASS | Agent signals fresh |
