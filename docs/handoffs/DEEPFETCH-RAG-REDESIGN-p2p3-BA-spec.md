# BA Spec — DEEPFETCH-RAG-REDESIGN Phase 2 & 3 Sub-Task Decomposition

**BA Task ID:** DFR-BA-P2P3
**Sprint:** DEEPFETCH-RAG-REDESIGN
**Date:** 2026-06-08
**Authored by:** ba
**Blueprints (authoritative):**
- `docs/architecture-briefs/2026-06-08-dfr-p2-deepfetch-blueprint.md`
- `docs/architecture-briefs/2026-06-08-dfr-p3-hybrid-search-blueprint.md`

**Handoff to:** pm (add sub-tasks to board, schedule, assign dev-zone agents)

---

## Context

Phase 1 (DFR-P1-RAG + DFR-P1-MCP) is **DONE + QA-APPROVED**. Blueprints for Phase 2 and Phase 3 are **DESIGN COMPLETE**. This spec decomposes the two parent TODO tasks into five atomic sub-tasks, each ownable by a single dev-zone agent. The blueprints define interface contracts and acceptance criteria — this spec extracts them into PM-actionable task rows.

---

## Sub-Task Decomposition

---

### DFR-P2-MCP

**Parent:** DFR-P2-DEEPFETCH
**Owner:** dev-mcp-server
**Zone (verified system-map.json):** `apps/mcp-server/`
**Type:** FEATURE
**Size:** M
**Priority:** HIGH

**Scope:**
Implement the entire mcp-server side of the conditional deep-fetch pipeline:

1. SQLite schema — add `deep_fetch_queue` + `deep_fetch_stats` tables to `initNewsTables()` in `apps/mcp-server/src/infrastructure/db/schema-news.ts` (blueprint §1a).
2. Domain gate — `deepFetchGate.ts` pure function in `apps/mcp-server/src/domain/services/` (blueprint §1b). Sector keyword map loaded from `docs/data/system-map.json` at startup — never hardcoded.
3. Infrastructure store — `deepFetchQueueStore.ts` in `apps/mcp-server/src/infrastructure/db/` with `enqueueIfNotPresent` (INSERT OR IGNORE on UNIQUE source_url), `pollPending`, `markDone`, `markVpsFailed`, `markExpired`, `incrementAttempts`, `checkDomainDailyCap`, `incrementDomainCounter` (blueprint §1c).
4. Gate injection in `pollNews.ts` — non-fatal block AFTER `wasInserted = true` (blueprint §1d). Gate failure MUST NOT abort the poll cycle.
5. Scheduler job `deepFetchVpsJob.ts` — cron `*/5 * * * *`, calls VPS `GET /proxy/article-body`, writes `rag_analyses.body_text`, re-indexes LanceDB with `depth_tier="deep"` + `id + "_deep"` suffix (blueprint §1e). NO delete before add.
6. Scheduler job `deepFetchMainJob.ts` — cron `*/5 * * * *`, polls `status='vps-failed'` rows, calls `apps/news-fetch` `POST /fetch-article` (blueprint §1e).
7. Register both jobs in `startScheduler.ts` and `cronConfig.ts` with env-var overrideable cron strings (blueprint §1e).
8. `mcp.config.json` additions: `deepFetch.maxPerCycle` (10), `maxPlaywrightPerCycle` (5), `staleExpiryHours` (4), `domainDailyCap` per-domain map (blueprint §1g). Read via `loadMcpConfig()`.
9. LanceDB re-index via `_deep` suffix id — `table.add()` only, **never `table.delete()` before re-index** (blueprint §1f).

**Interface contracts honored:**
- Contract A (mcp-server → VPS `/proxy/article-body`): blueprint §Contract A — GET with `url` param, 15s timeout, treats empty `body_text` or non-ok status as `vps-failed`.
- Contract B (mcp-server → news-fetch `POST /fetch-article`): blueprint §Contract B — POST JSON `{url}`, 30s timeout, treats non-ok as `expired`.
- Contract C (state machine): `pending → vps-fetching → vps-failed → done|expired`, `source_url UNIQUE`, stale expiry at `queued_at < NOW()-4h`.

**Outward-facing live-crawl risk (flag mandatory):**
This task initiates live outbound HTTP requests to production news domains (cafef.vn, vneconomy.vn, vnexpress.net). The per-domain daily cap and stale expiry are **mandatory acceptance criteria** — they are not optional. The gate MUST be enforced before the first deploy to avoid flooding live news sites.

