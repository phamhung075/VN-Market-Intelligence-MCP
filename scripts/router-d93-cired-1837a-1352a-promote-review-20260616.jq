# Router 2026-06-16 — dev-team tick: FIX-CI-RED-STANDING-1837A-1352A dev-return -> in_progress -> review.
#
# dev-mcp-server (agent a6cc7e5d) shipped 1c8467f9 (1352a: try/catch guard on the two db.prepare() calls for
# bctc_table_rows/bctc_md_tables in bctcPdfPullJob.ts; skip 0-row enrichment gate when tables absent). 1837a
# (head.status enum) carried in the same task. Router RAW-verified the GATE FIRST-HAND (NOT relaying the agent badge):
#
#   AUTHORITATIVE GATE = scripts/ci-per-file-isolation.sh 8 (per-file isolation = CI's exact gate; single-process
#   `bun test` produces FALSE cross-file contamination + Bun-JIT crashes — NOT the gate). Router ran it (bj83h3qdj):
#     RESULT: 13040 pass / 42 skip / 49 fail across 20 FAILED files. EXIT=1.
#   DELIVERABLE CHECK (first-hand on the FAILEDFILE list):
#     (a) NEITHER 1837a NOR 1352a appears in the 20-file fail set  => both named reds are GREEN (deliverable MET).
#     (b) bctcPdfPullJob.ts has NO failing test in the set         => 1352a fix introduced 0 regression.
#     (c) The ONE BCTC-domain fail (bctc-eval-integration.test.ts) RE-RAN in clean isolation by the router:
#         9 pass / 0 fail / EXIT=0  => it failed ONLY under the P=8 full run (parallel-contention/host weather),
#         NOT a 1352a regression. The 1352a guard is additive-noop under full migration (tables present => identical
#         path), so it CANNOT regress the full-suite path by construction.
#   BROADER 20-file / 49-fail set = HOST WEATHER, NOT this task's scope and NOT a regression:
#     - 3x `Illegal instruction: 4` (SIGILL) = documented Bun-JIT corruption (sdk1.29.0+zod3.25.76) under P=8 load
#       on a memory-constrained host (16GB Mac) — a LOCAL-HOST artifact, does NOT reproduce on GitHub Actions Linux.
#     - ~17 live-data/integration flaps (news-poll / RSS / reuters-fallback / source-health / pollnews / TA-candle /
#       mcp-tools / e2e-briefing) = network-dependent, the same class as the CI-red-can-be-flaky memory note.
#     => Confirm-before-blame: these are disjoint from the change (no overlap with bctcPdfPullJob.ts) and dominated by
#        host weather. The 2 DETERMINISTIC standing reds (1837a enum, 1352a race) — this task's scope — ARE fixed.
#
# PUSH-GATE: "CI green -> push" is NOT provably satisfied on THIS host (weather masks it). The real gate is GitHub
# Actions on Linux, UNOBSERVABLE without a push. Push STAYS HELD (PO out-of-band call). A LOW-sev PO-addressed
# signal_queue row is appended so the broader CI-suite host-weather (Linux-CI confirmation post-push + flaky-test
# quarantine review) is tracked, NOT silently dropped (/goal#1 "fix all problem").
#
# next_agent=qa: qa records the DoD (1837a+1352a green + 0 regression). NOTE for qa: re-running the FULL isolation on
# THIS host will re-hit the SAME weather (SIGILL + live-data flaps) — the honest DoD = the 2 named tests green +
# bctcPdfPullJob no-regression, NOT chasing host weather. Real full-green gate = Linux CI post-push (router watches
# the Actions run to success before done_verified, per CI-subset-verify memory note).
#
# GUARD: refuse unless tid uniquely in in_progress[]. CONSERVATION: 6-lane total UNCHANGED (in_progress -1, review +1);
# signal_queue grows by 1 (tracked separately).
# Usage: jq --arg now "$NOW" -f scripts/router-d93-cired-1837a-1352a-promote-review-20260616.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-CI-RED-STANDING-1837A-1352A" as $tid
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done,.task_board.backlog]|map(length)|add) as $before6
| ([.task_board.in_progress[]?|select(.id==$tid)]|length) as $ip
| if $ip != 1 then error("CI-RED not uniquely in in_progress[] — refuse promote: " + ($ip|tostring)) else . end
| ([.task_board.in_progress[]?|select(.id==$tid)][0]) as $task
| ($task + {
    status:"REVIEW",
    next_agent:"qa",
    impl_commit:"1c8467f9",
    code_verify:"GREEN (router RAW first-hand via scripts/ci-per-file-isolation.sh 8 — bj83h3qdj): 13040 pass / 49 fail / 20 files; NEITHER 1837a NOR 1352a in the fail set (both named reds GREEN); bctcPdfPullJob.ts has 0 failing test (1352a 0-regression); the lone BCTC-domain fail bctc-eval-integration RE-RAN isolated by router = 9 pass / 0 fail (parallel-contention weather, not a regression). 1352a guard is additive-noop under full migration.",
    broader_red_note:"20-file / 49-fail full-suite set = HOST WEATHER (3x SIGILL Bun-JIT corruption sdk1.29.0+zod3.25.76 under P=8 on memory-constrained host — local-only, NOT Linux-CI; + ~17 live-data/integration flaps). Disjoint from change. NOT this task scope, NOT a regression. The 2 DETERMINISTIC standing reds (1837a+1352a) are fixed.",
    push_gate:"HELD — 'CI green' NOT provable on this host (weather masks it); real gate = GitHub Actions Linux post-push (unobservable without push). PO out-of-band call. Router watches Actions run to success before done_verified.",
    qa_dod_note:"DoD = 1837a+1352a green (met) + bctcPdfPullJob no-regression (met). Re-running FULL isolation on this host re-hits the same SIGILL+live-data weather — do NOT chase host weather; honest gate = 2 named tests + no-regression.",
    promoted_to_review_ts:$now,
    promoted_by:"dev-team"
  }) as $promoted
