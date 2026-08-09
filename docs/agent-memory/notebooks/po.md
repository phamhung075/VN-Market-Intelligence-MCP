# PO — Notebook

## 2026-08-09T02:48Z · The endpoint shipped the disproof in the same payload as the alarm

### What actually happened
- Escalation: system-auditor Tier-2 CRITICAL "23/90 crons stopped firing simultaneously 2026-08-07T08:50:00Z"; ops (`02b456b4d`) concluded HIGH-CONFIDENCE container crash + node-cron cannot replay across restart; asked to fold it onto `FIX-MONTHLYSIGNALQUALITYAUDITJOB-MISSED-JULY-RECOVER-GUARD` as corroborating evidence.
- **Refused the fold. Refused the crash row.** Minted `FIX-CRON-STATUS-LAYERA-SCHEDULE-BLIND-FALSE-CRITICAL` (P2, `apps/mcp-server/`, dev-mcp-server); repriced the monthly row P3→P2 on a *separately* verified 2nd consecutive miss. `orch-apply.sh` conservation 756→757, both rows re-read on disk.
- Journal: `docs/agent-memory/decisions/triage-20260809T0248Z-po.md`.

### Decisions worth keeping
- **★ THE ALARM AND ITS REFUTATION WERE ADJACENT KEYS IN ONE JSON OBJECT.** `/api/cron-status` emits `expected_last_fire` *and* `status` per row. Nobody subtracted them. I did, for all 24 non-healthy rows: **15 fired within 0–2s of their own expected fire and were still labelled MISSED/STALE.** `classifyCronLiveness(nowMs, lastFireMs, cadenceMs, thresholdMultiplier)` — read the signature: the expected-fire value it computes is never passed in. A `*/10 2-8 * * 1-5` job has `cadenceMs`=10min and a real Fri→Mon gap of 65h, so it is **guaranteed** to alarm every weekend. Before believing a detector, check whether it consumes the field that would exonerate the target.
- **★ OPS'S OWN NOTEBOOK CONTAINED THE CONTRADICTION, TWO LINES APART.** It states "next scheduled fires would have been 09:00+ UTC … so wouldn't fire anyway" and "weekday-only jobs correctly did NOT fire on Sat/Sun" — then concludes HIGH CONFIDENCE crash from the same paragraph. `marketEarningYield` fired **09:30:01** and `eveningSummary` **15:30:01** on 08-07, hours after the alleged 08:50 death; `docker inspect` → `RestartCount=0`, `FinishedAt=0001-01-01`, `StartedAt` = ops's *own* rebuild. A confidence label is not evidence.
- **★ THE TRUE MECHANISM WAS TRUE AND IRRELEVANT — I ALMOST SHIPPED A FIX FOR IT ANYWAY.** node-cron@3.0.3 `src/scheduler.js` really does re-seed `lastExecution` in `start()`, so `recoverMissedExecutions` never survives a restart. Verifying that felt like confirming the escalation. It confirmed nothing: **no restart occurred.** Wrote it onto the monthly row instead as a *no-op warning* — its shipped `recommended_action` (flip the flag) is now provably insufficient; the real actuator is `shouldRunCatchup()` in `startupHelpers.ts`, generalised day→month.
- **★ FIVE DISTINCT FALSE-POSITIVE CLASSES, NOT ONE BUG.** Age-ladder blindness (15); UTC-computed expected-fire ignoring `options.timezone`, exactly −7h (3); cron-parser POSIX dom/dow **OR** vs node-cron `TimeMatcher` **AND** (`brokerSanctionsSweep`); Layer-A enumerating `CRONS` config keys instead of the registered table, so `taAlertScan`/`bbAlertScan` read dead-since-April while their merged successor `alertScanParallelJob` (`schedulerJobTable.ts:447`) isn't listed at all; env-gated-off `ragFtsRebuildCron` reported STALE rather than DISARMED. Each needs its own AC — I wrote 6.
- **★ ONE REAL GAP WAS BURIED IN 23 FAKE ONES.** `monthlySignalQualityAudit` has now missed **2026-07-01 AND 2026-08-01** (`last_fire` 2026-06-01, δ −61d). Repriced on *recurrence*, not on the escalation's blast-radius argument. Its June-backfill escape hatch expired 08-01 — flagged, since the row still assumes it. Same shape as `feedback_composite_score_masks_dead_detector_pruned_table`.
- **Near-miss verdict: no urgent watch.** `eveningSummary`/`ohlcvDailyAggregator`/`ohlcvSanityCheck` fired within 1s of expected (15:30:01/15:03:00/15:05:00). "35h of 36h" is the same broken ladder. They self-clear Monday.

### NEXT
- dev-mcp-server takes `FIX-CRON-STATUS-LAYERA-SCHEDULE-BLIND-FALSE-CRITICAL`. AC-5 is the cheap gate: replay the 02:45Z snapshot — exactly one row (`monthlySignalQualityAudit`) may remain non-ON_TIME.
- Do **not** patch auditor A-29 to compensate; it cites `.status`/`.reason` verbatim and is correct to. Fix the endpoint.
- Monday 08-10 check is now optional confirmation, not a diagnostic step.

### Carry-over
- **★ WHEN TWO AGENTS AGREE ON A ROOT CAUSE, CHECK WHETHER THE SECOND ONE RE-DERIVED IT OR INHERITED IT.** Ops inherited the auditor's "stopped firing" premise and only searched for *what killed it* — never whether it died. Same class as `feedback_premise_date_error_survives_agent_chain`.
- Standing (held): re-read each row/field on disk after `orch-apply.sh` before claiming; assert the AC-3 SHA is the one I just created, never a peer's sweeping commit.
- Notebook section-prepend + prune, never full-overwrite (`feedback_qa_notebook_fulloverwrite_drops_concurrent_peer_entries_20260806`).

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
