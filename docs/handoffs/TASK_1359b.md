# TASK 1359b — Domain Logic Unit Tests: macroOutlierGuard + signalClassWeighter + forecastConfidenceScore + periodDeltaComputer (32 tests)

## Context

Sprint 1359. Domain layer. Four pure-function services with zero tests (or narrow
existing coverage). All are zero-I/O, zero-async. No mocks, no DI, no DB setup needed.
These underpin conviction scoring, cascade firing, and BCTC financial validation.

**Source files (read-only — no production changes):**
- `apps/mcp-server/src/domain/services/macroOutlierGuard.ts`
- `apps/mcp-server/src/domain/services/signalClassWeighter.ts`
- `apps/mcp-server/src/domain/services/forecastConfidenceScore.ts`
- `apps/mcp-server/src/domain/services/financial-reports/periodDeltaComputer.ts`

**Output file to create:**
- `apps/mcp-server/src/__tests__/1359b-domain-logic-gaps.test.ts`

---

## Coverage Gap Analysis

### periodDeltaComputer

`046-period-delta.test.ts` already covers: YoY/QoQ type tags, absolute + pct changes,
prev=0 → null, identical periods, negative-to-positive transitions, return shape.

**Gaps for 1359b** (8 tests):
- Negative previous for multiple metrics simultaneously
- All-zero metrics input (both current and previous zero)
- Large number precision (VND amounts in billions)
- Negative changeAbsolute when current < previous
- ratioChange (changePP) with negative difference
- `comparedTo` field is empty string (documented default)
- `deltaType` preserved for `QoQ` through ratio fields
- Very small float margins (grossMarginPct 0.001 precision)

### macroOutlierGuard

Zero existing tests.

### signalClassWeighter

Zero existing tests.

### forecastConfidenceScore

Zero existing tests.

---

## Section A — macroOutlierGuard (MOG-1 through MOG-8)

### Import

```typescript
import {
  validateMacroChangePercent,
  MacroAssetClass,
  type MacroOutlierResult,
} from "../domain/services/macroOutlierGuard.js";
```

### Thresholds (from source)

| Asset class | Threshold |
|-------------|-----------|
| EQUITY_INDEX | 25% |
| COMMODITY | 50% |
| PRECIOUS_METAL | 40% |

Anomaly condition: `Math.abs(changePercent) >= threshold` (inclusive).

### MOG-1: EQUITY_INDEX below threshold — isAnomaly false, reason null

`validateMacroChangePercent("VN-Index", 24.9, MacroAssetClass.EQUITY_INDEX)`.
Assert: `result.isAnomaly === false`.
Assert: `result.reason === null`.
Assert: `result.indicatorName === "VN-Index"`.
Assert: `result.changePercent === 24.9`.
Assert: `result.assetClass === MacroAssetClass.EQUITY_INDEX`.

### MOG-2: EQUITY_INDEX at exact threshold (25) — isAnomaly true

`validateMacroChangePercent("Dow Jones", 25, MacroAssetClass.EQUITY_INDEX)`.
Assert: `result.isAnomaly === true`.
Assert: `result.reason` is not null.
Assert: `result.reason` contains `"Dow Jones"`.
Assert: `result.reason` contains `"25%"`.
Assert: `result.reason` contains `"EQUITY_INDEX"`.
Assert: `result.reason` contains `"data_anomaly"`.

### MOG-3: EQUITY_INDEX negative at exact threshold (-25) — isAnomaly true

`validateMacroChangePercent("S&P 500", -25, MacroAssetClass.EQUITY_INDEX)`.
Assert: `result.isAnomaly === true`.
Rationale: `Math.abs(-25) >= 25` — threshold applies to absolute value.

### MOG-4: COMMODITY at exact threshold (50) — isAnomaly true

`validateMacroChangePercent("Brent Crude", 50, MacroAssetClass.COMMODITY)`.
Assert: `result.isAnomaly === true`.
Assert: `result.reason` contains `"50%"`.
Assert: `result.reason` contains `"COMMODITY"`.

### MOG-5: COMMODITY below threshold (49.9) — isAnomaly false

