---
sprint: 503
branch: task/503-rsi-engine-contract
size: S
zone: apps/technical-analysis/
depends_on: []
blocks: [504]
---

## TLDR

Write canonical Go RSI engine contract documentation (`docs/standards/ta-engine-contract.md`) specifying the pure-compute path contract, Wilder smoothing parameters, and minimum-candle requirement (35). This contract is a blocking prerequisite for dev-mcp-server's RSI path refactor (TASK-504), allowing the mcp-server caller to wire the Go service correctly without re-reading the Go source.

## [PM] Planning Context

**Zone:** `apps/technical-analysis/` (documentation only, no code changes)

**Acceptance Criteria:**
- [ ] File `docs/standards/ta-engine-contract.md` created with:
  - [ ] Section: Pure-compute path contract — `computeTAIndicators({ code: string, closes: number[] })` HTTP POST to `localhost:5003/ta/indicators`, returns RSI series array + scalar current RSI value
  - [ ] Section: RSI parameters — RSI period=14 (hardcoded), Wilder smoothing (seed = SMA of first 14 gains/losses; subsequent = `(prev*(period-1) + current)/period`)
  - [ ] Section: Minimum-candle gate — 35 candles minimum for valid RSI computation; return `ErrInsufficientData` (mapped to null in caller) if fewer than 35 closes provided
  - [ ] Section: Input array contract — `closes[]` is sorted oldest→newest; close values must be numeric, non-negative
  - [ ] Section: Error handling — HTTP 400/5xx or `ErrInsufficientData` response → caller must fail-closed (return null RSI, not fallback to alternate computation)
  - [ ] Reference to Go source — link to `apps/technical-analysis/pkg/primitive/rsi/rsi.go` and `apps/technical-analysis/pkg/application/usecases.go` (pure-compute path)
  - [ ] Rationale note — why 35 candles: Wilder warmup convergence, consistency with alert path (`taAlertScanJob` MIN_CANDLES constant)

**Files to read first:**
- `apps/technical-analysis/pkg/primitive/rsi/rsi.go` (lines with Wilder smoothing formula)
- `apps/technical-analysis/pkg/application/usecases.go` (pure-compute path: `req.Closes` forwarded directly, no DB)
- `apps/mcp-server/src/scheduler/market-data/taAlertScanJob.ts` (lines with MIN_CANDLES, existing contract rationale)
- `docs/architecture-briefs/2026-06-21-digest-rsi-dual-engine-diverge.md` (§Zone A section)

**Files to create:**
- `docs/standards/ta-engine-contract.md` — canonical Go TA engine contract (pure-compute path)

**Files to modify:**
- None (documentation only)

**Dependencies:**
- None (blocking task)

**Blocking:**
- TASK-504 (dev-mcp-server RSI refactor depends on this contract being locked down)

**Knowledge needed:**
- `docs/policies/dev-standards.md` — general standards
- `docs/architecture-briefs/2026-06-21-digest-rsi-dual-engine-diverge.md` — full fix context
- Go RSI primitive semantics (Wilder smoothing, period=14, seed formula)

## Notes

This is a **contract documentation task only** — no code changes in this zone. The Go TA service is already correct and requires no modification. Your job is to write down what the service already does so that dev-mcp-server can rely on a frozen interface without reading the Go source every time.

**Rationale for separate task:** If mcp-server dev needs to ask "what does the Go service guarantee?", they should have a single authoritative document to point to, not re-read Go code. This task creates that SSOT.

Do NOT commit or merge the Go service code itself. Commit only the contract doc.

