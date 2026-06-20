# FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0 — Architect Brownfield Findings

**Task:** FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0
**Tick:** 20260620T080911Z
**Mode:** BUG-FIX (multi-zone P0 — OHLC-constraint violations + 1000x scale anomaly)
**Architect:** architect
**Date:** 2026-06-20

---

## [Architect] Brownfield Findings

### Zone
**MULTI-ZONE — PM must split into per-zone subtasks:**

- **Zone 1:** `apps/mcp-server/` — all TypeScript writers (A, C, D, E, F, G, H)
- **Zone 2:** `apps/stock-price/` — **CLEARED (not a writer)**

Zone 2 verdict: Go service reads `daily_ohlcv` read-only (Tier-3 cache SELECT at
`fetchers.go:315`) and writes only `market_prices_cache`. It does NOT insert/update
`daily_ohlcv`. No action required in `apps/stock-price/`.

All remediation work is in **Zone 1: `apps/mcp-server/`**.

---

### Writer Inventory (full audit — post-FIX-OHLCV-WRITER-SSOT-DURABLE 2026-06-17)

```
Writer | File                                                    | SQL path                    | Guard status
-------|--------------------------------------------------------|-----------------------------|----------------------------------
A      | interface/mcp/routes/pushPricesHandler.ts              | writeOhlcvBatch (intraday)  | GUARDED via SSOT (Rule 5 present)
C      | scheduler/market-data/ohlcvDailyAggregatorJob.ts       | writeOhlcvBatch (backfill)  | GUARDED via SSOT (Rule 5 present)
D      | scheduler/market-data/taOhlcvBackfillJob.ts            | writeOhlcvBatch (backfill)  | GUARDED via SSOT (Rule 5 present)
E      | infrastructure/fetchers/ohlcvBackfill.ts               | INSERT OR IGNORE (bypass)   | GUARDED: normalizeOhlcvToVnd + validateOhlcvUnit (Rule 5 present)
F      | domain/services/priceBackfillService.ts                | INSERT OR IGNORE (bypass)   | GAP-1 (see below)
G      | infrastructure/db/ohlcvForeignFlowStore.ts             | UPDATE-only (no INSERT)     | SAFE: no stub, UPDATE-only since FIX-OHLCV-WRITER-SSOT-DURABLE
H      | interface/mcp/server.ts L1206 push-ohlcv-history route | ON CONFLICT DO UPDATE       | GAP-2 (see below)
```

---

### Root Cause Analysis

#### Failure Mode (a): close OUTSIDE [low, high] — 835 violations, 129 tickers, clustering 2026-06-12

**Primary root — Historical residue (pre-guard era rows):**
All writers A, C, D, E now route through `validateOhlcvUnit` which enforces Rule 5
(low ≤ open ≤ high AND low ≤ close ≤ high). The violations cluster on 2026-06-12 and span
2026-04-24..2026-06-12, indicating they were written BEFORE the current guard infrastructure
was complete (FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 completed 2026-06-16). These are
pre-guard-era rows that the guard couldn't prevent because it didn't exist yet.

**Secondary root — Writer F (GAP-1): `priceBackfillService.ts`**
- File: `apps/mcp-server/src/domain/services/priceBackfillService.ts:51-63`
- Has a LOCAL `validateOhlcv()` function that checks `high >= close >= low` and `volume > 0`
  but does NOT call `validateOhlcvUnit` from the domain guard.
- Does NOT apply `normalizeOhlcvToVnd` (no VND unit normalization).
- Marked as "Mock fetcher — in production would call resilientFetcher" but the INSERT SQL at
  L110-128 is live code with a real `INSERT OR IGNORE INTO daily_ohlcv` that bypasses all
  write-time scale guards.
- The sentinel `// OHLCV-WRITE-BYPASS-ALLOWED` is present at L110 per the prior architect's
  comment, but the guard is NOT equivalent to `validateOhlcvUnit`.
- **Fix required:** Replace local `validateOhlcv()` with `validateOhlcvUnit` from
  `domain/services/market-data/ohlcvUnitGuard.js`. Add `normalizeOhlcvToVnd` call before
  the guard. This aligns Writer F with Writers E and H.

