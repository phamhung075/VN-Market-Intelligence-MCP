## Task Report FIX-INFOCARD-DROPDOWN-EXPAND

changed: [
  apps/frontend/app/components/InfoCardExpand.tsx (new, 201L),
  apps/frontend/app/domain/market.ts (+18L findingData + source fields on AgentSignal),
  apps/frontend/app/lib/api/client.ts (+30L toAgentSignal mapper update),
  apps/frontend/app/routes/dashboard.analysis.tsx (+32L MacroImpactPanel + StockSignalsPanel wired),
  apps/frontend/app/__tests__/FIX-INFOCARD-DROPDOWN-EXPAND.test.tsx (new, 369L, 25 tests),
  apps/frontend/app/__tests__/1938-stock-signals.test.ts (+3L SAMPLE_SIGNAL findingData+source)
]

tests: 1695 pass / 2 fail (2 pre-existing QUE_DESCRIPTIONS — disjoint confirmed) | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: EXIT 0

genericity: PASS — InfoCardExpand has zero per-ticker/per-signal-type hardcode; FIELD_LABELS is a UX label map only; FindingDataPanel renders any Record<string,unknown> generically; formatFieldValue handles all JS types
no-fake-data: PASS — honest empty-state "Không có dữ liệu chi tiết." when findingData null AND source null; formatFieldValue("") → "—" (never fabricated); no placeholder strings
vietnamese: PASS — all user-facing strings Vietnamese (Xem thêm / Thu gọn / Nguồn / Không có dữ liệu chi tiết / field label map)
accessibility: PASS — aria-expanded prop + aria-label on CollapsibleTrigger; keyboard toggleable via Radix Collapsible primitive
dj-gate-1: FAIL — docs/agent-memory/decisions/sprint-INFOCARD-EXPAND-FETCH-dev-frontend.md does NOT contain task-id: FIX-INFOCARD-DROPDOWN-EXPAND; commit a20b2d18 did not include a DJ step for this task

verdict: CHANGES_REQUESTED

### Issues

- docs/agent-memory/decisions/sprint-INFOCARD-EXPAND-FETCH-dev-frontend.md — missing: add a "### STEP dev-frontend-S2" entry with `task-id:** FIX-INFOCARD-DROPDOWN-EXPAND` documenting the implementation decisions (Radix Collapsible selection, FIELD_LABELS map approach, honest-empty-state decision). DJ-GATE-1 blocks the DONE flip until this entry exists.

NOTE: Code quality is APPROVE-level. Only the process gate (DJ-GATE-1) is missing. Fixer round = 1 (no architect escalation needed).
