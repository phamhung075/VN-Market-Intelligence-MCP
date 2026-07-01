# po-s135-prediction-evidence-revival-kickoff.jq
# ---------------------------------------------------------------------------
# PO self-initiated umbrella-sprint kickoff (idempotent, single atomic pass).
# Originated 2026-07-01: router RAW-verified + PO RAW-re-verified the prediction
# dashboard (/dashboard/prediction-claims) has shown NO new claims since id=12
# POW (2026-06-26); get_evidence_summary CTG/FPT = all foreign_flow_institutional
# LR=1.00 (n=0) UNTRUSTED; digest-predict has honest-NO-OP'd 12+ consecutive
# cycles because validate_prediction_claims needs a Sharpe>1.0 backtest that
# empty/untrusted LR data can NEVER satisfy. RECURRING: prior sprint
# EVIDENCE-ACCUM-SILENT-CRON (DONE_VERIFIED 53d00955) fixed only the cron
# scheduling/dedup layer; the LR-starvation + evidence monoculture +
# validation-gate-bootstrap layers remain -> architect brief per
# feedback_recurring_bug_escalation.md, NOT another point patch.
#
# Mutations (all idempotent):
#   M1  append sprint_goal.entries[] : PREDICTION-EVIDENCE-REVIVAL (active)
#   M2  append task_board.backlog[]  : BA-PREDICTION-EVIDENCE-REVIVAL (ba, TODO, zone=multi)
#   M3  reconcile FIX-EVIDENCE-PIPELINE-STARVED in backlog[] (annotate specced_under;
#         normalize drifted status REVIEW->TODO — parked in backlog, never reviewed,
#         null owner/commit). Stays BACKLOG (pm decomposition mints the real dev task).
#   M4  annotate FIX-PREDICTION-SIGNALS-EMPTY in backlog[] (specced_under). Stays BACKLOG.
#
# Reusable pattern: "PO umbrella-sprint kickoff — mint sprint_goal + ONE BA-spec
# task to backlog + fold N already-tracked stranded rows under it via specced_under
# (marker-guarded, stays backlog so they don't double-dispatch); architect SPLITs
# multi-zone, pm decomposition mints the real per-item dev tasks."
#
# Conservation: sprint_goal.entries +1, backlog +1, all other lanes byte-stable.
# Idempotency: M1/M2 id/sprint-guarded; M3/M4 marker-guarded on specced_under.
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s135-prediction-evidence-revival-kickoff.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# ---------------------------------------------------------------------------

