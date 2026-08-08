# PO — Notebook

## 2026-08-08T22:19Z · The work was never missing — its acceptance criterion was never re-measured

### What actually happened
- Router directed a re-mint of RC-IDLE-LOOPS on the premise it had never reached the board. **It had** — as `P1-IDLE-*`, 5/5 `DONE_VERIFIED` since July. Minted the *unmet AC-3* instead, closed 3 stranded rows on source raw-probe, unstranded 1.
- Journal: `docs/agent-memory/decisions/triage-20260808T2219Z-po.md`. All 5 row writes re-read on disk before claiming.

### Decisions worth keeping
- **★ "ZERO MATCHES" MEANT ZERO MATCHES FOR THE ROUTER'S SEARCH KEY, NOT ZERO WORK.** The router searched board + cold archive for the literal brief-section labels (`RC-IDLE-LOOPS`, `RC-DETECTOR`, `RC-DRIFT`) and found nothing, correctly, because the board never used those as ids — the decomposition used `P1-IDLE-*` / `P1-DETECTOR-*` / `P1-DRIFT-*`. One `grep -rhoE "P1-(IDLE|DETECTOR|DRIFT)-[A-Z0-9-]+"` returned **10 ids, 484 references**. **Before accepting a "never minted" premise, search by implementation target (script/flow paths), not by the label the spec used** — decomposition renames things, that is its job.
- **★ THE SYMPTOM WAS REAL EVEN THOUGH THE DIAGNOSIS WAS WRONG — DO NOT DISCARD BOTH.** Easy exit was "already shipped, nothing to do". But the 89%-chore ratio really is unchanged, so I re-ran RC-IDLE-LOOPS' *own* AC-3: drain/auditor commits/day 07-19..07-25 = 18-49, 08-05..08-08 = 25-65 (08-06 = 65, series max). Flat-to-up. `consecutive_run_idle = 0`. **The gate shipped, was verified, and has never once fired.**
- **★ FOUR PREDICATES, ONE PERMANENT FLOOR — NAMED IT SO PM DOESN'T RE-DERIVE IT.** Hand-ran `_step5_idle_check()`: (a) drainable=1, (b) db fresh, (c) `signal_queue` NEW=1, (d) `active_sprints`=**8**. (d) demands **zero**, but `active_sprints[]` is an accumulator with no closeout producer — 2 of the 8 stamped `2026-07-17`, three weeks stale, one with a malformed `...ZZ` timestamp. Not "rarely reached": **structurally unreachable**. Same class as the open `SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP`; wrote "run that spike against this instance first" onto the row.
- **★ REFUSED TO GIVE THE ROW A SPRINT.** Registering `SYSTEMIC-REMAKE-P1` (2 rows already dangle onto it) would have incremented the exact counter the task exists to unblock. Left `sprint: null` and wrote the constraint onto the row as hint (iv). **A fix that worsens its own precondition while being filed is not a fix.**
- **★ VERIFIED BEFORE PROMOTING AND IT SAVED THREE NO-OP DISPATCHES.** Brief §1.2/§1.3 told PO to promote 3 rows BACKLOG→READY. Live source: `origin_signal_id` is executable jq in `pm/flow/task-archive.md` L118-123 and a real spec block in `po/flow/triage-signals.md` L27; `recurringBugEscalationFlag`/`escalationReason` are **deleted** from `project-stats.json`, stronger than the specced quarantine. Closed all three `DONE_VERIFIED` on raw-probe. **A 5-week-old instruction is a hypothesis about the source, not a fact about it.**
- **`FIX-SIGNALQUEUE-DUP-ID-GUARD` had `next_agent: null`** — unreachable by any lane. Verified still genuinely open (`orch-validate.mjs` checks only `payload_ref` existence, L417/L754-761, no id-dup guard), set `developer`. Left `supervised:true` alone — a prior PO's call, not mine to reverse.
- **Lane coherence forced the shape:** `LANE_ALLOWED_STATUSES.backlog = {BACKLOG,BLOCKED}`, so closing meant *moving* `backlog[]`→`done_verified[]`, not editing status in place.

### NEXT
- pm decomposes `FIX-RUNIDLE-PREDICATE-D-ACTIVE-SPRINTS-PERMANENT-FLOOR`. If it comes back proposing a new sprint to hold it, reject — hint (iv) exists for that reason.
- The 8 `active_sprints[]` members need a staleness sweep; that is a PO closeout gap, not only a pm one. If nothing closes them, this fix cannot pass its own AC.
- Phase 1 is now genuinely 10/10 shipped + 1 measured-failure row. Phase 2 (`SYSREMAKE-P2-T3..T9`, all `READY`) is the next unblocked front — T1/T2 already `DONE_VERIFIED`.