**Acceptance Criteria (live-verifiable, drawn from blueprint §ACs):**

| AC | Verification |
|----|-------------|
| AC-P2M-1 | `deep_fetch_queue` and `deep_fetch_stats` tables exist in live DB after startup (idempotent — survive multiple restarts). `sqlite3 market.db ".tables"` shows both. |
| AC-P2M-2 | After a pollNews cycle: articles with a watchlist ticker (VNM/HPG/VCB) OR impactScore >= 7 appear in `deep_fetch_queue` with `status='pending'`. Query: `SELECT count(*) FROM deep_fetch_queue WHERE status='pending'`. |
| AC-P2M-3 | deepFetchVpsJob processes at most `maxPerCycle` (10) rows per run. Query after 5-min cron fire: rows transitioned to `done` or `vps-failed`, no more than 10 per cycle. |
| AC-P2M-4 | For a `done` row: `rag_analyses.body_text IS NOT NULL` and non-empty. `SELECT body_text FROM rag_analyses WHERE id = <rag_id>`. |
| AC-P2M-5 | LanceDB query with `depth_tier="deep"` returns the re-indexed entry (with `_deep` suffix id). `POST /search {"query":"...", "depth_tier":"deep"}` → result id ends in `_deep`. |
| AC-P2M-6 | deepFetchMainJob only picks up `status='vps-failed'` rows (never `status='pending'`). |
| AC-P2M-7 | `source_url UNIQUE` dedup: calling `enqueueIfNotPresent` twice for the same URL → second call returns false / no duplicate row. `SELECT count(*) FROM deep_fetch_queue WHERE source_url = '<url>'` = 1. |
| AC-P2M-8 | Rows older than 4h with `status='pending'` or `'vps-failed'` are marked `'expired'` on the next executor run. |
| AC-P2M-9 | `mcp.config.json` contains `deepFetch.*` block; dev verifies values are loaded at runtime (not hardcoded). |
| AC-P2M-10 | pollNews cycle completes without error if deepFetchGate.ts throws (non-fatal gate — poll must NOT abort). |

**Files (blueprint-specified):**
- `apps/mcp-server/src/infrastructure/db/schema-news.ts` (add tables)
- `apps/mcp-server/src/domain/services/deepFetchGate.ts` (new)
- `apps/mcp-server/src/infrastructure/db/deepFetchQueueStore.ts` (new)
- `apps/mcp-server/src/application/usecases/pollNews.ts` (gate injection after line ~948)
- `apps/mcp-server/src/scheduler/news-analysis/deepFetchVpsJob.ts` (new)
- `apps/mcp-server/src/scheduler/news-analysis/deepFetchMainJob.ts` (new)
- `apps/mcp-server/src/scheduler/startScheduler.ts` (register jobs)
- `apps/mcp-server/src/scheduler/cronConfig.ts` (add cron keys)
- `mcp.config.json` (add deepFetch block)

**DDD layer assignment:**
- `deepFetchGate.ts` → **domain** (pure fn, zero infra imports)
- `deepFetchQueueStore.ts` → infrastructure
- Schema tables → infrastructure
- Gate injection in pollNews.ts → application
- deepFetchVpsJob.ts / deepFetchMainJob.ts → interface/scheduler

---

### DFR-P2-VPS

**Parent:** DFR-P2-DEEPFETCH
**Owner:** dev-vps-crawls
**Zone (verified system-map.json):** `apps/mcp-server/` (dev-vps-crawls zone → `vps-scripts/`)
**Type:** FEATURE
**Size:** S
**Priority:** HIGH

**Scope:**
Extend the live VPS article-body pipeline to support vnexpress.net:

1. Add `"vnexpress.net"` to `ALLOWED_DOMAINS` in `vps-scripts/article-body-fetcher.py` (blueprint §2a).
2. Add `extract_vnexpress()` function using BeautifulSoup (recipe in blueprint §2a). Dispatch via existing `dispatch_extract()` block. Add `"Referer": "https://vnexpress.net/kinh-doanh"` to HEADERS.
3. One-line patch to `vps-proxy-server.js` line ~160: add `"vnexpress.net"` to `ARTICLE_BODY_ALLOWED_DOMAINS` (blueprint §2b).
4. `sudo systemctl restart vn-vps-proxy.service` + verify `systemctl status` healthy (blueprint §2c).

