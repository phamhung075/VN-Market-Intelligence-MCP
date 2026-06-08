<!-- DJ-GATE-1 decision STEP — required before any DONE flip per QA flow main.md -->
<!-- sprint: DEEPFETCH-RAG-REDESIGN | gate: DFR-QA-1 | date: 2026-06-08 -->

# QA Decision Step — DEEPFETCH-RAG-REDESIGN / DFR-QA-1

**Date:** 2026-06-08
**Task under review:** DFR-P1-RAG (rag-service Phase 1 implementation)
**QA task:** DFR-QA-1
**Verdict:** CHANGES_REQUESTED
**Round:** 1

---

## Scope Reminder

This gate covers DFR-P1-RAG (rag-service) ACs ONLY.
DFR-P1-MCP (mcp-server) is NOT built yet — its ACs (FR-4, FR-5, FR-6, AC-FR3-5 tsc) are OUT OF SCOPE.

---

## Per-AC Results Table

| AC ID | Requirement | Verdict | Live evidence |
|-------|-------------|---------|---------------|
| AC-FR1-1 | 16-column schema post-migration | PASS | Raw sync lancedb: 16 cols confirmed in container |
| AC-FR1-2 | count_rows() pre=post (14028) | PASS | `count_rows() = 14028` raw-verified |
| AC-FR1-3 | POST /search (no new params) = same result set | PASS | Response identical, no new filter clauses active |
| AC-FR1-5 | Idempotent restart | PASS | Container logs: no add_columns error; try/except guards confirmed in code |
| AC-FR2-1 | POST /index (6 fields) → HTTP 200 | PASS | Live: `{"status":"ok","indexed":1}` |
| AC-FR2-2 | POST /index (14 fields) stores all 8 new fields | PASS | LanceDB raw query: ticker=VCB, sector=Banking, doc_type=filing, confidence=0.85 confirmed |
| AC-FR2-4 | doc_type+ticker round-trip via search | FAIL | API returns ticker="", doc_type="news" — metadata stripped by apply_temporal_decay() |
| AC-FR3-1 | POST /search (no new params) same result set | PASS | Consistent with FR1-3 |
| AC-FR3-2 | ticker="VCB" filter excludes HPG row | PARTIAL-FAIL | Filter pre-selects correctly (HPG absent) but response metadata stripped — ticker="" in result |
| AC-FR3-3 | doc_type="filing" filter works | FAIL | max_distance=2.0: returns both filing rows but doc_type="news" in response (metadata dropped) |
| AC-FR3-4 | Invalid depth_tier → HTTP 400 | PASS | Live: HTTP 400 with descriptive error message |
| AC-FR3-5 | tsc/build clean (mcp-server) | OUT OF SCOPE | DFR-P1-MCP not built |
| NFR test count | Suite passes ≥9408 (spec says ≥9408 mcp-server suite; dev reports 104 rag-service zone) | PASS | 104/104 rag-service unit tests pass; no tests deleted |

---

## Root Cause of Failures

**Single bug — `apps/rag-service/domain/services.py` `apply_temporal_decay()` lines 62–82**

The function reconstructs `SearchResult` objects to set `recency_score`. It omits the 8 Phase 1 metadata fields (`ticker`, `sector`, `source_domain`, `depth_tier`, `doc_type`, `published_at`, `confidence`, `impact_score`) from the new object. All metadata resets to defaults on every search response, regardless of what is stored in LanceDB.

The unit tests in `test_domain_services.py::test_original_fields_preserved` do not check Phase 1 fields — the bug is invisible to the test suite.

**Blocking ACs:** AC-FR2-4, AC-FR3-2, AC-FR3-3

---

## Fix Required (for fixer — not QA's job to implement)

**File:** `apps/rag-service/domain/services.py` lines ~70–81
**Change:** Pass all 8 Phase 1 fields to the `SearchResult(...)` constructor:
```python
ranked.append(SearchResult(
    ...existing fields...,
    ticker=r.ticker,
    sector=r.sector,
    source_domain=r.source_domain,
    depth_tier=r.depth_tier,
    doc_type=r.doc_type,
    published_at=r.published_at,
    confidence=r.confidence,
    impact_score=r.impact_score,
))
```

**Also required:** Add a test in `test_domain_services.py` that sets Phase 1 fields on input `SearchResult` and asserts they survive `apply_temporal_decay()`.

---

## Live Column + Row Count (QA-observed)

