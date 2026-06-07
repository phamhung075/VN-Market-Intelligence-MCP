---
sprint: TOOL-SURFACE-UPGRADE
branch: task/TSU-U5-foreign-flow-null-ratio
size: M
zone: apps/mcp-server/src/interface/mcp/
depends_on: []
blocks: []
---

# U5: Foreign Flow Null Holding Ratio

## TLDR

VPS API `bgapidatafeed.vps.com.vn` does NOT return holding_ratio field. Per DSI invariant (never serve fabricated values), `get_foreign_flow` must omit the `Holding Ratio` table column and `Holding ratio change (5d)` signal line when all holding_ratio values are 0 (fabricated). Serve-null applies permanently this sprint. Changes: foreignFlowTools.ts (formatForeignFlowOutput gate), foreignFlowAnalyzer.ts (signal computation guard), companyProfileTools.ts (foreign_holding_ratio emit null if 0), test updates.

---

## [PM] Planning Context

**Sprint:** TOOL-SURFACE-UPGRADE  
**Unit:** U5 — Foreign flow null holding_ratio field  
**Zone:** `apps/mcp-server/src/interface/mcp/`  
**Priority:** P2  
**Type:** Data quality (DSI compliance)  
**Effort:** ~2h  
**Independent:** Can proceed in parallel with U3/U4

### Acceptance Criteria

- [x] AC-U5-1: `get_foreign_flow` tool → formatForeignFlowOutput helper: omit `Holding Ratio` table column when hasRealHoldingData = false
- [x] AC-U5-2: Omit `holdingRatioChange5d` signal line (lines 78–80) when hasRealHoldingData = false
- [x] AC-U5-3: Tool description updated to remove mention of "holding ratio change" until real data is available
- [x] AC-U5-4: foreignFlowAnalyzer.ts → ForeignFlowSignal: gate holdingRatioChange5d computation with flag `is_holding_ratio_fabricated: boolean` (true when all values = 0)
- [x] AC-U5-5: companyProfileTools.ts → get_company_profile response: emit `foreign_holding_ratio: null` if row.current_holding_ratio === 0
- [x] AC-U5-6: Test path (foreignFlowTools.ts:186) updates: fixture sets holdingRatio=0; after fix, assert holding-ratio column ABSENT from output
- [x] AC-U5-7: All tests pass; zero regression on existing working columns

### Files to Read First

- `apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts` lines 60–101 — formatForeignFlowOutput (current Holding Ratio logic)
- `apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts:186` — test path (holdingRatio: 0 fixture)
- `apps/mcp-server/src/domain/services/foreignFlowAnalyzer.ts` — holdingRatioChange5d computation
- `apps/mcp-server/src/interface/mcp/tools/market-data/companyProfileTools.ts` — get_company_profile tool
- `vps-scripts/fetch-foreign-flow.sh` lines 42–48 — API field audit comment (confirms no holding_ratio field)
- `docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md` § U5 Design (lines 420–435) — detailed implementation spec

### Files to Modify

- `apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts` — formatForeignFlowOutput: add hasRealHoldingData guard
- `apps/mcp-server/src/domain/services/foreignFlowAnalyzer.ts` — add is_holding_ratio_fabricated flag to ForeignFlowSignal
- `apps/mcp-server/src/interface/mcp/tools/market-data/companyProfileTools.ts` — foreign_holding_ratio: emit null if 0
- Test file (foreignFlowTools.test.ts or embedded) — update assertion on holding-ratio column presence

### Dependencies

None (independent zone, no sprint dependencies).

### Knowledge Needed

- `docs/policies/dev-standards.md` — commit convention
- `docs/project-memory/feedback_remediation_overclaims_derived_layer.md` — DSI invariant (never serve fabricated)
- `docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md` § U5 Foreign Flow Null Holding Ratio (lines 164–185 in BA spec, lines 420–435 in architect brief)

### Related Documentation

- ARCH-U5-1 confirmed: VPS API does NOT expose holding_ratio. Serve-null applies permanently this sprint.
- DSI invariant: never serve 0.00% as real data; omit or note as unknown.

---

## Implementation Guidance

### foreignFlowTools.ts — formatForeignFlowOutput Update

```typescript
// Before:
function formatForeignFlowOutput(history: ForeignFlowRecord[]): string {
  // ... daily history table with "| Holding Ratio" column always

// After:
function formatForeignFlowOutput(history: ForeignFlowRecord[]): string {
  const hasRealHoldingData = history.some(r => r.holdingRatio > 0);
  
  // Build table header (conditionalize Holding Ratio column)
  const columns = ['Code', 'Foreign Buy Vol', 'Foreign Sell Vol', 'Room'];
  if (hasRealHoldingData) {
    columns.push('Holding Ratio');
  }
  const tableHeader = `| ${columns.join(' | ')} |`;
  
  // Build table rows
  const tableRows = history.map(row => {
    const cells = [row.code, formatVol(row.buyVol), formatVol(row.sellVol), formatVol(row.room)];
    if (hasRealHoldingData) {
      cells.push(fmtRatio(row.holdingRatio));
    }
    return `| ${cells.join(' | ')} |`;
  });
  
  // Build signal lines (conditionalize holdingRatioChange5d)
  let signalSection = '';
  if (hasRealHoldingData && signal.holdingRatioChange5d !== 0) {
    signalSection += `Holding ratio change (5d): ${signal.holdingRatioChange5d}%\n`;
  }
  
  return tableHeader + tableRows.join('\n') + signalSection;
}
```