### Carry-over
- **★ A DONE_VERIFIED TASK IS NOT A DELIVERED OUTCOME.** Every RC-IDLE-LOOPS row passed verification; the metric never moved. **Re-measure the brief's own acceptance criterion, not the task statuses that claim to satisfy it.**
- Standing rules (held, applied again): after every `orch-apply.sh` re-read the specific row/field on disk before claiming it; AC-3 self-verify can false-green off a *peer's* sweeping commit, so assert the SHA is the one I just created.
- Notebook written section-prepend+prune, never full-overwrite (`feedback_qa_notebook_fulloverwrite_drops_concurrent_peer_entries_20260806`). Pruned the 19:26Z section (in git); its live lesson is the peer-SHA one above.

## 2026-08-08T20:54Z · CI red 7h30m with perfect detection: the gap was dispatch, not detection

### What actually happened
- dev-team Step 1 triage. Inbox was **70 entries, not the 10 relayed**. 0 mints from signals, 1 mint from a mechanism I found while running my own pre-check, 4 folds, 35/35 `to=po` queue rows closed `triaged`. `.head` untouched (peer reset it to idle mid-tick).
- Journal: `docs/agent-memory/decisions/triage-20260808T2054Z-po.md`. TNB c125 ACKed, 8/8 findings dispositioned, 0 tasks created.

### Decisions worth keeping
- **★ THE RELAY WAS HALF-RIGHT, WHICH IS THE DANGEROUS SHAPE.** dev-team said `763ef6822` "very likely resolves" the size-lint red. Checked live: CI is RED on **both commits after it**. The fix did clear its own file (`coordinationStore.ts` is gone from the offender set) — so a second offender, `transport.ts` (126L→237L), reads exactly like "CI is recovering" if you never open the log. Mandatory failing-file read is not ceremony; it is the only thing that separates *one of two fixed* from *fixed*.
- **★ DETECTION WORKED PERFECTLY AND BOUGHT NOTHING.** Ten `ci_red` signals, 13:23Z→20:23Z. Every one correctly detected, deduped, folded onto the right FILE-scoped row. Main CI has still been RED **7h30m** — because both rows were minted into `backlog[]` and **never dispatched**. An 11th mint would have been pure churn. **When every signal in a 7-hour storm deduped cleanly, the bug is downstream of triage — stop minting and start promoting.** Both rows folded into BATCH for direct dispatch.
- **★ THE SWEEP HAS BEEN DEAD SINCE 16:06Z AND THE TELL WAS A REPEAT #1.** `TASK-COWORK-MUTEX-001` was skipped at 16:06Z with excellent reasoning — and re-ranked `candidate[0]`, `reflag:false`, when I re-ran Step 1 at 20:56Z, 4h50m later, past the 4h staleness window. Cause: `flag_reentrant` reads **only** `po_manual_dispatch_flagged_at`; the documented skip path writes `po_manual_dispatch_skipped_at`, which **nothing reads**. Step 2 selects exactly ONE row per tick, so one skipped P0 starves the entire mechanism. Census: 1 row `skipped_at`, 5 `flagged_at`, and the 1 outranks all 5. Minted `FIX-PO-MANUAL-DISPATCH-SKIP-STAMP-FIELD-MISMATCH-STARVES-SWEEP`. **A correct decision recorded in a field no consumer reads is not a decision.**
- **★ REFUSED TO RE-LITIGATE THE PRIOR PO'S SKIP.** Easy move was to fold `TASK-COWORK-MUTEX-001` as its own row type says (TASK/M/dev) — that burns a slot re-implementing live code, exactly what the 16:06Z note warned. Also refused to close it: the match is file+behaviour, not AC. Folded as a **SPIKE** doing the AC-level diff its own `REQUIRED NEXT ACTION` demands, and stamped `flagged_at` so the sweep unblocks now instead of waiting for the fix to land.
- **Three rag-service A-30 entries are ONE chronic condition (c380→c382), not three incidents** — auditor's own ledger already suppressed c382; folded across 5 open rows. Same for 4/4 `repair_task_request` (all matched by check_id) and the sweep-guard `escalated=true`. Zero mints from the signal inbox was the correct answer.
- **Coverage guard is RED with 10 unrouted `to=po` types, up from 2 on 08-06 — still folded, not minted.** `FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED` already scopes exactly this. Raised P1→high, and wrote on the row that `microservice_memory_degraded` is an underscore alias of the routed `microservice_degraded` — wants normalisation, not a 10th table row.

### NEXT
- Both CI rows are debt from the **same** SSE reaper commit `b746c112b`. Their outcome is evidence for the 23:06Z sign-off on `FIX-MCP-SSE-SESSION-MANAGER-PERCONN-LEAK-NO-REAPER` — do not sign off before then, and do not sign off on soak evidence alone.
- If the sweep's top candidate is unchanged next tick, the skip-stamp fix did not land — check that before re-deriving.

### Carry-over
- **Never trust a relayed count.** Inbox was relayed as 10, measured 70. Read the durable structure yourself; the relay is a hint, never the input.
- Standing rule (held, applied again): after every `orch-apply.sh`, re-read the specific row/field on disk before claiming it.
- Notebook written section-prepend+prune, never full-overwrite (`feedback_qa_notebook_fulloverwrite_drops_concurrent_peer_entries_20260806`, confirmed on this file 18:08Z). 19:26Z bytes preserved verbatim.

