# DSI-MACRO-PHANTOM-STALE-GUARD — Handoff

**Status:** REVIEW
**Task type:** FIX
**Priority:** high
**Zone:** apps/mcp-server/src (domain/services + infrastructure/db)
**Assigned to:** QA

---

## PM Work Order (PO direct dispatch, DSI-INV-1)

Phantom stale macro indicator values (WTI=95.5, dow_jones=23750) were served
as "current" live prices via the macro serve path. Root cause: `buildMacroSection`
reads `tracked_indicators` with a 48-hour window, which passes news-extracted
rows citing arbitrary historical prices. WTI > Brent by $8 is physically
impossible — the value came from an old article, not a live source.

---

## [Developer] Implementation Record

**Service:** mcp-server
**Zone:** apps/mcp-server/src

**Files modified:**

| File | Description |
|------|-------------|
| `apps/mcp-server/src/domain/services/marketContextBuilder.ts` | Tightened `tracked_indicators` freshness window 48h→4h. Fixed SQLite datetime comparison bug (ISO-8601 'T' > space separator causes stale rows to pass filter — fixed via epoch-seconds comparison). |
| `apps/mcp-server/src/infrastructure/db/commodityTracker.ts` | Added `listTrackedIndicatorsFromDb(db)` — testable DB-inject variant with `isStale` boolean per row. Added `TRACKED_INDICATOR_STALE_MS = 4h` constant. |

**Files created:**

| File | Description |
|------|-------------|
| `apps/mcp-server/src/__tests__/DSI-MACRO-PHANTOM-STALE-GUARD.test.ts` | 6 assertions covering GUARD-1..6: stale row excluded, fresh row included, 4h boundary strict, isStale flag correct for both cases, phantom WTI=95.5 scenario. |

**Key fix detail (R-2 SQLite trap):**

The old SQL `WHERE extracted_at >= datetime('now', '-4 hours')` would NOT work
because TypeScript writes `extracted_at` as ISO-8601 with 'T' separator
(`2026-06-20T18:52:12.302Z`) but SQLite's `datetime('now')` returns space
separator (`2026-06-20 20:52:12`). Since ASCII 'T'(84) > ' '(32), all ISO-8601
rows compare as "newer" than any SQLite datetime, bypassing the gate entirely.

Fix: `(strftime('%s', 'now') - strftime('%s', extracted_at)) < 14400`
Both sides reduced to epoch-seconds — timezone and separator agnostic.

**Tests written:**
- `src/__tests__/DSI-MACRO-PHANTOM-STALE-GUARD.test.ts` — 6 assertions, all GREEN

**Git commit:** `3280d82a fix(macro/staleness): DSI-MACRO-PHANTOM-STALE-GUARD`

**Type check:**
- `bun tsc --noEmit`: EXIT 0 (0 errors)
- `pnpm check`: EXIT 0

**Service tests:**
- New: 6 pass / 0 fail (DSI-MACRO-PHANTOM-STALE-GUARD.test.ts)
- Full suite: 13426 tests across 1120 files — 0 new failures

**Docs updated:** NONE (no API surface change, behavioral fix only)

**REBUILD REQUIRED:** YES — `marketContextBuilder.ts` is in the running mcp-server container.
Container must be rebuilt for the 4h staleness gate to take effect in production.

---

## Baseline Pass (QA must verify)

1. `buildMacroSection` returns null/empty for `wti_crude_usd` and `dow_jones`
   when the backing `tracked_indicators` rows are older than 4 hours.
2. `buildMacroSection` correctly includes fresh indicators (≤4h old) as before.
3. `listTrackedIndicatorsFromDb(db)` returns `isStale:true` for rows >4h old
   and `isStale:false` for rows ≤4h old.
4. Live Brent price (from `commodity_prices` via Yahoo) is unaffected — this
   fix only touches the news-mined `tracked_indicators` serve path.

---

## Decision Journal

Sprint: FE-PAGE-REORG
Journal: `docs/agent-memory/decisions/sprint-FE-PAGE-REORG-dev-macro-indicators.md`
Entry: dev-macro-indicators-S1

---

## [QA] Review Record

**Date:** 2026-06-21
**Reviewer:** qa
**Verdict:** APPROVED

### Formal Gate Results

| Gate | Command | Result |
|------|---------|--------|
| G1 TypeScript | `bun tsc --noEmit` | EXIT 0 — 0 errors |
| G2 pnpm check | `pnpm check` | EXIT 0 — 0 errors |
| G3 Task test | `bun test src/__tests__/DSI-MACRO-PHANTOM-STALE-GUARD.test.ts --no-cache` | EXIT 0 — 6 pass / 0 fail / 14 expect() calls |
| G4 Regression | 9 macro/marketContextBuilder related test files | EXIT 0 — 88 pass / 0 fail |

