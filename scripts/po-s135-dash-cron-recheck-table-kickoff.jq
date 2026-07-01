# po-s135-dash-cron-recheck-table-kickoff.jq
# Single-pass DUAL-mutation self-initiated SPRINT KICKOFF (idempotent):
#   M1: append sprint_goal.entries[] with the DASH-CRON-RECHECK-TABLE vision
#       (id-guarded — skip if sprint_id already present).
#   M2: MINT the BA-spec cascade-kickoff task BA-DASH-CRON-RECHECK-TABLE -> task_board.ready[]
#       (next_agent=ba, zone=multi, type=SPRINT-M) — id-guarded across ALL board lanes.
# Head DELIBERATELY UNTOUCHED (router continues from the PO RETURN NEXT, not .head).
# Reusable pattern = po-s134 (user asked to surface a capability on the dashboard ->
#   route the whole family via ONE BA spec cascade-kickoff to ready[]; PO does NOT spawn).
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s135-dash-cron-recheck-table-kickoff.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# (orch-apply does Zod + dup-key + CAS + atomic rename; PUSH HELD — fleet-push timer pushes.)

# ---- guards: is this kickoff already applied? ----
( [ .sprint_goal.entries[]?.sprint_id ] | index("DASH-CRON-RECHECK-TABLE") != null ) as $sprint_exists
| (
    [ .task_board | to_entries[] | .value[]?
      | if type=="object" then .id else . end ]
    | index("BA-DASH-CRON-RECHECK-TABLE") != null
  ) as $ba_exists

# ---- M1: sprint_goal entry ----
| ( if $sprint_exists then .
    else .sprint_goal.entries += [{
      "sprint_id": "DASH-CRON-RECHECK-TABLE",
      "status": "active",
      "priority": "high",
      "created_by": "po",
      "user_prioritized": true,
      "origin": "USER feature request 2026-07-01 (verbatim): on /dashboard/orchestration (Remix :3001) add a CRON TABLE the user can use to RECHECK every scheduled cron and see, per cron, whether it actually RAN vs the expected fire time (expected schedule -> last actual fire -> status: ran on-time / late / missed / stale / never-fired).",
      "vision": "Add a Cron Recheck Table to /dashboard/orchestration so the user can, at a glance, RECHECK every scheduled cron and see per-cron: expected schedule -> last actual fire -> expected next fire -> an HONEST liveness status (ON_TIME / LATE / MISSED / STALE / NEVER_FIRED). The table MUST be truthful about the TWO cron layers and never mis-flag a session-scoped CLI cron as a failure.",
      "two_layer_honesty": "Layer A = node-cron INSIDE mcp-server (server-hosted, always-on while container up) — these ARE trackable via cron_job_runs and classify ON_TIME/LATE/MISSED/STALE/NEVER_FIRED. Layer B = CLI CronCreate crons (.claude/commands/crons/*.md + cron-detect-loop/cron-cowork-team skills) — SESSION-SCOPED: they fire ONLY while a live CLI session hosts them and evaporate on session exit (memory: project_cowork_guaranteed_slot_needs_live_cli_session, feedback_no_remote_trigger_all_local). A Layer-B cron with no recent fire MUST render layer=cli-session + a NON-RED status (SESSION_SCOPED) with a reason — NEVER MISSED/failed.",
      "scope_in": "MULTI-zone (architect SPLITs; pm decomposes). (1) dev-mcp-server: a NEW cron-fire-status compute path + a READ-ONLY GET /api/cron-status REST handler mirroring interface/mcp/routes/orchestrationHandler.ts (register in server.ts). For EVERY Layer-A cron in the live CRONS map (apps/mcp-server/src/scheduler/cronConfig.ts — SSOT; read the map, NEVER hardcode the list/count): parse the cron expr (node-cron dep already present) to derive expected_last_fire + expected_next_fire; read actual last_fire + last_status from cron_job_runs via cronJobRunStore using the MAX(started_at)-per-job pattern (double-log immune — same oracle schedulerWatchdogJob uses); classify status via cadence x threshold PARITY with schedulerWatchdogJob WATCHDOG_MANIFEST (generalize the 16-job manifest to ALL Layer-A crons — do NOT diverge the threshold). Reuse get_cron_health's last_run/last_status where already computed; the new endpoint EXTENDS it with expected-vs-actual, it does not duplicate run-store queries. (2) dev-mcp-server: surface Layer-B CLI crons HONESTLY — read them from their SSOT (.claude/commands/crons/*.md + system-map.json + the cron-detect-loop / cron-cowork-team skills), label layer=cli-session, status=SESSION_SCOPED (never MISSED). (3) dev-frontend: api.cron-status.tsx proxy resource route (mirror api.orchestration.tsx) + a Cron Recheck Table on dashboard.orchestration.tsx. Columns (plain-Vietnamese user copy where appropriate): Ten cron / Layer / Lich du kien (human-readable from expr) / Lan chay gan nhat / Du kien lan toi / Trang thai (colored badge). A RECHECK button re-fetches/revalidates the loader live. Per-table freshness badge 'Cap nhat luc' per the shipped freshness-transparency pattern (SSOT frontend-data-coverage-map.json — never baked/client-now time). (4) qa gate.",
      "scope_out": "NO new always-on cron/alerting (schedulerWatchdog already alerts — this is a READ-ONLY dashboard VIEW). NO auto-restart / auto-heal of crons from the UI (recheck is read-only). NOT changing any cron schedule or the CRONS map. NOT building a Layer-B run-tracking persistence store (session-scoped crons have no DB run rows BY DESIGN; surfacing them = label + last-known from skills SSOT, not new telemetry infra — deeper Layer-B telemetry is a follow-up). NOT reconciling/fixing individual broken crons (those are the existing FIX-CRON-* board tasks) — this sprint SURFACES status, it does not repair jobs.",
      "success_metric": "RAW-demonstrable: (a) GET /api/cron-status returns 200 with one row per Layer-A cron DERIVED from the live CRONS map (row count == map size, NOT a hardcoded number), each row carrying {name, layer:server, cron_expr, human_schedule, expected_last_fire, expected_next_fire, last_fire, last_status, status in {ON_TIME,LATE,MISSED,STALE,NEVER_FIRED}}. (b) A cron with a fresh cron_job_runs success row within its cadence classifies ON_TIME; a job whose MAX(started_at) exceeds cadence x threshold classifies MISSED/STALE, PARITY-tested against schedulerWatchdogJob's verdict for the same job (no divergence). (c) Layer-B CLI crons render layer=cli-session + a NON-RED SESSION_SCOPED status — a CLI cron with no recent fire is NOT shown MISSED/failed. (d) /dashboard/orchestration renders the table without error; RECHECK re-fetches live; 'Cap nhat luc' badge shows the REAL fetch time; a never-fired cron shows 'Chua tung chay' not a fabricated timestamp. (e) NO regression to the existing orchestration task-board view or /api/orchestration.",
      "reuse_mandate": "Anti-rebuild: CRONS map = SSOT for Layer-A exprs (read, never hardcode); cronJobRunStore MAX(started_at) = last-fire (double-log immune); schedulerWatchdogJob WATCHDOG_MANIFEST cadence/threshold = classification parity source (generalize, do NOT diverge); get_cron_health = existing last_run/last_status (extend, do NOT duplicate); orchestrationHandler.ts + api.orchestration.tsx = the exact REST+proxy pattern to mirror.",
      "standing_acs": "Carries the standing gates: freshness 'Cap nhat luc' (SSOT frontend-data-coverage-map.json, never client-now); no-fake-data (honest-NULL: never-fired -> 'Chua tung chay', no fabricated timestamp); plain-Vietnamese user-facing copy (feedback_language_boundary — English for work artifacts); all-info source/detail affordance where a status needs explanation (why MISSED / why SESSION_SCOPED).",
      "created_at": $now
    }]
  end )

