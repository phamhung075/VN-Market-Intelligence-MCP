# REQ_BCTC-AGENTIC-REFINE — Agent Refine Step Replaces the Geometry Middle

**Sprint:** BCTC-AGENTIC-REFINE | **Author:** ba | **Date:** 2026-05-30
**Source:** `docs/SPRINT_GOAL.md` § BCTC-AGENTIC-REFINE + `/Users/admin/.claude/plans/magical-cooking-cocoa.md`
**Status:** SPEC COMPLETE — NEXT: architect (AR-ARCH)

---

## Zone Split (CONFIRMED)

| Zone | Owner | Scope |
|---|---|---|
| `apps/pdf-extractor/` | dev-pdf-extractor | `page_rasterizer.py`; remove YOLO + bbox grouping + `bctc_page_grouper.py`; expose OCR text per-page to mcp-server |
| `apps/mcp-server/` | dev-mcp-server | 3 MCP tools + `bctc_refined_units` table + markdown→rows parser + `get_bctc_refined` + refine orchestration/cron + idempotency + claim/gate |
| `docs/agents/` | agent-father | `refine_bctc_md` agent `.md` (frontmatter on line 1; agent-md factory) |

No cross-zone import. The two services communicate only via the existing PULL-based HTTP `/api` contract. Architect must state the exact PDF delivery mechanism for `get_bctc_page_image` (pdf-extractor stores PNGs; mcp-server tool reads from the shared named volume path `data/bctc-page-images/{report_id}/page_{N}.png`).

---

## Requirements

### FR-1 — Page Rasterizer (DDD: infrastructure / pdf-extractor)
New file `apps/pdf-extractor/infrastructure/page_rasterizer.py` using pymupdf. Renders each PDF page as a PNG at a **configurable DPI** (env `BCTC_RASTER_DPI`, default 150; architect picks the minimum DPI the refine agent reads reliably). Stores output at `data/bctc-page-images/{report_id}/page_{N}.png` on the shared volume. Idempotent: re-running the same `(report_id, page_number)` overwrites the file. No network calls; all local.

AC-FR1-1: `BCTC_RASTER_DPI` env var controls DPI; default 150 if unset.
AC-FR1-2: Output path `data/bctc-page-images/{report_id}/page_{N}.png`; directory created automatically.
AC-FR1-3: Running rasterization twice on the same report produces identical files (no dupe pages).
AC-FR1-4: PDF-Extract-Kit subtree untouched (`git -C apps/pdf-extractor/PDF-Extract-Kit diff` = empty).

### FR-2 — OCR Text Source Interface (DDD: infrastructure / pdf-extractor)
The existing `pdf_extracted_text` table (in `market.db`, keyed by `filename + page_number`) is the numeric source of record. A new **swappable interface** `OcrTextSourcePort` (in `apps/pdf-extractor/domain/repositories.py`) abstracts: `get_page_text(filename: str, page_number: int) -> str`. Current implementation reads `pdf_extracted_text` via the existing DB path. The interface allows a later Mistral OCR swap with NO other code changes.

AC-FR2-1: Port defined; concrete `SqliteOcrTextSource` reads `pdf_extracted_text` by `(filename, page_number)`.
AC-FR2-2: `MistralOcrSource` stub exists (raises `NotImplementedError`) so the swap seam is visible and testable.
AC-FR2-3: Selection via env var `OCR_TEXT_BACKEND` (`sqlite` default, `mistral` for future swap); factory in `ocr_backends.py`.

### FR-3 — `get_bctc_page_text` MCP Tool (DDD: interface / mcp-server)
New MCP tool in `apps/mcp-server/src/interface/mcp/tools/financial-reports/`. Returns the OCR text for one page of a given report.

Input: `{ report_id: string, page_number: number }`
Output: `{ text: string, source: "sqlite_ocr" | "mistral_ocr" }` or `{ error: string }`.

AC-FR3-1: Resolves `report_id` → `filename` via `financial_reports` table (existing join).
AC-FR3-2: Reads from `pdf_extracted_text` via `(filename, page_number)`.
AC-FR3-3: Returns `{ error }` (never throws) when no text found.
AC-FR3-4: Registered in `tools/registry.ts` with one import + one array entry (no `server.ts` change).

### FR-4 — `get_bctc_page_image` MCP Tool (DDD: interface / mcp-server)
New MCP tool. Returns one or more page PNGs (base64-encoded) for the given report and page list. Multi-page = the split-table window for continuation detection.

Input: `{ report_id: string, pages: number[] }` (max 3 pages per call — architect sets hard cap).
Output: `{ images: Array<{ page: number, base64_png: string }> }` or `{ error: string }`.

