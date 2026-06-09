# po-S33: SPIKE-CI-C1-MACRO-INJECT-SEAM REVIEW->DONE + RE-PROFILE-CI-241-RESIDUAL REVIEW->DONE(superseded)
#         + OPEN FIX-CI-C1-MACRO-INJECT-SEAM-TESTS (TODO, dev-mcp-server) per architect-confirmed fetch-mock DI-seam.
# Pointer: docs/agents/po/flow/main.md (board-write step). Reusable jq transform, persisted per Script Persistence policy.
# Invoke: jq -f scripts/po-s33-c1-spike-done-dispatch.jq docs/data/orch/orch-state.json > tmp
.task_board.active_sprints[24].tasks |= (
  map(
    if .id == "SPIKE-CI-C1-MACRO-INJECT-SEAM" then
      .status = "DONE"
      | .done_by = "po-S33"
      | .resolution = "DONE"
      | .done_at = $TS
      | .dj_gate_1 = "sprint-CI-RED-RECONCILE-po.md#po-S33"
    elif .id == "RE-PROFILE-CI-241-RESIDUAL" then
      .status = "DONE"
      | .done_by = "po-S33"
      | .resolution = "SUPERSEDED"
      | .done_at = $TS
      | .dj_gate_1 = "sprint-CI-RED-RECONCILE-po.md#po-S33"
      | .note = (.note + " | [po-S33 SUPERSEDED] The stale 241/91afe344 absolute is retired — re-profiling already advanced via the C1 spike + 1423e gate to the live 91 floor (sha 9ed78225, run 27200448050). The 241 taxonomy is no longer the basis for attack ranking; C1 (71/91) is now adjudicated and dispatched as FIX-CI-C1-MACRO-INJECT-SEAM-TESTS. Closed as SUPERSEDED, not re-run.")
    else . end
  )
  + [{
      id: "FIX-CI-C1-MACRO-INJECT-SEAM-TESTS",
      type: "FIX",
      owner: "dev-mcp-server",
      status: "TODO",
      size: "M",
      zone: "apps/mcp-server/src/__tests__/",
      priority: "high",
      sprint: "CI-RED-RECONCILE",
      depends: [],
      baseline_pass: "91 native fail+error absolute (sha 9ed78225, run 27200448050, job 80302822813) — C1 is ~71 of the 91; gate = native fail+error must DROP below 91 (band +/-3, aim ~20-40 residual) AND each of the 5 named test files must flip its macro tests fail->pass individually in the CI log",
      created_at: $TS,
      created_by: "po-S33",
      dispatched_by: "po-S33",
      title: "C1 MACRO-INJECT-SEAM test rewrite (~71 fails, dominant lever). Architect VERDICT (A)+partial(B) CONFIRMED (brief docs/architecture-briefs/2026-06-09-spike-ci-c1-macro-inject-seam.md): 98df0f43 (2026-05-23, P2-B1 HTTP rewire) INTENTIONALLY removed the _testCommodityClient/_testSbvClient/_testDinhGiaInputs injection seams; the get_macro_snapshot tool is now a thin HTTP proxy to the Go macro-indicators service (port 5004) emitting {source_tier,text:JSON,fetchedAt} with NO human-readable section headers. Production is CORRECT — no prod change required for CI. Fix = test-only rewrite across 5 files.",
      note: "ARCHITECT-CONFIRMED APPROACH (mandatory): (1) ~40 tests use dead _test* injection params -> rewrite to mock globalThis.fetch in beforeAll/beforeEach returning a MacroSnapshotResponse-shaped JSON, restore in afterAll (EXACT template = 1881a-source-tier.test.ts lines 92-135, already PASSING). (2) ~31 tests assert section headers ([Commodity Prices]/[SBV Central Bank Rates]/=== Macro Snapshot ===/[Macro Signal Summary]/[Dinh Gia]) the TS tool no longer emits -> rewrite assertions to the {source_tier,text:JSON,fetchedAt} wrapper + inner JSON field checks (oilUsd>0, signals.carry.regime, signals.yield.label). 5 FILES (test-only zone): 089-tool-macro.test.ts; 1423d-thien-thoi-snapshot.test.ts (integration TT-07..TT-10 ONLY — DO NOT touch pure formatThienThoi units TT-01..TT-06); 1423f-deposit-rate-display.test.ts (all 3); 1570c-dinh-gia-snapshot.test.ts (integration ONLY — DO NOT touch formatDinhGia units); 1903a-dispatch-regression.test.ts (Suite B GMS-REG-02..04 ONLY — keep GMS-REG-03 negative-space + GMS-REG-04 length guards). DO-NOT-MODIFY: 1881a-source-tier.test.ts (reference, 20/0). NO PROD CODE CHANGE. HARD C5-CURE CONSTRAINT (ABSOLUTE): NO new file-top/module-scope mock.module() anywhere — DI via scoped globalThis.fetch override + restore ONLY (re-spreading ESM-cache contamination is forbidden). Sub-task C (Go human-readable formatter) is DEFERRED — NOT part of this CI fix. Recurring-bug guard (architect): after fix, grep -r '_testCommodityClient|_testSbvClient|_testDinhGia' src/__tests__/ MUST return zero. Commit with explicit pathspec; ROUTER pushes + gates."
    }]
)
