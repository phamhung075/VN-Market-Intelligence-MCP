# po-s138 — single-pass PROMOTE-ROOT + RECONCILE-BLOCKED-DOWNSTREAM triage (idempotent).
#
# Origin 2026-07-02 (dev-team tick T03:37Z): the dispatcher pre-gathered "TASK-W5-...-VALIDATION-REINGEST
# is a qa-gate -> done candidate (RAW-verified GREEN: dev b630277c, bun test 4/4)". PO RAW-verified the
# BOARD and found the badge is STALE: AC-10 (CTG total_assets unfreeze from 0) is UNMET on the live named-
# volume market.db. The refine follow-up (W5-FU-CTG-REFINE-96e36139) EXECUTED (56/56 DONE, reingest --apply
# exit 0, 440 rows, VCB/FPT byte-identical) but DoD is NOT MET because the finalize balance-sheet SECTION
# CLASSIFIER drops unit-0002 (pages 4-5) + mistags unit-0003 -> 0 balance_sheet rows land (VCB baseline 57),
# so CTG total_assets stays 0. That is the real root = FIX-BCTC-BANK-BS-SECTION-CLASSIFIER (backlog).
#
# Reusable pattern for "a review row's done-badge is stale (a downstream bug blocks its AC) -> DO NOT qa-gate;
# promote the confirmed root FIX backlog->ready and reconcile every downstream review row to BLOCKED-on-root
# so the dispatcher never mistakes them for sign-off candidates".
#
# M1: PROMOTE FIX-BCTC-BANK-BS-SECTION-CLASSIFIER backlog->ready (status=READY + promotion stamps + unblocks
#     + deploy_gate note). Idempotent: skipped if id already present in ANY non-backlog lane.
# M2: RECONCILE W5-FU-CTG-REFINE-96e36139 in review[] status REVIEW->BLOCKED (+depends +blocked_on).
#     Idempotent: only fires while status=="REVIEW".
# M3: RECONCILE TASK-W5-...-VALIDATION-REINGEST in review[] (already BLOCKED): repoint blocked_on to the
#     classifier (its prior blocker — the agentic-refine pass — is now DONE) +depends. Marker-guarded.
#
# Head DELIBERATELY UNTOUCHED (idle): PO returns a live BATCH to the dev-team router this tick, so the
# router does the lock-claim + spawn from the BATCH. Repointing head would risk a double-dispatch
# (BATCH spawn + next-tick Step-0b head-resume spawn). See feedback po-s109 ROUTING RULE.
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/po-s138-bctc-bs-classifier-promote-w5-chain-reconcile.jq \
#   docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# (orch-apply does Zod + dup-key + ref-integrity + CAS-mtime + atomic rename; PUSH HELD — fleet-push timer.)

("FIX-BCTC-BANK-BS-SECTION-CLASSIFIER") as $cid
| (["ready","in_progress","review","done","done_verified"]) as $nb
| ([ $nb[] as $lane | .task_board[$lane][]? | select(type=="object") | .id ] | index($cid)) as $already
| (.task_board.backlog | map(select(type=="object" and .id==$cid)) | first) as $crow

# ---- M1: promote backlog -> ready (only if in backlog AND not already in a non-backlog lane) ----
| ( if ($already == null) and ($crow != null)
    then
      .task_board.backlog |= map(select((type=="object" and .id==$cid) | not))
      | .task_board.ready += [ $crow
          + { status: "READY",
              promoted_at: $now,
              promoted_by: "po",
              unblocks: ["TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST","W5-FU-CTG-REFINE-96e36139"],
              deploy_gate: "CODE phase (classifier fix + unit fixtures) is bun-test-verifiable NOW; DoD (CTG total_assets unfreezes from 0, live) needs the mcp-server rebuild that is currently user-approval-gated — batches with FIX-BCTC-ENRICHER-STUCK-BACKLOG into one rebuild.",
              po_promoted_note: ("[po " + $now + "] Root of stuck W5 chain. Refined markdown is correct (TONG TAI SAN CO=2,924,176,928 trieu) but the finalize BS section classifier lands 0 balance_sheet rows (VCB baseline 57), drops unit-0002 pages 4-5, mistags unit-0003. Direct-to-dev FIX (no BA/architect). Likely files: apps/mcp-server/src/application/utils/refinedMarkdownParser.ts (dirty in tree — Step-0a tree-hygiene owns adopt/revert) + finalizeBctcRefineTool.ts.") }
        ]
    else . end )

# ---- M2: W5-FU review -> BLOCKED on classifier (only while still REVIEW) ----
| .task_board.review |= map(
    if (type=="object" and .id=="W5-FU-CTG-REFINE-96e36139" and .status=="REVIEW")
    then . + { status: "BLOCKED",
               depends: ((.depends // []) + ["FIX-BCTC-BANK-BS-SECTION-CLASSIFIER"] | unique),
               blocked_on: "FIX-BCTC-BANK-BS-SECTION-CLASSIFIER — refine+reingest EXECUTED (56/56 DONE, 440 rows) but CTG total_assets still 0; root is the finalize BS section classifier, NOT a refine failure. Do NOT qa-gate until the classifier fix reflows balance_sheet rows.",
               po_reconciled_at: $now }
    else . end )

# ---- M3: TASK-W5 (already BLOCKED) — repoint blocker to classifier (marker-guarded) ----
| .task_board.review |= map(
    if (type=="object" and .id=="TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST" and (has("blocker_reconciled") | not))
    then . + { blocker_reconciled: true,
               depends: ((.depends // []) + ["FIX-BCTC-BANK-BS-SECTION-CLASSIFIER"] | unique),
               blocked_on: "FIX-BCTC-BANK-BS-SECTION-CLASSIFIER — the agentic-refine pass (prior blocker) is DONE; remaining blocker is the finalize BS section classifier dropping balance_sheet rows so CTG total_assets stays 0 (AC-10 unmet).",
               po_reconciled_at: $now }
    else . end )
