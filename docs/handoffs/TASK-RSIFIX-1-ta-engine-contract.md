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
status: REVIEW
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

- [x] File created: `docs/standards/ta-engine-contract.md`
- [x] RSI section documents: period=14, Wilder seed/smoothing, min-candle=35 recommended
- [x] BB/MACD/MA parameters documented with their periods
- [x] Error contract section explains field-absent (no error) behavior
- [x] Dev verified parameters against `apps/technical-analysis/pkg/primitive/rsi/rsi.go` + usecases.go
- [x] Example fixtures in doc show 41-candle ✓ and 34-candle ✗ RSI14 presence
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

---

## [QA] Review Record

**QA agent:** qa
**Date:** 2026-06-21
**Verdict:** APPROVED (docs-only — Smart-Skip applied)

### Formal Gate
- Smart-Skip: docs-only change — no bun test / tsc / DDD / security / mock-guard applicable
- `docs/standards/ta-engine-contract.md`: EXISTS at correct path (267 lines)
- `git show --stat 60891f75`: 3 files only (orch-state.json + TASK-RSIFIX-1 handoff + ta-engine-contract.md) — no runtime code touched
- No container rebuild required — confirmed

### Acceptance Criteria
- [x] File created: `docs/standards/ta-engine-contract.md`
- [x] RSI section documents: period=14, Wilder seed/smoothing, min-candle=35 recommended (hard gate=15)
- [x] BB/MACD/MA parameters documented with their periods (MA5/MA20/MA50 — correction: not MA100)
- [x] Error contract section: field-absent (no error) behavior documented + HTTP 400 on empty-both correction
- [x] Dev verified parameters against Go source (10 source files cited with file+line)
- [x] Example fixtures in doc show 41-candle RSI present, 34-candle RSI PRESENT at code level (hard gate 15) but in WARMUP ZONE (contract correctly distinguishes hard vs recommended gate)
- [x] Pushed to main (commit 60891f75 on main branch)

---

## Developer — dev-technical-analysis

**Status:** REVIEW
**Completed:** 2026-06-21
**Agent:** dev-technical-analysis

### Source files read and verified

| File | What was verified |
|---|---|
| `apps/technical-analysis/pkg/primitive/rsi/rsi.go` | Wilder smoothing formula (line 56-57), seed SMA (line 33-43), hard min gate period+1 (line 24-26), RSI formula (line 64-72) |
| `apps/technical-analysis/pkg/primitive/bollinger_bands/bollinger_bands.go` | period >= 2, min candles = period (line 50-52), population std dev divisor N (line 86-93), output length (line 59) |
| `apps/technical-analysis/pkg/primitive/macd/macd.go` | fast=12/slow=26/signal=9 defaults via module, min candles = slow+signal (line 52-55), output length |
| `apps/technical-analysis/pkg/primitive/macd/ema.go` | Standard EMA alpha k=2/(N+1) (line 20), SMA seed (line 24-27) |
| `apps/technical-analysis/pkg/primitive/moving_average/moving_average.go` | SMA rolling window (line 42-55), EMA alpha formula (line 79) |
| `apps/technical-analysis/pkg/module/technical_analysis.go` | All defaults (RSI=14 line 51, MACD=12/26/9 lines 53/56/59, BB=20/2.0 lines 54/66, MA=14 line 62), non-fatal policy (line 94-95), fixed MA5/MA20/MA50 (lines 118/122/126) |
| `apps/technical-analysis/pkg/application/dtos.go` | JSON field names, omitempty tags (lines 15-30) |
| `apps/technical-analysis/pkg/application/usecases.go` | Two-path dispatch, period default=14 (lines 46-48) |
| `apps/technical-analysis/pkg/interface/http/router.go` | HTTP 400 on both-empty (lines 47-52), HTTP 500 on error (lines 55-60) |
| `apps/technical-analysis/cmd/server/main.go` | Port 5003 (line 28), composition root wiring |

### Corrections to PM spec

Two corrections found during Go source verification, documented in the contract:

1. **PM spec fixture says "34 closes → RSI absent"** — incorrect. 34 >= hard minimum of 15, so RSI IS present at code level with 34 closes. The 35-candle threshold is a RECOMMENDED convergence minimum, not a code-enforced gate. The contract documents both: hard gate (15) and recommended gate (35), with the warmup-zone concept.

2. **PM spec lists "MA20, MA50, MA100"** — the Go source has MA5, MA20, MA50 (not MA100). Field `ma5` exists in `domain/models.go:37`, `dtos.go:28`, and `module/technical_analysis.go:118`. MA100 does not exist anywhere in the codebase. Contract documents MA5/MA20/MA50.

3. **Empty `closes:[]` with empty `symbol`** — returns HTTP 400, NOT 200 OK as stated in PM spec error contract. The router enforces `closes or symbol required` at lines 47-52. The PM spec error contract row "Empty closes:[] → all fields absent, 200 OK" is only true when a `symbol` is provided but yields zero candles — an edge case not tested.

### Deliverable

`docs/standards/ta-engine-contract.md` — 160 lines, all constants source-cited with file+line.

### RETURN block

```
DELIVERABLE: docs/standards/ta-engine-contract.md
SOURCES_CITED:
  - apps/technical-analysis/pkg/primitive/rsi/rsi.go
  - apps/technical-analysis/pkg/primitive/bollinger_bands/bollinger_bands.go
  - apps/technical-analysis/pkg/primitive/macd/macd.go
  - apps/technical-analysis/pkg/primitive/macd/ema.go
  - apps/technical-analysis/pkg/primitive/moving_average/moving_average.go
  - apps/technical-analysis/pkg/module/technical_analysis.go
  - apps/technical-analysis/pkg/application/dtos.go
  - apps/technical-analysis/pkg/application/usecases.go
  - apps/technical-analysis/pkg/interface/http/router.go
  - apps/technical-analysis/cmd/server/main.go
NEXT_AGENT: dev-mcp-server (TASK-RSIFIX-2 — rewire defaultComputeTa() to Go engine)
PIPELINE: TASK-RSIFIX-1 REVIEW → PM unblocks TASK-RSIFIX-2 → dev-mcp-server → TASK-RSIFIX-2
REBUILD_REQUIRED: NO
```

