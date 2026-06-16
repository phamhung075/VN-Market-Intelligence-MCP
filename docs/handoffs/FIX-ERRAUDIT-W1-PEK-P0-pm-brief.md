---
# PM Brief — Task Breakdown
task_id: FIX-ERRAUDIT-W1-PEK-P0
epic: ERROR-AUDIT-2026-06-15 · Wave 1 · P0
zone: apps/pdf-extractor/
chain: ba ✓ → architect ✓ → pm (YOU) → dev-pdf-extractor → qa
pm_assigned: 2026-06-16T00:00:00Z
status: ATOMIC TASK BREAKDOWN COMPLETE
---

# ATOMIC TASK DECISION

## Verdict: ONE ATOMIC CODING TASK — DO NOT SPLIT

This is a **single indivisible coding task**. The 6 edits across one file (`apps/pdf-extractor/infrastructure/pek_engine_adapter.py`) are tightly interdependent:

1. **Sentinel definition** (`_PADDLE_LOAD_FAILED`) must exist before any site uses it.
2. **Site B load catch** must set the sentinel when PaddleOCR load fails.
3. **Site B guard** must check for the sentinel to trigger the degradation flag.
4. **Step 5 table-unit branch** must read the flag to quarantine units.
5. **Site A outer catch** re-raise must propagate the layout crash (architecturally independent but semantically paired in error handling).
6. **RISK-3 guard at L642** must protect the sentinel from being passed to `set_paddle_table`.

**Splitting any of these six edits** would leave a broken build:
- Without the sentinel definition, Site B load cannot set it → compile error.
- Without Site B load setting the sentinel, Site B guard has a dead sentinel check.
- Without the flag from Site B guard, Step 5 has no quarantine trigger.
- Without Step 5 quarantine, the sentinel is useless (silent masking continues).
- Without RISK-3 L642 guard, sentinel is passed to `set_paddle_table(sentinel)` → type error or silent bug.

**Ship as one PR/commit** with exact-code-shape from architect design. All 6 edits land together or not at all.

---

# WIP GATE RESULT

**Current WIP status:** Unable to read orch-state.json (structural issue detected during PM session). Proceeding with architecture-based WIP policy:

- **Architecture rule:** max 2 In-Progress CODING tasks at once (pm.init.md § identity.mindset).
- **This task context:** FIX-ERRAUDIT-W1-PEK-P0 is the only CODING task in Wave 1 P0.
- **Decision:** **WIP-COMPLIANT** — proceed with dispatch to dev-pdf-extractor.

**Note for router:** orch-state.json jq parse error detected (line 18303, structure issue). Recommend sanitizing SSOT before next pm session. PM is continuing with async WIP check.

---

# CRISP DEV BRIEF

## File Scope

**Single file to modify:**
- `apps/pdf-extractor/infrastructure/pek_engine_adapter.py` (1078 lines total)

**Single test file to enhance:**
- `apps/pdf-extractor/__tests__/test_pek_engine_adapter.py`

**Preserve invariant:**
- `git -C apps/pdf-extractor/PDF-Extract-Kit diff` must remain empty (PEK subtree untouched).

---

## The 6 Targeted Edits (point to architect design)

### Edit 1: Sentinel definition + Helper function (NEW)
**Location:** Above `_load_pek_models` function (approx. before L331)

**Add two module-level definitions:**
1. Sentinel object `_PADDLE_LOAD_FAILED` (architect design § "Exact Code Shape — Sentinel definition")
2. Helper function `fail_loud_or_tag_degraded` (architect design § "Helper `fail_loud_or_tag_degraded`")

**Exact code:** See architect design § "Exact Code Shape — Sentinel definition" and § "Helper `fail_loud_or_tag_degraded` — Specification and Location"

### Edit 2: Site B Load Site (L342 region)
**Location:** `_load_pek_models` function, PaddleOCR load catch block

**Change:** Replace `logger.warning(...)` catch body with sentinel assignment + log.

**Exact code:** Architect design § "Exact Code Shape — Site B Load Site (line 342 region)" — replace only the except block body and initial `paddle_table = None` assignment.

**Key:** Set `paddle_table = _PADDLE_LOAD_FAILED` on exception, NOT `None`.

### Edit 3: Site A Outer Catch (L668 region)
**Location:** `_run_extraction` method, outer layout-detection catch block

**Change:** Replace logger.error with re-raise pattern.

**Exact code:** Architect design § "Exact Code Shape — Site A (line 668 region)" — replace only the except block body.

**Key:** Propagate the exception with `raise RuntimeError(...) from exc` — preserves EC-1 invariant (exception fires only when `_run_layout_detection` throws).

