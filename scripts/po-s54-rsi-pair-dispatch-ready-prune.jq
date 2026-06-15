# po-s54-rsi-pair-dispatch-ready-prune.jq
# dev-team tick triage (2026-06-15T06:30Z). Single atomic pass over orch-state .task_board:
#  1. PRUNE 6 stale entries out of ready[] that already carry a terminal status but were
#     never moved out of ready[] (false "ready[8]" triage signal). Each is MOVED to its
#     status-correct array (done_verified[] or done[]), never dropped — preserve history.
#  2. DISPATCH the RSI-integrity pair: move ready -> in_progress with dispatch stamps.
#  3. Refresh dispositions on the 2 held in_progress tasks + the 4-day-stale PARKED review.
# Usage: jq --arg now "$NOW" -f scripts/po-s54-rsi-pair-dispatch-ready-prune.jq orch-state.json
# Atomic temp -> [ -s ] -> jq empty -> rename; commit orch-state by EXPLICIT PATH only.

# ids that are stale in ready[] with a done_verified status
([ "F-MACRO-FETCH-DEADLINE", "F-BOP-ENCODING", "CI-RED-d20468c0-FIX",
   "F-BOP-QUERY-RECON", "FIX-CHEF-INTRADAY-MARKER-CADENCE" ]) as $dv_stale
# id that is stale in ready[] with a plain done status
| ([ "FIX-NSO-TRADE-SHEET" ]) as $done_stale
# the pair to dispatch this tick
| ([ "FIX-TA-GOSVC-NA-DESPITE-DEPTH", "FIX-CHEF-FABRICATED-TA-NUMBERS" ]) as $dispatch

# capture the entries we are relocating BEFORE we filter ready[]
| (.task_board.ready // []) as $ready
| ([ $ready[] | select(.id as $i | $dv_stale | index($i)) ]) as $moved_dv
| ([ $ready[] | select(.id as $i | $done_stale | index($i)) ]) as $moved_done
| ([ $ready[]
     | select(.id as $i | $dispatch | index($i))
     | .status = "IN_PROGRESS"
     | .lane = "in_progress"
     | .dispatched_at = $now
     | .dispatch_tick = "2026-06-15T06:30Z"
     | .claimed_by = .owner
     | .po_dispatch_note = "Dispatched this tick as the RSI-integrity pair (cowork-flagged, user live-flagged single-digit RSI bug). Distinct zones (apps/technical-analysis vs docs/agents/unified-agent) — no collision; neither touches the held apps/mcp-server lane. recon_first honored. FIX-TA-GOSVC supplies the real RSI source as FIX-CHEF-FABRICATED lands the anti-fabrication rule."
   ]) as $dispatched

| .task_board.ready = [ $ready[]
    | select(.id as $i
        | ($dv_stale + $done_stale + $dispatch | index($i)) | not) ]

# relocate stale terminal entries to their correct arrays (de-dup guard: skip if id already there)
| .task_board.done_verified = ((.task_board.done_verified // [])
    | reduce $moved_dv[] as $m (.;
        if ([ .[]? | .id ] | index($m.id)) then . else . + [$m] end))

| .task_board.done = ((.task_board.done // [])
    | reduce $moved_done[] as $m (.;
        if ([ .[]? | .id ] | index($m.id)) then . else . + [$m] end))

| .task_board.in_progress = ((.task_board.in_progress // [])
    | map(
        if .id == "ARCH-CRON-SCHEDULER-RELIABILITY" then
          .po_gate_day_status = "GATE-DAY-ARRIVED 2026-06-15 (Monday, VN market OPEN — tick at 13:32 ICT). Residual is a QA LIVE OUTCOME-OBSERVE gate (G1 aggregator auto-fire + 16 sectors leave N/A / G2 fundamentals refresh / G3 reputationCompute 08:30 under contention), evidence accrues across TODAY's trading session — NOT a dev dispatch and consumes NO dev WIP lane. IMPL dep (FIX-MCP-CRASH-LOOP-WRITEWAL) is in done[]. KEEP HELD until end-of-market-day QA reads cron_job_runs + pipeline-health raw; on all-PASS -> umbrella done_verified, on any miss the LIVE watchdog (G5) self-heal/alert evidence -> scoped residual FIX."
          | .po_gate_day_checked_at = $now
        elif .id == "BA-VN-MACRO-TOOLING" then
          .po_dispatch_note = "HELD in_progress — mechanism-complete through BA->architect->pm->probe->probe-fold (all router RAW-reverified). next_agent=WAVE-1 dev fan-out (6 zero-dep: PROBE-fold-consumed contracts + Zone D vpsFetch + Zone C VMT-6). DEFERRED this tick: the cowork-flagged RSI-integrity pair is the higher-priority user-live-flagged bug and takes the dispatch focus; WAVE-1 stays queued (touches apps/mcp-server Zone B/C — same lane currently load-bearing for ARCH-CRON gate). Dispatch WAVE-1 next tick once the RSI pair clears. NO dev WIP consumed while held."
          | .po_held_checked_at = $now
        else . end)
    | reduce $dispatched[] as $d (.;
        if ([ .[]? | .id ] | index($d.id)) then . else . + [$d] end))

| .task_board.review = ((.task_board.review // [])
    | map(
        if .id == "ARCH-SHIP-WAVE-REAUDIT" then
          .park_reason = "KEEP PARKED (design COMPLETE + valid, brief docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md 16.6KB on disk). NOT closeable: accept->pm-decomposition mints zone:multi subtasks spanning apps/mcp-server + apps/frontend (NFR-C-4/5/7). The apps/mcp-server lane is load-bearing — held by ARCH-CRON-SCHEDULER-RELIABILITY (Monday market-day gate) AND queued for BA-VN-MACRO-TOOLING WAVE-1 (Zone B/C mcp-server). UNPARK CONDITION: dispatch decomposition only once BOTH (a) ARCH-CRON umbrella closes to done_verified after today's market-day gate AND (b) BA-MACRO WAVE-1 mcp-server tasks land — then apps/mcp-server is free for the NFR-C endpoint+page fixes. Until then parking is the correct serialization, not neglect."
          | .po_reparked_at = $now
        else . end))

| .task_board._updated_at = $now
| .task_board._updated_by = "po"
