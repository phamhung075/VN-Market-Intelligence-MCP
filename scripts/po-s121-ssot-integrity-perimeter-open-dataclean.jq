# po-s121-ssot-integrity-perimeter-open-dataclean.jq
#
# SPRINT KICKOFF + DATA-CLEAN single atomic pass for sprint SSOT-INTEGRITY-PERIMETER.
# Origin: docs/handoffs/orch-state-deep-audit-2026-06-27.{md,json} (8-lens, 60-agent
#   forensic audit; 48 RAW-verified findings; .roadmap.proposed_sprint).
#
# PROBLEM: the 2026-06-27 enum+gate hardening shipped a HALF-BUILT perimeter —
#   scripts/orch-state-validate.sh G-5/G-3/G-4 scan only 3 of 9 status-bearing lanes,
#   so it prints exit-0/"0 offenders" while live violations sit in unscanned lanes.
#
# SEQUENCING (mandate 4a): clean the live data offenders FIRST under commit-mutex so
#   the gate can later flip to hard-fail without stranding the fleet. This pass does
#   ONLY the PO-owned data-clean (ranks 5+6 data portions) + opens the sprint + mints
#   the single architect-brief dispatch. Gate extension / wrapper / dev work is queued
#   on the board for the architect->pm->dev->qa cascade.
#
# WHAT THIS PASS DOES (idempotent):
#   M1 DATA-CLEAN (rank 5 + rank 6-data):
#     1. review/ARCH-SHIP-WAVE-REAUDIT status PARKED -> DEFERRED (keep park_reason)   (C2)
#     2. closed_sprints[].tasks[] status done_verified -> DONE_VERIFIED (HSC-1..7)     (C3)
#     3. .task_board.head re-collapsed to the po-s66 non-routing deprecation stub      (B1,E2)
#     4. drop .task_board.updated_at / .task_board.updated_by (dup-semantic metadata)  (B2)
#   M2 OPEN SPRINT:
#     5. append sprint_goal.entries[] SSOT-INTEGRITY-PERIMETER (status OPEN)
#     6. append task_board.active_sprints[] lean container (goal + waves + ranked_scope)
#   M3 DISPATCH:
#     7. mint ARCH-SSOT-INTEGRITY-PERIMETER -> ready[] (next_agent=architect)
#     8. set canonical top-level .head -> in_progress/architect (dev-team Step-0b resume)
#   M4 metadata bump (_updated_at/_by + _meta).
#
# Idempotent: every append id-guarded; relabels status-guarded; head stub is a set.
#   Re-run mutates 0 (modulo $now stamps).
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s121-ssot-integrity-perimeter-open-dataclean.jq \
#      docs/data/orch/orch-state.json > /tmp/os.json \
#     && [ -s /tmp/os.json ] && jq empty /tmp/os.json \
#     && bash scripts/orch-state-validate.sh /tmp/os.json \
#     && mv /tmp/os.json docs/data/orch/orch-state.json
#   (commit orch-state by EXPLICIT PATH only.)

