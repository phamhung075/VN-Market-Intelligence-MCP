---
task_id: TASK-RSIFIX-1
parent_fix: FIX-DIGEST-RSI-DUAL-ENGINE-DIVERGE
type: TASK
title: Document canonical Go TA engine contract
priority: P1
zone: apps/technical-analysis/
dev_agent: dev-technical-analysis
created_at: 2026-06-21T00:00:00Z
created_by: pm
status: TODO
blocked_by: []
blocks:
  - TASK-RSIFIX-2
---

## Summary

Write the canonical written contract for the Go TA service pure-compute path (RSI, Bollinger Bands, MACD, MA). This unblocks dev-mcp-server to rewire the TS digest code to use the Go engine instead of the TS local computeRSILocal, eliminating the RSI divergence in evening_summary (NVL: 29.7 Go vs 27.6 TS on 2026-06-19).

## PM — Work Order

### Root Cause
No written contract for the Go TA service pure-compute endpoint. dev-mcp-server must read Go source code to verify implementation details (Wilder RSI params, min-candle gate, error handling) before wiring the digest code. A drift between implementation and TS wiring code remains invisible until run-time verification.

### Fix Spec
Write a single **docs/standards/ta-engine-contract.md** documenting the canonical Go TA engine contract:

1. **POST /ta/indicators** pure-compute path contract:
   - Input: `{closes: number[]}` (close prices, oldest first)
   - Output: `{rsi14?: number, bb?: {upper, middle, lower}, macd?: {line, signal, histogram}, ma?: {ma20, ma50, ...}}`
   - Missing field = insufficient data (not HTTP error, e.g., rsi14 absent if `closes.length < 35`)
   
2. **RSI parameters (Wilder method):**
   - Period = 14
   - Initial seed = SMA of first 14 gains/losses
   - Smoothing = `(previous * 13 + current) / 14` (Wilder exponential, NOT EMA)
   - Min candles for first RSI value = 15 (period + 1)
   - Min candles for convergence / recommended = 35 (2.5× period)
   
3. **Bollinger Bands:**
   - MA period = 20
   - StdDev multiplier = 2
   - Output: {upper, middle (SMA20), lower}
   
4. **MACD:**
   - Fast EMA = 12, Slow EMA = 26, Signal = 9
   - MACD line = EMA12 - EMA26
   - Signal line = EMA9(MACD line)
   - Histogram = MACD line - Signal line
   
5. **Moving Averages:**
   - MA20, MA50, MA100 (SMA)
   - All require their period in candles before output
   
6. **Error contract:**
   - `closes.length < (period + 1)` for any indicator → field omitted from response, not 4xx error
   - Empty `closes: []` → all indicator fields absent, 200 OK
   - Server error (e.g., timeout) → HTTP 5xx

### Files to Create/Edit
- **Create:** `docs/standards/ta-engine-contract.md` (~120 lines, single file)
- **Reference (read-only for validation):**
  - `apps/technical-analysis/pkg/primitive/rsi/rsi.go` (Wilder RSI implementation)
  - `apps/technical-analysis/pkg/application/usecases.go` (pure-compute endpoint)

### Verification Gate
1. File exists at `docs/standards/ta-engine-contract.md`
2. Contract accurately reflects source code:
   - RSI period = 14, Wilder smoothing verified in Go source
   - Min-candle gates match actual implementation
   - Error handling contract matches endpoint's real behavior
3. Example fixture: run `POST /ta/indicators {closes: [close1, ..., close41]}` and verify RSI14 is present (41 >= 35)
4. Example fixture: run `POST /ta/indicators {closes: [close1, ..., close34]}` and verify RSI14 is absent (34 < 35)

### Rebuild Required
**No.** Documentation only. No Docker rebuild needed. Contract becomes live once pushed.

### Handoff Notes
- This is a **contract first** task — read the Go source (rsi.go + usecases.go) and document what you find
- Do not invent parameters; derive them from the actual Go implementation
- The contract will be the single source of truth for dev-mcp-server when rewriting defaultComputeTa()
- Include a small section explaining WHY min-candle=35 is recommended (convergence warmup) vs the bare minimum of 15 (period + 1)

## NEXT Agent
**dev-technical-analysis** — write docs/standards/ta-engine-contract.md and verify against Go source.
After DONE (verified against Go), PM will unblock TASK-RSIFIX-2 for dev-mcp-server.

---

## Acceptance Criteria

- [ ] File created: `docs/standards/ta-engine-contract.md`
- [ ] RSI section documents: period=14, Wilder seed/smoothing, min-candle=35 recommended
- [ ] BB/MACD/MA parameters documented with their periods
- [ ] Error contract section explains field-absent (no error) behavior
- [ ] Dev verified parameters against `apps/technical-analysis/pkg/primitive/rsi/rsi.go` + usecases.go
- [ ] Example fixtures in doc show 41-candle ✓ and 34-candle ✗ RSI14 presence
- [ ] Pushed to main (no rebuild step)

---

## PM Checklist

- [x] Task decomposed from architect brief
- [x] Files enumerated
- [x] Verification gate defined (contract exists + validated vs source)
- [x] Rebuild required: No
- [x] Blocks identified: TASK-RSIFIX-2 (unblock after done_verified)
- [x] Handoff created
- [x] WIP slot reserved (1 of 2)

