# Handoff: BA-DOCLANG-SERIALIZE
**Sprint:** DOCLANG-SERIALIZE (Phase 1 BUILD)
**Zone:** `apps/pdf-extractor/`
**Size:** SPRINT-S
**Owner:** ba
**Created:** 2026-06-14T07:10:00Z
**Next:** architect

---

## 1. Requirements

### Functional Requirements

**FR-1: DocLangSerializer — infrastructure adapter**
DDD layer: **infrastructure**
A new class `DocLangSerializer` in `apps/pdf-extractor/infrastructure/doclang_serializer.py` that:
- Accepts a list of `ExtractedTableDTO` objects (from `application/dtos.py`) as input
- Emits a well-formed `.dclg.xml` string conforming to namespace `https://www.doclang.ai/ns/v0`, version `0.6`
- Maps `ExtractedTableDTO.headers` → one `<ched/>header_text` per column
- Maps each row in `ExtractedTableDTO.rows` → one `<fcel/>cell_text` per column, terminated with `<nl/>`
- Enforces the OTSL rectangular rule: every data row is padded to `len(headers)` columns before `<nl/>` (short rows get empty `<fcel/>` padding); surplus cells are NOT silently dropped but logged as a warning (structural defect visible to the validator)
- Wraps each table in `<table>...</table>`
- Wraps the full document in `<doclang xmlns="https://www.doclang.ai/ns/v0" version="0.6">...</doclang>` with an optional `<head>` block carrying `report_id` as `<custom>` metadata
- Does NOT emit `<location>` elements in Phase 1 (bbox geometry is not available from `ExtractedTableDTO`; see Blocker B-1)

**FR-2: Cross-page table continuation via `<thread>`**
DDD layer: **infrastructure** (mapping rule), **application** (data already stitched)
When the upstream `ExtractLayoutFirstUseCase` already stitches a cross-page table into a single `ExtractedTableDTO` (by inheriting the schema-page column schema on continuation pages), the serializer emits it as a single `<table>` with no threading needed — the stitching already happened at Tier 2.
When the upstream emits continuation tables as distinct `ExtractedTableDTO` objects with the same logical grouping (e.g., same `table_index`, multiple `page_number` values), the serializer emits them as two `<table>` elements sharing a `<thread thread_id="N"/>` following the DocLang split-structure pattern, separated by a `<page_break/>`.
Decision: architect must confirm which form the upstream actually produces (see Blocker B-2).

**FR-3: Emit `.dclg.xml` as additive output — never mutate `bctc_table_rows`**
DDD layer: **application** (wiring gate)
The serializer MUST NOT write to, replace, or gate the existing `bctc_table_rows` path. It is invoked as a side-effect-free transformation on the already-computed `ExtractedTableDTO` list from `ExtractPDFResponse.tables`. The existing `ExtractTablesUseCase` / `ExtractMdTablesUseCase` / `ExtractLayoutFirstUseCase` return paths are untouched.

**FR-4: Application-layer wiring — `DocLangSerializeUseCase`**
DDD layer: **application**
A thin use case `DocLangSerializeUseCase` (or a method on `ExtractTablesUseCase`) that:
- Receives `ExtractPDFResponse` (which already contains `.tables`)
- Calls `DocLangSerializer.serialize(tables) -> str`
- Calls an injected `DocLangWritePort.write(report_id, xml_str)` (see FR-5)
- Returns the path or content to the caller; does NOT raise on validation failure (validation is observability)

**FR-5: `DocLangWritePort` — write port**
DDD layer: **domain** (port interface), **infrastructure** (concrete adapter)
Domain port `DocLangWritePort` with a single method `write(report_id: str, xml_str: str) -> str` returning the output path.
Concrete adapter in Phase 1: `FilesystemDocLangWriteAdapter` that writes to a configurable output directory (default: same directory as the PDF, e.g., `<pdf_stem>.dclg.xml`). This adapter is injected at composition root (`main.py`).
A null/no-op adapter must also exist for test contexts where no filesystem write is needed.

