# dev-pdf-extractor — Notebook

Zone: `apps/pdf-extractor/` | Stack: Python/FastAPI | DB: pdf_extractor.db (write)

**Runbook:** `docs/protocols/async-blocking-pattern.md` — asyncio.to_thread() for sync I/O, /health health-checks on overloaded services.

---

## Session: 2026-06-10 (BPE-DEV-5 + BPE-DEV-1 — BCTC prose extraction sprint)

**Task:** BPE-DEV-5 (size M) + BPE-DEV-1 (size M) — fix Tesseract SIGTERM under load + missing prose extraction.

### BPE-DEV-5: BLOCKER-B (Tesseract SIGTERM) + missing thresholds

- Added `MAX_TESSERACT_RETRIES=2` constant + `_tesseract_image_to_data()` retry wrapper (1.5s sleep between attempts)
- Added `bctc-eval-thresholds.json` baked into image; two-path lookup: primary `/app/config/`, fallback project root
- FPT Q1-2026 result: 0 empty units (was 13 empty); 14 table units with real markdown; 5 prose units stable
- Tests: 5 new in `test_ocr_unit_tesseract_retry.py` (all AC1-AC4 PASS); 785 pass / 36 pre-existing fail (no regressions)
- **Commit:** `c2069deb`

### BPE-DEV-1: Missing prose extraction fix

- Root cause: `ocr_unit()` declared `prose_lines=[]` but never appended → returned empty `stitched_markdown` for all prose units for 7+ sprints
- Fix: ocr_unit() extended with `ocr_pages: Optional[List[Dict]]=None`; prose branch builds page→text map; skips blank pages; emits `_prose_no_text=True` when blank
- Tests: 16/16 prose unit tests GREEN; 736/736 total unit tests PASS (no regressions)
- **Commit:** `6e518935`

**QA:** Both sessions REVIEW status. Zone healthy (0 empty layout units on FPT Q1-2026, all 46 pages covered).

---

## Session: 2026-06-08 (A20-EVENTLOOP-ASYNC-TO-THREAD)

**Task:** A20 — fix event loop blocking from `extract_tables()` + `extract_text_ocr()` (async def with no await).

- Root cause: pdfplumber page iteration + pytesseract.image_to_string() ran synchronously on uvicorn event loop, blocking `/health` for 30-80s (40-80 page PDFs)
- Fix: asyncio.to_thread() wrap — extracted sync bodies (`_extract_tables_sync` + `_extract_text_ocr_sync`); public methods thin wrappers
- Tests: 2 new regression guards (TC-EE-1 + TC-EE-2) GREEN; full suite 850 passed, 40 pre-existing FU-DEBT, 1 skipped
- **Outcome:** QA gate unblocked; ops rebuild pending

---

## Session: 2026-06-07 (FIX-PDFX-PUSH-CLIENTS-ASYNC-URLOPEN)

**Root cause:** 3 push clients called `urllib.request.urlopen()` directly in async methods, blocking event loop (up to 30s).

- Fix: applied asyncio.to_thread(_do_request) pattern to layout_first_push_client.py, md_table_push_client.py, eval_push_client.py
- Tests: 3 new (TC-PUSH-LF-1, TC-PUSH-MD-1, TC-PUSH-EVAL-1) GREEN; suite 848 passed (+3)
- Alert: alert_adapter.py send_work_alert() has 5s urllib call — latent issue, low-frequency path only

---

## Archive: Earlier Sessions (2026-05-31 through 2026-05-28)

**2026-05-31:** FU-TRUST-REFRESH/FU-1 — `/page-text` endpoint returning empty string fixed; `ocr_text_source` now passed to register_routes; `MARKET_DB_PATH` env added; 23/23 unit tests PASS; container rebuild required before FU-3 re-refine.

**2026-05-30:** BTB-DRIFT-DEV — canonical grouping via `bctc_page_grouper.py` SSOT; PATH A (build_document_map) + PATH B (_run_extraction) unified; prose-unit emission + D-5 title-band signal fixed; 718/718 unit tests PASS; AD-2 PROVEN-GREEN.

**2026-05-29:** BTB-DEV — 4 root causes (state machine) fixed in generic_md_table_extractor.py; 42 pure-function tests added; 659/659 PASS; DV-1 + DV-2 PROVEN-GREEN.

