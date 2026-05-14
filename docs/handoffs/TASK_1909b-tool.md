---
sprint: 1909
branch: task/1909b-get-bctc-ocf-tool
size: S
zone: apps/mcp-server/src/interface/mcp/tools/financial-reports/
depends_on: []
blocks: [1909c-reparse-validation, 1910b-effr-package-reg]
---

## TLDR

Create new `getBctcOcfTool.ts` handler returning (ocf_operating, ocf_investing, ocf_financing, confidence, extraction_method) with source_tier=1. Register in tool-registry + agentBootstrap SKILL_MANIFEST + package docs. **Critical architect directive (SD-2): SELECT `extraction_method` from DB (real enum column pdf-parse/ocr-200/ocr-300/news_inference) — DO NOT hardcode.**

---

## [PM] Planning Context

**Zone:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/` + `apps/mcp-server/src/` (registry/manifest) + `docs/`

**Acceptance Criteria:**
- [ ] New handler file `getBctcOcfTool.ts` with signature: `get_bctc_ocf(code: string, period_year: number, period_quarter: number)` → JSON with `source_tier: 1`, `ocf_operating`, `ocf_investing`, `ocf_financing`, `confidence`, `extraction_method`
- [ ] `extraction_method` field SELECT'd from DB column (REAL enum value, not hardcoded constant)
- [ ] Registered in `tool-registry.json` with pointer convention (no hardcoded toolCount per feedback_no_hardcode_stats.md)
- [ ] Exported from `apps/mcp-server/src/interface/mcp/tools/financial-reports/index.ts` barrel
- [ ] Added to `financial_analyst` SKILL_MANIFEST in `agentBootstrap.ts` (line 46 array)
- [ ] Updated `.claude/tools/package/financial-analyst.md` package doc
- [ ] Updated `docs/SKILL_MANIFEST.md` mirror
- [ ] Test file `1909b-get-bctc-ocf.test.ts` with happy path + no-row-found + confidence + validation error paths
- [ ] `source_tier: 1` compile-time constant verified (SSC portal tier-1 per 1881a SSOT)
- [ ] `tsc 0` errors

**Files to read first:**
- `docs/handoffs/REQ_1909.md` § 1909b (FR-6 through FR-10)
- `docs/handoffs/ARCH_REVIEW_1909.md` § SD-2 resolution (extraction_method is REAL DB column, not constant)
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/cashFlowTool.ts` (pattern authority for DB injection)
- `apps/mcp-server/src/interface/mcp/tools/registry.ts` (registration pattern + import syntax)

**Files to create:**
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcOcfTool.ts` (handler)
- `apps/mcp-server/src/__tests__/1909b-get-bctc-ocf.test.ts` (contract + integration tests)

**Files to modify:**
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/index.ts` — +1 export statement
- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — +1 import + +1 registration call
- `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` (line 46) — add `"get_bctc_ocf"` to `financial_analyst` array
- `docs/SKILL_MANIFEST.md` — +1 row for `get_bctc_ocf` (financial_analyst)
- `.claude/tools/package/financial-analyst.md` — +1 row in Financial Metrics section

**Dependencies:**
- 1909a-extractor NOT required at deploy time (tool reads existing DB rows; returns null if OCF absent)
- However, for 1909c reparse validation to trigger, BOTH 1909a + 1909b must be deployed first

**Knowledge needed:**
- `docs/policies/dev-standards.md` § DDD: interface layer — DB read-only, no domain service mutations
- `1881a-impl-mcp` (SHIPPED) — source_tier JSON envelope pattern
- `reference_low_confidence_handling.md` (confidence field in response)

**Critical directive (Architect SD-2):**

> `extraction_method` is a REAL column in the `financial_reports` table. Values: `pdf-parse`, `ocr-200`, `ocr-300`, `news_inference`. DO NOT hardcode `"ocr_parsed"`. SELECT the actual value from DB.

This field captures which extraction method generated the OCF data (important for forensic-gate analysis). Hardcoding would surface false method labels in financial-analyst reasoning.

---

## DB schema note

Verified via architect (ARCH_REVIEW_1909.md SD-2): `extraction_method` column exists in `financial_reports` table. Test files `1294b-bctc-fallback.test.ts` + `1352a-async-extraction-race.test.ts` confirm the column is queryable.

**Row type for tool response:**
```typescript
interface BctcOcfRow {
  ocf_operating: number | null;
  ocf_investing: number | null;
  ocf_financing: number | null;
  confidence: number;
  extraction_method: string | null;  // REAL DB column
}
```

---

## Sequencing note

1909b-tool can execute in parallel with 1909a-extractor (disjoint codebases). However, shares `agentBootstrap.ts` + `SKILL_MANIFEST.md` with in-flight 1910b-effr-package-reg task. PM sequenced 1909b BEFORE 1910b to avoid merge conflicts. 1910b waits for 1909b deployed before starting.

---

## Implementation pattern

Model after `cashFlowTool.ts` (U-4 DB injection pattern):
- Inject `getDb()` inside handler (not module scope)
- Error format: `{ error: '...' }` JSON content block, no throw
- Happy path: all 3 OCF fields + confidence + extraction_method
- Missing row: return null-safe envelope per existing convention