AC-FR4-1: Reads PNGs from `data/bctc-page-images/{report_id}/page_{N}.png` on the shared volume.
AC-FR4-2: If a page PNG is missing → triggers on-demand rasterization for that page (calls pdf-extractor `/api/rasterize`; architect decides the endpoint contract).
AC-FR4-3: Pages array capped at `BCTC_IMAGE_PAGE_CAP` env var (default 3). Over-limit = `{ error }`.
AC-FR4-4: Registered in `tools/registry.ts` (same pattern as FR-3).

### FR-5 — Selective Image Loading (NFR: Token Budget Control)
The refine agent MUST load page images selectively, not for every page. A **page classification** step determines whether a page needs an image in addition to OCR text.

Rule (measurable, not best-effort):
- **Image required** when OCR text for the page contains table-structural tokens: `|` characters, sequences of digits separated by whitespace, or Vietnamese column-header keywords (`Mã số`, `Thuyết minh`, `Số cuối`, `Số đầu`, `chỉ tiêu`) — OR when the page is in a **continuation window** (page N where page N-1 was image-loaded and produced a multi-column table markdown).
- **Text-only** otherwise (prose pages, cover pages, notes with no table structure).

This rule is implemented as `classify_page_for_image_load(ocr_text: str, prev_page_was_image: bool) -> bool` in the orchestrator and is unit-testable.

AC-FR5-1: `classify_page_for_image_load` returns `True` for a page with `|` or digit-sequence patterns.
AC-FR5-2: Returns `True` for continuation window (prev page was image-loaded and had table tokens).
AC-FR5-3: Returns `False` for a page whose OCR text is pure prose (no table structural tokens).
AC-FR5-4: The refine agent only calls `get_bctc_page_image` when classification returns `True`.
AC-FR5-5: DoD includes measured image-load ratio on FPT (46pp) + ACB (33pp): reported as `images_loaded / total_pages`, target < 60% (architect confirms against real page composition).

### FR-6 — Refine Model Tier (NFR: Token Budget Control)
The `refine_bctc_md` agent runs on **Haiku or Sonnet** (NOT Opus). Opus is explicitly forbidden for this task.

AC-FR6-1: Agent `.md` frontmatter specifies `model: claude-haiku-3-5` or `claude-sonnet-4-5` (architect picks based on accuracy/cost trade-off on the FPT bake-off).
AC-FR6-2: DoD includes measured token consumption for FPT (46pp) + ACB (33pp) bake-off sessions, reported as total input/output tokens per report. Cost estimate in USD at Haiku/Sonnet public pricing included in QA gate output.

### FR-7 — Prompt Caching (NFR: Token Budget Control)
The refine agent's system prompt (instructions + refine contract) is sent once per report session and marked for caching. Per-page calls reuse the cached prefix.

AC-FR7-1: System prompt block uses the prompt caching mechanism supported by the chosen model tier.
AC-FR7-2: Cache hit rate reported per-session in the QA bake-off (input tokens saved vs first-page cost).

### FR-8 — Configurable Image DPI (NFR: Token Budget Control)
See FR-1 `BCTC_RASTER_DPI`. The architect must verify the minimum DPI at which the refine agent reliably reads Vietnamese table text in the bake-off. The DPI default must be the MINIMUM confirmed reliable value, not the highest.

AC-FR8-1: Bake-off at DPI 100, 120, 150 on FPT; lowest passing DPI becomes the default.
AC-FR8-2: If DPI 100 produces unreadable table cells (agent flags more than 10% of cells as low-confidence), increment to next level.

### FR-9 — `bctc_refined_units` Table (DDD: infrastructure / mcp-server)
New table in `market.db` (defined in `schema-financial-reports.ts`):

```sql
CREATE TABLE IF NOT EXISTS bctc_refined_units (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id        TEXT NOT NULL,
  unit_id          TEXT NOT NULL,
  page_numbers_json TEXT NOT NULL,        -- JSON array e.g. [22,23]
  markdown         TEXT NOT NULL,
  row_count        INTEGER NOT NULL DEFAULT 0,
  confidence       REAL NOT NULL DEFAULT 0.0,
  flags            TEXT,                  -- JSON array of flag strings
  refined_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(report_id, unit_id)
);
CREATE INDEX IF NOT EXISTS idx_bru_report ON bctc_refined_units(report_id);
```

Write path: DELETE-then-INSERT in a single transaction (idempotent; same pattern as `pushBctcLayoutHandler.ts:150`). `bun:sqlite` `new Database(path)` ONLY — no better-sqlite3, no `{create:false}`.

