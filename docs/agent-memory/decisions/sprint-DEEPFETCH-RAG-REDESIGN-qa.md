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

---

### STEP qa-S2 · qa · 2026-06-08T11:30Z
**task-id:** DFR-QA-1
**what-done:** Re-verified 3 previously-failing ACs (AC-FR2-4, AC-FR3-2, AC-FR3-3) against live container post commit 92aa2700; confirmed PASS on all 3; cleaned up QA test rows; flipped DFR-P1-RAG + DFR-QA-1 to DONE.
**what-considered:**
- only path: commit 92aa2700 ships exactly the minimal fix described in CHANGES_REQUESTED (8 fields in SearchResult constructor + regression test). In-container grep confirmed. 105/105 tests pass. All 3 ACs produce correct live payloads.
**why-decision:** All 3 blocking ACs now PASS with real POST /index + POST /search calls against the live container. No regression on previously-passing ACs. Baseline row count 14028 restored after cleanup.

---

### STEP qa-S3 · qa · 2026-06-08T14:28Z — DFR-P1-MCP acceptance gate
**task-id:** DFR-P1-MCP
**sprint:** DEEPFETCH-RAG-REDESIGN
**scope:** mcp-server layer (commit 4b8f1845, 6 files). Container rebuilt image 13:55Z, /health 200 toolCount 157.
**verdict:** APPROVED

**what-considered:** All 5 AC groups verified raw (not badges), no trust of sub-agent assertions:

- AC-FR6-1: PRAGMA table_info(rag_analyses) via bun eval in container → body_text TEXT at cid=21. PASS.
- AC-FR6-2: rag_analyses row count = 5560 pre-QA / 5560 post-cleanup. PASS.
- AC-FR6-3: SELECT COUNT(*) WHERE body_text IS NOT NULL = 0. All existing rows NULL. PASS.
- AC-FR6-4: INSERT with body_text='some body text' succeeded; SELECT confirmed stored value. PASS.
- AC-FR6-5: ALTER TABLE ... ADD COLUMN body_text again → catches 'duplicate column name: body_text' error silently. Idempotent. PASS.
- AC-FR4-1: mcp.config.json rag.decayHalfLifeDays has exactly 4 keys {news:2,macro:7,filing:30,analysis:14}. PASS (source read).
- AC-FR4-2: pollNews.ts line 454 `cfg.rag?.decayHalfLifeDays?.news ?? 2` loaded from config; passed as decay_half_life_days. No hardcode. PASS (source read).
- AC-FR5-2: Live POST /index with doc_type=news/depth_tier=shallow/source_domain=cafef.vn/ticker=VCB → POST /search doc_type=news+ticker=VCB returns exact metadata. PASS.
- AC-FR5-3: Live POST /index with doc_type=filing/ticker=HPG/source_domain=bctc.ssi.com.vn → POST /search doc_type=filing+ticker=HPG returns exact metadata. PASS.
- AC-FR3-5: bun tsc --noEmit on host and in container → EXIT:0. PASS.
- NFR/tests: 1332 test has 3 failures; confirmed pre-existing — test file NOT in commit 4b8f1845 diff (0 lines changed); root cause is cron_job_runs table absent from that test's hand-rolled in-memory schema (Sprint 1398 gap); unrelated to any DFR-P1-MCP change. Other targeted suites (BCTC 6 files + SBV = 58/0, 1840a rag-wiring = 3/0). PASS.
- bun test full-suite: Bun v1.3.13 WriteFailed crash at coverage-write is the pre-existing crash documented since 2026-05-13 (cycles 208–211 notes). Not a test failure. PASS.
- DDD: commit 4b8f1845 — schema-news.ts (infra), ragHttpClient.ts (infra), config.ts (infra), pollNews.ts (application), fetchParseAndStoreBctc.ts (application), mcp.config.json (config). No domain→infra violations. PASS.
- Security: no process.env in modified files (Bun.env used), no hardcoded secrets, no hardcoded decay values (read from config). PASS.
- Cleanup: qa-test-dfr-mcp-001 deleted from rag_analyses (5560 restored); qa-dfr-mcp-news-live-001 + qa-dfr-mcp-filing-live-001 deleted from LanceDB via t.delete(); LanceDB 14127 (grown from live polling during QA session, QA rows confirmed deleted).

**why-decision:** All in-scope MCP-layer ACs verified LIVE raw. The 1 test failure (1332) is pre-existing and structurally unrelated to DFR-P1-MCP changes. Bun crash is a pre-existing runtime bug. APPROVED.
**why-change:** no change from plan — fix shipped as specified, re-verify passes.
