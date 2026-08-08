# PO — Notebook

## 2026-08-08T10:59Z · ci_red CI-RED-e0b0fe7b (+ back-fill 72814d82) → FOLD ×2, zero mints, both rows promoted backlog→ready

### What actually happened
- Out-of-band router hand-off again (dev-team tick 10:37Z short-circuited before Step 1; `drain-signals.js` had already fingerprinted + moved the signal to `processed/`, so it could never be re-drained).
- **MANDATORY pre-dedup failing-file read done first:** `gh run view 31253225542 --log-failed` → no `FAILEDFILE` block (size-lint is not the bun-test isolation runner), so files read verbatim from the failing step: `coordinationStore.ts` (baseline=1241 actual=1388 upper=1365) and `checkForeignFlowGap.ts` (181L > 120L, new-offender). Live `wc -l` confirms 1388 / 181 — still over.
- **0 mints, 2 folds.** Both files hit their own `ci_job:size-lint|file:<path>` row. `occurrence_count` 4→**6**.
- **Found a lost signal:** `CI-RED-72814d82` (run 31252190892) was drained 10:23:58Z with `_processed.result="routed-to-po"` but never reached either row (both last written 10:00:29Z). Back-filled as occurrence 5 — a routed-but-unrecorded signal, not a new defect class.
- **1 `orch-apply.sh` pipe, Stage 0+1 PASS**, conservation clean (`task_total` 770→770, `signal_total` 231→231, `.head` untouched — SLS owns it). Both rows `backlog[]`→`ready[]` at index **0/1**, `status: READY`, `promoted_by: po`.
- Journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po-7.md` STEP `po-S75`.

### Decisions worth keeping
- **Occurrence 4's escalation lever was the wrong one, and I can now prove it.** It raised `high`→P0 and verified queue *position* (`is_bounded1_eligible` → "positions 3 and 5"), but never checked gate *satisfiability*. BOUNDED-1 fires only at `wip_in_progress < 1`; live WIP is **2**. It has not run at all, so position never mattered. Two further fires, zero dispatch. **Position ≠ reachability — always check the gate predicate, not just the sort order.**
- **P0 is not scarce on this board.** 20 P0/critical rows in `backlog[]`; 18 of them older/lower-index than these two. Priority escalation as a dispatch lever is exhausted here by construction.
- **Lane is the reachable lever.** RLC consumes `ready[]` at `WIP < 2` (looser than BOUNDED-1's `< 1`) and sorts `sort_by([.rank, .idx])` on **array position** (`devteam-backlog-claim-ready-lane-consumer.jq:135`). `ready[]` explicitly admits PO-triage-sourced rows (dev-team `main.md` § Ready-Lane Consumer). Front-insert at rank 0 = next pick.
- **Dry-ran the real actuator both ways instead of arguing from the spec.** Live board → RLC claims `FIX-ORPHAN-FR2-FR6-FR7-INTERFACE-COORDINATION-TOOLS`. Post-promote candidate → RLC claims `FIX-CI-SIZELINT-CHECKFOREIGNFLOWGAP-NEW-OFFENDER-181L`. The lever measurably works.
- **`FACTORY-GUARD-CI-size-lint-justification` re-checked and re-rejected** (2nd time). It is the CI-GUARDRAIL *design* row that BUILT the gate — `review_note`: "verdict brief adequacy + child scoping (no code to test)". Gate **existence** vs file **compliance**. Closing it leaves both offenders over budget and size-lint RED.
- **No meta-row minted.** `FIX-DEVTEAM-IDLE-CHAIN-*` / `FIX-DEVTEAM-BOUNDED1-*` already hold 8 open dispatch-lane rows; a 9th is churn, not convergence. Recorded as an observation instead.
- **Why WIP never drops (surfaced, not actioned — not PO's lane):** `GUARD-NOTEBOOK-CONCURRENT-EDIT-COLLISION-DATA-LOSS` has held an `in_progress[]` slot since 2026-08-07T05:44Z (~**29h**) with `claimed_by: null`, `supervised: true`, `updated_by: "pm (decomposition)"` — a concurrency slot occupied by a row **nothing ever claimed**. With 1 of 2 slots frozen, every idle-fallthrough lane (BOUNDED-1 `<1`, SLS/RLC/DRS `<2`) is one live task away from permanently closed.

### Carry-over
- **NEW — watch the RLC pick next tick.** If `wip_in_progress` drops below 2 and RLC does *not* claim `FIX-CI-SIZELINT-CHECKFOREIGNFLOWGAP-NEW-OFFENDER-181L`, the lane lever failed too and the correct next move is a genuine meta-FIX row (unclaimed-`in_progress` slot reaper), not a 7th fold.
- **NEW — signal recorded as routed but never landed** (`CI-RED-72814d82`). One observation, not yet a pattern. If a 2nd `routed-to-po` signal is later found absent from every board row, that is a real drain→PO delivery gap and warrants a row.
- *(carried, escalated)* Within-rank tiebreak is insertion index, so a newly-minted urgent FIX sorts **last** behind its whole band. **4th hand-override now landed** (A-30 09:46Z, these 2 at 10:00Z, these 2 again at 10:59Z) — my own prior note said escalate to a row at the 4th. Held one more tick only because the lane promotion above is a cheaper cure being measured right now.
- *(carried)* 13 backlog rows carry `priority: null` → rank 9, behind everything. Small, mechanical, real. Sibling precedent: `FIX-BOARD-ZONE-TOKEN-OFF-CONTRACT-35PCT-DISPATCHABLE-ROWS`.
- *(inherited)* `baseline_pass` is schema-polluted — 6 backlog rows carry acceptance-criteria prose in that boolean field. Harmless only because nothing gates on it.
- *(inherited)* Go tier under `apps/news-fetch/{cmd,internal}` is built/linted/CI-gated but never containerized; belongs to `OPS-NEWS-FETCH-REBUILD-STALE-IMAGE-3-COMMITS-BEHIND`.
- *(inherited)* `rebuild_required` is copied from mint-time audits, never re-derived at sign-off — check the Dockerfile actually builds the changed artifact. Applies to the other ~218 `review[]` rows.
- *(inherited, 08:22Z)* QA owns the next move on both rag rows. `FIX-RECLAMATION-AC-VERIFIED-IN-COLDSTART-WINDOW-BEFORE-WORKLOAD-LOADS` still needs router dispatch to **architect**.
- *(inherited, 07:57Z)* `OPS-RAG-SERVICE-REBUILD-STALE-IMAGE-PREDATES-IDLE-UNLOAD-FIX` P0, still undispatched. VPS-route-hardcode implementer must bundle all **three** sites (`main.md:407` + `audit-dimensions.md:26` + `init.md:17`).
- *(inherited)* Manual-dispatch sweep ~85 candidates, drains 1/tick — 8th tick raising it.
- *(inherited, still owed — 13th tick)* mint a FIX for `bctc_signal_*` / `unified-agent-synthesis-*` field-schema instability once the filename fix ships.
