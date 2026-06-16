# Router 2026-06-16 — dev-team tick: FIX-BCTC-SSC-503-RETRY test-persistence round done -> done_verified.
#
# fixer (agent abeee0d3) added 8 _is_transient_error unit tests (commit b238e33b). Router RAW-verified FIRST-HAND
# (not relayed):
#   - b238e33b ancestor of HEAD; scope = vps-scripts/test_discover_bctc_title_classifier.py ONLY;
#     discover-bctc-urls-browser.py UNTOUCHED (tests-only round, production logic unchanged).
#   - Router RAN the harness first-hand: 35/35 pass (27 existing + 8 new). The 8 cases cover both classes:
#     HTTP 503/500 -> transient; HTTP 404/403 -> terminal; URLError ConnReset/TimeoutError/'timed out' -> transient;
#     ValueError (non-HTTP) -> terminal.
#
# FULL VERIFICATION CHAIN (done_verified justified):
#   - Production logic (6da9b030): router RAW first-hand — retry on transient(5xx/conn-reset/timeout), clean-200 &
#     4xx no-retry, retry-exhausted -> None (no fabrication), generic (no per-ticker/exchange), _ssc_make_opener real,
#     py_compile OK.
#   - Code quality (qa a7f50720): G1/G2/G4 PASS via LIVE importlib load of the production module + assertions on the
#     REAL _is_transient_error (not a mock) — this IS live-raw verification of the shipped code.
#   - Tests persisted + green (router first-hand 35/35).
#   This fix is deterministic control-flow (bounded retry classifier) with NO served-data output to plausibility-check;
#   a real-503-retry observation is unforceable (no-fake-data forbids forcing a 503) and is NOT a correctness gate.
#   => done_verified is honest here (cf. FIX-ALERT-FINGERPRINT which WITHHOLDS done_verified because its dedup-under-
#   load is a genuine DATA-OUTPUT gate verifiable only under real load). Optional non-blocking monitor: next real SSC
#   ~12:00Z maintenance-window 503 -> confirm retry-then-success in VPS logs.
#
# HEAD: UNCHANGED — CI-RED lead (FIX-CI-RED-STANDING-1837A-1352A) processing is separate (per-file isolation gate
# running); it remains the active head until that completes.
#
# GUARD: refuse unless SSC uniquely in in_progress[]. CONSERVATION: 6-lane total UNCHANGED (in_progress -1, done +1).
# Usage: jq --arg now "$NOW" -f scripts/router-d92-ssc503retry-done-verified-20260616.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-BCTC-SSC-503-RETRY" as $tid
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done,.task_board.backlog]|map(length)|add) as $before6
| ([.task_board.in_progress[]?|select(.id==$tid)]|length) as $ip
| if $ip != 1 then error("SSC not uniquely in in_progress[] — refuse: " + ($ip|tostring)) else . end
| ([.task_board.in_progress[]?|select(.id==$tid)][0]) as $task
| ($task + {
    status:"done_verified",
    impl_commit:"6da9b030",
    test_commit:"b238e33b",
    done_verified_by:"dev-team (router RAW first-hand: ran vps-scripts test harness 35/35 pass; production discover-bctc-urls-browser.py UNTOUCHED by b238e33b; logic verified on 6da9b030; qa a7f50720 G1/G2/G4 PASS via live importlib load)",
    done_verified_ts:$now,
    optional_monitor:"NON-BLOCKING: next real SSC ~12:00Z maintenance-window 503 -> confirm retry-then-success in VPS logs. NOT a correctness gate (deterministic control-flow, unforceable, no-fake-data)."
  }) as $donep
| .task_board.in_progress = [ .task_board.in_progress[] | select(.id!=$tid) ]
| .task_board.done = ([ $donep ] + .task_board.done)
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done,.task_board.backlog]|map(length)|add) != $before6)
    then error("CONSERVATION FAIL: 6-lane total changed") else . end
