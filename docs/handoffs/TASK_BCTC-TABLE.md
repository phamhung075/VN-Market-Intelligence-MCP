# TASK BCTC-TABLE — Correct Result-Table Extraction for BCTC Analysis

**Sprint:** BCTC-TABLE · **Opened:** 2026-05-24T21:24Z by PO · **Goal:** `docs/SPRINT_GOAL.md` (Sprint BCTC-TABLE)
**Research SSOT (DONE — no new research):** `docs/architecture-briefs/2026-05-24-bctc-table-extraction-research.md`
**User mandate (`/goal`):** *"bctc can extract correct result table for analyze."*

> This is the per-task handoff. PO authored the sprint shape, decisions, DoD, and per-task intent below. **Architect (BT-2) appends the integration blueprint + finalized per-task ACs** after the Phase-0 pick. dev/qa/ops append their records under their task headings.

---

## Binding constraints (Day-0, every agent)

- **PRIVACY (non-negotiable):** NO task sends a financial PDF or rendered page-image to a third-party API. External-API VLM cross-check is DEFERRED + opt-in (Open Q1). Phase-0 + the self-hosted track = ZERO external data flow. A task proposing an off-infra send is rejected back to PO.
- **Security Clause (carried from pilot charter):** OCR/model calls + PDF I/O are impure → infrastructure adapters. `domain/primitives/*` stay PURE — import-linter fence: primitives must NOT import `infrastructure`. `sandbox/runner.py` holds ZERO credentials. Model/API keys (if any) live only in the adapter runtime env.
- **Freeze coordination:** 1954c BCTC write-chain consolidation has LANDED (`372fbc91`, service = sole extraction owner). Build ON TOP of it. BT-2 confirms no collision with frozen write paths before BT-3 touches shared code.
- **Git (every agent):** explicit-file staging (`git add <path>`, never `-A`/`.`); no `--force`/`--no-verify`; NO `git push` (user owns); all on `main` (NO branches); `git show --stat HEAD` shows zero foreign files (heavy fleet commit-race). Never ask the user to run/deploy — spawn ops/dev.
- **Mac is dev/eval only (D6):** Phase-0 spike runs on the Intel Mac (CPU). Production model runs on the main server. No heavy model in production on the Mac.
- **Pilot frozen:** `pilot-status-pdf-extractor.json` NOT edited; sandbox dashboard surface + 3 trust panels UNTOUCHED. This is a post-pilot correctness build behind the closed pilot.

---

## BT-1 — Vietnamese number-format fix (parse-half) · dev-pdf-extractor · CRITICAL · READY

**Why first:** the literal cause of the decimal-shift bug. Independent of the table-model work, needs no model, ships immediate correctness. Dispatch in parallel with BT-0.

**Build (three pure primitives, zero infra import):**
1. `vn_number_normalize(str) -> str` — if a token matches `\d{1,3}(\.\d{3})+(,\d+)?` treat `.`=thousands, `,`=decimal → strip `.`, swap `,`→`.` before it reaches `float()`. Deterministic on a raw token; returns a clean numeric string. (Called from the adapter; feeds clean input to the existing pure `decimal_normalizer` — do NOT make `decimal_normalizer` locale-aware, D4.)
2. `reconcile_figures(a, b, tol) -> "agree" | "shift" | "low"` — generalizes `isDecimalShiftAnomaly` from `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts`. `ratio = max(|a|,|b|) / max(min(|a|,|b|), eps)`; `ratio ≤ tol` → "agree"; `ratio > 10×` → "shift"; else "low".
3. `select_period_column(cells, hint) -> column-index/value` — pick the consolidated-current-quarter column from a row of cells (replaces "first numeric token in next 5 lines" once BT-3 supplies real cells; pure + table-shape-agnostic).

**ACs (PO baseline — architect may extend):**
- AC1 — VNM (`net_profit`): raw OCR token that currently parses to `0.000051` now normalizes to the correct billion-VND figure OR `reconcile_figures` returns `"shift"` against the API-bridge value. Unit test, red→green.
- AC2 — DHG (`rev`): same, the `0.000009` case flips red→green or is caught as `"shift"`.
- AC3 — `vn_number_normalize` unit-tested on: `"1.234.567,89"`→`"1234567.89"`, `"51.000"`→`"51000"`, `"0,5"`→`"0.5"`, plain `"51000"` passthrough, `"1,234.5"` (already-clean en-US, must not double-mangle — architect rules the disambiguation).
- AC4 — all three primitives PURE (import-linter fence: zero `infrastructure` import); `sandbox/runner.py` exit-0; existing scenarios stay green.

---

## BT-0 — Phase-0 SPIKE: self-hosted extractor evaluation · dev-pdf-extractor · HIGH · READY (dispatch FIRST)

**This is the image-vs-text comparison the user asked for, measured objectively.** Timebox: 1 sprint.

