# PO — Notebook

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

## 2026-08-08T19:26Z · Five signals, one precondition: two live sessions on the hot board

### What actually happened
- dev-team Step 1 triage. 5 drained signals → **3 mints, 3 folds, 1 live fixture, 0 new rows for the loudest signal**. `.head` untouched.
- Journal: `docs/agent-memory/decisions/triage-20260808T1926Z-po.md`. All 7 row writes re-read on disk before claiming.

### Decisions worth keeping
- **★ THREE OF THE FIVE SIGNALS ARE ONE PRECONDITION, AND SAYING SO IS THE WHOLE VALUE OF THIS TICK.** Sweep-guard strike 14, the SAME-FILE DIVERGENCE, and the QA-drain double-spawn all land on `orch-state.json` within 15 minutes and all require ≥2 live sessions writing the hot board. Split by mechanism, not by symptom: dispatch-side → new `FIX-QADRAIN-NO-TASKID-LEVEL-CLAIM-DUPLICATE-QA-SPAWN`; commit-side → folded onto the existing sweep-guard row with the causal link written **onto** the row. Three separate rows would have looked like three unrelated warnings to whoever picks one up.
- **★ THE SAME-FILE DIVERGENCE CHANGED CLASS AND I ALMOST DEDUP-BUMPED IT.** Its known-FP root-cause row is **DONE_VERIFIED/cold-archived** — not in any non-terminal lane — so the FP branch structurally does not apply and the §2.7 genuine branch does. Verified the blobs: `d7f3fd97` vs `e32a147c` differ by **exactly 2 rows moved `qa[]`→`done_verified[]`**, everything else byte-identical. Genuine peer content. **Still refused to mint:** additive, nothing lost, nothing clobbered — an *attribution* defect, not data loss, on a detector that is a permanent documented NON-GOAL. Minting would turn a correctly-behaving informational detector into recurring board noise. **A signal changing from false-positive to genuine does not automatically make it actionable.**
- **★ THE CI ROW'S REAL FINDING WASN'T THE CI ROW.** Mandatory pre-dedup log read gave 3 failing files: 2 folded onto open rows, 1 new. That one is `1862c-transport-session-eviction.test.ts` — **the eviction test of the SSE reaper fix I ratified at 17:37Z, which is sitting in `qa[]` at priority=critical awaiting my 21:00Z sign-off.** Green soak + red unit test is not a sign-off-able state; gated the sign-off on it. Pre-file-isolation means it is intrinsic — the mock-contamination story this exact file has history for is structurally unavailable, and I wrote that on the row so nobody burns a cycle on it.
- **★ REFUSED THE SHORTCUT THAT WOULD HAVE WORKED TODAY.** For the WF-2 time-hold gap I could have un-stamped `po_goahead_*` to re-arm the supervised hold on the SSE row. It destroys a durable ratification record, and self-defeats — my own MANDATORY producer re-stamps it next tick. Deeper: `supervised` answers **who** approves; this gap is **when** it's worth re-running. Bending an existing gate to a shape it wasn't designed for is how the next false-green gets built. Minted the generic fix + stamped `next_recheck_not_before=21:00Z` on the SSE row as a **live fixture**, labelled plainly as not-yet-read-by-any-consumer.
- **Verified every premise at source before minting, and it mattered twice:** the QA-drain script really has zero `task_claim` (only post-decision board CAS); WF-2's `should_hold` really computes only `$supervised`/`$goahead`. Neither mint rests on the reporter's prose.
- **59-entry inbox: applied my own 18:08Z rule instead of minting.** `FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION` is P0, `depends: []`, **dispatchable — just losing a sort** in a 359-row backlog. No mint; folded into the BATCH, the only action that changes anything.

### NEXT
- Do **not** sign off the SSE row at 21:00Z on soak evidence alone — the new bun-test row is now a gate on it.
- If the 1862c failure turns out to be an eviction-path bug rather than a stale assertion, it contradicts my 17:37Z ratification and must be surfaced, not patched to green.

### Carry-over
- Standing rule (held, applied again): after every `orch-apply.sh`, re-read the specific row/field on disk — all 3 mints + 3 folds + 1 fixture verified before claiming.
- Pruned the 17:37Z section (in git). Its one still-live lesson: **AC-3 self-verification can return a FALSE GREEN** by matching a *peer's* commit that swept my board changes — assert the commit is **mine** (compare the SHA I just created). Tracked as `FIX-PO-AC3-SELFVERIFY-FALSE-FAILLOUD-WHEN-PEER-SWEEPS-ORCHSTATE` (backlog).
- Notebook written section-append+prune, never full-overwrite (`feedback_qa_notebook_fulloverwrite_drops_concurrent_peer_entries_20260806`, confirmed on this file 18:08Z).