**FR-6: `doclang validate` correctness gate in tests**
DDD layer: **interface** (test layer)
Every golden-file test must call `doclang.validate(path)` (XSD + Schematron) and assert zero errors. This is a correctness check on the serializer output only. It is NOT added to the extraction pipeline as a gate.

**FR-7: Golden-file tests — minimum 3 real-report fixtures**
DDD layer: **interface** (test layer)
Unit tests under `apps/pdf-extractor/__tests__/unit/test_doclang_serializer.py`:
- Fixture A: single-page table (FPT Q4 2025 B01-DN, captured from existing `fpt_q4_full_ocr.json`)
- Fixture B: multi-column BCTC table with Mã + Chỉ tiêu + two period columns (derived from any existing bctc_table_rows corpus row)
- Fixture C: cross-page table (two `ExtractedTableDTO` objects sharing `table_index`, different `page_number` values representing a stitched or threaded continuation)
- Each fixture asserts: (a) output is well-formed XML, (b) `doclang.validate()` passes, (c) a known cell value is present at the correct OTSL position

**FR-8: Regression guard — `bctc_table_rows` byte-for-byte clean**
DDD layer: **interface** (test / CI layer)
The existing test suite (`test_extract_tables_usecase.py`, `test_extract_md_tables_usecase.py`, `test_financial_reports_module.py`) must remain green after the serializer is introduced. No changes to existing push clients, domain models, or stored row schemas.

---

### Non-Functional Requirements

**NFR-1: `doclang` package is an acceptable new dependency**
Add `doclang` to `apps/pdf-extractor/requirements.txt` for both runtime (serializer) and test (`validate` calls). Confirm PyPI availability and that it does not conflict with existing numpy/Pillow/pymupdf pins (see Blocker B-3).

**NFR-2: Serializer is pure / stateless**
`DocLangSerializer` has no I/O, no DB calls, no HTTP. It is a pure transformation function. All I/O is in the `DocLangWritePort` adapter. This makes it trivially unit-testable and safe to call multiple times.

**NFR-3: XML character escaping**
All cell content is XML-escaped (`&`, `<`, `>`, `"`, `'`). Vietnamese diacritics (UTF-8) pass through unescaped (standard XML UTF-8). The spike's `_escape_xml` helper is the reference implementation.

**NFR-4: Performance — no overhead on extraction hot path**
`DocLangSerializer.serialize()` is a string-builder; target < 50 ms per typical BCTC document (< 200 rows total). No Tesseract, no rasterization, no network calls inside the serializer.

**NFR-5: `<location>` (bbox) deferred to Phase 2**
Phase 1 omits `<location>` on all elements. The extractor's `ExtractedTableDTO` carries no pixel bbox. If PEK geometry is ever surfaced in the DTO, `<location>` can be added in a later phase without breaking existing consumers.

---

## 2. Edge Cases

**EC-1: Empty table (zero rows, non-empty headers)**
A table with headers but no data rows must serialize as a `<table>` with only the header row (one `<ched/>` sequence + `<nl/>`). `doclang validate` should pass — no rows is valid OTSL.

**EC-2: Empty table (zero headers AND zero rows)**
Emit no `<table>` element for this entry (skip silently, log warning). An empty `<table>` tag with no OTSL cells is structurally invalid.

**EC-3: Row has MORE columns than headers**
Serialize the surplus cells as additional `<fcel/>` entries in that row (do not truncate). Log a warning with `(table_index, page_number, row_index, expected_cols, actual_cols)`. DocLang validator will fire the rectangular rule — this is intentional (surfaces real structural defects).

**EC-4: Row has FEWER columns than headers**
Pad with empty `<fcel/>` cells to reach `len(headers)` before `<nl/>`. This preserves the rectangular rule and keeps the output validator-clean for real padding gaps (common in BCTC summary rows).

**EC-5: Cell content is None or non-string**
Coerce to empty string `""` with a debug log. Never raise inside the serializer.

