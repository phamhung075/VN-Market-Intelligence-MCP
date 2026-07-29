# Decision Journal — Sprint FACTORY-PDF-split-handlers · dev-pdf-extractor

**Sprint goal:** Split `interface/handlers.py` (schemas, run-helpers, thin
routes) — pure structural move, no behavior change, each resulting file
≤120L per zone convention.
**Agent:** dev-pdf-extractor
**Started:** 2026-07-29T01:20:00Z

---

### STEP dev-pdf-extractor-S1 · dev-pdf-extractor · 2026-07-29T01:31:05Z
**task-id:** FACTORY-PDF-split-handlers
**what-done:** Re-read the live 750L `handlers.py` (task-mint estimate was
stale, per task's own caveat) — found `register_routes()` alone spans ~460L
across 8 route closures, so the brief's literal 3-file plan (schemas.py,
run_helpers.py, thin handlers.py) could not fit any file under 120L.
**what-considered:**
- Brief's literal 3-file split — rejected, register_routes() alone is 4x
  the ceiling even after schemas+helpers extraction.
- Per-domain-area split: one `register_<area>_routes(router, ...)` module
  per route group, handlers.py reduced to pure delegation. Chosen.
**why-decision:** Only option that hits ≤120L/file without gutting
docstrings (which carry real institutional context — event-loop-isolation
rationale, ECHO-vs-DB contract, etc. — not safe to delete just to hit a
line count).
**why-change:** File layout differs from the brief's named 3 files; see
S2 for the exact resulting layout and why 2 pieces (pek route + its
background runner) could not leave `interface.handlers`'s dotted path.

---

### STEP dev-pdf-extractor-S2 · dev-pdf-extractor · 2026-07-29T01:31:05Z
**task-id:** FACTORY-PDF-split-handlers
**what-done:** Before moving anything, grepped the whole test suite for
hidden couplings to `interface.handlers`'s dotted module path (not just
route paths/status/shapes — the DoD's real invariant). Found two:
(1) `scenarios/pek_single_doc_extraction.py` patches
`"interface.handlers.is_vn_market_open_utc"` 4x — a string-path patch that
only takes effect if the `/pek-extract` closure's global lookup of that
name resolves inside the `interface.handlers` module object; (2)
`__tests__/test_pek_engine_adapter.py` asserts on
`logging.getLogger("interface.handlers")` (2x) because `_run_pek_extract`
logs via `getLogger(__name__)`, and `__name__` is fixed to whichever module
the function body textually lives in.
**what-considered:**
- Leave pek route + `_run_pek_extract` inside `handlers.py` untouched —
  would keep those 2 test couplings intact for free, but leaves
  `handlers.py` at ~195L (76L `_run_pek_extract` docstring + 58L pek route),
  failing the ≤120L DoD.
- Move both out to `interface/routes_pek.py` +
  `interface/pek_run_helper.py` (their own files, since combined they still
  exceed 120L) AND update the 3 test files' patch-target strings / import
  paths / logger names to the new module paths. Chosen.
**why-decision:** Retargeting a test's mock-path string to follow code it
mocks is a standard, behavior-preserving part of a code move — the tests
still verify the exact same real runtime behavior (I confirmed by running
them before/after), whereas leaving the row over the line-count DoD is not
an option the task allows without justification, and the alternative
(gutting docstrings) destroys real content for no functional reason.
**why-change:** Router prompt's file list said only `handlers.py`; I also
touched 3 test files
(`__tests__/test_pek_engine_adapter.py`,
`__tests__/unit/test_pek_extract_handler_nonblocking.py`,
`scenarios/pek_single_doc_extraction.py`) — mechanical string retargets
only (import path, `logging.getLogger(...)` name, `patch(...)` target),
zero assertion/logic changes, verified via full-suite before/after diff.

---