**Tertiary root — Writer H (GAP-2): `server.ts` push-ohlcv-history route L1206-1301**
- File: `apps/mcp-server/src/interface/mcp/server.ts:1262-1286`
- At L1266: `const high = typeof bar.high === "number" ? bar.high : open`
  At L1267: `const low  = typeof bar.low  === "number" ? bar.low  : open`
- If the VPS backfill script sends `high`/`low` as string types (not number), they are silently
  replaced by `open`. The guard at L1274 then validates `high=open, low=open` — which passes
  Rule 5 trivially (all equal). The UPSERT then writes `high=open, low=open` unconditionally
  (no MAX/MIN accumulation — this is a full overwrite path). If a PRIOR push had a higher
  `close` value (from Writer A intraday), Writer H then clobbers `high` to `open < close`.
- The guard WOULD catch valid plausibility violations but the silent string-coerce PREVENTS
  the guard from seeing the real high/low fields.
- **Fix required:** Harden the coercion: `typeof bar.high === "number"` → also handle
  `typeof bar.high === "string" && bar.high !== ""` via `parseFloat`. Reject the row (skip,
  not skip+write-with-defaults) if the result is NaN or ≤ 0. The guard should receive the
  REAL high/low values.

#### Failure Mode (b): high=low=0 sentinel rows — VNDAF open=close=19500, high=0, low=0

**Root — Schema defaults + pre-guard write path:**
`schema-market-data.ts:94-95`: `high REAL NOT NULL DEFAULT 0, low REAL NOT NULL DEFAULT 0`

The VNDAF row has `open=19500, close=19500, high=0, low=0`. This passes `validateOhlcvUnit`
Rule 1 (zero guard) IF the guard only sees `close` and `open` — but in fact Rule 1 iterates
ALL four fields and WOULD catch `high=0`. This row therefore pre-dates the guard or was
written by a path that bypasses the guard AND the zero guard. Two candidates:
1. Pre-guard era aggregator path (ohlcvDailyAggregatorJob before SUBTASK-2 migration)
2. Writer F or H which had incomplete guards

The schema DEFAULT 0 for `high`/`low` means any raw INSERT that omits these fields writes
zeros silently. No SQLite CHECK constraint enforces `low <= close <= high` at the DB level.

---

#### Failure Mode (c): DFF 1000x scale anomaly — db2

**Root — prevClose=0 no-op in `detectAndNormalizeScaleFromPrevClose`:**
`ohlcvUnitGuard.ts:280-282`:
```typescript
if (!prevClose || prevClose <= 0) {
  return { corrected: false, rejected: false, ohlcv: v };
}
```
When DFF has no prior real row in `daily_ohlcv` (illiquid UPCoM micro ~55K vol, sparse data),
`prevCloseMap.get("DFF") = undefined` → `prevClose = 0` → the scale detection is SKIPPED
entirely. The VNDirect API returns DFF in thousand-VND (e.g., `close=0.5` = 500 VND),
and `normalizeOhlcvToVnd` checks `mag < STOCK_MIN_VND (100)` — `0.5 < 100` → multiplies by
1000 → `close=500`. But DFF 2026-06-12 row has `open=0.5, high=500, low=0.5, close=500`.
This is a MIXED-UNIT input from VNDirect where `high` is already in full-VND (500 = 500 VND)
while `open/low` are in thousand-VND (0.5 = 500 VND). After whole-row ×1000 normalization:
`open=500, high=500000, low=500, close=500000` — which fails the HILO ratio check (Rule 4:
500000/500 = 1000 > HILO_RATIO_MAX=5). So `validateOhlcvUnit` SHOULD catch this.

But the live row is `open=0.5, high=500, low=0.5, close=500` — meaning it was written PRE-
normalization (before `normalizeOhlcvToVnd` was in the write path), OR by Writer E (ohlcvBackfill)
which applies normalize but whose `INSERT OR IGNORE` idempotency means an already-existing
corrupt row is not overwritten. The `DFF 2026-06-05 low=0.0` row is a separate partial-zero
defect from the same era.