**EC-6: Single report, multiple tables on same page**
Each `ExtractedTableDTO` (unique `table_index`) becomes its own `<table>` block in the document. No merging. Sequential order matches `table_index` ascending.

**EC-7: Cross-page table — upstream stitches into one DTO vs. emits two**
See Blocker B-2. The serializer must handle BOTH: single stitched DTO (no thread needed) and two continuation DTOs (emit `<thread thread_id="N"/>` + `<page_break/>`).

**EC-8: Vietnamese special characters in cell values**
Mã số values are ASCII; Chỉ tiêu labels may contain full Vietnamese Unicode (e.g., `Lợi nhuận gộp về bán hàng và cung cấp dịch vụ`). These must round-trip losslessly through XML UTF-8 encoding. Golden-file Fixture B must contain at least one such label.

**EC-9: `report_id` not provided**
If `report_id` is `None` or empty, use `"unknown"` as the document identifier in `<custom>` metadata. Do not raise.

---

## 3. DDD Layer Map

| Component | DDD Layer | File / Path |
|---|---|---|
| `DocLangWritePort` (abstract) | domain | `domain/modules/financial_reports/ports.py` (add new port) |
| `DocLangSerializer` (pure transform) | infrastructure | `infrastructure/doclang_serializer.py` (new) |
| `FilesystemDocLangWriteAdapter` (I/O) | infrastructure | `infrastructure/doclang_serializer.py` (same file, second class) |
| `NullDocLangWriteAdapter` (test no-op) | infrastructure | same file |
| `DocLangSerializeUseCase` (thin orchestrator) | application | `application/doclang_serialize_usecase.py` (new) |
| Test: `test_doclang_serializer.py` | interface (tests) | `__tests__/unit/test_doclang_serializer.py` (new) |
| Wiring injection | application/composition root | `main.py` (add serializer construction + port injection) |
| `doclang` package | infrastructure (external dep) | `requirements.txt` (add) |

Existing files touched: `domain/modules/financial_reports/ports.py` (add port), `main.py` (add wiring). All other existing files are read-only.

---

## 4. Blockers

**B-1: `<location>` / bbox availability**
`ExtractedTableDTO` carries `page_number` and `table_index` but NO pixel bbox. Phase 1 spec says omit `<location>`. PO decision needed: is this acceptable for v0, or must the serializer expose a `bbox` extension point that Phase 2 fills in?
**Recommendation (BA):** Accept no `<location>` in Phase 1. The OTSL table structure validates without it. Add a `bbox_provider: Optional[Callable[[table_index, page_number], Tuple[int,int,int,int]]] = None` parameter to `DocLangSerializer.__init__` as a future hook — does not block Phase 1 ship.

**B-2: Cross-page continuation shape — upstream emits one DTO or two?**
`ExtractLayoutFirstUseCase` Tier 2 stitches cross-page tables into a single `stitched_markdown`. It is NOT clear whether this is reflected in `ExtractedTableDTO.rows` as a single merged list (one DTO, `page_number` = first page) or as two separate DTOs per page. Architect must inspect `ocr_unit()` output and `ExtractPDFResponse.tables` for a real multi-page report before specifying the threading strategy in FR-2.
**If single merged DTO:** no `<thread>` needed — just serialize as one `<table>`.
**If two DTOs:** emit paired `<table>` elements with matching `thread_id` and a `<page_break/>` between them.

**B-3: `doclang` PyPI package pinning and venv conflict check**
`doclang` must be installed in the pdf-extractor venv. The spike imported it successfully, but no pin is recorded. Architect must run `pip install doclang` in the venv and verify no conflict with `pymupdf>=1.23.0`, `numpy<2.0` (PEK ABI constraint), `Pillow>=10.2.0`. Output: a verified pin `doclang==X.Y.Z` for `requirements.txt`.

**B-4: Golden-file corpus — cross-page fixture sourcing**
Fixture C requires two `ExtractedTableDTO` objects representing a real cross-page table from the BCTC corpus. The existing `fpt_q4_full_ocr.json` fixture may not contain a confirmed cross-page case. Developer must either derive it from the live pipeline DB (via docker exec) or create a representative synthetic fixture with a comment explaining it is synthetic. PO/QA must confirm acceptance.

