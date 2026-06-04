---
sprint: RAPID-DATA-LAYER
branch: task/RAPID-D-bctc-full-structured-json-receivables
size: M
zone: apps/mcp-server/
depends_on: []
blocks: []
---

## TLDR

Non-breaking extension to existing `get_bctc_full(code: string)` tool: add `structured_data` JSON block with all ReportRow numeric columns machine-readable, plus `receivables` field from `vnstock_balance_sheet`. Existing text output unchanged. Unblocks SKILL-1/2/3/4 from text-parsing burden; enables recompute-on-read pattern (per derived-column-reflow lesson: live served values, not stale persisted state).

## [PM] Planning Context

**Zone:** apps/mcp-server/

**Acceptance Criteria:**
- [ ] Modify `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts` to emit structured_data block
- [ ] structured_data contains all ReportRow numeric cols as JSON object: `{ pe, pb, roe, debt_to_equity, equity_total, total_assets, total_liabilities, cash, long_term_debt, profit_before_tax, operating_cf, net_profit, eps, net_revenue }`
- [ ] All numeric values are recomputed on read (NOT read from persisted stale columns) — same pattern as existing ROE recompute in bctcFullTools.ts:884
- [ ] Add `receivables` field to structured_data by secondary query to `vnstock_balance_sheet.receivables_bn` (same code + latest period matching the BCTC report period)
- [ ] Receivables honest-null if absent from vnstock table
- [ ] Existing text output UNCHANGED (non-breaking change) — tool still returns formatted text summary alongside structured_data
- [ ] All PUB-1..8 publish guards still apply (DONE status check, confidence gate, etc.)
- [ ] Unit tests: add 3+ new tests (structured_data keys present for DONE record, receivables populated from vnstock, receivables honest-null on missing period, numeric values match text output for spot-check)
- [ ] Regression test: existing BCTC-FULL tests PASS UNCHANGED (backwards compat confirmed)
- [ ] TypeScript: tsc clean, no any types
- [ ] MCP output format: `{ content: [{ type: "text", text: JSON.stringify({text_summary, structured_data, ...}) }] }` per standards

**Files to read first:**
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts:806` — main tool handler (observe existing text output generation, ROE recompute pattern at line 884)
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts:51–71` — ReportRow DB columns (pe, pb, roe, debt_to_equity, equity_total, total_assets, etc.)
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts:276–290` — text output formatting (to verify existing text unchanged by this task)
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts:350–380` — vnstock_balance_sheet schema (receivables_bn column ref)
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts:207–220` — financial_reports ReportRow schema (columns we serialize)
- `apps/mcp-server/src/infrastructure/db/bctcStore.ts` — query pattern for vnstock_balance_sheet (if existing queries available)
- `docs/policies/dev-standards.md` — MCP tool standards (structured JSON format, financial numbers in billion VND, no any)
- **CRITICAL:** `docs/feedback/feedback_derived_column_fix_needs_reflow.md` — recompute-on-read lesson (don't serve stale persisted columns)

**Files to modify:**
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts` — add structured_data block + receivables query

**Files to test:**
- `apps/mcp-server/src/__tests__/financial-reports/bctcFullTools.test.ts` — add 3+ regression + new structured_data tests

**Dependencies:**
- None (vnstock_balance_sheet already populated, financial_reports.pe/pb/roe already computed on demand in existing code)

**Knowledge needed:**
- `docs/policies/dev-standards.md` (MCP tool format, TypeScript standards)
- `docs/standards/microservice-build-standard.md` § 5 (LEAN: fence/sandbox/replay/red-green)
- `docs/feedback/feedback_derived_column_fix_needs_reflow.md` — recompute-on-read pattern (THE critical lesson for this task)
- Architecture brief source: docs/architecture-briefs/2026-06-04-rapid-analysis-data-layer-gaps.md § FIX-D (lines 219–228)

---

## Scope Boundary

