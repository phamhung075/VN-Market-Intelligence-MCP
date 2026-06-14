# ARCH-DOCLANG-SERIALIZE — Technical Design Brief
**Sprint:** DOCLANG-SERIALIZE Phase 1
**Zone:** `apps/pdf-extractor/`
**BUILD-STANDARD:** lean (apps/pdf-extractor/ already exists)
**Date:** 2026-06-14
**Author:** architect

---

## 1. Blocker Resolutions (Brownfield Findings)

### B-1: `<location>` / bbox — RESOLVED

**Finding:** `ExtractedTableDTO` (defined in `application/dtos.py:31-36`) carries exactly four fields: `table_index: int`, `headers: list[str]`, `rows: list[list[str]]`, `page_number: int`. No pixel bbox field exists anywhere in the DTO or in any upstream data structure passed into it.

**Decision:** Phase 1 omits `<location>` entirely. Add `bbox_provider: Optional[Callable[[int, int], Tuple[int, int, int, int]]] = None` to `DocLangSerializer.__init__` as a hook; signature is `(table_index, page_number) → (x, y, w, h)`. In Phase 1 the hook is always `None` and the serializer skips `<location>` without branching in the cell-emit loop. Phase 2 wires a concrete provider that pulls from bctc_page_zones geometry — zero rework of the serializer core.

---

### B-2: Cross-page DTO shape — RESOLVED (LOAD-BEARING)

**Finding:** Reading `infrastructure/generic_md_table_extractor.py:ocr_unit()` (lines 3715-4015) end-to-end:

- `ocr_unit()` processes all pages in `unit["pages"]` inside a single function call, iterating `for page_num in sorted(pages_in_unit)`.
- Schema-page: emits the header row into `all_header_cells` once (first non-numeric band).
- Continuation pages: skip header detection, append data rows directly to `all_data_rows`.
- Returns ONE `UnitOcrResult` dict with `"page_numbers": [3, 4, 5, 6]` (all pages) and a single `"stitched_markdown"` string covering all pages.

**The use case (`extract_layout_first_usecase.py`) collects these results into `unit_ocr_results: List[Dict]`, one per logical unit, then pushes them via `LayoutFirstPushClientPort.push_layout()`.** It does NOT produce `ExtractedTableDTO` objects at all — the `ExtractLayoutFirstUseCase.execute()` return value is a summary dict `{units_total, units_passing, units_quarantined, pushed, ...}`.

**Critical inference:** `ExtractLayoutFirstUseCase` does NOT emit `ExtractPDFResponse.tables`. That field comes from `ExtractPDFUseCase` (the old pdfplumber path, `application/usecases.py`). There is no current code path that converts `unit_ocr_results` into `ExtractedTableDTO` objects.

**Consequence for DocLangSerializeUseCase:** The serializer's input (`ExtractedTableDTO` list) comes from the old pdfplumber use case output, not from the layout-first pipeline. For cross-page: if the old pipeline produces separate DTOs per physical page with the same `table_index`, the threading strategy applies. If it produces a single merged DTO spanning pages, no threading is needed.

**Decision for Phase 1:** The serializer MUST handle both shapes. The discriminant is: two DTOs sharing the same `table_index` value = threaded pair (emit `<thread thread_id="N"/>` + `<page_break/>`); single DTO = single `<table>`. This is a pure data shape test inside the serializer — no upstream code changes required.

**Threading implementation rule:** Before serializing, group the input list by `table_index`. Groups with one DTO → single `<table>`. Groups with two or more DTOs → paired `<table>` elements sharing `thread_id=table_index`, separated by `<page_break/>`. Thread IDs are the `table_index` value (already an int, stable within one document).

---

### B-3: `doclang` dependency pin — RESOLVED

**Finding from venv inspection:**
```
Name: doclang
Version: 0.6.0
Location: installed as editable from /Users/admin/.../doclang
Requires: lxml, saxonche, typer
```