`validateMacroChangePercent("Brent Crude", 49.9, MacroAssetClass.COMMODITY)`.
Assert: `result.isAnomaly === false`.
Assert: `result.reason === null`.

### MOG-6: PRECIOUS_METAL at exact threshold (40) — isAnomaly true

`validateMacroChangePercent("Gold", 40, MacroAssetClass.PRECIOUS_METAL)`.
Assert: `result.isAnomaly === true`.
Assert: `result.reason` contains `"40%"`.

### MOG-7: PRECIOUS_METAL below threshold (39.9) — isAnomaly false

`validateMacroChangePercent("Silver", 39.9, MacroAssetClass.PRECIOUS_METAL)`.
Assert: `result.isAnomaly === false`.

### MOG-8: zero changePercent — always valid (isAnomaly false for all asset classes)

```typescript
for (const cls of Object.values(MacroAssetClass)) {
  const r = validateMacroChangePercent("test", 0, cls);
  expect(r.isAnomaly).toBe(false);
}
```

Assert: all three asset classes return `isAnomaly === false` for changePercent = 0.

---

## Section B — signalClassWeighter (SCW-1 through SCW-8)

### Import

```typescript
import {
  computeWeightedConvictionScore,
  SIGNAL_CLASS_WEIGHTS,
  DEFAULT_SIGNAL_WEIGHT,
  type WeightedSignalInput,
} from "../domain/services/signalClassWeighter.js";
```

### Weight map (from source, locked by REQ_056)

| Class | Weight |
|-------|--------|
| structural_factor | 1.5 |
| cyclical | 1.0 |
| technical_signal | 0.8 |
| one_time_catalyst | 0.7 |
| sentiment | 0.5 |
| null / undefined | 1.0 |

Formula: `sum(score_i * weight_i) / sum(weight_i)`, clamped to [0, 1].

### SCW-1: empty array returns 0

`computeWeightedConvictionScore([])`.
Assert: result `=== 0`.

### SCW-2: single structural_factor signal — score passes through unchanged

```typescript
const result = computeWeightedConvictionScore([
  { score: 0.8, signalClass: "structural_factor" },
]);
// (0.8 * 1.5) / 1.5 = 0.8
```
Assert: `result` is close to `0.8` (tolerance 1e-9).

### SCW-3: single sentiment signal — score passes through unchanged

```typescript
const result = computeWeightedConvictionScore([
  { score: 0.6, signalClass: "sentiment" },
]);
// (0.6 * 0.5) / 0.5 = 0.6
```
Assert: `result` is close to `0.6`.

### SCW-4: null signalClass uses default weight 1.0

```typescript
const result = computeWeightedConvictionScore([
  { score: 0.7, signalClass: null },
]);
// (0.7 * 1.0) / 1.0 = 0.7
```
Assert: `result` is close to `0.7`.

### SCW-5: undefined signalClass uses default weight 1.0

```typescript
const result = computeWeightedConvictionScore([
  { score: 0.5, signalClass: undefined },
]);
```
Assert: `result` is close to `0.5`.

### SCW-6: multi-class blend — structural vs one_time_catalyst

```typescript
// From JSDoc example in source:
// (0.6*1.5 + 0.9*0.7) / (1.5+0.7) = (0.9 + 0.63) / 2.2 = 1.53/2.2 ≈ 0.6954...
const result = computeWeightedConvictionScore([
  { score: 0.6, signalClass: "structural_factor" },
  { score: 0.9, signalClass: "one_time_catalyst" },
]);
```
Assert: `result` is close to `1.53 / 2.2` (tolerance 1e-6).
Also assert: `result < 0.75` — weighted average does NOT equal the simple average (0.75).

### SCW-7: all five signal classes blend — result is clamped to [0, 1]

```typescript
const inputs: WeightedSignalInput[] = [
  { score: 1.0, signalClass: "structural_factor" },
  { score: 1.0, signalClass: "cyclical" },
  { score: 1.0, signalClass: "technical_signal" },
  { score: 1.0, signalClass: "one_time_catalyst" },
  { score: 1.0, signalClass: "sentiment" },
];
const result = computeWeightedConvictionScore(inputs);
// All scores=1.0 → weighted avg = 1.0 regardless of weights
```
Assert: `result === 1.0` (clamping to 1 after floating-point).
Assert: `result >= 0` and `result <= 1`.

