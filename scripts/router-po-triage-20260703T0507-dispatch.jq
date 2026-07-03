# Router board write for dev-team tick 2026-07-03T05:07Z, applying PO triage (afc908b4c1c686065, RAW-verified).
# BATCH(2): (1) mint SPIKE-BCTC-CTG-BS-REALDATA-ROOT -> in_progress, dispatch architect (cross-layer real-data
# root-cause recon; SPIKE default agent is developer but PO's recurring-bug-bar disposition escalates to architect
# for design-level layered root cause, per feedback_recurring_bug_escalation). (2) enricher UNBLOCK -> qa gate
# (no row change here; qa promotes review->done_verified on its own; dispatched separately).
# Dispositions applied to review rows (no dispatch): bank-bs next_agent dev-mcp-server->architect + blocked_on SPIKE
# + HOLD in review (qa behavioral DoD FAIL already recorded 05:24Z); W5 rows note held pending SPIKE.
# WIP: in_progress 0 -> 1 (SPIKE only; enricher qa gate consumes no coding slot).
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute — router board write on triage return).
# Usage: jq --arg now "$NOW" -f scripts/router-po-triage-20260703T0507-dispatch.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
if ((.task_board.in_progress | length) >= 2) then error("WIP limit: in_progress already \(.task_board.in_progress | length) — refuse")
elif ((.task_board.review | map(select(.id=="FIX-BCTC-BANK-BS-SECTION-CLASSIFIER")) | length) == 0) then error("bank-bs not in review[] — refuse")
elif ((.task_board.in_progress | map(select(.id=="SPIKE-BCTC-CTG-BS-REALDATA-ROOT")) | length) > 0) then error("SPIKE already in in_progress[] — refuse dup")
else . end
# (1) mint the SPIKE into in_progress
| .task_board.in_progress += [
    {
      id: "SPIKE-BCTC-CTG-BS-REALDATA-ROOT",
      title: "Real-data root-cause recon: why CTG 96e36139 total_assets stays 0 after the 3-defect classifier fix + full refine",
      type: "SPIKE",
      status: "IN_PROGRESS",
      owner: "dev-team",
      next_agent: "architect",
      zone: "multi",
      priority: "high",
      mode: "spike",
      timebox_min: 120,
      created_at: $now,
      created_by: "po-triage-2026-07-03T05:07Z",
      claimed_at: $now,
      claimed_by: "router",
      parent_task: "FIX-BCTC-BANK-BS-SECTION-CLASSIFIER",
      related: ["W5-FU-CTG-REFINE-96e36139","TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST"],
      question: "For the REAL fully-refined CTG 2026-Q1 consolidated bank report (report_id 96e36139-5dac-414d-8e4d-20a4725890d1, 56/56 DONE, 451 materialized rows), locate WHERE total_assets is lost across three layers: (a) TRANSCRIPTION/refine — are the grand-total rows (Tong tai san Co / Tong no phai tra / Von chu so huu) genuinely ABSENT from the materialized markdown or present-but-mislabeled/mis-normalized (qa RAW-inspection found ZERO grand-total labels in the primary BS, only an unrelated pair on page-56 notes table); (b) CLASSIFICATION — why does isBankFormFromRows classify the real Roman-numeral bank row set as NON-bank, routing to the corporate path (server log 'scalar backfill: no non-null scalars found' = ALL scalars null); (c) PARSER vs SOURCE — is the page-45 equity-movement + note/schedule column (code/label/value) misalignment a refinedMarkdownParser defect or upstream OCR. Output: findings doc + scoped fix design SPLIT BY LAYER so the follow-on dev task(s) target the true root — NOT a 4th synthetic-passing classifier patch.",
      dispatch_note: "Dispatched architect \($now). PO triage 2026-07-03T05:07Z: bank-bs DoD FAILED on real data (2nd DoD-cycle failure same doc => recurring-bug bar => escalate to architect design recon, not a 4th blind dev-mcp-server patch). Timebox 120min. Deliverable: findings doc + layer-split fix design. Blocks W5 chain (W5-FU-CTG-REFINE, TASK-W5-VALIDATION-REINGEST) + FIX-BCTC-BANK-BS-SECTION-CLASSIFIER."
    }
  ]
# bank-bs disposition: repoint to architect, add blocked_on SPIKE, HOLD in review
| .task_board.review |= map(
    if .id=="FIX-BCTC-BANK-BS-SECTION-CLASSIFIER" then
      . + {
        next_agent: "architect",
        route_to: "architect",
        blocked_on: "SPIKE-BCTC-CTG-BS-REALDATA-ROOT",
        po_disposition_20260703T0507: "[po-triage 2026-07-03T05:07Z] Behavioral DoD FAILED on real data (qa 05:24Z) is a NEW cross-layer root set (bank-form mis-classification + missing/mislabeled grand-total rows + page-45 column misalignment) the 3-defect fix never targeted; synthetic 13/13 pass because fixtures diverged from the real doc. 2nd DoD-cycle failure on same doc => recurring-bug bar. Repoint next_agent dev-mcp-server->architect; HOLD in review, blocked_on SPIKE-BCTC-CTG-BS-REALDATA-ROOT. qa CODE gate (APPROVE-CODE, 13/13) stays valid + unchanged. Live-served CTG is the HONEST corrupt-data guard (not silently wrong) => no user-facing wrong-data urgency, but this is the single root blocking the whole W5 chain."
      }
    # W5 rows: note held pending SPIKE (already BLOCKED on classifier; SPIKE is now classifier's root)
    elif (.id=="W5-FU-CTG-REFINE-96e36139" or .id=="TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST") then
      . + {
        po_triage_20260703T0507_note: "Held pending SPIKE-BCTC-CTG-BS-REALDATA-ROOT — the classifier root (FIX-BCTC-BANK-BS-SECTION-CLASSIFIER) was re-scoped to an architect real-data recon after its behavioral DoD FAILED. This row stays BLOCKED transitively (row -> classifier -> SPIKE)."
      }
    else . end
  )
# head -> in_progress on the SPIKE dispatch
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "SPIKE-BCTC-CTG-BS-REALDATA-ROOT",
    next_agent: "architect",
    note: "PO triage tick 2026-07-03T05:07Z BATCH(2): SPIKE-BCTC-CTG-BS-REALDATA-ROOT dispatched to architect (real-data root-cause recon, bank-bs escalated on recurring-bug bar); FIX-BCTC-ENRICHER-STUCK-BACKLOG dispatched to qa for final DoD sign-off (review->done_verified, LIVE-verified). W5 chain held on SPIKE. BCTC-HNX-SSL-HARDEN flagged for manual user deploy."
  }
