# po-s50-frontend-nav-stale-tests-ready.jq
# Appends FIX-FRONTEND-NAV-STALE-COUNT-TESTS (status READY) to .task_board.backlog
# and resolves the router 21-fail signal. Atomic-write via wrapper:
#   jq -f scripts/po-s50-frontend-nav-stale-tests-ready.jq --arg now "$NOW" orch-state.json > tmp && [ -s tmp ] && jq -e . tmp >/dev/null && mv tmp orch-state.json
# Owning flow pointer: docs/agents/po/flow/sprint-kickoff.md (frontend test-only FIX dispatch)
# dev-standards § Script Persistence
.task_board.backlog += [{
  "id": "FIX-FRONTEND-NAV-STALE-COUNT-TESTS",
  "title": "FIX-FRONTEND-NAV-STALE-COUNT-TESTS — 21 stale ANALYST_NAV absolute-count/last-item assertions fail at HEAD (live nav=26 analyst / 33 total; tests frozen at 19..24). 6 files: FE-HEADER-SSOT-top-nav + task17-page14..18-nav. Standing /goal recheck. Pre-existing, delta=0 across whole QUE sprint — NOT a regression.",
  "owner": "dev-frontend",
  "status": "READY",
  "type": "FIX",
  "zone": "apps/frontend/",
  "priority": "medium",
  "size": "S",
  "created_at": $now,
  "created_by": "po",
  "test_only": true,
  "no_rebuild": true,
  "baseline_pass": "raw vitest @HEAD: 21 fail / 1533 pass / 1554 total (PO ran 2026-06-13 ~10:05Z). Target: 0 fail / 1554 pass.",
  "verification_gate": "npx vitest run in apps/frontend => 0 fail; the 6 named files all green; full-suite pass count rises by exactly 21 (no other test touched).",
  "desc": "ROOT-CAUSE CLASS (anti-pattern, fix definitively not symptom): the task17-pageNN-nav tests assert the ABSOLUTE ANALYST_NAV total *at the moment that page was added* (page14 -> 'exactly 20', page15 -> 21, page16 -> 22, page17 -> 23, page18 -> 24) plus 'last/second-to-last entry is X'. Every subsequent nav addition breaks all earlier snapshots — so the suite floor grows by ~4 fails per page added. Live SSOT (app/components/TopNav.tsx) is now ANALYST_NAV=26, SYSTEM_NAV=7, NAV_ITEMS=33. FE-HEADER-SSOT-top-nav.test.tsx also asserts stale 'exactly 19' / 'union 26 total'. FIX = decouple each pageNN test from the global count: each pageNN test should assert ONLY that ITS item exists and sits adjacent to its declared predecessor (presence + relative order), NOT an absolute length; move the single absolute-total assertion into ONE canonical test (FE-HEADER-SSOT-top-nav) rebaselined to 26 analyst / 33 total / 7 system. This stops the recurrence — next page addition only touches the one SSOT test, not 5 historical files. FORBIDDEN: blanket renumber-the-constants-and-move-on that re-freezes the same brittle absolute counts (would re-break on PAGE 20). Update the 'last ANALYST_NAV entry' / 'second-to-last' assertions to the predecessor-relative form too.",
  "files": [
    "apps/frontend/app/__tests__/FE-HEADER-SSOT-top-nav.test.tsx",
    "apps/frontend/app/__tests__/task17-page14-shareholders-nav.test.tsx",
    "apps/frontend/app/__tests__/task17-page15-officers-nav.test.tsx",
    "apps/frontend/app/__tests__/task17-page16-financials-nav.test.tsx",
    "apps/frontend/app/__tests__/task17-page17-fedrates-nav.test.tsx",
    "apps/frontend/app/__tests__/task17-page18-reputation-nav.test.tsx"
  ],
  "note": "[po triage \($now)] Opened from reconciled signal router-frontend-testsuite-170fail-2026-06-13T08-50Z. Zone apps/frontend/ is FREE (mcp-server zone parked behind EVIDENCE-ACCUM-SILENT-CRON 16:00Z gate — this task does NOT touch mcp-server). Test-only, no codegen-of-prod, no rebuild. Router: route as direct FIX (dev-team Step 3) to dev-frontend NOW. dev-frontend MUST raw-verify 0-fail full suite before REVIEW.",
  "dispatch_note": "WIP free slot in apps/frontend zone; EVIDENCE-ACCUM gate holds only apps/mcp-server. Dispatch ALLOWED to dev-frontend immediately."
}]
| .signal_queue.rows = (.signal_queue.rows | map(
    if .id == "router-frontend-testsuite-170fail-2026-06-13T08-50Z"
    then . + {
      "status": "RESOLVED",
      "resolved_at": $now,
      "resolved_by": "po",
      "resolution": "Triaged + accepted. PO raw-ran vitest @HEAD: real floor 21 fail / 1533 pass / 1554 total (not 1518/21). All 21 = stale ANALYST_NAV absolute-count/ordering snapshots in 6 files (FE-HEADER-SSOT + task17-page14..18). Opened apps/frontend test-only FIX-FRONTEND-NAV-STALE-COUNT-TESTS (READY, dev-frontend). NOT blocked by mcp-server 16:00Z gate. Root-cause fix = decouple pageNN tests from absolute count, single SSOT total test rebaselined to 26/33."
    }
    else . end))
| .task_board._updated_at = $now
| .task_board._updated_by = "po"