AC-FR9-1: Schema defined with `UNIQUE(report_id, unit_id)`.
AC-FR9-2: DELETE-then-INSERT transactional (verified by test that a second write does NOT produce duplicates).
AC-FR9-3: Persistence verified by DIRECT in-container `market.db` read (`bun:sqlite` query COUNT), NOT the push echo.

### FR-10 — Markdown → `bctc_table_rows` Parser (DDD: application / mcp-server)
**DETERMINISTIC. This is the new single point of correctness for the expert analyst passes.** Parses the refined markdown from `bctc_refined_units` into `bctc_table_rows` rows. Called after every refine write.

Parser contract:
- Input: one `bctc_refined_units.markdown` string (may span multiple pages).
- Output: `Array<BctcTableRow>` (matches existing `bctc_table_rows` schema: `report_id`, `statement_section`, `row_label`, `code`, `value_current`, `value_previous`, `unit`, `row_order`, `page_number`, `source_confidence`).
- Deterministic: same input → same output, always. No random/heuristic logic.
- Vietnamese label normalization is stateless (lookup table, no ML).
- Trust flags from the refine contract (`[ĐỘ TIN CẬY THẤP — ...]`, `[độ tin cậy thấp]`) parsed into `source_confidence < 0.5` and `flags` column.

AC-FR10-1: Given a synthetic markdown table (5 rows), parser returns exactly 5 `BctcTableRow` objects with correct `row_label`, `value_current`, `value_previous`.
AC-FR10-2: Vietnamese red trust flag `[ĐỘ TIN CẬY THẤP — ...]` → `source_confidence = 0.2`, flag recorded.
AC-FR10-3: Vietnamese yellow trust flag `[độ tin cậy thấp]` → `source_confidence = 0.4`, flag recorded.
AC-FR10-4: **DV test** — inject a deliberately malformed markdown (missing columns) → parser returns error/empty, DOES NOT insert partial rows silently. Test must fail RED before fix, GREEN after.
AC-FR10-5: `get_bctc_full(FPT)` returns figures sourced from the parser output (not from the old geometry path). Verified by QA on live DB.
AC-FR10-6: All 6 expert passes run unchanged after parser migration (bctc-analyst produces a report on FPT).

### FR-11 — `get_bctc_refined` MCP Tool (DDD: interface / mcp-server)
New MCP tool exposing refined markdown for the narrative passes (footnote/segment).

Input: `{ report_id: string }`
Output: `{ units: Array<{ unit_id: string, page_numbers: number[], markdown: string, flags: string[] }> }` or `{ error: string }`.

AC-FR11-1: Reads from `bctc_refined_units` for the given `report_id`.
AC-FR11-2: Returns `{ error }` when no refined units exist.
AC-FR11-3: Registered in `tools/registry.ts`.

### FR-12 — Refine Orchestration + Cron (DDD: application / mcp-server)
Cron-driven orchestrator. OFF-HOSE: no extraction 02:00–08:59 UTC Mon–Fri.

State machine:
1. Pick report WHERE `text_status = 'COMPLETE' AND refine_status = 'PENDING'`.
2. `task_claim` (kind: `sprint-task`, `owner_agent: refine-orchestrator`, `ttl_seconds: 3600`).
3. Readiness gate: if OCR `text_status` is `IN_PROGRESS` or `PARTIAL` → SKIP, do not mark FAILED.
4. Page-window hint: run `classify_page_for_image_load` per page → build image-load list.
5. Spawn `refine_bctc_md` agent with tool access.
6. Receive refined units → balance catch-net (assets = liab + equity; FORBIDDEN as sole gate).
7. Store to `bctc_refined_units` (DELETE-then-INSERT).
8. Call markdown→rows parser → write to `bctc_table_rows`.
9. Set `refine_status = 'DONE'`.
10. `task_release`.

On-demand path: same pipeline, triggered by `POST /api/refine-bctc/{report_id}`.

AC-FR12-1: Readiness gate: refine triggered on a report with `text_status = IN_PROGRESS` → SKIPS, does not write garbage.
AC-FR12-2: Idempotency: run same report ≥3× → `bctc_refined_units` row count STABLE. Verified via DIRECT in-container `market.db` COUNT (`bun:sqlite`).
AC-FR12-3: `refine_status` field added to `financial_reports` table via migration (idempotent `ALTER TABLE IF NOT EXISTS`); values: `PENDING` (default) | `IN_PROGRESS` | `DONE` | `FAILED`.
AC-FR12-4: OFF-HOSE guard: cron runs outside 02:00–08:59 UTC Mon–Fri.
AC-FR12-5: `task_claim` used; if claim fails (already held) → log skip, do not error.

