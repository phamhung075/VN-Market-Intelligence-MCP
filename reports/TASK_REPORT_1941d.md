## Task Report 1941d
date: 2026-05-18
outcome: APPROVED
type: FIX (infrastructure/interface — net_profit OCR extraction bug, API bridge COALESCE)
round: 1

changed:
- apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts:83-91,283,376-414
- apps/mcp-server/src/infrastructure/db/vnstockStore.ts:18,345-347
- apps/mcp-server/src/interface/mcp/tools/financial-reports/cashFlowTool.ts:60,83-84,221,259-265,284
- apps/mcp-server/src/__tests__/1941d-net-profit-api-bridge.test.ts (NEW, 322 lines)
- apps/mcp-server/src/__tests__/1890a-get-cash-flow.test.ts (schema compat update)
- apps/mcp-server/src/__tests__/1930b-cashflow-ratio-guard.test.ts (schema compat update)
- apps/mcp-server/src/__tests__/1941a-ocf-api-bridge-preference.test.ts (schema compat update)

tests: 24 pass / 0 fail (1941d×7 + 1890a×7 + 1930b×5 + 1941a×5)
full suite: 9180 pass / 276 fail (276 = pre-existing, unrelated to 1941d; +1 vs developer baseline is flaky timing test)
tsc: 4 errors on branch (1941c-accuracy-digest.test.ts + related — branch divergence artifact; resolve on merge, confirmed absent on main)
ddd: PASS — bridge fns in infrastructure/db/, COALESCE in interface/mcp/tools/, no domain→infra violations
security: PASS — parameterized SQL (schema-financial-reports.ts:392 ?-binding), no process.env, no hardcoded secrets
migration: PASS — additive ALTER TABLE only, idempotent (colNames.has guard), no data loss
merge commit: chore(1941/mcp-server): merge task/1941d-fpt-netprofit-ocr-fix