This ABSORBS `FIX-OHLCV-CLASS3-COLD-START-EXCHANGE-SEED-P2`: the DFF 1000x root is the same
cold-start/prevClose=0 era that `FIX-OHLCV-CLASS3-COLD-START-EXCHANGE-SEED-P2` tracked.
That task is **SUPERSEDED** by this one. PM must mark `FIX-OHLCV-CLASS3-COLD-START-EXCHANGE-SEED-P2`
as `superseded` in the board (do not create duplicate).

---

### Design Decisions

#### Decision D-1: OHLC plausibility invariant guard — write-time vs schema CHECK

**Considered:**
- Option A: Add SQLite `CHECK(low <= open AND low <= close AND close <= high AND open <= high)` at
  schema level. Rejected: (1) SQLite ADD COLUMN can carry CHECK but ALTER ADD CHECK to existing
  table is not supported; (2) a table rebuild is required to add CHECK to `daily_ohlcv`; (3)
  the memory `feedback_sqlite_add_column_unique_silent_noop` warns of silent SQLite constraint
  failures; (4) a schema CHECK would break existing corrupt rows on startup — unsafe for P0.
- Option B: Enforce at write-time via `validateOhlcvUnit` Rule 5 (ALREADY PRESENT). The guard
  already enforces this invariant for all routed writers (A, C, D, E via writeOhlcvBatch/unit
  guard). The remaining gaps are Writer F (local stub guard) and Writer H (type coercion masks
  real high/low). **CHOSEN** — patch the two gaps to close the invariant at application layer.

**Verdict:** Write-time guard (application layer). Schema CHECK deferred as tech-debt hardening
(follow-on, non-P0). The current `validateOhlcvUnit` Rule 5 is the enforced boundary.

#### Decision D-2: Writer F remediation approach

- **Chosen:** Replace local `validateOhlcv()` at L51-63 with `validateOhlcvUnit` from
  `domain/services/market-data/ohlcvUnitGuard.js`. Add `normalizeOhlcvToVnd` call before the
  guard (same pattern as Writer E at L206-218 in `ohlcvBackfill.ts`). The existing INSERT SQL
  is kept; only the pre-insert validation changes.
- **NOT chosen:** Migrate Writer F to `writeOhlcvBatch` — Writer F is domain-layer and
  importing `writeOhlcvBatch` (application-layer) would be an upward DDD violation
  (domain must not import from application). Keep Writer F's own INSERT OR IGNORE, just with
  the correct guard.

#### Decision D-3: Writer H high/low coercion fix

- **Chosen:** Replace `typeof bar.high === "number" ? bar.high : open` with a parse-and-reject
  pattern: parse both `bar.high` and `bar.low` accepting number or numeric string; reject the
  entire bar (increment skipped, continue) if either parses to NaN or ≤ 0. Do NOT default to
  `open` — that produces a silently wrong guard input.
- The `validateOhlcvUnit` call at L1274 then receives the actual values and enforces Rule 5.

#### Decision D-4: DFF prevClose=0 cold-start path — no new correction needed

- The `detectAndNormalizeScaleFromPrevClose` correctly skips detection when prevClose=0 (no prior
  real row). The DFF 1000x rows are **historical residue** from a pre-guard era write.
- The existing guard WILL catch mixed-unit inputs from VNDirect (open=0.5, high=500 fails HILO
  ratio after whole-row ×1000 → Rule 4). New DFF writes via Writers D/E/writeOhlcvBatch are
  guarded correctly.
