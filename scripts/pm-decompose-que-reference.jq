# Decompose ARCH-QUE-REFERENCE-PAGE into 4 atomic frontend subtasks
.task_board |= (
  # Create the 4 new subtasks
  (.backlog += [
    {
      "id": "QUE-REFERENCE-PAGE-1a",
      "title": "Extend codegen: emit que-descriptions-detail.generated.ts",
      "owner": "dev-frontend",
      "status": "READY",
      "zone": "apps/frontend/",
      "sprint": "QUE-REFERENCE-PAGE",
      "priority": "medium",
      "desc": "Extend scripts/gen-que-descriptions.ts to emit a second generated artifact que-descriptions-detail.generated.ts with the full QueDetailDescription interface (12 fields + phases array). Do NOT modify the existing tooltip QueDescription type. Commit both generated files together.",
      "acceptance_criteria": [
        "gen:que script runs without error",
        "apps/frontend/app/lib/que-descriptions-detail.generated.ts exists with 64 entries",
        "QueDetailDescription interface has exactly: id, name, chinese, upper, lower, upperElement, lowerElement, coreMeaning, marketTrendLabel, stateInterpretation, favorable, warning, phases[6]",
        "phase object has phase, action, outcome, gloss",
        "File includes header comment citing source (que-reference.js)",
        "[ -s ] check guards empty-file scenario",
        "All text values from SSOT, none hardcoded"
      ],
      "blocked_by": [],
      "created_at": "2026-06-13T09:15:00Z",
      "created_by": "pm",
      "handoff": "docs/data/orch/HANDOFF-QUE-REFERENCE-PAGE-1a.md",
      "parent_brief": "ARCH-QUE-REFERENCE-PAGE"
    },
    {
      "id": "QUE-REFERENCE-PAGE-1b",
      "title": "Build dashboard.kinh-dich-reference.tsx route with search/grid",
      "owner": "dev-frontend",
      "status": "READY",
      "zone": "apps/frontend/",
      "sprint": "QUE-REFERENCE-PAGE",
      "priority": "medium",
      "desc": "Create apps/frontend/app/routes/dashboard.kinh-dich-reference.tsx. Import QUE_DETAIL from generated file. Implement client-side search/filter (by id, name, chinese). Render 64 QueCard components in responsive grid with deep-link anchors #que-<id>. All labels in plain Vietnamese.",
      "acceptance_criteria": [
        "Route file created at apps/frontend/app/routes/dashboard.kinh-dich-reference.tsx",
        "Imports QUE_DETAIL from que-descriptions-detail.generated.ts",
        "Client-side search/filter works (id, name, chinese)",
        "All 64 hexagrams render as QueCard components",
        "Each card has anchor id=\"que-{id}\" for deep-linking",
        "QueCard layout matches design: header, trigrams, market trend badge, core meaning, state, favorable, warning, 6-row hào table",
        "Responsive grid (mobile-first)",
        "All text labels in Vietnamese (no English, no jargon)",
        "Page header: 'Tra cứu Kinh Dịch — 64 quẻ'",
        "Search placeholder: 'Tìm theo tên hoặc số quẻ...'"
      ],
      "blocked_by": ["QUE-REFERENCE-PAGE-1a"],
      "created_at": "2026-06-13T09:15:00Z",
      "created_by": "pm",
      "handoff": "docs/data/orch/HANDOFF-QUE-REFERENCE-PAGE-1b.md",
      "parent_brief": "ARCH-QUE-REFERENCE-PAGE"
    },
    {
      "id": "QUE-REFERENCE-PAGE-2",
      "title": "Add QueName deep-link + TopNav entry",
      "owner": "dev-frontend",
      "status": "READY",
      "zone": "apps/frontend/",
      "sprint": "QUE-REFERENCE-PAGE",
      "priority": "medium",
      "desc": "Add withDetailLink prop to QueName.tsx (default false). Callers pass withDetailLink to get deep-link anchor inside tooltip. Add nav entry to TopNav.tsx ANALYST_NAV: { to: '/dashboard/kinh-dich-reference', label: 'Tra cứu Kinh Dịch' }. Add SSOT guard line verifying dashboard.kinh-dich-reference.tsx route file.",
      "acceptance_criteria": [
        "QueName.tsx gains withDetailLink?: boolean prop",
        "withDetailLink=true renders <a href='/dashboard/kinh-dich-reference#que-{hexagram}'>Xem chi tiết →</a> inside TooltipContent",
        "Default (no prop) renders no link",
        "TopNav.tsx ANALYST_NAV has new entry: { to: '/dashboard/kinh-dich-reference', label: 'Tra cứu Kinh Dịch' }",
        "Placement: immediately after kinh-dich-signals entry",
        "TopNav comment block (line 42-67) includes verification line for dashboard.kinh-dich-reference.tsx",
        "No existing QueName call sites modified",
        "Route is reachable from nav"
      ],
      "blocked_by": ["QUE-REFERENCE-PAGE-1b"],
      "created_at": "2026-06-13T09:15:00Z",
      "created_by": "pm",
      "handoff": "docs/data/orch/HANDOFF-QUE-REFERENCE-PAGE-2.md",
      "parent_brief": "ARCH-QUE-REFERENCE-PAGE"
    },
    {
      "id": "QUE-REFERENCE-PAGE-TEST",
      "title": "Write tests: QUE_DETAIL + QueName deep-link",
      "owner": "dev-frontend",
      "status": "READY",
      "zone": "apps/frontend/",
      "sprint": "QUE-REFERENCE-PAGE",
      "priority": "medium",
      "desc": "Create apps/frontend/app/__tests__/QUE-REFERENCE-PAGE-detail.test.ts with 6 test suites: QUE_DETAIL count=64, interface shape validation, phases array (6 phases each), spot-check quẻ 1, regression guard (QUE_DESCRIPTIONS still 2-field), generated file header. Add QueName deep-link tests to existing QueName test file.",
      "acceptance_criteria": [
        "QUE-REFERENCE-PAGE-detail.test.ts created",
        "T1: QUE_DETAIL has exactly 64 entries",
        "T2: Entry shape has all 12 required fields + phases",
        "T3: Each entry has exactly 6 phases with phase/action/outcome/gloss",
        "T4: Quẻ 1 spot-check (id=1, name='Kien', chinese='乾', coreMeaning matches SSOT .vi)",
        "T5: Regression check — QUE_DESCRIPTIONS[1] still 2-field only",
        "T6: Generated file header comment present",
        "QueName test includes: withDetailLink=true renders href with #que-1",
        "QueName test includes: default (no prop) renders no anchor",
        "All tests pass"
      ],
      "blocked_by": ["QUE-REFERENCE-PAGE-1a"],
      "created_at": "2026-06-13T09:15:00Z",
      "created_by": "pm",
      "handoff": "docs/data/orch/HANDOFF-QUE-REFERENCE-PAGE-TEST.md",
      "parent_brief": "ARCH-QUE-REFERENCE-PAGE"
    }
  ]) |
  # Update the parent ARCH task status to DECOMPOSED
  (.backlog |= map(
    if .id == "ARCH-QUE-REFERENCE-PAGE" then
      .status = "DECOMPOSED" |
      .decomposition_date = "2026-06-13T09:15:00Z" |
      .subtask_ids = ["QUE-REFERENCE-PAGE-1a", "QUE-REFERENCE-PAGE-1b", "QUE-REFERENCE-PAGE-2", "QUE-REFERENCE-PAGE-TEST"]
    else . end
  ))
) |
._updated_at = "2026-06-13T09:15:00Z" |
._updated_by = "pm"
