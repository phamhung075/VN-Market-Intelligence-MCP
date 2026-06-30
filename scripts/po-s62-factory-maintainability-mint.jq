# po-s62-factory-maintainability-mint.jq
# Idempotent mint of the 2026-06-15 maintainability factory-audit backlog into
# orch-state.json .task_board.backlog[] under epic "FACTORY-MAINTAINABILITY-2026-06".
#
# Mints (a) all 94 zone-routed FACTORY-* tasks pulled from the audit .output, and
# (b) 7 CI guardrails as their own backlog cluster (FACTORY-GUARD-* + an architect
# spike umbrella FACTORY-GUARD-CI-REGRESSION-SPIKE).
#
# - id-guarded against ALL board arrays (backlog/ready/in_progress/review/done/done_verified)
#   so re-running is a no-op on already-present ids (no dup, no clobber).
# - status=BACKLOG, NOT promoted to ready[]. WIP/BCTC-P0 sprint gates promotion.
# - fast_track:true tag on the 5 named metric-mask P0/P1 fixes (confidence_score=50 bug class)
#   so the router can promote them as the FIRST factory wave once the BCTC P0 sprint clears.
#
# Usage:
#   AUDIT=/private/tmp/.../wl2ia1tk8.output
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" --slurpfile audit "$AUDIT" \
#      -f scripts/po-s62-factory-maintainability-mint.jq \
#      docs/data/orch/orch-state.json > tmp && mv tmp docs/data/orch/orch-state.json
# (caller wraps: atomic temp -> [ -s ] -> `jq empty` -> conservation guard -> rename)

# --- inputs ---------------------------------------------------------------
($audit[0].result.plan.backlog) as $tasks
| ($audit[0].result.plan.ci_guardrails) as $guards

# --- the 5 fast-track metric-mask fixes (confidence_score=50 bug class) ----
# server.ts ??50, agentSignalStore =50, sequential ??0.5, finalizeBctc source_conf ??1.0, pek 0.7
| ([ "FACTORY-INTERFACE-confidence-score-50-mask",
     "FACTORY-INFRA-agentsignal-confidence-50-default",
     "FACTORY-INTERFACE-sequential-confidence-05-mask",
     "FACTORY-INTERFACE-source-confidence-10-mask",
     "FACTORY-PDF-paddleocr-score-07-mask" ]) as $fasttrack

# --- set of ids already present anywhere on the board (dedup guard) --------
| ( [ .task_board.backlog[]?, .task_board.ready[]?, .task_board.in_progress[]?,
      .task_board.review[]?, .task_board.done[]?, .task_board.done_verified[]? ]
    | map(.task_id // .id) | map(select(. != null)) ) as $existing

# --- build the 94 FACTORY task rows ---------------------------------------
| ( $tasks
    | map( select( (.task_id as $id | $existing | index($id)) | not )
           | {
               task_id, title,
               priority,
               dev_agent,
               zone,
               files,
               approach,
               effort,
               risk,
               rebuild_required,
               dod,
               depends_on,
               type: "FACTORY",
               epic: "FACTORY-MAINTAINABILITY-2026-06",
               status: "BACKLOG",
               source: "2026-06-15-maintainability-factory-audit (Workflow wl2ia1tk8 / wf_56fbf1b2-b68; 33 agents, 16/16 zones, 117 verified findings)",
               brief_ref: "docs/architecture-briefs/2026-06-15-maintainability-factory-audit.md",
               created_at: $now,
               created_by: "po",
               fast_track: ( (.task_id) as $id | ($fasttrack | index($id)) != null ),
               sequence_note: "Sequence from depends_on + priority; audit sprint_sequence only captured wave 13 (synthesis truncation)."
             }
           # finalizeBctc NOT-NULL propagation caution carried as an explicit guard field
           | if .task_id == "FACTORY-INTERFACE-source-confidence-10-mask"
             then . + { not_null_caution: "source_confidence column is REAL NOT NULL DEFAULT 1.0 (schema-financial-reports.ts:510); fix MUST propagate real per-row parser confidence, NEVER write null, else it relocates the mask. Do NOT make the column nullable in this task." }
             else . end
         ) ) as $newtasks

# --- build the 7 CI guardrail rows (own cluster) + architect spike umbrella -
| ( $guards
    | to_entries
    | map(
        ( (.value | split(":")[0]) ) as $gid
        | { task_id: ("FACTORY-GUARD-" + $gid),
            title: (.value | split(":")[0]),
            description: (.value),
            priority: "P2",
            type: "CI-GUARDRAIL",
            epic: "FACTORY-MAINTAINABILITY-2026-06",
            cluster: "ci-regression-prevention",
            dev_agent: "architect",
            zone: "cross-service/",
            status: "BACKLOG",
            note: "Regression-prevention layer for the factory program. Scope via architect spike FACTORY-GUARD-CI-REGRESSION-SPIKE before dispatch.",
            source: "2026-06-15-maintainability-factory-audit ci_guardrails",
            brief_ref: "docs/architecture-briefs/2026-06-15-maintainability-factory-audit.md",
            created_at: $now,
            created_by: "po" }
      ) ) as $guardrows_raw

# spike umbrella that lists its child guardrail ids
| ( { task_id: "FACTORY-GUARD-CI-REGRESSION-SPIKE",
      title: "Architect spike: scope the 7 factory CI guardrails (size-justification lint, metric-mask lint, depguard tier-boundaries, dead-code gate, no-hardcode allowlist scan, shared-package import check, rebuild raw-verify hook)",
      type: "SPIKE",
      mode: "spike",
      priority: "P2",
      epic: "FACTORY-MAINTAINABILITY-2026-06",
      cluster: "ci-regression-prevention",
      dev_agent: "architect",
      owner: "architect",
      zone: "cross-service/",
      status: "BACKLOG",
      timebox: 120,
      question: "Sequence + design the 7 CI guardrails so they land AFTER the per-file splits + metric-mask fixes (the size-justification sweep depends on the size-lint gate existing and all splits having landed; metric-mask lint depends on the 5 fast-track fixes so its allowlist is honest). Produce a build order + per-guard owner.",
      children: ($guardrows_raw | map(.task_id)),
      source: "2026-06-15-maintainability-factory-audit ci_guardrails",
      brief_ref: "docs/architecture-briefs/2026-06-15-maintainability-factory-audit.md",
      created_at: $now,
      created_by: "po" } ) as $spike

# id-guard guardrows + spike against existing board too
| ( ($guardrows_raw + [$spike])
    | map( select( (.task_id as $id | $existing | index($id)) | not ) ) ) as $guardrows

# --- append all minted rows to backlog ------------------------------------
| .task_board.backlog += ($newtasks + $guardrows)
