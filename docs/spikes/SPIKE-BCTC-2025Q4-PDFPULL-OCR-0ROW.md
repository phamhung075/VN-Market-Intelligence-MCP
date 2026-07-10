# SPIKE-BCTC-2025Q4-PDFPULL-OCR-0ROW — Why does the 2025-Q4 enrich_failed cohort yield 0 bctc_table_rows AND 0 bctc_md_tables?

**Task:** SPIKE-BCTC-2025Q4-PDFPULL-OCR-0ROW (P-high, timebox 120min)
**Investigator:** developer (router-dispatched, round-6 dispatch off `OPS-BCTC-BANK-2025Q4-ENRICH-0ROW-REPARSE`)
**Mode:** read-only diagnostic — code trace + live bounded probes against the running containers
(`docker exec` read-only SQLite queries against the named-volume `market.db`, `docker logs`,
`curl` reachability checks). **No code changed, no branch merged, no DB write, no container
restart/rebuild.**

---

## Question

Why does the entire 2025-Q4 `enrich_failed` cohort (12 tickers: ACB/BID/EIB/GAS/GVR/HCM/MBB
(bank) + D2D/HSG/NKG/POW/SSI (non-bank)) yield `bctc_table_rows=0` AND no `bctc_md_tables` row?
PO's round-5 RAW-probe already established: global `MAX(bctc_table_rows.extracted_at) =
2026-07-08 12:35:10` → zero successful table extraction DB-wide since Jul-8; `bctc_md_tables`
holds only 1 row in the whole DB. Scope: is the failure (a) VPS OCR health/reachability, (b) a
code/config regression around 2026-07-08 in `apps/pdf-extractor`, or (c) something else — and
specifically why does GAS have no `financial_reports` row at all. Explicitly OUT OF SCOPE:
`bctcReparseJob` itself and the bank-form classifier (both already proven off-path by PO).

---

## Approach tried

1. Read `docs/agents/developer/flow/feature-spike.md` + resolved full round-1..6 history from
   `orch-state.json` `.task_board` row `OPS-BCTC-BANK-2025Q4-ENRICH-0ROW-REPARSE.detail`.
2. `git log --pretty="%h %ai %s" -- apps/pdf-extractor/` around 2026-07-08/09 to find candidate
   regressions; inspected the one commit that touches the OCR-score path directly
   (`fdb424178`, "stop fabricating 0.7 confidence for missing PaddleOCR cell score") — traced
   `row_density` end-to-end (`pek_engine_adapter.py` → `unit_ocr.py` → `extract_layout_first_usecase.py`)
   to confirm whether the new `None` sentinel is consumed anywhere that could crash/reject rows.
3. Live container probes: `docker ps`/`docker inspect` to get exact image-build vs. commit
   timestamps (converted `+0200` author dates → UTC to compare against `docker inspect
   .State.StartedAt`/image `.Created`), confirming exactly which commits are baked into the
   **currently running** `pdf-extractor` image.
4. `docker logs vn-market-intelligence-mcp-pdf-extractor-1 --since 12h` (full scan for
   WARNING/ERROR/Traceback — zero found) and `docker logs ...mcp-server-1 --since 12h | grep
   bctcPdfPull` to get the exact per-ticker timeline (PDF-saved size + ENRICH-0-rows FAIL-LOUD
   timestamps) for the live cohort, cross-referenced against pdf-extractor's own access log
   (which HTTP endpoint was actually called, what status code).
5. Traced the call graph from `bctcPdfPullJob.ts` → `pushBctcExtraction.ts` →
   `pdfExtractorClient.ts` to identify exactly which pdf-extractor HTTP endpoint the automatic
   30-min pull cron invokes, and grepped the entire `apps/mcp-server/src` tree for callers of the
   table-producing endpoints (`/extract-tables`, `/extract-md-tables`, `/extract-layout-first`,
   `/pek-extract`) to find what — if anything — actually populates `bctc_table_rows`/`bctc_md_tables`
   in production, and whether any of those callers are wired into a cron/scheduler.
6. Cross-checked against `docs/architecture-briefs/2026-05-27-pek-render-seam.md` (design intent
   for `/api/trigger-pek-extract`) and `docs/architecture-briefs/2026-07-03-bctc-discover-pipeline-dead.md`
   (an independent architect SPIKE from 7 days earlier that already recorded the identical 0-row
   signature at Stage 4, before `fdb424178` or the 07-09 refactor even existed).
7. Live read-only DB probe (`docker exec mcp-server-1 bun /tmp/probe.js`, `bun:sqlite`
   `readonly:true`) for `financial_reports`/`bctc_vps_queue` rows for the full cohort, to confirm
   GAS's missing shell row and check `pdf_path` sync state for the others.
8. `curl` reachability checks for the VPS PDF source (`125.212.251.27:8765/health`,
   `staticfile.hsx.vn`) from inside the mcp-server container.
9. Read `application/usecases.py` (`ExtractPDFUseCase`) + `domain/services.py` OCR-confidence
   gate (`_OCR_CONFIDENCE_THRESHOLD = 0.5`) to explain GAS's missing shell row.

---

## Findings

### (a) VPS reachability — NOT the bottleneck; there is no separate "VPS OCR" compute service

- `curl -m 10 http://125.212.251.27:8765/health` → **200**. `curl -m 10
  https://staticfile.hsx.vn/` → **200**, both from inside the mcp-server container, right now.
