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
