# dev-mcp-server -- Notebook

## c370 · 2026-06-05T00:17Z (FU-MACRO-SNAPSHOT-TEST-1881A — AC-3 JSON wrapper + honest source_tier) — COMMITTED pending

**Task:** FU-MACRO-SNAPSHOT-TEST-1881A (FIX, S) — get_macro_snapshot was the only text-output macro tool missing the AC-3 JSON-wrapper provenance contract already adopted by its siblings.

**Root cause:** `registerMacroTools` returned raw `JSON.stringify(data)` directly — no `source_tier`, no `fetchedAt`, no `text` wrapper field. AC-3 (source_tier=2, text+fetchedAt present) and AC-8 (source_tier is first serialized key) both failed.

**Fix:** Wrap the Go `/snapshot` response as `{ source_tier, text, fetchedAt }` with source_tier as first key. Derivation: `data.signals?.carry?.source_tier ?? 2`. Honest not hardcoded: the Go service annotates carry.source_tier per its own pipeline (2=live, 4=fixture/estimate). Carry is the principal signal this tool surfaces; other signals (yield, investment-clock) have their own tools. Fallback to 2 only if annotation absent (older Go build) — correct for a live aggregator upstream. `fetchedAt` = `data.fetchedAt` (true source timestamp, not re-stamped now). `text` = full JSON of upstream response. Error envelopes also lead with source_tier=2.

**Pre-existing failures confirmed:** 1423d TT-07..10 + 1570c DG-I-01..07 (11 failures) were present on unmodified code — verified via git stash + re-run. My change did not regress them.

**Gate results:** 1881a: 20 pass / 0 fail (was 18/2). bun tsc --noEmit: exit 0. 1423c/1423d/1570b/1570c: 52/11 — 11 failures all pre-existing (TT/DG-I HTTP-rewire era).

**Files (1):** `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts` (registerMacroTools handler ~L440-520).

Zone health: macroTools.ts handler +35L (AC-3 wrapper), tsc clean, 1881a 20/20, 0 new regressions | HEALTHY

---

## c369 · 2026-06-04T21:31Z (DSI-S2-PRICE-TS-GAP — cnyVndRate null honesty DSI-INV-1) — COMMITTED 54634eb2

**Task:** DSI-S2-PRICE-TS-GAP (FIX, P2) — live macro-price path fabricated cnyVndRate=0 as a live rate (DSI-INV-1 violation). CNHVND=X is not a valid Yahoo ticker; storing 0 is indistinguishable from "live rate is zero" to any consumer.

**Consumer audit:** ZERO live readers of cny_vnd_rate on the consumer path. MACRO_CODES excludes it; runImpactChain.ts drops it when building macroContext; no get_* tool surfaces it from DB; schema-macro.ts NOT NULL DEFAULT 0 means DB still writes 0 (via ?? 0) for storage compatibility.

**Fix:** `CommoditySnapshot.cnyVndRate` type changed from `number` to `null` (literal null type, not `number|null`). `const cnyVndRate = null` in fetchYahooFinancePrices. DB writes use `snapshot.cnyVndRate ?? 0` to satisfy NOT NULL constraint. Same change in runImpactChain.ts local interface. 10 test fixture files updated: `cnyVndRate: 0 → null` (or numeric → null where applicable).

**Gate results:** bun tsc --noEmit clean (exit 0). 025/1487/DPI-3/1423a/1489/1920c tests: 0 new failures — all 5 failures in 025 and 1 each in 1487/1423a/1489 were pre-existing (`tracked_indicators has no column data_env` in test-local in-memory DBs).

**Files (10):** yahooFinance.ts / runImpactChain.ts / 025/126/1423a/1423d/1487/1489/1920c/DPI-3 test files.

Zone health: yahooFinance.ts type-corrected, tsc clean, 0 new test failures | HEALTHY

---

## c368 · 2026-06-04T20:51Z (DSI-S3 C3 P2 FIX — DB-backed path now surfaces static_seed + banner) — COMMITTED 1473f812

**Task:** DSI-S3 C3 QA blocker (CHANGES_REQUESTED) — get_bond_maturity_calendar missing `[SEED DATA]` banner when DB has rows.

**Root cause:** Prior fix (2873b6c3) tagged SEED_BONDS with `static_seed:true` on the in-memory empty-DB path only. The DB-served path (`listUpcomingBonds → rowToEvent`) had no `is_seed_data` column — so all 5 prod rows came back as `static_seed:undefined` → banner never emitted.

**Fix:** (1) schema-macro.ts: idempotent `ALTER TABLE bond_maturity ADD COLUMN is_seed_data INTEGER NOT NULL DEFAULT 1`. (2) bondMaturityStore.ts: BondRow.is_seed_data field; rowToEvent maps `is_seed_data !== 0 → static_seed:true`; upsertBond writes `event.static_seed ? 1 : 0`. (3) bondMaturityTools.ts: `formatBondCalendar` exported. (4) 243-bond-maturity.test.ts: 4 new DSI-S3 C3 tests.

**Gate results:** bun test 19 pass / 0 fail (was 15, +4 new tests); bun tsc --noEmit clean (exit 0).

Zone health: bondMaturityStore.ts +18L, schema-macro.ts +9L, 4 new tests, tsc clean | HEALTHY

---

## c367 · 2026-06-04T20:35Z (FU-FRED-EFFR-STALE — Akamai-blocked CSV → api.stlouisfed.org JSON) — COMMITTED 3f1fbddb

**Task:** FU-FRED-EFFR-STALE (P1 FIX) — EFFR stale since 2026-05-28 (6 business days).

**Root cause:** fredEffrIorb.ts used fred.stlouisfed.org/graph/fredgraph.csv — Akamai WAF silently drops all non-browser HTTP streams. fredgraph.csv is wrong host; api.stlouisfed.org is a separate Apache backend, no Akamai.

**Fix:** Replace CSV URL with api.stlouisfed.org/fred/series/observations JSON endpoint. Read FRED_API_KEY from Bun.env (fail-loud ERROR + return null if missing). Parse JSON observations[]. Incremental: LAST-DATE-IN-DB (MAX(date) as observation_start; 45d cold-start window).

**Files (2):** fredEffrIorb.ts (rewritten), 1879a-fred-effr-iorb-fetcher.test.ts (10 tests, was 6).

**Gate results:** tsc clean (exit 0), 10 pass / 0 fail (targeted), 74 pass / 0 fail (FRED + schema + env + vn-number multi-file).

Zone health: fredEffrIorb.ts rewritten 299L→286L, JSON endpoint live, 10 tests pass, tsc clean | HEALTHY

---

## Working Memory

### Baselines (c370)
- tools=162, sched=72 | ops_rebuild_required: true (DSI-S1-SLA + DSI-S1-MACRO both pending rebuild)

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
