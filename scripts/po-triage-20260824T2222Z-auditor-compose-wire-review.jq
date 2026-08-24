# scripts/po-triage-20260824T2222Z-auditor-compose-wire-review.jq
#
# PO disposition of the Review-Lane SECONDARY-Drain pick
# FIX-AUDITOR-NOTEBOOK-COMPOSE-ACTUATOR-BUILT-TESTED-NEVER-WIRED
# (2026-08-24T22:16Z tick; row sat in task_board.review[] with next_agent=null,
# which is why no automated lane could pick it).
#
# Shape (c) of the drain's terminal contract: REASSIGN — set next_agent to the
# correct owner, leave the row in review[]. The drain re-selects REVIEW rows
# whose effective_next_agent != "qa" every tick, so a non-null next_agent is
# what makes it dispatchable again (scripts/devteam-review-claim-secondary-drain.jq
# L143). detail_ref key is absent from backlog-detail.json, so the board row's
# own .next_agent is authoritative for effective_next_agent().
#
# Also clears the stale blocked_by: FIX-AUDITOR-DATA-TIER-NOTEBOOK-WRITE-PATH-
# UNWIRED is DONE_VERIFIED, and a non-empty blocked_by fails deps_satisfied().
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>):
#   jq -f scripts/po-triage-20260824T2222Z-auditor-compose-wire-review.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def note:
  "PO REVIEW 2026-08-24T22:22Z — REWORK, not signed off. "
+ "WIRE HALF IS DONE: scripts/notebook-compose.sh is invoked for real at docs/agents/system-auditor/flow/main.md:1115 (bash scripts/notebook-compose.sh $NB_PATH $NEW_SECTION_FILE 3 150) since 78a43bf3c (2026-08-14), and it demonstrably EXECUTES — 4 commits carry this row own defined runtime proof, the COMPOSE_MARKER commit-message suffix: 09ea175ba tier-2 [OK sections=1 dropped=4], 26f9a8c3c tier-3 [sections=3 dropped=0], ee399f2f1 tier-2 [sections=1 dropped=4], 1e34634d9 tier-DATA [sections=2 dropped=0]. The literal ZERO-CALLERS claim in this title is therefore no longer true. "
+ "WHY NOT SIGNED OFF: adoption is 4 of 42 notebook-mutating commits since the wire, and ALL 4 are tier-2/3/DATA. TIER-1 — the 30-min tier whose notebook produced the c84>c83>c85>c73>c5 corruption this row exists to fix, and which the 2026-08-14 pilot explicitly claimed in scope — has NEVER once invoked the actuator, and the headline defect reproduced TWICE in the 24h before this review. "
+ "(1) f4b9740b2, 2026-08-24T06:44Z: hand-wrote heading '## Cycle c1007 (System-Auditor Tier-1, 2026-08-24T06:36-06:43Z)' — off-template AND a duplicate cycle number, since a different c1007 (2026-08-24T18:32Z) is what is live in the notebook now. "
+ "(2) 2f3112a99, 2026-08-24T20:20Z: appended '## c1008' as +134/-0 — pure append, zero prune, 134 lines in ONE section against the 60L per-section SSOT, leaving the file at 245L against the 200L cap in docs/data/file-size-caps.json. "
+ "Both bypassed notebook-compose.sh AND auditor-notebook-commit.sh (bare commit, no marker suffix); both bypasses are explicitly FORBIDDEN in docs/agents/tools/package/system-auditor.md. A P0 whose headline symptom recurred twice in 24h cannot go to DONE_VERIFIED. "
+ "BAR FOR SIGN-OFF: a forcing function narration cannot bypass, of the class already proven TWICE in this same flow file (durability-sweep V8 gate; section 2b commit-plane crosscheck). Obvious host: scripts/git-hooks/pre-commit, which already carries two sibling guards (auditor-heartbeat sole-writer, notebook-uuid-provenance) — reject/warn any commit touching docs/agent-memory/notebooks/system-auditor.md whose message lacks a [notebook-compose ...] marker. More prose in a 1400L flow doc is NOT an acceptable fix; that is exactly what already failed on 2026-08-06 and again on 2026-08-14. "
+ "ROUTED TO ARCHITECT because the fix is cross-zone (agent-father owns docs/agents/system-auditor/flow/, developer owns scripts/git-hooks/) and needs a brief plus a split — same shape as the 2026-08-14 pilot brief. NOT a duplicate of FIX-AUDITOR-SELF-COMMIT-STEP-NEVER-FIRES (commit step absent, not wrong-path) nor of FIX-AUDITOR-NOTEBOOK-APPEND-GATE-BYPASSED-ALL-GREEN-WRITE (wrote when it should have SKIPped). "
+ "blocked_by cleared: FIX-AUDITOR-DATA-TIER-NOTEBOOK-WRITE-PATH-UNWIRED is DONE_VERIFIED. Stale pointer noted, not fixed here: detail_ref names a key absent from docs/data/orch/archive/backlog-detail.json.";

.task_board.review = (
  (.task_board.review // [])
  | map(
      if .id == "FIX-AUDITOR-NOTEBOOK-COMPOSE-ACTUATOR-BUILT-TESTED-NEVER-WIRED"
      then
        .next_agent  = "architect"
        | .status      = "REVIEW"
        | .blocked_by  = []
        | .status_note = note
        | .reviewed_at = "2026-08-24T22:22:18Z"
        | .reviewed_by = "po"
        | .updated_at  = "2026-08-24T22:22:18Z"
      else . end
    )
)
