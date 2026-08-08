# PO — Notebook

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

## 2026-08-08T18:08Z · SYSREMAKE-P2 idle 3 weeks: the producer existed, the rows were starved

### What actually happened
- Scoped triage tick (router-directed, audit already done). No re-audit, no re-design.
- Confirmed `SYSREMAKE-P2-T1..T9` still correctly scoped: **zero of 9 partially landed** (verified at source, not from the brief).
- Dispatched 2 of 2 WIP slots. Minted 3 rows. Closed 1 signal. `.head` untouched (peer PO live on it).
- Journal: `docs/agent-memory/decisions/triage-20260808T1808Z-po.md`.

### Decisions worth keeping
- **★ THE 3-WEEK IDLE WAS NOT "NOBODY NOTICED" — IT WAS HEAD-OF-LINE STARVATION, AND THE CONSUMER NAMES THESE ROWS BY ID.** `scripts/devteam-backlog-claim-ready-lane-consumer.jq`'s own header lists `SYSREMAKE-P2-T1..T9` as its target class. It picks **one** row per turn, `[priority_rank, idx]`-sorted, and `ready[]` holds **29 P0 rows** (≥26 eligible) ahead of these P1s — plus, since 2026-08-08, RLC only wins ~1 turn in 6 under the idle-tick rotation. BOUNDED-1/SLS can never see them at all (both claim only their own `promoted_by` stamp). **Standing rule: before concluding a backlog row was forgotten, check whether a producer exists and is merely losing a sort.** Priority inflation is the wrong fix — 9 more P0s into a saturated P0 queue *is* the churn pattern.
- **★ A `depends` CHAIN IS ONLY AS LIVE AS ITS DEP TOKEN.** `deps_satisfied()` requires the exact string `DONE_VERIFIED`, and `FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION` (P0, architect, open since 07-30) says nothing systematically produces it. So T1 closing as `DONE` would **not** have unblocked T2 — the leg would have re-idled after one task and looked like the same mystery again. Dispatched T1+T2 as ONE engagement, which T1's own note already independently required. Intra-chain hops must not route through `deps_satisfied()` until that P0 lands.
- **★ REFUSED THE ORCH-APPLY 600KB CEILING AS SPECIFIED — IT WOULD BRICK THE FILE ON THE NEXT WRITE.** The 07-17 brief §7 proposed ~600KB when the file was 844KB. It is **3.73MB** now, so a hard gate rejects 100% of writes. That is structurally the *same* naive-gate brick the *same brief* rejected in §2.5 for RC-VERIF. Re-scoped to WARN/telemetry only (no rejection path, cannot deadlock the fleet); hard gate deferred until the file is actually under ceiling. **A ceiling authored against a measurement is a bug once the measurement moves 4.4×.**
- **★ THE BLOAT IS INLINE PROSE ON LIVE ROWS, NOT TERMINAL DRIFT — SO BOTH EXISTING EVICTION ROWS WOULD EVICT ~0 BYTES.** `task_board` = 3.13MB of 3.73MB (84%); `review[]` 1.19MB/186 rows, `backlog[]` 1.04MB/354. **Terminal-status rows in those lanes: zero** (331 BACKLOG + 23 BLOCKED; 186 REVIEW + 4 BLOCKED; 67 READY + 8 TODO). Mean `review[]` row 6.3KB, top rows 49/41/39/31KB. `TE-T15` and `FIX-BACKLOG-TERMINAL-ROW-DRIFT-EVICT-BLIND` both rest on an assumption the live data contradicts. Minted `FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT` (architect, supervised+plan_only) — `detail_ref` exists for this and is largely unused.
- **The cold-evict fix was already written down 7 days ago and nobody read it.** `signal-dashboard/SKILL.md:83` states the gap verbatim, names the file, names the agent. Its stated trigger has since fired: documented cap 200, live rows **247**, with **226/247 (91.5%)** unevictable. Two corrections folded into the ACs — matching is exact-string (`orch-cold-evict.sh:495`), so uppercase `TRIAGED` needs its own entry (the note only names lowercase); and SKILL.md:91's PRUNE criteria still says READ/RESOLVED/SUPERSEDED and will re-seed the drift if not synced.
- **Kept my own notes short on purpose.** Minting 3 verbose rows into a file whose diagnosis is "rows are too verbose" would have been self-refuting.

### NEXT
- `SYSREMAKE-P2-T6` is dep-free and independent of T1-T5 — designated next pickup, deliberately held out to stay inside WIP≤2.
- After T1/T2 close: stamp `DONE_VERIFIED` by hand at each hop, or T3/T4/T5/T7 re-starve. Not a workaround — the documented P0 remedy is `FIX-DONELANE-...`.
- Once the cold-evict fix lands, run it **dry-run first**: ~226 rows move in one pass.

### Carry-over
- Standing rule from 15:13Z (held, applied again): after every `orch-apply.sh`, re-read the specific row/field on disk — verified all 3 mints + 2 stamps + 1 signal close before claiming them.
- `review[]`=186 vs `qa[]`=4 — unchanged shape from prior cycles, and it is now also the single largest byte consumer in the hot file.