---

## 5. Out of Scope (Phase 1)

- `SPIKE-DOCLANG-AUTHORED-DOCS` (converting policies/protocols/flows/notebooks) — separate spike, gated behind this sprint ship
- Adding `doclang validate` as a CI gate on extraction output — SPIKE-DOCLANG-OTSL-OVERLAP proved net-new = 0; not justified
- `<location>` bbox coordinates — no geometry in current `ExtractedTableDTO`
- Row-level headers (`<rhed/>`) or merged cells (`<ucel/>`, `<lcel/>`, `<ecel/>`) — BCTC B01-DN tables are rectangular with no cell spans in Phase 1
- Prose / non-table content serialization (text sections, footnotes) — table-only in Phase 1

---

## 6. Acceptance Criteria

- [ ] **AC-1:** `DocLangSerializer.serialize(tables)` for any real BCTC extraction returns a string that `doclang.validate()` accepts with zero XSD and zero Schematron errors.
- [ ] **AC-2:** Running the full existing test suite (`pytest apps/pdf-extractor/__tests__/`) with the serializer installed returns the same green/red count as before the change (no new failures).
- [ ] **AC-3:** Golden-file test `test_doclang_serializer.py` — Fixture A (single-page FPT Q4 B01-DN table), Fixture B (multi-column Vietnamese BCTC table), Fixture C (cross-page continuation) — all pass `doclang.validate()` with zero errors.
- [ ] **AC-4:** `DocLangWritePort` is injected at composition root; `FilesystemDocLangWriteAdapter` writes a `<pdf_stem>.dclg.xml` file to the configured output dir; `NullDocLangWriteAdapter` used in tests.
- [ ] **AC-5:** QA verifies a live FPT Q1-2026 extraction (via `POST /extract-layout-first` or equivalent) emits a `.dclg.xml` file that passes `doclang validate` on the host without modifying any `bctc_table_rows` in the DB.
- [ ] **AC-6:** `bctc_table_rows` output is byte-for-byte regression-clean (verified by running the existing push-client test and confirming the DB row count and content are unchanged).
- [ ] **AC-7:** `doclang==X.Y.Z` pin is present in `requirements.txt` with no venv conflicts documented (verified by `pip check` in the pdf-extractor venv).

---

## 7. Architect Handoff Notes

- The spike `scripts/spike-doclang-otsl-overlap.py` contains a working `to_doclang_xml()` function and `_escape_xml()` helper. These are the reference implementation for `DocLangSerializer`. The developer MUST NOT re-implement from scratch — promote and harden the spike code.
- The spike used `ET.register_namespace("", DOCLANG_NS)` — the infrastructure adapter should use `xml.etree.ElementTree` or `lxml` for production (same approach as the spike; no extra dependency needed if `lxml` is not already present).
- Port interface to add in `domain/modules/financial_reports/ports.py`: one abstract method `write(report_id: str, xml_str: str) -> str`. This follows the existing `LayoutFirstPushClientPort` pattern in the same file.
- Wiring in `main.py`: construct `FilesystemDocLangWriteAdapter(output_dir=cfg.doclang_output_dir)`, inject into `DocLangSerializeUseCase`. The `doclang_output_dir` config key should default to `"."` (same dir as PDF) or a configurable env var.
- The `<custom>` block in `<head>` carrying `report_id` is informational only and does not affect validation. It can be structured as a plain text child or skipped entirely if it causes XSD issues — architect to decide.

---

## [Architect] Brownfield Findings

- **Zone:** `apps/pdf-extractor/`
- **BUILD-STANDARD:** lean (service already exists)
- **Design brief:** `docs/architecture-briefs/2026-06-14-arch-doclang-serialize.md`

