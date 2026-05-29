# dev-mcp-server -- Notebook

## c326 · 2026-05-29 (BCTC-EVAL-INSPECT-MERGE Task #9 — HEADER PAGE-NAV + KEYBOARD) — COMMITTED 3490dffa

**Task:** Move page-change buttons to top-middle header; add ArrowLeft/ArrowRight keyboard nav.

**Files changed (2):**
- `apps/mcp-server/src/interface/bctc-inspector.html` — CSS: `header { position:relative }` + `#header-page-nav` (centered absolute); HTML: header nav block (header-btn-prev, header-page-indicator, header-btn-next); JS: `headerBtnPrev/Next/pageIndicator` DOM refs, `setNavState()` SSOT for all 4 nav elements, keyboard `keydown` listener with focus guard (INPUT/SELECT/TEXTAREA), header button click handlers. `renderOcr` and `resetPanes` updated to use `setNavState`.
- `apps/mcp-server/src/__tests__/1976-bctc-inspector-page-nav.test.ts` — NEW: 19 pure-function tests (clampPage, navLabel, shouldSkipKeyboard, button-disabled derivation) + DV guard comment. All GREEN.

**Design:** `setNavState(page, bound)` single SSOT syncs header+OCR-pane nav. All nav (buttons+keyboard) delegates to `navigateToPage` orchestrator. Focus guard: skip arrows when activeElement tag is INPUT/SELECT/TEXTAREA.

**Gates:** tsc EXIT 0 | 19 new tests GREEN | 10088 tests 0 fail | tool=148 | sched=70 | frozen 0-diff | staged=2 | commit 3490dffa

**ops_rebuild_required: true** — HTML baked into image; `docker compose build mcp-server && up -d --no-deps --force-recreate mcp-server`

Zone health: 2 files (1 mod, 1 new); tsc EXIT 0; 19 tests green; frozen 0-diff | HEALTHY

---

## c325 · 2026-05-29 (BCTC-EVAL-INSPECT-MERGE Task #9 — MD→TABLE RENDERED VIEW)

### MD-STAGE5: markdown→table rendered per-page view — COMMITTED a7d70e62

**Task:** Add #md-stage5-section to bctc-inspector.html: renders stage-5 stitched_markdown as visual HTML tables (per-page, page-nav replay). Additive only.

**Files changed (3):**
- `apps/mcp-server/src/interface/bctc-inspector.html` — CSS #md-stage5-section; HTML section (between eval-strip and table-section); JS: `cachedPekUnits` state, `renderMdStage5View(pageNum)` (filters units by page, `parsePipeTableToHtml`, fragment banner for multi-page units), hooked into `navigateToPage` step 4 + `renderTable` PEK path + `resetPanes`.
- `apps/mcp-server/src/interface/mcp/routes/mdTableParser.ts` — NEW: exported `parsePipeTableToHtml()` + `escHtml()` pure TS utility. 100% coverage.
- `apps/mcp-server/src/__tests__/md-table-parser.test.ts` — NEW: 14 tests (TC-P1..P7 + escHtml + DV-3), 50 expect(), 100% cov, all GREEN.

**Design:** `stitched_markdown` already in `/api/bctc-inspect/table/{doc_id}` response (`units[].stitched_markdown`, has_pek:true). No handler change. Pure client-side.

**Honesty:** multi-page units show `[BẢNG CÓ THỂ KHÔNG ĐẦY ĐỦ]` banner; no-unit pages show explicit message; has_pek:false hides section entirely.

**Gates:** tsc EXIT 0 | 14 new tests GREEN 100% cov | 61-file run 0 fail | tool=148 | sched=70 | frozen 0-diff | PEK pristine | staged=3 | commit a7d70e62

**DV-3:** prose→pre (no table), pipe→table. Both paths proven live. Gate not hollow.

**ops_rebuild_required: true** — HTML baked; `docker compose build mcp-server && up -d --no-deps --force-recreate mcp-server`

Zone health: 3 files (1 mod, 2 new); tsc EXIT 0; 14 tests green; frozen 0-diff; PEK pristine | HEALTHY

---


## c327 · 2026-05-30 (BCTC-TABLE-BOUNDARY BTB-PERSIST-FIX BLOCKING-1) — COMMITTED 60dfac7f

**Task:** Fix pushBctcLayoutHandler idempotency + add prose persistence tests.

**Files changed (2):**
- `apps/mcp-server/src/interface/mcp/routes/pushBctcLayoutHandler.ts` — Replace INSERT OR REPLACE with DELETE-before-INSERT inside the existing transaction. Two DELETE statements (bctc_layout_units + bctc_page_zones WHERE report_id=?) added at transaction start. INSERT changed to plain INSERT (not OR REPLACE). Root cause: pdf-extractor generates new unit_id UUIDs per extraction run; INSERT OR REPLACE only fires on same key — new UUIDs always append, never replace (FPT 42 rows = 7 spans × 6 extractions).
- `apps/mcp-server/src/__tests__/1272-push-bctc-layout.test.ts` — 12 new tests (h-DV: idempotency with different unit_ids proven-red→green; h-DV: old UUIDs absent after re-push; i: prose page_type stored correctly; i: prose count ≥ 1; i-DV: prose survives re-push).

**BLOCKING-2 prose finding (end-to-end trace):**
- mcp-server handler: CORRECT — reads page_type from document_map, persists prose units as-is.
- Prose units NOT in push payload for PEK path. Root: pek_engine_adapter.py explicitly skips prose pages — only creates table-type units (line ~595: "Do NOT create a unit for this prose page"). The mcp-server handler cannot fix what's never sent.
- NEXT for BLOCKING-2: dev-pdf-extractor must add prose units to PEK push payload.

**Idempotency DV:** proven-red = INSERT OR REPLACE + different unit_ids → 4 rows (not 2). proven-green = DELETE-before-INSERT → 2 rows.

**Gates:** tsc EXIT 0 | 25 tests 0 fail (file-scope) | tool=148 | sched=70 | frozen 0-diff

**ops_rebuild_required: true** — mcp-server must be rebuilt for fix to take effect.

Zone health: 2 files (1 mod, 1 mod); tsc EXIT 0; 25 tests green; frozen 0-diff | HEALTHY

---

## Working Memory

### Active Sprint: BCTC-TABLE-BOUNDARY (BTB-PERSIST-FIX)
- c327 DONE: BLOCKING-1 delete-before-insert committed 60dfac7f
- BLOCKING-2: prose units must be added by dev-pdf-extractor to PEK push payload
- NEXT: ops (rebuild mcp-server) → dev-pdf-extractor (add prose units to pek_engine_adapter.py push) → ops (rebuild pdf-extractor) → single re-extraction of FPT + ACB sentinels → qa re-verify

### Carry-over
- tool=148, sched=70 (baselines for Gate 2c/2d)
- Bun v1.3.13 C++ post-suite panic = upstream bug, pre-existing
- 352 pre-existing failures in full suite (unrelated: e.g. newsHeadlines e2e missing reuters.js)

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
