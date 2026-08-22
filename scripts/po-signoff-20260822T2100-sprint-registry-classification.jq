# scripts/po-signoff-20260822T2100-sprint-registry-classification.jq
#
# PO sign-off on the regenerated sprint-registry dangling-id classification
# table (task FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE).
#
# WHAT THIS WRITES — routing + verdict ONLY. It deliberately does NOT apply the
# {LIVE/FINISHED/RELABEL/NEVER_WAS} reconciliation data mutation: per the row's
# own po_review_note B3 corrected sequencing, that is the NEXT developer cycle's
# step, after this sign-off. No active_sprints[]/closed_sprints[]/`.sprint`
# field is touched here.
#
#   - next_agent: po -> developer  (row stays in review[], status unchanged)
#   - po_verdict: RATIFIED-... -> SIGNED-OFF-CLASSIFICATION-APPLY-RECONCILIATION
#   - NEW po_signoff_20260822T2100Z: the signed table + 4 binding write
#     constraints (W1-W4) the reconciliation cycle must honour
#
# PROSE-CEILING BUDGET (scripts/orch-row-prose-ceiling-check.mjs, growth-only,
# this row is grandfathered-over at ~16.7KB so ANY net prose growth is a hard
# reject): the new po_signoff field is PAID FOR by compressing three fields
# whose content is superseded and preserved verbatim in git —
#   architect_review_note   (full text IS the design brief, see detail_ref)
#   po_goahead_20260814T143024 (already a superseded stub, git 5ab107121)
#   po_goahead_20260822T201220Z (its PO GATE is discharged by the new field,
#                                git 69b3b30d2)
# Nothing unique is lost; every compressed field names its own git commit.
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>):
#   jq -f scripts/po-signoff-20260822T2100-sprint-registry-classification.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def TASK_ID: "FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE";

.task_board.review = [
  .task_board.review[]
  | if .id == TASK_ID then
      . + {
        next_agent: "developer",
        updated_at: "2026-08-22T21:00:00Z",
        updated_by: "po",
        po_verdict: "SIGNED-OFF-CLASSIFICATION-APPLY-RECONCILIATION",

        architect_review_note: "AMENDMENT COMPLETE (architect 2026-08-22) answering po_verdict=AMEND-THEN-RESUBMIT: A1/A2/A3 + AC-0 + Q1-Q4. Full text IS the design brief — detail_ref §11.1-§11.8; prior wording in git (661a86cc3, 69b3b30d2).",

        po_goahead_20260814T143024: "SUPERSEDED by po_goahead_20260822T201220Z (that stamp was design-amendment-only); original text in git (5ab107121).",

        po_goahead_20260822T201220Z: "IMPLEMENTATION AUTHORIZED 2026-08-22T20:12:20Z — brief §11 as corrected by po_review_note B1/B2/B3 + po_ruling_q4; plan_only cleared. Its PO GATE is now DISCHARGED by po_signoff_20260822T2100Z. AC-0 severed to FIX-DJA-ALL-SAFETY-VALVE-ARMED-HAZARD. Full text in git (69b3b30d2).",

        promotion_note: "Supervised-Lane Sweep 2026-08-08 (dispatch_lane now developer); full text in git.",

        po_signoff_20260822T2100Z: "PO SIGN-OFF 2026-08-22T21:00Z — table RATIFIED, PO GATE DISCHARGED, write AUTHORIZED, no further PO pass. Re-ran script vs live: 24 = LIVE 11 / FINISHED 0 / RELABEL 2 / NEVER_WAS 3 / PRE_SPRINT_LABEL 8, counted 16; md5 unchanged, 136/136 green, tsc clean, strict union 57. Dev's 23/7 is STALE not wrong: peer PO commit 20:46Z minted sprint_goal PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP PLANNING/0-refs = +1 exempt; counted set identical. B1a/B1b/B2/Q4/BACKLOG/Q3 verified IN CODE. BINDING ON THE WRITE: W1 regenerate the table immediately before writing, act ONLY on counted rows, never write a PRE_SPRINT_LABEL id. W2 AC-5 gate is counted==0, never strict_dangling==0 — the exempt class never reaches 0 by design; chasing it fabricates sprints (Q2). W3 apply LIVE before/atomic-with RELABEL — UC-RDL-P4's target ULTRACODE-AUDIT-FIXALL is itself LIVE; relabel-first re-dangles. W4 LIVE = stub {id,status:'active',goal,opened_at,tasks:[]}; never a TERMINAL_SET status (cold-evict kills it), never migrate flat-lane rows into sprint.tasks."
      }
    else . end
]