**`pip check` output: "No broken requirements found."** Confirmed by running the validate API against a live BCTC table XML (returned `VALID`).

**doclang has zero numpy dependency** — its pyproject.toml only declares `lxml>=6.0.2`, `saxonche>=12.9.0`, `typer>=0.15.1`. There is no numpy ABI conflict with requirements-pek.txt (`numpy>=2.0.0,<2.3.0`). The two requirements files are independent install surfaces.

**Installed transitive deps:**
- lxml 6.1.1 — pure-C XML library, no numpy
- saxonche 13.0.0 — Saxon-HE Python wrapper (Schematron via Java bridge), no numpy
- typer 0.26.7 — CLI framework, no numpy

**Pin for requirements.txt:**
```
doclang==0.6.0
```

**Important production caveat:** the current venv install is editable (`__editable__.doclang-0.6.0.pth`), pointing to the local doclang source tree. For the Dockerfile (container), the pin must be `doclang==0.6.0` installing from PyPI (or the local wheel if doclang is not on PyPI yet). Developer must verify PyPI availability and fall back to `pip install -e /path/to/doclang` or a wheel if needed. saxonche requires the Java runtime — the Dockerfile must confirm `java -version` succeeds inside the container or install a JRE. This is a container-build concern, not a host-dev concern.

---

### B-4: Cross-page golden fixture — RESOLVED

**Finding:** The live DB query path via `docker exec` is confirmed working in the spike script (`scripts/spike-doclang-otsl-overlap.py:91-106`). However, the spike pulls from `bctc_table_rows`, not from `ExtractedTableDTO` objects — which is the serializer's actual input contract.

**Decision:** Fixture C is a clearly-labelled **synthetic fixture**. It consists of two `ExtractedTableDTO` objects with `table_index=0`, `page_number=4` and `table_index=0`, `page_number=5` respectively, sharing a common schema (same headers, each with a partial slice of a real BCTC B01-DN table). The fixture comment must state: `# SYNTHETIC: represents a cross-page B01-DN continuation. FPT Q4 2025 p4-5 shape. Source: manual construction from corpus row structure.` QA accepts synthetic per BA handoff §4 B-4 ("create a representative synthetic fixture with a comment explaining it is synthetic").

---

## 2. DDD Layer Design

### 2.1 Files — exact paths

**READ-ONLY (no changes):**
- `application/dtos.py` — `ExtractedTableDTO`, `ExtractPDFResponse` (input types)
- `application/extract_layout_first_usecase.py` — existing pipeline, not touched
- `application/extract_tables_usecase.py` — existing pipeline, not touched
- `infrastructure/config.py` — read pattern only (new field added)
- `main.py` — read pattern only (wiring added)

**MODIFY (additive only):**
- `domain/modules/financial_reports/ports.py` — add `DocLangWritePort` Protocol (new port, ~15 lines)
- `infrastructure/config.py` — add `doclang_output_dir: str` field with env `DOCLANG_OUTPUT_DIR`, default `"/app/data/doclang"`
- `main.py` — add 3 import lines + 4 wiring lines (composition root injection)
- `requirements.txt` — add `doclang==0.6.0` line

**CREATE (new files):**
- `infrastructure/doclang_serializer.py` — `DocLangSerializer`, `FilesystemDocLangWriteAdapter`, `NullDocLangWriteAdapter`
- `application/doclang_serialize_usecase.py` — `DocLangSerializeUseCase`
- `__tests__/unit/test_doclang_serializer.py` — 3 fixtures + AC assertions

### 2.2 Domain layer — `DocLangWritePort`

Add to `domain/modules/financial_reports/ports.py` as the 17th port:

```python
class DocLangWritePort(Protocol):
    """
    Port for writing a serialized DocLang XML document to storage (DOCLANG-SERIALIZE).

    DDD: domain port — zero infrastructure imports. Pure Protocol.
    Concrete adapters:
        - infrastructure/doclang_serializer.FilesystemDocLangWriteAdapter (production)
        - infrastructure/doclang_serializer.NullDocLangWriteAdapter (tests)
    """

    def write(self, report_id: str, xml_str: str) -> str:
        """
        Persist the XML string and return the output path.

        Args:
            report_id: UUID string matching financial_reports.id. Used as filename stem.
            xml_str:   Complete well-formed .dclg.xml string.

        Returns:
            Absolute path to the written file (e.g. "/app/data/doclang/<report_id>.dclg.xml").

        Contract:
            - Must NOT raise on I/O failure — catch, log, return empty string.
            - Must NOT modify bctc_table_rows or any other DB table.
            - Thread-safe: each call writes to a unique path (report_id stem).
        """
        ...
```

### 2.3 Infrastructure layer — `doclang_serializer.py`

Three classes in one file:

**`DocLangSerializer`** (pure transform — no I/O, no state beyond `bbox_provider`):
- Constructor: `__init__(self, bbox_provider=None)` — stores optional hook
- Method: `serialize(self, tables: list[ExtractedTableDTO], report_id: str = "unknown") -> str`
- Internal method: `_serialize_group(self, group: list[ExtractedTableDTO], thread_id: Optional[int]) -> list[str]` — emits one or two `<table>` elements
- Internal static: `_escape_xml(text: str) -> str` — promoted from spike (`&`, `<`, `>`, `"`, `'`)
- Threading: groups input by `table_index`, then processes groups in ascending order
- Wraps output in `<doclang xmlns="{DOCLANG_NS}" version="0.6"><head><custom>report_id={report_id}</custom></head>…</doclang>`
- Does NOT import `doclang` package — purely stdlib `xml.etree.ElementTree` for building the string (same approach as spike)

**Note on `<head><custom>`:** The spike used XML comments for metadata. The BA spec says use `<custom>` in `<head>`. Architect decision: use `<custom>report_id={report_id}</custom>` as plain text child. If XSD validation rejects `<head>` or `<custom>` in the docroot, fall back to an XML comment (confirmed by running `doclang.validate()` in tests — developer must test this). The spike already has `validate()` working with a comment-only approach; `<head>` is a v0.6 schema element that should be valid.

**`FilesystemDocLangWriteAdapter`** (implements `DocLangWritePort`):
- Constructor: `__init__(self, output_dir: str)`
- Method `write(self, report_id: str, xml_str: str) -> str`:
  - Creates `output_dir` if absent (os.makedirs)
  - Writes to `os.path.join(output_dir, f"{report_id}.dclg.xml")`
  - Returns path; logs error on IOError and returns `""`

**`NullDocLangWriteAdapter`** (implements `DocLangWritePort`):
- `write(self, report_id: str, xml_str: str) -> str` → returns `""` (no-op, test only)

### 2.4 Application layer — `doclang_serialize_usecase.py`

```python
class DocLangSerializeUseCase:
    def __init__(
        self,
        serializer: DocLangSerializer,
        write_port: DocLangWritePort,
    ) -> None: ...

    def execute(
        self,
        response: ExtractPDFResponse,
        report_id: Optional[str] = None,
    ) -> str:
        """
        Serialize all tables in response to DocLang XML and write via port.
        Returns: output path from write_port (empty string on write failure).
        Never raises. Logs validation result as INFO (not a pipeline gate).
        """
        rid = report_id or response.document_id or "unknown"
        xml_str = self._serializer.serialize(response.tables, report_id=rid)
        path = self._write_port.write(rid, xml_str)
        # Validation observability (AC-1): log but do not gate
        try:
            from doclang import validate, ValidationError
            import tempfile, os
            with tempfile.NamedTemporaryFile(suffix=".dclg.xml", mode="w", encoding="utf-8", delete=False) as f:
                f.write(xml_str); tmp = f.name
            try:
                validate(tmp, allow_empty_namespace=False)
                logger.info("DocLangSerializeUseCase: validate OK report_id=%s path=%s", rid, path)
            except ValidationError as e:
                logger.warning("DocLangSerializeUseCase: validate FAIL report_id=%s errors=%s", rid, e.xsd_errors + e.schematron_errors)
            finally:
                os.unlink(tmp)
        except Exception as exc:
            logger.warning("DocLangSerializeUseCase: validate error (non-fatal): %s", exc)
        return path
```