### SCW-8: mixed null + classified signals — null treated as neutral weight (1.0)

```typescript
const result = computeWeightedConvictionScore([
  { score: 0.8, signalClass: "structural_factor" }, // weight 1.5
  { score: 0.4, signalClass: null },                // weight 1.0
]);
// (0.8*1.5 + 0.4*1.0) / (1.5+1.0) = (1.2 + 0.4) / 2.5 = 1.6/2.5 = 0.64
```
Assert: `result` is close to `0.64` (tolerance 1e-6).

---

## Section C — forecastConfidenceScore (FCS-1 through FCS-8)

### Import

```typescript
import {
  forecastConfidenceScore,
  isSanctionActive,
  pickStrictestActiveSanction,
  SANCTION_MULTIPLIER,
  type BrokerSanction,
} from "../domain/services/forecastConfidenceScore.js";
```

### Multipliers (from source)

| Severity | Multiplier |
|----------|-----------|
| warning | 0.5 |
| suspension | 0.2 |
| none (no active sanction) | 1.0 |

### FCS-1: no sanctions — multiplier 1.0, confidence unchanged

```typescript
const result = forecastConfidenceScore("TVS", 0.8, [], "2026-04-06");
```
Assert: `result.multiplier === 1`.
Assert: `result.adjustedConfidence === 0.8`.
Assert: `result.baseConfidence === 0.8`.
Assert: `result.activeSanction === null`.
Assert: `result.reason === "Không có chế tài SSC đang hiệu lực"`.

### FCS-2: active warning — multiplier 0.5

```typescript
const sanctions: BrokerSanction[] = [{
  brokerName: "TVS",
  sanctionStart: "2026-03-01",
  sanctionEnd: null,
  severity: "warning",
}];
const result = forecastConfidenceScore("TVS", 0.8, sanctions, "2026-04-06");
```
Assert: `result.multiplier === 0.5`.
Assert: `Math.abs(result.adjustedConfidence - 0.4) < 1e-9`.
Assert: `result.activeSanction` is not null.
Assert: `result.activeSanction!.severity === "warning"`.

### FCS-3: active suspension — multiplier 0.2

```typescript
const sanctions: BrokerSanction[] = [{
  brokerName: "TVS",
  sanctionStart: "2026-01-01",
  sanctionEnd: null,
  severity: "suspension",
}];
const result = forecastConfidenceScore("TVS", 0.9, sanctions, "2026-04-06");
```
Assert: `result.multiplier === 0.2`.
Assert: `Math.abs(result.adjustedConfidence - 0.18) < 1e-9`.
Assert: `result.reason` contains `"đình chỉ hoạt động"`.

### FCS-4: expired sanction — treated as no active sanction

```typescript
const sanctions: BrokerSanction[] = [{
  brokerName: "TVS",
  sanctionStart: "2025-01-01",
  sanctionEnd: "2025-06-30",
  severity: "warning",
}];
const result = forecastConfidenceScore("TVS", 0.8, sanctions, "2026-04-06");
```
Assert: `result.multiplier === 1`.
Assert: `result.adjustedConfidence === 0.8`.
Assert: `result.activeSanction === null`.

### FCS-5: future sanction (not yet started) — treated as no active sanction

```typescript
const sanctions: BrokerSanction[] = [{
  brokerName: "TVS",
  sanctionStart: "2026-05-01",
  sanctionEnd: null,
  severity: "suspension",
}];
const result = forecastConfidenceScore("TVS", 0.8, sanctions, "2026-04-06");
```
Assert: `result.multiplier === 1`.
Assert: `result.activeSanction === null`.

### FCS-6: strictest sanction wins when both warning and suspension are active