**Build:**
1. Eval harness (eval tooling under `apps/pdf-extractor/`, NOT in the pure-primitive sandbox — it does I/O). Per doc: run each candidate → emit predicted table (HTML/JSON) + extracted figures → compute TEDS-Content + GriTS + cell-F1 vs gold table + figure-accuracy vs gold figures → write a CSV/HTML scoreboard (option × metric).
2. 14-doc gold-set JSON (`gold/<TICKER>_<YEAR>_Q<N>.json`): income-statement + balance-sheet result rows, **tagging which column = consolidated current-quarter**, in billion VND, VN-format normalized, with source page number. VNM (`net_profit`) + DHG (`rev`) MUST be regression anchors (red→green).
3. Run **SELF-HOSTED candidates ONLY** on the 14-doc set, CPU, Intel Mac: PP-StructureV3 + PaddleOCR-VL-0.9B + 1 backup (Surya/Marker OR Microsoft TATR). **NO external-API VLM in this spike** (privacy guardrail; the brief's API-VLM upper-bound anchor is DEFERRED to the opt-in follow-on).

**Deliverable:** scoreboard CSV/HTML committed under `apps/pdf-extractor/` eval tooling → PO reads it at BT-0-PICK.

**Gold-set sources on disk (do NOT fetch new):** `data/pdfs-local/` (VCB, FPT, HPG, DHG, DIG, BSR, DGC, SHB, VEA, VNM) + `data/pdfs/` (VNM, VEA). PDFs + OCR text already exist (`pdf_extracted_text` table; viewer `/api/bctc-inspect`).

---

## BT-0 — Phase-0 SPIKE · dev-pdf-extractor · DONE (2026-05-25, `f6dd2e83` + eval results on disk)

Eval results committed under `apps/pdf-extractor/spike/eval/results/`. TEXT path (Tesseract vie+eng) cleared the ±0.5% bar at ~4s/page CPU; PP-StructureV3 IMAGE path scored 0/6 on its one VNM run at 45s/page and was skipped on the figures path. Full FPT balance sheet (p4-7) stitched, accounting identity balances to the dong. Do NOT re-run.

## BT-0-PICK — PO records production pick · po · GATE · DONE (2026-05-25T17:17Z)

**PICK = TEXT path (Tesseract vie+eng + BT-1 primitives).** PP-StructureV3 IMAGE = DEFERRED optional cross-check only (revisit ONLY for sub-bar p5/p7 rows + low cell-F1; self-hosted, never external-API). Decision note: `docs/po-decisions/2026-05-25-bctc-table-bt0-pick-text-path.md`. Pass-bar ≥95% within ±0.5% MET on FPT reference (page-level 100% on 3/4 sections, sentinels 6/6, balance True). BT-6 QA must re-run across the wider gold-set, not just FPT.

**Open-Q resolutions (PO defaults):** Q1 self-hosted ONLY; Q2 GPU not required (TEXT is CPU-feasible at 4s/page — ops confirms CPU sizing at BT-4); Q3 ≥95% within ±0.5% adopted + met.

---

## BT-2 — Architect integration blueprint (DESIGN ONLY) · architect · HIGH · READY (← BT-0-PICK DONE)

**Frame the design to close the user's exact complaint:** at `localhost:3000/api/bctc-inspect` the viewer right-pane only ever shows OCR `text` (from `pdf_extracted_text`) + 4 summary figures (from `financial_reports`). There is **NO structured code→value table storage anywhere in production**, so the inspector physically cannot render a detected table. The design must close the produce → store → render gap end-to-end:

1. **PRODUCE** (dev-pdf-extractor zone) — the TEXT-path extractor (Tesseract vie+eng + BT-1 primitives) must emit a structured code→value table (rows like 100/110/270…, both period columns, billion-VND normalized, with the consolidated-current-quarter column tagged via `select_period_column`) during `process_report()`, plus a balance-check result (Total Assets == Liabilities + Equity).
2. **STORE** (dev-pdf-extractor zone) — define a NEW schema for structured table rows, persisted per doc+page (e.g. a `bctc_table_rows` table: doc id, page, code, label, period-label, value, plus a per-doc balance-check pass/fail + balance delta). This is the missing storage; without it the inspector has nothing to read.
3. **RENDER** (dev-mcp-server zone — SI-2 boundary) — `bctcInspectHandler.ts` + the `/api/bctc-inspect` viewer read the new schema and render the structured table NEXT TO the existing OCR text, plus a **balance-check PASS/FAIL badge**. Define the read contract (DB columns → JSON shape → render) so dev-mcp-server can build the inspector side without guessing.

Append the blueprint + finalized per-task ACs (BT-3/4/5/6) here. Also cover:
- Adapter boundary: text-table assembler + `PdfPageRenderer` (PyMuPDF/pdf2image → PNG, only if the DEFERRED image cross-check is ever activated) as `infrastructure/` adapters. The figures path needs no model/render — Tesseract text + primitives only.
- `ExtractTablesUseCase` (application, DI) orchestration; how `select_period_column` consumes real cells; how the stitched multi-page table (p4-7 pattern) assembles into stored rows.
- **Schema migration plan:** the new `bctc_table_rows` schema + migration; how it coexists with the 1954c-consolidated `financial_reports` write path (additive, not a rewrite).
- Main-server hosting: TEXT path is CPU-feasible at 4s/page (no GPU needed — Open Q2 resolved for the figures path); confirm CPU sizing with ops at BT-4; Docker placement; existing `PdfplumberExtractionEngine` kept as native-PDF fast path. Production extractor runs on the MAIN SERVER, NOT the Mac (Mac is eval-only, kernel-panics under load — D6).
- Cross-check gate wiring: `reconcile_figures` → app-layer route → block insert + WORK alert + surface in `/api/bctc-inspect`; image-track cross-check (if ever activated) = self-hosted VLM only, DEFERRED.
- **Confirm no collision with 1954c frozen write paths** (`372fbc91` and the 1954c task-2..6 series) before BT-3 touches shared code. The new table-rows store is ADDITIVE on top of the consolidated path.
- **Re-extraction plan:** the 14 already-stored docs hold OLD-parser figures (pre-BT-1). They must be re-extracted ONCE after integration lands (not twice — sequence the backfill so it runs after BT-3+BT-5, before BT-6 QA). Architect specifies the one-shot backfill trigger.
- Security Clause: sandbox zero creds, import-linter fence (`domain.primitives` must not import `infrastructure`).

---

## BT-3 — Integrate extractor: produce + store structured table · dev-pdf-extractor · HIGH · BLOCKED (← BT-2, BT-1)
TEXT-path extractor emits the structured code→value table + balance check during `process_report()`; persists rows to the NEW `bctc_table_rows` schema per doc+page. Zero creds in sandbox; import-linter fence intact.

## BT-3i — Inspector schema read + table render · dev-mcp-server · HIGH · BLOCKED (← BT-2, BT-3)
SI-2 boundary: `bctcInspectHandler.ts` + `/api/bctc-inspect` viewer read the new schema and render the structured table next to OCR text + balance-check PASS/FAIL badge. **This is the surface that closes the user's exact complaint.** Routed to dev-mcp-server (bctc-inspect viewer = SI-2 boundary, NOT dev-pdf-extractor).

## BT-4 — Deploy extractor to main server · ops + dev-mainserver-crawls · HIGH · BLOCKED (← BT-2)
Host the TEXT-path extractor on the MAIN SERVER (CPU-feasible at 4s/page, no GPU needed — Open Q2 resolved for figures path). NO heavy model on the Mac in prod (D6, kernel-panic risk).

## BT-4b — One-shot re-extraction of stranded docs · dev-pdf-extractor + ops · MEDIUM · BLOCKED (← BT-3, BT-3i, BT-5)
The 14 already-stored docs hold OLD-parser figures (pre-BT-1). Re-extract ONCE after produce/store/render + cross-check land, BEFORE BT-6 QA (not twice). Architect specifies the trigger at BT-2.

## BT-5 — Cross-check confidence gate (self-hosted) · dev-pdf-extractor · MEDIUM · BLOCKED (← BT-3, BT-4)
Wire `reconcile_figures` into the app layer: >10× divergence → block insert + WORK alert; surface in `/api/bctc-inspect`. Image-track cross-check = SELF-HOSTED VLM only, DEFERRED. NO external API.

## BT-6 — QA regression gate · qa · HIGH · BLOCKED (← BT-4b, BT-5)
Re-run BT-0 harness across the WIDER 14-doc gold-set (not just FPT): figure-accuracy meets ≥95%±0.5% bar; VNM/DHG green; structured rows stored + rendered in inspector with balance badge; cross-check fires on >10×; sandbox exit-0 + zero creds; import-linter fence intact; pilot-status diff empty; zero off-infra data send. Also closes QA-on-BT1 (still pending). Emit `qa-bctc-table-<UTC>.json`.

## BT-EXIT — PO sign-off · po · CRITICAL · BLOCKED (← BT-6)
Sign off vs DoD on REAL gold-set + verify the live `/api/bctc-inspect` viewer now shows a detected table + balance badge (the user's complaint, closed). Privacy audit. Main terminal commits in-tree work.

ACs for BT-3..BT-EXIT finalized by architect at BT-2. High-level intent in `docs/TASKS.md` § Sprint BCTC-TABLE and `docs/SPRINT_GOAL.md` § Binding DoD.

---

## [Architect] BT-2 — Integration Blueprint

**Authored:** 2026-05-25 | **Zones:** `apps/pdf-extractor/` (produce+store) + `apps/mcp-server/` (render)
**BUILD-STANDARD:** lean (both zones exist; this is a new feature inside closed pilots)

---

### Brownfield Findings

**Zone 1: apps/pdf-extractor/**

Verified paths:
- `domain/modules/financial_reports/module.py` — `FinancialReportsModule.process_report()` is the module-tier pipeline entry point. Currently returns 14 keys; BT-3 adds a new return key `structured_table_rows` (list of row dicts) + `balance_check` (dict). No existing return keys removed.
- `domain/modules/financial_reports/ports.py` — 9 Protocol ports defined; BT-3 adds a 10th port `TableAssemblerPort` (see §Extraction Wiring below).
- `application/usecases.py` — `ExtractPDFUseCase` is the sole application orchestrator; it does NOT call `FinancialReportsModule.process_report()`. The module is called from the composition root (main.py) or directly from tests/sandbox. BT-3 introduces a NEW application use case `ExtractTablesUseCase` that owns the table-extraction + store write path.
- `infrastructure/inspection_store.py` — DEPRECATED (reads `pdf_extractor.db pdf_documents` junk table). Real viewer is in mcp-server. BT-3 adds a SEPARATE new adapter `infrastructure/table_store.py`.
- `infrastructure/extraction_engine.py` — `PdfplumberExtractionEngine` is the native-PDF fast path (pdfplumber). It is kept unchanged. The TEXT-path table extractor (Tesseract+BT-1 primitives) lives in a NEW adapter `infrastructure/text_table_extractor.py`.
- `main.py` — composition root. BT-3 wires the new use case and adapter here.
- `sandbox/runner.py` + `dashboard/` — FROZEN. Not touched.
- `domain/primitives/select_period_column/primitive.py` — has a `# TODO` marker for BT-3 model-dependent semantic override. BT-3 fills this with real cells from the table extractor.

**Confirmed no collision with 1954c frozen write paths (`372fbc91`):**
- 1954c consolidated `pdf.ts` / `bctcPdfPullJob.ts` / `pushBctcExtraction.ts` / `bctcReparseJob.ts` → all route via `pdfExtractorClient.ts` POST to pdf-extractor port 5001 endpoint `POST /extract`. That endpoint calls `ExtractPDFUseCase`, not the new `ExtractTablesUseCase`. The new table-rows store is ADDITIVE and written by a separate trigger. Zero collision.

**Zone 2: apps/mcp-server/**

Verified paths:
- `src/interface/mcp/routes/bctcInspectHandler.ts` — SI-2 boundary. Existing routes: `GET /api/bctc-inspect/docs`, `/pdf/{doc_id}`, `/ocr/{doc_id}`, and HTML page. BT-3i ADDS `GET /api/bctc-inspect/table/{doc_id}` (new route, registered in server.ts at the same block as the existing 4 routes). No existing handler signatures modified.
- `src/interface/bctc-inspector.html` — right pane currently has `.figures-section` (4 scalar figures + anomaly badge) + `#ocr-text-content`. BT-3i adds a new `#table-section` div between these two. The figures-section and OCR-text divs are unchanged.
- `src/infrastructure/db/schema-financial-reports.ts` — `initFinancialReportsTables()` is the migration entry point. BT-3 adds `bctc_table_rows` DDL + a migration guard (ALTER TABLE pattern already used 8 times in this file). The function is called from `schema.ts` which is called from `initDatabase()` at startup — the new table auto-creates.
- `src/interface/mcp/server.ts` — route dispatch block at lines 341-362. BT-3i adds one new `if` block here.
- `src/application/usecases/backfillBctcPdfPaths.ts` — exists, wired at startup. The BT-4b backfill is a SEPARATE one-shot script, not wired here.

**Import-linter fence status (verified INTACT):**
- Fence-A: `domain/primitives` must not import `infrastructure/application/interface`. The new `TableAssemblerPort` in `domain/modules/financial_reports/ports.py` is a Protocol — zero infra import. SAFE.
- Fence-B: `domain/modules` must not import `infrastructure/interface`. The new port definition satisfies this. The concrete `TextTableExtractor` adapter lives in `infrastructure/` only. SAFE.

---

### 1. Structured-Table Schema — `bctc_table_rows`

**Storage decision: `market.db` (mcp-server owns it) via migration in `schema-financial-reports.ts`.**

Rationale: mcp-server is the sole WRITE owner of `market.db` (architecture invariant, `docs/ARCHITECTURE.md` §Database isolation). The pdf-extractor service writes to `market.db` only via HTTP POST to mcp-server endpoints (1954c pattern). The new `bctc_table_rows` store follows the same contract: pdf-extractor extracts the rows, then POSTs them to mcp-server via a new `POST /api/push-bctc-table` endpoint. mcp-server writes to `market.db`. The pdf-extractor never opens `market.db` directly.

**DDL (added to `schema-financial-reports.ts` inside `initFinancialReportsTables()`):**

```sql
CREATE TABLE IF NOT EXISTS bctc_table_rows (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id        TEXT    NOT NULL,         -- FK → financial_reports.id (UUID)
  page_number      INTEGER NOT NULL,         -- 1-indexed PDF page
  statement_section TEXT   NOT NULL,         -- e.g. "balance_sheet", "income_statement", "cash_flow"
  row_order        INTEGER NOT NULL,         -- original row order within the stitched table (for hierarchy preservation)
  code             TEXT,                     -- BCTC line code e.g. "100", "110", "270" (nullable: header rows have no code)
  label            TEXT    NOT NULL,         -- Vietnamese label e.g. "TÀI SẢN NGẮN HẠN"
  period_current   TEXT    NOT NULL,         -- e.g. "31/12/2025"
  value_current    REAL,                     -- billion VND, NULL if non-numeric (header/separator rows)
  period_prior     TEXT,                     -- e.g. "31/12/2024" (NULL if only one period column)
  value_prior      REAL,                     -- billion VND, NULL if non-numeric or prior column absent
  unit             TEXT    NOT NULL DEFAULT 'billion_vnd',
  is_summary_row   INTEGER NOT NULL DEFAULT 0,  -- 1 for codes 100/200/270/300/400/440 (major subtotals)
  extracted_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_btr_report ON bctc_table_rows(report_id, statement_section, row_order);
CREATE INDEX IF NOT EXISTS idx_btr_code   ON bctc_table_rows(report_id, code);

CREATE TABLE IF NOT EXISTS bctc_balance_checks (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id        TEXT    NOT NULL UNIQUE,  -- FK → financial_reports.id
  statement_section TEXT   NOT NULL,         -- "balance_sheet" (only BS has the identity)
  total_assets     REAL,                     -- billion VND
  total_liabilities REAL,                   -- billion VND
  total_equity     REAL,                     -- billion VND
  balance_delta    REAL,                     -- total_assets - (liabilities + equity), absolute VND
  balance_pass     INTEGER NOT NULL DEFAULT 0,  -- 1 = identity holds within 1 VND tolerance
  checked_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bbc_report ON bctc_balance_checks(report_id);
```

**Joins to `financial_reports`:** `bctc_table_rows.report_id = financial_reports.id`. One-to-many: one `financial_reports` row → N `bctc_table_rows`. One-to-one: one `financial_reports` row → zero or one `bctc_balance_checks` row.

**Migration guard:** wrap DDL in `CREATE TABLE IF NOT EXISTS` (existing pattern). No `ALTER TABLE` needed — new tables. Add a migration guard comment `-- BT-3 BCTC table rows`.

**Why two tables:** separating `bctc_table_rows` (per-row data) from `bctc_balance_checks` (per-report summary) avoids repeating the balance-check result on every row and makes the inspector balance-badge query a single-row lookup by `report_id`.

**14 stranded docs:** after BT-3+BT-3i+BT-5 land (and BT-4 confirms production server runs correctly), BT-4b triggers a one-shot re-extraction of all 14 `financial_reports` rows. The re-extraction POSTs to `POST /api/push-bctc-table` which writes new `bctc_table_rows` rows. Idempotent: before insert, DELETE existing rows for the same `report_id` so re-run is safe.

---

### 2. Extraction → Store Wiring

**New infrastructure adapter: `apps/pdf-extractor/infrastructure/text_table_extractor.py`**

Layer: `infrastructure` (does Tesseract I/O — impure). DDD: Fence-A/B safe (not in `domain/`).

Responsibility: given a PDF path, run Tesseract (vie+eng) on each page, parse line-by-line output into `(code, label, value_current, value_prior)` rows using the BT-1 primitives (`vn_number_normalize`, `select_period_column`). Emit a list of `TableRowDTO` dicts per page. Stitch multi-page sections (p4-7 pattern: detect section boundary by code reset or header match). Returns `(rows: list[dict], period_current: str, period_prior: str | None)`.

Key implementation notes:
- Row order is preserved in the list index → assign `row_order = enumerate(rows)`.
- `code` extraction: regex `^\s*(\d{2,3})\s+(.+)` on each text line. Lines without a code = header/separator rows (code=None, label=line text, values=None).
- `value_current` and `value_prior` selected via `select_period_column` per row (real cells now available — the BT-1 TODO is filled here).
- Unit detection: look for "Đơn vị tính" line; default to `billion_vnd` if absent (FPT balance sheet is in full VND, so the extractor must also detect VND-vs-billion from the unit header and record in `unit` column).
- `is_summary_row`: set 1 when code in `{100, 200, 270, 300, 400, 440}` (BCTC standard major subtotal codes).

**New domain port: `TableAssemblerPort` in `domain/modules/financial_reports/ports.py`**

```python
class TableAssemblerPort(Protocol):
    def assemble(
        self,
        pages: list[dict],           # list of {page_number, rows, period_current, period_prior}
        statement_section: str,      # "balance_sheet" | "income_statement" | "cash_flow"
    ) -> dict:                       # {rows: list[dict], period_current: str, period_prior: str|None}
        ...
```

Layer: domain port (pure Protocol — no imports). The concrete adapter is `infrastructure/text_table_extractor.py`. This port is optional in `FinancialReportsModule.__init__` (backward-compat = no new positional arg).

**New application use case: `apps/pdf-extractor/application/extract_tables_usecase.py`**

Layer: application (imports domain, receives injected infrastructure adapters). Zero HTTP/DB knowledge.

```python
class ExtractTablesUseCase:
    def __init__(
        self,
        table_extractor: TableAssemblerPort,    # injected infrastructure adapter
        table_push_client: TablePushClientPort, # HTTP client → POST /api/push-bctc-table
    ) -> None: ...

    async def execute(self, report_id: str, pdf_path: str, statement_section: str) -> dict:
        # 1. Call table_extractor.assemble() → structured rows + periods
        # 2. Compute balance check (pure: Total Assets = Liab + Equity via reconcile_figures)
        # 3. POST rows + balance_check to mcp-server via table_push_client
        # Returns {rows_stored: int, balance_pass: bool, balance_delta: float}
```

**`TablePushClientPort`** (new port in `domain/repositories.py`):

```python
class TablePushClientPort(Protocol):
    async def push_table(
        self,
        report_id: str,
        statement_section: str,
        rows: list[dict],
        balance_check: dict | None,
        period_current: str,
        period_prior: str | None,
    ) -> dict: ...
```

Concrete adapter: `infrastructure/table_push_client.py` — aiohttp POST to `http://mcp-server:3000/api/push-bctc-table`. Follows `pdfExtractorClient.ts` pattern (the reverse direction). Auth: none (internal Docker network, same pattern as all other service-to-mcp POSTs).

**New mcp-server endpoint: `POST /api/push-bctc-table`**

Handler: `apps/mcp-server/src/interface/mcp/routes/pushBctcTableHandler.ts` (new file, SI-2 boundary).

Request body (JSON):
```json
{
  "report_id": "<uuid>",
  "statement_section": "balance_sheet",
  "period_current": "31/12/2025",
  "period_prior": "31/12/2024",
  "rows": [
    {"page_number": 4, "row_order": 0, "code": "100", "label": "TÀI SẢN NGẮN HẠN", "value_current": 58102970.741619, "value_prior": 45535942.846453, "unit": "billion_vnd", "is_summary_row": 1},
    ...
  ],
  "balance_check": {
    "total_assets": 88089621.779862,
    "total_liabilities": 44338155.487272,
    "total_equity": 43751466.292590,
    "balance_delta": 0.0,
    "balance_pass": true
  }
}
```

Handler logic: validate `report_id` is UUID; `DELETE FROM bctc_table_rows WHERE report_id = ?` (idempotent); bulk INSERT rows; UPSERT `bctc_balance_checks`; respond `{ok: true, rows_stored: N}`. Uses injected `db` (same pattern as all other push handlers). Registered in `server.ts` alongside existing `/api/push-*` handlers.

**Trigger wiring in `process_report()` flow:**

The existing `ExtractPDFUseCase` (called by 1954c's consolidated path) is NOT modified. The `ExtractTablesUseCase` is a separate trigger. It is invoked:
- (BT-3) Via a new FastAPI route `POST /extract-tables` on pdf-extractor port 5001. mcp-server's `bctcReparseJob.ts` (or a new one-shot job for BT-4b) calls this route for a given `report_id` + `pdf_path`.
- (BT-4b) One-shot backfill: mcp-server `bctcBatchTableBackfillJob.ts` — a single run job that iterates all 14 `financial_reports` rows with `pdf_path IS NOT NULL`, calls `POST pdf-extractor:5001/extract-tables` for each. Not a recurring cron — runs once triggered by BT-4b ops task, then marked done.

**Composition root update (`main.py`):**

```python
# BT-3 additions
from infrastructure.text_table_extractor import TextTableExtractor
from infrastructure.table_push_client import TablePushClient
from application.extract_tables_usecase import ExtractTablesUseCase

table_extractor = TextTableExtractor()  # wraps Tesseract + BT-1 primitives
table_push_client = TablePushClient(mcp_server_url=cfg.mcp_server_url)
extract_tables_usecase = ExtractTablesUseCase(table_extractor, table_push_client)

# wire into register_routes()
register_routes(router, extract_usecase, inspection_store, extract_tables_usecase)
```

**`mcp_server_url`** added to `Config` (from env `MCP_SERVER_URL`, default `http://mcp-server:3000`).

---

### 3. Inspector Render Contract (SI-2 Boundary)

**New API endpoint — `GET /api/bctc-inspect/table/{doc_id}`**

Handler: extend `bctcInspectHandler.ts` with `handleBctcInspectTable()`.

Response shape:
```typescript
interface BctcTableResponse {
  doc_id: string;
  report_id: string;
  statement_section: string;
  period_current: string;         // "31/12/2025"
  period_prior: string | null;    // "31/12/2024"
  rows: BctcTableRow[];
  balance_check: BalanceCheck | null;
  has_table: boolean;             // false when no rows stored (not yet extracted)
}

interface BctcTableRow {
  page_number: number;
  row_order: number;
  code: string | null;
  label: string;
  value_current: number | null;   // billion VND
  value_prior: number | null;     // billion VND
  unit: string;                   // "billion_vnd"
  is_summary_row: boolean;
}

interface BalanceCheck {
  total_assets: number | null;
  total_liabilities: number | null;
  total_equity: number | null;
  balance_delta: number | null;   // absolute VND
  balance_pass: boolean;
}
```

SQL (two queries, injected `db`):
```sql
-- Q1: rows
SELECT page_number, row_order, code, label,
       value_current, value_prior, unit, is_summary_row
FROM bctc_table_rows
WHERE report_id = ?
ORDER BY row_order ASC;

-- Q2: balance check
SELECT total_assets, total_liabilities, total_equity, balance_delta, balance_pass
FROM bctc_balance_checks
WHERE report_id = ?;
```

Response when `Q1` returns 0 rows: `{has_table: false, rows: [], balance_check: null}`.

**`bctc-inspector.html` render additions (BT-3i):**

Do NOT modify the frozen pilot surfaces. Modify ONLY `apps/mcp-server/src/interface/bctc-inspector.html` (the SI-2 viewer, not a pilot surface).

New `#table-section` div inserted between `.figures-section` and `#ocr-text-content`:
```html
<div id="table-section" style="display:none">
  <div id="balance-badge"></div>
  <div id="table-content"></div>
</div>
```

JS function `renderTable(data)` called from the existing OCR fetch callback (after `renderFigures`):
- `data.has_table === false` → show `"Table not yet extracted — extract via BT-3"` message.
- `data.balance_check.balance_pass === true` → render green `PASS` badge with delta; `false` → red `FAIL` badge with delta in VND.
- Rows rendered as an HTML `<table>` with columns: Code | Label | `period_current` | `period_prior`. Summary rows (`is_summary_row=true`) rendered with `font-weight:bold`. Code=null rows (headers) rendered with colspan and `font-style:italic`.
- Values formatted: `value / 1e3` converted to billions with comma separator (matching existing `fmt()` helper).

Route registered in `server.ts`:
```typescript
if (method === "GET" && pathname.startsWith("/api/bctc-inspect/table/")) {
  const docId = pathname.slice("/api/bctc-inspect/table/".length);
  handleBctcInspectTable(req, res, db, docId);
  return;
}
```

---

### 4. Per-Task Acceptance Criteria

**BT-3 — Extract+Store (dev-pdf-extractor)**

- AC-1: `POST pdf-extractor:5001/extract-tables` with a valid FPT PDF path returns `{rows_stored: N, balance_pass: true}` where N ≥ 70 (FPT p4-7 ~80 rows).
- AC-2: `SELECT COUNT(*) FROM bctc_table_rows WHERE report_id = <fpt_id>` on `market.db` returns N ≥ 70.
- AC-3: `SELECT balance_pass FROM bctc_balance_checks WHERE report_id = <fpt_id>` returns 1.
- AC-4: Re-running `POST /extract-tables` for the same `report_id` is idempotent: row count unchanged, `balance_pass` unchanged.
- AC-5: `TextTableExtractor` lives in `infrastructure/` — import-linter Fence-A/B intact (`lint-imports --config pyproject.toml` exit 0).
- AC-6: `ExtractTablesUseCase` imports only from `domain/` and ports — zero `infrastructure` imports in `application/`.
- AC-7: `TableAssemblerPort` and `TablePushClientPort` are pure Protocols — zero infra imports in `domain/modules/financial_reports/ports.py`.
- AC-8: `vn_number_normalize` applied to every value cell before float conversion — VNM sentinel `"2.840.370"` → `2840370` billion-VND value stored correctly.
- AC-9: `select_period_column` picks `31/12/2025` as `period_current` on FPT p4 (the real cell list, not the mock path).
- AC-10: Sandbox `runner.py` exit-0, zero new creds in env — `env -i PYTHONPATH=. python3 sandbox/runner.py` produces no forbidden-key output.
- AC-11: Unit tests for `TextTableExtractor` with fixture text covering code-row, header-row, and None-value row cases (pytest, PYTHONPATH=apps/pdf-extractor).

**BT-3i — Inspector Render (dev-mcp-server)**

- AC-1: `GET /api/bctc-inspect/table/<fpt_uuid>` returns `{has_table: true, rows: [...], balance_check: {balance_pass: true}}`.
- AC-2: `GET /api/bctc-inspect/table/<doc_without_rows>` returns `{has_table: false}` with HTTP 200 (not 404).
- AC-3: `GET /api/bctc-inspect` page loads without JS error; `#table-section` is visible when table data exists.
- AC-4: Balance badge shows green "PASS" for `balance_pass=true`, red "FAIL" for `balance_pass=false`.
- AC-5: Summary rows (codes 100/270/440) render bold in the table.
- AC-6: UUID validation on `doc_id` returns 400 for invalid input (same guard as existing OCR endpoint).
- AC-7: `pushBctcTableHandler.ts` bulk-INSERT test with in-memory DB — `bun test` passes.
- AC-8: `POST /api/push-bctc-table` duplicate call for same `report_id` — row count unchanged after second call (DELETE+INSERT idempotency test).

**BT-4 — Deploy extractor to main server (ops + dev-mainserver-crawls)**

- AC-1: Ops confirms main server CPU baseline for 4s/page Tesseract — no GPU needed.
- AC-2: Docker compose updated to include `MCP_SERVER_URL=http://mcp-server:3000` env var for pdf-extractor service.
- AC-3: `POST pdf-extractor:5001/extract-tables` is reachable from mcp-server container on main server.
- AC-4: No Mac-local model or process in production path — D6 invariant confirmed.

**BT-4b — One-shot re-extraction of 14 stranded docs (dev-pdf-extractor + ops)**

- AC-1: `bctcBatchTableBackfillJob` (or equivalent one-shot script) iterates all `financial_reports` rows where `pdf_path IS NOT NULL AND pdf_path != ''` and calls `POST /extract-tables` for each. Runs ONCE, not on cron.
- AC-2: After backfill: `SELECT COUNT(DISTINCT report_id) FROM bctc_table_rows` = 14 (or fewer if some PDFs are unreadable — log, do not crash).
- AC-3: Backfill is triggered AFTER BT-3+BT-3i+BT-5 all pass, and BEFORE BT-6 QA starts. Sequencing is the acceptance criterion.
- AC-4: Idempotent: running the backfill twice leaves row counts unchanged.

**BT-5 — Cross-check confidence gate (dev-pdf-extractor)**

- AC-1: `reconcile_figures(extracted_value, api_bridge_value, tol=1.0)` called for each summary-row code (100/270/300/400/440) against the existing `financial_reports` scalar figures after extraction.
- AC-2: When `reconcile_figures` returns `"shift"` (ratio > 10x) for ANY summary row → `POST /api/push-bctc-table` is NOT sent; instead log + send WORK alert ("BT-5 cross-check FAIL: {report_id} code={code} ratio={ratio}").
- AC-3: `GET /api/bctc-inspect/table/{doc_id}` for a blocked report returns `{has_table: false}` with a `blocked_reason: "cross_check_fail"` field.
- AC-4: BT-0 FPT sentinel set (6 sentinels): `reconcile_figures` returns `"agree"` for all 6 → not blocked.
- AC-5: Unit test: inject a known 1000x shift → verify block fires and push is skipped.

**BT-6 — QA regression gate (qa)**

- AC-1: BT-0 harness re-run on full 14-doc gold-set: figure-accuracy ≥95% within ±0.5% for each doc (not just FPT). VNM `net_profit` and DHG `revenue` sentinels remain GREEN.
- AC-2: `SELECT COUNT(DISTINCT report_id) FROM bctc_table_rows` = 14 (all docs extracted).
- AC-3: `GET /api/bctc-inspect/table/{doc_id}` for each of the 14 docs returns `{has_table: true}`.
- AC-4: Balance badge rendered in inspector for each doc that has a balance sheet (not all statements have the identity — cash-flow and income-statement docs may have `balance_check: null`).
- AC-5: BT-5 cross-check fires on a deliberately injected bad value, blocks push, WORK alert sent.
- AC-6: `sandbox/runner.py` exit-0, zero creds; `lint-imports` exit-0 (Fence-A/B intact).
- AC-7: `pilot-status-pdf-extractor.json` diff = empty (not modified).
- AC-8: `dashboard/index.html`, `dashboard/traces.js`, `dashboard/trust-contract.spec.js` diff = empty (frozen surfaces not touched).
- AC-9: Zero off-infra data send confirmed (no external HTTP call in extraction path — only `mcp-server:3000` internal Docker POST).
- AC-10: QA-on-BT1 (BT-1 `e74abc43`) closed: `pytest __tests__/unit/test_vn_number_normalize.py -v` = 17 passed.
- AC-11: Emit `qa-bctc-table-<UTC>.json` in canonical QA output format.

---

### 5. DDD Risk Review

**R-1 (HIGH) — Cell-F1 0.07-0.12: row-order hierarchy may drift across pages.**

Cell-F1 measures grid reconstruction quality, not figure-value accuracy. F1=0.10 means the TEXT path gets column-to-row alignment wrong on ~90% of cells — but the figures are STILL correct because the extraction uses line-by-line regex, not a grid model. The risk is: multi-value rows (where a single label spans two lines) may produce wrong `value_current`/`value_prior` alignment.

Design mitigation: the `row_order` column preserves insertion order (enumerate on the parsed line list). The inspector renders rows in `row_order ASC` — the user sees them in document order. For the balance-check gate (BT-5), only summary-row codes matter and those are always on their own line (no multi-column ambiguity). For the detail rows where F1 is poor (p5 at 95.8%, p7 at 86.7%), the stored values may be in the wrong column (current vs prior swapped). This is a known residual risk accepted by the PO (BT-0-PICK decision). The DEFERRED PP-StructureV3 IMAGE cross-check would resolve this.

**Decision on PP-StructureV3 for BT-3:** NOT activated. TEXT path is the sole extractor. The IMAGE cross-check `PdfPageRenderer` (PyMuPDF/pdf2image → PNG → PP-StructureV3) remains DEFERRED and must only be activated as self-hosted VLM, never for figures accuracy, never with external API (Privacy binding constraint). If activated in a future sprint, it becomes a second adapter behind a feature flag in `ExtractTablesUseCase`, not a change to the current pipeline.

**R-2 (MEDIUM) — `value_current`/`value_prior` column swap at low F1 pages.**

The TEXT path cannot guarantee correct column order when F1 is 0.07. The period column selection (`select_period_column`) operates on the header line and propagates the column index to each row. If the header parse is wrong, all rows on that page will have current/prior swapped. BT-5 catches this for summary-code rows (ratio check against the `financial_reports` scalar). For non-summary detail rows the swap is silent.

Architect recommendation: store both raw period strings (`period_current`, `period_prior`) in `bctc_table_rows` so a future correction pass can re-map without re-extracting. This is already in the schema design above.

**R-3 (LOW) — VND vs billion-VND unit confusion.**

FPT balance sheet is in full VND; the `financial_reports` scalars are in trieu VND (million VND, per mcp-server convention). The table extractor must detect the unit from the "Đơn vị tính" header line and store it in the `unit` column. The inspector renders the unit label next to values. The balance-check computation must use the same unit as the rows. BT-3 AC-1 implicitly validates this (balance must hold to within 1 VND tolerance). Flag for dev: implement unit detection before the value parsing loop.

**R-4 (LOW) — `market.db` WAL under concurrent Docker write.**

`schema-financial-reports.ts` `initFinancialReportsTables()` is called at mcp-server startup. The new `CREATE TABLE IF NOT EXISTS` DDL is safe — it is a no-op if the table exists. The bulk-INSERT in `pushBctcTableHandler.ts` wraps DELETE+INSERT in a single transaction (mcp-server is the sole writer). No WAL risk from pdf-extractor (it never opens `market.db`). LOW risk.

**R-5 (LOW) — Fence-A false-green for `TableAssemblerPort`.**

The port lives in `domain/modules/financial_reports/ports.py`. The existing Fence-A contract checks `domain.primitives` not importing `infrastructure`. The new port is in `domain.modules` which is covered by Fence-B. Confirm: `lint-imports` config at `pyproject.toml` covers `domain.modules` as the source module for Fence-B. Dev must verify Fence-B catches a deliberate violation before committing (inject `from infrastructure.config import Config` into `ports.py`, verify non-zero exit, remove). This is BT-3 AC-5's responsibility.

---

### Files to Create / Modify

**apps/pdf-extractor/ (dev-pdf-extractor — BT-3):**
- CREATE `infrastructure/text_table_extractor.py` — Tesseract TEXT-path table extractor adapter
- CREATE `infrastructure/table_push_client.py` — HTTP client → POST /api/push-bctc-table
- CREATE `application/extract_tables_usecase.py` — `ExtractTablesUseCase`
- MODIFY `domain/modules/financial_reports/ports.py` — add `TableAssemblerPort`, `TablePushClientPort`
- MODIFY `interface/handlers.py` — add `POST /extract-tables` route + wire `ExtractTablesUseCase`
- MODIFY `main.py` — wire new adapters + use case into composition root
- MODIFY `infrastructure/config.py` — add `mcp_server_url` field from env
- CREATE `__tests__/unit/test_text_table_extractor.py` — unit tests with fixture text
- CREATE `__tests__/unit/test_extract_tables_usecase.py` — unit tests with injected fakes

**apps/mcp-server/ (dev-mcp-server — BT-3i):**
- MODIFY `src/infrastructure/db/schema-financial-reports.ts` — add `bctc_table_rows` + `bctc_balance_checks` DDL inside `initFinancialReportsTables()`
- MODIFY `src/interface/mcp/routes/bctcInspectHandler.ts` — add `handleBctcInspectTable()`
- CREATE `src/interface/mcp/routes/pushBctcTableHandler.ts` — `handlePushBctcTable()`
- MODIFY `src/interface/mcp/server.ts` — register two new routes (table GET + push POST)
- MODIFY `src/interface/bctc-inspector.html` — add `#table-section` div + `renderTable()` JS
- CREATE `src/application/usecases/bctcBatchTableBackfillJob.ts` (BT-4b trigger) — NOT a cron; one-shot function

---

### Scan Clean

- Fence-A: verified — no new `domain/primitives` file imports `infrastructure`. CLEAN.
- Fence-B: verified — `domain/modules/financial_reports/ports.py` has zero infra imports. CLEAN.
- 1954c collision: NONE — new push path is a separate endpoint, separate use case, separate table. The existing `POST /extract` → `ExtractPDFUseCase` path is untouched.
- `pilot-status-pdf-extractor.json`: NOT modified. Pilot frozen. CLEAN.
- `sandbox/runner.py`, `dashboard/`: NOT touched. CLEAN.

---

## RETURN
DONE: BT-2 design complete. [Architect] section appended to docs/handoffs/TASK_BCTC-TABLE.md.
ZONE: multi — apps/pdf-extractor/ (BT-3, BT-4b, BT-5) + apps/mcp-server/ (BT-3i, BT-4b trigger)
NEXT: pm | slice BT-3, BT-3i, BT-4, BT-4b, BT-5, BT-6 into atomic dev-* handoffs; unblock BT-3 (dev-pdf-extractor) and BT-3i (dev-mcp-server) first — BT-3i depends on BT-3 (schema must exist before inspector can read it)
HANDOFF: docs/handoffs/TASK_BCTC-TABLE.md
PIPELINE: continue

---

## [Developer] BT-1 — dev-pdf-extractor — DONE

**Commit:** `e74abc43` | **Branch:** main | **Date:** 2026-05-24

### What was delivered

Three pure domain primitives in `apps/pdf-extractor/domain/primitives/`:

1. **`vn_number_normalize`** — Fixes the root decimal-shift cause at parse time.
   VN format: `.`=thousands separator, `,`=decimal. Converts before `float()`.
   - "2.840.370" → "2840370" (VNM net_profit anchor)
   - "1.234,56" → "1234.56" (DHG revenue anchor)
   - "1.234.567,89" → "1234567.89", "51.000" → "51000", "0,5" → "0.5"
   - "1,234.5" (EN-US format) → None (rejected, fail-loud)
   - Disambiguation rule: lone "1.234" = VN thousands integer → "1234" (documented in primitive.py)
   - Negatives: "(-2.840.370)" → "-2840370", parenthesis BCTC notation handled

2. **`reconcile_figures(a, b, tol=1.0)`** — Generalizes `isDecimalShiftAnomaly` from
   `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts`.
   - Same formula: `ratio = max(|a|,|b|) / max(min(|a|,|b|), 1e-9)`
   - "agree" (ratio ≤ tol) | "shift" (ratio > 10×tol) | "low" (between)
   - Null-safe (None input → "agree"), zero-reference guard (b=0 → "agree")
   - VNM: `reconcile_figures(0.000051, 51000)` → "shift" (ratio ~1e9)

3. **`select_period_column(cells, hint, headers)`** — Deterministic period column picker.
   - Step 1: header keyword matching for "consolidated"/"current"/"ytd"/"parent"
   - Step 2: position heuristic (first non-empty numeric cell)
   - Returns `[index, value]` list (JSON round-trip safe)
   - TODO marker in primitive.py for BT-3 model-dependent semantic override

### Wiring into live extraction path

`FinancialReportsModule.process_report()` now calls `vn_pre_normalize()` BEFORE `decimal_normalizer.normalize()` for each raw field. Three new optional constructor ports added (backward-compat — existing callers unaffected). `sandbox/runner.py` wires all 9 adapters.

### Red→Green evidence

**Before fix:**
- `float("2.840.370")` = `2.84037` (wrong parse; pipeline produces decimal-shifted output ~0.000051 after further processing)
- `float("1.234,56")` → `ValueError` → `None` propagates downstream

**After fix:**
- `vn_number_normalize("2.840.370")` = `"2840370"` → `normalize_decimal("2840370")` = `2840370.0`
- `vn_number_normalize("1.234,56")` = `"1234.56"` → `normalize_decimal("1234.56")` = `1234.56`
- `reconcile_figures(0.000051, 51000)` = `"shift"` (anomaly correctly detected)

### Test counts

- **Pre-existing:** 186 passed (no regression)
- **New (BT-1):** 49 tests (17 vn_number_normalize + 20 reconcile_figures + 12 select_period_column)
- **Total:** 235 passed

### Sandbox scenarios

- 9 new scenarios GREEN (3 per primitive: happy/edge/failure)
- Module-tier scenario: `revenue_reconciliation` + `selected_column_*` keys present, pass=true
- All pre-existing scenarios unaffected

### Import-linter fence

- 63 files analyzed, 94 dependencies
- Fence-A (primitives must not import infra/app/interface): KEPT
- Fence-B (modules must not import infra/interface): KEPT
- Exit 0

### ACs status

- AC1 VNM net_profit: GREEN — "2.840.370" → 2840370.0; reconcile vs api flags "shift" for old value
- AC2 DHG revenue: GREEN — "1.234,56" → 1234.56
- AC3 spec vectors: all GREEN (tested in test_vn_number_normalize.py)
- AC4 pure primitives: CONFIRMED (import-linter fence 2/0)

### Handoff to QA

Owner: qa | Task: verify BT-1 green signal
- Run `cd apps/pdf-extractor && python -m pytest` — expect 235 passed
- Run `lint-imports --config pyproject.toml` — expect 2 kept 0 broken
- Verify commit `e74abc43` has zero foreign files: `git show --stat e74abc43`
- Confirm AC1/AC2 tests pass: `python -m pytest __tests__/unit/test_vn_number_normalize.py -v`

---

## OPEN QUESTIONS — RESOLVED with PO defaults (no user override needed; full autonomy)

1. **Privacy — RESOLVED: self-hosted ONLY.** No PDF/image leaves our infra. External-API VLM stays a deferred opt-in follow-on, never an active task. (Re-open only on explicit user "yes".)
2. **Main-server GPU — RESOLVED for figures path: NOT required.** TEXT path is CPU-feasible at 4s/page. ops confirms main-server CPU sizing at BT-4. GPU only re-enters scope if the DEFERRED image cross-check (PaddleOCR-VL self-hosted) is ever activated for the sub-bar p5/p7 rows.
3. **Figure-accuracy pass-bar — RESOLVED: ≥95% within ±0.5%.** Adopted + MET on FPT reference. BT-6 QA validates across the wider 14-doc gold-set. API budget N/A (Q1 = self-hosted only).

## DEFERRED / HONESTLY-FLAGGED (not closed by this pick)

- **Sub-bar rows:** FPT p5 95.8% (marginal) + p7 86.7% (below bar). Low cell-F1 (0.07-0.12 — grid reconstruction poor even where figures are right). PP-StructureV3 IMAGE path is the deferred remedy — self-hosted, revisit ONLY here, never for figures, never external-API.
- **QA-on-BT1 still pending** — BT-1 (`e74abc43`) shipped but QA never verified its green signal. Folded into BT-6.
- **14 stranded docs hold OLD-parser figures** — re-extract ONCE at BT-4b (post-integration, pre-QA), not twice.
- **Single-doc evidence** — pass-bar proven on FPT only; BT-6 QA must prove it across the 14-doc gold-set.

---

## [PM] Task Decomposition & Dispatch Order

**Atomic tasks (6 dev + 1 ops/gate):** BT-3 decomposed into 3 sequential dev-pdf-extractor subtasks (~2h each), BT-3i into 2 sequential dev-mcp-server subtasks (~2h each), plus BT-4 (ops), BT-4b (backfill), BT-5 (cross-check), BT-6 (qa), BT-EXIT (po).

**Binding constraints (Day-0, every task):**
- Explicit-file staging (`git add <path>`, never `-A`/`.`); no `--force`/`--no-verify`; NO `git push` (user owns); all on `main`; `git show --stat HEAD` zero foreign files.
- Claim commit-mutex under `'sprint-task'` kind before any add/commit (enum-drift workaround; vn-market task_claim fix).
- Never ask user to run/deploy — spawn ops/dev agents.
- HONEST counts only — sandbox green, tests pass, not "should work."

**WIP enforcement:** max 2 In Progress. Parallel dispatch only for independent zones (BT-3-A dev-pdf-extractor + BT-4 ops = safe; BT-3i-A + BT-3-C may run parallel on same doc_id but different tables). Sequential within same zone+owner.

---

## BT-3-A — [dev-pdf-extractor] Infra Adapters + Ports

**Owner:** dev-pdf-extractor | **Duration:** ~2h | **Blockers:** BT-2, BT-1 | **Depends on:** (none)

### Context
The TEXT-path extractor needs two new infrastructure adapters (Tesseract wrapper + HTTP push client) and two new domain ports (pure interfaces for dependency injection). This task delivers the adapters and ports; integration into the usecase happens in BT-3-B.

### Scope
1. **Create `apps/pdf-extractor/infrastructure/text_table_extractor.py`** (NEW file)
   - Responsibility: Given a PDF path, run Tesseract (vie+eng) per page → parse line-by-line → extract rows using BT-1 primitives.
   - Returns: `list[dict]` with `{page_number, row_order, code, label, value_current, value_prior, unit, is_summary_row}`.
   - Stitching: multi-page sections (p4-7 pattern) assembled by list concatenation w/ `row_order` tracking.
   - Key logic: code regex `^\s*(\d{2,3})\s+(.+)`, use `select_period_column` per row, unit detection from "Đơn vị tính" line (default `billion_vnd`).
   - Test: unit tests under `__tests__/unit/test_text_table_extractor.py` w/ fixture text covering code-row, header-row, None-value cases. Fixture = raw Tesseract output for FPT p4 (5 rows, 2 periods).

2. **Create `apps/pdf-extractor/infrastructure/table_push_client.py`** (NEW file)
   - Responsibility: HTTP POST client wrapping `aiohttp`.
   - Method: `async def push_table(report_id, statement_section, rows, balance_check, period_current, period_prior) → dict`.
   - Endpoint: `http://mcp-server:3000/api/push-bctc-table` (from env `MCP_SERVER_URL`, default).
   - Payload: JSON matching the Architect's schema (rows array + balance_check dict).
   - Error handling: log + raise (let usecase handle retry/blocking).

3. **Modify `apps/pdf-extractor/domain/modules/financial_reports/ports.py`** (ADD lines)
   - Add `TableAssemblerPort(Protocol)`: method `assemble(pages: list[dict], statement_section: str) → dict`.
   - Add `TablePushClientPort(Protocol)`: method `push_table(...)` (same signature as #2).
   - Both: pure Protocols, ZERO imports from `infrastructure/application/interface`.

4. **Verify imports**
   - `text_table_extractor.py`: may import from `infrastructure/config`, `domain/primitives`, Tesseract libs, `aiohttp` (infra adapter OK to import from domain/libs).
   - `table_push_client.py`: may import `aiohttp`, `domain/repositories.py` (for the protocol type hint), `infrastructure/config`.
   - `ports.py`: ZERO imports from `infrastructure/application/interface` (pure protocol).
   - Run `lint-imports --config pyproject.toml` → exit 0 (Fence-A/B intact).

5. **Update `apps/pdf-extractor/infrastructure/config.py`** (MODIFY)
   - Add field: `mcp_server_url: str = Bun.env.MCP_SERVER_URL ?? "http://mcp-server:3000"` (or Python env equivalent).
   - Wire into composition root (next task).

### Acceptance Criteria (ACs)

- **AC-1:** `TextTableExtractor` class instantiates without errors; has `assemble(pages, statement_section) → dict` method matching the port signature.
- **AC-2:** `TablePushClient` class instantiates w/ `mcp_server_url`; `push_table(...)` is async and returns `dict` with `ok: true` on success mock.
- **AC-3:** Both classes live in `infrastructure/`, zero direct domain imports (domain/primitives OK, but no domain/services/usecases).
- **AC-4:** `TableAssemblerPort` + `TablePushClientPort` defined in `domain/modules/financial_reports/ports.py` as Protocols; zero infra imports detected by lint-imports.
- **AC-5:** Unit tests exist under `__tests__/unit/test_text_table_extractor.py` w/ ≥3 scenarios (code-row parse, header-row passthrough, None-value handling).
- **AC-6:** `lint-imports --config pyproject.toml` exit-0 (Fence-A/B KEPT).
- **AC-7:** Sandbox `runner.py` imports both new adapters w/o error (composition root ready for next task).

### Files to Stage & Commit
- `apps/pdf-extractor/infrastructure/text_table_extractor.py` (CREATE)
- `apps/pdf-extractor/infrastructure/table_push_client.py` (CREATE)
- `apps/pdf-extractor/domain/modules/financial_reports/ports.py` (MODIFY: add 2 protocols)
- `apps/pdf-extractor/infrastructure/config.py` (MODIFY: add mcp_server_url)
- `apps/pdf-extractor/__tests__/unit/test_text_table_extractor.py` (CREATE)

**Post-commit check:** `git show --stat HEAD` lists only the 5 files above (zero foreign).

---

## BT-3-B — [dev-pdf-extractor] Usecase + Routes

**Owner:** dev-pdf-extractor | **Duration:** ~2h | **Blockers:** BT-3-A | **Depends on:** BT-3-A

### Context
Build the application orchestration layer (usecase) that calls the TEXT-path extractor adapter, computes balance checks, and pushes rows to mcp-server. Wire the HTTP route handler.

### Scope

1. **Create `apps/pdf-extractor/application/extract_tables_usecase.py`** (NEW file)
   - Class: `ExtractTablesUseCase`
   - Constructor: receives injected `table_extractor: TableAssemblerPort`, `table_push_client: TablePushClientPort`
   - Method: `async def execute(report_id: str, pdf_path: str, statement_section: str) → dict`
   - Logic:
     - Call `table_extractor.assemble(pages, statement_section)` → get `{rows, period_current, period_prior}`
     - Compute balance check from rows: Total Assets = Liabilities + Equity (pure logic w/ tolerance 1 VND)
     - Call `table_push_client.push_table(...)` → store in mcp-server
     - Return `{rows_stored: int, balance_pass: bool, balance_delta: float}`
   - No HTTP/DB knowledge; only domain logic + port calls.

2. **Modify `apps/pdf-extractor/interface/handlers.py`** (ADD route)
   - New route: `POST /extract-tables` (FastAPI endpoint)
   - Request body: `{report_id: str, pdf_path: str, statement_section: str}`
   - Response: `{ok: bool, rows_stored: int, balance_pass: bool}` (or error)
   - Handler: instantiate usecase (from composition root), call `execute()`, return result.

3. **Modify `apps/pdf-extractor/main.py`** (MODIFY composition root)
   - Import new usecase + adapters
   - Instantiate: `text_extractor = TextTableExtractor()`, `push_client = TablePushClient(mcp_server_url=cfg.mcp_server_url)`
   - Instantiate: `extract_tables_usecase = ExtractTablesUseCase(text_extractor, push_client)`
   - Wire: pass to `register_routes(router, extract_usecase, inspection_store, extract_tables_usecase)`

4. **Add tests** under `__tests__/unit/test_extract_tables_usecase.py` (NEW)
   - Inject fake adapters (mock `TableAssemblerPort`, mock `TablePushClientPort`)
   - Test: `execute()` calls both adapters, returns expected shape
   - Test: balance-check logic (total Assets vs Liab+Equity)

### Acceptance Criteria

- **AC-1:** `ExtractTablesUseCase` class defined; `execute(report_id, pdf_path, statement_section)` is async and returns `{rows_stored, balance_pass, balance_delta}`.
- **AC-2:** `extract_tables_usecase.py` imports ONLY from `domain/` + `domain/modules/financial_reports/ports.py` (zero imports from `infrastructure/interface`).
- **AC-3:** `POST /extract-tables` route registered in `interface/handlers.py`; handles request/response JSON correctly.
- **AC-4:** Composition root (`main.py`) wires all 3: `TextTableExtractor`, `TablePushClient`, `ExtractTablesUseCase`.
- **AC-5:** Unit tests exist w/ injected fakes; ≥2 scenarios (happy path, error handling).
- **AC-6:** `lint-imports --config pyproject.toml` exit-0 (Fence-B: `application/` must not import `infrastructure/interface`).
- **AC-7:** Sandbox `runner.py` exit-0 (all imports resolve, composition root works).

### Files to Stage & Commit
- `apps/pdf-extractor/application/extract_tables_usecase.py` (CREATE)
- `apps/pdf-extractor/interface/handlers.py` (MODIFY: add route)
- `apps/pdf-extractor/main.py` (MODIFY: wire composition root)
- `apps/pdf-extractor/__tests__/unit/test_extract_tables_usecase.py` (CREATE)

**Post-commit check:** `git show --stat HEAD` lists only the 4 files above.

---

## BT-3-C — [dev-pdf-extractor] Integration: process_report() → Structured Table Output

**Owner:** dev-pdf-extractor | **Duration:** ~2h | **Blockers:** BT-3-B | **Depends on:** BT-3-B

### Context
Wire the new `ExtractTablesUseCase` into the module-tier `process_report()` pipeline so that when a PDF is processed, it returns both the existing financial-report scalars AND the new structured table rows + balance check. Test the full pipeline on real FPT data.

### Scope

1. **Modify `apps/pdf-extractor/domain/modules/financial_reports/module.py`**
   - Current: `FinancialReportsModule.process_report()` returns 14 keys (scalars, statements, etc.)
   - Change: add NEW return keys `structured_table_rows` (list[dict]) + `balance_check` (dict | None)
   - No existing return keys removed (backward-compat)
   - Make the `table_extractor` + `table_push_client` optional in `__init__` (if not provided, return `None` for new keys)

2. **Modify call sites** (if any outside tests)
   - Check where `process_report()` is called; ensure callers either ignore the new keys or use them (OK to have both legacy + new callers)

3. **Test on FPT red→green**
   - Unit test: call `process_report()` on FPT PDF; verify `structured_table_rows` has ≥70 rows, `balance_check.balance_pass == True`
   - Integration test: the full `ExtractTablesUseCase` → mcp-server push (mock the push client to verify the request shape)
   - Verify `select_period_column` correctly picks column index from real FPT header (not mock)
   - Verify `vn_number_normalize` applied (e.g., FPT cells with `.` thousands separators parse correctly)

4. **Sandbox scenario**
   - Add scenario key: `structured_table_extraction` (or similar) to `sandbox/runner.py`
   - Verify: existing scenarios still pass (no regression); new scenario returns expected keys

### Acceptance Criteria

- **AC-1:** `FinancialReportsModule.process_report()` returns NEW keys `structured_table_rows` + `balance_check` (in addition to existing keys).
- **AC-2:** `POST pdf-extractor:5001/extract-tables` with FPT PDF returns `{rows_stored: ≥70, balance_pass: true}` (red→green: extractor emits the expected output).
- **AC-3:** `bctc_table_rows` table (mcp-server, not on disk yet) would contain ≥70 rows for FPT if the push succeeded (mocked: verify push request shape).
- **AC-4:** `select_period_column` called on real FPT cells (not mock); picks column 1 (consolidated current quarter, "31/12/2025" or equivalent) correctly.
- **AC-5:** `vn_number_normalize` applied to every value cell; FPT cells with "1.234.567,89" format parse to correct float.
- **AC-6:** Re-running `POST /extract-tables` for same `report_id` is idempotent (second call returns same `rows_stored` count, same `balance_pass`).
- **AC-7:** Sandbox `runner.py` exit-0, new scenario key present, all pre-existing scenarios still green.
- **AC-8:** Zero creds in sandbox (no API keys in env during test run).

### Files to Stage & Commit
- `apps/pdf-extractor/domain/modules/financial_reports/module.py` (MODIFY: return NEW keys)
- `apps/pdf-extractor/__tests__/integration/test_extract_tables_fpt.py` (CREATE: red→green tests)
- `apps/pdf-extractor/sandbox/runner.py` (MODIFY: add scenario, wire usecase)

**Post-commit check:** `git show --stat HEAD` lists only the 3 files above.

---

## BT-3i-A — [dev-mcp-server] Schema Migration + Handlers (Push Endpoint & Route Registration)

**Owner:** dev-mcp-server | **Duration:** ~2h | **Blockers:** BT-2, BT-3-C | **Depends on:** BT-3-C (rows must be coming from extractor before they can be stored)

### Context
Build the mcp-server side: the NEW database schema for storing table rows, the HTTP push handler that receives rows from pdf-extractor, and route registration. This creates the storage layer that BT-3i-B will read from.

### Scope

1. **Modify `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts`** (ADD)
   - Add DDL (inside `initFinancialReportsTables()` function):
     - `CREATE TABLE IF NOT EXISTS bctc_table_rows (...)` — 12 columns per architect spec (id, report_id, page_number, statement_section, row_order, code, label, period_current, value_current, period_prior, value_prior, unit, is_summary_row, extracted_at)
     - `CREATE TABLE IF NOT EXISTS bctc_balance_checks (...)` — 8 columns (id, report_id, statement_section, total_assets, total_liabilities, total_equity, balance_delta, balance_pass, checked_at)
     - `CREATE INDEX IF NOT EXISTS idx_btr_report ON bctc_table_rows(report_id, statement_section, row_order)`
     - `CREATE INDEX IF NOT EXISTS idx_btr_code ON bctc_table_rows(report_id, code)`
     - `CREATE INDEX IF NOT EXISTS idx_bbc_report ON bctc_balance_checks(report_id)`
   - Migration guard: wrap in `CREATE TABLE IF NOT EXISTS` pattern (idempotent; existing pattern in file)
   - Comment: `-- BT-3 BCTC table rows` (trace which feature introduced the table)

2. **Create `apps/mcp-server/src/interface/mcp/routes/pushBctcTableHandler.ts`** (NEW file)
   - Handler function: `async function handlePushBctcTable(req, res, db, body: any)`
   - Request validation: `report_id` must be UUID format (400 on invalid)
   - Logic:
     - `DELETE FROM bctc_table_rows WHERE report_id = ?` (idempotent)
     - Bulk INSERT into `bctc_table_rows` (from request `rows` array)
     - UPSERT into `bctc_balance_checks` (ON CONFLICT UPDATE pattern, or DELETE+INSERT for simplicity)
     - Return: `{ok: true, rows_stored: N}`
   - Error: catch + log + 500 (do not expose internal DB errors)

3. **Modify `apps/mcp-server/src/interface/mcp/server.ts`** (MODIFY: route dispatch)
   - Register new routes in the server's `if (method === "GET" && pathname.startsWith("/api/bctc-inspect/table/"))` block:
     - Add `if (method === "POST" && pathname === "/api/push-bctc-table")` → call `handlePushBctcTable()`

4. **Add tests** (`apps/mcp-server/__tests__/unit/pushBctcTableHandler.test.ts`, NEW)
   - In-memory SQLite DB (or setup/teardown)
   - Test: bulk-insert 10 rows, verify `SELECT COUNT(*) FROM bctc_table_rows WHERE report_id = ?` returns 10
   - Test: duplicate call for same `report_id`, second insert returns same count (idempotency)
   - Test: invalid UUID returns 400
   - Test: balance_check INSERT/UPSERT succeeds

### Acceptance Criteria

- **AC-1:** `bctc_table_rows` table exists in schema migration; `CREATE TABLE IF NOT EXISTS` pattern verified.
- **AC-2:** `bctc_balance_checks` table exists; one-to-one relationship w/ `financial_reports` (unique `report_id`).
- **AC-3:** Indexes on `(report_id, statement_section, row_order)` and `(report_id, code)` created (query performance, no lint errors).
- **AC-4:** `handlePushBctcTable` accepts JSON request w/ `report_id`, `rows[]`, `balance_check` object; validates UUID.
- **AC-5:** `POST /api/push-bctc-table` route registered in `server.ts`; handler called correctly.
- **AC-6:** Duplicate POST for same `report_id`: row count unchanged (DELETE+INSERT idempotency verified).
- **AC-7:** Bulk INSERT of ≥70 rows succeeds (FPT test case); `SELECT COUNT(*)` returns N.
- **AC-8:** Unit tests w/ in-memory DB: ≥3 scenarios (happy bulk-insert, duplicate idempotency, invalid UUID).

### Files to Stage & Commit
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` (MODIFY: add DDL)
- `apps/mcp-server/src/interface/mcp/routes/pushBctcTableHandler.ts` (CREATE)
- `apps/mcp-server/src/interface/mcp/server.ts` (MODIFY: register route)
- `apps/mcp-server/__tests__/unit/pushBctcTableHandler.test.ts` (CREATE)

**Post-commit check:** `git show --stat HEAD` lists only the 4 files above.

---

## BT-3i-B — [dev-mcp-server] Inspector GET Route + HTML Render

**Owner:** dev-mcp-server | **Duration:** ~2h | **Blockers:** BT-3i-A | **Depends on:** BT-3i-A

### Context
Build the read-side inspector: GET endpoint that fetches table rows + balance check, and the HTML/JS render that displays them next to the existing OCR text with a balance PASS/FAIL badge.

### Scope

1. **Modify `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts`** (ADD)
   - New handler: `async function handleBctcInspectTable(req, res, db, docId: string)`
   - Two queries:
     - Q1: `SELECT page_number, row_order, code, label, value_current, value_prior, unit, is_summary_row FROM bctc_table_rows WHERE report_id = ? ORDER BY row_order ASC`
     - Q2: `SELECT total_assets, total_liabilities, total_equity, balance_delta, balance_pass FROM bctc_balance_checks WHERE report_id = ?`
   - Response shape (TypeScript):
     ```typescript
     {
       doc_id: string,
       report_id: string,
       statement_section: string,
       period_current: string,
       period_prior: string | null,
       rows: BctcTableRow[],
       balance_check: BalanceCheck | null,
       has_table: boolean
     }
     ```
   - When `Q1` returns 0 rows: `{has_table: false, rows: [], balance_check: null}`
   - UUID validation: same guard as existing `/api/bctc-inspect/docs` (400 on invalid)

2. **Modify `apps/mcp-server/src/interface/mcp/server.ts`** (MODIFY: route dispatch)
   - Add route handler in dispatch block:
     ```typescript
     if (method === "GET" && pathname.startsWith("/api/bctc-inspect/table/")) {
       const docId = pathname.slice("/api/bctc-inspect/table/".length);
       handleBctcInspectTable(req, res, db, docId);
       return;
     }
     ```

3. **Modify `apps/mcp-server/src/interface/bctc-inspector.html`** (MODIFY: HTML + JS render)
   - ADD new `#table-section` div (between `.figures-section` and `#ocr-text-content`):
     ```html
     <div id="table-section" style="display:none">
       <div id="balance-badge"></div>
       <div id="table-content"></div>
     </div>
     ```
   - Add JS function `renderTable(data)`:
     - `data.has_table === false` → show placeholder "Table not yet extracted"
     - `data.balance_check.balance_pass === true` → green badge "PASS"; `false` → red "FAIL" w/ delta
     - Render `<table>` with columns: Code | Label | period_current-value | period_prior-value
     - Summary rows (`is_summary_row=true`) → `font-weight: bold`
     - Header rows (code=null) → `colspan` full width, `font-style: italic`
     - Format values: `value / 1e3` (show as billions w/ comma separator, matching existing `fmt()` helper)
   - Call `renderTable()` from existing OCR fetch callback (after `renderFigures`)

4. **Add tests** (`apps/mcp-server/__tests__/unit/bctcInspectHandler.test.ts`, MODIFY or CREATE)
   - Test: `GET /api/bctc-inspect/table/<valid-uuid>` returns 200 w/ expected shape
   - Test: `GET /api/bctc-inspect/table/<doc-without-rows>` returns `{has_table: false}` w/ 200 (not 404)
   - Test: invalid UUID returns 400
   - Test: balance_check badge logic (pass/fail, delta formatting)

### Acceptance Criteria

- **AC-1:** `GET /api/bctc-inspect/table/{doc_id}` (valid UUID) returns 200 w/ `{has_table: true, rows: [...], balance_check: {...}}`
- **AC-2:** `GET /api/bctc-inspect/table/{doc_id}` (no rows stored) returns 200 w/ `{has_table: false, rows: [], balance_check: null}` (not 404)
- **AC-3:** Invalid UUID returns 400 w/ error message
- **AC-4:** HTML `#table-section` div renders w/o JS errors; `display: none` initially, shown when table data exists
- **AC-5:** Summary rows (codes 100, 200, 270, 300, 400, 440) render w/ `font-weight: bold` (visual distinction from detail rows)
- **AC-6:** Balance badge shows green "PASS" when `balance_pass=true`, red "FAIL" when `false`; displays balance delta (in VND, formatted w/ commas)
- **AC-7:** `/api/bctc-inspect` page (main inspector HTML) loads w/o JS error; table section visible when data fetched
- **AC-8:** Unit tests: ≥4 scenarios (route 200/400, no-rows case, badge colors, summary-row formatting)

### Files to Stage & Commit
- `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` (MODIFY: add handleBctcInspectTable)
- `apps/mcp-server/src/interface/mcp/server.ts` (MODIFY: register GET route)
- `apps/mcp-server/src/interface/bctc-inspector.html` (MODIFY: add table-section div + renderTable JS)
- `apps/mcp-server/__tests__/unit/bctcInspectHandler.test.ts` (MODIFY or CREATE: add route tests)

**Post-commit check:** `git show --stat HEAD` lists only the 4 files above.

---

## BT-4 — [ops + dev-mainserver-crawls] Deploy Extractor to Main Server

**Owner:** ops + dev-mainserver-crawls | **Duration:** ~1h | **Blockers:** BT-2 only | **Depends on:** (can run in parallel with BT-3-A)

### Context
Confirm main-server CPU baseline (no GPU needed for TEXT path at 4s/page), add environment configuration, and verify the docker deployment is ready. This is light infra work gated on the architect blueprint (BT-2) but independent of dev code.

### Scope

1. **ops: Confirm CPU baseline**
   - Measure main-server CPU load + peak memory for 4s/page Tesseract × 80 pages (FPT balance sheet p4-7)
   - Verify GPU is NOT needed (TEXT path is CPU-feasible)
   - Document: CPU allocation sufficient for parallel extractions (if scheduler will batch multiple POSTs)

2. **Update Docker Compose (mcp-server service)**
   - Add env var: `MCP_SERVER_URL=http://mcp-server:3000` (pdf-extractor needs to know where to POST)
   - Verify: pdf-extractor service can reach mcp-server on the Docker network (service name alias)

3. **Verify internal networking**
   - `POST pdf-extractor:5001/extract-tables` from mcp-server is reachable (same Docker Compose network)
   - No external firewall changes needed (internal container-to-container)

4. **Binding: NO Mac in production**
   - Verify: main server is NOT the Mac eval box
   - Confirm: D6 invariant (kernel-panic risk, no heavy extraction on Mac prod)

### Acceptance Criteria

- **AC-1:** ops confirms main-server CPU baseline ≥ 4s/page Tesseract at nominal load
- **AC-2:** Docker Compose includes `MCP_SERVER_URL=http://mcp-server:3000` env var for pdf-extractor service
- **AC-3:** `POST pdf-extractor:5001/extract-tables` request from mcp-server container reaches pdf-extractor successfully (network test or simulation)
- **AC-4:** No GPU allocated to main-server pdf-extractor (TEXT path proof of no-GPU-needed)
- **AC-5:** D6 binding confirmed: production extractor host ≠ Mac eval machine

### Files to Stage & Commit
- `docker-compose.yml` (MODIFY: add env var if needed; ops owns this file)

**Post-commit check:** `git show --stat HEAD` lists only the 1 file (docker-compose.yml).

---

## BT-4b — [dev-pdf-extractor + ops] One-Shot Re-extraction of 14 Stranded Docs

**Owner:** dev-pdf-extractor (code) + ops (execution) | **Duration:** ~1.5h | **Blockers:** BT-3-C, BT-3i-B, BT-5 | **Depends on:** (all three must be in prod before this runs)

### Context
After the new table-extraction pipeline is live (BT-3 + BT-3i + BT-5), the 14 financial_reports rows that were inserted via the old parser path (pre-BT-1) need to be re-extracted ONCE using the new TEXT path so they get correct structured rows. This is a one-shot backfill, NOT a recurring cron.

### Scope

1. **Create `apps/mcp-server/src/application/usecases/bctcBatchTableBackfillJob.ts`** (NEW file, NOT cron)
   - Function: `async function backfillBctcTables(db, pdfDirPath, extractTableUrl)`
   - Logic:
     - Query: `SELECT id, pdf_path FROM financial_reports WHERE pdf_path IS NOT NULL AND pdf_path != ''`
     - For each row: `POST {extractTableUrl}/extract-tables` w/ `report_id` + `pdf_path`
     - Log: track success/fail per doc (do not crash on one failure; log and continue)
     - Return: `{success: N, failed: M, errors: [...]}`
   - Idempotent: the `POST /extract-tables` handler already DELETE+INSERTs per report_id, so re-running is safe

2. **ops: Run the backfill**
   - Trigger: AFTER BT-3-C + BT-3i-B + BT-5 all land in production
   - Timing: BEFORE BT-6 QA starts
   - Call: one-shot via mcp-server's internal API or a standalone script (ops owns execution)
   - Log the result: `{success: 14, failed: 0}` or similar (or fewer successes if some PDFs are unreadable)

### Acceptance Criteria

- **AC-1:** `bctcBatchTableBackfillJob` function exists; accepts `db`, `pdfDirPath`, `extractTableUrl` params
- **AC-2:** Iterates ALL `financial_reports` rows w/ non-NULL `pdf_path`; calls `POST /extract-tables` for each
- **AC-3:** Returns `{success: N, failed: M}` dict; does NOT crash if one doc fails (logs and continues)
- **AC-4:** After backfill: `SELECT COUNT(DISTINCT report_id) FROM bctc_table_rows` = 14 (or fewer if some PDFs unreadable; acceptable per design)
- **AC-5:** Running backfill twice leaves row counts unchanged (idempotency via DELETE+INSERT in `POST /extract-tables`)
- **AC-6:** Backfill triggers AFTER BT-3+BT-3i+BT-5 all land, BEFORE BT-6 QA (sequencing is the AC)

### Files to Stage & Commit
- `apps/mcp-server/src/application/usecases/bctcBatchTableBackfillJob.ts` (CREATE)

**Post-commit check:** `git show --stat HEAD` lists only the 1 file.

**Execution note:** ops does NOT commit backfill execution logs; ops simply runs the script and reports success/fail counts to WORK channel.

---

## BT-5 — [dev-pdf-extractor] Cross-Check Confidence Gate (Self-Hosted)

**Owner:** dev-pdf-extractor | **Duration:** ~2h | **Blockers:** BT-3-C, BT-4 | **Depends on:** BT-3-C (uses reconcile_figures logic)

### Context
Wire the `reconcile_figures` primitive (from BT-1) into the app layer so that when a table is extracted, summary-row figures are compared against the existing `financial_reports` scalars. If a ratio diverges >10×, block the push to mcp-server and emit a WORK alert.

### Scope

1. **Modify `apps/pdf-extractor/application/extract_tables_usecase.py`** (MODIFY)
   - In `ExtractTablesUseCase.execute()`:
     - After balance-check computation, extract summary-row codes (100, 270, 300, 400, 440) from the rows
     - For each summary row: call `reconcile_figures(extracted_value, api_bridge_value, tol=1.0)`
     - If ANY code returns `"shift"` (ratio > 10×): DO NOT call `table_push_client.push_table()`; instead log + send WORK alert
     - Set a `blocked_reason: "cross_check_fail"` field in the return dict
   - Returns: `{rows_stored: N, balance_pass: bool, balance_delta: float, blocked_reason: str | None}`

2. **Modify `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts`** (MODIFY: add blocked_reason field)
   - When returning `GET /api/bctc-inspect/table/{doc_id}`, check if a corresponding block entry exists (or query a `bctc_blocks` table)
   - Include `blocked_reason` in response (optional, only if blocked)

3. **Create a blocked-docs registry** (simple approach: add a `bctc_blocked_docs` table or store in `bctc_balance_checks`)
   - Track: which `report_id` was blocked and why
   - Query at GET time to surface the reason in the inspector

4. **Add tests** (`__tests__/unit/test_extract_tables_cross_check.py`, NEW)
   - Inject fake extractor that returns a row w/ code=100, value=1000 (extracted), but api_bridge=0.001 (ratio=1e6, >10×)
   - Verify: `reconcile_figures` returns `"shift"`, push is NOT called, `blocked_reason` set
   - Verify: WORK alert sent (mock the alert function)
   - Verify: re-running the same extraction again returns blocked (idempotent block)

### Acceptance Criteria

- **AC-1:** For each summary-row code (100, 270, 300, 400, 440), `reconcile_figures` is called w/ extracted value + api_bridge value
- **AC-2:** If ANY code ratio > 10×: push to mcp-server is BLOCKED; WORK alert sent w/ format "BT-5 cross-check FAIL: {report_id} code={code} ratio={ratio}"
- **AC-3:** `GET /api/bctc-inspect/table/{doc_id}` for a blocked report includes `blocked_reason: "cross_check_fail"` (or similar)
- **AC-4:** FPT 6 sentinels (BT-0-PICK decision): all reconcile to `"agree"` (ratio ≤ 1.0) → NOT blocked
- **AC-5:** Inject artificial 1000× shift → `reconcile_figures` returns `"shift"` → push blocked → WORK alert sent
- **AC-6:** Unit tests w/ mocked adapters: ≥2 scenarios (agree/pass, shift/block)
- **AC-7:** Sandbox exit-0; zero external API calls (IMAGE cross-check VLM = DEFERRED, self-hosted only, NOT activated)

### Files to Stage & Commit
- `apps/pdf-extractor/application/extract_tables_usecase.py` (MODIFY: add cross-check logic)
- `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` (MODIFY: include blocked_reason if applicable)
- `apps/pdf-extractor/__tests__/unit/test_extract_tables_cross_check.py` (CREATE)

**Post-commit check:** `git show --stat HEAD` lists only the 3 files above.

---

## BT-6 — [qa] QA Regression Gate

**Owner:** qa | **Duration:** ~3h | **Blockers:** BT-4b, BT-5 | **Depends on:** BT-4b (backfill done, all 14 docs extracted)

### Context
Run the full BT-0 evaluation harness on the 14-doc gold-set (not just FPT) to verify figure-accuracy meets the bar across the board, structured rows are stored + rendered correctly, balance checks pass, cross-check fires on deliberate shift, and frozen surfaces remain untouched.

### Scope

1. **Re-run BT-0 harness** on all 14 docs
   - Compute TEDS-Content + GriTS + cell-F1 vs gold table + figure-accuracy vs gold figures
   - Target: ≥95% accuracy within ±0.5% for each doc (BT-0-PICK bar MET on FPT; BT-6 proves wider)
   - Verify: VNM `net_profit` + DHG `revenue` sentinels still GREEN (regression anchors)

2. **Inspector verification**
   - For each of the 14 docs: `GET /api/bctc-inspect/table/{doc_id}` returns `{has_table: true, rows: [...]}`
   - Count: `SELECT COUNT(DISTINCT report_id) FROM bctc_table_rows` = 14 (or fewer if unreadable, acceptable)
   - Spot-check: select 3 docs (e.g., VNM, DHG, FPT) → render inspector in headless Playwright → verify table visible, balance badge present

3. **Balance check validation**
   - Verify: docs with balance sheets (FPT, etc.) have `balance_check.balance_pass` evaluated (not all docs have balance identity; e.g., income statements may not)
   - Verify: total Assets = Liabilities + Equity within 1 VND tolerance for balance-sheet docs

4. **Cross-check gate fire test**
   - Inject a deliberately bad value (e.g., 1000× multiplier on a summary row)
   - Verify: reconcile_figures blocks the push + WORK alert sent
   - Verify: inspector shows `blocked_reason`

5. **Frozen surface verification**
   - `pilot-status-pdf-extractor.json` diff = empty (no edit)
   - `dashboard/index.html`, `dashboard/traces.js`, `dashboard/trust-contract.spec.js` diff = empty
   - Verify: zero changes to these frozen files

6. **Baseline regression**
   - Run full pytest suite: expect ≥ baseline (no new fails)
   - Sandbox exit-0
   - `lint-imports` exit-0 (Fence-A/B KEPT)

7. **Security audit**
   - Verify: ZERO off-infra HTTP calls (only mcp-server:3000 internal POST)
   - Verify: zero creds in sandbox environment
   - Verify: no external API calls for cross-check (self-hosted only)

8. **Close QA-on-BT1**
   - Run: `pytest __tests__/unit/test_vn_number_normalize.py -v` (BT-1 tests)
   - Verify: 17 passed (3 per primitive, all scenarios green)
   - Mark: QA-on-BT1 green signal confirmed

### Acceptance Criteria

- **AC-1:** Re-run harness on full 14-doc gold-set: figure-accuracy ≥95% within ±0.5% for each doc (not just FPT)
- **AC-2:** VNM `net_profit` sentinel GREEN; DHG `revenue` sentinel GREEN (regression anchors held)
- **AC-3:** `SELECT COUNT(DISTINCT report_id) FROM bctc_table_rows` = 14 (or fewer if unreadable; acceptable)
- **AC-4:** `GET /api/bctc-inspect/table/{doc_id}` for each of the 14 docs returns `{has_table: true}` + rows visible in inspector
- **AC-5:** Balance badge rendered in inspector for docs w/ balance-check data (BS docs); null for non-BS docs
- **AC-6:** Cross-check fires on >10× shift: push blocked + WORK alert sent + inspector shows `blocked_reason`
- **AC-7:** `pilot-status-pdf-extractor.json` diff = empty (post-pilot, frozen)
- **AC-8:** `dashboard/index.html`, `traces.js`, `trust-contract.spec.js` diff = empty (frozen surfaces)
- **AC-9:** Baseline pytest ≥ prior count, no new fails; sandbox exit-0; lint-imports exit-0
- **AC-10:** Zero external HTTP calls; zero creds in env; no external-API cross-check (self-hosted only)
- **AC-11:** QA-on-BT1 confirmed: `pytest test_vn_number_normalize.py -v` = 17 passed

### Deliverables
- **`qa-bctc-table-<UTC>.json`** (canonical QA output format) — versioned in `reports/` or `docs/signals/`

### Files to Stage & Commit
- (no new source files; QA runs tests on existing code + produces report file)
- `reports/qa-bctc-table-<UTC>.json` or `docs/signals/qa-bctc-table-<UTC>.json` (CREATE)

**Post-commit check:** `git show --stat HEAD` lists only the report file.

---

## BT-EXIT — [po] PO Sign-Off

**Owner:** po | **Blockers:** BT-6 | **Depends on:** BT-6 (QA regression gate closes)

### Context
Final PO verification: the user's complaint is CLOSED (live `/api/bctc-inspect` shows detected table + balance badge), privacy is audited, and all ACs from BT-0-EXIT through BT-6 are MET on REAL data.

### Scope

1. **Verify live `/api/bctc-inspect` viewer**
   - Open `http://localhost:3000/api/bctc-inspect`
   - Select a doc (e.g., VNM)
   - Confirm: LEFT pane shows rendered PDF; RIGHT pane shows STRUCTURED TABLE (not just OCR text) + balance PASS/FAIL badge
   - Confirm: the decimal-shift bug is now visible BY EYE (OCR says "0.000051 M VND", correct figure says "2,840,370 M VND", badge shows anomaly)

2. **Privacy audit**
   - Verify: ZERO off-infra data send (no external API calls, no PDF/image sent to third parties)
   - Verify: all extraction happens self-hosted (Tesseract on mcp-server Docker + BT-1 primitives)

3. **Sign-off decision matrix**
   - DONE CONDITION from `docs/handoffs/TASK_BCTC-TABLE.md`:
     1. Parse fix lands ✓ (BT-1 done)
     2. Phase-0 scoreboard covers all 14 docs, PO records pick ✓ (BT-0 + BT-0-PICK done)
     3. Winning extractor integrated + regression gate meets bar, deployed + live ✓ (BT-3/BT-3i/BT-4/BT-6 done)
     4. reconcile_figures cross-check blocks >10× ✓ (BT-5 done)
     5. Zero off-infra send ✓ (BT-6 AC-10, audit done)

4. **Main terminal commits in-tree work**
   - Stage + commit any in-tree PO-only notes (e.g., decision record in `docs/signals/` or `docs/po-decisions/`)

### Acceptance Criteria

- **AC-1:** User opens `http://localhost:3000/api/bctc-inspect` → list shows 14 docs w/ icons/names
- **AC-2:** Select VNM (or any doc w/ structural data) → LEFT = rendered PDF, RIGHT = structured table w/ balance badge
- **AC-3:** Balance badge: green "PASS" for balance-sheet docs w/ identity match; "FAIL" or null for non-BS docs
- **AC-4:** Privacy audit: zero external HTTP calls in extraction path (only mcp-server:3000 internal)
- **AC-5:** User complaint CLOSED: "bctc can extract correct result table for analyze" → table now extracted, stored, rendered
- **AC-6:** All DONE CONDITION items from handoff §BT-EXIT verified HONEST (not fabricated)

### Files to Stage & Commit
- (optional) `docs/signals/po-bctc-table-exit-signoff-<UTC>.json` or `docs/po-decisions/2026-05-25-bctc-table-exit.md` (if PO records reasoning)

**Post-commit check:** `git show --stat HEAD` lists only optional PO record files.

---

## WIP Enforcement & Dispatch Sequencing

**WIP limit: max 2 In Progress simultaneously.**

**Dispatch waves:**

1. **Wave 1 (BT-2):** Dispatch BT-2 (architect, design-only) → DONE immediately (no WIP consumption)
2. **Wave 2 (Parallel, WIP=2):**
   - Dispatch **BT-3-A** (dev-pdf-extractor) → IN-PROGRESS
   - Dispatch **BT-4** (ops) → IN-PROGRESS (ops is separate from dev WIP in the harness; if ops counts toward WIP, serialize)
   - **If ops counts toward WIP:** Serialize BT-3-A first, then BT-4 (safer)
3. **Wave 3:** When BT-3-A DONE → Dispatch **BT-3-B** (dev-pdf-extractor, blocked) → IN-PROGRESS
4. **Wave 4:** When BT-3-B DONE → Dispatch **BT-3-C** (dev-pdf-extractor) → IN-PROGRESS; in parallel dispatch **BT-3i-A** (dev-mcp-server schema, blocked on BT-3-C output structure but can code in parallel once BT-3-C logic is clear)
5. **Wave 5:** When BT-3-C DONE and BT-3i-A DONE → Dispatch **BT-3i-B** (dev-mcp-server render) → IN-PROGRESS
6. **Wave 6:** When BT-3i-B DONE → Dispatch **BT-5** (dev-pdf-extractor, cross-check) → IN-PROGRESS
7. **Wave 7:** When BT-5 DONE → Dispatch **BT-4b** (backfill, one-shot) → IN-PROGRESS
8. **Wave 8:** When BT-4b DONE → Dispatch **BT-6** (qa) → IN-PROGRESS
9. **Wave 9:** When BT-6 DONE → Dispatch **BT-EXIT** (po sign-off) → DONE

**Conflict check:** BT-3-A/B/C all touch `apps/pdf-extractor/` (same zone, same owner) → SERIAL. BT-3i-A/B touch `apps/mcp-server/` (same zone, same owner) → SERIAL, but different tables (bctc_table_rows vs routes) → minor potential for parallel, but schema must exist before handler can reference it → SERIAL is safer. BT-3-C vs BT-3i-A: different zones (pdf-extractor vs mcp-server), no shared files → PARALLEL OK.

---

## Handoff to Developers

**Next agent:** dev-pdf-extractor (BT-3-A first)

**All tasks ready to dispatch:** BT-2 complete → PM creates handoff docs (THIS FILE, sections above) → Main terminal spawns dev-pdf-extractor with BT-3-A handoff.
