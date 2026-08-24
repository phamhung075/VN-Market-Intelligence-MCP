# scripts/po-mint-20260824T0726Z-stale-head-watchdog.jq
#
# PO mint 2026-08-24T07:26Z, spun out of ruling-20260824T0716Z.
# ID-guarded across ALL lanes -> re-run mints 0.
# Usage: jq -f scripts/po-mint-20260824T0726Z-stale-head-watchdog.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def all_ids:
  [ .task_board | to_entries[] | .value
    | if type == "array" then .[] else empty end
    | (.id // empty),
      ((.tasks // [])[] | (.id // empty)) ];

. as $doc
| ($doc | all_ids) as $ids
| if ($ids | index("FIX-ORCHSTATE-STALE-HEAD-NO-LIVENESS-DETECTOR-HALTS-EVERY-DISPATCH-PICKER"))
  then .
  else
    .task_board.backlog += [{
      id: "FIX-ORCHSTATE-STALE-HEAD-NO-LIVENESS-DETECTOR-HALTS-EVERY-DISPATCH-PICKER",
      type: "FIX",
      status: "BACKLOG",
      priority: "P1",
      size: "S",
      zone: "multi",
      owner: "architect",
      next_agent: "architect",
      depends: [],
      depends_on: [],
      files: [
        "docs/agents/dev-team/flow/main.md",
        "scripts/lib/devteam-eligibility.jq",
        "scripts/audits/devteam-dispatch-gate-satisfiability.sh"
      ],
      created_at: "2026-08-24T07:26:00Z",
      updated_at: "2026-08-24T07:26:00Z",
      created_by: "po/ruling-20260824T0716Z-tier1-respawn-loop-unblock",
      updated_by: "po",
      dedup_key: "orchstate-stale-head-no-liveness-detector",
      title: "A non-idle `.head` whose active_task_id has already lane-moved OUT of in_progress[] (and holds no lock) halts BOUNDED-1, SLS, RLC, DRS, QA-Drain AND Step-1 PO triage simultaneously, and NOTHING detects it. Every one of those six pickers runs only on the Step 0b head-idle fall-through, so a single stale pointer is a total dispatch outage with no alarm, no signal row and no probe. The existing self-heal paths (WF-1 BLOCKED, WF-1b TERMINAL-LANE, resume-attempt-bound) all require dev-team to reach them, which it cannot do while the head is stale in a way none of them match -- WF-1 keys on status==BLOCKED and WF-1b on TERMINAL_SET; a row sitting in qa[] with status=QA matches NEITHER.",
      acceptance: "AC-1 add a head-liveness predicate to scripts/lib/devteam-eligibility.jq: `.head.status != \"idle\"` AND `.head.active_task_id` is NOT resident in `in_progress[]` AND no live lock is held on it => STALE. AC-2 dev-team Step 0b treats STALE exactly like idle -- reset `.head` to the canonical idle shape {status:\"idle\",active_task_id:null,next_agent:null,updated_at,updated_by} in the SAME orch-apply write that falls through, mirroring the existing WF-1 BLOCKED branch (main.md:331). AC-3 the reset MUST NOT lane-move the pointed-at row: unlike WF-1's BLOCKED branch the row is legitimately resident in its new lane (qa[]/review[]/done[]) and its own owner moved it -- reset the pointer only. AC-4 an AGE FLOOR so a live dispatch mid-write is never reaped: require `.head.updated_at` older than a named, overridable constant (suggest 900s, ~2 dev-team ticks at 7,37) -- never reset a head younger than that regardless of predicate. AC-5 emit ONE signal_queue row per distinct stale head (dedup_key includes the stale active_task_id) so the outage is visible in history, not silently healed. AC-6 negative controls in scripts/audits/devteam-dispatch-gate-satisfiability.sh: (i) head non-idle + row IS in in_progress[] => NOT stale; (ii) head non-idle + row lane-moved but updated_at younger than the floor => NOT stale; (iii) head non-idle + row lane-moved + older than floor => stale, resets, emits exactly one signal. AC-7 zone is `multi`: architect splits the scripts/ half (developer) from the docs/agents/ half (agent-father), same precedent as FIX-AUDITOR-TIER1-FOLD-VERDICT-NOT-DURABLE-RESPAWNS-AUDITOR-EVERY-TICK AC-6. AC-8 READ-ONLY on runtime; no docker, no cron changes.",
      evidence: "MEASURED, 2026-08-24. `.head` was written at 04:27:01Z by `dev-team (bounded-1 auto-pickup)` pointing at FIX-OCRGATEWAY-INFLIGHT-BOOKKEEPING-DIVERGES-OS-TRUTH with next_agent=dev-pdf-extractor. That row moved to qa[] at 04:43:36Z (status=QA, next_agent=qa, lock=null) and the head was never advanced. PO found it still frozen at 07:1xZ -- 2h45m during which all six pickers were unreachable. COST, CONCRETE: FIX-AUDITOR-TIER1-FOLD-VERDICT-NOT-DURABLE-RESPAWNS-AUDITOR-EVERY-TICK was minted 04:01:33Z, is DRS-ELIGIBLE (verified against bounded1-supervised-lane-report.sh), and could not be picked for the entire window -- so a P1 fix for a ~48-spawns/day auditor loop sat undispatched because of an unrelated pointer, and the loop kept burning. This is the 4th distinct agent type observed leaving a stale head (pm mid-sprint, architect handoff, qa/ops close-out, now dev-team bounded-1 pickup), which is why the fix belongs in the READER (a liveness predicate every tick evaluates) and not in another per-writer discipline rule.",
      non_goals: "Do NOT fix this by adding a head-write obligation to the bounded-1 pickup path or to any other individual writer -- that approach has been tried per-agent at least four times and the 5th writer will reintroduce it. Do NOT touch `.task_board.head` (the deprecated nested stub) -- its re-inflation is a separate defect owned by FIX-ORCHSTATE-TASKBOARD-HEAD-REINFLATION-GUARD. Do NOT widen this into a general lock/heartbeat reaper. Do NOT make the reset unconditional (no age floor) -- that would race a legitimate in-flight dispatch."
    }]
  end