# ---- M2: BA cascade-kickoff task -> ready[] ----
| ( if $ba_exists then .
    else .task_board.ready += [{
      "id": "BA-DASH-CRON-RECHECK-TABLE",
      "title": "Requirement spec + AC list for DASH-CRON-RECHECK-TABLE: /dashboard/orchestration Cron Recheck Table (expected schedule -> last actual fire -> status; two-layer honest)",
      "owner": "ba",
      "next_agent": "ba",
      "status": "READY",
      "zone": "multi",
      "type": "SPRINT-M",
      "priority": "high",
      "user_prioritized": true,
      "sprint": "DASH-CRON-RECHECK-TABLE",
      "depends": [],
      "created_at": $now,
      "files": [
        "apps/mcp-server/src/scheduler/cronConfig.ts",
        "apps/mcp-server/src/infrastructure/db/cronJobRunStore.ts",
        "apps/mcp-server/src/scheduler/system/schedulerWatchdogJob.ts",
        "apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts",
        "apps/mcp-server/src/interface/mcp/tools/alerts/cronHealthTools.ts",
        "apps/frontend/app/routes/dashboard.orchestration.tsx",
        "apps/frontend/app/routes/api.orchestration.tsx",
        ".claude/commands/crons/",
        "docs/data/system-map.json"
      ],
      "spec_ref": "sprint_goal.entries[DASH-CRON-RECHECK-TABLE]",
      "generic_mandate": "BA reads the LIVE CRONS map for the Layer-A cron set (never bake the list/count), enumerates the Layer-B CLI crons from .claude/commands/crons/*.md + cron-detect-loop/cron-cowork-team skills, and specs a single READ-ONLY GET /api/cron-status endpoint (dev-mcp-server) + proxy route + table UI (dev-frontend). AC list MUST encode: the 5-state Layer-A status enum {ON_TIME,LATE,MISSED,STALE,NEVER_FIRED} with a cadence x threshold classifier that has PARITY with schedulerWatchdogJob; the Layer-B honesty rule (SESSION_SCOPED, never MISSED); the reuse mandate (CRONS/cronJobRunStore/WATCHDOG_MANIFEST/get_cron_health/orchestrationHandler — extend/mirror, never rebuild); and the standing freshness('Cap nhat luc') / no-fake-data(honest-NULL) / plain-Vietnamese-copy gates.",
      "acceptance": "See sprint_goal.entries[DASH-CRON-RECHECK-TABLE].success_metric (a)-(e). BA delivers docs REQ spec + numbered AC list; architect SPLITs the multi-zone task (dev-mcp-server status-compute+REST vs dev-frontend proxy+table); pm decomposes into per-zone dev tasks; qa gates against the RAW success_metric.",
      "note": "USER-PRIORITIZED cascade-kickoff (po-s135). Expected owner pair = dev-mcp-server + dev-frontend. PO does NOT spawn — dev-team cron adopts this ready BA task and spawns ba."
    }]
  end )
