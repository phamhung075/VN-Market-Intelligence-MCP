# TASK 1295 Kickoff — Signal Payload Quality Enforcement

**status**: READY FOR DEVELOPER
**architecture**: Option A (Typed Builders)
**effort**: 18h
**subtasks**: 1295a, 1295b, 1295c, 1295d
**tech_ref**: `/docs/TECH_1295.md`

---

## Quick Summary

**Problem**: News Scout + Market Watcher emit incomplete signal payloads (missing confidence, direction, etc.). TECH-1293 added MCP tool validation (catches errors after construction). TECH-1295 adds **pre-emit typed builders** (prevents incomplete construction).

**Solution**: Create fluent builder classes that enforce all required fields before post_agent_signal() call.

**Example**:
```typescript
const finding = createChainCatalystBuilder()
  .setEventType("credit_policy")
  .setDirection("bullish")
  .setConfidence(0.8)
  .addStock("VIC")
  .addSector("Banking")
  .setHeadline("Central bank easing")
  .setSource("cafef")
  .build(); // Throws if any field missing

post_agent_signal(..., finding_data=finding, ...); // Safe post
```

---

## Subtask Breakdown

### 1295a: Signal Builders (8h)

**Branch**: `task/1295a-signal-builders`

**Files to create**:
- `src/domain/signals/signalBuilders.ts` (NEW, ~400 lines)

**Files to reference** (no changes):
- `src/domain/signals/signalTypes.ts` (TECH-1293a, provides Zod schemas)
- `src/domain/index.ts` (barrel export for builders)

**Implementation checklist**:

- [ ] **ChainCatalystBuilder** class
  - Constructor private (use factory function)
  - Setters: setEventType, setDirection, setConfidence, setHeadline, setSource
  - Array setters: addStock(code), addSector(name)
  - build() method: Validates against ChainCatalystFindingDataSchema, throws if incomplete
  - Error message format: "Chain catalyst builder missing: [list of fields]"

- [ ] **PriceConfirmationBuilder** class
  - Setters: setPriceChangePct, setVolumeRatio, setConfirmsDirection, setFullyPriced, setConfidence
  - build() validates against PriceConfirmationFindingDataSchema
  - Error message includes expected types (e.g., "confidence must be 0.0–1.0")

- [ ] **UrgentNewsBuilder** class
  - Setters: setHeadline, setSource, setSeverity
  - build() validates against UrgentNewsFindingDataSchema
  - Severity enum: "low" | "medium" | "high" | "critical"

- [ ] **CrossValidateBuilder** class
  - Setters: setDirection, setConfidence, setSummary
  - build() validates against CrossValidateFindingDataSchema

- [ ] **Factory functions** (exports)
  - `export function createChainCatalystBuilder(): ChainCatalystBuilder`
  - `export function createPriceConfirmationBuilder(): PriceConfirmationBuilder`
  - `export function createUrgentNewsBuilder(): UrgentNewsBuilder`
  - `export function createCrossValidateBuilder(): CrossValidateBuilder`

- [ ] **Barrel export** in `src/domain/index.ts`
  - Re-export all builders and factory functions

**RED Tests** (`src/__tests__/1295a-signal-builders.test.ts`, 16 test cases):

```typescript
describe("Signal Builders", () => {
  describe("ChainCatalystBuilder", () => {
    it("should build valid signal with all fields", () => { ... });
    it("should throw when missing event_type", () => { ... });
    it("should throw when missing direction", () => { ... });
    it("should throw when missing confidence", () => { ... });
    it("should throw when missing affected_stocks", () => { ... });
  });

  describe("PriceConfirmationBuilder", () => {
    it("should build valid signal with all fields", () => { ... });
    it("should throw when missing price_change_pct", () => { ... });
    it("should throw when missing confidence", () => { ... });
    it("should throw when confidence out of range", () => { ... });
    it("should coerce numeric string to number", () => { ... });
  });

  // Similar for UrgentNewsBuilder (4 cases) + CrossValidateBuilder (4 cases)
});
```

**Total assertions**: 16+ (all GREEN after implementation)

---

### 1295b: Agent Spec Updates (4h)

**Branch**: `task/1295b-agent-specs`

**Files to update**:
- `.claude/agents/01-news-scout.md` (Step 4: chain catalyst + urgent news signals)
- `.claude/agents/04-market-watcher.md` (Step 3.5: price confirmation signal)
- `docs/agent-memory/patterns/signal-payload-quality.md` (Prevention checklist)

**Update template for 01-news-scout.md**:

