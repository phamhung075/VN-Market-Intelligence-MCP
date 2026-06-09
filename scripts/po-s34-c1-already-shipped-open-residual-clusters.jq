# po-S34: C1 ALREADY-SHIPPED adjudication + open residual clusters (1124/1134/1129)
# Pointer: docs/agents/po/flow/main.md (PO board-write under commit-mutex)
# Input : docs/data/orch/orch-state.json (_schema v3 _ssot true)
# Action: (1) FIX-CI-C1-MACRO-INJECT-SEAM-TESTS TODO->DONE (ALREADY-SHIPPED by 1d78... see note)
#         (2) ci_absolute UNCHANGED (no rebaseline — C1 already counted inside 91)
#         (3) +3 NEW clusters: 1124 (24, DOMINANT, architect-first), 1134 (12), 1129 (10)
# Args   : --arg ts <UTC> --arg tag <po-S##>
# Scoped : touches ONLY active_sprints[24].tasks — signal_queue + everything else preserved verbatim.

(.task_board.active_sprints[24].tasks) |= (
  ( map(
      if .id == "FIX-CI-C1-MACRO-INJECT-SEAM-TESTS"
      then . + {
        status: "DONE",
        done_by: $tag,
        done_at: $ts,
        resolution: "ALREADY-SHIPPED by 1d83a5ff; six victim prefixes 0-fail in 91-run; duplicate task object",
        gate_result: "CI-C1-ALREADY-SHIPPED-9ed78225",
        dj_gate_1: "sprint-CI-RED-RECONCILE-po.md#" + $tag
      }
      else . end
    ) )
  + [
    {
      id: "FIX-CI-C1124-RESIDUAL-TRIAGE",
      title: "Task 1124 residual cluster (24 fails) — NEW DOMINANT LEVER, architect-first prod-vs-test triage",
      type: "FIX",
      owner: "architect",
      status: "TODO",
      size: "M",
      zone: "apps/mcp-server/src/__tests__/",
      priority: "high",
      sprint: "CI-RED-RECONCILE",
      depends: [],
      root_cause: "UNKNOWN",
      baseline_pass: "91",
      created_at: $ts,
      created_by: $tag,
      note: "DOMINANT residual lever in the 91-run (Task 1124 = 24 fails, raw-tallied; supersedes the STALE ~71/91 C1 premise of po-S33). Architect-first prod-vs-test triage REQUIRED per /goal REMOVE-if-obsolete: confirm whether prod changed/was deleted BEFORE any fix — REWRITE if prod-correct+test-stale / FIX if prod-broken / REMOVE if test-obsolete. C5-cure ABSOLUTE: no new file-top/module-scope mock.module(). Gate later vs the standing 91 band (+/-3)."
    },
    {
      id: "FIX-CI-C1134-RESIDUAL-TRIAGE",
      title: "Task 1134 residual cluster (12 fails) — NEW, architect-first prod-vs-test triage",
      type: "FIX",
      owner: "architect",
      status: "TODO",
      size: "S",
      zone: "apps/mcp-server/src/__tests__/",
      priority: "medium",
      sprint: "CI-RED-RECONCILE",
      depends: [],
      root_cause: "UNKNOWN",
      baseline_pass: "91",
      created_at: $ts,
      created_by: $tag,
      note: "NEW residual cluster (Task 1134 = 12 fails in the 91-run). Stub — architect-first prod-vs-test triage before any fix. Sequence after the dominant 1124 lever. C5-cure ABSOLUTE."
    },
    {
      id: "FIX-CI-C1129-RESIDUAL-TRIAGE",
      title: "Task 1129 residual cluster (10 fails) — NEW, architect-first prod-vs-test triage",
      type: "FIX",
      owner: "architect",
      status: "TODO",
      size: "S",
      zone: "apps/mcp-server/src/__tests__/",
      priority: "medium",
      sprint: "CI-RED-RECONCILE",
      depends: [],
      root_cause: "UNKNOWN",
      baseline_pass: "91",
      created_at: $ts,
      created_by: $tag,
      note: "NEW residual cluster (Task 1129 = 10 fails in the 91-run). Stub — architect-first prod-vs-test triage before any fix. Sequence after 1124. C5-cure ABSOLUTE. (1407b/1328e/1792/1352a already in C7 scope; C8 already tracked — NOT duplicated.)"
    }
  ]
)