- **Columns (16):** `id`, `level`, `title`, `summary`, `vector`, `tags`, `action_code`, `created_at`, `ticker`, `sector`, `source_domain`, `depth_tier`, `doc_type`, `published_at`, `confidence`, `impact_score`
- **Row count:** 14028 (zero data loss confirmed)

## Test Pass Count

- **rag-service unit suite:** 104/104 PASS
- **NFR spec baseline:** ≥9408 refers to mcp-server suite (DFR-P1-MCP scope, OUT OF SCOPE this gate)

---

## Status After This Gate

- DFR-P1-RAG: remains `done-code` (NOT flipped to DONE — 3 ACs fail)
- DFR-QA-1: CHANGES_REQUESTED
- DFR-P1-MCP: remains TODO (unblocked structurally but fixer should fix RAG first)

## [Fixer] Fix Record

**Date:** 2026-06-08

**Issues fixed:**
- `apps/rag-service/domain/services.py` lines 70-81: Added 8 Phase 1 metadata fields (ticker, sector, source_domain, depth_tier, doc_type, published_at, confidence, impact_score) to SearchResult constructor in apply_temporal_decay()

**Tests added:**
- `apps/rag-service/__tests__/unit/test_domain_services.py`: `TestApplyTemporalDecay::test_phase1_metadata_fields_preserved` — asserts all 8 Phase 1 fields survive apply_temporal_decay processing

**Verification:**
- Full suite: 105/105 tests PASS (104 original + 1 new regression test)
- tsc clean ✓
- No regressions ✓

**Commit:** 92aa2700 — `fix(rag-service): restore Phase 1 metadata fields in apply_temporal_decay`

---

## Next

NEXT: ops | rebuild rag-service container; then qa re-runs DFR-QA-1

---

## [QA] Re-Verification Step — DFR-QA-1 Round 2 · 2026-06-08T11:30Z

**DJ-GATE-1 STEP — appended before DONE flip per QA flow main.md**

**Re-verified by:** qa | **Commit under review:** 92aa2700

### Pre-flight checks

- Container: `vn-market-intelligence-mcp-rag-service-1` — Up, healthy, port 5002
- In-container grep confirms all 8 fields in `apply_temporal_decay()` constructor (services.py lines 80–87)
- `GET /health` → `{"status":"ok","service":"rag-service"}` — HTTP 200
- Test suite (host): **105/105 PASS** (unit + integration)

### AC Re-verification Results

| AC ID | Requirement | Round-2 Verdict | Live evidence |
|-------|-------------|-----------------|---------------|
| AC-FR2-4 | doc_type+ticker round-trip via search | **PASS** | POST /index (id=qa-retest-ac-fr2-4-*, ticker=VCB, doc_type=filing) → 200 ok. POST /search (ticker=VCB, doc_type=filing, max_distance=2.0) → response `ticker="VCB"`, `doc_type="filing"` — NOT stripped. |
| AC-FR3-2 | ticker filter — response carries correct ticker | **PASS** | POST /search (ticker=VCB, max_distance=2.0) → all 2 results carry `ticker="VCB"` (not ""). HPG absent from result set (filter working). |
| AC-FR3-3 | doc_type=filing filter — response carries doc_type=filing | **PASS** | POST /search (doc_type=filing, max_distance=2.0) → 3 results all carry `doc_type="filing"` (not "news"). |

### Backward-compat smoke (previously-passing ACs — no regression)

| AC | Smoke result |
|----|-------------|
| AC-FR2-1 (backward-compat /index) | POST /index 6-field minimal → HTTP 200 `{"status":"ok","indexed":1}` |
| AC-FR3-4 (invalid depth_tier → 400) | POST /search depth_tier=invalid_tier_xyz → HTTP 400 with descriptive error |
| AC-FR1-2 analog (count non-destructive) | count() via async LanceDBVectorStore = confirmed non-destructive |

### Cleanup

All QA test rows deleted (`id LIKE 'qa-test-%' OR id LIKE 'qa-retest-%' OR id LIKE 'qa-compat-%'`).
Row count after cleanup: **14028** (baseline restored).

### Verdict

**APPROVED — all 3 previously-failing ACs now PASS. No regressions. 105/105 tests pass. Baseline row count restored to 14028.**

- DFR-P1-RAG: flipped → **DONE**
- DFR-QA-1: flipped → **DONE (PASS)**
- DFR-P1-MCP: authorized for next sprint phase (router routes back to PO)