```markdown
### Step 4: Post Chain Catalyst Signal

4.1. **Import builder**:
```typescript
import { createChainCatalystBuilder } from "domain/signals";
```

4.2. **Construct using builder**:
```typescript
const finding = createChainCatalystBuilder()
  .setEventType("credit_policy")  // or: trade_war, earnings, macro, legal, crisis, sector_event
  .setDirection(newsDirection)  // bullish, bearish, or neutral
  .setConfidence(0.8)  // [0.0–1.0] based on source + confidence in narrative
  .addStock("VIC")
  .addStock("VNM")
  .addSector("Banking")
  .setHeadline(newsHeadline)
  .setSource("cafef")  // or: vnexpress, reuters, sbv
  .build();  // Throws if any required field missing
```

4.3. **Handle builder errors**:
```typescript
try {
  const finding = builder.build();
} catch (err) {
  // Log: "Signal builder error: ${err.message}"
  // Retry: Reconstruct builder with missing fields populated
}
```

4.4. **Post the signal**:
```typescript
post_agent_signal(
  from_agent="news-scout",
  to_agent="alert-commander",
  signal_type="chain_catalyst",
  stock_code=null,
  payload={ title: "...", detail: "...", impact_score: X },
  finding_data=finding,
  ...
);
```
```

**Same pattern for 04-market-watcher.md** (PriceConfirmationBuilder).

**Pattern update**:
- Add "Prevention Checklist (Post-TECH-1295)" section
- Document builder usage
- Link to TECH_1295.md

---

### 1295c: Signal Quality Audit (4h)

**Branch**: `task/1295c-signal-audit`

**Files to create**:
- `src/application/services/signalQualityAudit.ts` (NEW, ~200 lines)
- `src/scheduler/audits/monthlySignalQualityJob.ts` (NEW, ~100 lines)
- `src/interface/mcp/tools/diagnostics/signalQualityTools.ts` (NEW, ~150 lines)

**Implementation checklist**:

- [ ] **SignalQualityAudit service** (`src/application/services/signalQualityAudit.ts`)
  - Method: `queryRejectionStats(db, timeWindowDays: number)`
    - SQL: GROUP BY from_agent, signal_type; COUNT(*) rejections; ORDER BY count DESC
    - Return: `{ agent, signalType, rejectCount, topReason, timestamp }`
  - Method: `generateAuditReport(db, timeWindowDays: number)`
    - Calls queryRejectionStats()
    - Computes rejection_rate = total_rejections / total_signals
    - Generates markdown table + summary
    - Return: `{ rejectionRate, topRejectingAgent, reportMarkdown }`
  - Method: `insertAuditRecord(db, report)`
    - INSERT into signal_audit_log table (NEW)

- [ ] **Monthly cron job** (`src/scheduler/audits/monthlySignalQualityJob.ts`)
  - Trigger: 1st of month at 00:00 UTC (add to cron registry)
  - Calls generateAuditReport(days=30)
  - If rejection_rate > 0.02 (2%):
    - Send telegram alert to WORK channel
    - Message: "Signal Quality Warning: X% rejection rate detected. Top agent: Y. See /get_signal_quality_audit for details."
  - insertAuditRecord()

- [ ] **MCP tool** (`src/interface/mcp/tools/diagnostics/signalQualityTools.ts`)
  - Tool: `get_signal_quality_audit(days: 7 | 30 | 90)`
  - Returns: Markdown table + summary stats
  - Example output:
    ```
    Signal Quality Audit (7 days)
    =============================
    Agent           | Signal Type      | Rejects | Reason
    news-scout      | chain_catalyst   |    3    | missing confidence
    market-watcher  | price_confirm    |    1    | invalid volume_ratio

    Total rejections: 4 / 2847 signals = 0.14%
    Status: HEALTHY (target <0.5%)
    ```

- [ ] **DB migration** (add to schema.ts if not exists)
  - Table: `signal_audit_log` (id, from_agent, signal_type, reject_count, rejection_rate, report_json, created_at)
  - Index: (created_at) for monthly queries

**GREEN Tests** (`src/__tests__/1295c-signal-quality-audit.test.ts`, 10+ cases):

```typescript
describe("Signal Quality Audit", () => {
  it("should query rejection stats", () => { ... });
  it("should generate audit report", () => { ... });
  it("should identify top rejecting agent", () => { ... });
  it("should trigger alert if rejection_rate > 2%", () => { ... });
  it("should format markdown table correctly", () => { ... });
  it("should insert audit record", () => { ... });
  it("should handle empty rejections (0 rejections)", () => { ... });
  it("should compute rejection_rate as percentage", () => { ... });
  it("should filter by time window (days)", () => { ... });
  it("should order by reject count descending", () => { ... });
});
```

