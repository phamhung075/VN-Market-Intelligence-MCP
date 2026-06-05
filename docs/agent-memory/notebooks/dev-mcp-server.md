# dev-mcp-server -- Notebook

## c371 · 2026-06-05T07:16Z (FDA-1 — polymarket fabricated 0.5 probability) — COMMITTED cc4dbcba

**Task:** FDA-1 (FIX, P2) — polymarket.ts fabricated 0.5 coin-flip probability on all unparseable prices; contaminated get_prediction_markets output and Telegram dish.

**Fix approach: SKIP (definitif).** `parseOutcomePrices()` and `extractPrices()` now return `null` instead of `{ yes: 0.5, no: 0.5 }` / `{ yesPrice: 0.5, noPrice: 0.5 }`. Both CLOB and Gamma-primary call sites guard with `if (prices === null) continue` — market skipped entirely, never persisted or served. No `?? 0.5` anywhere on the served-value path.

**Rationale for SKIP over FLAG:** task spec said prefer skip-and-omit; no caller invariant requires a market to always be present; existing `volume>0` guard already omits dead markets — this is a parallel filter for un-parseable prices.

**Regression tests added (FDA-1-A..E):** 5 new cases in 164-polymarket-fetcher.test.ts covering: missing outcomePrices, malformed JSON string, empty array `"[]"`, one CLOB token (no No), valid prices pass-through. One pre-existing test ("defaults to 0.5/0.5 when tokens empty") updated to assert exclusion.

**Gate results:** tsc --noEmit: exit 0. 164 file: 21 pass / 0 fail. Polymarket suite (5 files): 53 pass / 0 fail. Additional prediction suite: 74 pass / 0 fail. 0 regressions.

**Files (2):** `apps/mcp-server/src/infrastructure/fetchers/polymarket.ts` (+26L fix, +19L debug log), `apps/mcp-server/src/__tests__/164-polymarket-fetcher.test.ts` (+125L new tests, -7L old test updated).

NEEDS REBUILD: mcp-server (pending off-market window, alongside 1881a)

Zone health: polymarket.ts fabrication class eliminated, tsc clean, 53 poly tests pass | HEALTHY

---

## c370 · 2026-06-05T00:17Z (FU-MACRO-SNAPSHOT-TEST-1881A — AC-3 JSON wrapper + honest source_tier) — COMMITTED pending

**Task:** FU-MACRO-SNAPSHOT-TEST-1881A (FIX, S) — get_macro_snapshot was the only text-output macro tool missing the AC-3 JSON-wrapper provenance contract already adopted by its siblings.

**Root cause:** `registerMacroTools` returned raw `JSON.stringify(data)` directly — no `source_tier`, no `fetchedAt`, no `text` wrapper field. AC-3 (source_tier=2, text+fetchedAt present) and AC-8 (source_tier is first serialized key) both failed.

**Fix:** Wrap the Go `/snapshot` response as `{ source_tier, text, fetchedAt }` with source_tier as first key. Derivation: `data.signals?.carry?.source_tier ?? 2`. Honest not hardcoded: the Go service annotates carry.source_tier per its own pipeline (2=live, 4=fixture/estimate). `fetchedAt` = `data.fetchedAt` (true source timestamp). `text` = full JSON of upstream response. Error envelopes also lead with source_tier=2.

**Pre-existing failures confirmed:** 1423d TT-07..10 + 1570c DG-I-01..07 (11 failures) were present on unmodified code.

**Gate results:** 1881a: 20 pass / 0 fail (was 18/2). bun tsc --noEmit: exit 0.

**Files (1):** `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts` (registerMacroTools handler ~L440-520).

Zone health: macroTools.ts handler +35L (AC-3 wrapper), tsc clean, 1881a 20/20, 0 new regressions | HEALTHY

---

## c369 · 2026-06-04T21:31Z (DSI-S2-PRICE-TS-GAP — cnyVndRate null honesty DSI-INV-1) — COMMITTED 54634eb2

**Task:** DSI-S2-PRICE-TS-GAP (FIX, P2) — live macro-price path fabricated cnyVndRate=0 as a live rate (DSI-INV-1 violation). CNHVND=X is not a valid Yahoo ticker; storing 0 is indistinguishable from "live rate is zero" to any consumer.

**Consumer audit:** ZERO live readers of cny_vnd_rate on the consumer path.

**Fix:** `CommoditySnapshot.cnyVndRate` type changed from `number` to `null`. `const cnyVndRate = null` in fetchYahooFinancePrices. DB writes use `snapshot.cnyVndRate ?? 0` for NOT NULL constraint. 10 test fixture files updated.

**Gate results:** bun tsc --noEmit clean. 0 new failures across all targeted suites.

**Files (10):** yahooFinance.ts / runImpactChain.ts / 025/126/1423a/1423d/1487/1489/1920c/DPI-3 test files.

Zone health: yahooFinance.ts type-corrected, tsc clean, 0 new test failures | HEALTHY

---

## Working Memory

### Baselines (c371)
- tools=162, sched=72 | ops_rebuild_required: true (1881a + FDA-1 both pending rebuild — off-market window)

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
