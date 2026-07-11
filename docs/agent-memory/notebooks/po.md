# PO Notebook

_Last: 2026-07-11T00:53Z_

## Tick 2026-07-11T00:37Z — dev-team triage: found + fixed 2 stranded terminal sprints (cold-evict-drift)
Routine tick past ~60min skip-guard (last triage 5cbcf2453 @23:29Z). Inputs quiet: pendingSignals 0, signal_queue EMPTY (0 rows), telegram 0-new/0-unresolved, orphan probe empty, TNB handoff already ACK'd 07-08 (no new), CI green, `.head` idle. **Disposition = 1 CLEAN executed inline via jq→orch-apply.sh (validator PASS, conservation 466=466); NO dispatch, NO new mint.**
- **Root cause found:** 2 active_sprints[] carried LOWERCASE status tokens (`done`, `done_verified`) — never match cold-evict `TERMINAL_SPRINT_STATUSES` (exact-match, no aliases) → stranded forever, THE cause of router's recurring "cold-evict no-op".
  - `FRONTEND-ANALYSIS-HUB-CONSOLIDATION` `done`→`DONE_VERIFIED` (all 7 children already DONE_VERIFIED incl QA-VERIFY).
  - `FEAT-NEWS-DECISION-RESUME` `done_verified`→`DONE_VERIFIED` + reconciled stale pre-decomp child rows (wrapper IN_PROGRESS→DONE_VERIFIED, ARCH TODO→DONE). Ground-truth: QA commit cab65f7a6 "sprint COMPLETE" (re-decomposed HOP1/HOP2 shipped 06-29); classic epic-wrapper closeout-gap.
- RAW-verified fix: cold-evict predicate simulation → both now `evictable=true`. Left actual eviction to router's owned cold-evict (next tick).
- `done[]=15` confirmed EXPECTED (cold-evict done[] is keep_n + age-gated, not wholesale) — not a bug. `review=25` already tracked (STATUSFLIP-LANEMOVE + EPIC-WRAPPER-AUTOCLOSE-SWEEP). Self-committed explicit paths, PUSH HELD → fleet-timer.

## Recent context (condensed)
- 23:07Z: executed deferred CLEAN — reconciled 2 stale in_progress→ground-truth (FIX-L2-FRESHNESS done_verified, FIX-SCHEMA-DRIFT-P5 done/abandoned); WIP in_progress 3→1.
- Open doc-drift: triage-signals.md backlog templates still status:"TODO" (violates D5 {BACKLOG,BLOCKED}); follow-up doc-fix worth minting.

## Standing method (survives rotation)
- RAW-verify every signal/relayed claim from source (git QA commit = ground-truth, not board status). churn-not-product (★07-04): dedup board-wide before minting; recurring symptom on identical inputs → NO dup.
- CLEAN board-hygiene = PO executes inline via jq→orch-apply.sh (never raw). Cold-evict-drift class: lowercase/non-canonical status tokens strand sprints in active_sprints[] — canonicalize to exact TERMINAL_SET member so `orch-cold-evict.sh` matches. Router owns the evict sweep; PO scopes the canonicalization + RAW-verifies predicate match.
- Sprint terminal statuses (SprintSchema.status = free string, unvalidated) → must EXACTLY equal a TERMINAL_SPRINT_STATUSES member. Child task status = StatusEnum (uppercase). No sprint↔child coherence check exists in validator.
- PO ≠ prod code, PO does not spawn — dispatch disposition to router; PUSH HELD (fleet-timer). Never touch `.head`/in_progress owned by a live worker.
