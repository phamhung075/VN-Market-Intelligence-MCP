# po-s118 — Outage-artifact 7-signal sweep triage (2026-06-26)
# Single atomic pass: ack all 7 NEW signal_queue rows emitted by system-auditor while
# the Claude session's MCP gateway client was disconnected (~22:11Z 06-25 host outage ->
# ~04:2xZ 06-26 /mcp reconnect). 6 resolved/anchored as outage/off-hours/by-design
# false-positives + 1 mint (FALSE-CRITICAL size-cap predicate). RAW-verified, PLAN-ONLY.
# Idempotent: ack guards on status=="NEW"; mint guards on id-not-in-any-lane.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s118-outage-artifact-7signal-triage.jq docs/data/orch/orch-state.json
# Atomic temp -> jq -e validate -> python3 json.load -> array-shape -> mv. Commit orch-state by EXPLICIT PATH.

.signal_queue.rows = ( .signal_queue.rows | map(
  if .status=="NEW" and .id=="sau-2026-06-26T00:10:15Z" then
    . + {status:"RESOLVED", resolved_at:$now, resolved_by:"po-s118",
      resolution:"FALSE NOW — Docker host outage (~22:11Z 06-25) + Claude-session MCP-disconnect transient. Router RAW-verified gateway+api-gateway LIVE 04:27Z post-reconnect: get_market_snapshot VN-Index 1856.14 -0.37%, breadth 76/211/55 written 2026-06-26T04:27:20Z. No task minted."}
  elif .status=="NEW" and .id=="sau-2026-06-26T00:31:41Z-c06" then
    . + {status:"RESOLVED", resolved_at:$now, resolved_by:"po-s118",
      resolution:"off-hours+outage transient — fired 00:31Z (pre-market 07:31 GMT+7) inside the host-outage window; expected 0. RAW-verified pipeline LIVE post-reconnect: snapshot 04:27Z, agent_signals 7593/7594 fresh (exp 05:00Z), cowork-slot chef-intraday:2026-06-26T04:15Z claimed 04:24Z (market-commentary writer running NOW), 06-25 chef-morning/chef-eod/digest-daily publish-locks present. Off-market C-06 false-positive class already tracked: FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE (ready). No new mint."}
  elif .status=="NEW" and .id=="sau-2026-06-26T00:31:41Z-c11" then
    . + {status:"RESOLVED", resolved_at:$now, resolved_by:"po-s118",
      resolution:"bctc off-season idle — no earnings filing window (Q2 lands Jul-Aug) => no PDF processing. Healthy-Idle Gate, expected-benign. C-11 status-predicate bug (queries status='done' which never exists) separately tracked: FIX-AUDITOR-C11-PDFX-STATUS-PREDICATE (backlog). No new mint."}
  elif .status=="NEW" and .id=="sau-d4-202606260300" and (.summary|test("esc-datacov")) then
    . + {status:"RESOLVED", resolved_at:$now, resolved_by:"po-s118",
      resolution:"NOT a blind-run stale lock. RAW task_list_held: esc-datacov:FPT:Q1-2026:ESC-3 is ACTIVE (owner bctc-analyst, claimed 2026-06-24 PRE-outage, expires 2026-07-02, TTL 8d) — an INTENTIONAL ESC-3 data-coverage escalation lock with NO task_board row BY DESIGN (esc-datacov:* is not a task). NOT released (would drop a live ~6-day-remaining escalation). Recurring D4 blind-spot false-positive (prior dismissals po-s103/po-s76/po-s95). Durable fix tracked: FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE + FU-AUDITOR-D4-SIGNAL-ID (backlog)."}
  elif .status=="NEW" and .id=="sau-d4-202606260300" and (.summary|test("bctc-analyst-slot-2")) then
    . + {status:"RESOLVED", resolved_at:$now, resolved_by:"po-s118",
      resolution:"stale lock from blind bctc-analyst run during MCP-disconnect; RAW task_list_held shows it already GC'd/expired (not present). task_release(owner_agent=bctc-analyst) returned ok:false (TTL expired) — LET-EXPIRE per lock-orphaned-by-rebuild lesson. No board row needed."}
  elif .status=="NEW" and .id=="sau-2026-06-26T00:31:41Z-c08" then
    . + {status:"READ", read_at:$now, read_by:"po-s118",
      router_dup_of:"FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID",
      triage_note:"1 orphan = known agent_signals alert_id orphan-FK class (record-and-leave; ~220 historical, ~29/day; tracked sau-20260625T1426). CRITICAL severity overstated for a single orphan. Anchored to FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID (backlog). No new mint."}
  elif .status=="NEW" and .id=="sau-2026-06-26T00:31:41Z" then
    . + {status:"READ", read_at:$now, read_by:"po-s118",
      triage_note:"FALSE-CRITICAL framing. RAW: predicate [.task_board.active_sprints[].tasks[]]|length=248 fired as designed (flow/main.md:399), but 242/248 (~97.6%) carry TERMINAL status (163 DONE, 40 DONE-LIVE-VERIFIED, 14 done, 7 done_verified + closed/cancelled/superseded); active WIP (ready+in_progress+qa+review)=1. The 80-cap counts lifetime-accumulated CLOSED sprint tasks, not active WIP, and emits CRITICAL doc_size_breach when the design action is the routine pm task-archive sub-flow. Minted FIX-AUDITOR-TASKBOARD-OVERFLOW-PREDICATE-WIP-ONLY (P3/LOW, backlog, PLAN-ONLY)."}
  else . end
) )