**Constraints:**
- Plain HTTP ONLY. NO Chromium, NO new Python packages. `requests` + `beautifulsoup4` already installed.
- NO new systemd service (verdict from DFR-Q2).

**Interface contracts honored:**
- Contract A response shape (blueprint §Contract A): `{"status":"ok","url":"...","source_domain":"vnexpress.net","title":"...","body_text":"<max 8000 chars>","published_at":"...","fetched_at":"..."}`.

**Acceptance Criteria (live-verifiable):**

| AC | Verification |
|----|-------------|
| AC-P2V-1 | `curl http://VPS_HOST:8765/proxy/article-body?url=<vnexpress-article-url>` returns `{"status":"ok","body_text":"..."}` with non-empty body_text. |
| AC-P2V-2 | VPS RAM after 10 concurrent calls stays within `vn-vps-proxy.service` 64MB MemoryMax. Check: `systemctl status vn-vps-proxy.service` shows no OOM. |
| AC-P2V-3 | A URL with a domain NOT in ALLOWED_DOMAINS returns `{"status":"error","reason":"domain not allowed"}` — SSRF guard intact. |
| AC-P2V-4 | Existing cafef.vn + vneconomy.vn extraction continues to work after the restart. |

**Files:**
- `vps-scripts/article-body-fetcher.py`
- `vps-scripts/vps-proxy-server.js` (or equivalent path on VPS)

---

### DFR-P2-MAIN

**Parent:** DFR-P2-DEEPFETCH
**Owner:** dev-mainserver-crawls
**Zone (verified system-map.json):** `apps/news-fetch/` (dev-mainserver-crawls → news-fetch zone, port 5008)
**Type:** FEATURE
**Size:** S
**Priority:** HIGH

**Scope:**
Add a single new route to the existing `apps/news-fetch/` microservice as the Playwright fallback executor:

1. `POST /fetch-article` route (blueprint §3a). Request: `{ url: string }`. Response: `{ status: "ok"|"error", body_text: string, published_at: string, url: string }`.
2. Uses existing Playwright browser pool (already live for Reuters/Bloomberg). Navigate to `url`, extract `article` tag body or `document.body.innerText`, return up to 8000 chars.
3. SSRF allowlist guard: `ALLOWED_DOMAINS` loaded from `mcp.config.json` under `deepFetch.playwrightAllowedDomains`. Domains outside allowlist → HTTP 400. NEVER hardcode the list.
4. 30s Playwright timeout (blueprint §Contract B).
5. No new microservice — this is an additional route on the existing news-fetch service.

**Interface contracts honored:**
- Contract B (blueprint §Contract B): POST JSON `{url}`, 30s timeout, HTTP 200 `{status, body_text, published_at, url}` or HTTP 400 for blocked domain.

**Acceptance Criteria (live-verifiable):**

| AC | Verification |
|----|-------------|
| AC-P2N-1 | `POST http://localhost:5008/fetch-article {"url":"<reuters-article>"}` → HTTP 200 `{"status":"ok","body_text":"..."}` with non-empty body. |
| AC-P2N-2 | `POST http://localhost:5008/fetch-article {"url":"https://evil.com/page"}` → HTTP 400 (domain not in allowlist — SSRF guard). |
| AC-P2N-3 | Existing news-fetch functionality (Reuters/Bloomberg headline fetch) still works after the new route is added. |
| AC-P2N-4 | `ALLOWED_DOMAINS` is loaded from `mcp.config.json` — verified by changing config and confirming behavior changes without code redeploy. |

**Files:**
- `apps/news-fetch/src/routes/fetchArticle.ts` (new, or equivalent path per zone conventions)
- `apps/news-fetch/src/` (route registration in existing server entry)

**DDD layer:** interface/http (new route on existing microservice).

---

### DFR-P3-RAG

**Parent:** DFR-P3-HYBRID
**Owner:** dev-rag-service
**Zone (verified system-map.json):** `apps/rag-service/`
**Type:** FEATURE
**Size:** M
**Priority:** HIGH
**Can start:** IMMEDIATELY — fully independent of all P2 work (disjoint zone).

**Scope:**
Implement FTS + RRF hybrid search end-to-end in the rag-service:

