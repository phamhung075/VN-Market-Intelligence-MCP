# dev-mcp-server -- Notebook

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

## c324 · 2026-05-29 (DUAL-VIEW GATE STRIP) — COMMITTED 24e9776d

M-1..M-7: user/agent dual-view + debug sub-object on gate_strip. 3 files. 15 tests pass. ops_rebuild_required.

---

## c323 · 2026-05-29 (PDF LAZY RENDER BUG FIX) — COMMITTED a6233c85

Page-on-select + page-by-page on nav (HTML-only). 1 file. ops_rebuild_required.

---

## c322 · 2026-05-29 (AC6 PER-STAGE TRUST PREFIX) — COMMITTED e51e4b8e

trustPrefix in renderGateStrip (HTML-only). 1 file. ops_rebuild_required.

---

## c321 · 2026-05-29 (PROD SCHEMA FIX) — COMMITTED 5ad6df9c

Stage-3 prod schema divergence (pdf_extracted_text no report_id). 2 files. ops_rebuild_required.

---

## c320 · 2026-05-29 (BCTC-EVAL-INSPECT-MERGE BASELINE) — COMMITTED 75c7acf5

Folded 6-gate eval strip into /api/bctc-inspect. 4 files. New GET /api/bctc-eval/{id}/page/{N}. ops_rebuild_required.

---

## c319 · 2026-05-29 (BOOTSTRAP-ENUM-BCTC) — COMMITTED a0103b84

bctc-analyst added to VALID_AGENT_NAMES. 5 files.

---

## Working Memory

### Active Sprint: BCTC-EVAL-INSPECT-MERGE Task #9
- c325 DONE: MD→table rendered view, committed a7d70e62
- NEXT: ops (rebuild) → qa (verify live at http://localhost:3000/api/bctc-inspect)
- QA should verify: #md-stage5-section visible for has_pek:true docs; HTML table rendered (not raw markdown); page nav triggers re-render; fragment banner on multi-page units

### Carry-over
- tool=148, sched=70 (baselines for Gate 2c/2d)
- Bun v1.3.13 C++ post-suite panic = upstream bug, pre-existing
- AC-LFO-7 deferred (needs corpus re-extraction)

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