```typescript
const sanctions: BrokerSanction[] = [
  {
    brokerName: "TVS",
    sanctionStart: "2026-01-01",
    sanctionEnd: null,
    severity: "warning",
  },
  {
    brokerName: "TVS",
    sanctionStart: "2026-02-01",
    sanctionEnd: null,
    severity: "suspension",
  },
];
const result = forecastConfidenceScore("TVS", 1.0, sanctions, "2026-04-06");
```
Assert: `result.multiplier === 0.2` (suspension wins over warning).
Assert: `result.activeSanction!.severity === "suspension"`.

### FCS-7: broker name matching is case-insensitive and trims whitespace

```typescript
const sanctions: BrokerSanction[] = [{
  brokerName: "  TVS  ",
  sanctionStart: "2026-01-01",
  sanctionEnd: null,
  severity: "warning",
}];
// Input broker name uses different casing + no spaces
const result = forecastConfidenceScore("tvs", 0.8, sanctions, "2026-04-06");
```
Assert: `result.multiplier === 0.5` (sanction found via normalised comparison).

### FCS-8: isSanctionActive boundary — sanction active on start and end date

```typescript
const s: BrokerSanction = {
  brokerName: "X",
  sanctionStart: "2026-03-01",
  sanctionEnd: "2026-03-31",
  severity: "warning",
};
```
Assert: `isSanctionActive(s, "2026-03-01") === true` (start date inclusive).
Assert: `isSanctionActive(s, "2026-03-31") === true` (end date inclusive).
Assert: `isSanctionActive(s, "2026-02-28") === false` (one day before start).
Assert: `isSanctionActive(s, "2026-04-01") === false` (one day after end).

---

## Section D — periodDeltaComputer gap tests (PDC-1 through PDC-8)

### Import

```typescript
import {
  computePeriodDelta,
  type FinancialMetrics,
} from "../domain/services/financial-reports/periodDeltaComputer.js";
```

These 8 tests extend `046-period-delta.test.ts` without duplicating it. The existing
test covers: YoY/QoQ tags, pct change, prev=0 → null, identical periods, negative
previous, return shape.

### Shared fixture

```typescript
const base: FinancialMetrics = {
  netRevenue: 1_000_000, grossProfit: 250_000, operatingProfit: 150_000,
  netProfit: 120_000, ebitda: 180_000, eps: 1_200,
  totalAssets: 5_000_000, equity: 2_000_000, totalDebt: 1_500_000, cash: 300_000,
  operatingCF: 200_000, freeCashFlow: 140_000,
  grossMarginPct: 25.0, netMarginPct: 12.0, roe: 6.0, debtToEquity: 0.75,
};
```

### PDC-1: all-zero metrics — changePct is null for all ValueChange fields

```typescript
const zeros: FinancialMetrics = {
  netRevenue: 0, grossProfit: 0, operatingProfit: 0, netProfit: 0,
  ebitda: 0, eps: 0, totalAssets: 0, equity: 0, totalDebt: 0, cash: 0,
  operatingCF: 0, freeCashFlow: 0,
  grossMarginPct: 0, netMarginPct: 0, roe: 0, debtToEquity: 0,
};
const result = computePeriodDelta(zeros, zeros, "YoY");
```
Assert: `result.netRevenue.changePct === null` (prev=0 rule).
Assert: `result.netProfit.changePct === null`.
Assert: `result.grossMarginPP.changePP === 0` (ratio fields use subtraction, not division).

### PDC-2: current < previous — negative changeAbsolute

```typescript
const lower: FinancialMetrics = { ...base, netRevenue: 700_000 };
const result = computePeriodDelta(lower, base, "YoY");
// changeAbsolute = 700_000 - 1_000_000 = -300_000
// changePct = (-300_000 / 1_000_000) * 100 = -30%
```
Assert: `result.netRevenue.changeAbsolute === -300_000`.
Assert: `result.netRevenue.changePct` is close to `-30.0` (tolerance 1e-5).

### PDC-3: large VND numbers — precision preserved (no overflow)

