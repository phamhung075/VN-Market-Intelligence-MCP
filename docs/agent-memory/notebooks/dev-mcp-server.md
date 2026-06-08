# dev-mcp-server -- Notebook

## 2026-06-08 · DFR-Q5 — DONE (recon spike)

**Task:** DFR-Q5 — DEEPFETCH-RAG-REDESIGN feasibility: ALTER TABLE rag_analyses ADD COLUMN body_text
**Sprint:** DEEPFETCH-RAG-REDESIGN

**Findings (live verify, read-only):**
- Table exists: YES — 5,543 rows in production market.db (/app/data/market.db inside container)
- Current columns (21 total): id, created_at, level, source_url, source_title, source_type, published_at, sentiment, impact_score, impact_direction, confidence, time_horizon, summary, reasoning, affected_countries, affected_domains, affected_actions, parent_ids, tags, embedding_text, data_env
- body_text present: NO — column is absent
- ADD COLUMN safe: YES — SQLite ADD COLUMN appends a nullable column non-destructively; existing rows get NULL, existing indexes/data untouched
- Migration pattern: `try { db.exec("ALTER TABLE rag_analyses ADD COLUMN body_text TEXT"); } catch { }` — idempotent try/catch pattern already used for data_env column (schema-news.ts:57) and at least 12 other columns across the schema files
- Where it runs: startup migration runner — `initNewsTables()` in schema-news.ts, called from `initDatabase()` in schema.ts (line 155), invoked at startup via composition-root.ts:25 (`await initDatabase()`)
- Single-writer invariant: CONFIRMED — market.db write path is exclusively mcp-server; no other service writes it
- Service interruption risk: NONE — SQLite ALTER TABLE ADD COLUMN is non-blocking, takes microseconds, no table lock beyond the statement

**Verdict:** DFR-P1-MCP(a) migration approach is CONFIRMED SAFE. Place one idempotent try/catch ALTER in initNewsTables() below the existing data_env migration line.

**Lesson:** Live DB is container-mounted at /app/data/market.db — host market.db is an empty dev artifact. Always verify schema via bun:sqlite exec inside the running container, not against the host file.

Zone health: recon only, no code change | HEALTHY

## 2026-06-08 · DFR-P1-MCP — done-code

**Task:** DFR-P1-MCP (sprint DEEPFETCH-RAG-REDESIGN)
**Scope:** FR-6 (body_text ALTER TABLE), FR-4 (decayHalfLifeDays config), FR-5 (ragIndex caller updates), FR-3 mcp-server portion (DTO extensions + decay passthrough)
**Files changed:** schema-news.ts, mcp.config.json (real: /mcp.config.json via symlink), config.ts, ragHttpClient.ts, pollNews.ts, fetchParseAndStoreBctc.ts
**Row count:** 5557 before (live container probe); unchanged (migration pending rebuild)
**tsc:** CLEAN (bun tsc --noEmit)
**Tests:** 0 new failures; existing pre-existing failures (data_env schema gap in test inline DBs) unchanged
**Rebuild required:** targeted `docker compose build mcp-server && docker compose up -d mcp-server` — do NOT use down&&up
**Lesson:** Sector lookup uses `cfg.market.referenceStocks` (config SSOT) — no separate domain service needed since the map already exists in config. URL parse E1-guard: always try/catch `new URL(entry.sourceUrl).hostname` since source_url can be null/empty.

Zone health: bun tsc --noEmit clean, 0 new failures, tools 157 intact, scheduler 76 cron.schedule | HEALTHY

---
**Cycle:** 2026-06-08 | **Task:** FIX-BCTC-ENRICHER-PLACEHOLDER-URL (size S)
**Fix:** `backfillBctcQ12026.ts` inserted placeholder VPS URL instead of NULL; enricher WHERE clause skipped those rows → pull job 404-looped forever on 18 rows. Fix: insert `source_url=NULL` — enricher's existing NULL arm captures them. Option (b) chosen over option (a) because it fixes root cause at insertion point without widening enricher with VPS-host-specific knowledge. TC-4 documents live rows with old placeholder URLs are NOT auto-fixed — need one-time migration (out of scope per task spec scope guard).
**Files:** `backfillBctcQ12026.ts` (11L), `FIX-BCTC-ENRICHER-PLACEHOLDER-URL.test.ts` (+7 tests)
**tsc:** CLEAN | **Tests:** 31 pass / 0 fail (4 enricher test files)
Zone health: bun tsc --noEmit clean, 31 tests (enricher suite), tools 157, scheduler 78 cron.schedule | HEALTHY

