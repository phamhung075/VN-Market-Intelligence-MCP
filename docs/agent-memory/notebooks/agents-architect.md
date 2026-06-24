# agents-architect — Notebook

## 2026-06-17T12:39:55Z

**Brief:** `docs/architecture-briefs/2026-06-17-gatherer-exec-proof-failloud.md`

GATHERER-EXEC-PROOF-FAILLOUD: offhours gatherers (news-scout + market-watcher) claimed cycle-complete at 12:09Z without executing — stale notebook (08:08Z / 08:07Z), 0 new signals, parroted prior macro (oil=78.38). Root: no invariant blocks log_agent_work(completed) when fetch steps were silently skipped. Fix: generic EXEC-PROOF gate (new exec-proof-gate skill) inserted as Step 3e (news-scout stage-log-notify) and Step 4e (market-watcher cycle) before completion ping. Gate checks EXEC_PROOF_1 (notebook_ts >= cycle_start) AND EXEC_PROOF_2 (fetch_result_count > 0 AND macro_ts >= cycle_start); on fail → BUG telegram + signal file + EXIT, no completion ping. cycle-bootstrap skill gets CYCLE_START_UTC anchor capture. 4 tasks for agent-father: EP-1 (new skill) → EP-2/3/4 parallel.

**Signal dropped:** `docs/signals/gatherer-exec-proof-failloud-20260617T123955Z.json` → agent-father

---

## 2026-06-18T07:40:13Z

**Brief:** `docs/architecture-briefs/2026-06-18-cowork-blind-session-guard.md`

COWORK-BLIND-SESSION-GUARD (P1): confirmed live 2026-06-18 — blind news-scout spawn fabricated 06-18 sentiment into 5 briefs + fake-stamped 62 tickers in coverage-state.json; PO reverted+quarantined. Root: spawn-fanout.md has no preflight to detect gateway blindness before spawning. Fix: new blind-guard.md (Step 0c in main.md, before slot matching) runs gateway-free `jq '.mcpServers|length' .mcp.json`; spawn-fanout.md Step 5.0 gates the entire spawn loop on SESSION_BLIND — backstop slots logged as deferred, no-backstop slots (news-scout-market, market-watcher-market, alert-commander-market) written to telemetry errors[] as undeliverable, ONE work-channel summary per tick. Wired session: guard is a no-op. 3 file edits (create blind-guard.md + edit spawn-fanout.md + edit main.md), all agent-father zone, no rebuild needed.

**Signal dropped:** `docs/signals/cowork-blind-session-guard-20260618T074013Z.json` → agent-father

---

## 2026-06-24T15:04:57Z

**Brief:** `docs/architecture-briefs/2026-06-24-prediction-daily-cadence.md`

ARCH-PREDICTION-DAILY-CADENCE: prediction_claims producer starved since 2026-06-14 — Sprint 1949-T5 disabled monday.md (P-3..P-5 create_prediction_claim) but weekly.md only reads get_prediction_accuracy (never writes claims). Fix: create daily-predict.md reusing monday.md P-3..P-5 pipeline (cap=3/day), add same-day dedup gate in main.md (task_claim key published:digest-daily:YYYY-MM-DD TTL=86400s), add digest-daily cron slot (30 17 * * *) to cowork-schedule.json, update main.md dispatch table to route daily slot → daily-predict.md and Sunday → weekly.md (unchanged). Weekly ceiling raised to 15/week. Honest NO-OP when no ticker passes conviction threshold. weekly.md and monday.md untouched.

**Signal dropped:** `docs/signals/prediction-daily-cadence-20260624T150457Z.json` → agent-father
