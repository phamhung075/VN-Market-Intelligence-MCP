# Architecture Brief — BCTC Trust Remediation Investigation

**Sprint:** FU-TRUST-REFRESH (proposed)
**Author:** architect
**Date:** 2026-05-31
**Mode:** INVESTIGATION + OPTIONS ANALYSIS ONLY — no sprint opened, operator approval required
**Status:** FINDINGS COMPLETE — awaiting operator decision

---

## Context

BCTC-TRUST-RED (EXIT e0c900d0) shipped gates that BLOCK fabricated data at ingest (`REJECTED_SANITY`) and REFUSE to publish unpublishable reports (`checkPublishability` in `bctcFullTools.ts`). The contaminated FPT (`e8ea3df5`) and ACB (`fea19bae`) data was purged. Both reports are now `refine_status=PENDING`, 0 units, 0 rows. The gates stop bad data. They do NOT produce good data. This brief investigates the three open problems and recommends fix paths.

---

## Problem 1 — Root Cause of the Mock Data (Highest Priority)

### The Question

Where did the ordered-digit placeholder data (`12345678901234`, all-15-units identical `refined_at 2026-05-30 11:18:58`) actually come from? Was it:

- (a) A test/dev fixture or seed script that wrote to the live `market.db`
- (b) The refine agent (Haiku) hallucinating/templating when OCR text was empty or missing
- (c) A manual `push_bctc_refined_unit` call during testing

### Evidence Gathered (live DB + code reads)

**DB state verified (live container query, 2026-05-31):**

| Report | UUID | refine_status | bctc_refined_units | bctc_table_rows |
|---|---|---|---|---|
| FPT Q1-2026 | e8ea3df5 | PENDING | 0 | 0 |
| ACB Q1-2026 | fea19bae | PENDING | 0 | 0 |

Both purged and reset. Purge was run by dev-mcp-server (c338, notebook confirms ACB UUID resolved to `fea19bae` before purge).

**OCR text layer state (live DB query):**

`pdf_extracted_text` contains BOTH Q1-2026 files:
- `20260424-FPT-BCTC-hop-nhat-Quy-1-nam-2026.pdf` — **35 pages**, all pages have > 100 chars of real text (avg ~2000 chars/page). Pages 1–10 and 16–46 populated; pages 11–15 absent in OCR table (gap of 5 pages).
- `20260422-ACB-BCTC-Hop-nhat-Quy-1-nam-2026.pdf` — **27 pages**, all have > 300 chars of real text.

The OCR text **is present in SQLite** and is **real Vietnamese financial text** (not empty, not digit-runs).

**The broken seam (root cause — code read + live API test):**

`get_bctc_page_text` (mcp-server) resolves `report_id → pdf_path → basename → getPageText(filename, page_number)`, which calls `GET pdf-extractor:5001/page-text?filename=...&page_number=N`.

The `/page-text` handler in `apps/pdf-extractor/interface/handlers.py` line 728:
```python
if ocr_text_source is None:
    return {"text": "", "source": "sqlite_ocr"}
```

`ocr_text_source` is a parameter of `register_routes()` that defaults to `None`. In `main.py` (the composition root), `register_routes()` is called **without passing `ocr_text_source`**. The `select_ocr_text_source(db_path)` factory is never called. The endpoint is a permanent no-op.

**Live API confirmation:** `curl http://pdf-extractor:5001/page-text?filename=20260424-FPT-BCTC-hop-nhat-Quy-1-nam-2026.pdf&page_number=7` returns `{"text":"","source":"sqlite_ocr"}` — empty string even though 2764 chars exist in `pdf_extracted_text` for that page.

**Implication for the refine agent:** When the BCTC-AGENTIC-REFINE cron ran (first live run after the AR-MCP-OPTY commit `47c9f328`, approximately 2026-05-30 between 12:00–13:30 based on the `refined_at=2026-05-30 11:18:58` timestamp and TZ offset), the `table-page` sub-flow called `get_bctc_page_text` for each window and received `""` for all pages. The sub-flow's Step 1 says: "Fail after 1 retry → return FAILED JSON → EXIT." But the tool did not fail — it returned `ok:true` with empty string. The sub-flow received `text=""` and interpreted it as an OCR-blank page. With no text and with the image available (6 rasterized pages found in `/data/bctc-page-images/e8ea3df5...`: pages 6–11), the Haiku subagent fell into a degenerate path: image-only extraction without numeric grounding from OCR, and produced digit-run placeholder values.