**DDD note:** `DocLangSerializeUseCase` imports `doclang` ONLY inside the validation block — this is an infrastructure detail inside the application layer. Strict DDD would push the validation call to a `DocLangValidatePort`. For Phase 1 this is acceptable (observability only, not a gate); Phase 2 can extract the port if needed.

### 2.5 Composition root — `main.py` additions

Add after the `extract_layout_first_usecase` block:

```python
# --- DOCLANG-SERIALIZE: DocLang XML serializer (additive output only) ---
from infrastructure.doclang_serializer import (
    DocLangSerializer,
    FilesystemDocLangWriteAdapter,
)
from application.doclang_serialize_usecase import DocLangSerializeUseCase

_doclang_serializer = DocLangSerializer(bbox_provider=None)  # Phase 1: no geometry
_doclang_write_adapter = FilesystemDocLangWriteAdapter(
    output_dir=cfg.doclang_output_dir
)
doclang_serialize_usecase = DocLangSerializeUseCase(
    serializer=_doclang_serializer,
    write_port=_doclang_write_adapter,
)
```

Register `doclang_serialize_usecase` in `register_routes()` call (pass as kwarg). The handler on `POST /extract-layout-first` or `POST /extract` can call it after the main use case — additive, never blocking.

**`Config` field addition** (`infrastructure/config.py`):
```python
doclang_output_dir: str
# in from_env():
doclang_output_dir=os.getenv("DOCLANG_OUTPUT_DIR", "/app/data/doclang"),
```

---

## 3. Serializer XML Structure (canonical form)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<doclang xmlns="https://www.doclang.ai/ns/v0" version="0.6">
  <head><custom>report_id=abc-123</custom></head>
  <!-- Single-page or single merged DTO: table_index=0 -->
  <table>
    <ched/>Mã<ched/>Chỉ tiêu<ched/>31/12/2025<ched/>31/12/2024<nl/>
    <fcel/>100<fcel/>Tài sản ngắn hạn<fcel/>1000.0<fcel/>900.0<nl/>
    <fcel/>110<fcel/>Tiền và tương đương tiền<fcel/>200.0<fcel/>150.0<nl/>
  </table>
  <!-- Cross-page: two DTOs sharing table_index=1 -->
  <table>
    <thread thread_id="1"/>
    <ched/>Mã<ched/>Chỉ tiêu<ched/>31/12/2025<ched/>31/12/2024<nl/>
    <fcel/>200<fcel/>Tài sản dài hạn<fcel/>5000.0<fcel/>4800.0<nl/>
  </table>
  <page_break/>
  <table>
    <thread thread_id="1"/>
    <ched/>Mã<ched/>Chỉ tiêu<ched/>31/12/2025<ched/>31/12/2024<nl/>
    <fcel/>210<fcel/>Phải thu dài hạn<fcel/>300.0<fcel/>290.0<nl/>
  </table>