("PREDICTION-EVIDENCE-REVIVAL") as $sprint
| ("BA-PREDICTION-EVIDENCE-REVIVAL") as $ba
| ([ .task_board | to_entries[] | select(.value|type=="array") | .value[] | select(type=="object") | .id ]) as $all_ids
| (($all_ids | index($ba)) != null) as $ba_present
| (((.sprint_goal.entries // []) | map(.sprint_id) | index($sprint)) != null) as $sprint_present

# --- M1: sprint_goal entry (idempotent) ---
| (if $sprint_present then .
   else .sprint_goal.entries += [ {
     sprint_id: $sprint,
     status: "active",
     priority: "high",
     created_by: "po",
     origin: "router_raw_verified_bug",
     vision: "Prediction dashboard (/dashboard/prediction-claims) emits fresh daily claims again by reviving the starved evidence->likelihood-ratio->validation chain. 12+ consecutive digest-predict no-op cycles; serving layer (/api/prediction-claims) healthy 200 — root is UPSTREAM evidence starvation, NOT a frontend bug.",
     scope_in: "(a) evidence_likelihood_ratios n=0 everywhere -> find/build/repair the LR compute-or-backfill job in apps/mcp-server/src/scheduler/** (PRIMARY blocker; tracked stub FIX-EVIDENCE-PIPELINE-STARVED + symptom FIX-PREDICTION-SIGNALS-EMPTY fold here). (b) Evidence monoculture -> only foreign_flow_institutional fragments record; audit why news-scout/bctc-*/market-watcher/kinh-dich cowork agents stopped calling record_evidence_fragment. (c) Validation-gate cold-start bootstrap -> Sharpe>1.0 backtest gate unsatisfiable at n=0; architect design call on a bootstrap path so claims can emit before LR history accumulates.",
     scope_out: "Frontend/serving layer (healthy 200 — do NOT touch). Cron-scheduling/dedup of evidenceAccumulatorJob (ALREADY DONE_VERIFIED by EVIDENCE-ACCUM-SILENT-CRON commit 53d00955 — do NOT re-fix). Calibration Brier degradation (0.1379->0.2135 DAMPENING_ACTIVE) tracked separately (FIX-FB-PREDICTION-CALIBRATION-LOOP). kinh-dich backtest 501 tracked separately (KD-BACKTEST-501-4X).",
     success_metric: "get_evidence_summary shows n>0 TRUSTED LR on a majority of recorded fragment pairs AND >=2 non-foreign_flow fragment types present AND GET /api/prediction-claims returns a new claim (id>12) created within 2 digest cycles of deploy.",
     created_at: $now
   } ] end)

# --- M2: BA spec task to backlog (idempotent) ---
| (if $ba_present then .
   else .task_board.backlog += [ {
     id: $ba,
     title: "Requirement spec for PREDICTION-EVIDENCE-REVIVAL — revive starved evidence->LR->validation chain so digest-predict emits fresh prediction claims again",
     owner: "ba",
     next_agent: "ba",
     status: "TODO",
     zone: "multi",
     type: "SPRINT-M",
     priority: "high",
     sprint: $sprint,
     created_at: $now,
     depends: [],
     note: "ROUTER-RAW + PO-RAW verified 2026-07-01. Dashboard shows no new predictions since id=12 POW (2026-06-26, 5+d). get_evidence_summary CTG/FPT = all foreign_flow_institutional LR=1.00 (n=0) UNTRUSTED. digest-predict validate_prediction_claims needs Sharpe>1.0 backtest -> unsatisfiable at n=0 -> structural NO-OP (notebook confirms honest no-op 06-27..06-30). THREE work-items for architect to SPLIT multi-zone: (a) LR compute/backfill job apps/mcp-server/src/scheduler/** [PRIMARY; folds stub FIX-EVIDENCE-PIPELINE-STARVED + symptom FIX-PREDICTION-SIGNALS-EMPTY]; (b) monoculture audit of record_evidence_fragment producers across cowork agent flows (docs/agents/**); (c) validation-gate cold-start bootstrap DESIGN. CONTEXT: prior EVIDENCE-ACCUM-SILENT-CRON (53d00955 DONE_VERIFIED) fixed cron-scheduling/dedup ONLY — accumulator RUNS (rows_written=9 06-13 live-verified) but LR sample n=0 + monoculture persist. Recurring-bug-escalation: architect brief before point patches."
   } ] end)

# --- M3: reconcile FIX-EVIDENCE-PIPELINE-STARVED (marker-guarded) ---
| .task_board.backlog |= map(
    if (type=="object" and .id=="FIX-EVIDENCE-PIPELINE-STARVED" and (has("specced_under")|not)) then
      . + {
        status: "TODO",
        specced_under: $ba,
        status_note: ("Folded under " + $ba + " work-item (a) PRIMARY blocker (evidence_likelihood_ratios n=0). Stays BACKLOG — pm decomposition under the BA spec mints the real dev task; do NOT dispatch directly. Status normalized REVIEW->TODO " + $now + " (drift: parked in backlog, never reviewed, null owner/commit).")
      }
    else . end)

# --- M4: annotate FIX-PREDICTION-SIGNALS-EMPTY (marker-guarded) ---
| .task_board.backlog |= map(
    if (type=="object" and .id=="FIX-PREDICTION-SIGNALS-EMPTY" and ((.specced_under // "") != $ba)) then
      . + {
        specced_under: $ba,
        status_note: ("Downstream symptom of the same starved chain (prediction_signals frozen 45d). In-scope for " + $ba + " work-item (a). Stays BACKLOG — pm decomposition mints the dev task; do NOT dispatch directly. Annotated " + $now + ".")
      }
    else . end)

# --- metadata bump ---
| .task_board._updated_at = $now
| .task_board._updated_by = "po-s135-prediction-evidence-revival-kickoff"
| .sprint_goal._updated_at = $now
| .sprint_goal._updated_by = "po"