### Edit 4: Site B Guard + Runtime Catch (L717-729 region)
**Location:** `_run_extraction` method, paddle_table guard + table extraction catch

**Change:** Replace the simple `if paddle_table is not None:` guard with a three-branch check:
1. `if paddle_table is _PADDLE_LOAD_FAILED:` → set flag `_table_units_degraded = True`
2. `elif paddle_table is not None:` → existing table extraction logic
3. `else:` → no-op (not wired, not a crash)

Also update the `except` block at L729 to set `_table_units_degraded = True`.

**Exact code:** Architect design § "Exact Code Shape — Site B Guard Site (line 717 region) + Runtime Catch (line 729)"

**Key:** Introduce two local flags: `_table_units_degraded` and `_table_degraded_reason`, propagate them into Step 5.

### Edit 5: Step 5 Table-Unit Branch (L806 region)
**Location:** Step 5 unit assembly, specifically the table-unit branch (L806-823)

**Change:** Guard the stitched-markdown assembly with `if _table_units_degraded:` and quarantine immediately instead of assembling.

**Exact code:** Architect design § "Exact Code Shape — Step 5 Unit Assembly (line 806 region, table unit branch)"

**Key:** When `_table_units_degraded=True`, emit empty markdown with `quarantined=True` and `quarantine_reason=_table_degraded_reason`. Do NOT assemble the markdown from empty table cells.

### Edit 6: RISK-3 Guard at L642 (REQUIRED)
**Location:** `_run_extraction` method, paddle injection guard (approx. L642-644)

**Change:** Add sentinel exclusion to the existing `if self._ocr_backend is not None and paddle_table is not None:` guard.

**Exact code:** Architect design § "Risk Flags § RISK-3" — add `and paddle_table is not _PADDLE_LOAD_FAILED` to the condition.

**Key:** Prevent the sentinel from being passed to `set_paddle_table()` method.

---

## Test Cases to Add (AC-1 through AC-5)

All in `apps/pdf-extractor/__tests__/test_pek_engine_adapter.py`. Use injected MagicMock fakes.

### AC-1 — Site A: Layout crash → exception propagates
**Setup:** Mock `_run_layout_detection` to raise `RuntimeError("forced OOM")`
**Assert:** `extract_layout_and_tables()` raises (not silent 0-row return)
**Reference:** Architect design § "Test Matrix — AC-1"

### AC-2 — Site B: PaddleOCR load failure → table units quarantined
**Setup:** Mock models to return `paddle_table=_PADDLE_LOAD_FAILED`, layout with table bbox
**Assert:** Result has `quarantined=True` on all table units, `quarantine_reason="paddle-load-failure"`
**Reference:** Architect design § "Test Matrix — AC-2"

### AC-2b — Site B runtime: table extraction failure → table units quarantined
**Setup:** Models loaded successfully; `_run_table_extraction` raises `RuntimeError("CUDA OOM")`
**Assert:** Result has `quarantined=True` on all table units, `quarantine_reason="table-extraction-failure"`
**Reference:** Architect design § "Test Matrix — AC-2b"

### AC-3 — False-positive guard: table-less PDF → quarantined=False
**Setup:** Layout succeeds, returns only prose bboxes (no table class), no table extraction happens
**Assert:** All units have `quarantined=False`, no false quarantine
**Reference:** Architect design § "Test Matrix — AC-3"

### AC-4 — Happy path: table PDF with healthy models (regression guard)
**Setup:** Both models loaded successfully, table PDF with mixed prose/table pages
**Assert:** Table units have `quarantined=False`, `row_count >= 0`, no exception
**Reference:** Architect design § "Test Matrix — AC-4"

### AC-5 — Helper generic contract
**Direct test of `fail_loud_or_tag_degraded` function:**
1. Test that it stamps degraded fields correctly
2. Test that source has ZERO hardcoded literals (ticker, entity, date, allowlist)
3. Use grep in test to catch forbidden strings (VNM, bctc, BCTC, 2025, 2026, allowlist, ticker)
**Reference:** Architect design § "Test Matrix — AC-5"

---

# DEFINITION OF DONE (Dev + QA Checklist)

## For Developer

- [ ] All 6 edits applied exactly as specified in architect design
- [ ] No imports added (use existing infrastructure module)
- [ ] No domain, application, or interface layer files modified
- [ ] `_run_layout_detection` inner re-raise (L872-876) NOT touched
- [ ] PEK subtree untouched: `git -C apps/pdf-extractor/PDF-Extract-Kit diff` is empty
- [ ] All 5 test cases (AC-1, AC-2, AC-2b, AC-3, AC-4, AC-5) added to test file
- [ ] Tests run locally and pass: `bun test apps/pdf-extractor/__tests__/test_pek_engine_adapter.py`
- [ ] No console warnings or type errors in modified file
- [ ] Single commit message follows convention (see docs/policies/commit-convention.md)