**Evidence triangle — why this is option (b), not (a) or (c):**

1. No seed script or fixture found that writes digit-run values to `market.db`. Grep of all test files shows digit-run values only in test files using `:memory:` DB (setup.ts preload confirmed). The `AR-refined-units-idempotency.test.ts` (the DV test cited in `47c9f328`) uses `:memory:` exclusively.

2. The 15-unit identical timestamp (`refined_at=2026-05-30 11:18:58`) is physically consistent with a single parallel fan-out where all Haiku calls received empty text instantly (no API latency for an empty string) and returned immediately. Genuine OCR-based fan-out staggers timestamps. This is the DT-4 forensic signal the architect brief predicted.

3. The ACB contamination has the same pattern as FPT: if the cron ran on both reports in the same session with the same broken page-text seam, both would produce identical-timestamp batches.

4. `push_bctc_refined_unit` was called by the fleet cron orchestrator (`refine_bctc_md/flow/main.md` Phase 4) — not by a human. The tool did not yet have the DT-1 sanity gate (that gate shipped in BCTC-TRUST-RED `4278b61a`, after the contamination).

**Root cause finding (binding):**

The fabrication source is the Haiku refine agent operating on empty OCR text. The upstream cause is an unwired dependency injection: `main.py` does not pass `ocr_text_source` to `register_routes()`, causing `/page-text` to return `""` permanently. The Haiku sub-flow received blank text, had partial image coverage (6 pages rasterized for FPT, 0 for ACB), and generated digit-run values as a degenerate fill-in.

This is option (b) — the refine agent fabricated when OCR text was empty/missing — caused by an unwired infra seam, not a seed script or manual push.

---

## Problem 2 — Genuine Re-Refine Path (FU-TRUST-REFRESH)

### Pre-conditions Verified

- FPT Q1-2026: 35 pages in `pdf_extracted_text`, real Vietnamese financial text, avg 2000 chars/page. Pages 11–15 are absent (gap — not extracted; these are the financial statement pages most likely to contain balance sheet and opex detail).
- ACB Q1-2026: 27 pages in `pdf_extracted_text`, real text, all pages > 300 chars.
- Both reports: `text_status=COMPLETE`, `refine_status=PENDING` — eligible for cron refine.
- FPT page images: 6 pages rasterized (pages 6–11 only). ACB: 0 pages rasterized.
- The TRUST-RED sanity gates (DT-1 digit-run, DT-2 magnitude, DT-3 cross-stmt revenue) are now wired at both ingest (`pushBctcRefinedUnitTool`) and finalize (`finalizeBctcRefineTool`). A re-refine producing digit-run values would be blocked.

### The Gap to Fix Before Re-Refine

**Gap R-1 (CRITICAL — blocks re-refine):** `/page-text` endpoint is unwired. `main.py` does not pass `ocr_text_source` to `register_routes()`. Fix: construct `SqliteOcrTextSource(db_path=cfg.db_path)` in `create_app()` and pass it as `ocr_text_source=...` to `register_routes()`. However: `cfg.db_path = /app/data/pdf_extractor.db`, not `market.db`. A second env var `MARKET_DB_PATH` (or separate config field) is needed to point to the shared `market.db` volume.

**Gap R-2 (MEDIUM — page coverage for FPT):** Pages 11–15 are absent from `pdf_extracted_text`. These are the most likely home of P&L detail (opex) and balance sheet decomposition. Without them, windows covering those pages will receive empty text from the SQLite source even after Gap R-1 is fixed. Options: (i) trigger pdf-extractor to re-extract missing pages via `/rasterize` + Tesseract inline, or (ii) mark them as `needs_image=true` and rely on page images (which must first be rasterized for FPT and all ACB pages).

**Gap R-3 (LOW — ACB has no rasterized images):** ACB has 0 pages in `/data/bctc-page-images`. The table-page sub-flow degrades gracefully to text-only when image is unavailable (confidence cap 0.6, flag `image_unavailable`). Since ACB has good OCR text (27 pages, all substantial), text-only refine is viable but lower-fidelity.

### Fix Options for FU-TRUST-REFRESH

**Option A — Wire the existing seam only (minimal, fast)**

