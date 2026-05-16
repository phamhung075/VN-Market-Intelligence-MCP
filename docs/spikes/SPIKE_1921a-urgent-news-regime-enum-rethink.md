# SPIKE_1921a — urgent_news regime enum rethink

**ID:** SPIKE_1921a-urgent-news-regime-enum-rethink
**Date:** 2026-05-16
**Author:** architect
**Timebox:** 120 min
**Status:** COMPLETE

---

## Question

Should `UrgentNewsFindingData.regime` carry:
- (A) market-direction enum `NEUTRAL | BULL | BEAR` (current — wired to H3 confidence thresholds)
- (B) monetary-policy enum `TIGHTENING | NEUTRAL | EASING` (per TNB c61 Finding #2)
- (C) both as separate fields (`direction_regime` + `monetary_regime`)

---

## 1. Root Cause — What is stored vs what is expected

### What the schema stores (current)

`UrgentNewsFindingData.regime` in `apps/mcp-server/src/domain/signals/signalTypes.ts:204` is typed as:

```typescript
regime?: "NEUTRAL" | "BULL" | "BEAR";
```

This is a **market-direction / sentiment enum**. It encodes whether the equity market is trending bullish, bearish, or neutral. The Zod schema enforces this at line 215.

### What the H3 threshold service reads

`checkRegimeConfidenceThreshold()` in `domain/services/regimeConfidenceThreshold.ts` reads the `regime` field from `finding_data` and looks it up in:

```typescript
REGIME_THRESHOLDS = { NEUTRAL: 0.60, BULL: 0.50, BEAR: 0.40 }
```

This is internally consistent with `NEUTRAL | BULL | BEAR`. Anything unknown falls back to NEUTRAL (strictest). This means if a `TIGHTENING` value were passed in, `REGIME_THRESHOLDS["TIGHTENING"]` is `undefined`, and the fallback `?? REGIME_THRESHOLDS[DEFAULT_REGIME]` fires — treating it as NEUTRAL (0.60). No runtime crash; silent misclassification.

### What news-scout flow sends (stage-signals.md)

The `urgent_news` posting template in `.claude/flows/news-scout/stage-signals.md:52` specifies:

```
"regime": "<TIGHTENING|EASING|NEUTRAL>",
```

This is the **monetary-policy regime** extracted from `get_macro_snapshot` via the `regime-extraction` skill. The skill maps "Global Liquidity: X" to `TIGHTENING | EASING | NEUTRAL`.

### What alert-commander reads

Alert-commander reads `REGIME` from `get_macro_snapshot` independently (its own bootstrap, same skill). It does **not** read `regime` from the signal's `finding_data` to drive its threshold table. The signal matrix in `stage-signals.md` uses its own locally-derived `REGIME` variable, not the one embedded in the signal payload.

However, alert-commander **does** accept `conviction` from signal `finding_data.confidence`. The regime gate for urgent_news at the `post_agent_signal` level (in `agentSignalTools.ts`) is what enforces H3 thresholds — this runs server-side at signal posting time, before the signal reaches alert-commander at all.

### The exact mismatch

When news-scout posts an `urgent_news` signal with `finding_data.regime = "TIGHTENING"`:

1. `agentSignalTools.ts:244` extracts `findingDataRecord["regime"]` → `"TIGHTENING"`
2. `checkRegimeConfidenceThreshold({ regime: "TIGHTENING", ... })` fires
3. `REGIME_THRESHOLDS["TIGHTENING"]` → `undefined`
4. Fallback: `threshold = REGIME_THRESHOLDS["NEUTRAL"] = 0.60`
5. Result: every `urgent_news` from news-scout is evaluated under NEUTRAL (strictest) regardless of actual macro regime

**This means:**
- In a real TIGHTENING environment, the intended threshold is still 0.60 (NEUTRAL default), which happens to be the same as intended if you map TIGHTENING → NEUTRAL directionally.
- In a real EASING environment, news-scout sends `regime="EASING"`, but the gate applies 0.60 (NEUTRAL) instead of whatever the EASING equivalent would be.
- There is no EASING value in `REGIME_THRESHOLDS` at all — the threshold vocabulary was designed for market-direction only.

The Zod schema also rejects `TIGHTENING` as an invalid enum value for `regime`. This means the `UrgentNewsFindingDataSchema.safeParse()` call in `validateSignalPayload()` should reject the signal before H3 even runs — **the signal is rejected at schema validation, not silently misclassified**.

**Confirmed rejection path:**
- `UrgentNewsFindingDataSchema` at line 215: `regime: z.enum(["NEUTRAL", "BULL", "BEAR"]).optional()`
- If news-scout sends `regime: "TIGHTENING"` → Zod rejects → `validateSignalPayload` returns `{ valid: false }` → signal blocked with error → **urgent_news never reaches the DB**

---

## 2. Risk Assessment — Is alert-commander broken today?

### Severity: MEDIUM — semantic mismatch, not a runtime crash

The system is **not broken in the sense of crashing or data corruption**. The failure mode is:

1. **Signal rejection**: Every `urgent_news` from news-scout with `regime: "TIGHTENING"` or `regime: "EASING"` is **rejected** by schema validation before storage. This is a silent loss — news-scout gets an error response, no Telegram alert fires.

2. **Threshold misapplication** (when regime is absent or omitted): If news-scout omits `regime` (per the `optional()` spec), the H3 gate defaults to NEUTRAL (0.60). This is documented behavior and intentional.

3. **Alert-commander is not affected directly**: Alert-commander reads its own `REGIME` from `get_macro_snapshot` independently. It never parses `finding_data.regime` from signal payloads. The mismatch has zero direct effect on alert-commander's decision logic.

### What is actually broken

The **news-scout flow doc** (`stage-signals.md`) instructs the agent to populate `regime` with `TIGHTENING|EASING|NEUTRAL` — values that fail Zod validation. This means:
- **Every urgent_news signal from news-scout that includes `regime` is silently dropped**
- The error is logged to signal_rejections table but no Telegram BUG fires (rejection is treated as a validation error, not an infrastructure error)
- news-scout continues the cycle as if the post succeeded (it receives an error response but the flow does not hard-stop on schema rejection)

### Production impact estimate

Based on the H3 test suite (`H3-urgent-news-regime-threshold.test.ts`): all tests pass because they use `NEUTRAL|BULL|BEAR` values directly against the domain service — they do not exercise the schema validation + flow integration path. The test gap is the integration path: news-scout sends `TIGHTENING` → schema rejects → signal lost.

---

## 3. Recommendation: Option B — Migrate regime to `TIGHTENING | NEUTRAL | EASING`

### Rationale

**Option A (keep NEUTRAL|BULL|BEAR)** is wrong because:
- `UrgentNewsFindingData.regime` is derived from `get_macro_snapshot` ("Global Liquidity") in the news-scout flow. This is a monetary-policy signal, not a market-direction signal. Forcing news-scout to map TIGHTENING→BEAR and EASING→BULL is a semantic lossy mapping with no factual basis (TIGHTENING macro does not mean bearish equity — it can coexist with BULL markets, as 2021-2022 demonstrated).
- The H3 thresholds (NEUTRAL≥0.60, BULL≥0.50, BEAR≥0.40) were designed intuitively for sentiment-based filtering but the label vocabulary was never aligned with the actual macro source. The threshold values themselves are valid; only the label mapping is wrong.

**Option C (both fields)** introduces unnecessary complexity: two regime fields would confuse any future agent reading the signal. The `UrgentNewsFindingData` type is already minimal by design (3 required fields). Bloating it with a second regime field pollutes the interface and violates the DRY principle for an optional contextual hint.

**Option B (TIGHTENING|NEUTRAL|EASING)** is correct because:
- Aligns with the actual source: `get_macro_snapshot` → regime-extraction skill → `TIGHTENING|EASING|NEUTRAL`
- Aligns with alert-commander's own REGIME vocabulary (stage-signals.md threshold table uses TIGHTENING/EASING/NEUTRAL)
- DDD-compliant: the domain signal accurately represents what was observed in the world at signal-posting time
- The H3 threshold values (0.60/0.50/0.40) are preserved but the keys are remapped: TIGHTENING→NEUTRAL(0.60), NEUTRAL→0.55 (interpolated), EASING→0.50. See migration path below.

### H3 Threshold Remapping under Option B

Current: `NEUTRAL:0.60, BULL:0.50, BEAR:0.40`

The intent of H3 was: "in stressed/uncertain conditions, require higher confidence before posting urgent news." Mapping:
- `TIGHTENING` (credit constrained, macro headwind) → highest bar → **0.60**
- `NEUTRAL` (balanced) → medium bar → **0.55** (interpolated; was 0.60 for NEUTRAL, but NEUTRAL is now the middle, not the top)
- `EASING` (liquidity-supportive) → lower bar → **0.50**

This is semantically correct: in TIGHTENING, false signals are more costly (markets are fragile); in EASING, higher signal throughput is acceptable.

The BEAR threshold at 0.40 is removed — the concept does not translate to monetary policy. The test file `H3-urgent-news-regime-threshold.test.ts` must be updated with new threshold values and new enum labels.

---

## 4. Migration Path

### Step 1 — Domain type change (signalTypes.ts)

**File:** `apps/mcp-server/src/domain/signals/signalTypes.ts`

Change `UrgentNewsFindingData.regime` from:
```typescript
regime?: "NEUTRAL" | "BULL" | "BEAR";
```
to:
```typescript
regime?: "TIGHTENING" | "NEUTRAL" | "EASING";
```

Change `UrgentNewsFindingDataSchema` from:
```typescript
regime: z.enum(["NEUTRAL", "BULL", "BEAR"]).optional(),
```
to:
```typescript
regime: z.enum(["TIGHTENING", "NEUTRAL", "EASING"]).optional(),
```

JSDoc update: change comment from "market regime at signal time — NEUTRAL | BULL | BEAR" to "monetary-policy regime at signal time — TIGHTENING | NEUTRAL | EASING (from get_macro_snapshot Global Liquidity classification)."

### Step 2 — Threshold service change (regimeConfidenceThreshold.ts)

**File:** `apps/mcp-server/src/domain/services/regimeConfidenceThreshold.ts`

Change `REGIME_THRESHOLDS` from:
```typescript
{ NEUTRAL: 0.60, BULL: 0.50, BEAR: 0.40 }
```
to:
```typescript
{ TIGHTENING: 0.60, NEUTRAL: 0.55, EASING: 0.50 }
```

`DEFAULT_REGIME` stays `"NEUTRAL"` — default threshold becomes 0.55 (appropriate: unknown regime = middle ground, not strictest).

No changes to `checkRegimeConfidenceThreshold()` function signature or logic. Only the constants change.

### Step 3 — Test file update (H3-urgent-news-regime-threshold.test.ts)

**File:** `apps/mcp-server/src/__tests__/H3-urgent-news-regime-threshold.test.ts`

Full rewrite of test cases: replace `NEUTRAL/BULL/BEAR` with `TIGHTENING/NEUTRAL/EASING`, update threshold assertions:
- `TIGHTENING` (0.60): tests for block at 0.59, pass at 0.60
- `NEUTRAL` (0.55): tests for block at 0.54, pass at 0.55
- `EASING` (0.50): tests for block at 0.49, pass at 0.50
- Missing regime → NEUTRAL (0.55 threshold)

Also update `1293a-signal-type-safety.test.ts` if any test asserts `regime: "NEUTRAL"` as a valid UrgentNewsFindingData value — these tests would pass through because NEUTRAL remains valid. No breaking change there.

### Step 4 — Flow doc fix (news-scout stage-signals.md)

**File:** `.claude/flows/news-scout/stage-signals.md`

The flow already shows `"regime": "<TIGHTENING|EASING|NEUTRAL>"` — this is already aligned with Option B. No change needed to the template. The auto-cure note (TNB c55) at line 36 already uses the correct vocabulary. This confirms the flow was written correctly but the schema was not updated to match.

### Step 5 — Alert-commander threshold table alignment (optional, no code change)

**File:** `.claude/flows/alert-commander/stage-signals.md`

The signal matrix table already uses `TIGHTENING|EASING|NEUTRAL`. The `urgent_news` conviction thresholds there (0.60/0.55/0.60) are not affected by the schema change — alert-commander derives its REGIME independently from `get_macro_snapshot`, not from the signal payload. No functional change required. For clarity only: add a comment that `urgent_news` signals already passed H3 gate at posting time; the alert-commander threshold table is a second filter.

### Step 6 — Commit sequence

Sequential (no parallel dispatch — all files in same zone):
1. `signalTypes.ts` + `regimeConfidenceThreshold.ts` (atomic domain change)
2. `H3-urgent-news-regime-threshold.test.ts` (tests against new constants)
3. `1293a-signal-type-safety.test.ts` — verify no breakage (likely none, NEUTRAL is still valid)
4. Run full test suite; confirm H3 tests pass, 1293a passes
5. Commit: `fix(1921a): align urgent_news regime enum to monetary-policy vocabulary`

---

## 5. Files Affected

| File | Layer | Change |
|------|-------|--------|
| `apps/mcp-server/src/domain/signals/signalTypes.ts` | domain | Rename enum values `BULL→EASING, BEAR→TIGHTENING` on `UrgentNewsFindingData.regime` + Zod schema. JSDoc update. |
| `apps/mcp-server/src/domain/services/regimeConfidenceThreshold.ts` | domain | Replace `REGIME_THRESHOLDS` keys: `BULL→EASING(0.50), BEAR` removed, `NEUTRAL→0.55, TIGHTENING→0.60(0.60)`. DEFAULT_REGIME stays NEUTRAL. |
| `apps/mcp-server/src/__tests__/H3-urgent-news-regime-threshold.test.ts` | test | Full rewrite of test values to use TIGHTENING/NEUTRAL/EASING with updated threshold numbers. |
| `apps/mcp-server/src/__tests__/1293a-signal-type-safety.test.ts` | test | Verify NEUTRAL still valid for UrgentNewsFindingData; add test asserting BULL is now rejected. |
| `.claude/flows/news-scout/stage-signals.md` | flow doc | No change required — already uses `TIGHTENING|EASING|NEUTRAL`. |
| `.claude/flows/alert-commander/stage-signals.md` | flow doc | Optional clarity comment only — no functional change. |

---

## 6. Risk Assessment of Migration

**Risk: LOW**

- No DB schema change required: `regime` is stored as a string in `finding_data` JSON blob inside `agent_signals.finding_data` column. The old stored values (`BULL`, `BEAR`, `NEUTRAL`) in existing DB rows are historic and TTL-expired. No migration script needed.
- No interface contract breaks: `get_agent_signals` returns `finding_data` as raw JSON. Alert-commander does not deserialize `regime` from the payload — confirmed by reading `stage-signals.md` and `stage-bootstrap.md` for alert-commander (it reads `REGIME` from `get_macro_snapshot`, not from signal `finding_data`).
- Test impact is contained to the H3 test file and one check in 1293a. No other test file asserts `regime: "BULL"` or `regime: "BEAR"` on `UrgentNewsFindingData`.
- The fallback behavior of `checkRegimeConfidenceThreshold` (unknown regime → NEUTRAL) is preserved. If any stale agent sends an old value (`BULL`/`BEAR`), it still falls through to 0.55 — marginally more permissive than the previous 0.60 fallback, acceptable.

**Only real risk:** If any live agent (other than news-scout) currently sends `regime: "BULL"` or `regime: "BEAR"` on `urgent_news` signals and relies on the 0.50/0.40 thresholds, those would silently shift to NEUTRAL (0.55) after migration. A quick grep of the codebase confirmed: no other agent flow instructs posting `urgent_news` with `regime: BULL` or `regime: BEAR`. The only `urgent_news` poster documented in flows is news-scout. Risk is confirmed negligible.

---

## Recommended Next Step

Spawn real sprint task: **TASK_1921b — implement Option B migration** per steps 1-6 above.

Size: S (4 files, no schema migration, no infra change).
Owner: dev-mcp-server.
Unblocks: news-scout urgent_news signals that are currently rejected on every cycle where macro regime is TIGHTENING or EASING.