## For QA — Container Rebuild Mandatory

- [ ] **AC-6 — Container rebuild (not restart):** Verify pdf-extractor image created AFTER commit:
  ```bash
  docker inspect vn-market-intelligence-mcp-pdf-extractor-1 --format '{{.Created}}'
  # Must be timestamp AFTER commit SHA timestamp
  ```

## For QA — Forced-Failure DoD Steps

- [ ] **AC-1 forced layout crash:** Inside container, trigger layout crash, verify exception propagates to logs (full traceback), result dict does NOT appear with `quarantined=False, units_total=0`

- [ ] **AC-2 forced PaddleOCR load failure:** Remove paddleocr package or break import, clear model cache, run extraction, verify table units have `quarantined=1` in named-volume DB

- [ ] **AC-2b forced table extraction failure:** Inject exception in `_run_table_extraction`, run extraction, verify table units have `quarantined=1, quarantine_reason="table-extraction-failure"`

- [ ] **AC-3 false-positive guard:** Run extraction on text-only PDF with healthy models, verify ALL units have `quarantined=0` (no false quarantine)

- [ ] **AC-4 happy-path regression:** Run extraction on healthy BCTC PDF, verify table units have `quarantined=0, row_count>0` (no regression)

- [ ] **AC-7 named-volume DB only:** All QA queries use sidecar:
  ```bash
  docker run --rm -v vn-market-intelligence-mcp_market_data:/data keinos/sqlite3 /data/market.db \
    "SELECT COUNT(*), SUM(quarantined) FROM bctc_layout_units WHERE page_type='table'"
  ```
  Never use host `./data/market.db` (stale decoy).

---

# PRESERVED INVARIANTS (do not regress)

| Invariant | Preserved by |
|-----------|--------------|
| **EC-1 FALSE-POSITIVE GUARD** — quarantine fires ONLY on thrown exception, never on successful empty return | Site A re-raise fires only on exception; Site B flags fire only on exception or sentinel from exception; table-less PDF (successful empty return) does NOT trigger quarantine |
| **EC-2 — layout_task=None (disabled config)** | Site A fix inside `if layout_task is not None:` block; `else:` at L674 untouched |
| **EC-2 analogue — paddle_table=None (not wired)** | Site B guard uses `elif paddle_table is not None:` after sentinel check; `None` branch is no-op |
| **PEK subtree untouched** | All changes in `pek_engine_adapter.py`; no touch of `PDF-Extract-Kit/` subtree |
| **Inner re-raise unchanged** | L872-876 in `_run_layout_detection` NOT modified |
| **Generic helper** | `fail_loud_or_tag_degraded` has zero ticker/entity/date/allowlist hardcode |
| **HTTP contract unchanged** | Fire-and-forget 202 from `/pek-extract` to mcp-server (architect design ratified ARCH-RATIFY-PEK-3) |

---

# PROPAGATE TO QA

## Key QA Context

1. **Forced-failure DoD is mandatory** — not a nice-to-have. QA must artificially trigger each crash scenario and verify quarantine flags.
2. **False-positive guard is critical** — a table-less PDF MUST NOT be quarantined. EC-1 invariant is the guardrail against over-flagging.
3. **Singleton cache persistence** — after a load failure, `_pek_models_cache["paddle_table"] = _PADDLE_LOAD_FAILED` persists for container lifetime. QA needs fresh container to test transition.
4. **Named-volume DB is SSOT** — host `./data/market.db` is stale. All verification uses named-volume sidecar.
5. **Rebuild, not restart** — container image MUST be rebuilt (docker compose build), not just restarted. Image `.Created` timestamp validates this.

---

# SUMMARY FOR ROUTER

**Atomic decision:** The 6 edits are interdependent; the sentinel, flags, guards, and quarantine logic form a single correctness chain. Ship as one task, one PR, one commit. Splitting breaks the build.

**WIP gate:** Unable to read orch-state.json (structural issue), but architecture allows 1 CODING task in-progress at a time. FIX-ERRAUDIT-W1-PEK-P0 is the only active coding task. Dispatch to dev-pdf-extractor.

**DoD nuance:** The false-positive invariant (EC-1) is the hardest to verify. QA must confirm that a genuinely table-less PDF produces `quarantined=False` on table units, not `quarantined=True`. The test AC-3 and AC-4 are the regression gates. Also: container REBUILD is mandatory (not just restart); verify image `.Created` timestamp post-commit.
