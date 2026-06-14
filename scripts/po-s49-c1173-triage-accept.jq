# po-S49: accept arch-S18 Task 1173 triage (REWRITE verdict) + open the scoped fix task.
# - FIX-CI-C1173-TRIAGE (SPIKE, architect): TODO -> DONE (architect deliverable accepted).
# - += FIX-CI-C1173-REWRITE-TRANSPORT (FIX, dev-mcp-server, TODO) carrying arch-S18 REWRITE spec.
# - ci_absolute UNCHANGED (native_fail 62, sha c017289d) — NOT touched.
# Scoped jq on active_sprints[24] + task_board _updated_* ONLY. No whole-object rewrite.
# signal_queue + _schema + _ssot preserved.

# 1. Flip the TRIAGE SPIKE TODO -> DONE
(.task_board.active_sprints[24].tasks[] | select(.id == "FIX-CI-C1173-TRIAGE")) |= (
  .status = "DONE"
  | .closed_at = "2026-06-09T15:37:20Z"
  | .closed_by = "po-S49"
  | .resolution = "ARCHITECT-DELIVERABLE-ACCEPTED"
  | .triage_verdict = "arch-S18 (brief docs/architecture-briefs/2026-06-09-ci-c1173-triage.md, commit ac7e0f4a, router-verified docs-only pushed): Task 1173 = 3 UNIQUE failing tests (6 CI log-lines = 3x2 runtime+summary double-count), all in describe blocks AC-4 + AC-5 of 1173-calibration-label-integration.test.ts. Classification = GENUINE assertion-logic, NOT contamination (ZERO mock.module in the file; failures are ~5000ms beforeEach/afterEach hook TIMEOUTS, not instant SyntaxErrors — the InMemoryTransport-hang signature). Root cause = test makeMcpSetup() uses MCP InMemoryTransport client.connect/callTool/close which STALLS on Bun 1.3.13/Ubuntu CI (the afterEach client.close() itself times out). Prod handleGetLabelAccuracyReport(db, since_days?) (calibrationTools.ts:235) is CORRECT + exported; all AC-4/AC-5 assertion strings match prod exactly; test NOT obsolete (no protecting sibling covers get_label_accuracy_report output format). Fix lever = REWRITE (not REMOVE, not prod-FIX)."
  | .actual_result = "Triage delivered + accepted. Verdict REWRITE (transport-hang). Scoped fix opened: FIX-CI-C1173-REWRITE-TRANSPORT (dev-mcp-server)."
)

# 2. Append the scoped REWRITE fix task
| .task_board.active_sprints[24].tasks += [{
    "id": "FIX-CI-C1173-REWRITE-TRANSPORT",
    "type": "FIX",
    "owner": "dev-mcp-server",
    "status": "TODO",
    "size": "S",
    "zone": "apps/mcp-server/src/__tests__/",
    "priority": "high",
    "sprint": "CI-RED-RECONCILE",
    "depends": [],
    "title": "REWRITE Task 1173 AC-4 + AC-5 describe blocks to call handleGetLabelAccuracyReport() directly (drop the InMemoryTransport MCP-client harness that hangs on CI)",
    "root_cause": "GENUINE transport-hang (arch-S18, NOT contamination). The 3 unique failing tests in AC-4 + AC-5 of 1173-calibration-label-integration.test.ts use makeMcpSetup() which builds InMemoryTransport + Client; client.connect/callTool/close STALLS on Bun 1.3.13/Ubuntu single-process CI, so the afterEach client.close() hook itself times out at ~5000ms (the canonical hook-timeout fingerprint). Prod handleGetLabelAccuracyReport(db, since_days?) (calibrationTools.ts:235) is exported + correct; all AC-4/AC-5 assertion strings match prod. Test is NOT obsolete (unique MCP-layer coverage; 1129 covers only get_calibration_report).",
    "scope": "REWRITE ONLY the AC-4 + AC-5 describe blocks of apps/mcp-server/src/__tests__/1173-calibration-label-integration.test.ts. REMOVE the MCP-client harness: drop makeMcpSetup() (the InMemoryTransport+Client builder), drop imports of Client (@modelcontextprotocol/sdk/client/index.js), InMemoryTransport (@modelcontextprotocol/sdk/inMemory.js), McpServer, registerCalibrationTools, and the extractText() helper, drop the `let client` declarations + the beforeEach calling makeMcpSetup() + the afterEach(async()=>{ await client?.close(); closeDb(); }) in BOTH AC-4 and AC-5 blocks. ADD: import handleGetLabelAccuracyReport from ../interface/mcp/tools/macro/calibrationTools.js; beforeEach(async()=>{ closeDb(); await initDatabase(); }); afterEach(()=>{ closeDb(); }). REPLACE client.callTool({name:'get_label_accuracy_report', arguments:{ since_days: N }}) with `await handleGetLabelAccuracyReport(getDb(), N)`; replace extractText(result) with result.content.map((c)=>c.text).join('\\n'); replace the result.isError check with a presence-of-error-prefix check on the text (the exported fn returns { content:[{type,text}] }, no isError). KEEP IDENTICAL ASSERTIONS (AC-4: 'Label Accuracy Report','90 ngay gan nhat','73.8%','64.3%','2 agents','56 tin da review'; AC-5: 'Khong co tin nhan da review trong 90 ngay qua','30 ngay qua'). since_days passed as explicit ints (90, 30) — no Zod coercion needed on the direct path.",
    "template_reference": "apps/mcp-server/src/__tests__/1129-calibration-tools.test.ts (proven CI-green in run 27216305674, all 5 tests pass). 1129 uses _registeredTools[name].handler(args); for 1173 AC-4/AC-5 the even simpler path is the exported handleGetLabelAccuracyReport() direct call (output-format coverage, not wire protocol).",
    "c5_cure_absolute": "ZERO new mock.module() call. Pure SQLite import chain. No ESM stub pollution. No prod change (calibrationTools.ts is correct). No change to the 13 passing AC-1/AC-2/AC-3/AC-6/AC-7/AC-8/AC-9 tests. tsc clean.",
    "files": ["apps/mcp-server/src/__tests__/1173-calibration-label-integration.test.ts"],
    "primary_gate_proof": "Task 1173 per-victim exact-prefix (fail) 6 -> 0 (3 unique tests) on the next full-CI run, measured by the jitter-robust full-CI per-victim exact-prefix tally for 'Task 1173' (NOT the jitter-prone absolute, NOT a 2-file local repro).",
    "spec_brief": "docs/architecture-briefs/2026-06-09-ci-c1173-triage.md",
    "baseline_pass": "62 (native_fail, sha c017289d, run 27216305674, job 80358657573)",
    "created_at": "2026-06-09T15:37:20Z",
    "created_by": "po-S49"
  }]

# 3. Stamp task_board _updated_* (ci_absolute UNCHANGED)
| .task_board._updated_at = "2026-06-09T15:37:20Z"
| .task_board._updated_by = "po-S49"
