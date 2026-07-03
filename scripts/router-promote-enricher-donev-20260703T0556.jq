# Router board promote: FIX-BCTC-ENRICHER-STUCK-BACKLOG review[] -> done_verified[] on qa PASS.
# qa aaa42b93ee42522c4 RAW-verified PASS: commit 14b955802 scoped to exactly its 3 artifacts (qa notebook/journal/report),
# docker-exec DB queries all read-only (SELECT, NO-WRITE-SQL), git add explicit-paths (no dirty-tree sweep), forbidden CLEAN.
# qa independently reproduced deploy (image a169f5e2 healthy RC=0) + live-DB row advancement + idempotency + fresh tests (8 pass, tsc 0).
# Router owns the review->done_verified flip per the dispatch contract (qa was told NOT to touch the board).
# HEAD keeps active_task_id=SPIKE-BCTC-CTG-BS-REALDATA-ROOT (architect a981c9f23f4a667d1 STILL IN FLIGHT) — NOT idle.
# Same orch-state write also carries the already-present system-auditor signal row (sau-t1-2026-07-03T05:56:45Z) into the commit.
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute — router promote on green verify).
# Usage: jq --arg now "$NOW" -f scripts/router-promote-enricher-donev-20260703T0556.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.review | map(select(.id=="FIX-BCTC-ENRICHER-STUCK-BACKLOG"))[0]) as $e
| if $e == null then error("enricher not in review[] — refuse to promote")
  elif ((.task_board.done_verified | map(select(.id=="FIX-BCTC-ENRICHER-STUCK-BACKLOG")) | length) > 0) then error("enricher already in done_verified[] — refuse dup")
  else . end
| .task_board.done_verified += [
    ($e + {
      status: "DONE_VERIFIED",
      promoted_at: $now,
      promoted_by: "router",
      qa_verdict: "PASS",
      qa_agent: "aaa42b93ee42522c4",
      qa_commit: "14b955802",
      qa_report: "reports/TASK_REPORT_FIX-BCTC-ENRICHER-STUCK-BACKLOG.md",
      qa_dod_note: "[router 2026-07-03T05:56Z] qa final DoD PASS, transcript RAW-verified: commit 14b955802 scoped to exactly 3 artifacts, docker-exec DB queries all read-only, git add explicit-paths (no dirty-tree sweep). qa independently reproduced: deploy image a169f5e2 healthy RC=0; root-cause fix LIVE (row 255868 ACV attempts 0->5 + last_attempt stamping across 3+ */15 cycles; 255882 HVN 2nd proof); idempotency (migration predicate 0 rows); 18/21 rows now carry staticfile.hsx.vn source_url; fresh tests 8 pass + tsc exit 0. NON-BLOCKING FOLLOW-UP (qa-flagged, out of scope for this fix): enricher row 255871 (CTG) still attempts=0/last_attempt=NULL after 3 cycles while 20 siblings advanced — resurface via auditor if it persists; possibly adjacent to the CTG BCTC-pipeline SPIKE (different layer: enricher fetch vs BS parse)."
    })
  ]
| .task_board.review |= map(select(.id != "FIX-BCTC-ENRICHER-STUCK-BACKLOG"))
| .head += {
    updated_at: $now,
    updated_by: "dev-team",
    note: "FIX-BCTC-ENRICHER-STUCK-BACKLOG promoted review->done_verified (qa PASS, commit 14b955802, RAW-verified). SPIKE-BCTC-CTG-BS-REALDATA-ROOT still in_progress (architect in flight) — head remains active on it. System-auditor signal sau-t1-2026-07-03T05:56:45Z (rag-service RestartCount=294 WARN) queued for drain. BCTC-HNX-SSL-HARDEN awaits manual deploy."
  }