# MINT (idempotent): FALSE-CRITICAL size-cap predicate fix -> backlog only if absent in any lane
| ( if ( [ .task_board.backlog[], .task_board.ready[], .task_board.in_progress[], .task_board.review[], .task_board.qa[], .task_board.done[], .task_board.done_verified[] ]
        | map(.id) | index("FIX-AUDITOR-TASKBOARD-OVERFLOW-PREDICATE-WIP-ONLY") ) == null
    then .task_board.backlog += [ {
      id:"FIX-AUDITOR-TASKBOARD-OVERFLOW-PREDICATE-WIP-ONLY",
      type:"FIX",
      severity:"LOW",
      priority:"low",
      size:"S",
      status:"BACKLOG",
      title:"system-auditor Size-cap §4 task_board>80 predicate counts lifetime-accumulated CLOSED sprint tasks, not active WIP -> recurring false-CRITICAL doc_size_breach",
      description:"docs/agents/system-auditor/flow/main.md:399 predicate `[.task_board.active_sprints[].tasks[]] | length > 80` fired CRITICAL doc_size_breach at 2026-06-26T00:31:41Z reporting 248 items. RAW status-breakdown of those 248: 242 (~97.6%) carry a TERMINAL status (163 DONE / 40 DONE-LIVE-VERIFIED / 14 done / 7 done_verified + CANCELLED/CLOSED-NO-CHANGE/CLOSED-NOT-REPRO/SUPERSEDED/DEFERRED); only ~6 are non-terminal (2 TODO, 3 BACKLOG, 1 blocked-probe5). Active WIP across ready+in_progress+qa+review = 1. active_sprints[].tasks[] is an append-only accumulation of completed sprint tasks, so this count grows without bound and the >80 gate fires CRITICAL to=po on every scan once enough sprints close. The 80-cap is meant to bound ACTIVE board size, not lifetime sprint history.",
      owner:"system-auditor",
      next_agent:"ba",
      zone:"docs/agents/system-auditor/",
      files:["docs/agents/system-auditor/flow/main.md"],
      fix_spec:"Split the §4 size-cap into two checks. (a) ACTIVE-WIP gate: count [.task_board.ready,.task_board.in_progress,.task_board.qa,.task_board.review]|map(length)|add; alert (non-CRITICAL) only when active WIP exceeds a real WIP cap. (b) ARCHIVE-DEBT trigger: when active_sprints[].tasks[] accumulation (preferably excluding terminal-status tasks) exceeds a bloat threshold, route a routine INFO/LOW signal to pm to run the existing task-archive sub-flow (docs/agents/pm/flow/task-archive.md) — NOT a CRITICAL doc_size_breach. Stop counting DONE/done_verified/CANCELLED/CLOSED/SUPERSEDED tasks toward an active-WIP cap.",
      generic_mandate:"Count active-WIP lanes for WIP caps; exclude terminal-status tasks; route accumulation-bloat to the routine archive trigger at INFO/LOW severity, never CRITICAL. No hardcoded counts (read from orch-state).",
      baseline_pass:true,
      rebuild_required:false,
      depends:[],
      sibling_of:"FIX-AUDITOR-C11-PDFX-STATUS-PREDICATE",
      distinct_from:"FU-AUDITOR-D4-SIGNAL-ID (D4 held-lock-no-row blind-spot) and the C-06/C-11/C-12/B-11 predicate fixes — this is the §4 size-cap WIP-vs-archival miscount only.",
      source:"po triage of sau-2026-06-26T00:31:41Z (CRITICAL task_board overflow 248/cap80) during outage-artifact signal sweep. RAW status-breakdown via jq on orch-state.json. Auditor check-bug, doc/flow-only, no rebuild. PLAN-ONLY, not promoted to ready (WIP=0).",
      created_at:$now,
      created_by:"po-s118"
    } ]
    else . end )

| .signal_queue._updated_at = $now
| .signal_queue._updated_by = "po-s118"
| .task_board._updated_at = $now
| .task_board._updated_by = "po-s118"
