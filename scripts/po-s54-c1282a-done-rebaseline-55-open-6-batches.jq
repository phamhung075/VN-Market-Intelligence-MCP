# po-S54 — CI-RED-RECONCILE batched board write (one mutex-guarded commit)
# 1. FIX-CI-C1282a-DATA-FRESHNESS-REWRITE: REVIEW -> DONE (+actual_result)
# 2. SPIKE-TESTING-CI-ARCHITECTURE-RETHINK: closed via DJ STEP only (work landed 4bfd5bba; not a tracked task row -> count stays 240+6=246)
# 3. REBASELINE ci_absolute 57 -> 55 (sha 63d53931) + sync long_tail_triage_policy.absolute mirror
# 4. OPEN 6 BATCH tasks (TODO) in dispatch order, cure recipes embedded from brief Section 3
# 5. dispatch_order metadata so router dispatches Batch 0->1->2->3->4->5
# Scope: ONLY task_board.active_sprints[24] + task_board._updated_*. Everything else byte-preserved.

# --- shared stamps ---
($TS) as $ts
| ($BY) as $by
# --- new batch tasks (dispatch order) ---
| [
  {
    "id": "BATCH0-CI-C-DV-DELIBERATE-VIOLATION-CLEANUP",
    "type": "BUG-FIX",
    "owner": "architect-first-then-dev-mcp-server",
    "status": "TODO",
    "size": "S",
    "zone": "apps/mcp-server/src/__tests__/",
    "priority": "high",
    "sprint": "CI-RED-RECONCILE",
    "dispatch_seq": 0,
    "class": "C-DV (DELIBERATE-VIOLATION)",
    "depends": [],
    "build_standard": "not-applicable",
    "baseline_pass": "55 (sha 63d53931, run 27222329410, job 80380149470)",
    "projected_delta": "-4 (55 -> 51)",
    "root_cause": "3 permanent-red files asserting deliberately-violated / nonexistent contracts. Cannot be fixed by sharding (genuine, not contamination).",
    "cure_recipe": {
      "1331a-single-writer-guard TEST-2": "cross-zone require() to a nonexistent alert-engine path -> REMOVE the test (obsolete cross-zone assertion). Protecting sibling: 1331a-single-writer-guard TEST-1 (in-zone single-writer-lock assertion) retains the single-writer guarantee in-zone.",
      "DWF-is-trading-day DWF-DEV-MCP-1": "convert to .fails() (documents the deliberate violation) OR remove. If remove -> protecting sibling: the DWF-is-trading-day green is-trading-day boundary assertions retain trading-day coverage.",
      "DWF-coordination-phase2 DV-P2-4": "stale DV assertion -> REMOVE; then DECIDE the fate of the 2 green ttl_seconds:180/1800 flow-contract assertions (keep as the protecting siblings that retain coordination-phase2 flow-contract coverage)."
    },
    "obsolete_test_discipline": "/goal REMOVE-obsolete clause: every REMOVAL names the protecting sibling above so no coverage gap.",
    "spec_brief": "docs/architecture-briefs/2026-06-09-testing-ci-architecture-rethink.md",
    "created_at": $ts,
    "created_by": $by
  },
  {
    "id": "BATCH1-CI-C-TH-TRANSPORT-HANG-REWRITE",
    "type": "BUG-FIX",
    "owner": "dev-mcp-server",
    "status": "TODO",
    "size": "M",
    "zone": "apps/mcp-server/src/__tests__/",
    "priority": "high",
    "sprint": "CI-RED-RECONCILE",
    "dispatch_seq": 1,
    "class": "C-TH (TRANSPORT-HANG)",
    "depends": [],
    "build_standard": "not-applicable",
    "baseline_pass": "55 (sha 63d53931, run 27222329410, job 80380149470)",
    "projected_delta": "-15 (51 -> 36)",
    "root_cause": "InMemoryTransport + Client.callTool round-trip hangs/contaminates in-suite (passes alone = CONTAMINATION class). Cure = drop the transport, call the prod fn / _registeredTools directly via db injection.",
    "cure_recipe": {
      "lever": "Drop InMemoryTransport + Client.callTool; invoke the prod tool fn / _registeredTools handler directly with an injected db. NO prod change.",
      "template": "1134-get-foreign-flow-tool.test.ts (proven CI-green 4x)",
      "files": ["MSG-1-market-foreign-flow.test.ts", "RAPID-A-get-company-profile-tool.test.ts", "RAPID-H-insider-lookback.test.ts"]
    },
    "spec_brief": "docs/architecture-briefs/2026-06-09-testing-ci-architecture-rethink.md",
    "created_at": $ts,
    "created_by": $by
  },
  {
    "id": "BATCH2-CI-C-ML-MOCK-STUB-LEAK-GUARD",
    "type": "BUG-FIX",
    "owner": "dev-mcp-server",
    "status": "TODO",
    "size": "M",
    "zone": "apps/mcp-server/src/__tests__/",
    "priority": "high",
    "sprint": "CI-RED-RECONCILE",
    "dispatch_seq": 2,
    "class": "C-ML (MOCK-STUB-LEAK)",
    "depends": [],
    "build_standard": "not-applicable",
    "baseline_pass": "55 (sha 63d53931, run 27222329410, job 80380149470)",
    "projected_delta": "-10 (36 -> 26)",
    "root_cause": "mock.module() stubs leak into sibling files via the bun ESM cache (no afterAll restore). Cure = add afterAll _realMod restore + a meta-test guard (mock.module-restore guard FIRST, per brief Section 2b Level 1).",
    "cure_recipe": {
      "lever": "Add afterAll _realMod restore to the contaminators; C5-ABSOLUTE rule: no NEW mock.module() calls.",
      "contaminators": ["1485-telegram-mock-isolation.test.ts", "FIX-1290-briefing-no-stale.test.ts", "1792-conviction-debounce.test.ts"],
      "meta_test_guard": "ADD apps/mcp-server/src/__tests__/lint/mock-module-afterall-guard.test.ts (brief Section 2b Level 1 mock.module-restore guard — every file calling mock.module() MUST have a matching afterAll restore)."
    },
    "spec_brief": "docs/architecture-briefs/2026-06-09-testing-ci-architecture-rethink.md",
    "created_at": $ts,
    "created_by": $by
  },
  {
    "id": "BATCH3-CI-C-MH-MARKET-HOURS-GATE-NOW-SEAM",
    "type": "BUG-FIX",
    "owner": "dev-mcp-server",
    "status": "TODO",
    "size": "S",
    "zone": "apps/mcp-server/",
    "priority": "high",
    "sprint": "CI-RED-RECONCILE",
    "dispatch_seq": 3,
    "class": "C-MH (MARKET-HOURS-GATE)",
    "depends": [],
    "build_standard": "not-applicable",
    "baseline_pass": "55 (sha 63d53931, run 27222329410, job 80380149470)",
    "projected_delta": "-6 (26 -> 20)",
    "root_cause": "Test asserts a market-hours-dependent SLA threshold but uses live wall-clock -> flaky off-hours. Cure = same additive now?:Date seam recipe as arch-S20 / Task 1282a.",
    "cure_recipe": {
      "lever": "Add additive now?:Date seam to freshnessSlaChecker.getSlaThreshold() (const now_ = now ?? new Date(); fully backward-compatible) + freeze an in-market clock in the test. Additive prod param only — NO logic change.",
      "files": ["1407b-sla-market-hours-gate.test.ts"],
      "precedent": "arch-S20 / Task 1282a detectDataFreshnessBreach now?:Date (proven clean -2)"
    },
    "spec_brief": "docs/architecture-briefs/2026-06-09-testing-ci-architecture-rethink.md",
    "created_at": $ts,
    "created_by": $by
  },
  {
    "id": "BATCH4-CI-C-CD-CONFIG-DRIFT-ASSERTS",
    "type": "BUG-FIX",
    "owner": "dev-mcp-server",
    "status": "TODO",
    "size": "M",
    "zone": "apps/mcp-server/src/__tests__/",
    "priority": "high",
    "sprint": "CI-RED-RECONCILE",
    "dispatch_seq": 4,
    "class": "C-CD (CONFIG-DRIFT)",
    "depends": [],
    "build_standard": "not-applicable",
    "baseline_pass": "55 (sha 63d53931, run 27222329410, job 80380149470)",
    "projected_delta": "-10 (20 -> 10)",
    "root_cause": "File structure/count/schema legitimately evolved; tests assert old state. Cure = REWRITE stale assertions to the current legitimate config (prod is RIGHT).",
    "cure_recipe": {
      "lever": "REWRITE each stale assertion to current legitimate config value. NO prod change.",
      "files": {
        "DWF-phase1-cadence": "slot count 14 -> 16",
        "230-bootstrap-verify": "missing section (add to expected)",
        "1349f": "newsHeadlinesRefresh key (add/update)",
        "1837a": "next_action head field (update)",
        "1190-pipeline-watchdog": "schedulerFileCount 43 -> 44",
        "1336-named-volume-config": "volume count 8 -> 9"
      }
    },
    "spec_brief": "docs/architecture-briefs/2026-06-09-testing-ci-architecture-rethink.md",
    "created_at": $ts,
    "created_by": $by
  },
  {
    "id": "BATCH5-CI-C-AL-ASSERTION-LOGIC-TRIAGE",
    "type": "SPIKE",
    "owner": "architect-first-then-dev-mcp-server",
    "status": "TODO",
    "size": "L",
    "zone": "apps/mcp-server/",
    "priority": "high",
    "sprint": "CI-RED-RECONCILE",
    "dispatch_seq": 5,
    "class": "C-AL (ASSERTION-LOGIC)",
    "depends": [],
    "build_standard": "not-applicable",
    "baseline_pass": "55 (sha 63d53931, run 27222329410, job 80380149470)",
    "projected_delta": "-10 (10 -> 0)",
    "root_cause": "~14 files where production behaviour diverges from test expectation; each needs per-file architect-first prod-vs-test triage before dev fix (no blanket rule).",
    "cure_recipe": {
      "lever": "Architect-first per-file prod-vs-test triage, then dev. Per /goal: REWRITE if prod evolved, FIX prod if prod regressed, REMOVE + name-protecting-sibling if obsolete.",
      "files": ["hotfix-vcb-parser", "bctc-eval-routes (500 vs 200/503)", "FIX-PDF-VOLUME-SBV-TABLE", "1100 (getCronJobHealthSummary last_run SQL-agg)", "1879a (FRED_API_KEY null timing)", "1503 (writeForeignFlowToOhlcv 0-changes count)", "VPT-1 (stale-push threshold)", "TRUST-RED (DT-2 finalize PARTIAL vs DONE)", "1343e", "1549", "1416b", "HC-human-confirm DV-HC-8", "1352a (scheduler-job-wrappers macro/marketscan)", "newsHeadlinesRefreshJob e2e"]
    },
    "spec_brief": "docs/architecture-briefs/2026-06-09-testing-ci-architecture-rethink.md",
    "created_at": $ts,
    "created_by": $by
  }
] as $new_tasks
# --- the write ---
| .task_board.active_sprints[24] |= (
    # 1. flip 1282a REVIEW -> DONE
    (.tasks |= map(
      if .id == "FIX-CI-C1282a-DATA-FRESHNESS-REWRITE" then
        .status = "DONE"
        | .closed_by = $by
        | .closed_at = $ts
        | .actual_result = "GATE PASSED UNAMBIGUOUS (signal ci-c1282a-gate-result-63d53931-20260609T1730Z.json, run 27222329410, bun_job 80380149470): Task 1282a per-victim exact-prefix (fail) tally 4 markers (2 unique tests TC-1 HIGH-breach + TC-2 CRITICAL-guard) -> 0 AND the absolute moved cleanly -2 (native_fail 57 -> 55, pass 11704 -> 11706, errors 0). Fix commit 01934547/63d53931 = additive now?:Date seam in detectDataFreshnessBreach (const now_ = now ?? new Date(); refs L130/L136 now->now_) + frozen in-market test clock 2026-06-09T04:00:00Z at 4 call-sites; prod logic UNTOUCHED; 8 TCs intact, no it() removed. arch-S20 REWRITE-STALE verdict PROVEN."
      else . end
    ))
    # 3. rebaseline ci_absolute 57 -> 55
    | .ci_absolute = {
        "native_fail": 55,
        "native_errors": 0,
        "fail_plus_error": 55,
        "tests": 11803,
        "pass": 11706,
        "skip": 42,
        "sha": "63d53931",
        "run_id": "27222329410",
        "bun_job_id": "80380149470",
        "supersedes": "57 (b106a1ec)",
        "updated_at": $ts,
        "updated_by": $by
      }
    # 3b. sync the long_tail mirror
    | .long_tail_triage_policy.absolute = "55 (sha 63d53931, run 27222329410, job 80380149470)"
    | .long_tail_triage_policy.updated_by = $by
    | .long_tail_triage_policy.updated_at = $ts
    | .long_tail_triage_policy.band = "~55 +/-3 (floor ~52)"
    # 4. append 6 new BATCH tasks
    | .tasks = (.tasks + $new_tasks)
    # 5. dispatch order metadata
    | .dispatch_order = {
        "policy": "biggest-deterministic-win-first; DV removals unblock the count, transport-hang + mock-leak are structural/zero-prod-risk, market-hours/config/assertion later",
        "order": [
          "BATCH0-CI-C-DV-DELIBERATE-VIOLATION-CLEANUP",
          "BATCH1-CI-C-TH-TRANSPORT-HANG-REWRITE",
          "BATCH2-CI-C-ML-MOCK-STUB-LEAK-GUARD",
          "BATCH3-CI-C-MH-MARKET-HOURS-GATE-NOW-SEAM",
          "BATCH4-CI-C-CD-CONFIG-DRIFT-ASSERTS",
          "BATCH5-CI-C-AL-ASSERTION-LOGIC-TRIAGE"
        ],
        "projection": "55 -> 51 -> 36 -> 26 -> 20 -> 10 -> 0",
        "spec_brief": "docs/architecture-briefs/2026-06-09-testing-ci-architecture-rethink.md",
        "set_by": $by,
        "set_at": $ts
      }
  )
# task_board _updated_* stamp
| .task_board._updated_at = $ts
| .task_board._updated_by = $by
