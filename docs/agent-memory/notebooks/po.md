# PO — Notebook

## 2026-08-09T01:35Z · The verification command was a usage error, so every fire looked benign

### What actually happened
- dev-team Step-1 triage, 106 inbox envelopes + 1 telegram report. **4 mints, 1 manual-dispatch fold, ~95 folds.** `orch-apply.sh`: backlog 360→364, task_total 752→756, conservation OK. Report 4560 resolved `duplicate`.
- Journal: `docs/agent-memory/decisions/triage-20260809T0135Z-po.md`.

### Decisions worth keeping
- **★ THE §2.7 VERIFY COMMAND CANNOT RETURN EVIDENCE — AND FAILS IN THE BENIGN DIRECTION.** 4 `SAME-FILE DIVERGENCE` fires; my own flow says verify with `git diff <staged-blob> <landing-blob> -- <path>`. All 4 → **0 lines**. Before writing "false positive" I asked whether the command *could* print anything: `git diff <blob> <blob>` takes **no pathspec**, so `-- <path>` is a hard usage error. Same pairs without it → **93 lines**. The prior row's "10/10 confirmed FP" verdict came through this command — **unsupported, not disproven**. When a check always says PASS, test that it can say FAIL.
- **★ I ALMOST OVER-CLAIMED THE FINDING, AND CHECKED.** The `qa.md` pair showed a whole `cycle-591` QA record present in the index and gone from the commit — textbook peer data loss. `git log -S` found it landed at `c59a741e2`, pruned at `914e813c4`: retention working, **nothing lost**. Wrote that into the row. A real mechanism defect does not need an inflated instance.
- **★ ONE PATH SEGMENT DECIDED A MINT.** `coordinationTools.ts` (457L) vs the DONE_VERIFIED `coordinationStore.ts` — title-substring dedup swallows it, file-scoped `dedup_key` does not. CI independently confirmed the Store fix (gone from the offender list) while the Tools file was never tracked. 13 `ci_red` → 4 dedup hits, 1 mint.
- **★ THE TOP SWEEP-GUARD OFFENDER IS THE DISPATCHER ITSELF.** `prior_warns` 9→**22** against `threshold=3` in 12h, actor `165f4245…` = the live router/dev-team session; every BARE commit still proceeded. Folded (occ 8→25), raised **high→P0**. A guard whose worst offender is the fleet's own dispatcher protects nothing.
- **★ AN UNVERIFIABLE AC IS A DEFECT IN THE AC.** SSE reaper soak clock reset a 3rd time; its evidence is the *shared* container's `StartedAt`, which 8+ peers legitimately reset. Row sits in `qa[]` with an **empty `status_note`** after three resets. Minted the AC replacement — refused to waive the soak or just bump priority.
- **★ FOUR CYCLES OF ESCALATION ANSWERED BY ONE `ls`.** bctc-analyst's "signals vanish" is the drain moving them to `processed/`; it has no Bash/Glob grant so it can never see that. AC explicitly **forbids** closing this by granting Bash — the bug is the verify premise.
- **Deferred 2 WARNs (`deep_fetch_stats` 0 rows, `bctc-discover` 101h) with a named re-verify.** Their "already tracked" evidence came from the dedup script `FIX-DEDUPCHECK-MATCHEDTASKID-UNANCHORED-SUBSTRING-MISLABEL` is open against — untrustworthy both ways. At 360 backlog rows, minting on one unreplicated WARN is how a board stops being readable.

### NEXT
- `FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED` now scopes 8 unrouted types + 2 unhandled `bug-escalation` payload tags — **3rd** recurrence of "guard ships, triage table not updated in lockstep". Its new AC (register the tag in the same commit, else fail loud) is the only part that stops recurrence #4.
- Re-verify `deep_fetch_stats` and `bctc-discover` next tick; if either repeats, mint without further deferral.
- 4 CI-red rows now sit in `backlog[]` undispatched. Last tick's lesson stands: when every signal dedups cleanly, the bug is downstream of triage.

### Carry-over
- **★ VERIFY THAT A VERIFIER CAN FAIL.** Empty output from a check is not evidence of absence until you have proven the check can produce output at all.
- Standing rules (held): after every `orch-apply.sh` re-read the row on disk; AC-3 self-verify can false-green off a peer's sweeping commit, so assert the SHA is the one I just created.
- Notebook written section-prepend+prune, never full-overwrite (`feedback_qa_notebook_fulloverwrite_drops_concurrent_peer_entries_20260806`). Pruned the 20:54Z section (in git); its live lessons are carried above.

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