---
**Cycle:** 2026-06-08 | **Tasks:** FIX-MCP-TOOL-COUNT-DRIFT + FIX-MCP-CI-NETWORK-GUARD (Sprint CI-RED-RECONCILE)
**Task 1:** 123-integration-mcp.test.ts floor 16→15. Root cause: `read_bctc_pdf` intentionally deregistered in TSU-DEV-U3 (OCR/PEK supersedes). Case (b) — assertion stale, not regression.
**Task 2 initial:** 1146 dates 2026-03-* fell outside 90-day window → daysAgo() relative helpers. 1335 setupTestDb() rag_analyses missing `data_env`+`body_text` columns → added.
**Task 2 followup (S3):** 1335 combined-run still timed out at 5000ms. Root cause layered: (1) bunfig.toml `timeout=30000` NOT applied by Bun 1.3.13 (5000ms default persists); (2) `ragInsertFn` defaults to `ragIndex()` HTTP call to localhost:5002/index — 1-2s per item when rag-service absent; (3) `teChromiumNews` cold-start 2s retry sleep. Fix: inject `ragInsert: async () => {}` + `teChromiumNews/newsapi: async () => []` into all pollNews calls; add `}, 15_000)` third-argument timeout to TC-1/TC-2/TC-3 (pattern from 137-fix-alert-pipeline.test.ts).
**Files:** 123-integration-mcp.test.ts, 1146-get-insider-transactions.test.ts, 1335-news-pipeline-rag-insert.test.ts
**Lesson:** Bun bunfig.toml `[test] timeout` is NOT honoured in Bun 1.3.13 — only per-test `it(label, fn, ms)` third-arg works. Always inject ragInsert+teChromiumNews mocks in pollNews integration tests to avoid HTTP latency in CI.
**tsc:** CLEAN | **Tests:** 48 pass / 0 fail (three files) | **Status:** REVIEW — await CI green
Zone health: bun tsc clean, 3 target test files 48 pass / 0 fail, tools 157 intact | HEALTHY

---

## 2026-06-08 · FIX-CI-COVERAGE-OOM-CRASH — DONE

**Task:** FIX-CI-COVERAGE-OOM-CRASH | Sprint: CI-RED-RECONCILE | Epic: CI-BUN-TEST-MULTI-CLASS-FIX
**Change:** `.github/workflows/ci.yml` Run-tests step: `bun test` → `bun test --coverage=false` (one line + inline comment).
**Rationale:** `bunfig.toml [test] coverage=true` causes coverage-table generation to OOM-crash on the CI runner AFTER all tests complete. CI exit=1 from crash, not from test failures — this is why CI has had no clean fail count for 200 runs. `--coverage=false` at invocation skips the crash and lets `bun test` emit a real pass/fail summary + correct exit code. `bunfig.toml` untouched (local dev keeps coverage).
**Validation:** `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"` — YAML valid. Exact line: `run: bun test --coverage=false`.
**No local test run** (correct per task spec — this changes CI invocation, not code under test; running locally would OOM under coverage).
**Files staged:** `.github/workflows/ci.yml` + `docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-dev-mcp-server.md` + `docs/agent-memory/notebooks/dev-mcp-server.md` — foreign dirty files NOT staged.

Zone health: CI-yaml only change, no code under test modified, no tools/scheduler impact | HEALTHY

---
**Cycle:** 2026-06-09 | **Task:** FIX-SCHEMA-DRIFT-P1 (Sprint CI-RED-RECONCILE, size M)
**Scope:** Phase 1 — data_env column addition to 63 inline rag_analyses DDLs + production fallback guard in pollNews.ts::tryInsertEntry
**Files changed:** 63 test files in apps/mcp-server/src/__tests__/ (data_env TEXT added to inline rag_analyses CREATE TABLE blocks) + pollNews.ts (try/catch fallback guard for data_env column absence, fredApi.ts pattern)
**DDL fix count:** 71 total rag_analyses blocks patched across 63 files (some files have multiple DDL blocks)
**tsc:** CLEAN (bun tsc --noEmit)
**Sanity test:** 102-job-news-poll.test.ts — no data_env column errors; inserted:1 confirmed working
**No Phase 2/3 work:** IF NOT EXISTS hardening, watchlist.exchange, agent_signals.expires_at, source_url, daily_ohlcv, macro tables NOT touched
Zone health: bun tsc --noEmit clean, tools/scheduler unchanged (test-only fix + one production defensive guard) | HEALTHY

## 2026-06-09 · CI-NETWORK-GUARDS-POLLNEWS-REFILE — REVIEW

**Task:** CI-NETWORK-GUARDS-POLLNEWS-REFILE | Sprint: CI-RED-RECONCILE | Commit: 64981565
**Scope:** `apps/mcp-server/src/application/usecases/pollNews.ts` ONLY — 4 CI=true guards re-filed from reverted 9454baad BATCH-2.
**Guards applied:**
1. teChromiumNews default fetcher: `async () => []` when `Bun.env.CI === "true"` (avoid 2s Chromium cold-start timeout)
2. Cold-start 2s retry: `&& Bun.env.CI !== "true"` guard (same)
3. newsapi fallback default: `async () => []` when `Bun.env.CI === "true"` (avoid ETIMEDOUT)
4. Yahoo Finance + SBV macro block: `if (Bun.env.CI !== "true") try {` (avoid ETIMEDOUT)
**Dry-run (CI=true, 3 files):** 1345a 6/0, 102 4p/6f (pre-existing data_env schema drift, owned by CI-TEST-SCHEMA-FIXTURE-SPIKE), 1288 2p/2f (same). No ETIMEDOUT. Total 2.53s.
**tsc:** CLEAN. Zero test file changes. DJ-GATE-1: sprint-DEEPFETCH-RAG-REDESIGN-dev-mcp-server.md S5.

Zone health: bun tsc --noEmit clean, network guards active, tools 157 intact, scheduler 76 cron.schedule | HEALTHY