### STEP dev-pdf-extractor-S3 · dev-pdf-extractor · 2026-07-29T01:31:05Z
**task-id:** FACTORY-PDF-split-handlers
**what-done:** Landed the split at 12 files (1 domain constant + 11
interface files incl. the rewritten `handlers.py`), all ≤120L (max 103L,
`interface/schemas.py`). `valid_sections` allow-set moved to
`domain/constants.py::STATEMENT_SECTIONS` (frozenset); `handlers.py`'s
`ExtractTablesRequestSchema.validate_section()` now reads it — grepped
repo-wide first, confirmed `valid_sections`/`validate_section` had no
external callers besides the one internal call site.
**what-considered:** only path for the domain-constant move — brief was
explicit ("move the allow-set to a domain constant"); `domain/constants.py`
is a new file since no existing constants module existed in this service
(checked `domain/*.py` — models.py/errors.py/repositories.py/services.py,
none fit).
**why-decision:** Matches DDD convention already used in this service
(domain/errors.py, domain/primitives/*) — small, single-purpose domain
module, no infra/interface imports.
**why-change:** No change from plan on this piece.

---

### STEP dev-pdf-extractor-S4 · dev-pdf-extractor · 2026-07-29T01:31:05Z
**task-id:** FACTORY-PDF-split-handlers
**what-done:** Verification. Baseline `python -m pytest -q` (after
installing the missing-but-declared `pymupdf` dep into `.venv` so
collection didn't hard-fail): **10 failed / 1032 passed / 3 skipped**.
Post-split: identical **10 failed / 1032 passed / 3 skipped**, same 10
test IDs both runs (all pre-existing env-only: missing
`/app/data/pdfs/*.pdf` fixtures + local tesseract/OCR gaps — confirmed via
`git stash`/`stash pop` A/B, zero diff attributable to my change). One
extra flake surfaced only when running a narrow pek-test subset in
isolation (`test_extract_layout_and_tables_raises_on_timeout`) — reproduced
identically on stashed (pre-change) code with the same subset, and does
not appear in the full-suite run either before or after; this exact flake
is independently documented in the prior
`sprint-FACTORY-PDF-extract-tesseract-config-dev-pdf-extractor.md` journal
(S4/equivalence section) as a known pre-existing order-dependent flake in
`infrastructure/pek_engine_adapter.py`'s timeout mechanic — unrelated to
this task's files. mypy: same pre-existing "pdf-extractor is not a valid
Python package name" env error as baseline (also matches that prior
journal). `register_routes()` route table verified identical pre/post via
a live `FastAPI()`+`APIRouter()` smoke (12 routes, all 8 original paths
present, same set).
**what-considered:** only path — DoD requires before/after diff, not just
a single green run.
**why-decision:** N/A (verification step).
**why-change:** No change from plan.

---

### STEP dev-pdf-extractor-S5 · dev-pdf-extractor · 2026-07-29T01:31:05Z
**task-id:** FACTORY-PDF-split-handlers
**what-done:** No-MCP-tool deviation note + close-gate routing. Agent
grant (`.claude/agents/dev-pdf-extractor.md`) is Read/Edit/Write/Glob/Grep/
Bash only — no MCP tool available, so commit-mutex/task_claim/task_release
are skipped for this session; committing directly with explicit pathspecs
per router's dispatch instruction (same precedent as
`FACTORY-COWORK-SPAWNFANOUT`). `rebuild_required: true` per task board —
holding row at REVIEW (not self-flipping DONE/DONE_VERIFIED), next_agent
set to `ops` for gated rebuild+swap, then `qa` for live-endpoint
verification, then `po` Step 6 sign-off — exact same chain the sibling
`FACTORY-PDF-delete-deprecated-inspect` row closed with (verified via
`docs/data/orch/archive/2026-07.json`).
**what-considered:** only path — INV-GATEWAY-1 / Docker Microservice
Code-Change Close Gate are both standing, non-negotiable policy for this
zone; router prompt explicitly directed following the sibling's precedent
chain.
**why-decision:** N/A (policy compliance, not a design choice).
**why-change:** No change from plan.

---

## Files touched

**NEW:**
- `apps/pdf-extractor/domain/constants.py` (11L)
- `apps/pdf-extractor/interface/schemas.py` (103L)
- `apps/pdf-extractor/interface/routes_health.py` (40L)
- `apps/pdf-extractor/interface/routes_extract.py` (94L)
- `apps/pdf-extractor/interface/routes_extract_tables.py` (83L)
- `apps/pdf-extractor/interface/routes_md_tables.py` (87L)
- `apps/pdf-extractor/interface/routes_layout_first.py` (92L)
- `apps/pdf-extractor/interface/pek_run_helper.py` (93L)
- `apps/pdf-extractor/interface/routes_pek.py` (86L)
- `apps/pdf-extractor/interface/routes_rasterizer.py` (98L)
- `apps/pdf-extractor/interface/routes_page_text.py` (72L)

**MODIFIED:**
- `apps/pdf-extractor/interface/handlers.py` — 750L → 65L, now pure
  delegation to the 8 `register_*_routes()` functions above.
- `apps/pdf-extractor/__tests__/test_pek_engine_adapter.py` — retarget
  `_run_pek_extract` import + `logging.getLogger(...)` name to
  `interface.pek_run_helper` (2 sites).
- `apps/pdf-extractor/__tests__/unit/test_pek_extract_handler_nonblocking.py`
  — retarget `_run_pek_extract` import to `interface.pek_run_helper`.
- `apps/pdf-extractor/scenarios/pek_single_doc_extraction.py` — retarget
  `patch("interface.handlers.is_vn_market_open_utc", ...)` →
  `patch("interface.routes_pek.is_vn_market_open_utc", ...)` (4 sites).

## Rebuild status
`rebuild_required: true` per task board — holding at REVIEW, next_agent=ops
per Docker Microservice Code-Change Close Gate
(`docs/protocols/docker-deployment-runbook.md`), same chain as the sibling
`FACTORY-PDF-delete-deprecated-inspect` close.