---

### 1295d: Integration Tests (2h)

**Branch**: `task/1295d-integration-test`

**File to create**:
- `src/__tests__/1295d-integration-builders-to-synthesis.test.ts` (NEW, ~300 lines)

**Test cases** (12+ assertions):

1. **Chain Catalyst → Synthesis** (3 cases)
   - Build complete chain_catalyst using builder
   - Post via MCP tool (should succeed, no rejection)
   - Retrieve from DB
   - Pass to chainSynthesizer
   - Assert: synthesis succeeds, conviction ≥ 0.65, no 0.3 penalty in logs

2. **Price Confirmation → Synthesis** (3 cases)
   - Build complete price_confirmation
   - Post + retrieve + synthesize
   - Assert: conviction correct, no fallback penalties

3. **Urgent News** (2 cases)
   - Build + post + retrieve
   - Assert: no rejection, data preserved

4. **Chain with Multiple Links** (3 cases)
   - Build chain_catalyst (depth=0) + price_confirmation (depth=1)
   - Synthesize both together
   - Assert: conviction = avg(cat_conf, price_conf), no penalties

5. **Error Case** (1 case)
   - Try to build incomplete signal
   - Assert: builder.build() throws with helpful message
   - Assert: error includes field name + expected type

---

## Execution Order

```
Day 1–2: 1295a (Signal Builders)
  ├─ Create signalBuilders.ts
  ├─ Write RED tests (failing)
  └─ Implement builders → GREEN tests

Day 2–3: 1295b (Agent Specs)
  ├─ Update .claude/agents/01-news-scout.md
  ├─ Update .claude/agents/04-market-watcher.md
  └─ Update patterns document

Day 3–4: 1295c (Audit Service)
  ├─ Create signalQualityAudit.ts
  ├─ Create monthlySignalQualityJob.ts
  ├─ Create signalQualityTools.ts
  ├─ Add DB migration (signal_audit_log)
  └─ Write GREEN tests

Day 4–5: 1295d (Integration)
  ├─ Create integration test file
  ├─ Write 12+ test cases
  └─ Run full test suite

Day 5: Cleanup
  ├─ Update TASKS.md (move to Review)
  ├─ Update agent-memory/modules/signalBuilders.md (NEW)
  └─ Commit + request QA review
```

---

## Key Files Reference

| File | Purpose | Status |
|------|---------|--------|
| `docs/TECH_1295.md` | Architecture decision + full context | REFERENCE |
| `src/domain/signals/signalTypes.ts` | Zod schemas (from TECH-1293a) | USE AS-IS |
| `src/interface/mcp/tools/news-analysis/agentSignalTools.ts` | MCP validation (from TECH-1293b) | USE AS-IS |
| `src/infrastructure/db/signalRejectionStore.ts` | Rejection logging (from TECH-1293c) | USE AS-IS |
| `src/domain/services/chainSynthesizer.ts` | Fallback logic (from TECH-1293d) | USE AS-IS |
| `docs/agent-memory/patterns/signal-payload-quality.md` | Prevention checklist | UPDATE (part of 1295b) |

---

## DDD Verification Checklist

Before committing:

- [ ] `src/domain/signals/signalBuilders.ts` → domain layer only (no infrastructure imports)
- [ ] Builders use Zod schemas from `signalTypes.ts` (no duplication)
- [ ] No cross-layer imports (builders don't import interface/ or scheduler/)
- [ ] Export from `src/domain/index.ts` barrel
- [ ] TypeScript: `bun tsc --noEmit` → 0 errors
- [ ] All tests: `bun test` → 16a + 10c + 12d = 38+ GREEN

---

## Questions?

- **Builder API unclear?** → See `TECH_1295.md` Section 5 for examples
- **How to integrate with agents?** → See agent spec examples in 1295b section
- **Test structure?** → Use existing test patterns from `1293a-signal-type-safety.test.ts`
- **DDD layer question?** → Ask Architect (no infrastructure coupling allowed)

---

## Success Criteria (Post-Merge)

- ✅ All 1295a–1295d tests GREEN
- ✅ Signal rejection rate <5 per 1000 posts (50% reduction from current 12–15)
- ✅ Agent specs updated + builders documented
- ✅ Monthly audit job running without errors
- ✅ Chain synthesizer: 0 confidence penalties in logs (over 7 days)

---

**Ready to start?** Create branch `task/1295a-signal-builders` and begin!
