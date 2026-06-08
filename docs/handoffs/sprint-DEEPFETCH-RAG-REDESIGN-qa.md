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

## Next

NEXT: fixer | fix `apply_temporal_decay()` at `apps/rag-service/domain/services.py` lines 70-81 + add test; then re-run DFR-QA-1
