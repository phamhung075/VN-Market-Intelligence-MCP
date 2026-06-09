# po-S37 — CI-RED-RECONCILE: accept architect C1134 REWRITE verdict + open dev rewrite task.
# Scoped to active_sprints[24] (CI-RED-RECONCILE) ONLY. No whole-object rewrite.
# (1) FIX-CI-C1134-RESIDUAL-TRIAGE: REVIEW -> DONE  (resolution REWRITE-GATED — dev to rewrite test harness, no prod change)
# (2) OPEN FIX-CI-C1134-FOREIGN-FLOW-TEST-REWRITE: TODO / dev-mcp-server
# ci_absolute UNTOUCHED (bun-only metric; no bun change this write).
.task_board.active_sprints[24].tasks |= (
  ( map(
      if .id == "FIX-CI-C1134-RESIDUAL-TRIAGE" then
        .status = "DONE"
        | .done_by = "po-S37"
        | .resolution = "REWRITE-GATED — dev to rewrite test harness, no prod change"
        | .done_at = $now
        | .dj_gate_1 = "#po-S37"
        | .done_evidence = "Architect prod-vs-test triage (brief 2026-06-09-ci-c1134-foreign-flow-triage.md, commit 16e11df8, router-verified + pushed HEAD=ee714e6c) returned REWRITE: prod get_foreign_flow (foreignFlowTools.ts) is CORRECT — pure SQLite, db? injection live (lines 132-135), _testFallback seam live (line 165), NO HTTP-proxy rewire, NO deleted seam. All 12 fails = 1124-transport-hang signature (InMemoryTransport+Client.callTool() async-loop stall on Bun 1.3.13/Ubuntu; 6 it() x 2 = 12). No prod bug. Dispatched FIX-CI-C1134-FOREIGN-FLOW-TEST-REWRITE to dev-mcp-server."
      else . end
    )
  ) + [
    {
      "id": "FIX-CI-C1134-FOREIGN-FLOW-TEST-REWRITE",
      "title": "Rewrite 1134-get-foreign-flow-tool.test.ts: replace buildConnectedPair()+client.callTool() InMemoryTransport harness (1124-transport-hang signature — stalls on Bun 1.3.13/Ubuntu CI -> 6 it() x 2 = 12 native fails) with _testServer._registeredTools[\"get_foreign_flow\"].handler(args) direct invocation. Prod is CORRECT — test-only REWRITE (NOT remove).",
      "type": "FIX",
      "owner": "dev-mcp-server",
      "depends": [],
      "status": "TODO",
      "size": "S",
      "zone": "apps/mcp-server/src/__tests__/",
      "priority": "high",
      "sprint": "CI-RED-RECONCILE",
      "baseline_pass": "91",
      "brief": "docs/architecture-briefs/2026-06-09-ci-c1134-foreign-flow-triage.md",
      "scope": "ONLY apps/mcp-server/src/__tests__/1134-get-foreign-flow-tool.test.ts",
      "gate": "Task 1134 native fail count 12 -> 0 in CI (gate vs standing 79 band; ci_absolute tracks bun only). NO new mock.module() (C5-cure ABSOLUTE). tsc --noEmit clean.",
      "created_at": $now,
      "created_by": "po-S37",
      "note": "[po-S37 DJ-GATE-1] Architect REWRITE verdict accepted (FIX-CI-C1134-RESIDUAL-TRIAGE -> DONE; brief docs/architecture-briefs/2026-06-09-ci-c1134-foreign-flow-triage.md). This is a REWRITE (prod correct, test stale) per /goal — NOT a remove. Root cause = 1124-transport-hang signature (IDENTICAL to the just-cured Task 1124): 1134-get-foreign-flow-tool.test.ts uses buildConnectedPair() (InMemoryTransport + Client.connect pair) + client.callTool() with NO afterEach cleanup; InMemoryTransport message loop stalls in CI (Bun 1.3.13/Ubuntu single-process) -> 6 it() x 2 native fails = 12. Prod get_foreign_flow is CORRECT: pure SQLite, imports analyzeForeignFlow (domain) + getForeignFlowHistory (infra) — NO fetch/HTTP/baseUrl; the db? injection arg in registerForeignFlowTools(server, db?) (lines 132-135) ALREADY exists and is used correctly by the test on every call; the _testFallback seam (line 165) is live, NOT deleted; NO HTTP-proxy rewire. DI TEMPLATE (architect-prescribed): remove InMemoryTransport + Client imports + buildConnectedPair(); add module-level _testServer + _testDb set in beforeEach (registerForeignFlowTools(_testServer, _testDb)); replace client.callTool({name,arguments}) with await _testServer._registeredTools[\"get_foreign_flow\"].handler(args). buildInMemoryDb() helper + seed helpers unchanged (only daily_ohlcv queried on the injected-db path; no initDatabase needed). HARD: NO new mock.module() (C5-cure ABSOLUTE — import chain is pure SQLite, zero mock needed). AC-4 caveat (days=35 Zod validation): with direct-handler invocation, verify whether handler(args) returns {isError:true} OR throws on invalid input; if it throws, wrap in try/catch and assert on the thrown error message instead of the isError field — adapt the assertion accordingly. Proven CI-green pattern: 1117, 1124 (24->0), 089, 1881a. Acceptance: Task 1134 12->0 native fails in CI, tsc clean, NO new mock.module(). Dev COMMITS with explicit pathspec; ROUTER pushes + gates vs the 79 band. Dev scope: ONE FILE ONLY (apps/mcp-server/src/__tests__/1134-get-foreign-flow-tool.test.ts)."
    }
  ]
)