Fix Gap R-1: Add `MARKET_DB_PATH` env var to `docker-compose.yml` and `pdf-extractor/infrastructure/config.py`. Construct `SqliteOcrTextSource(db_path=market_db_path)` in `main.py` and pass to `register_routes()`. One-line change in `main.py`, ~5 lines in `config.py`. No other changes. The refine cron runs as designed, using real OCR text for all pages that exist in `pdf_extracted_text`. Pages 11–15 (FPT) will have `text=""` from the source (genuinely absent, not a seam bug) but the agent will receive the empty signal honestly and degrade gracefully with `image_unavailable` flag (since page images are also not pre-rasterized for pages 11–15 except page 11 which IS rasterized).

Cost: ~10 lines of change across 2 files in `apps/pdf-extractor/`. Zone: dev-pdf-extractor.
Risk: Low — purely additive DI wiring. The SqliteOcrTextSource reads `pdf_extracted_text` directly (proven path, already exists in code).
Time: 1 dev task (~30 min to implement + 30 min to rebuild + verify via live `get_bctc_page_text` tool call returning real text).
Downside: FPT pages 11–15 still missing from OCR. These likely contain opex detail (EC-1 from TR-2).

**Option B — Wire seam + trigger re-extraction of missing pages (medium)**

Fix Gap R-1 (same as Option A) + trigger re-OCR of FPT pages 11–15 by calling `/rasterize` + Tesseract on those pages via the pdf-extractor `/pek-extract` or a new batch endpoint. Populate `pdf_extracted_text` for the 5 missing pages.

Cost: Option A + additional dev work to drive page-level re-OCR for 5 specific pages. Zone: dev-pdf-extractor.
Risk: Medium — `/pek-extract` triggers full PEK pipeline (model load, 2–3 min per page, memory-intensive on the 16GB Mac). These 5 pages need careful triggering off-HOSE and outside peak memory periods.
Time: 1–2 additional dev tasks beyond Option A.
Downside: Still doesn't rasterize ACB page images. Text-only for ACB.

**Option C — Wire seam + trigger full rasterization pass (comprehensive)**

Fix Gap R-1 + trigger rasterization of all pages for both FPT and ACB (via `/rasterize` calls). This gives the Haiku agent both OCR text AND page image for every window, enabling the highest-fidelity extraction (OCR for numbers, image for structure/layout). Also fills FPT pages 11–15 gap if rasterizer is used as the OCR source.

Cost: Option A + ops task to call `/rasterize` for all FPT pages (46 total) and ACB pages (27+ total). Rasterization is disk-intensive (PNG outputs at 150 DPI) but already proven (`e8ea3df5` already has 6 pages rasterized as proof of working path).
Risk: Disk usage (46 + 27+ PNGs at ~200KB each = ~15MB total — negligible). Memory load: rasterization is pdf2image + Pillow, not model-based. Low risk.
Time: Option A dev time + ops rasterize calls (can be done in a single gateway call per report).
Downside: Largest scope but still straightforward — all parts exist.

**Recommended path for Problem 2: Option A first, then Option C.**

Rationale: Option A unblocks the re-refine with genuine OCR text. It can ship in one small dev task and one rebuild. Option C (rasterize all pages) can run in parallel as an ops pre-step before the cron fires. Together they give the refine agent maximum signal. Option B (re-extracting missing pages 11–15 via PEK) is deferred to BCTC-LAYOUT-FIRST — extracting from PEK for 5 specific pages is over-engineering when the agent can handle `text=""` gracefully on those pages and the page images (from rasterize) provide structural context.

**What must be true before re-refine produces complete, non-fabricated data:**

1. Gap R-1 fixed: `get_bctc_page_text` returns real OCR text (not `""`).
2. TRUST-RED gates are live (already shipped via e0c900d0 — confirmed in container).
3. OCR text is substantive (already confirmed: real Vietnamese financial text in `pdf_extracted_text`).
4. OFF-HOSE guard respected (refine cron already includes this check in Phase 0).
5. Page images rasterized (optional for Option A, recommended for coverage).

After these conditions, a re-refine run will:
- Get real OCR text for 30/35 FPT pages (11–15 will be text-empty, agent degrades with `image_unavailable` if no image pre-rasterized for them, or gets structural image context if rasterized).
- Get real OCR text for all 27 ACB pages.
- Produce real extracted values, not digit-runs.
- DT-1 will block any remaining digit-run hallucination.
- DT-2/DT-3 will block any magnitude/cross-stmt fabrication at finalize.

---

