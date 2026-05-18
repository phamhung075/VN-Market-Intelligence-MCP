## Task Report 1942b
date: 2026-05-18
outcome: APPROVED
type: FEATURE (interface/mcp/tools + infrastructure/db — cashFlowTool fallback path + backfillOCFForWatchlist)
round: 1
commit: bae63582
merge: already on main (developer pushed directly per project policy)

changed:
  - apps/mcp-server/src/interface/mcp/tools/financial-reports/cashFlowTool.ts (+178 lines)
  - apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts (+backfillOCFForWatchlist fn)
  - apps/mcp-server/src/__tests__/1942b-cashflow-fallback-path.test.ts (new, 374 lines)
  - apps/mcp-server/src/__tests__/1890a-get-cash-flow.test.ts (+23 lines, makeTestDb updated)
  - docs/TASKS.md (1942b → DONE)

tests: 10/10 task tests pass | 50/50 cashflow suite pass | 9219 pass / 275 fail full suite (0 regressions vs baseline)
tsc: 0 errors
ddd: PASS (infra import in interface tool is established codebase pattern; Architect R-7 approved direct DB access for cashFlowTool)
security: PASS (parameterized SQL on all prepare().get() calls, no process.env, no hardcoded secrets)

### AC Verdicts

Primary ACs:
- AC-1: PASS — primary path returns data_source="financial_reports"; TC1 + 1890a suite GREEN
- AC-2: PASS — COUNT(*) WHERE action_code = ? (cashFlowTool.ts:352-357) routes to fallback on frRowCount=0; TC2 GREEN
- AC-3: PASS — data_source field on CashFlowFound (type + implementation lines 103, 309, 461); TC2/TC1 verified
- AC-4: PASS — ×1000.0 unit conversion at cashFlowTool.ts:277-285; TC4 GREEN (100 bn → 100000 mn)
- AC-5: PASS — loading:true + period="Đang tải dữ liệu lần đầu" at cashFlowTool.ts:251-259; TC3 GREEN
- AC-6: PASS — capex:null (line 302), free_cash_flow:null (line 303) in fallback envelope; TC2 verified
- AC-7: PASS — 3-branch period filter logic at cashFlowTool.ts:206-216; TC5/TC6/TC7 all GREEN
- AC-8: INTEGRATION ONLY — requires 1942a startup probe live + vnstock tables populated; unit tests confirm correct data_source field; integration deferred per spec

Secondary ACs (backfillOCFForWatchlist):
- EC-1/AC-B1: PASS — signature `export function backfillOCFForWatchlist(db: Database): void` at schema-financial-reports.ts:450
- EC-2/AC-B2: PASS — reads docs/data/stock-classification.json (line 452), iterates watchlist array (line 456), calls bridgeOCFToFinancialReports per ticker (line 460)
- EC-3/AC-B3: PASS — idempotent UPDATE; TC8 GREEN (call twice, same operating_cash_flow=300000)
- EC-4/AC-B4: PASS — INFO log with count at schema-financial-reports.ts:464-466; TC9 GREEN
- EC-5/AC-B5: PASS — called at initFinancialReportsTables() line 290, after backfillAllNetProfit() line 285
- EC-6/AC-B6: PASS — no ALTER TABLE, no new tables; code review confirmed

Edge cases:
- EC-1 (cold DB loading:true): PASS (cashFlowTool.ts:258)
- EC-2 (specific period not found, no loading flag): PASS (cashFlowTool.ts:236-248)
- EC-3 (vnstock_financials missing → partial result): PASS (cashFlowTool.ts:265-274, vfRow optional)
- EC-4 (quarter=0 excluded): PASS (WHERE quarter BETWEEN 1 AND 4 at cashFlowTool.ts:207)
- EC-5 (unit consistency ×1000.0): PASS (lines 278, 280, 282, 285)
- EC-6 (unreadable stock-classification.json → WARN + return early): PASS (schema-financial-reports.ts:467-469); TC10 GREEN

### Merge Status
Already on main (commit bae63582). No branch to merge.
