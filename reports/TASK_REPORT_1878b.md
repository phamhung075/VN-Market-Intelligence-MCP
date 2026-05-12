## Task Report 1878b — compute_accruals MCP Tool (Sloan Accruals Ratio)

**Sprint:** 1878b | **Date:** 2026-05-12 | **QA cycle:** 38

changed:
- apps/mcp-server/src/domain/services/financial-reports/accruals.ts (CREATE, 88 lines)
- apps/mcp-server/src/interface/mcp/tools/financial-reports/computeAccrualsTool.ts (CREATE, 224 lines)
- apps/mcp-server/src/interface/mcp/tools/financial-reports/index.ts (MODIFY, +1 export)
- apps/mcp-server/src/interface/mcp/tools/registry.ts (MODIFY, +2 lines: import + entry #129)
- apps/mcp-server/src/__tests__/1878b-compute-accruals.test.ts (CREATE, 225 lines)

tests: 12 pass / 0 fail (1878b) | 12 pass / 0 fail (1878a regression) | tsc: 0 errors | ddd: PASS | security: PASS

### AC Table

| AC | Description | Evidence | Result |
|---|---|---|---|
| AC-1 | Pure fn: (300-100)/5000 = 0.04 | T1 pass; arithmetic verified node -e | PASS |
| AC-2 | null NI → ratio null + missing["NET_INCOME"] + error null | T2 pass; accruals.ts:59-60 | PASS |
| AC-3 | zero TA → null + error:"zero_total_assets" | T5 pass; accruals.ts:75-76 | PASS |
| AC-4 | Sort ascending oldest→newest | T7 pass; data[0].period_quarter=1, data[3].period_quarter=4 | PASS |
| AC-5 | Tool visible in registry as #129 | registry.ts:196 registerComputeAccrualsTool | PASS |
| AC-6 | Description includes formula + unit:"ratio" field | computeAccrualsTool.ts:191 (desc), :50/:173 (field) | PASS |
| AC-7 | Default quarters=8, Zod rejects 25 (max 20) | T11 (8 rows from 12 seeded), T12 (safeParse false) | PASS |
| AC-8 | Integration: in-memory SQLite, multi-quarter return | T7-T11 all pass with makeTestDb() fixture | PASS |

### DDD Audit

accruals.ts imports: `import { z } from "zod"` only — zero infrastructure/interface imports. CLEAN.
Direction confirmed: computeAccrualsTool.ts (interface) → accruals.ts (domain). Correct direction.

### Security Scan

- No `process.env` in new files (Bun.env not present either — no env access needed)
- No hardcoded secrets, passwords, or tokens
- SQL in computeAccrualsTool.ts:130-143: parameterized `.prepare(...).all(ticker, quarters)` — CLEAN

### Registry Count

toolRegistry[] ends at line 196 with registerComputeAccrualsTool as the 89th entry (comment #129 refers to tool count, not array index). Prior tool was #128 (registerPyramidTierTool). Increment correct.

### Commit Convention (C2 gate)

Commit 4d7ab740:
- type: feat (correct — new tool)
- scope: financial-reports (correct per spec §11)
- Sprint: S1878b trailer present
- Task-Id: 1878b trailer present
- AC: AC-1/AC-2/AC-3/AC-4/AC-5/AC-6/AC-7/AC-8 trailer present — all 8 ACs listed
- PASS

### Merge

Merge SHA: ad04be0d
Branch task/1878b-compute-accruals deleted (local; no remote branch present).

verdict: APPROVED
