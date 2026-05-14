---
sprint: 1890
branch: task/1890a-A-get-cash-flow-build
size: S
zone: apps/mcp-server/
depends_on: []
blocks: [1890a-B]
---

## TLDR

Build new MCP tool `get_cash_flow` that exposes the full 4-line cash flow statement (operating_cf, investing_cf, financing_cf, capex, free_cash_flow) plus the OCF/NI forensic ratio. Register in the tool registry, add to `financial_analyst` SKILL_MANIFEST, and document in the package. CRITICAL: BCTC Q1/2026 banking filing window opens today (deadline 2026-05-15). This tool unblocks the FA G-step (OCF vs NI forensic check), which has been skipped 5 consecutive cycles.

---

## [PM] Planning Context

- **Zone:** `apps/mcp-server/`
- **Priority:** CRITICAL (BCTC banking deadline TODAY 2026-05-15)
- **Acceptance Criteria:**
  - [ ] New file `apps/mcp-server/src/interface/mcp/tools/financial-reports/cashFlowTool.ts` created with MCP handler + registration function
  - [ ] Handler returns all 6 fields: `operating_cf`, `investing_cf`, `financing_cf`, `capex`, `free_cash_flow`, `ocf_ni_ratio`
  - [ ] `ocf_ni_ratio = operating_cf / net_profit` (null-safe: returns `null` if `net_profit === 0`)
  - [ ] Graceful no-row-found response: `{ found: false, ticker, period }`
  - [ ] Tool registered in `apps/mcp-server/src/interface/mcp/tools/registry.ts` (import + array entry)
  - [ ] Update inline comment in registry.ts: new tool is #131 (increment from #130)
  - [ ] `financial_analyst` SKILL_MANIFEST in `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` includes `"get_cash_flow"`
  - [ ] `.claude/tools/package/financial-analyst.md` package doc includes new "Cash Flow Intelligence" section with params and output shape
  - [ ] Note in package doc: call `get_cash_flow` *after* `get_bctc_full` in the FA G-step, not instead of it (R3 risk from brief)
  - [ ] Unit test file `apps/mcp-server/src/__tests__/1890a-get-cash-flow.test.ts` covers: (1) happy path, (2) no-row-found, (3) zero net_profit division guard
  - [ ] All tests pass; tsc 0 errors
  - [ ] Container rebuild + deploy; FA TNB audit shows `G=✓` on next cycle post-deploy

- **Files to read first:**
  - `docs/architecture-briefs/2026-05-14-1890a-fa-tool-package.md` § Subtask A
  - `docs/REQ_1890a.md` § T4 (`get_cash_flow` spec)
  - `apps/mcp-server/src/interface/mcp/tools/financial-reports/computeAccrualsTool.ts` (pattern reference)
  - `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts` (existing cash flow fields — do NOT duplicate)
  - `apps/mcp-server/src/infrastructure/db/schema.ts` (confirm `financial_reports` columns)
  - `apps/mcp-server/src/interface/mcp/tools/registry.ts` (where to register)

- **Files to create:**
  - `apps/mcp-server/src/interface/mcp/tools/financial-reports/cashFlowTool.ts` — MCP handler + registration fn (~80-100 LOC)
  - `apps/mcp-server/src/__tests__/1890a-get-cash-flow.test.ts` — unit tests (~50 LOC)

- **Files to modify:**
  - `apps/mcp-server/src/interface/mcp/tools/registry.ts` — add import + array entry for `get_cash_flow`; update tool count comment to #131
  - `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` — add `"get_cash_flow"` to `financial_analyst` SKILL_MANIFEST array
  - `.claude/tools/package/financial-analyst.md` — add new section documenting `get_cash_flow` (params: ticker, period?, year?; output shape)

- **Dependencies:**
  - None (data already stored in `financial_reports` table by `fetchParseAndStoreBctc.ts`)

- **Knowledge needed:**
  - `docs/policies/dev-standards.md` — DDD layer separation (no domain service needed; direct DB read correct pattern)
  - `docs/architecture-briefs/2026-05-14-1890a-fa-tool-package.md` — full context + risk flags R1-R5
  - `docs/REQ_1890a.md` — spec + AC
  - Brief: pattern = `computeAccrualsTool.ts` (same module, direct DB read, injectable `_testDb` param, no domain import)

---

## Risk Flags (from Brief)

- **R1 — CRITICAL:** BCTC banking deadline TODAY. Must ship before 03:30 UTC FA cycle tomorrow.
- **R2 — `get_insider_signals` note:** Already in manifest; handled by 1890a-B as doc-verify. No manifest change in A.
- **R3 — `get_bctc_full` overlap:** Not a replacement. Package doc MUST note the two-tool strategy: call `get_cash_flow` *after* `get_bctc_full` in FA G-step.
- **R5 — tool count comment:** New tool is #131. Update registry.ts comment.

---

## Sequencing Note

**1890a-A is CRITICAL PATH.** 1890a-B is blocked by A (shared manifest file: `agentBootstrap.ts` + `SKILL_MANIFEST.md` + `financial-analyst.md`). Do NOT merge 1890a-A and 1890a-B in parallel. Ship 1890a-A first (code + test + deploy), then 1890a-B (manifest edits on top).

---

## DDD Pattern Reference

From brief: `computeAccrualsTool.ts` (same module, same pattern):
- Direct DB read (no domain service)
- Injected `_testDb` for testing
- No domain import
- No new repository interface
- No new DB migration

The `financial_reports` table already stores all required columns. The OCF/NI ratio is trivial arithmetic computed at read time inside the handler.

---

## Deployment

After merge, trigger ops Docker rebuild for MCP server. Verify container health and FA cycle job logs show `G=✓` on next execution.
