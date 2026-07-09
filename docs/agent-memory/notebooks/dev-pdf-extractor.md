# dev-pdf-extractor — Notebook

Zone: `apps/pdf-extractor/` | Stack: Python/FastAPI | DB: pdf_extractor.db (write)

**Runbook:** `docs/protocols/async-blocking-pattern.md` — asyncio.to_thread() for sync I/O, /health health-checks on overloaded services.

---

## Cycle 2026-07-09 — FACTORY-PDF-split-extractLayoutFirst-execute

**Sprint:** SYSTEMIC-REMAKE-P1 | **Zone:** apps/pdf-extractor/ | **Size:** L | P1 | epic: FACTORY-MAINTAINABILITY-2026-06

### Refactor
`ExtractLayoutFirstUseCase.execute()` (~480L, Tier0→3 inline) split into 4 private
Tier methods per backlog approach: `_tier0_document_map` (46L), `_tier1_zone_pages`
(45L), `_tier2_ocr_and_stitch` (52L), `_tier3_invariant_gate` (68L). execute() is now
a 147L linear pipeline threading results, eval-push calls (stage1/2/3) kept at the
same logical points. Signature unchanged (report_id, pdf_path) → callers/handlers
untouched. Two per-unit sub-helpers added (`_zone_unit_pages` 110L, `_gate_check_unit`
117L) — required to keep the 4 Tier methods under the DoD's 120L cap without
touching gate/zoning logic (simplicity-gate Q2 exception: DoD-mandated, not
speculative). Dropped 2 pre-existing dead locals while relocating code (unused
`import os`, unused `unit_page_type`) — zero behavior change.

### RAW-verify (extraction output unchanged)
Built a fully-injected-fake harness (build_document_map_fn/zone_page_fn/ocr_unit_fn
+ mocked `pdf2image.convert_from_path`) exercising 3 branches: Tier0-abort,
Tier1-abort, happy-path (3 units → 1 pass, 1 quarantined via invariant-gate fail
[monotonic+orphan], 1 quarantined via ocr_error, 2 vision-verify markers via
whitelist gate). Captured JSON fingerprint of execute() return + push_layout call
args + all 3 eval_push_stage calls BEFORE the refactor, re-ran AFTER — `diff` empty
(byte-identical). Determinism of the harness itself confirmed via 2x repeat-run diff
pre-refactor.

### Tests
`pytest -q`: 1088 passed / 12 failed / 1 skipped — identical before and after
(confirmed via `git stash` that all 12 failures are pre-existing env issues
[PIL/Tesseract/poppler ABI] in files that do not import extract_layout_first_usecase).
mypy: pre-existing "pdf-extractor is not a valid Python package name" env error,
confirmed present on `git stash` (unrelated to this change).

### Commit
`c3f30df24` — refactor(pdf-extractor): split ExtractLayoutFirstUseCase.execute() into per-Tier methods

Zone health: G12 sandbox gate in `docs/agents/dev-pdf-extractor/flow/main.md` §Pilot
Hard Rule references a stale path (`sandbox_runner.py` at service root, `--scenario=all`)
— actual runner is `sandbox/runner.py` with a single-scenario `--scenario PATH` CLI.
Pilot status is DONE (closed 2026-05-24), so G12 is likely non-operative post-closure;
doc drift not fixed here (out of scope for this task) — flagging for PO/architect.

### Status
REVIEW → next_agent=ops (rebuild_required: true; ops rebuild+swap, then qa live-verify)

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