### FR-13 — Refine Contract Enforcement (DDD: domain / mcp-server + agent)
Hard contract encoded in the refine agent prompt AND verified by the orchestrator:

- **Numbers ← OCR text** (numbers from `get_bctc_page_text`; never inferred from the image alone).
- **Structure / boundaries / labels ← image** (table columns, row spans, page breaks read from `get_bctc_page_image`).
- **Text ≠ image on a number → FLAG, NEVER GUESS.**
  - Red flag: `[ĐỘ TIN CẬY THẤP — {reason}]` (high discrepancy, agent unsure which is correct).
  - Yellow flag: `[độ tin cậy thấp]` (minor discrepancy, agent chose the text value).
  - Agent MUST NOT silently pick one value without flagging.
- **Balance check (assets = liab + equity) is a CATCH-NET**, not the gate. A passing balance check does NOT clear a flagged number.

AC-FR13-1: Agent `.md` encodes the three-tier contract (numbers←text / structure←image / disagree→flag) in its system prompt.
AC-FR13-2: Orchestrator verifies refined markdown contains no unflagged numeric discrepancy between OCR text and image for the cells it can cross-check (via `get_bctc_page_text` re-read after refine).
AC-FR13-3: Balance catch-net runs AFTER trust-flag parsing, not before.
AC-FR13-4: Balance badge is recorded in `bctc_refined_units.flags` but does NOT override trust flags.

### FR-14 — Replace-Outright (DDD: infrastructure / pdf-extractor)
The following MUST be removed from the live code path:

- `apps/pdf-extractor/infrastructure/bctc_page_grouper.py` — 5-state machine, `_is_continuous`, `_is_title_band`.
- DocLayout-YOLO page-type classification + bbox grouping in `apps/pdf-extractor/infrastructure/pek_engine_adapter.py` (`_run_extraction`).
- Geometry table-stitching in `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py`.
- The 42-test boundary machine from BCTC-TABLE-BOUNDARY sprint (now orphaned).

A slimmed **page-window hint** (stateless per-page text classifier, not a 5-state machine) MAY survive if the architect determines it is useful for the image-load classification step. Architect decides.

AC-FR14-1: `bctc_page_grouper.py` removed from import chain (grep proof: no import of `bctc_page_grouper` in live code path).
AC-FR14-2: YOLO bbox grouping removed from `pek_engine_adapter.py._run_extraction`.
AC-FR14-3: PDF-Extract-Kit subtree PRISTINE (`git -C apps/pdf-extractor/PDF-Extract-Kit diff` empty).
AC-FR14-4: `text_table_extractor.py` 0-byte-diff (structured path untouched).

### FR-15 — Bake-Off DoD (FPT 46pp + ACB 33pp)
Mandatory: QA runs the full pipeline on FPT Q4 2024 and ACB Q4 2024 and reports:

1. Token consumption: total input tokens, total output tokens, estimated USD cost at Haiku/Sonnet pricing.
2. Image load ratio: `images_loaded / total_pages` per report.
3. Continuation correctness: FPT span [22,23] → ONE unit with `page_numbers_json=[22,23]`.
4. Numeric agreement: zero silent discrepancies (all disagreements flagged per FR-13).
5. Balance catch-net: balance check result per statement section.
6. Table boundary correctness: no prose swallowed into table units; no over-merge.

AC-FR15-1: Token-per-report number produced by QA on both FPT and ACB.
AC-FR15-2: All 7 DoD items from `docs/SPRINT_GOAL.md` § BCTC-AGENTIC-REFINE verified.

---

## Non-Functional Requirements

| ID | Requirement | DDD Layer |
|---|---|---|
| NFR-1 | main branch only; `git add <file>` per file, NEVER `-A` | — |
| NFR-2 | REBUILD both containers after code change (`docker compose build --no-cache <svc> && up -d --no-deps --force-recreate`) | infra |
| NFR-3 | In-container DB verify = `bun:sqlite` `new Database(path)` ONLY (no better-sqlite3, no `{create:false}`) | infra |
| NFR-4 | PDF-Extract-Kit subtree PRISTINE at all times | infra |
| NFR-5 | Idempotency proven ≥3× on FPT (FPT-42-dupes guard) | application |
| NFR-6 | OFF-HOSE: no cron extraction 02:00–08:59 UTC Mon–Fri | application |
| NFR-7 | Anti-false-green: balance badge FORBIDDEN as sole gate; DV tests on parser + store | domain |
| NFR-8 | Persistence verified by DIRECT in-container `market.db` read, NOT push echo | infra |
| NFR-9 | Refine model = Haiku or Sonnet (NOT Opus) | interface |
| NFR-10 | Prompt caching for system prompt across pages within a report session | interface |

