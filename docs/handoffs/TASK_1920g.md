# TASK 1920g — Auto-populate prediction_claims from intelligenceCycleJob

**Sprint:** 1920 | **Tier:** 4 | **Type:** FIX | **Zone:** apps/mcp-server/ | **Size:** S
**DDD Layer:** application + interface/scheduler
**Owner:** dev-mcp-server
**Status:** Ready for Dev

---

## Context

`insertPredictionClaim()` exists in `infrastructure/db/predictionClaimStore.ts`. Currently the only caller is `interface/mcp/tools/macro/evidenceTools.ts` (manual MCP call from cowork agents).

`intelligenceCycleJob.ts` runs every 15 min. Step G (`runChainSynthesis`) already produces `SynthesizedChain` objects with a `conviction` score and `action` field. High-conviction chains (`conviction >= 0.7`) are posted as `verified_chain` signals to `alert-commander`. These are forecasts — they predict that a stock will move based on multi-agent chain evidence.

The sprint goal is to wire `insertPredictionClaim()` from the cycle output so claims accumulate without user input. Acceptance: ≥10 claim rows/week post-deploy.

---

## Architectural Decision (BA recommendation)

**Wire from Step G (chain synthesis), not from Step E (alert dispatch).**

Rationale:
- Step G already has `action` (bullish/bearish/neutral), `conviction` (0–1), `stock`, and `narrative` — all fields required for `PredictionClaimInput`.
- Step E alert dispatch is about notification; step G is about intelligence synthesis. Prediction claims are intelligence artifacts, not alert artifacts.
- Step G produces `chain.conviction`, `chain.action`, and `chain.narrative` which map directly to `confidence`, `direction`, and `claim_text`.

**Alternative rejected:** Wiring from `post_agent_signal` handler — too broad (every signal would generate a claim; most signals are not forward-looking predictions).

---

## Requirements

### FR-1 — Extend CycleDeps with insertClaimFn
**DDD layer:** application/interface

Add optional `insertClaimFn?: (params: PredictionClaimInput) => number` to `CycleDeps` in `intelligenceCycleJob.ts`. When not injected, defaults to `insertPredictionClaim(db, params)` using the cycle's DB connection.

### FR-2 — Wire claim insertion in runChainSynthesis (or inline in Step G)
**DDD layer:** application/interface

After `postSignal(db, { signalType: "verified_chain", ... })` for each `chain.conviction >= 0.7`, call `insertClaimFn` with:

```typescript
{
  stock:           stock,                          // stock code from byStock loop
  agent_id:        "chain-synthesizer",
  claim_text:      chain.narrative.slice(0, 255),  // cap to prevent DB overflow
  direction:       mapChainAction(chain.action),   // see FR-3
  target_price:    null,                           // chain synthesis has no price target
  creation_price:  null,                           // no price context at synthesis time
  resolution_date: isoDatePlusDays(7),             // 7-day horizon (cascade is 3d–7d)
  confidence:      chain.conviction,               // already 0–1
}
```

Wrap in try/catch — claim write failure is non-fatal; log `console.warn`.

### FR-3 — mapChainAction helper (pure function)
**DDD layer:** domain (or inline as local helper)

Map `SynthesizedChain.action` to `ClaimDirection`:
- `"BUY"` → `"bullish"`
- `"SELL"` → `"bearish"`
- `"MONITOR"` → `"neutral"`
- `"HOLD"` → `"neutral"`
- anything else → `"neutral"`

### FR-4 — Resolution date helper
**DDD layer:** application (pure utility)

`isoDatePlusDays(n: number): string` — returns `new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)`.

### FR-5 — No duplicate claim spam
**DDD layer:** infrastructure

`insertPredictionClaim` already uses `INSERT OR IGNORE` with UNIQUE `(stock, claim_text, resolution_date)`. If the same chain narrative fires again within the same 7-day window, the insert silently no-ops. No additional dedup logic needed.

### NFR-1 — Volume guard
Chain synthesis only produces claims when `conviction >= 0.7` AND ≥2 agents posted about the same stock in the same 15-min cycle. Typical volume: 0–3 claims per cycle. 10/week acceptance is achievable at 1–2 qualifying cycles per day.

### NFR-2 — Claim text sourcing
`chain.narrative` is already a human-readable English/Vietnamese text produced by `synthesizeChain()`. It describes the causal chain — it is an appropriate `claim_text`. Truncate at 255 chars to respect DB VARCHAR conventions.

---

## Acceptance Criteria

- AC-1: After a cycle run with ≥1 synthesized chain (conviction ≥ 0.7), `SELECT COUNT(*) FROM prediction_claims WHERE agent_id='chain-synthesizer'` returns ≥1.
- AC-2: `direction` column matches `mapChainAction(chain.action)` — BUY → bullish, SELL → bearish, MONITOR/HOLD → neutral.
- AC-3: `resolution_date` is exactly 7 days from run date (YYYY-MM-DD format).
- AC-4: Low-conviction chains (`conviction < 0.7`) produce zero `prediction_claims` rows.
- AC-5: `INSERT OR IGNORE` dedup: same stock + same narrative in same 7-day window = 1 row.
- AC-6: Claim write failure does NOT cause `runChainSynthesis` to throw or cause the cycle to increment `errors`.
- AC-7: When `insertClaimFn` is injected in tests, it is called with the correct `PredictionClaimInput` shape.

---

## Edge Cases

- `chain.narrative` is empty string: `claim_text = ""` — `INSERT OR IGNORE` may collide on next cycle for same stock. Not harmful (insert is ignored). Acceptable.
- `chain.action` is undefined or unknown string: `mapChainAction` falls through to `"neutral"`.
- VN locale: `resolution_date` is UTC calendar day, not VN timezone. This is consistent with existing `predictionClaimStore` behavior.
- `byStock` loop for a stock with no prior claims: first insert creates the row. No stale-data risk.

---

## Files Changed (expected)

- `apps/mcp-server/src/scheduler/news-analysis/intelligenceCycleJob.ts` — extend `CycleDeps`, update `runChainSynthesis` function signature or add inline claim write after `postSignal` call
- `apps/mcp-server/src/__tests__/` — new test file covering AC-1 through AC-7

---

## Blockers

None. No PO questions. No architect brief required.

---

## Test Criteria Summary

| AC | Test type | Pass condition |
|----|-----------|----------------|
| AC-1 | Integration | prediction_claims row created |
| AC-2 | Unit | mapChainAction covers all 4 input values |
| AC-3 | Unit | resolution_date = today + 7 days |
| AC-4 | Unit | conviction=0.6 → no claim inserted |
| AC-5 | Integration | Duplicate insert = 1 row |
| AC-6 | Unit | Mock insertClaimFn throws → errors counter unchanged |
| AC-7 | Unit | Mock insertClaimFn received params match expected shape |
