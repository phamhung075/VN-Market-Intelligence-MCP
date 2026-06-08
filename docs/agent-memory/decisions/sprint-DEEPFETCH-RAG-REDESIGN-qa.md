<!-- size-justification: QA decision journal for DEEPFETCH-RAG-REDESIGN DFR-QA-1 gate. -->

# Decision Journal — DEEPFETCH-RAG-REDESIGN QA

## Entry 1 — DFR-QA-1 gate · 2026-06-08T13:xx Z

**task-id:** DFR-QA-1
**sprint:** DEEPFETCH-RAG-REDESIGN
**scope:** DFR-P1-RAG (rag-service ACs only). DFR-P1-MCP explicitly OUT of scope.
**verdict:** CHANGES_REQUESTED

### What was considered

Live verification on rag-service container (rebuilt 13:06:53Z, port 5002, image post-commit 76a02b0d + deps b94e5342). Raw LanceDB introspection + live HTTP API calls, not badge trust.

#### PASS evidence

| AC | Result | Evidence |
|----|--------|----------|
| AC-FR1-1 | PASS | LanceDB sync API: 16 columns confirmed — `['id','level','title','summary','vector','tags','action_code','created_at','ticker','sector','source_domain','depth_tier','doc_type','published_at','confidence','impact_score']` |
| AC-FR1-2 | PASS | `count_rows() = 14028` raw-verified in container via sync lancedb API |
| AC-FR1-3 | PASS | `POST /search` (no new params) returns same result set; filter clauses absent → behavior unchanged |
| AC-FR1-5 | PASS | Container logs show no add_columns error on startup; second `_get_table()` call is guarded by try/except per code review |
| AC-FR2-1 | PASS | `POST /index` with 6 legacy fields → HTTP 200, `{"status":"ok","indexed":1,"entry_id":"qa-test-backward-001"}` |
| AC-FR2-2 | PASS | `POST /index` with 14 fields → HTTP 200; raw LanceDB query for `id='qa-test-full-001'` shows `ticker='VCB', sector='Banking', source_domain='bctc.ssi.com.vn', doc_type='filing', confidence=0.85, impact_score=7.5` — stored correctly |
| AC-FR3-1 | PASS | No new params → same result set (consistent with FR1-3) |
| AC-FR3-4 | PASS | `POST /search {depth_tier: "invalid_tier"}` → HTTP 400 with `{"status":"invalid_request","error":"Invalid depth_tier filter: 'invalid_tier' — must be one of ['deep', 'shallow']"}` |
| NFR (test count) | PASS | 104 tests pass (85 baseline + 19 new). No tests deleted. |

#### FAIL evidence — blocking

**BUG: `apply_temporal_decay()` drops all Phase 1 metadata fields on every search result**

- **File:** `apps/rag-service/domain/services.py` lines 62–82
- **Root cause:** `apply_temporal_decay()` constructs new `SearchResult` objects explicitly but omits the 8 Phase 1 fields (`ticker`, `sector`, `source_domain`, `depth_tier`, `doc_type`, `published_at`, `confidence`, `impact_score`). These reset to their dataclass defaults (empty string / "news" / "shallow" / 0.0) on every search response.
- **Live proof:** Raw LanceDB for `qa-test-full-001` → `ticker='VCB', doc_type='filing'`. Same row through `POST /search ticker=VCB` API → `ticker='', doc_type='news'`.
- **Test gap:** `test_original_fields_preserved` in `test_domain_services.py` only checks legacy fields (id, level, title, summary, tags, action_code) — does not assert Phase 1 metadata fields, so the bug is invisible to the test suite.

| AC | Status | Blocking evidence |
|----|--------|------------------|
| AC-FR2-4 | FAIL | `ticker="VCB"` and `doc_type="filing"` round-trip via search → API returns `ticker=""`, `doc_type="news"` |
| AC-FR3-2 | FAIL | ticker filter pre-selects correctly (HPG absent) BUT result shows `ticker=""` — metadata stripped by `apply_temporal_decay` |
| AC-FR3-3 | FAIL | `doc_type="filing"` filter + `max_distance=0.8` → 0 results (distance > 0.8 for these test rows). With `max_distance=2.0` → 2 filing rows returned but `doc_type="news"` in response (metadata stripped) |

### Why CHANGES_REQUESTED (not APPROVED)

Three ACs that directly require metadata round-trip (AC-FR2-4, AC-FR3-2, AC-FR3-3) fail due to a single root-cause bug in `apply_temporal_decay()`. The fix is minimal (pass all 8 fields when constructing the new SearchResult), but it is a correctness regression — the entire Phase 1 value proposition (consumer can pre-filter + receive metadata in results) is broken in the live API path. Cannot approve.

### Fix required (for fixer, not QA to implement)

`apps/rag-service/domain/services.py` `apply_temporal_decay()` lines 70–81: add the 8 Phase 1 fields to the `SearchResult(...)` constructor call. Also add a test in `test_domain_services.py` that sets Phase 1 fields on the input SearchResult and asserts they survive `apply_temporal_decay()`.