### foreignFlowAnalyzer.ts — ForeignFlowSignal Update

```typescript
// Before:
type ForeignFlowSignal = {
  holdingRatioChange5d: number;
  // ...
}

// After:
type ForeignFlowSignal = {
  holdingRatioChange5d: number;
  is_holding_ratio_fabricated: boolean;  // NEW
  // ...
}

// In computeSignals() or similar:
const hasRealHoldingData = history.some(r => r.holdingRatio > 0);
const signal = {
  holdingRatioChange5d: hasRealHoldingData ? computeChange(history) : 0,
  is_holding_ratio_fabricated: !hasRealHoldingData,  // NEW
  // ...
};
```

### companyProfileTools.ts — get_company_profile Update

```typescript
// Before:
return {
  foreign_holding_ratio: row.current_holding_ratio ?? 0,  // always >= 0
  // ...
}

// After:
return {
  foreign_holding_ratio: (row.current_holding_ratio ?? 0) > 0 ? row.current_holding_ratio : null,
  // ...
}
```

### Test Updates

In foreignFlowTools.test.ts (or embedded test at line 186):

```typescript
// Before:
const output = formatForeignFlowOutput(history);
expect(output).toContain('| Holding Ratio |');

// After:
const output = formatForeignFlowOutput(history);
// history fixture has holdingRatio: 0, so column should be absent
expect(output).not.toContain('| Holding Ratio |');
```

---

## Test Plan

### Unit Tests

1. **T-U5-1:** formatForeignFlowOutput with hasRealHoldingData=true includes Holding Ratio column
2. **T-U5-2:** formatForeignFlowOutput with hasRealHoldingData=false excludes Holding Ratio column
3. **T-U5-3:** formatForeignFlowOutput with hasRealHoldingData=false excludes holdingRatioChange5d line
4. **T-U5-4:** ForeignFlowSignal.is_holding_ratio_fabricated = true when all values 0
5. **T-U5-5:** get_company_profile returns foreign_holding_ratio=null when 0
6. **T-U5-6:** get_company_profile returns foreign_holding_ratio=number when > 0

### Integration Tests

1. **T-U5-7:** Tool call with fixture holdingRatio=0 → output excludes Holding Ratio column
2. **T-U5-8:** No regression on existing columns (Foreign Buy Vol, etc.)

### QA Gate

**QA-U5-1:** Call `get_foreign_flow(code="HPG")` or similar. Verify raw JSON response:
- If holding_ratio data is real (> 0): Holding Ratio column present in output
- If holding_ratio fabricated (all 0): Holding Ratio column absent, holdingRatioChange5d line absent
- Tool description no longer mentions "holding ratio change"

**QA-U5-2:** Call `get_company_profile(code="HPG")`. Verify:
- If current_holding_ratio = 0: response foreign_holding_ratio = null
- If current_holding_ratio > 0: response foreign_holding_ratio = value

**QA-U5-3:** Verify zero regression: other columns (Foreign Buy Vol, etc.) still present and correct.

---

## Risk & Mitigation

**Risk R-U5-1:** Test breakage (existing assertions expect Holding Ratio column always present). Solution: update test assertions per AC-U5-6.

**Mitigation:** Comprehensive test re-auditing per implementation guidance.

**Risk R-U5-2:** Downstream consumers (dashboards, reports) expect foreign_holding_ratio field always present (even if null). Solution: emit null (not omit) so JSON schema doesn't change.

**Mitigation:** Per AC-U5-5, emit null (not omit).

**Risk R-U5-3:** is_holding_ratio_fabricated flag adds schema complexity. Solution: document in ForeignFlowSignal type comment.

**Mitigation:** JSDoc comment: "true when all holding_ratio values are 0 (fabricated per DSI invariant)".

---

## Rebuild Required

**Yes.** After code change:
```bash
docker compose build --no-cache mcp-server
docker compose up -d --no-deps --force-recreate mcp-server
```

QA verifies via `get_foreign_flow` + `get_company_profile` calls (raw JSON, not badge).

---

## Commit Checklist

- [ ] foreignFlowTools.ts updated (formatForeignFlowOutput gate)
- [ ] foreignFlowAnalyzer.ts updated (is_holding_ratio_fabricated flag)
- [ ] companyProfileTools.ts updated (foreign_holding_ratio null when 0)
- [ ] Test files updated (assertions on column presence)
- [ ] All tests pass (tsc exit 0)
- [ ] Tool descriptions updated (no "holding ratio change" mention)
- [ ] Commit message: `fix(U5): foreign flow null holding ratio — omit fabricated data per DSI`
- [ ] AC trailer appended per commit-convention.md

---

## Related Tasks

- Independent of: TSU-DEV-U1, TSU-DEV-U2-GEN, TSU-DEV-U3, TSU-DEV-U4, TSU-DEV-U6, TSU-DEV-U2-PARITY (separate tools)
- Parallel execution: can run while TSU-DEV-U3/U4 in progress (no contention)
