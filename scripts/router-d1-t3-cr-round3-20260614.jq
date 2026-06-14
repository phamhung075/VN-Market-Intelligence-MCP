# Router dev-team dispatcher — T3-ARCH-CRON-WATCHDOG round-2 IMPL -> CHANGES_REQUESTED round 3 (stays in_progress/dev-mcp-server).
# dev-mcp-server (a51f4890) returned commits 9a7e1aef (fix) + 27fcabc4 (notebook). Router RAW-verified INDEPENDENTLY
# (git show, source read, local tsc + bun test):
#   PART (A) — ACCEPTED. The 3 manifest key mismatches are correctly fixed and match the recorded literals:
#     'ohlcv-daily-aggregator' (wrapRun startScheduler.ts:631), 'foreignFlowAlertJob' (recordJobRun foreignFlowAlertJob.ts:314),
#     'ta-ohlcv-backfill' (wrapRun startScheduler.ts:664). The liveManifest selfHealFn wrapRun literals were ALSO corrected to
#     the same kebab names (good — self-heal now writes under the queried name). tsc exit 0, bun watchdog 17/17 (router re-ran).
#   PART (B) — REJECTED (false-GREEN). The WD-10 "manifest-integrity" test is a TAUTOLOGY: it imports
#     CANONICAL_WATCHDOG_JOB_NAMES (a HAND-MAINTAINED literal array) from the SAME module as WATCHDOG_MANIFEST and asserts the
#     two agree with each other (subset + count). It NEVER reads the actual wrapRun/recordJobRun call sites. So the EXACT bug
#     class this task exists to prevent still ships GREEN:
#       rename wrapRun('reputationComputeJob') -> wrapRun('reputation-compute') in startScheduler.ts, forget the watchdog
#       module -> manifest key 'reputationComputeJob' still == canonical 'reputationComputeJob' -> WD-10 PASSES -> live
#       watchdog queries the wrong name -> false "never ran". Identical recurrence, undetected.
#     The CR-round2 spec (B) was explicit: derive the canonical job-name set from REAL registration sites (wrapRun/recordJobRun
#     literals), NOT a hand-copied list. A test comparing two hand-typed lists in one module cannot catch drift introduced at a
#     call site. This fails the standing "fix on same problem on all stock" generic-guard mandate.
# FIX REQUIRED round 3 (keep A as-is; replace the guard in B with a real source-derived one):
#   (B1) Add a test (WD-11, keep WD-10 as a secondary manifest<->canonical consistency check) that DERIVES the set of
#        recorded job_name strings by READING the registration source files at test time and extracting the literal arguments
#        of wrapRun(...) and recordJobRun(...). Source files to scan (from the CANONICAL annotations): startScheduler.ts,
#        src/scheduler/jobs/**/*.ts (foreignFlowAlertJob.ts, insiderCheckJob.ts, calibrationReportJob.ts, vnstockFundamentalsJob.ts,
#        summaryJobs.ts), src/scheduler/startupHelpers.ts. Resolve the 2 KNOWN indirections so they are not missed:
#        (i) vnstockFundamentalsJob.ts uses the JOB_NAME_FUNDAMENTALS const -> read its assigned literal; (ii) summaryJobs.ts
#        uses recordJobRun(db, `summaryJob:${periodType}`) -> the manifest only watches 'summaryJob:daily', so assert that
#        template + the 'daily' period is covered (a literal-only regex will miss it; handle explicitly).
#   (B2) Assert: EVERY WATCHDOG_MANIFEST key is a member of the source-derived recorded-name set. Fail loud with the offending
#        key(s) + the file scanned. This is the guard that actually prevents recurrence: flip any wrapRun/recordJobRun literal
#        in source without updating the manifest -> the derived set changes -> the manifest key is no longer found -> RED.
#   (B3) PROVE fail-loud the right way: the proof must be that editing a CALL-SITE literal (not the watchdog module) turns the
#        test RED. Document that in the commit (e.g. temporarily flip wrapRun('reputationComputeJob') in startScheduler.ts ->
#        WD-11 fails naming reputationComputeJob; restore -> green). The round-2 proof (corrupting a manifest key) only
#        exercised the tautology and is insufficient.
#   Gates unchanged: tsc 0 + bun ARCH-CRON-watchdog.test.ts green (incl new WD-11) before re-hand to ops. Commit by explicit
#   path (apps/mcp-server only). (C) weekday-aware threshold TODO stays deferred to architect — not a blocker.
# This write (ONE atomic temp->rename): T3 stays in in_progress[] (no lane change); status IN_PROGRESS, next_agent dev-mcp-server,
#   review_round 2 -> 3, cr_reason/changes_requested_* refreshed. umbrella stays in_progress; PARKED reaudit untouched.
#   Does NOT capture other agents' dirty files (commit by explicit path).
# GUARD: refuse unless T3 in in_progress[] with status IN_PROGRESS and next_agent=="dev-mcp-server" and review_round>=2.
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — CHANGES_REQUESTED back to zone owner).
# Usage: jq --arg now "$NOW" -f scripts/router-d1-t3-cr-round3-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.in_progress // []) as $ip
| ([$ip[] | select(type=="object" and .id=="T3-ARCH-CRON-WATCHDOG")][0]) as $t3
| if $t3 == null then error("T3 not in in_progress[] — refuse")
  elif ($t3.status != "IN_PROGRESS") then error("T3 status != IN_PROGRESS (\($t3.status)) — refuse")
  elif (($t3.next_agent // null) != "dev-mcp-server") then error("T3 next_agent != dev-mcp-server (\($t3.next_agent)) — refuse")
  elif (($t3.review_round // 1) < 2) then error("T3 review_round < 2 (\($t3.review_round)) — refuse")
  else . end
| .task_board.in_progress = [
    $ip[]
    | if (type=="object" and .id=="T3-ARCH-CRON-WATCHDOG") then
        . + {
          status: "IN_PROGRESS",
          next_agent: "dev-mcp-server",
          changes_requested_at: $now,
          changes_requested_by: "dev-team",
          review_round: 3,
          round2_partial_accept: "PART (A) ACCEPTED at 9a7e1aef: 3 manifest keys corrected (ohlcv-daily-aggregator, foreignFlowAlertJob, ta-ohlcv-backfill) + liveManifest selfHealFn wrapRun literals matched; tsc 0, watchdog 17/17 (router re-ran).",
          cr_reason: "PART (B) REJECTED — false-GREEN. WD-10 is a tautology: imports CANONICAL_WATCHDOG_JOB_NAMES (hand-maintained literal array) from the SAME module as WATCHDOG_MANIFEST and asserts they agree with each other; never reads the wrapRun/recordJobRun call sites. The exact name-drift bug still ships green (rename a wrapRun literal in startScheduler.ts, leave the watchdog module -> manifest key still == canonical entry -> WD-10 passes -> live queries wrong name -> false 'never ran'). FIX round3: (B1) add WD-11 that DERIVES the recorded-name set by READING registration sources at test time (startScheduler.ts, src/scheduler/jobs/**/*.ts, startupHelpers.ts) and extracting wrapRun(...)/recordJobRun(...) literal args; resolve 2 indirections (JOB_NAME_FUNDAMENTALS const value; summaryJob:${periodType} template -> cover 'summaryJob:daily'). (B2) assert every WATCHDOG_MANIFEST key is in that source-derived set, fail-loud with offending key+file. (B3) prove fail-loud by flipping a CALL-SITE literal (not a manifest key) -> WD-11 RED; restore -> green; document in commit. Keep WD-10 as secondary manifest<->canonical check. Gates: tsc 0 + bun watchdog green (incl WD-11). (C) weekday TODO stays deferred to architect, non-blocking."
        }
      else . end
  ]
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "T3-ARCH-CRON-WATCHDOG",
    next_agent: "dev-mcp-server",
    note: "T3-ARCH-CRON-WATCHDOG round-3 CHANGES_REQUESTED -> dev-mcp-server. (A) 3 key fixes ACCEPTED (9a7e1aef). (B) REJECTED: WD-10 manifest-integrity test is a tautology (compares two hand-typed lists in one module; never reads wrapRun/recordJobRun call sites) -> name-drift still ships green. Fix: WD-11 derives recorded-name set from registration SOURCE files + resolves JOB_NAME_FUNDAMENTALS const & summaryJob:daily template; assert every manifest key in derived set; prove fail-loud by flipping a call-site literal. tsc 0 + bun watchdog green before ops. WIP=1 same-zone serialized. ARCH-SHIP-WAVE-REAUDIT PARKED."
  }