- **No new guard logic needed for the cold-start path.** The fix is: Writer F and H gaps closed
  (D-2, D-3), which blocks any new violations. Residue cleanup is handled by
  `CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR` (blocked on this task's done_verified — see ordering).

---

### Verified Paths

```
apps/mcp-server/src/
  application/usecases/ohlcvWriteService.ts        — SSOT chokepoint, Rule 5 present L148-155
  domain/services/market-data/ohlcvUnitGuard.ts    — validateOhlcvUnit Rule 5 L148-154
  domain/services/priceBackfillService.ts          — GAP-1: L51-63 local stub validator
  infrastructure/fetchers/ohlcvBackfill.ts         — Writer E: guarded (reference pattern)
  interface/mcp/server.ts:1206-1301                — GAP-2: Writer H high/low coerce L1262-1267
  infrastructure/db/schema-market-data.ts:90-106   — daily_ohlcv DDL, no CHECK constraint
  scheduler/market-data/allzeroOhlcvBackfill.ts    — residue repair (CLEAN task, not this task)
  scheduler/market-data/ohlcvSanityCheckJob.ts     — post-write scanner (3 detector passes)
apps/stock-price/                                  — CLEARED: read-only from daily_ohlcv
```

---

### Reuse Patterns

- Writer E (`ohlcvBackfill.ts` L206-218) is the reference pattern for Writer F: call
  `normalizeOhlcvToVnd` then `validateOhlcvUnit`, log+skip on failure.
- All other writers (A, C, D) route through `writeOhlcvBatch` — no change needed.
- `validateOhlcvUnit` Rule 5 is the enforced application-layer OHLC invariant. No duplication.

---

### Risk Flags

- **RISK-1 (HIGH):** Writer F is in the `domain/` layer. Adding imports from
  `domain/services/market-data/ohlcvUnitGuard.js` is ALLOWED (domain importing domain — no
  DDD violation). Adding any import from `application/` would be a DDD violation. Dev must
  verify import direction before wiring.
- **RISK-2 (MEDIUM):** Writer H fix changes the skip logic — bars that previously wrote
  `high=open, low=open` will now be REJECTED (skipped). This is the correct behavior. The
  VPS backfill script (`vps-scripts/` zone) may need a corresponding update to send numeric
  `high`/`low` fields. PM should note this cross-zone dependency.
- **RISK-3 (LOW):** `CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR` must NOT run before this fix is
  deployed and done_verified. The residue task depends on the writer being fixed first;
  otherwise cleanup runs while new violations are still possible. Ordering enforced by PM.

---

### Standard Detection

```
BUG-FIX / MAINTENANCE (in-zone, closing gaps in existing guards + cross-zone read cleared):
  → BUILD-STANDARD: not-applicable
  → NOTE: apps/mcp-server/ single specialist (dev-mcp-server) handles Zone 1
  → Zone 2 (apps/stock-price/): no action required — CLEARED as read-only consumer
```

---

### PM Task Decomposition Guidance (not prescriptive — PM owns the breakdown)

Suggested split into 3 atomic tasks for Zone 1 (`apps/mcp-server/`):

**TASK-OHLCV-WIC-1** — Writer F guard replacement (`priceBackfillService.ts`)
- Replace local `validateOhlcv()` stub with `validateOhlcvUnit` + `normalizeOhlcvToVnd`
- Reference pattern: Writer E at `ohlcvBackfill.ts:L206-218`
- Test: new test file verifying Rule 5 rejection + VND normalization in Writer F path
- Size: S (≤2h)

**TASK-OHLCV-WIC-2** — Writer H high/low coercion fix (`server.ts` push-ohlcv-history)
- Replace `typeof === "number"` coerce-to-open pattern with parse-and-reject
- Both `bar.high` and `bar.low`: accept number or numeric string, reject row if NaN or ≤ 0
- Test: new test verifying string high/low parse + rejection on NaN/zero input
- Size: S (≤2h)

**TASK-OHLCV-WIC-3** — Supersede `FIX-OHLCV-CLASS3-COLD-START-EXCHANGE-SEED-P2` in board
- No code change. PM marks `FIX-OHLCV-CLASS3-COLD-START-EXCHANGE-SEED-P2` as `superseded`
  with note pointing to this task's done_verified.
- Size: XS (board-only)

---

### done_verified Gate (for the eventual fix)

Gate is LIVE — not resolvable this weekend (market closed). Done criteria:

1. `cron-db-data-integrity` re-sweep = **0 NEW violations** after rebuild (fresh writes only)
2. Write-path test: Unit tests cover Writer F Rule 5 rejection + Writer H reject-on-NaN-coerce
3. `CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR` remains blocked until this task's done_verified

The existing 835 pre-guard violations are **historical residue** — they are not evidence of
ongoing failures post-fix. The done_verified gate is on NEW violations (post-rebuild period),
not on the residue count.

---

### Dependency Ordering

```
FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0 (this task)
  ↓ done_verified
CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR          (blocked until above done_verified)
  ↓ done_verified
FIX-OHLCV-CLASS3-COLD-START-EXCHANGE-SEED-P2  (SUPERSEDED — mark in board, no code work)
```

---

### Scan Clean: true