```typescript
const large: FinancialMetrics = {
  ...base,
  netRevenue: 500_000_000,   // 500 billion VND (large listed company)
  totalAssets: 2_000_000_000,
};
const largePrev: FinancialMetrics = {
  ...base,
  netRevenue: 400_000_000,
  totalAssets: 1_800_000_000,
};
const result = computePeriodDelta(large, largePrev, "YoY");
```
Assert: `result.netRevenue.changeAbsolute === 100_000_000`.
Assert: `result.netRevenue.changePct` is close to `25.0` (tolerance 1e-5).
Assert: `result.totalAssets.changeAbsolute === 200_000_000`.

### PDC-4: negative previous for multiple metrics — all return null changePct

```typescript
const negativePrev: FinancialMetrics = {
  ...base,
  netProfit: -50_000,
  operatingProfit: -20_000,
  freeCashFlow: -10_000,
};
const result = computePeriodDelta(base, negativePrev, "YoY");
```
Assert: `result.netProfit.changePct === null`.
Assert: `result.operatingProfit.changePct === null`.
Assert: `result.freeCashFlow.changePct === null`.
Assert: `result.netRevenue.changePct` is a number (previous was positive — unaffected).

### PDC-5: ratioChange with negative pp difference

```typescript
const lowerMargin: FinancialMetrics = { ...base, grossMarginPct: 20.0, roe: 4.5 };
const result = computePeriodDelta(lowerMargin, base, "YoY");
// grossMarginPP: 20.0 - 25.0 = -5.0
// roePP: 4.5 - 6.0 = -1.5
```
Assert: `result.grossMarginPP.changePP` is close to `-5.0` (tolerance 1e-5).
Assert: `result.roePP.changePP` is close to `-1.5` (tolerance 1e-5).
Assert: `result.grossMarginPP.current === 20.0`.
Assert: `result.grossMarginPP.previous === 25.0`.

### PDC-6: comparedTo field defaults to empty string

```typescript
const result = computePeriodDelta(base, base, "QoQ");
```
Assert: `result.comparedTo === ""`.

Rationale: the source code documents this as the safe default when callers don't set
a period key. Verifying it ensures callers know to populate it themselves.

### PDC-7: deltaType flows correctly into QoQ result alongside ratio fields

```typescript
const result = computePeriodDelta(base, { ...base, debtToEquity: 0.60 }, "QoQ");
```
Assert: `result.deltaType === "QoQ"`.
Assert: `result.debtToEquityPP.changePP` is close to `0.75 - 0.60 = 0.15` (tolerance 1e-5).

Rationale: confirms that neither ratio fields nor QoQ tag corrupt each other.

### PDC-8: small float margin precision — changePP correct to 3 decimal places

```typescript
const marginA: FinancialMetrics = { ...base, grossMarginPct: 24.123 };
const marginB: FinancialMetrics = { ...base, grossMarginPct: 23.456 };
const result = computePeriodDelta(marginA, marginB, "YoY");
// changePP = 24.123 - 23.456 = 0.667
```
Assert: `result.grossMarginPP.changePP` is close to `0.667` (tolerance 1e-3).

Rationale: validates that floating-point arithmetic at 3 decimal places is stable
for the ratio fields used in analyst display.

---

## DI Strategy Summary

All four services are pure functions. No DB, no env vars, no dynamic imports.

| Service | DI needed | Setup |
|---------|-----------|-------|
| `validateMacroChangePercent` | none | direct call |
| `computeWeightedConvictionScore` | none | direct call |
| `forecastConfidenceScore` | none | inline `BrokerSanction[]` |
| `computePeriodDelta` | none | inline `FinancialMetrics` fixtures |

No `beforeEach`, no `afterEach`, no `mock.module` needed in this file.

---

## Constraints

- No production file changes.
- No `Bun.env` setup needed (no DB path used).
- All 32 tests must pass in the baseline suite (`bun test`).
- Test file path: `apps/mcp-server/src/__tests__/1359b-domain-logic-gaps.test.ts`
- Do not duplicate test cases from `046-period-delta.test.ts` — PDC tests are additive.

---

## Acceptance Criteria (from SPRINT_GOAL.md)

- 32 new tests, all green.
- Covers boundary values, null/edge inputs, weighted-average formula.
- Full suite: prior baseline + 32 = at minimum 7 788 pass (plus whatever 1359a adds).
- 0 TS errors.
