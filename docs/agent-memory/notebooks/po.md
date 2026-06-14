# PO Notebook

## 2026-06-14T02:24Z — triage: node-cron silent-misfire cluster → ONE architect root-cause

Router cluster brief (LIVE 02:20Z). Consolidated 3 dead/missed crons under ONE
architect-bound root-cause task. WIP held at 2 (FIX-MCP-CRASH-LOOP-WRITEWAL + BC-1).

### Board mutations (scripts/po-s58-cron-scheduler-reliability-consolidate.jq)
- **NEW** `ARCH-CRON-SCHEDULER-RELIABILITY` → ready[] (SPRINT-S, architect, P1, rc=3,
  depends=[FIX-MCP-CRASH-LOOP-WRITEWAL]). Levers: replace/upgrade node-cron · uniform
  recoverMissedExecutions+dedup · cluster stagger · missed-fire watchdog (last_run>2x cadence).
- **CORRECTED false-done** `FIX-FUNDAMENTALS-REFRESH-CRON-DEAD`: data-correctness banner
  fix (c35db4fc) is GENUINE done_verified — kept. autofire_status=STILL-OPEN, folded into
  parent. c35db4fc msg itself says Jun-8 "crash" = container restart; QA verified MANUAL
  trigger only → auto-fire never restored = distinct open defect.
- **FOLDED** FIX-OHLCV-DAILY-AGGREGATOR-STALE + FU-REPUTATION-CRON-MISS → parent (same root).
- **NEW** `FIX-NEWS-CB-FALSE-CLOSED` → backlog (I2: Reuters+TradingEconomics 14 errors,
  CB still [OK]; lower threshold + never-succeeded-since-restart detector).
- **FOLDED I7** (vn-sbv-fetch crash-loop) into existing FIX-SBV-FX-VPS-FETCHER-UNHEALTHY.

### Root-cause confirmation (3rd+ touch → escalation)
53d00955 (EVIDENCE-ACCUM, Jun-12) already NAMED the class: node-cron v3.0.3 drops ticks
under loop saturation when recoverMissedExecutions=false; per-job patch RECURRED on
reputation (06-12) + never covered aggregator/fundamentals. Per feedback_recurring_bug_
escalation → architect owns durable fix, no more per-job symptom patches.

### Live evidence
get_pipeline_health 02:22Z: "Aggregator last run: 2026-06-12" (missed Fri 06-13).
TNB c94 already ACK'd (cowork-pipeline coverage — separate from this cron cluster).
Schema-drift (0e81b642) NOT re-dispatched per router (genuinely complete).

### Carry-over
- Architect + design run NOW (no dev-mcp-server WIP impact); dev IMPL sequenced AFTER
  crash-loop fix lands (wedged server = loop-saturation tick-drop source).
- Monday market-day: verify aggregator/fundamentals/reputation auto-fire (G1-G3 gates).
- BC-1 live-verify gate ~03:00Z; watch genuine crash vs deploy-recreate.
