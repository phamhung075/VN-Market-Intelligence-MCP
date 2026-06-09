# po-S39 — C1129 architect REWRITE verdict accepted: flip FIX-CI-C1129-RESIDUAL-TRIAGE TODO->DONE
# + OPEN FIX-CI-C1129-CALIBRATION-TEST-REWRITE (TODO, dev-mcp-server), mirroring the C1134 template.
# Scope: active_sprints[24] (CI-RED-RECONCILE) .tasks ONLY — no whole-object rewrite.
# ci_absolute UNCHANGED (no rebaseline — bun-only metric, no bun change landed this cycle).
# Flow-doc pointer: docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-po.md § STEP po-S39.
# Usage: jq -f scripts/po-s39-c1129-triage-done-open-rewrite.jq orch-state.json > tmp
.task_board.active_sprints[24].tasks |= (
  # (1) flip TRIAGE task TODO->DONE with REWRITE resolution
  map(
    if .id == "FIX-CI-C1129-RESIDUAL-TRIAGE" then
      .status = "DONE"
      | .done_by = "po-S39"
      | .resolution = "REWRITE-GATED — architect REWRITE verdict accepted (brief docs/architecture-briefs/2026-06-09-ci-c1129-calibration-triage.md, commit bc5c560a, arch-S13); prod calibrationTools.ts CORRECT (pure SQLite, db-injection live, NOT HTTP-rewired); 10 fails = 1124-transport-hang signature; dev to rewrite test harness, no prod change"
      | .done_at = "2026-06-09T12:39:26Z"
      | .dj_gate_1 = "#po-S39"
    else . end
  )
  # (2) OPEN new dev-fix task, mirroring the C1134 template
  + [{
      "id": "FIX-CI-C1129-CALIBRATION-TEST-REWRITE",
      "title": "Rewrite 1129-calibration-tools.test.ts to direct-handler invocation per brief 2026-06-09-ci-c1129-calibration-triage.md (1124-transport-hang signature, 5 it() x 2 = 10 native fails; prod calibrationTools.ts CORRECT — test-only REWRITE, NOT remove)",
      "type": "FIX",
      "owner": "dev-mcp-server",
      "depends": [],
      "status": "TODO",
      "size": "S",
      "zone": "apps/mcp-server/src/__tests__/",
      "priority": "high",
      "sprint": "CI-RED-RECONCILE",
      "baseline_pass": "11688",
      "baseline_absolute": "73 (sha 8916675a, run 27205559638, job 80320331863)",
      "brief": "docs/architecture-briefs/2026-06-09-ci-c1129-calibration-triage.md",
      "reference_template": "1134-get-foreign-flow-tool.test.ts",
      "victims": "Task 1129 (10 fails, 5 it())",
      "signature": "1124-transport-hang",
      "scope": "ONLY apps/mcp-server/src/__tests__/1129-calibration-tools.test.ts",
      "acceptance": "all 5 it() pass via direct handler, zero new mock.module(), tsc clean, gate target Task 1129 (fail) 10->0",
      "gate": "Task 1129 native fail count 10 -> 0 in CI (gate vs standing 73 band; ci_absolute tracks bun only). NO new mock.module() (C5-cure ABSOLUTE). tsc --noEmit clean.",
      "created_at": "2026-06-09T12:39:26Z",
      "created_by": "po-S39",
      "note": "[po-S39 DJ-GATE-1] Architect REWRITE verdict accepted (FIX-CI-C1129-RESIDUAL-TRIAGE -> DONE; brief docs/architecture-briefs/2026-06-09-ci-c1129-calibration-triage.md, commit bc5c560a, arch-S13). REWRITE (prod correct, test stale) — NOT remove. Prod: apps/mcp-server/src/interface/mcp/tools/macro/calibrationTools.ts:276 registerCalibrationTools(server, db?) — pure SQLite, db-injection arg live, NOT HTTP-rewired; deleted-seam + prod-bug signatures both RULED OUT. Victim: 1129-calibration-tools.test.ts — 5 it() x ~5003ms transport stall x 2 (test timeout + afterEach stalled client) = 10 fails. CURE: replace InMemoryTransport+Client.callTool() harness with direct (_testServer as unknown as RegisteredToolsServer)._registeredTools[\"get_calibration_report\"].handler(args); module-level _testServer + _testDb; beforeEach builds in-memory DB + seeds + registerCalibrationTools(_testServer, _testDb); afterEach cleanup; read result.content[0]?.text. buildInMemoryDb() must inline the calibration_snapshots DDL (12 cols, IF NOT EXISTS) from schema-system.ts:213 — NO initDatabase() call (Contract-B pattern). ZOD-BYPASS: NONE required — all 5 ACs port verbatim (date is z.string().optional(), no .default/.coerce). C5-cure: zero new mock.module(); proven sibling template = 1134-get-foreign-flow-tool.test.ts (CI-green, commit 8916675a). Dev scope: ONE FILE ONLY. Dev COMMITS with explicit pathspec; ROUTER pushes + gates vs the 73 band."
  }]
)