1. Extend `VectorStorePort` in `apps/rag-service/domain/repositories.py` with `hybrid_search()` port signature (blueprint §3).
2. Add `hybrid: bool = False` field to `SearchRequest` dataclass in `apps/rag-service/application/dtos.py` (blueprint §6). Default False — backward compatible.
3. `LanceDBVectorStore.hybrid_search()` in `apps/rag-service/infrastructure/repositories.py` (blueprint §4):
   - FTS index lazy-build on first hybrid query: `_fts_index_built` module-level flag; calls `create_fts_index('title', replace=True)` then `create_fts_index('summary', replace=True)` (two separate calls — NOT a list, confirmed spike DFR-Q3).
   - `tbl.search(query_type='hybrid').vector(query_vec).text(query_text).rerank(RRFReranker()).limit(limit*4)` — NOT `tbl.search('text', query_type='hybrid')`.
   - Extract `_build_filter_clauses()` and `_dedup_and_trim()` as shared private methods (reused by both `search()` and `hybrid_search()`).
4. `SearchUseCase.execute()` branch in `apps/rag-service/application/usecases.py` (blueprint §5): `if request.hybrid: hybrid_search(...)` else `search(...)`. Temporal decay applies on BOTH paths.
5. `SearchRequestSchema.hybrid` field in `apps/rag-service/interface/serializers.py` (blueprint §7).
6. `POST /admin/rebuild-fts` endpoint in `apps/rag-service/interface/handlers.py` (blueprint §8). Returns `{"status":"ok"}`. Internal only (port 5002, not exposed externally).
7. Daily rebuild: mcp-server calls `/admin/rebuild-fts` via a daily cron (wired in DFR-P2-MCP or separately — PM coordinates). This task delivers the endpoint; cron caller is mcp-server responsibility.

**Interface contracts honored:**
- `POST /search {"hybrid": true}` returns RRF-ranked results (blueprint §AC 2–4).
- `POST /search {"hybrid": false}` or without `hybrid` field → vector-only path unchanged (blueprint §AC 1, 7).

**Key constraint from spike (DFR-Q3):** `tbl.search(query_type='hybrid')` MUST use `.vector().text()` chained calls — passing a string directly raises an error (blueprint §Brownfield State).

**Acceptance Criteria (live-verifiable):**

| AC | Verification |
|----|-------------|
| AC-P3R-1 | `POST /search {"query":"VCB earnings","hybrid":false}` returns same vector results as before (baseline unchanged). |
| AC-P3R-2 | `POST /search {"query":"VCB earnings","hybrid":true}` returns HTTP 200 with results (no 500). |
| AC-P3R-3 | Hybrid results rank VCB-mentioning rows higher than vector-only for "VCB earnings" (BM25 boost visible). |
| AC-P3R-4 | First hybrid request on a corpus with no FTS index triggers lazy build — request succeeds within 60s, no 500. |
| AC-P3R-5 | `POST /admin/rebuild-fts` → `{"status":"ok"}` and subsequent hybrid queries succeed. |
| AC-P3R-6 | Existing non-hybrid callers (no `hybrid` field) continue working — no regression. |
| AC-P3R-7 | FTS index is built with two separate `create_fts_index()` calls (title, then summary) — NOT a multi-field list call. |
| AC-P3R-8 | `hybrid_search()` in LanceDBVectorStore uses `.vector().text()` pattern confirmed in code review. |

**Files (blueprint-specified):**
- `apps/rag-service/domain/repositories.py` (VectorStorePort hybrid_search signature)
- `apps/rag-service/application/dtos.py` (SearchRequest.hybrid field)
- `apps/rag-service/infrastructure/repositories.py` (LanceDBVectorStore.hybrid_search + lazy FTS)
- `apps/rag-service/application/usecases.py` (SearchUseCase branch)
- `apps/rag-service/interface/serializers.py` (SearchRequestSchema.hybrid)
- `apps/rag-service/interface/handlers.py` (POST /admin/rebuild-fts)

**DDD layer assignment:**
- `hybrid_search()` port → **domain**
- `SearchRequest.hybrid` → application
- `LanceDBVectorStore.hybrid_search()` + FTS build → infrastructure
- `SearchUseCase.execute()` branch → application
- `SearchRequestSchema.hybrid` → interface
- `/admin/rebuild-fts` route → interface

---