# --- precompute id-presence across all board lanes (for mint guards) ---
( [ .task_board.ready, .task_board.in_progress, .task_board.review,
    .task_board.backlog, .task_board.done, .task_board.done_verified, .task_board.qa ]
  | add // [] | map(.id // .task_id) ) as $board_ids
| (.sprint_goal.entries | map(.sprint_id)) as $goal_ids
| (.task_board.active_sprints | map(.id // .sprint_id)) as $sprint_ids

# === M1.1 — PARKED -> DEFERRED (keep park_reason) ===
| .task_board.review = ( .task_board.review | map(
    if (.id == "ARCH-SHIP-WAVE-REAUDIT" and .status == "PARKED")
    then .status = "DEFERRED"
       | .park_status_relabel = { from: "PARKED", to: "DEFERRED", by: "po-s121", at: $now,
           note: "enum-clean (C2): PARKED qualifier-as-status -> DEFERRED (deliberate serialization); park_reason retained verbatim as the qualifier prose. UNPARK CONDITION unchanged." }
    else . end ) )

# === M1.2 — closed_sprints done_verified -> DONE_VERIFIED (HSC-1..7) ===
| .task_board.closed_sprints = ( .task_board.closed_sprints | map(
    if (.tasks | type) == "array"
    then .tasks = ( .tasks | map(
        if .status == "done_verified" then .status = "DONE_VERIFIED" else . end ) )
    else . end ) )

# === M1.3 — re-collapse .task_board.head to the po-s66 deprecation stub ===
| .task_board.head = {
    status:             "deprecated",
    canonical_moved_to: ".head",
    deprecated_at:      $now,
    deprecated_by:      "po-s121",
    note: "DEPRECATED non-routing stub. Canonical head SSOT = top-level .head (orch-state-access.md §4). Any script writing routing fields here is a BUG (re-collapsed by po-s121 after po-vn-macro-tooling-sprint-open.jq / po-fda9-groom-ready.jq / dev-team-router re-inflated it — retarget those to .head; SSOT-INTEGRITY-PERIMETER ships the G-7 gate that hard-fails re-inflation)."
  }

# === M1.4 — drop dup-semantic task_board metadata (keep _updated_at/_by) ===
| del(.task_board.updated_at)
| del(.task_board.updated_by)

# === M2.5 — open sprint: sprint_goal.entries[] (id-guarded) ===
| .sprint_goal.entries = ( .sprint_goal.entries +
    ( if ($goal_ids | index("SSOT-INTEGRITY-PERIMETER")) then []
      else [ {
        sprint_id: "SSOT-INTEGRITY-PERIMETER",
        status: "OPEN",
        priority: "high",
        zone: "cross-service",
        created_at: $now,
        created_by: "po",
        vision: "Close the SSOT integrity perimeter so an agent can never be misled about task state and no writer can corrupt the board. Make the HARD gate actually enforce what it claims (all task lanes, duplicate keys, referential integrity, schema keys), clean the live data offenders so it can flip to hard-fail without stranding the fleet, then route every hot-file writer through it. Begin draining the ~150KB of hot-file bloat/lifecycle drift in wave 2.",
        scope_in: "Wave 1 (must-fix): canonical task-lane-list extending G-5/G-3/G-4 to ALL task-bearing lanes incl closed_sprints[].tasks + PARKED regression fixture; G-0 raw-byte duplicate-key reject + G-1 empty-file guard + G-6 tick-skew repair + G-7 schema-key invariant; referential-integrity G-7/8/9 + fix 6 dangling payload_ref; scripts/orch-apply.sh gated wrapper routing EVERY hot-file writer; fix RED 1837a test + sync mcp-server OrchState TS types to live v4. Wave 2 (should-fix): signal_queue lifecycle drain; active-sprint prose->cold 88.6KB migration + stub-on-write; sprint_goal prune-on-close; decision_journal single-ts + _cap + rotation.",
        scope_out: "Defer ranks 11/13/14/15 (mixed-representation closed-sprint migration, legacy hot-key cleanup, status state-machine docs + cold-resolution recipe, signal-row data hygiene).",
        success_metric: "scripts/orch-state-validate.sh hard-fails on PARKED-in-review / lowercase done_verified / duplicate JSON keys / empty file / dangling refs across ALL task lanes (regression fixtures prove it); EVERY hot-file writer routes through scripts/orch-apply.sh; RED 1837a green + mcp-server TS reads live v4. Verified RAW with jq, never a green badge. Ship completion, not a slice.",
        chain: "po (open + data-clean DONE) -> architect (hardening brief) -> pm (decompose Wave-1 zone tasks) -> dev-team/developer (gate+wrapper+TS) -> qa (live RAW verify) -> po (sign-off)",
        data_clean_done: "po-s121 2026-06-27: PARKED->DEFERRED, 7x done_verified->DONE_VERIFIED, task_board.head re-collapsed, dup updated_at/_by dropped — file gate-clean."
      } ] end ) )

# === M2.6 — active_sprints[] lean container (id-guarded; ranked_scope, NOT inline prose) ===
| .task_board.active_sprints = ( .task_board.active_sprints +
    ( if ($sprint_ids | index("SSOT-INTEGRITY-PERIMETER")) then []
      else [ {
        id: "SSOT-INTEGRITY-PERIMETER",
        status: "ACTIVE",
        opened_at: $now,
        opened_by: "po-s121",
        goal: "Close the SSOT integrity perimeter; make the HARD gate enforce all lanes + dup-key + referential integrity; route every writer through one gated wrapper; then drain hot-file bloat.",
        audit_source: "docs/handoffs/orch-state-deep-audit-2026-06-27.{md,json}",
        chain: "po -> architect -> pm -> dev-team/developer -> qa -> po",
        tasks: [],
        ranked_scope: [
          {rank:1, id:"SSOT-W1-LANE-LIST-GATE", wave:1, owner:"architect+developer", effort:"M", dep:"5", title:"ONE canonical task-lane-list; extend G-5/G-3/G-4 to ALL task-bearing lanes incl closed_sprints[].tasks + PARKED-in-review regression fixture"},
          {rank:2, id:"SSOT-W1-ORCH-APPLY-WRAPPER", wave:1, owner:"architect+developer", effort:"L", dep:"1,3,4", title:"scripts/orch-apply.sh gated wrapper — route EVERY hot-file writer (290 po-s*/router-*.jq apply idiom, orch-backlog-stub.sh, dev-team WF-1 head-reset, system-auditor) through orch-state-validate.sh"},
          {rank:3, id:"SSOT-W1-GATE-STRUCTURAL", wave:1, owner:"developer", effort:"M", dep:"", title:"G-0 raw-byte duplicate-key reject + G-1 [-s] empty-file guard + G-6 tick-skew repair (compare .last_tick vs _meta.updated_at) + G-7 schema-key invariant"},
          {rank:4, id:"SSOT-W1-REFERENTIAL-GATES", wave:1, owner:"developer", effort:"M", dep:"", title:"Referential-integrity gates G-7/8/9 (detail_ref/payload_ref/orphan-warn) + rewrite 6 dangling payload_ref docs/signals/->docs/data/db-integrity-history.json"},
          {rank:5, id:"SSOT-W1-DATA-CLEAN", wave:1, owner:"po", effort:"S", dep:"", title:"Relabel live non-enum statuses (PARKED->DEFERRED, 7x done_verified->DONE_VERIFIED)", status:"DONE_VERIFIED", done_by:"po-s121", done_at:$now},
          {rank:6, id:"SSOT-W1-HEAD-METADATA-COLLAPSE", wave:1, owner:"po+developer", effort:"M", dep:"", title:"Re-collapse task_board.head to po-s66 stub + drop dup updated_at/_by (po DONE) + add G-7 schema-key gate (dev) + retarget the 3 regressor scripts", status:"PARTIAL_DONE_DATA", note:"data re-collapse + dedup DONE by po-s121; G-7 gate + script retarget queued for dev"},
          {rank:7, id:"SSOT-W2-SIGNAL-QUEUE-LIFECYCLE", wave:2, owner:"agents-architect", effort:"M", dep:"", title:"Reconcile signal_queue lifecycle — drain 34 stuck-TRIAGED rows, fix dead terminal-sprint predicate + startswith(BCTC-) clause, co-evict dangling refs"},
          {rank:8, id:"SSOT-W2-PROSE-COLD-MIGRATION", wave:2, owner:"pm", effort:"M", dep:"1,2", title:"Execute brief §3.6 active-sprint task-prose -> cold migration (88.6KB, 0/53 detail_ref) + stub-on-write rule to PM/dev-team task creation"},
          {rank:9, id:"SSOT-W2-SPRINT-GOAL-PRUNE", wave:2, owner:"po", effort:"M", dep:"1", title:"sprint_goal prune-on-close (entries subset of active_sprints) + wire eviction + normalize status vocab"},
          {rank:10, id:"SSOT-W2-DECISION-JOURNAL-ROTATION", wave:2, owner:"architect", effort:"M", dep:"1", title:"decision_journal collapse dual ts/timestamp to one ISO field + repair malformed ts + add _cap + wire rotation into orch-cold-evict.sh"},
          {rank:11, id:"SSOT-DEFER-MIXED-REPR-MIGRATION", wave:"defer", owner:"pm", effort:"M", dep:"1", title:"Complete closed_sprint/backlog mixed-representation migration + delete 5 cold HSC orphans"},
          {rank:12, id:"SSOT-W1-TS-SYNC-1837A", wave:1, owner:"developer", effort:"M", dep:"", title:"Fix RED 1837a test + sync mcp-server OrchState TS types to live v4 + point newestUpdated() at _meta.updated_at"},
          {rank:13, id:"SSOT-DEFER-LEGACY-HOT-KEYS", wave:"defer", owner:"developer", effort:"M", dep:"1", title:"Cleanup legacy/stale hot keys — _closed_signals_20260614, session_handoff_status, dashboard_section_cache 3-way drift, signal_queue.archive doc wording"},
          {rank:14, id:"SSOT-DEFER-STATE-MACHINE-DOCS", wave:"defer", owner:"architect", effort:"M", dep:"", title:"Document the 3 status state-machines + §2.5 cold-resolution recipe in orch-state-access.md + normalize signal severity + add severity to validator"},
          {rank:15, id:"SSOT-DEFER-SIGNAL-ROW-HYGIENE", wave:"defer", owner:"system-auditor", effort:"S", dep:"", title:"Signal-row data hygiene — null-ts row + duplicate sau-d4 id + validator parseable-ts/unique-id check"}
        ]
      } ] end ) )

# === M3.7 — mint ARCH-SSOT-INTEGRITY-PERIMETER -> ready[] (id-guarded) ===
| .task_board.ready = ( .task_board.ready +
    ( if ($board_ids | index("ARCH-SSOT-INTEGRITY-PERIMETER")) then []
      else [ {
        id: "ARCH-SSOT-INTEGRITY-PERIMETER",
        type: "SPRINT-M",
        status: "READY",
        sprint: "SSOT-INTEGRITY-PERIMETER",
        rank: 1,
        wave: 1,
        owner_agent: "architect",
        next_agent: "architect",
        zone: "cross-service",
        priority: "high",
        created_at: $now,
        created_by: "po-s121",
        title: "Author the SSOT integrity-perimeter hardening brief",
        desc: "Author docs/architecture-briefs/SSOT-INTEGRITY-PERIMETER-hardening.md from docs/handoffs/orch-state-deep-audit-2026-06-27.json .roadmap. The brief MUST specify, with RAW jq exemplars: (1) ONE canonical task-lane-list jq def (all 9 status-bearing lanes incl closed_sprints[].tasks) extending G-5(enum)/G-3(lane-type)/G-4(null-id) to every lane + a PARKED-in-review regression fixture; (2) gate extensions G-0 raw-byte duplicate-key reject, G-1 empty-file [-s] guard, G-6 tick-skew repair (.last_tick vs _meta.updated_at), G-7 schema-key invariant incl the task_board.head-must-be-stub assertion, G-7/8/9 referential-integrity (detail_ref/payload_ref/orphan-warn); (3) the scripts/orch-apply.sh gated-wrapper contract (write-temp -> validate -> CAS-mtime rename) that EVERY hot-file writer routes through; (4) the data-clean jq spec already executed by po-s121 (PARKED/done_verified relabel, head re-collapse, dup-metadata drop) documented as the migration map; (5) the §2.5 read-standard cold-resolution recipe. Hand to pm to decompose Wave-1 into atomic zone tasks (ranks 1-4,6-gate,12). Data offenders already cleaned by po-s121 (dep rank-5 satisfied).",
        depends_on: ["SSOT-W1-DATA-CLEAN(done po-s121)"],
        deliverable: "docs/architecture-briefs/SSOT-INTEGRITY-PERIMETER-hardening.md",
        verification_gate: "pm can decompose the brief into atomic zone dev tasks with no open design questions; every gate clause has a RAW jq exemplar + a regression fixture.",
        audit_source: "docs/handoffs/orch-state-deep-audit-2026-06-27.json"
      } ] end ) )

# === M3.8 — set canonical top-level .head -> dispatch architect (only if idle) ===
| .head = ( if (.head.active_task_id == null or (.head.status // "idle") == "idle")
    then {
      status: "in_progress",
      active_task_id: "ARCH-SSOT-INTEGRITY-PERIMETER",
      next_agent: "architect",
      updated_at: $now,
      updated_by: "po-s121",
      note: "SSOT-INTEGRITY-PERIMETER opened (audit 2026-06-27). Data offenders cleaned (PARKED/done_verified/head/dup-meta). Dispatching architect to author the hardening brief; dev-team Step-0b head-resume spawns architect."
    } else .head end )

# === M4 — metadata bump ===
| .task_board._updated_at = $now
| .task_board._updated_by = "po-s121"
| ._meta.updated_at = $now
| ._meta.updated_by = "po-s121"
