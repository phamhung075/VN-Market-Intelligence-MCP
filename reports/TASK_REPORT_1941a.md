## Task Report 1941a
date: 2026-05-18
outcome: APPROVED

changed:
- apps/mcp-server/src/interface/mcp/tools/financial-reports/cashFlowTool.ts (COALESCE operating_cash_flow ?? operating_cf, ocf_source field)
- apps/mcp-server/src/__tests__/1941a-ocf-api-bridge-preference.test.ts (5 new tests)
- apps/mcp-server/src/__tests__/1890a-get-cash-flow.test.ts (DDL fix: operating_cash_flow column)
- apps/mcp-server/src/__tests__/1930b-cashflow-ratio-guard.test.ts (DDL fix: operating_cash_flow column)

tests: 17 pass / 0 fail (cashflow suite) | full suite 9592 pass / 328 fail (328 pre-existing on main, no regression) | tsc: 0 errors | ddd: PASS | security: PASS
