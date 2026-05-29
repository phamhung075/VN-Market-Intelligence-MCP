# Architect — Notebook

**Last updated:** 2026-05-30T00:00 UTC | **Sprint:** DATA-PIPELINE-INTEGRITY

[3 most recent cycles retained below. Archive in git history.]

## DATA-PIPELINE-INTEGRITY (2026-05-30T00:00 UTC) — DESIGN COMPLETE

**Task:** DPI-ARCH. 4-bug brownfield design for macro data correctness (FX dual-path, stale computedAt, Brent/Gold zero delta, foreign-flow data loss).

**Key decisions:**

1. **DPI-1 — Option A canonical SBV:** New `SBVRateSQLiteAdapter` in `repositories.go` follows `SQLiteCommodityRepository` pattern (DB_PATH env, read-only, 6h staleness guard, safe-degrade 0). `Execute()` gains ~4-line SBV priority override after `resolveMarketPrices()`. DI wiring: one line change in `main.go`. Yahoo USDVND demoted (not removed — still feeds OIL/GOLD path).

2. **DPI-2 — delete const, inline `time.Now()`:** `fixtureComputedAt` constant deleted. `computedAt := time.Now().UTC().Format(time.RFC3339)` added as local var in `Execute()`. `time` already imported. No test currently asserts on the frozen value — dev must confirm with grep before removing const.

3. **DPI-3 — pre-transaction prev-close read:** Two separate SELECT queries on `commodity_prices_history WHERE fetched_at < snapshot.fetchedAt ORDER BY fetched_at DESC LIMIT 1` before `runTransaction()`. `computeDelta()` private helper. `upsertMacroPrice` SQL updated to include `change_amt, change_pct` in INSERT and ON CONFLICT UPDATE branch. USDVND excluded per FR-DPI-3d.

4. **DPI-4 — UPSERT + race fix mandatory:** `ohlcvForeignFlowStore.ts` UPDATE replaced with `INSERT…ON CONFLICT(code, date) DO UPDATE SET` for foreign flow cols. Stub row uses `close=0` to satisfy `NOT NULL` constraint. CRITICAL: `server.ts:1078` `INSERT OR REPLACE` is row-destructive — will wipe stub foreign flow on next OHLCV push. Must be changed to `ON CONFLICT DO UPDATE SET` (preserving foreign flow cols). `taOhlcvBackfillJob.ts` also uses INSERT OR REPLACE — dev must audit.

5. **Rebuild order:** mcp-server first (writes fresh change_pct + enables foreign-flow stubs), then macro-indicators (reads change_pct from market_prices; SBV rate from sbv_rates).

**Files authored:**
1. `docs/handoffs/DPI-ARCH.md` — NEW
2. `docs/agent-memory/notebooks/architect.md` — this entry
3. `docs/TASKS.md` — DPI-ARCH marked done

**ops_rebuild_required:** yes — both containers; mcp-server before macro-indicators.

---

## BCTC-TABLE-BOUNDARY (2026-05-29T19:30 UTC) — DESIGN COMPLETE

**Task:** BTB-ARCH. Replace greedy-merge stitcher in `generic_md_table_extractor.py` with a per-page boundary state machine.

**Key decisions:**

1. **Four root causes surfaced in one pass** (fail-loud audit):
   - Cause A: `_flush_unit` L2641 majority-vote type assignment → prose pages absorbed into table unit.
   - Cause B-1/B-2: `_fingerprints_continuous` L3000 no intervening-prose state and no D-5 title-band check.
   - Cause C: `_fingerprints_continuous` geometry-only; two same-layout tables with a title between them merge.
   - Cause D: blank bridge L2664 unconditional — no far-side page-type lookahead.

2. **State machine:** 5 states (NO_TABLE / TABLE_START / TABLE_CONTINUE / TABLE_END / TABLE_NEW). Implemented via `pending_blanks` deferred buffer (Option B — single-pass). Blank pages buffered; drained into current unit only on CONTINUE decision; discarded on END/NEW.

3. **`_flush_unit` fix:** Replace 9-line majority-vote with 2-line schema-page type lookup. `current_unit_pages[0]` fingerprint determines type. Prose pages never enter `current_unit_pages` for a table unit.

4. **`_fingerprints_continuous` extension:** New optional `stored_text_b: str = ""` param (backward-compat). D-5 title-band check added before `return True`.

5. **`_is_title_band` helper:** New function. Top-8-line scan. Non-numeric standalone line = title. `"tiếp theo"` / `"(continued)"` = returns `False` immediately. No new imports needed (`re` + `_MONEY_GROUP_RE` already available).

6. **`extract_layout_first_usecase.py`: NO changes.** DocumentMap shape identical; orchestration unaffected.

7. **DV tests mandate RED-before-GREEN:** DV-1 (`[table, prose, table]` → 3 units not 1) and DV-2 (`_fingerprints_continuous` with title text → `False`). Anti-false-green (fence_false_green lesson).

**Files authored:**
1. `docs/architecture-briefs/2026-05-29-bctc-table-boundary.md` — NEW
2. `docs/handoffs/BTB-ARCH.md` — NEW
3. `docs/agent-memory/notebooks/architect.md` — this entry

**ops_rebuild_required:** yes (after dev commits).

---

## BCTC-EVAL-DUAL-VIEW (2026-05-29T18:45 UTC) — DESIGN COMPLETE

**Task:** Add Agent/Debug view mode to the 6-gate eval strip (Task #9 extension).

**Key decisions:**

1. **Additive endpoint extension** — `bctcEvalPageHandler.ts` gains a `debug` sub-object per
   `gate_strip` element. All existing fields byte-identical. Full-report endpoint frozen.

2. **Segmented button toggle** (`Người dùng | Agent (debug)`) inside the existing
   `eval-strip-section` title row. `localStorage` key `bctcEvalViewMode`. No page reload.
   `lastEvalData` module var enables instant mode switch without re-fetch.

3. **`renderGateStrip` stays pure** — mode is a parameter. User-view body unchanged.
   `renderDebugBlock()` appended conditionally at end of per-gate loop.

4. **`<details>/<summary>`** for per-stage debug block — collapsed by default, no JS accordion.

5. **Honesty preserved** — stages 1,2,5,6 labeled `⚑ toàn báo cáo`. Stages 3/4 show genuine
   page-scoped evidence (`ocr_filename`, `pek_row_count`, `pek_quarantined`). No fabrication.

6. **S4 query extended** to also fetch `row_count`, `quarantined`, `quarantine_reason` from
   `bctc_layout_units`. S3: `ocr_filename` (basename) now emitted in `debug.ocr_filename`.

**7 work items M-1..M-7.** 3 in handler (additive), 3 in HTML (CSS+HTML+JS), 1 test extension.

**Files authored:**
1. `docs/architecture-briefs/2026-05-29-bctc-eval-dual-view.md` — NEW
2. `docs/agent-memory/notebooks/architect.md` — this entry

**ops_rebuild_required:** yes (HTML embedded via readFileSync).

---

[Older entries archived to git history — 3-cycle retention enforced]