### B-1: `<location>` / bbox — RESOLVED
`ExtractedTableDTO` (`application/dtos.py:31-36`) has exactly four fields: `table_index`, `headers`, `rows`, `page_number`. No geometry anywhere. Phase 1 omits `<location>` entirely. Hook: `bbox_provider: Optional[Callable[[int, int], Tuple[int, int, int, int]]] = None` on `DocLangSerializer.__init__` — always `None` in Phase 1, zero serializer rework for Phase 2.

### B-2: Cross-page DTO shape — RESOLVED (LOAD-BEARING)
`ocr_unit()` in `infrastructure/generic_md_table_extractor.py:3715-4015` stitches all pages of a logical unit into ONE `UnitOcrResult` dict in a single call — it is the use case that assembles ONE return dict per unit, never two DTOs per cross-page table. `ExtractLayoutFirstUseCase.execute()` does NOT emit `ExtractedTableDTO` objects — it returns a summary dict. `ExtractedTableDTO` comes exclusively from the old `ExtractPDFUseCase` (pdfplumber path).

**Serializer threading decision:** group input DTOs by `table_index`. Single-DTO group → single `<table>`, no thread. Multi-DTO group (same `table_index`, multiple `page_number` values) → paired `<table>` elements sharing `<thread thread_id="{table_index}"/>` and separated by `<page_break/>`. This handles both shapes without upstream changes.

### B-3: `doclang` dependency pin — RESOLVED
- `pip show doclang`: Version 0.6.0, Requires: lxml, saxonche, typer. **Zero numpy dependency.**
- `pip check`: "No broken requirements found."
- Live validation test passed: `doclang.validate()` returned `VALID` on a real BCTC table XML.
- **Pin for `requirements.txt`: `doclang==0.6.0`**
- **Container risk (RISK-1):** saxonche requires Java runtime. Validate calls are test-only; the production `DocLangSerializeUseCase.execute()` skips in-process validation (no JRE dependency in the hot path). CI runs validate from the host venv.
- **Install risk (RISK-2):** current venv is an editable install from the local doclang source tree. Dockerfile must install from PyPI or a wheel — developer to verify PyPI availability.

### B-4: Cross-page golden fixture — RESOLVED
Fixture C is a clearly-labelled synthetic fixture. No live DB query required. Two `ExtractedTableDTO` objects, `table_index=0`, `page_number=4` and `page_number=5`, same headers, different row slices. Comment: `# SYNTHETIC: represents cross-page B01-DN continuation. FPT Q4 2025 p4-5 shape. Manual construction from corpus row structure.`

### Verified paths
- `application/dtos.py:31-36` — `ExtractedTableDTO` shape (4 fields, no geometry)
- `application/dtos.py:63-89` — `ExtractPDFResponse.tables: list[ExtractedTableDTO]` (serializer input)
- `infrastructure/generic_md_table_extractor.py:3715-4015` — `ocr_unit()` single-DTO return shape
- `application/extract_layout_first_usecase.py:211-688` — does NOT produce ExtractedTableDTO
- `domain/modules/financial_reports/ports.py` — 16 existing ports; add `DocLangWritePort` as 17th
- `main.py:88-248` — composition root pattern (4 wiring lines needed)
- `infrastructure/config.py:11-31` — add `doclang_output_dir` field + env `DOCLANG_OUTPUT_DIR`
- `scripts/spike-doclang-otsl-overlap.py:225-275` — reference `_escape_xml()` + `to_doclang_xml()` to promote

### Risk flags
- **RISK-1 (saxonche/JRE):** validate call removed from production hot path; test-only
- **RISK-2 (editable install):** verify PyPI release or package wheel for Dockerfile
- **RISK-3 (DDD):** validate import inside use case; accept for Phase 1, extract to port in Phase 2
- **RISK-4 (thread grouping):** non-adjacent same-index DTOs → log WARNING, emit threaded regardless

### Scan clean: true

**NEXT: pm** — break into atomic developer tasks per DDD layer above.
**HANDOFF:** `docs/handoffs/BA-DOCLANG-SERIALIZE.md`
**PIPELINE:** continue
