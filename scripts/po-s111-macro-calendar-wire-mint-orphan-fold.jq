# po-s111: two-finding triage (health-recheck 3283 ISSUE-7 macro_calendar + sau orphan)
#
# M1 — MINT FIX-MACRO-CALENDAR-WIRE-STATIC-SOURCE → backlog[] (P2, idempotent by id).
#   Root: MCP get_macro_calendar (carryTools.ts:110) proxies HTTP GET to the Go
#   /macro-calendar (handlers_calendar.go) = FDA-4 honest-EMPTY stub (always events:[]).
#   Meanwhile a COMPLETE static-calendar domain service sits UNWIRED in the SAME
#   mcp-server: apps/mcp-server/src/domain/services/macro/macroCalendar.ts
#   (getMacroCalendar(): ~36 FOMC/GSO-CPI/GDP/PMI/SBV 2026 events + pivot-window
#   detection, pure function, NO external fetch). FDA-4 (DONE 2026-06-05) explicitly
#   DEFERRED this: "return unavailable UNTIL a real source is wired". This is that
#   wiring task — NOT a regression, NOT the macro-fetch/TE/Chromium outage cluster
#   (no upstream fetch involved; the data already exists in-repo).
#
# M2 — FOLD the orphaned signal_outcomes row into the EXISTING
#   FIX-SIGNAL-OUTCOMES-RESOLUTION-STALLED (in-place .folded_scope marker, idempotent).
#   Orphan = signal_outcomes id=66 (signal_id=6218, VCB chain_catalyst) FK-dangling
#   after agent_signals TTL-prune (on_delete=NO ACTION + foreign_keys pragma OFF).
#   1 of 72, isolated, LOW. Same table/corpus/zone/feature as the host task → fold,
#   do NOT mint a standalone P3.

def macro_task:
  {
    "id": "FIX-MACRO-CALENDAR-WIRE-STATIC-SOURCE",
    "type": "FIX",
    "title": "get_macro_calendar serves empty events[] — MCP tool proxies the FDA-4 honest-unavailable Go stub while a complete unwired static-calendar domain service exists in mcp-server",
    "status": "BACKLOG",
    "priority": "P2",
    "urgency": "medium",
    "owner": "dev-mcp-server",
    "route": "dev-mcp-server",
    "zone": "apps/mcp-server/",
    "baseline_pass": false,
    "related_to": "FDA-4",
    "source": "health-recheck 3283 (2026-06-21T14:10Z) ISSUE-7; router RAW-confirmed get_macro_calendar({}) -> {daysRequested:60,events:[],is_estimate:true,source_tier:4,status:unavailable}.",
    "desc": "ROOT CAUSE: MCP tool get_macro_calendar (apps/mcp-server/src/interface/mcp/tools/macro/carryTools.ts:110) does an HTTP GET to the macro-indicators Go /macro-calendar endpoint (apps/macro-indicators/pkg/interface/http/handlers_calendar.go), which is the FDA-4 honest-unavailable STUB — it ALWAYS returns {events:[],status:unavailable,is_estimate:true,source_tier:4} because no live source was ever wired there. This is the by-design honest-degraded state FDA-4 (DONE 2026-06-05) shipped, NOT a regression and NOT a no-fake-data violation. BUT a COMPLETE, usable calendar already exists UNWIRED in the same mcp-server: apps/mcp-server/src/domain/services/macro/macroCalendar.ts exports getMacroCalendar(referenceDate?,days=60) returning ~36 FOMC/GSO-CPI/GSO-GDP/Vietnam-PMI/SBV 2026 events with isPivotWindow + currentMonthIsPivotWindow + nextPivotWindow + pivotWindowWarning (pure function, NO external fetch). FIX (pick the cleaner of): (a) repoint the MCP get_macro_calendar tool at the local getMacroCalendar() domain service (drop the HTTP hop entirely — simplest, the data is local), OR (b) have the Go /macro-calendar handler serve an equivalent static schedule. Either way the served source_tier should reflect 'derived static schedule' (tier 3, as carryTools.ts already documents) NOT tier-4 unavailable. Restores the pivot_window_active signal that digest-predict + alert-commander consume.",
    "verification_gate": "LIVE via gateway call_tool get_macro_calendar({}) returns events.length>0 with the 2026 FOMC/GSO/PMI/SBV schedule, isPivotWindow flags present, status NOT 'unavailable', source_tier=3, AND digest-predict / alert-commander observe a non-null pivot_window signal. QA verifies the raw tool payload, not a badge. days=N param still honored (window filter).",
    "generic_mandate": "Wire a real (static-schedule-acceptable) calendar source so the tool serves events for ANY days window, not a special-case for the current month; keep the honest is_estimate/source_tier labelling truthful to the static-schedule nature.",
    "distinct_from": "NOT FDA-4 (that intentionally made the Go stub honest-empty and DEFERRED wiring). NOT the macro-fetch outage cluster (FIX-MACRO-SNAPSHOT-DELTAS-NULL / F-MACRO-FETCH-DEADLINE / FIX-NEWS-CB-FALSE-CLOSED TE+Chromium) — those are live-upstream-fetch failures; this calendar needs NO upstream fetch, the data is in-repo.",
    "minted_at": $now,
    "minted_by": "po-s111"
  };

# ---- M1: idempotent mint into backlog ----
( [ .task_board | (.backlog,.ready,.in_progress,.review,.done,.done_verified,.qa) | .[]? | objects | .id ]
  | index("FIX-MACRO-CALENDAR-WIRE-STATIC-SOURCE") ) as $macro_present
| if $macro_present == null
  then .task_board.backlog += [macro_task]
  else .
  end

# ---- M2: in-place fold into the existing STALLED task ----
| .task_board.backlog |= map(
    if .id == "FIX-SIGNAL-OUTCOMES-RESOLUTION-STALLED"
       and (.folded_scope_orphan_fk | not)
    then . + {
      "folded_scope_orphan_fk": {
        "folded_at": $now,
        "folded_by": "po-s111",
        "source_signal": "sau-20260621T112600-sig-orphan",
        "finding": "signal_outcomes id=66 (signal_id=6218, VCB chain_catalyst, created 2026-06-15 16:26) is FK-dangling: parent agent_signals row 6218 TTL-pruned. 1 orphan of 72 rows, isolated, LOW, not service-impacting.",
        "root_cause": "FK signal_outcomes.signal_id -> agent_signals defined on_delete=NO ACTION AND SQLite PRAGMA foreign_keys is OFF, so agent_signals TTL-prune leaves signal_outcomes children dangling.",
        "added_scope": "While repairing signal_outcomes lifecycle on the named-vol DB: (1) clean the 1 existing orphan (id=66); (2) DURABLE fix so future agent_signals TTL-prune does not strand outcome children — either coordinate prune to also delete/resolve outcome children, or add ON DELETE CASCADE + enable foreign_keys pragma, or have the resolution job treat parent-missing as a terminal resolution. Generic: no orphaned signal_outcomes children after any agent_signals prune.",
        "rationale": "Same signal_outcomes table / 72-row corpus / apps/mcp-server zone / outcome-feedback-loop feature as this task; standalone P3 for 1 row = churn. Fold."
      }
    }
    else . end
  )

# ---- metadata ----
| ._updated_at = $now
| ._updated_by = "po-s111"