</doclang>
```

**Rectangular rule enforcement:**
- Short row (< len(headers)): pad with empty `<fcel/>` to reach column count, no log needed (common in BCTC summary rows)
- Long row (> len(headers)): serialize surplus cells as additional `<fcel/>`, log WARNING with `(table_index, page_number, row_index, expected_cols, actual_cols)`
- None/non-string cell: coerce to `""`, log DEBUG

---

## 4. Test Strategy

### 4.1 Golden-file fixtures

File: `__tests__/unit/test_doclang_serializer.py`
Uses `NullDocLangWriteAdapter` for all unit tests (no filesystem I/O).

**Fixture A — Single-page FPT Q4 B01-DN table:**
Source: existing `fpt_q4_full_ocr.json` (look up path from existing tests). One `ExtractedTableDTO` with `table_index=0`, `page_number=4`, headers `["Mã", "Chỉ tiêu", "31/12/2025", "31/12/2024"]`, 5+ rows with real code/label values.
Asserts: (a) well-formed XML (`xml.etree.ElementTree.fromstring()` does not raise), (b) `doclang.validate()` passes, (c) cell value `"Tổng cộng tài sản"` appears exactly once in XML output.

**Fixture B — Multi-column Vietnamese BCTC table with diacritics:**
Source: inline synthetic with at least one Vietnamese diacritic label (e.g. `"Lợi nhuận gộp về bán hàng và cung cấp dịch vụ"`). Four columns, 3 data rows. Must confirm UTF-8 round-trip.
Asserts: (a) well-formed XML, (b) `doclang.validate()` passes, (c) the Vietnamese label appears verbatim in output (`"Lợi nhuận gộp về bán hàng và cung cấp dịch vụ"` in xml_str).

**Fixture C — Cross-page synthetic:**
Two `ExtractedTableDTO` objects: `table_index=0, page_number=4` and `table_index=0, page_number=5`, each with the same headers, each with a different data slice.
```python
# SYNTHETIC: represents a cross-page B01-DN continuation.
# FPT Q4 2025 p4-5 shape. Source: manual construction from corpus row structure.
```
Asserts: (a) well-formed XML, (b) `doclang.validate()` passes, (c) output contains `<thread thread_id="0"/>` exactly twice, (d) output contains `<page_break/>` exactly once.

### 4.2 Edge-case tests (same file)

- EC-2 (empty table, 0 headers + 0 rows): assert table element NOT emitted, assert validate passes
- EC-4 (short row): assert output is padded, assert validate passes
- EC-3 (long row): assert surplus cells present, assert WARNING logged

### 4.3 Regression guard

Running `pytest apps/pdf-extractor/__tests__/unit/test_extract_tables_usecase.py test_extract_md_tables_usecase.py test_financial_reports_module.py` must produce zero new failures. No existing file is modified except the additive changes above.

---

## 5. Additive-Only Guarantee

Proof chain that `bctc_table_rows` is never touched:

1. `DocLangSerializer.serialize()` — pure string builder, no imports beyond stdlib
2. `FilesystemDocLangWriteAdapter.write()` — only `open()` for filesystem write, no DB connection
3. `DocLangSerializeUseCase.execute()` — calls serializer then write_port; no `TablePushClientPort`, no `LayoutFirstPushClientPort`, no `bctc_table_rows` SQL path
4. Composition root — `doclang_serialize_usecase` is an independent object; it does not share any port that touches `bctc_table_rows`
5. Test: AC-6 — existing push-client test runs before and after, row count must match byte-for-byte

---

## 6. Spike Promotion

`scripts/spike-doclang-otsl-overlap.py` contains `to_doclang_xml()` (line 230) and `_escape_xml()` (line 225). These are the reference implementation.

**Promote rules for developer:**
- `_escape_xml()` → promoted verbatim as `DocLangSerializer._escape_xml()` static method (no change)
- `to_doclang_xml()` → promoted and hardened into `DocLangSerializer._serialize_group()`:
  - Add rectangular-rule pad logic (spike had a TODO/comment: "we do NOT force-pad here")
  - Add per-row WARNING log for surplus cells
  - Add `None` coercion with DEBUG log
  - Add `thread_id` parameter and `<thread thread_id="N"/>` emission for cross-page groups
  - Remove the XML comment metadata (replace with `<head><custom>` block in outer `serialize()`)
  - Remove `xmlns` attribute from inner `<doclang>` element (it now wraps the whole document output at the outer level)

The developer MUST NOT re-implement from scratch.

---

## 7. Risk Flags

**RISK-1 (CONTAINER): saxonche / Saxon-HE JRE dependency.**
`doclang.validate()` uses `saxonche` (Saxon-HE Python wrapper) which requires a Java runtime. If the `pdf-extractor` Docker image does not have a JRE, `doclang.validate()` will fail at runtime. Scope: test-only path (AC-6 runs in CI, not in the container pipeline). Developer must either: (a) add `openjdk-17-jre-headless` to the Dockerfile, or (b) limit `doclang.validate()` calls to host-dev tests only and skip the validate call inside `DocLangSerializeUseCase.execute()` when running in the container. Decision: **skip the in-process validate call in `DocLangSerializeUseCase.execute()` for now — the production serializer emits XML without validating; CI tests call validate from the host venv which has the JRE via saxonche.**

**RISK-2 (EDITABLE INSTALL): doclang installed as editable from a sibling project directory.**
The current venv has `__editable__.doclang-0.6.0.pth` pointing to `/Users/admin/.../doclang`. The Dockerfile must install from PyPI or a packaged wheel. If doclang is not on PyPI, developer must package it (`python -m build`) and COPY the wheel into the image. This is a build-time concern outside the serializer implementation.

**RISK-3 (DDD): Application layer imports infrastructure (`doclang`).**
The validation call inside `DocLangSerializeUseCase.execute()` imports `doclang` — an infrastructure package. For Phase 1 this is accepted (observability only, no port abstraction). If this causes import-linter failures, remove the validate call from the use case entirely (move it to the test layer only). AC-1 / AC-5 cover this via the test suite.

**RISK-4 (THREAD GROUPING): two ExtractedTableDTOs with same `table_index` on non-adjacent pages.**
The threading logic groups by `table_index`. If a document has two DTOs with `table_index=0` that are NOT a continuation pair (e.g. two separate tables with the same index from a bug upstream), the serializer would incorrectly thread them. The developer should add an assertion/log that flags same-index DTOs with non-consecutive page numbers. This is a data quality issue, not a serializer bug — log WARNING and emit as threaded regardless.

**RISK-5 (PERFORMANCE): saxonche cold-start.**
`saxonche` Saxon-HE init takes ~200-400ms on first call. The validate call in tests is fine. If validate is ever called in the hot extraction path, this will violate NFR-4 (< 50 ms). RISK-1 mitigation already removes validate from the hot path — this is belt-and-suspenders confirmation.

---

## 8. G12 DoD Gate

- [ ] `doclang==0.6.0` added to `requirements.txt`; `pip check` clean
- [ ] `DocLangWritePort` added to `domain/modules/financial_reports/ports.py` (port count in docstring updated to 17)
- [ ] `infrastructure/doclang_serializer.py` created with all three classes
- [ ] `application/doclang_serialize_usecase.py` created
- [ ] `Config.doclang_output_dir` added; default `/app/data/doclang`
- [ ] `main.py` wired (3 imports + 4 construction lines)
- [ ] `__tests__/unit/test_doclang_serializer.py` — Fixtures A/B/C all pass `doclang.validate()` with zero errors
- [ ] `pytest apps/pdf-extractor/__tests__/unit/test_extract_tables_usecase.py test_extract_md_tables_usecase.py test_financial_reports_module.py` — no new failures
- [ ] AC-5 verified: POST to extract endpoint produces `.dclg.xml` file in `DOCLANG_OUTPUT_DIR`, DB row count unchanged

---

## 9. Scope Boundary Confirmation

Out of scope (confirmed not touched):
- `bctc_table_rows` schema, push clients, or any extraction gate
- `extract_layout_first_usecase.py` — read-only reference
- PEK adapter, eval adapters, inspection store, OCR backends
- Any existing test files (all existing tests pass as-is)