**Regression files covered:** `1360a-market-context-builder`, `239-market-context`, `1563-get-cycle-bootstrap`, `FIX-ERRAUDIT-W2-MCP-DATALAYER`, `1920c-commodity-tracker-refresh-job`, `DSI-S1-MACRO`, `1285-macro-alert-cooldown`, `1383-macro-alert-dispatch`, `FIX-MACRO-REFRESH-DEAD`.

### DDD Compliance: PASS

`marketContextBuilder.ts` imports verified:
- `import type { Database } from "bun:sqlite"` — type-only, not a runtime infrastructure import
- `import { tradingWindowLabel } from "./tradingWindow.js"` — domain peer
- `import { sqlInClause } from "../utils/sqlHelpers.js"` — domain utils
- `import { failLoud } from "../utils/safeQuery.js"` — domain utils

Zero imports from `src/infrastructure/`. The `db: Database` handle is injected as a parameter per the DDD invariant documented in the file header. CLEAN.

### Parameterized SQL: PASS

`marketContextBuilder.ts` line 245:
```
WHERE (strftime('%s', 'now') - strftime('%s', extracted_at)) < ?
```
Bound via `.all(STALE_THRESHOLD_SECONDS)` at line 251. No string interpolation of the window value into SQL. CLEAN.

`listTrackedIndicatorsFromDb` in `commodityTracker.ts`: no SQL parameters needed (no user input); staleness computed in TypeScript after fetch via `Date.now()` comparison. CLEAN.

### No-Fake-Data Gate: PASS

Verified via RAW test fixtures:

- **Stale path (GUARD-1, GUARD-3, GUARD-6):** rows inserted at 5h / 4h / 6h age — `buildMacroSection` output does NOT contain `wti_crude_usd` or phantom values `95.5` / `23750`. Stale rows are fully excluded.
- **Fresh path (GUARD-2):** row inserted at 2h age — `buildMacroSection` output DOES contain `wti_crude_usd` and value `79.8`.
- **isStale flag (GUARD-4/5):** `listTrackedIndicatorsFromDb` returns `isStale:true` for 6h-old row, `isStale:false` for 1h-old row.

The fix is mathematically correct: `strftime('%s','now') - strftime('%s', extracted_at)` reduces both sides to Unix epoch seconds, making 'T'-vs-space separator irrelevant. A row with ISO-8601 `extracted_at` (e.g. `2026-06-20T18:52:12.302Z`) now compares correctly against the 14400-second threshold.

### Security Scan: PASS

- No `process.env` in any of the three changed/created files.
- No hardcoded credentials or API keys.
- SQL: bound params confirmed (see above).
- No `any` types introduced (tsc EXIT 0 confirms).

### Deferred Live Gate (per handoff instruction)

REBUILD REQUIRED: YES. The 4-hour staleness gate only takes effect after the mcp-server container is rebuilt with commit `3280d82a`. The live done_verified gate (stale indicator excluded from served macro section; fresh indicator present) is DEFERRED to the next evening cycle post-rebuild. This is consistent with the batched-rebuild pattern for this sprint. Do NOT block APPROVE on the deferred live gate.

### Acceptance Criteria Checklist

- [x] AC-1: `buildMacroSection` returns empty/excluded output for `wti_crude_usd` / `dow_jones` rows older than 4 hours — VERIFIED (GUARD-1, GUARD-3, GUARD-6)
- [x] AC-2: `buildMacroSection` includes fresh indicators (≤4h old) — VERIFIED (GUARD-2)
- [x] AC-3: `listTrackedIndicatorsFromDb(db)` returns `isStale:true` for >4h rows, `isStale:false` for ≤4h rows — VERIFIED (GUARD-4, GUARD-5)
- [x] AC-4: Live Brent price path via `commodity_prices` / Yahoo unaffected — confirmed: separate query block, no overlap with `tracked_indicators` fix
- [x] AC-5: DDD boundary clean — no infrastructure import in domain file
- [x] AC-6: Parameterized SQL — `< ?` with bound param
- [x] AC-7: No-fake-data standing goal upheld — phantom values excluded
- [x] AC-8: No `process.env`, no hardcoded credentials
- [ ] AC-DEFERRED: Live container serves only fresh/real values post-rebuild — deferred to next evening cycle