## Problem 3 — Coverage Gaps (TR-2)

### Current State

The BCTC-TRUST-RED brief routed TR-2 (opex codes 11/24/25/26, equity/liabilities decomposition, cash-flow OCF, prior-period column, EBITDA=0) to BCTC-LAYOUT-FIRST as acceptance criteria. The DT-2 `BALANCE_FORCED_ZERO` guard now blocks the symptom (zero equity + zero liabilities with passing balance check). This is the correct disposition.

### Whether TR-2 Belongs Here or in BCTC-LAYOUT-FIRST

**Assessment after investigation:**

The TR-2 gaps are genuine extraction coverage issues, not trust failures. They manifest because:

1. **Opex codes 11/24/25/26** — The Haiku table-page sub-flow extracts what it sees in the OCR text window. These codes exist on FPT pages 11–15 (the 5 absent pages). Once Gap R-2 is fixed (pages re-OCR'd) or the pages are image-rasterized, the sub-flow will extract them. This is solvable within the re-refine fix (Option B covers it).

2. **Equity/liabilities decomposition** — ACB's balance sheet decomposition is on later pages. The sub-flow flow sub-flows are narrow (table-page handles one window). If the page is in the window and has good OCR text, the sub-flow will produce the rows. ACB has all 27 pages in OCR. This is a window-boundary or sub-flow-recognition issue, not an OCR gap. It belongs in BCTC-LAYOUT-FIRST (sub-flow enrichment for balance sheet section recognition).

3. **Cash-flow OCF rows** — Scattered across pages 9/10/16. FPT pages 9 and 10 ARE in `pdf_extracted_text` (2649 and 1318 chars respectively). Page 16 is also present (3053 chars). The agent should be able to extract OCF from these pages. If it does not, the sub-flow needs enrichment in the continuation-stitch flow. This is BCTC-LAYOUT-FIRST territory (agent-father).

4. **Prior-period column drift (EC-5)** — Multi-unit contradiction in prior-period revenue. DT-3 now blocks finalize when this occurs (cross-stmt revenue contradiction > 20% divergence). The root fix (getting consistent prior-period column from all windows) requires sub-flow improvement. BCTC-LAYOUT-FIRST.

5. **EBITDA = 0** — FPT `ebitda` field is zero because the parser's `operating_profit` → `ebitda` mapping is absent. This is a parser gap in `refinedMarkdownParser.ts` (application layer). Could be fixed as a small mcp-server task, but it is part of the BCTC-LAYOUT-FIRST acceptance criteria as defined.

### Recommendation on TR-2 Placement

**Confirm the existing disposition (BCTC-LAYOUT-FIRST) with one exception:**

- Opex codes 11/24/25/26 for FPT are likely on pages 11–15 (absent from OCR). Once Option B (re-OCR of missing pages) or page image rasterization is done, a fresh refine run may naturally capture these without any sub-flow changes. **Hold TR-2 EC-1 verdict until after a successful re-refine produces real data — then evaluate whether the opex codes appear.**

- The EBITDA=0 parser mapping gap is a small fix (`refinedMarkdownParser.ts` or a post-parse mapping in `finalizeBctcRefineTool.ts`). It can be a micro-task inside FU-TRUST-REFRESH (30 min) rather than waiting for BCTC-LAYOUT-FIRST. **Operator decision flag #3: fold EBITDA mapping fix into FU-TRUST-REFRESH or defer to BCTC-LAYOUT-FIRST?**

---

## Overall Sequencing Recommendation

### Phase 1 — Unblock Re-Refine (FU-TRUST-REFRESH, 1 sprint)

**Goal:** Fix the broken seam, enable genuine re-refine of FPT and ACB, verify gates block fabrication.

**Tasks:**

| Task | Owner | Description | Effort |
|---|---|---|---|
| FU-1: Wire OCR seam | dev-pdf-extractor | Add `MARKET_DB_PATH` env var; construct `SqliteOcrTextSource(market_db_path)` in `main.py`; pass to `register_routes()`. Verify: live `get_bctc_page_text` call returns real text. | 1 dev task |
| FU-2: Rasterize all pages | ops | Call `/rasterize` for all FPT pages (46) and ACB pages (27+). Verify: images in `/data/bctc-page-images/{id}/`. | 1 ops task (gateway calls) |
| FU-3: Trigger re-refine | ops (after FU-1 + FU-2) | Confirm reports are PENDING. Run refine cron off-HOSE. Monitor window results via `get_bctc_refined`. | 1 ops task |
| FU-4: Verify clean output | qa | After refine: `get_bctc_full(FPT)` returns real financial data (not digit-runs). `bctc_table_rows COUNT > 0`. `refine_status=DONE`. DT-1/DT-2/DT-3 did not block (no REJECTED_SANITY). If DT-3 fires (prior-period contradiction), evaluate root cause before clearing. | 1 QA task |
| FU-5 (optional): EBITDA mapping | dev-mcp-server | Add `operating_profit → ebitda` mapping in `refinedMarkdownParser.ts` or post-parse in `finalizeBctcRefineTool.ts`. Operator decision required. | 0.5 dev task |

**What can wait:** BCTC-LAYOUT-FIRST sub-flow enrichments (equity decomposition, CF continuation, prior-period column normalization). These wait until re-refine is done and the fresh output is evaluated.

**What depends on what:**
- FU-3 depends on FU-1 (seam fix) and FU-2 (rasterize, optional but recommended).
- FU-4 depends on FU-3.
- FU-5 is independent of FU-1–4 (separate file, no conflict).

### Phase 2 — Coverage Completion (BCTC-LAYOUT-FIRST, existing sprint)

After Phase 1 confirms real data is flowing, evaluate FPT/ACB re-refine output against TR-2 acceptance criteria. Address remaining gaps (sub-flow enrichment for equity/CF/prior-period) as part of BCTC-LAYOUT-FIRST LF-QA tasks (already registered per TRUST-RED brief §5).

### Sprint Structure Recommendation

**ONE new sprint (FU-TRUST-REFRESH)** for Phase 1. Not several. The scope is:
1. One infrastructure fix in pdf-extractor (Gap R-1).
2. One ops rasterize pass.
3. One refine run + QA verify.
4. Optional EBITDA parser fix.

This is a 3–5 task sprint. Parallelizing with BCTC-LAYOUT-FIRST is safe (disjoint files: pdf-extractor config vs. extraction sub-flows and agent flows).

---

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Root cause of fabrication | Option (b): Haiku hallucinated on empty OCR text | Evidence: `/page-text` endpoint proven to return `""` permanently; OCR text IS real in SQLite; no seed script/fixture found that writes to live DB; timestamp pattern matches instant empty-string returns |
| Re-refine strategy | Option A first (wire seam), then Option C (rasterize) | Minimum-viable unblock: wiring the seam gives 30/35 FPT pages + all 27 ACB pages real OCR text. Rasterize ensures image coverage. Both together = max fidelity. |
| TR-2 disposition | Confirm BCTC-LAYOUT-FIRST routing; hold EC-1 opex verdict until after re-refine | Opex pages may appear once real OCR text flows. Sub-flow enrichments (equity, CF, prior-period) are extraction layer changes requiring agent-father. |
| Sprint count | One (FU-TRUST-REFRESH) | Scope is bounded: 1 infra fix + 1 ops pass + 1 verify. Does not require new agent sub-flows or schema changes. |

---

## Operator Decision Flags

**OD-1 (REQUIRED before sprint open):** Confirm FU-TRUST-REFRESH sprint should be opened with the scope above. This is a small sprint (3–5 tasks). If approved, route to BA for a brief spec (the architecture is fully defined here; BA spec is thin).

**OD-2 (REQUIRED):** Should FU-1 (pdf-extractor seam fix) route to dev-pdf-extractor? Yes — `apps/pdf-extractor/` is the dev-pdf-extractor zone. Confirm zone ownership before dispatch.

**OD-3 (DECISION):** Include FU-5 (EBITDA mapping fix in `refinedMarkdownParser.ts` — mcp-server zone) in FU-TRUST-REFRESH, or defer to BCTC-LAYOUT-FIRST? The fix is ~10 lines, low-risk, and can ship in the same sprint. **Architect recommendation: include in FU-TRUST-REFRESH** (it is a parser mapping correction, not an extraction sub-flow change).

**OD-4 (INFORMATION — no action needed now):** The FPT pages 11–15 gap in `pdf_extracted_text` is a known extraction coverage gap. It may explain why opex codes 11/24/25/26 were missing in the contaminated data. Evaluate after re-refine whether the Haiku agent extracts these codes from adjacent page context (pages 10 and 16 both have substantial text). If still absent, escalate to BCTC-LAYOUT-FIRST for targeted re-OCR of those 5 pages.

---

## File Change Forecast (FU-TRUST-REFRESH)

### Zone: dev-pdf-extractor

| File | Change |
|---|---|
| `apps/pdf-extractor/infrastructure/config.py` | Add `market_db_path: str` field reading `MARKET_DB_PATH` env var (default `"/app/data/market.db"`) |
| `apps/pdf-extractor/main.py` | Import `select_ocr_text_source`; construct `ocr_text_source = select_ocr_text_source(cfg.market_db_path)`; pass to `register_routes(ocr_text_source=ocr_text_source)` |

### Zone: dev-mcp-server (optional, OD-3)

| File | Change |
|---|---|
| `apps/mcp-server/src/application/utils/refinedMarkdownParser.ts` | Add `operating_profit → ebitda` post-parse mapping (OR add in `finalizeBctcRefineTool.ts` post-parse step) |

### Zone: ops / docker-compose

| File | Change |
|---|---|
| `docker-compose.yml` | Add `MARKET_DB_PATH=/app/data/market.db` env var to `pdf-extractor` service; confirm `market.db` volume is mounted in pdf-extractor service (currently only mounted in mcp-server) |

**Note on volume mounting:** The `market.db` volume is currently mounted in `mcp-server` only. To let `pdf-extractor` read `pdf_extracted_text` directly, ops must add the shared volume mount to the `pdf-extractor` service in `docker-compose.yml`. This is an ops/config change, not a code change. It must happen before the dev-pdf-extractor fix is rebuilt.

**Operator decision flag #5 (OD-5):** Confirm that the shared `market.db` volume can be mounted read-only in `pdf-extractor`. The SqliteOcrTextSource opens the DB read-only (SELECT only). No write path in `ocr_text_source.py`. Read-only mount is safe.

---

## Risk Flags

**RISK-1 (HIGH):** If `market.db` is not mounted in the pdf-extractor container, `SqliteOcrTextSource.get_page_text()` will fail to open the DB, log a WARNING, and return `""` — the same behavior as today. The `/page-text` endpoint will appear to work (HTTP 200) but return empty text. **Mitigation:** ops must verify the volume mount before dev rebuilds; add a startup health-check in `ocr_text_source.py` that logs a one-time ERROR if the DB is unreachable (not just per-call WARNING).

**RISK-2 (MED):** After the seam is fixed, the refine cron will produce real data on the first run. If the refine produces a DT-3 cross-statement revenue contradiction (prior-period values differ > 20% across windows), `finalize_bctc_refine` will set `refine_status=REJECTED_SANITY` and the report will not be published. This is the correct behavior (real data may still have inconsistencies from extraction). **Mitigation:** QA must check the finalize return value. If `ok=false` with `CROSS_STMT_REVENUE_CONTRADICTION`, evaluate whether the 20% threshold is too tight for real data and whether DT-3 needs tuning.

**RISK-3 (LOW):** FPT pages 11–15 absent from OCR. If these pages contain the primary opex table, the fresh refine will still produce zero opex codes 11/24/25/26. The BALANCE_FORCED_ZERO guard (DT-2) will allow finalize to proceed (opex absence does not trigger forced-zero; only zero equity+liabilities does). The report will be published as PARTIAL with those codes missing. **Mitigation:** Evaluate after re-refine. If opex codes absent, OD-4 triggers BCTC-LAYOUT-FIRST escalation.

**RISK-4 (LOW):** The DT-1 digit-run threshold (≥2 distinct digit-run values = BLOCK) may be triggered by legitimate BCTC numeric codes (e.g. tax identification numbers, registration codes) that appear in FPT's OCR text. The threshold was designed to avoid false positives on single occurrences. If DT-1 blocks a genuine window, QA will see `ok=false, rejected_reason=DIGIT_RUN` in the push response. **Mitigation:** QA checks push responses per window. Single false-positive = WARN (not BLOCK), so only systematic digit-runs would cause a block.

---

## Build Standard

```
BUILD-STANDARD: lean
NOTE: FU-TRUST-REFRESH is purely additive — one DI wiring fix in pdf-extractor config
      + main.py. No new tables, no new schema values, no new Docker volumes (the shared
      market.db volume already exists; ops adds a read-only mount to pdf-extractor).
      dev-mcp-server EBITDA fix is a parser mapping addition (optional, operator decision).
```