### DFR-P3-MCP

**Parent:** DFR-P3-HYBRID
**Owner:** dev-mcp-server
**Zone (verified system-map.json):** `apps/mcp-server/`
**Type:** FEATURE
**Size:** XS
**Priority:** HIGH
**SEQUENCING CONSTRAINT — MANDATORY:** This task MUST be dispatched AFTER DFR-P2-MCP is merged to main. Both touch `ragHttpClient.ts` in different interface blocks (P2 = `ragIndex/RagIndexRequest`, P3 = `ragSearch/RagSearchRequest`). If PM runs them concurrently: enforce commit-mutex on `ragHttpClient.ts`; P3-MCP rebases onto P2-MCP's commit. This constraint is carry-forward from architect blueprint §Shared Module Collision Avoidance.

**Scope:**
THIN — one field, N caller opt-ins:

1. Add `hybrid?: boolean` to `RagSearchRequest` interface in `apps/mcp-server/src/infrastructure/rag/ragHttpClient.ts` (blueprint §9).
2. Update Chef synthesis tools — wherever `ragSearch()` is called with a ticker-specific query, pass `hybrid: true` (blueprint §10).
3. Update bctc-analyst tool — ticker-specific filing queries pass `hybrid: true` (blueprint §10).
4. `pollNews.ts` `defaultRagRetriever()` — explicitly does NOT pass `hybrid: true` (omit the field → defaults to false). Comment in code: "// hybrid intentionally omitted — contextual enrichment is semantic, not ticker-exact" (blueprint §10).

**Interface contracts honored:**
- `RagSearchRequest.hybrid?: boolean` compiles cleanly in TypeScript (blueprint §AC 6).
- Non-hybrid callers (hybrid absent/false) unaffected (blueprint §AC 7).

**Acceptance Criteria (live-verifiable):**

| AC | Verification |
|----|-------------|
| AC-P3M-1 | `tsc --noEmit` EXIT:0 in apps/mcp-server after adding `hybrid?: boolean` to RagSearchRequest. |
| AC-P3M-2 | Chef synthesis tool invokes `ragSearch({..., hybrid: true})` for ticker-specific queries — confirmed via code search in deployed image. |
| AC-P3M-3 | bctc-analyst tool invokes `ragSearch({..., hybrid: true})` for filing queries. |
| AC-P3M-4 | `pollNews.ts` defaultRagRetriever does NOT include `hybrid: true` in its ragSearch call — confirmed via code read. |
| AC-P3M-5 | Existing pollNews ragSearch behavior unchanged (vector-only path, no performance regression). |

**Files:**
- `apps/mcp-server/src/infrastructure/rag/ragHttpClient.ts` (add one optional field)
- Chef tool caller file(s) (add `hybrid: true`)
- bctc-analyst tool caller file(s) (add `hybrid: true`)

---

## Dependency and Sequencing Graph

```
DFR-P1-MCP (DONE) ──→ DFR-P2-MCP ──┐
                                      │
DFR-P2-VPS ──────────────────────────┤ (all 3 P2 can build in parallel against contracts;
DFR-P2-MAIN ─────────────────────────┤  integration AC verification needs all 3 live)
                                      │
                    DFR-P2-MCP (merged) ──→ DFR-P3-MCP   ← SERIALIZED, ragHttpClient.ts
                    
DFR-P1-RAG (DONE) ──→ DFR-P3-RAG            ← FULLY INDEPENDENT, start immediately
```

**Parallelism rules (PM-actionable):**
1. DFR-P2-VPS and DFR-P2-MAIN can start NOW (no code deps on P2-MCP — only the contract exists).
2. DFR-P2-MCP can start NOW (calls VPS/main-fetch contracts; integration test waits for P2-VPS + P2-MAIN).
3. DFR-P3-RAG can start NOW (fully independent zone).
4. DFR-P3-MCP MUST wait for DFR-P2-MCP to merge. PM places `depends: ["DFR-P2-MCP"]` on DFR-P3-MCP task.

---

## Mandatory Guardrails — Bake into Every Dev Brief

These are not optional; failure to enforce ANY of these is a blocker for QA acceptance:

| Guardrail | Where enforced | AC gate |
|-----------|----------------|---------|
| Max 10 deep-fetch per VPS cycle | `deepFetch.maxPerCycle` config + `pollPending(db, limit=maxPerCycle)` | AC-P2M-3 |
| Max 5 Playwright per cycle | `deepFetch.maxPlaywrightPerCycle` config + `pollVpsFailed(db, limit=5)` | AC-P2M-3 |
| Per-domain daily cap | `deep_fetch_stats` table + `checkDomainDailyCap()` before fetch | AC-P2M-3 |
| 4h stale expiry | `queued_at < NOW()-4h` check in both executor jobs | AC-P2M-8 |
| `source_url UNIQUE` dedup | `UNIQUE(source_url)` constraint + `INSERT OR IGNORE` | AC-P2M-7 |
| NO silent delete in LanceDB | `table.add()` only — never `table.delete()` before re-index | AC-P2M-5 |
| VPS = plain HTTP only | No playwright import in vps-scripts | AC-P2V-1 |
| Playwright only on main-server | news-fetch zone only | AC-P2N-1 |
| SSRF allowlist (both executors) | VPS ALLOWED_DOMAINS + news-fetch playwrightAllowedDomains from config | AC-P2V-3, AC-P2N-2 |
| No hardcoded system data | sector keywords from system-map.json; caps from mcp.config.json | AC-P2M-9 |
| FTS 2-call pattern (not list) | `create_fts_index('title')` then `create_fts_index('summary')` | AC-P3R-7 |
| Hybrid `.vector().text()` pattern | Not `tbl.search('text', query_type='hybrid')` | AC-P3R-8, AC-P3M-1 |

---

## Outward-Facing Risk (P2 live crawl)

**R-P2-7 (HIGHEST RISK for P2):** deepFetchVpsJob and deepFetchMainJob make live outbound HTTP calls to production VN news websites. Per-domain daily caps (`cafef.vn:50`, `vneconomy.vn:30`, `vnexpress.net:40`) and the 4h stale expiry are **mandatory acceptance criteria** — not implementation details. The gate (deepFetchGate.ts relevance threshold) must be calibrated to avoid flooding the queue. QA must verify caps are enforced BEFORE the jobs are enabled in the cron scheduler.

Suggested QA sequencing for P2: (1) deploy schema + gate with jobs DISABLED; (2) verify `deep_fetch_queue` populates correctly; (3) enable VPS job first, verify cap at 10/cycle; (4) enable main-server job only after VPS job proven stable.

---

## Sub-Task Summary for PM Board

| ID | Parent | Owner | Zone (system-map) | Size | ACs | Sequence |
|----|--------|-------|-------------------|------|-----|----------|
| DFR-P2-MCP | DFR-P2-DEEPFETCH | dev-mcp-server | apps/mcp-server/ | M | 10 | Start now; integration verify after P2-VPS + P2-MAIN |
| DFR-P2-VPS | DFR-P2-DEEPFETCH | dev-vps-crawls | vps-scripts/ | S | 4 | Start now, parallel |
| DFR-P2-MAIN | DFR-P2-DEEPFETCH | dev-mainserver-crawls | apps/news-fetch/ | S | 4 | Start now, parallel |
| DFR-P3-RAG | DFR-P3-HYBRID | dev-rag-service | apps/rag-service/ | M | 8 | Start now, fully independent |
| DFR-P3-MCP | DFR-P3-HYBRID | dev-mcp-server | apps/mcp-server/ | XS | 5 | AFTER DFR-P2-MCP merged |

**Total ACs across 5 sub-tasks: 31**

---

## Blockers

None. Blueprints are DESIGN COMPLETE. Feasibility probes (DFR-Q1 VNExpress extraction, DFR-Q2 VPS endpoint, DFR-Q3 LanceDB FTS/hybrid) are all DONE-GREEN. Phase 1 deps (DFR-P1-RAG, DFR-P1-MCP, DFR-QA-1) are DONE. No PO decision needed before dispatch.

---

## DJ-GATE-1 Step

This decomposition is complete. All sub-tasks derived directly from approved blueprints (no redesign). Zone assignments verified against `docs/data/system-map.json`. ACs are live-verifiable (SQL queries, curl, tsc --noEmit). Outward-facing crawl risk flagged explicitly. Caps are mandatory acceptance, not optional.

**Signal: spec_ready**

**Next:** pm — add 5 sub-tasks to DEEPFETCH-RAG-REDESIGN sprint board, assign dev-zone agents, schedule with parallelism rules above.