**2026-06-08:** FIX-PDF-EXTRACTOR-UNHEALTHY (A-20, 3rd recurrence) — `cpus: '1.0'` CFS cgroup budget exhaustion. asyncio.to_thread + ProcessPoolExecutor insufficient (shared cgroup). Escalated to architect (options: cpus 2.0 / Tesseract sidecar / healthcheck gate during active OCR). Operational recovery: docker restart. BCTC batch unblocked.

**2026-06-08:** BCTC staleness probe — FIX-PDF-EXTRACTOR-UNHEALTHY re-scoped; zone_missing_tier3 signal emitted to PO (dev-mcp-server); root cause: bctcQueueEnricherJob placeholder-URL matching gap (18 rows stuck in 404 retry loop).

---

**Current state (2026-06-10):** All async-blocking fixes deployed; prose extraction pipeline restored; A-20 architecture escalated (awaiting cpus increase); zone healthy.

## 2026-06-14 — FIX-BCTC-VPS-PIPELINE-STALE-5D

**Incident:** BCTC VPS pipeline stale 5+ days (Jun 8 01:17 → Jun 13 20:45 UTC).

**Finding:** mcp-server was running continuously. bctcPdfPullJob ran 118 times, bctcQueueEnricherJob ran 341 times — 339 runs returned 0 URLs found. Root cause = HSX iboard URL discovery failed for 16 Q1-2026 tickers for 5 days. Not a VPS death, not a pull-job crash, not a pdf-extractor rejection.

**Zone verdict:** OUT_OF_ZONE. Fixes needed in apps/mcp-server/:
1. `vpsHealthPoller.ts` line 169 — vn-bctc-fetch passive=true → add active freshness query on bctc_vps_queue.
2. `bctcQueueEnricherJob` — alert when urlsPopulated=0 for N consecutive runs during earnings window.
3. HNX/UPCOM tickers (ACV, BDI, DAG, DLC, JSH, SIS, VDC, VNH, VEA) need non-HSX discovery path.

**Handoff:** Task updated → HANDOFF status, owner dev-mcp-server.

**Pipeline state at close:** 7 new PDFs downloaded Jun 13 21:35-22:17; FRT/SAB/VIX/VND/DGC/VJC/GEX/BSR/DBC/HUT still pending with HSX URLs; 9 tickers with no URL.

---

## Session: 2026-06-14 (DOCLANG-SERIALIZE Phase 1 — T1-T6)

**Tasks:** DOCLANG-T1-DOMAIN through DOCLANG-T6-TESTS (sprint DOCLANG-SERIALIZE)

### Decision log

- XSD `thread_id` requires `xs:positiveInteger` (>= 1). `table_index=0` maps to `thread_id=1` (table_index+1) to satisfy XSD. This is a serialization detail; DTO `table_index` unchanged.
- `<custom>` XSD has no `mixed="true"` — raw text inside `<custom>` fails validation. Used `<head><meta>report_id=...</meta></head>` instead (meta is mixed=true+xs:any).
- EC-3 surplus rows intentionally skip `doclang.validate()` — schematron rectangular-rule fires on non-equal row cell counts. Test validates WARNING logged + surplus cells emitted.
- Schematron requires XSLT3/Saxon-HE via `saxonche`. Installed system-wide for host dev; container risk documented in arch brief RISK-1.

### Implemented

- T1: `DocLangWritePort` Protocol (17th port) + `Config.doclang_output_dir` (`DOCLANG_OUTPUT_DIR`, default `/app/data/doclang`)
- T2+T3: `infrastructure/doclang_serializer.py` — `DocLangSerializer` + `FilesystemDocLangWriteAdapter` + `NullDocLangWriteAdapter`
- T4: `application/doclang_serialize_usecase.py` — `DocLangSerializeUseCase` (never gates, validation observability only)
- T5: `main.py` wired (3 imports + 4 lines + `register_routes` kwarg), `requirements.txt` += `doclang==0.6.0`
- T6: `__tests__/unit/test_doclang_serializer.py` — 13 tests: Fixtures A/B/C + EC-2/3/4 + XML escape + use case

### Results

- pytest: **13 new tests PASS**; full suite 967-968 passed; 2-3 pre-existing failures (real-OCR tests need missing PDF + flaky timeout test)
- doclang.validate(): VALID on Fixtures A, B, C, EC-2, EC-4
- mypy: 0 new errors in new files; pre-existing 18 errors in dtos.py/ports.py/module.py (not touched)
- Commits: scaffold `5d121989` + T1 harden `2d79baed` + type-ignore fix `01ce9431`

**Status:** DOCLANG-T1..T6 → REVIEW, next_agent=qa