- `bctcPdfPullJob`'s own per-ticker logs for the entire cohort show `result.failed=0,
  result.deferred=0` on every "cycle complete" line — every single PDF fetch this session
  succeeded (real, correctly-sized bytes: GAS 17.48MB, BID 14.6MB, D2D 12.1MB, EIB 12.6MB, HCM
  10.76MB, SSI 10.5MB, NKG 17.05MB, POW/ACB 8.16MB, HSG/MBB 3.0-3.4MB, GVR 2.75MB).
- The "VPS" in this architecture is a **PDF file cache** (`125.212.251.27:8765/bctc-files/` +
  `staticfile.hsx.vn`), not an OCR compute service — OCR (Tesseract/PaddleOCR/PEK) runs entirely
  **inside the local `pdf-extractor` container**. That container is `Up 17 hours (healthy)`,
  answered every `POST /extract` call in the last 12h with `200 OK` (verified via its own access
  log), and emitted **zero** WARNING/ERROR/Traceback lines in the same 12h window despite
  processing 14+ multi-MB PDFs through the full pipeline.
- **Verdict: (a) is cleared.** Neither the VPS PDF cache nor the local pdf-extractor service is
  down, unreachable, or erroring.

### (b) No code regression in `apps/pdf-extractor` around 2026-07-08 explains this

- The only 07-08-dated commit touching the OCR path is `fdb424178` ("stop fabricating 0.7
  confidence for missing PaddleOCR cell score", 06:32:46 UTC). Traced `row_density` end-to-end:
  it is written into `row_bands[]` dicts and **never read back anywhere downstream** except for
  `y_min`/`y_max` (used for row-band boundary math in `unit_ocr.py` and schema-page pitch
  calculation in `extract_layout_first_usecase.py`). The `row_density` **value itself** (0.7 vs
  `None`) is dead metadata in the current pipeline — grepped the whole codebase (Python +
  mcp-server TS) and it is consumed nowhere. This commit cannot be the cause.
- Compared UTC-converted commit timestamps against `docker inspect` image-build time
  (`2026-07-09T16:07:53Z` / `18:07:53+0200`): the **currently running** pdf-extractor image
  already includes `fdb424178`, the Tier-split refactor (`c3f30df24`, `bfe92c225`, `47453d546`),
  and the **full 8-stage `generic_md_table/` extraction, "collapse shim" (final stage
  `f261bd4b6`)** — confirmed live inside the container
  (`/app/infrastructure/generic_md_table/{constants,document_map,extractor,grid_cleanup,markdown_emit,ordinal_grid,page_zoning,unit_ocr}.py` all present). It does **not** yet include
  the two later commits `87ccf249a`/`42cf264f4` (both landed after image build, irrelevant here).
- **The real gap is not inside `apps/pdf-extractor` at all — it is in `apps/mcp-server`'s
  orchestration layer, and it is not a regression but a standing architectural gap:**
  - `bctcPdfPullJob.ts` (`*/30 * * * *` cron) calls `triggerExtraction` → `triggerPushBctcExtraction`
    (`pushBctcExtraction.ts`) → `extractViaMicroservice` (`pdfExtractorClient.ts`), which POSTs
    **only** to pdf-extractor's plain `POST /extract` endpoint. That endpoint routes to
    `ExtractPDFUseCase`/`local_extract_usecase` — a **scalar/plain-text extraction path**
    (`pdfplumber` + OCR-confidence-gated Tesseract fallback), feeding `fetchParseAndStoreBctc`
    for scalar `financial_reports` columns. **It has never called `/extract-tables`,
    `/extract-md-tables`, `/extract-layout-first`, or `/pek-extract`** — the only four endpoints
    on pdf-extractor that can populate `bctc_table_rows`/`bctc_md_tables`.
  - Confirmed by grepping the entire `apps/mcp-server/src` tree: `/extract-md-tables` and
    `/extract-layout-first` have **zero callers anywhere** in production code.
    `/pek-extract` has exactly one caller: `POST /api/trigger-pek-extract`
    (`bctcVpsIngestHandler.ts`), a **manual, on-demand** HTTP endpoint (per its own design brief,
    `docs/architecture-briefs/2026-05-27-pek-render-seam.md` §"Trigger driver location" — Option
    T-A, explicitly designed to be called by a "backfill driver" or "the cron job", but grepping
    `cronConfig.ts`/`schedulerJobTable.ts` for `pek` returns **zero matches** — it was never
    actually wired into any recurring cron). `/extract-tables` has exactly one caller,
    `bctcBatchTableBackfillJob.ts`, which is itself **dead code** — defined but imported
    nowhere else in the entire `src` tree (not in `schedulerJobTable.ts`, not in the MCP tool
    registry, not in any route).
  - `bctcPdfPullJob.ts`'s own `FIX-BCTC-ENRICH-SILENT-0ROWS` 0-row gate reads `bctc_table_rows`/
    `bctc_md_tables` counts **immediately** after `triggerExtraction` returns — but since
    `triggerExtraction` never attempts table extraction at all, this gate is **structurally
    guaranteed to fire `enrich_failed` for every single newly-pulled report, unconditionally**,
    regardless of PDF quality, ticker, form type, or quarter. Live logs from the last 12h
    confirm this: **every** ticker pulled through the queue — not just the 12-ticker 2025-Q4
    cohort, but also VCI and VHM (both also 2025-Q4, but not yet folded into the OPS row) —
    ended `ENRICH 0-rows — FAIL LOUD` with identical `tableRowCnt=0, mdTableCnt=0`.
  - `MAX(bctc_table_rows.extracted_at) = 2026-07-08 12:35:10` therefore does **not** mark when
    something broke — it marks the last time a human/agent manually ran a `trigger-pek-extract`
    sweep (or the older agentic-refine pipeline) over some backlog of reports. Nothing has
    manually re-triggered that path since.
  - **This is independently corroborated by a prior architect SPIKE from 7 days earlier**
    (`docs/architecture-briefs/2026-07-03-bctc-discover-pipeline-dead.md`, §"Stage 4"): "9 of the
    most recent 10 pull-cycle items ended `enrich_failed` (0 `bctc_table_rows` AND 0
    `bctc_md_tables`)" — the **exact same signature**, present **before** `fdb424178` and the
    entire 07-09 refactor existed. This is not a 07-08 regression; it is the standing behaviour
    of `bctcPdfPullJob`'s extraction call path since it was built (confirmed via `git log
    pushBctcExtraction.ts`: every commit touching this file, back to its introduction `70e75cbd5`
    "1954c task-4 — pushBctcExtraction deps → service", has only ever called the plain `/extract`
    service endpoint).
- **Verdict: (b) is answered — no code regression in `apps/pdf-extractor`.** The defect is an
  orchestration/wiring gap in `apps/mcp-server` (out of this zone's ownership, `cross-service` or
  `apps/mcp-server` proper) that predates the 07-08 date window entirely; PO's "since Jul-8"
  framing reflects the last manual trigger, not a break point.

### (c) GAS has no `financial_reports` row — a downstream symptom of the same legacy-pipeline gate

- RAW-verified live (read-only `bun:sqlite`): `SELECT * FROM financial_reports WHERE
  action_code='GAS' AND sort_key='2025-Q4'` → **0 rows**, confirming PO's round-5 finding still
  holds. The GAS PDF (17.48MB) **is** correctly downloaded and saved to
  `/app/data/pdfs/GAS_2025_Q4.pdf` (log-confirmed, `bctcPdfPull] PDF saved`) — this is a
  parse/text-extraction failure, not a download failure.
- `pushBctcExtraction.ts`'s `runPipeline` (`fetchParseAndStoreBctc`, the function that actually
  creates the `financial_reports` shell row) is documented as "called iff at least one tier
  yields text >= 100 chars" across its 3-tier fallback (Tier 1 `pdf_path` via `/extract`, Tier 2
  remote URL via `/extract` — expected to 401 for VPS URLs, Tier 3 direct `pdf-parse` on the raw
  buffer, zero OCR capability).
- `ExtractPDFUseCase.execute` → `ExtractPDFService.process_pdf` (`domain/services.py`) has an
  explicit quality gate: `if ocr_conf < _OCR_CONFIDENCE_THRESHOLD (0.5) and not tables: raise
  PDFProcessingError` — caught by the use case, returned as `status: "failed", text_content: ""`.
  Tier 3 (`pdf-parse`) has no OCR fallback at all and would return near-empty text for a
  scanned/image-only PDF.
- **Working hypothesis (not fully confirmed within timebox, flagged for follow-up):** GAS's
  2025-Q4 PDF is very likely a scanned/image-heavy filing whose OCR confidence fell under 0.5 on
  all 3 legacy tiers, so `rawText` never reached the 100-char floor, `runPipeline` was never
  called, and the `financial_reports` shell row was never created. Other cohort members
  (ACB/BID/EIB/HCM/HSG/NKG/POW/SSI) **did** get a `financial_reports` row with `pdf_path` set —
  their legacy-tier scalar extraction succeeded well enough to create the row, even though (per
  finding b) that success has **no bearing** on whether table rows ever get populated. GVR, MBB,
  and D2D got a `financial_reports` row but with **`pdf_path IS NULL`** despite the PDF existing
  on disk at the predictable path — this desyncs them from `/api/trigger-pek-extract`, which per
  its own design brief must skip any report where `pdf_path IS NULL` ("Do NOT attempt to trigger
  PEK for these").
- **This is a downstream symptom of the same root cause as (b), not a separate defect**: the
  legacy scalar pipeline is being asked to do double duty (produce scalar values *and* gatekeep
  report-row existence) it was never designed for, and its OCR-confidence-gated behaviour on hard
  PDFs (GAS) or its pdf_path-sync gap (GVR/MBB/D2D) blocks the manual PEK-trigger path even after
  it's fixed for the other 8/12.

---

## Root cause (one sentence)

**`bctcPdfPullJob`'s automatic 30-min pull cron has never invoked any of the pdf-extractor
endpoints that populate `bctc_table_rows`/`bctc_md_tables` (`/extract-tables`,
`/extract-md-tables`, `/extract-layout-first`, `/pek-extract`) — only the scalar-only legacy
`/extract` — so its own 0-row gate fires `enrich_failed` unconditionally on every newly-pulled
report; table-row population has only ever happened via a disconnected manual trigger
(`POST /api/trigger-pek-extract`) that nothing currently re-fires on a recurring basis, and the
last such manual sweep was 2026-07-08 12:35:10.**

---

## Recommended fix path

**Not a VPS restart. Not a code revert (there is nothing to revert — no regression exists in
`apps/pdf-extractor`).** Two complementary tracks:

1. **IMMEDIATE ops mitigation (zero new code, matches the parent row's "operational-first"
   instruction) — for the 8 cohort members with `pdf_path` already set** (ACB, BID, EIB, HCM,
   HSG, NKG, POW, SSI): call `POST /api/trigger-pek-extract {report_id}` for each, **outside VN
   market hours (02:00-08:59 UTC)** per the endpoint's own Layer-2 guard. This is the
   already-built, already-working path (confirmed pdf-extractor health above) — it should
   populate `bctc_table_rows`/`bctc_md_tables` directly.
   - For **GVR/MBB/D2D** (`pdf_path IS NULL` despite the file existing on disk): sync
     `financial_reports.pdf_path` first (existing `backfillBctcPdfPaths` usecase, or a direct
     `UPDATE` to the predictable `/app/data/pdfs/<TICKER>_2025_Q4.pdf` path), then trigger PEK.
   - For **GAS** (no `financial_reports` row at all): needs a shell row created first — either
     let `bctcReparseJob`'s stranded-PDF detection (`dataAuditJob` D-7c) pick it up naturally
     (09:30 GMT+7 daily; may still fail the same OCR-confidence gate on retry) or manually
     `INSERT` a minimal shell row (action_code/sort_key/pdf_path) so `/api/trigger-pek-extract`
     has something to look up — PEK extraction itself does not depend on the legacy scalar
     pipeline having succeeded.
2. **STRUCTURAL fix (new sprint task, NOT implemented in this spike — out of spike scope)**:
   wire automatic table-extraction triggering into `bctcPdfPullJob`'s pipeline (or a dedicated
   post-pull sweep) so newly-pulled reports get `/pek-extract` (or `/extract-md-tables`) fired
   automatically, decoupled from the *synchronous* 0-row gate (PEK/`extract-md-tables` are
   `202 Accepted` background tasks — the existing gate checks counts *immediately*, which will
   always read 0 even if wiring is added, unless the gate is changed to a deferred/next-cycle
   check). This also needs: `financial_reports.pdf_path` populated at PDF-save time (not
   deferred to the legacy scalar pipeline's success), and `financial_reports` shell-row creation
   decoupled from the legacy pipeline's OCR-confidence gate so a PEK-extractable PDF (like GAS's,
   likely) isn't blocked by an unrelated low-confidence scalar-text read.
   Recommend PO route this as a `cross-service` (spans `apps/mcp-server` scheduler +
   `apps/mcp-server` interface routes) FIX task — no `apps/pdf-extractor` code needs to change.

---

## Code references

- `apps/pdf-extractor/infrastructure/pek_engine_adapter.py:551-596` — `_cells_to_row_bands` /
  `_MISSING_CELL_SCORE_SENTINEL` (commit `fdb424178`) — confirmed dead-metadata, not the cause.
- `apps/pdf-extractor/interface/handlers.py:291-528` — all 5 extraction endpoints
  (`/health`, `/extract-tables`, `/extract-md-tables`, `/extract-layout-first`, `/pek-extract`,
  `/extract`) side by side — `/extract` (L479) is the only one the automatic pull cron calls.
- `apps/pdf-extractor/application/usecases.py:16-83` (`ExtractPDFUseCase`) +
  `apps/pdf-extractor/domain/services.py:19-81` (`_OCR_CONFIDENCE_THRESHOLD = 0.5` gate) — GAS's
  likely shell-row-creation blocker.
- `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts:210-246` (`triggerExtraction`
  production dep) + `:552-615` (0-row gate, fires unconditionally).
- `apps/mcp-server/src/scheduler/financial-reports/pushBctcExtraction.ts:1-30,135-250` — 3-tier
  scalar-only extraction, `runPipeline` gate at "text >= 100 chars".
- `apps/mcp-server/src/infrastructure/fetchers/pdfExtractorClient.ts:9,52-65` — confirms only
  `/extract` is wrapped on the TS side.
- `apps/mcp-server/src/interface/mcp/routes/bctcVpsIngestHandler.ts:187-275` —
  `POST /api/trigger-pek-extract`, the only production caller of `/pek-extract`, manual-only.
- `apps/mcp-server/src/application/usecases/bctcBatchTableBackfillJob.ts` — the only caller of
  `/extract-tables`, confirmed dead code (imported nowhere in `src`).
- `docs/architecture-briefs/2026-05-27-pek-render-seam.md` §"Trigger driver location" (Option
  T-A) — design intent for cron wiring that was never completed.
- `docs/architecture-briefs/2026-07-03-bctc-discover-pipeline-dead.md` §"Stage 4" — independent
  7-day-earlier confirmation of the identical 0-row signature, predating any 07-08/07-09 commit.
- Live probe artifacts (read-only, no writes): `docker exec vn-market-intelligence-mcp-mcp-server-1
  bun /tmp/probe2.js` (financial_reports/bctc_vps_queue rows for the full cohort);
  `docker logs vn-market-intelligence-mcp-{mcp-server,pdf-extractor}-1 --since 12h`.