---

## Edge Cases

- **Missing OCR text for a page:** `pdf_extracted_text` has no row for `(filename, page_number)` → FR-2 returns empty string; orchestrator logs warning; that page is image-only and MUST be flagged as low-confidence by the agent.
- **Continuation window split across files:** two pages from `page_numbers_json=[22,23]` — both must be retrieved together via `get_bctc_page_image(pages=[22,23])`. Double-emit on page 23 is the FPT-42-dupes failure mode; idempotency guard prevents it.
- **OCR text vs image number disagreement on EVERY cell of a page:** if the entire page is a discrepancy (possible if Tesseract produced garbage), the agent flags the whole page `[ĐỘ TIN CẬY THẤP — OCR confidence low page-wide]`. The orchestrator sets `confidence = 0.1` for that unit and marks `refine_status = PARTIAL`.
- **Readiness gate race:** two cron ticks fire within the same second; `task_claim` serializes — second tick sees `IN_PROGRESS` and skips.
- **Balance check fails on a correctly refined page:** catch-net flag recorded in `flags`, NOT used to reject the unit. Expert analyst sees the flag and can reason about it.
- **Vietnamese number formatting:** VND amounts use `.` as thousands separator (e.g. `1.234.567`). Parser must handle this before numeric comparison; `parseFloat("1.234.567".replace(/\./g, ""))` pattern.
- **Low-confidence unit from FR-10 AC-FR10-4:** parser returns empty → orchestrator DOES NOT write empty `bctc_table_rows`; marks unit `row_count = 0`, `confidence = 0.0`, `flags = ["parser_error"]`.

---

## Blockers

None. All decisions are locked by the user (PO plan `magical-cooking-cocoa.md`) or carry-forward from prior sprints.

Architect deferred decisions (NOT blockers — architect resolves in the brief):
- D1: Minimum DPI for reliable agent vision (FR-8) — bake-off decides; architect picks initial value.
- D2: Haiku vs Sonnet for refine agent (FR-6) — architect picks based on expected token cost and Vietnamese BCTC accuracy.
- D3: Hard page cap for `get_bctc_page_image` (FR-4 AC-FR4-3) — architect sets based on context window.
- D4: Page-window hint survival decision (FR-14) — architect decides if slimmed hint is needed or classify_page_for_image_load suffices.
- D5: `POST /api/rasterize` endpoint contract for on-demand rasterization (FR-4 AC-FR4-2) — architect specifies.

---

## DDD Layer Summary

| Component | Layer |
|---|---|
| `OcrTextSourcePort` | domain (pdf-extractor) |
| `page_rasterizer.py` | infrastructure (pdf-extractor) |
| `classify_page_for_image_load` | application (mcp-server orchestration) |
| Refine orchestration job | application (mcp-server) |
| Markdown→rows parser | application (mcp-server) |
| `bctc_refined_units` table DDL | infrastructure (mcp-server) |
| `get_bctc_page_text`, `get_bctc_page_image`, `get_bctc_refined` MCP tools | interface (mcp-server) |
| `refine_bctc_md` agent `.md` | interface (agent-father domain) |
| Refine contract enforcement | domain (mcp-server + agent) |

---

## Task Mapping (PO-seeded AR-* tasks)

| Task | Owner | Spec section |
|---|---|---|
| AR-BA | ba | This document |
| AR-ARCH | architect | All sections — tight spec on FR-10 (deterministic parser) + token-budget FRs 5/6/7/8 |
| AR-PM | pm | Atomic handoffs per zone from this spec |
| AR-PDF | dev-pdf-extractor | FR-1, FR-2, FR-14 |
| AR-MCP | dev-mcp-server | FR-3, FR-4, FR-5, FR-9, FR-10, FR-11, FR-12, FR-13 |
| AR-AGENT | agent-father | FR-6, FR-7, FR-13 (agent prompt), FR-15 (bake-off subject) |
| AR-QA | qa | FR-15, AC-FR10-4 (DV), AC-FR9-3 (idempotency), AC-FR12-1 (readiness gate), AC-FR10-6 (expert flow) |
| AR-OPS | ops | NFR-2 (REBUILD both containers) |
| AR-EXIT | po | Independent live re-verify (all 7 DoD from SPRINT_GOAL.md) |
