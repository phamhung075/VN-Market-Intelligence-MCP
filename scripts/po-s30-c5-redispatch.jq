# po-S30 — CI-RED-RECONCILE board write (run via: jq -f scripts/po-s30-c5-redispatch.jq docs/data/orch/orch-state.json > tmp)
# 1. SPIKE-CI-C5-CONTAM-SAFE-RESTRATEGY: REVIEW -> DONE
# 2. FIX-CI-C5-UNMOCKED-HTTP-FETCHES: REWORK -> TODO, owner architect->dev-mcp-server, clear blocked_by/depends, rewrite note
# 3. FIX-CI-C6-SSOT-WATCHLIST-SECTOR-DRIFT: UNTOUCHED (REVIEW)
# 4. ci_absolute: UNCHANGED (135 / sha 3663bd12)
# Single status key per task; no whole-object rewrite of other rows.

.task_board.active_sprints |= map(
  if .id == "CI-RED-RECONCILE" then
    .tasks |= map(
      if .id == "SPIKE-CI-C5-CONTAM-SAFE-RESTRATEGY" then
        .status = "DONE"
        | .done_by = "po-S30"
        | .resolution = "DONE"
      elif .id == "FIX-CI-C5-UNMOCKED-HTTP-FETCHES" then
        .status = "TODO"
        | .owner = "dev-mcp-server"
        | .blocked_by = []
        | .depends = []
        | .dispatched_at = "2026-06-09T09:50:33Z"
        | .dispatched_by = "po-S30"
        | .note = ("[po-S30 RE-DISPATCH 2026-06-09T09:50:33Z] SPIKE-CI-C5-CONTAM-SAFE-RESTRATEGY now DONE -> C5 unblocked, owner architect->dev-mcp-server, blocked_by/depends cleared. SPEC (architect DI-seam pattern (b), brief: docs/architecture-briefs/2026-06-09-spike-ci-c5-contam-safe-restrategy.md): ROOT CAUSE = 083-tool-analysis.test.ts (lines 15-26) + 123-integration-mcp.test.ts (lines 35-40) install file-top mock.module() stubs for sbv.js/yahooFinance.js (+ a DEAD retriever.js mock in 123) that poison Bun process-scoped ESM cache for ALL downstream files; victims 028/025/1423a/1487 already use the CORRECT DI seam (httpClient param) and fail ONLY from upstream poisoning. FIX: (1) REMOVE the file-top mock.module() calls from 083 (lines 15-26) and 123 (lines 35-40, incl the dead retriever.js stub); (2) pass _testCommodityFetcher/_testSbvFetcher/_testRagRetriever via callTool args for the run_impact_chain tests in 083/123; (3) ddd-1b AND all 4 victim files (028/025/1423a/1487) get NO CHANGE; (4) ONE conditional PROD seam in apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts run_impact_chain handler — add _testCommodityFetcher/_testSbvFetcher/_testRagRetriever optional Zod args (same _test* pattern as _testHoseClient in get_market_snapshot; zero prod-path behavior change) IF not already present. HARD CONSTRAINT: NO new file-top/module-scope mock.module() ANYWHERE (that vector demonstrably leaks across run order — falsified at 22470e44, +10 regression). VERIFICATION GATE: native fail+error must DROP below the standing 135 absolute (sha 3663bd12; band ~135 +/-3, real floor ~132 — aim ~113 with 22 victims cleared) AND each named victim test (028/025/1423a/1487) must flip fail->pass INDIVIDUALLY in the CI log (per-victim verification, not global absolute alone). baseline_pass stays 135 (band +/-3). Router owns push + the CI gate. | PRIOR: " + (.note // ""))
      else . end
    )
  else . end
)