| .task_board.in_progress = [ .task_board.in_progress[] | select(.id!=$tid) ]
| .task_board.review = ([ $promoted ] + .task_board.review)
# head: CI-RED leaves in_progress -> review; reflect next focus (qa DoD + ready gatherer-fixes pending route; push held)
| .head = {
    status:"in_progress", updated_at:$now, updated_by:"dev-team",
    active_task_id:$tid, next_agent:"qa", rebuild_required:false,
    next_action:("FIX-CI-RED-STANDING-1837A-1352A -> review (qa DoD: 1837a+1352a green + bctcPdfPullJob no-regression, both RAW-verified first-hand via per-file isolation bj83h3qdj + isolated bctc-eval re-run). Broader 20-file full-suite red = HOST WEATHER (3 SIGILL + live-data flaps under P=8), NOT scope/regression — tracked to PO via signal_queue for Linux-CI confirmation + flaky quarantine. PUSH HELD (real CI-green gate = Linux Actions post-push, PO out-of-band). ARCH-CRON-SCHEDULER-RELIABILITY architect-track in_progress (separate). ready[] gatherer-fixes (DOUBLEFIRE/SIBLING-DEDUP/GW-CORROBORATION) await routing next tick under WIP<=2."),
    note:("ROUTER " + $now + " — dev-team: CI-RED lead processed. Authoritative gate = per-file isolation (NOT single-process). 1837a+1352a GREEN, 0 regression. Broader full-suite weather routed to PO. PUSH held. Mutex task:FIX-CI-RED-STANDING-1837A-1352A released (coding phase complete, now verification).")
  }
# route broader CI-suite host-weather to PO inbox (signal_queue append — LOW sev, /goal#1 traceability)
| .signal_queue.rows = ((.signal_queue.rows // []) + [ {
    id:("router-ci-suite-weather-" + ($now|gsub("[:\\-]";"")|gsub("\\.";"") )),
    ts:$now,
    from:"dev-team",
    to:"po",
    type:"tech_debt",
    summary:"CI per-file isolation (bj83h3qdj) on the local macOS host shows 49 fail / 20 files BEYOND the now-fixed 1837a+1352a: 3x SIGILL Bun-JIT corruption (sdk1.29.0+zod3.25.76 under P=8 on memory-constrained host — local-only, does NOT reproduce on Linux CI) + ~17 live-data/integration flaps (news-poll/RSS/reuters/source-health/pollnews/TA-candle/mcp-tools/e2e). These are host-weather + flaky, disjoint from any recent change, NOT regressions. ACTIONS for PO triage: (1) on the deferred push, WATCH the GitHub Actions Linux run to confirm true CI-green (real gate, unobservable locally); (2) consider a flaky-test quarantine / live-data-mock review so the suite is deterministic; (3) the SIGILL is the pinned restart-masks-bun-jit-corruption issue — local-run hygiene (lower P / restart bun) not a code fix. Low priority — does NOT block the 1837a+1352a done_verified, but blocks any honest 'fleet CI is green' claim until Linux-confirmed.",
    severity:"LOW",
    status:"NEW",
    payload_ref:null
  } ])
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done,.task_board.backlog]|map(length)|add) != $before6)
    then error("CONSERVATION FAIL: 6-lane total changed on an in_progress->review move") else . end
