# po-S51 — CI-RED-RECONCILE batched board write after arch (9f1b6615) rewrite-stale verdict on Task 1839b.
# Pointer: docs/agents/po/flow/main.md (PO board-write step). Scoped on task_board.active_sprints[24] ONLY.
# 2 mutations: (1) FIX-CI-C1839b-TRIAGE SPIKE TODO->DONE (architect deliverable accepted),
# (2) OPEN FIX-CI-C1839b-REWRITE-STALE-ASSERTS (FIX, dev-mcp-server, TODO) carrying full fix spec + router addendum.
# + task_board _updated_* bump. ci_absolute UNTOUCHED (59, sha 326cf35a). No whole-object rewrite; signal_queue preserved.
.task_board.active_sprints[24].tasks |= (
  map(
    if .id == "FIX-CI-C1839b-TRIAGE" then
      .status = "DONE"
      | .closed_by = "po-S51"
      | .closed_at = "2026-06-09T16:14:02Z"
      | .resolution = "ARCHITECT-DELIVERABLE-ACCEPTED"
      | .triage_verdict = "arch verdict (brief docs/architecture-briefs/2026-06-09-ci-c1839b-notebook-protocol-triage.md, commit+push 9f1b6615, router-verified docs-only): Task 1839b = 2 UNIQUE failing tests (4 CI log-markers = 2x2 double-log), both REWRITE-STALE — genuine 1ms assertion failures, NO contamination (zero mock.module), NO ~5000ms transport-hang, prod CORRECT. AC-3 'notebook files are .md format (gitkeep excluded)': market-watcher.md.bak (163KB, committed 422c0ff9) passes the test's gitkeep-only filter then fails /\\.md$/. AC-4 'developer.md has required sections': developer.md no longer contains scaffold placeholders 'Last session summary'/'Known patterns' (NB-PRUNE-1 replaced them with real '## Session YYYY-MM-DD' entries; file 5198B/54L/6 sessions = substantive). Fix lever = REWRITE (NOT remove, NOT prod-fix) for BOTH. Projected: Task 1839b 4 markers (2 unique) -> 0, native_fail 59 -> 57."
      | .actual_result = "ACCEPTED — opened scoped dev fix FIX-CI-C1839b-REWRITE-STALE-ASSERTS (dev-mcp-server) carrying the verbatim arch fix spec PLUS router addendum (git rm the .bak trash + harden filter + rewrite AC-4 asserts). ci_absolute held at 59 (no rebaseline at task-open)."
    else . end
  )
  + [{
      "id": "FIX-CI-C1839b-REWRITE-STALE-ASSERTS",
      "type": "FIX",
      "owner": "dev-mcp-server",
      "status": "TODO",
      "size": "S",
      "zone": "apps/mcp-server/src/__tests__/",
      "priority": "high",
      "sprint": "CI-RED-RECONCILE",
      "depends": [],
      "title": "REWRITE-STALE Task 1839b AC-3 + AC-4 asserts + git rm the market-watcher.md.bak trash (one commit)",
      "root_cause": "arch rewrite-stale verdict (brief 9f1b6615): both Task 1839b failing tests in apps/mcp-server/src/__tests__/1839b-notebook-protocol.test.ts are genuine 1ms assertion failures (NO contamination, NO transport-hang) against live FS state that evolved after the test was written. AC-3 fails because docs/agent-memory/notebooks/market-watcher.md.bak (163KB, committed 422c0ff9) passes the test's gitkeep-only filter then fails /\\.md$/. AC-4 fails because developer.md no longer contains scaffold placeholders 'Last session summary'/'Known patterns' (NB-PRUNE-1 replaced them with real '## Session YYYY-MM-DD' entries; file is 5198B/54L/6 sessions = substantive).",
      "scope": "TEST-REWRITE (in-zone, test-only, ZERO prod files) + TRASH-DATA REMOVAL, in ONE commit. (A) AC-3 [test it() block]: change the dir filter from `f !== \".gitkeep\"` to `f !== \".gitkeep\" && !f.endsWith(\".bak\")`; keep the /\\.md$/ check on the remaining files; rename the it() label to '...(gitkeep and .bak excluded)'. (B) AC-4 [test it() block]: REPLACE `expect(content).toContain(\"Last session summary\")` + `expect(content).toContain(\"Known patterns\")` with `expect(content).toMatch(/^## /m)` (>=1 real section heading) + `expect(content.length).toBeGreaterThan(200)` (substantive, not scaffold); KEEP `expect(content).toContain(\"Last updated:\")`. (C) ROUTER ADDENDUM: ALSO `git rm docs/agent-memory/notebooks/market-watcher.md.bak` — it is genuine TRASH DATA (a 163KB May-20 backup of a notebook, per CLAUDE.md 'remove garbage, trash data'). Do BOTH the rm AND the filter-harden: removing debris alone is insufficient (a future .bak would re-break the test); hardening alone leaves the trash. Both in one commit.",
      "obsolete_test_discipline": "These are REWRITES not removals — prod (notebooks dir + developer.md) is correct and substantive; only the assertions were stale. Coverage is RETAINED by the rewritten asserts themselves: AC-3 still enforces real .md-format on all real notebook files; AC-4 still enforces a real section-heading (^## ) + substantive content length + the Last updated: header. AC-1/AC-2/AC-5 untouched + stay green.",
      "files": [
        "apps/mcp-server/src/__tests__/1839b-notebook-protocol.test.ts",
        "docs/agent-memory/notebooks/market-watcher.md.bak"
      ],
      "spec_brief": "docs/architecture-briefs/2026-06-09-ci-c1839b-notebook-protocol-triage.md",
      "build_standard": "BUG-FIX/TEST-REWRITE in-zone, no new primitives -> BUILD-STANDARD not-applicable (skip); zone apps/mcp-server/src/__tests__/ (test-only); dev-mcp-server drives, no relay.",
      "primary_gate_proof": "Task 1839b per-victim exact-prefix (fail) tally 4 markers (2 unique tests) -> 0 on the next full-CI run, measured by the jitter-robust full-CI per-victim exact-prefix tally for 'Task 1839b' — NOT the jitter-prone absolute, NOT a 2-file local repro (3 false-positive local repros earlier this sprint arch-S14/S15/S16). Projected absolute native_fail 59 -> 57.",
      "baseline_pass": "59 (native_fail, sha 326cf35a, run 27218281159, job 80365846275)",
      "created_at": "2026-06-09T16:14:02Z",
      "created_by": "po-S51"
    }]
)
| .task_board._updated_at = "2026-06-09T16:14:02Z"
| .task_board._updated_by = "po-S51"
