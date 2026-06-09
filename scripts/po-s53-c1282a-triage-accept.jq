# po-S53 — Accept arch-S20 REWRITE-STALE verdict on Task 1282a (data-freshness prod-vs-test triage).
# Scoped: task_board.active_sprints[24].tasks ONLY (1 in-place flip + 1 append) + task_board._updated_* .
# Does NOT touch ci_absolute (holds 57), long_tail_triage_policy, signal_queue, _schema, _ssot, prod, or any .ts.
# Run: jq -f scripts/po-s53-c1282a-triage-accept.jq orch-state.json > tmp && validate && mv.

.task_board.active_sprints[24].tasks |= (
  # (1) Flip TRIAGE SPIKE TODO -> DONE
  map(
    if .id == "TRIAGE-CI-C1282a-DATA-FRESHNESS-PROD-VS-TEST" then
      .status = "DONE"
      | .closed_at = "2026-06-09T16:49:27Z"
      | .closed_by = "po-S53-DJ-GATE-1"
      | .resolution = "ARCHITECT-DELIVERABLE-ACCEPTED"
      | .triage_verdict = "arch-S20 (commit de0e9589, brief docs/architecture-briefs/2026-06-09-ci-c1282a-data-freshness-triage.md, DJ-GATE-1 arch-S20): TC-1 AND TC-2 BOTH = REWRITE-STALE, prod is RIGHT. Root cause: tests assume static getSlaThreshold(\"price\")=10min; prod uses dynamic MARKET_HOURS_ONLY_SOURCES logic (off-hours the threshold expands to minutesSinceLastWindowEnd+30). The 12-min-old fixture is NOT a breach off-hours -> hasBreach=false (correct). The '10 minutes' test comment is a stale fossil from the pre-MARKET_HOURS_ONLY_SOURCES era. REWRITE not REMOVE -> full coverage retained; siblings TC-3..TC-8 stay green; no gap. Projected CI delta 57 -> 55 (-2)."
      | .actual_result = "SPIKE resolved by arch-S20 REWRITE-STALE verdict (router-verified + pushed at de0e9589). Opened scoped dev fix FIX-CI-C1282a-DATA-FRESHNESS-REWRITE (dev-mcp-server, TODO) carrying the verbatim 2-file fix spec with file:line. ci_absolute held at 57 (no rebaseline at task-open)."
    else . end
  )
  # (2) Append the scoped dev FIX task with the embedded 2-file fix spec
  + [{
      "id": "FIX-CI-C1282a-DATA-FRESHNESS-REWRITE",
      "type": "BUG-FIX",
      "owner": "dev-mcp-server",
      "status": "TODO",
      "size": "S",
      "zone": "apps/mcp-server/",
      "priority": "high",
      "sprint": "CI-RED-RECONCILE",
      "depends": [],
      "build_standard": "not-applicable",
      "build_standard_reason": "in-zone edit, no new primitives (additive optional param + test call-site updates)",
      "baseline_pass": "57 (sha b106a1ec, run 27220454437)",
      "root_cause": "Tests assume static getSlaThreshold(\"price\")=10min; prod uses dynamic MARKET_HOURS_ONLY_SOURCES logic where off-hours the threshold expands to minutesSinceLastWindowEnd+30, so a 12-min-old fixture is NOT a breach off-hours (hasBreach=false, prod correct). The '10 minutes' test comment is a stale pre-MARKET_HOURS_ONLY_SOURCES fossil. Verdict = REWRITE-STALE (arch-S20), prod is RIGHT.",
      "fix_spec": {
        "lever": "REWRITE (freeze test clock to market hours so the 10min threshold applies; add optional now param to prod for testability) — NOT remove, NOT prod-logic-change",
        "files": [
          "apps/mcp-server/src/interface/mcp/tools/system/dataFreshnessTools.ts",
          "apps/mcp-server/src/__tests__/system-data-freshness.test.ts"
        ],
        "prod": {
          "file": "apps/mcp-server/src/interface/mcp/tools/system/dataFreshnessTools.ts",
          "fn": "detectDataFreshnessBreach",
          "site": "L79-87",
          "change": "Add optional `now?: Date` param to detectDataFreshnessBreach; inside: `const now_ = now ?? new Date()`; update the two internal references at L130 and L136 from `now` -> `now_`. Minimal additive interface extension, fully backward-compatible (callers without the arg get live time)."
        },
        "test": {
          "file": "apps/mcp-server/src/__tests__/system-data-freshness.test.ts",
          "change": "In beforeEach add `const frozenNow = new Date(\"2026-06-09T04:00:00Z\")`. Pass `detectDataFreshnessBreach(db, undefined, frozenNow)` at the 4 call-sites: TC-1 (L95), TC-2 (L117), TC-3, TC-4. At frozenNow isVnMarketHours=true -> threshold 10min -> 12>10 -> breach HIGH, so TC-1/TC-2 pass; the CRITICAL conditional safely skips (12<15)."
        }
      },
      "obsolete_test_discipline": "REWRITE not REMOVE -> full coverage retained. Sibling TC-3..TC-8 stay green. No coverage gap; prod logic unchanged (dynamic MARKET_HOURS_ONLY_SOURCES threshold is correct).",
      "primary_gate_proof": "Task 1282a per-victim exact-prefix (fail) tally 4 markers (2 unique tests: detectDataFreshnessBreach TC-1 HIGH-breach + TC-2 CRITICAL-breach) -> 0 on the next full-CI run (jitter-robust named tally, NOT the absolute, NOT a local 2-file repro). Projected absolute native_fail 57 -> 55 (-2).",
      "spec_brief": "docs/architecture-briefs/2026-06-09-ci-c1282a-data-freshness-triage.md",
      "created_at": "2026-06-09T16:49:27Z",
      "created_by": "po-S53"
    }]
)
| .task_board._updated_at = "2026-06-09T16:49:27Z"
| .task_board._updated_by = "po-S53"