**NOT in this task:**
- Backfilling receivables for entire corpus (post-tool-ship, separate task if needed)
- Adding new DB columns to financial_reports (receivables already in vnstock_balance_sheet; we join/query it, not persist a copy)
- Changing publish gates (PUB-1..8 remain intact, apply to both text and structured output)
- Computing receivables ratios (tool returns raw value; ratio is caller's responsibility)

---

## Build Standard — Lean

**Mandatory Gates (G1–G6):**
1. **Fence** — tool in interface zone, recompute numeric fields inline (no stale persisted state) or via vnstockStore query, queries DB via infrastructure layer
2. **Sandbox** — :memory: SQLite tests, zero API keys/DB credentials in env
3. **Replay** — test data inserted once, tool called twice on same DB (same result, same structured_data)
4. **Red/Green** — one failing test BEFORE fix, then all passing (show test FAILS when structured_data absent, PASSES after add)
5. Honest artifact (test file + tool code both live, no false greens)
6. TypeScript clean (tsc)

**DoD verification command line:**
```bash
# Fence: tool in interface/financial-reports, recomputes on read, queries via infra layer
grep -n "structured_data\|recompute\|receivables" apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts | head -20
grep -n "vnstock_balance_sheet\|receivables_bn" apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts

# Sandbox: :memory: test, no DB credentials
cd apps/mcp-server && bun test __tests__/financial-reports/bctcFullTools.test.ts --testNamePattern="structured"

# Red/Green: show pre-fix failure
echo "Pre-fix:" && bun test __tests__/financial-reports/bctcFullTools.test.ts --testNamePattern="structured_data_present" 2>&1 | grep "0 pass"
# Fix, re-run
echo "Post-fix:" && bun test __tests__/financial-reports/bctcFullTools.test.ts --testNamePattern="structured_data_present" 2>&1 | grep "1 pass"

# Replay: call tool twice on same data
bun test __tests__/financial-reports/bctcFullTools.test.ts --testNamePattern="replay"

# Regression: existing tests pass
bun test __tests__/financial-reports/bctcFullTools.test.ts

# TypeScript
tsc --noEmit
```

---

## Handoff Notes

**Brief source:** docs/architecture-briefs/2026-06-04-rapid-analysis-data-layer-gaps.md § FIX-D (lines 219–228)

**Leverage:** Unblocks SKILL-1 (pe_current, pb_current as machine-readable fields), SKILL-2 (all balance-sheet fields: total_assets, equity, total_liabilities, cash + receivables), SKILL-3 (roe, debt_to_equity, operating_cf as direct reads), SKILL-4 (profit_before_tax, long_term_debt as direct reads). Eliminates text-parsing burden across all downstream skills.

**Derived-column recompute lesson (critical):**
This task MUST NOT ship stale persisted values. Per feedback_derived_column_fix_needs_reflow.md: "The recompute is finalize-time only and serve path reads the persisted stale column." DO NOT repeat this bug. Verify:
- pe, pb, roe, debt_to_equity are recomputed on every tool call (matching existing ROE pattern in bctcFullTools.ts:884)
- receivables are queried live from vnstock_balance_sheet.receivables_bn, not stored in financial_reports (no stale copy)
- Test a pre-existing DONE record and verify the live recomputed value matches the text output exactly

**Tool contract for agents (NON-BREAKING):**
```
get_bctc_full(code: string)
→ {
  code: string,
  text_summary: string,  // ← existing text output, UNCHANGED
  structured_data: {
    pe: number | null,
    pb: number | null,
    roe: number | null,  // recomputed on read
    debt_to_equity: number | null,  // recomputed on read
    equity_total: number | null,
    total_assets: number | null,
    total_liabilities: number | null,
    cash: number | null,
    long_term_debt: number | null,
    profit_before_tax: number | null,
    operating_cf: number | null,
    net_profit: number | null,
    eps: number | null,
    net_revenue: number | null,
    receivables: number | null  // from vnstock_balance_sheet.receivables_bn
  },
  refine_status: string,
  source_tier: number,
  fetchedAt: string
}
```

**Error handling:**
- Code not found → return null text_summary, empty structured_data (all null) (honest sparse)
- Report period has refine_status != 'DONE' → PUBLISH GUARD BLOCKS (same as today, return error via PUB-1 gate)
- Receivables unavailable in vnstock_balance_sheet for this period → return null receivables (honest, no fake zeros)
- All numeric recomputes: return null on division-by-zero or missing prerequisite (no fake zeros)

**Verification step (router before approval):**
Router must raw-verify on a PRE-EXISTING DONE record (not newly created):
```
1. Call get_bctc_full(code=FPT) where FPT has a published DONE BCTC
2. Extract structured_data.pe and structured_data.pb
3. Visually parse the text_summary to find rendered P/E and P/B
4. Confirm values match exactly (same decimal precision, same numeric value)
   → if mismatch, the recompute is stale or wrong; fix before ship
```

**Commit message template:**
```
feat(rapid-phase2/FIX-D): extend get_bctc_full with structured_data + receivables

- Extend: apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts
- Add structured_data block: all ReportRow numeric cols (pe, pb, roe, debt_to_equity, ...)
- Add receivables from vnstock_balance_sheet.receivables_bn (live query, not stale column)
- Recompute pe/pb/roe/debt_to_equity on read (per derived-column-reflow lesson)
- Non-breaking: existing text_summary output unchanged
- Test: +3 tests (structured_data present, receivables populated, receivables honest-null, numeric match text)
- Regression: existing tests pass
- DoD: G1–G6 LEAN (fence/sandbox/replay/red-green/tsc)
- Verify: router raw-checks numeric values against text on pre-existing DONE record

Task: FIX-D (RAPID-DATA-LAYER Phase 2, unblocks SKILL-1/2/3/4)
Depends-on: none
Blocks: none
```

---

## Live Integration (ops rebuild required)

After FIX-D ships and QA approves:
- ops runs: `docker compose build mcp-server && docker compose up -d mcp-server`
- Tool becomes available immediately (no migration, no cron restart)
- Router smoke test: `get_bctc_full(code=FPT)` returns JSON with both text_summary AND structured_data block, structured_data.pe matches parsed P/E from text_summary, receivables is either null or a positive number
