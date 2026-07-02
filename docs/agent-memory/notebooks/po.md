# PO Notebook

_Last: 2026-07-02T09:57Z_

## Tick 2026-07-02T09:37Z — dev-team triage (coord d3292ca4): board-hygiene, NO dispatch (return NOTHING)

**Inputs clean:** read_telegram_reports(new)=none; list_unresolved_reports=[]; git branch=main only; head=idle (qa 09:38Z); WIP=1 (FIX-BCTC-ENRICHER-STUCK-BACKLOG, PARKED user-gated rebuild — untouched, no container actions).

**Signal #2 rag-restart-churn (file disposition only):** already fully triaged at 08:07Z tick — backlog `FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP` (ops, apps/rag-service/) carries the 245-restart + A-12-false-alarm corroboration in status_note; signal_queue row `rtr-20260702-rag-churn` already TRIAGED; ZERO NEW signal rows. NO new mint (dedup, memory feedback_auditor_reemit_clobbers_router_triage). Disposition: moved orphan `docs/signals/rag-restart-churn-20260702.json` → `processed/` (non-envelope shape, drain skipped it → stop re-surfacing). Evidence preserved + referenced by the backlog row.

**Signal #3 duplicate head keys (board hygiene, po-s138):** top-level `.head` idle=CORRECT (left untouched). `.task_board.head` had been RE-INFLATED with routing fields (active_task_id=BA-PREDICTION-EVIDENCE-REVIVAL, next_agent=architect) by updated_by=dev-team 2026-07-01T06:26:45Z — a RECURRENCE (po-s66 collapsed it 06-15). Collapsed back to non-routing deprecated stub via `scripts/po-s138-...jq | orch-apply.sh` (rc=0; 102 pre-existing SHG coherence warns, non-blocking). (a) BA-PREDICTION-EVIDENCE-REVIVAL = ABANDONED/SUPERSEDED: no real board row ever existed; concrete work spun out to `FIX-EVIDENCE-PIPELINE-STARVED` (real root: evidence_fragments=0→accumulator false-success) + `FIX-VPS-SSC-INSIDER-502` (decoupled VPS dep, 07-01T06:49Z) — do NOT resurrect. (b) dup key removed (collapsed to redirect stub, not deleted, per schema G-7 + po-s66 precedent).

**Recurring-bug-escalation (2nd head re-inflation):** root gap = `DeprecatedHeadStubSchema` uses `.passthrough()` → routing keys pass Zod silently → orch-apply never blocked the write. Minted PLAN-ONLY backlog `FIX-ORCHSTATE-TASKBOARD-HEAD-REINFLATION-GUARD` (architect, apps/mcp-server/, medium) to enforce G-7 at the write gate. backlog 385→386. NO dispatch pre-approved. RETURN=NOTHING (nothing dispatch-ready this tick).

## Carry-over
- WIP 1: `FIX-BCTC-ENRICHER-STUCK-BACKLOG` PARKED on user-gated mcp-server rebuild (also clears A-30 mem 85.66%+ stale-image scar). Do NOT unpark / plan container actions.
- `ready[]` = `TOKEN-ECONOMY-TICK-PREFLIGHT` (architect SPRINT-S, user_prioritized) — router dispatches when a WIP slot frees.
- New backlog guard `FIX-ORCHSTATE-TASKBOARD-HEAD-REINFLATION-GUARD` — architect groom (durable fix for repeat head-drift; find the dev-team writer that re-inflated too).
- `FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP` (ops, backlog) = rag churn root-cause, PLAN-ONLY.
- Size-cap breach root (cold-evict not clearing terminal done[] rows) still DEFERRED while board in-flight.
