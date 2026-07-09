# dev-pdf-extractor — Notebook

Zone: `apps/pdf-extractor/` | Stack: Python/FastAPI | DB: pdf_extractor.db (write)

**Runbook:** `docs/protocols/async-blocking-pattern.md` — asyncio.to_thread() for sync I/O, /health health-checks on overloaded services.

---

## Cycle 2026-07-09 — FACTORY-PDF-delete-deprecated-inspect

**Sprint:** SYSTEMIC-REMAKE-P1 | **Zone:** apps/pdf-extractor/ | **Size:** M | P1

### Deletion
Removed the deprecated `/inspect` viewer surface (SI-2/PI-2, superseded by mcp-server
`GET /api/bctc-inspect`, confirmed DONE-on-real-data since `ca955baf1` PO REOPEN-2
sign-off, actively developed since). Dropped `InspectionStore` import+construction+param
from `main.py`/`register_routes`; deleted 4 route closures in `handlers.py` (`GET /inspect`,
`/inspect/pdfs`, `/inspect/pdf/{doc_id}`, `/inspect/extraction/{doc_id}`, -135L incl. dead
`HTMLResponse`/`Response`/`Path`/`_VIEWER_HTML_PATH` imports); deleted
`infrastructure/inspection_store.py` + `interface/viewer.html`; deleted 3 tests-only-for-
this-surface files (72 tests); dropped now-unneeded `inspection_store=` stub kwarg from 3
unrelated call sites. Real extraction routes (`/extract`, `/extract-layout-first`,
`/extract-tables`, `/pek-extract`, etc.) untouched.

### RAW-verify
`grep` zero hits for InspectionStore/inspection_store/viewer.html. Live `create_app()` +
`TestClient`: `/health`→200, `/inspect`→404, `/inspect/pdfs`→404 (both were live before).
`pytest -q`: 12 failed/1016 passed/1 skipped — identical 12 pre-existing env failures
(A/B via git stash); 72-test drop = exactly the 3 deleted files. mypy: same pre-existing
env error as baseline. `handlers.py` 808→673L, `main.py` 280→271L.

### Commit
`47453d546` — chore(pdf-extractor): delete deprecated /inspect viewer surface

Zone health: no drift detected.

### Status
REVIEW → next_agent=ops (rebuild_required: true; ops rebuild+swap, then qa live-verify)

---

## Cycle 2026-07-09 — FACTORY-PDF-fix-application-infra-leak

**Sprint:** SYSTEMIC-REMAKE-P1 | **Zone:** apps/pdf-extractor/ | **Size:** M | P1 | epic: FACTORY-MAINTAINABILITY-2026-06 | BOUNDED-1 auto-pickup

### Fix
`doclang_serialize_usecase.py:18` imported concrete `infrastructure.DocLangSerializer`
directly — the only `from infrastructure` import in `application/`; import-linter only
fenced `domain.primitives`/`domain.modules`, so it passed CI silently. Added
`DocLangSerializerPort` Protocol (`domain/modules/financial_reports/ports.py`, sibling
to `DocLangWritePort`) typing the `.serialize(tables, report_id) -> str` surface;
retyped the usecase's `serializer` param to the Port, dropped the infrastructure
import. `main.py` composition root already wired the concrete `DocLangSerializer`
positionally — unchanged (Protocols are structural, no explicit `implements`).

### Port typing choice
`tables: List[Any]` not `List[application.dtos.ExtractedTableDTO]` — importing the
concrete DTO into `ports.py` would itself be a domain→application leak (file's own
header: "Zero imports from infrastructure/, application/, interface/"); matches every
sibling port's Dict/str generic-passthrough convention. mypy structurally accepts
`List[ExtractedTableDTO]` call-site args against `List[Any]` (Any is bidirectional).

### Import-linter contract
Added `Fence-C: source=application forbidden=infrastructure,interface` to
`pyproject.toml`. `lint-imports`: 3 kept / 0 broken (was 2/0) — this class of leak is
now caught by CI going forward.

### Tests
`test_doclang_serializer.py`: 13/13 pass (serializer/usecase logic untouched — type+
import change only). Full suite: 1013 pass/9 fail — A/B via `git stash`: identical 8
pre-existing env failures; 9th (timeout test) reproduced GREEN in isolation both times
(flake, unrelated file). mypy: same pre-existing package-name env error as baseline;
scoped mypy on the 2 changed files: 18 pre-existing errors, byte-identical before/after.

### Commit
`bfe92c225` — refactor(pdf-extractor/application): FACTORY-PDF-fix-application-infra-leak DocLangSerializerPort

Zone health: no drift detected.

### Status
REVIEW → next_agent=ops (rebuild_required: true; ops rebuild+swap, then qa live-verify)

---

## Cycle 2026-07-09 — FACTORY-PDF-split-generic-md-table

**Sprint:** SYSTEMIC-REMAKE-P1 | **Zone:** apps/pdf-extractor/ | **Size:** XL | P0 | epic: FACTORY-MAINTAINABILITY-2026-06 | BOUNDED-1 auto-pickup

### Refactor
Split the 4111L `generic_md_table_extractor.py` god-file into `infrastructure/
generic_md_table/` (constants, markdown_emit, grid_cleanup, ordinal_grid,
document_map, page_zoning, unit_ocr, extractor) behind a 164L thin re-export shim —
8 sequential commits, one sub-module per PR, verbatim moves (ast span extraction +
byte-diff verified against pre-move bodies at every stage). `_process_page` (the
largest method) split into 3 named stage helpers (Step A tokenize, Step A2
classify+measure, Steps C5-G per-region reconstruct+emit) while staying a bound
method (test seam: tests call/monkeypatch `extractor._process_page` directly).
`scripts/pdf-extractor-god-file-extract.py` (new, reusable) does the line-accurate
ast-based extraction/removal.

### RAW-verify
Baseline: `pytest -q` = 11 failed/1017 passed/1 skipped (pre-existing env-only —
no PDF fixtures/Tesseract/poppler in sandbox). Identical after every one of the 8
stages. Symbol-parity: AST-diffed the original module's 112 top-level names
(`c2069debd`, pre-split) vs the final shim's `dir()` — 0 missing (except 5 unused
stdlib typing re-exports), 0 extras. `test_generic_md_table_extractor.py`
(incl. AC-1 Fence-A check): 149/149 pass post-split. mypy: pre-existing
"not a valid Python package name" env error, confirmed identical via `git stash`.

### G12 sandbox gate — N/A
`pilot-status-pdf-extractor.json` status=DONE (closed 2026-05-24); the flow doc's
`sandbox_runner.py --tier=primitive/module` script does not exist in this repo
state (only `sandbox/` dashboard-trace tooling remains) — same stale-gate drift
flagged in the prior split cycle's Zone health note. pytest is the live DoD gate.

### Commits
`21686062b`..`f261bd4b6` (8 commits) — refactor(pdf-extractor): FACTORY-PDF-split-generic-md-table Stage 1/8..8/8

Zone health: G12 pilot-gate doc drift (flagged twice now, prior cycle + this one) —
still not fixed, needs PO/architect to update or retire the stale flow-doc section.

### Status
REVIEW → next_agent=qa (rebuild_required: true; ops rebuild+swap, then qa live-verify)
