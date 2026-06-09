# po-S35 — CI-RED-RECONCILE board write (atomic, single jq pass)
# Pointer: docs/agents/po/flow/main.md (PO board-write under commit-mutex)
# Args: $now (ISO-8601 UTC), $tag (po-S35), $brief (architect brief path)
# Effects (all on active_sprints[24] == CI-RED-RECONCILE):
#   1. FIX-CI-C1124-RESIDUAL-TRIAGE   REVIEW -> DONE  (architect REWRITE verdict accepted)
#   2. FIX-MACRO-GO-DIRECTIVE         REVIEW -> DONE  (CI-VERIFIED-GREEN x3 runs)
#   3. FIX-TA-GOLANGCI-CONFIG-V2      REVIEW -> DONE  (CI-VERIFIED-GREEN x3 runs)
#   4. + new task FIX-CI-C1124-EVIDENCE-TESTS-REWRITE (TODO, dev-mcp-server)
#   ci_absolute UNTOUCHED. signal_queue / all other objects preserved (scoped map).

.task_board.active_sprints[24].tasks |= (
  map(
    if .id == "FIX-CI-C1124-RESIDUAL-TRIAGE" then
      .status = "DONE"
      | .done_by = $tag
      | .done_at = $now
      | .closed_at = $now
      | .resolution = "REWRITE verdict accepted (architect, commit f0900f74) — prod get_evidence_summary/create_prediction_claim CORRECT (all 4 evidence tables in initSystemTables, no seam deleted); test-only fix. Dispatched FIX-CI-C1124-EVIDENCE-TESTS-REWRITE to dev-mcp-server."
      | .dj_gate_1 = ("docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-po.md#" + $tag)
    elif .id == "FIX-MACRO-GO-DIRECTIVE" then
      .status = "DONE"
      | .done_by = $tag
      | .done_at = $now
      | .closed_at = $now
      | .resolution = "CI-VERIFIED-GREEN — Macro Indicators Go Lint job = success across 3 CI runs (946d72a/e5e6585/7640616; runs 27201263379/27201056956/27200579594). go.mod go 1.25.0->1.22 landed. Per router signal CI-GO-PY-LINT-ALL-GREEN (39ee3464)."
      | .gate_result = "CI-GO-PY-LINT-ALL-GREEN-39ee3464"
      | .dj_gate_1 = ("docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-po.md#" + $tag)
    elif .id == "FIX-TA-GOLANGCI-CONFIG-V2" then
      .status = "DONE"
      | .done_by = $tag
      | .done_at = $now
      | .closed_at = $now
      | .resolution = "CI-VERIFIED-GREEN — go-lint (technical-analysis) job = success across 3 CI runs (946d72a/e5e6585/7640616). version:\"2\" config landed; prior FIX-TA-SANDBOX-DEPGUARD blocker no longer on board and job no longer exits 1. Per router signal CI-GO-PY-LINT-ALL-GREEN (39ee3464)."
      | .gate_result = "CI-GO-PY-LINT-ALL-GREEN-39ee3464"
      | .dj_gate_1 = ("docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-po.md#" + $tag)
    else . end
  )
  + [ {
      "id": "FIX-CI-C1124-EVIDENCE-TESTS-REWRITE",
      "title": "Rewrite 1124-evidence-tools-phase-bc.test.ts: replace InMemoryTransport+Client.callTool() (hangs on Bun 1.3.13/Ubuntu CI -> 12 it() x 2 = 24 native 5000ms timeouts) with _registeredTools[name].handler direct invocation (proven CI-green by sibling 1117-evidence-tools.test.ts, same prod module). Prod is CORRECT — test-only fix.",
      "type": "FIX",
      "owner": "dev-mcp-server",
      "depends": [],
      "status": "TODO",
      "size": "M",
      "zone": "apps/mcp-server/src/__tests__/",
      "priority": "high",
      "sprint": "CI-RED-RECONCILE",
      "baseline_pass": "91",
      "brief": $brief,
      "scope": "ONLY apps/mcp-server/src/__tests__/1124-evidence-tools-phase-bc.test.ts",
      "gate": "Task 1124 native fail count 24 -> 0 in CI (gate vs standing 91 band +/-3). NO new mock.module(). tsc --noEmit clean.",
      "created_at": $now,
      "created_by": $tag,
      "note": "[" + $tag + " DJ-GATE-1 " + $now + "] Architect REWRITE verdict accepted (FIX-CI-C1124-RESIDUAL-TRIAGE -> DONE). Prod get_evidence_summary/create_prediction_claim correct: all 4 evidence tables (evidence_scores/evidence_fragments/evidence_likelihood_ratios/prediction_claims) created by initSystemTables in initDatabase (schema-system.ts lines 138/156/172/187); no prod seam deleted. Root cause: InMemoryTransport.createLinkedPair()+Client.callTool() message loop stalls on CI Linux runner (Bun 1.3.13/Ubuntu) -> every it() times out at 5000ms; 12 it() x 2 (test timeout + afterEach stalled-client close) = 24 native fails. Fix = bypass transport entirely, call server._registeredTools[name].handler(args) directly (preferred 1881a pattern: beforeEach initDatabase + module-level _testDb/_testServer; afterEach closeDb). Remove Client + InMemoryTransport imports + _currentClient. Seed helpers unchanged. HARD: NO new mock.module() (C5-cure ABSOLUTE — import chain is pure SQLite, zero mock needed). Acceptance: Task 1124 24->0 native fails in CI, tsc clean. Dev COMMITS with explicit pathspec; ROUTER pushes + gates vs 91 band. Dev scope: ONE FILE ONLY."
    } ]
)
