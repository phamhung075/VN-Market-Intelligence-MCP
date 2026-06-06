# Decision Journal — FETCH-OPS-PAGE-TRUTH / dev-mcp-server

**Agent:** dev-mcp-server
**Sprint:** FETCH-OPS-PAGE-TRUTH
**Task:** F-1
**Date:** 2026-06-06T23:44Z
**Commit:** c299f6c3

---

## Decisions

### D-1: Export `buildSql` for testability

**Decision:** Export `buildSql()` from `newsHeadlinesHandler.ts` (was private).

**Rationale:** AC-5 requires a unit test asserting domain anchor SQL. The function must be exported to be importable in the test file without instantiating an HTTP handler. No behaviour change — same logic, just accessible.

**Alternative rejected:** Testing via full handler + mock DB was considered but would obscure the SQL assertion and add more test setup complexity.

---

### D-2: `deriveProvider()` also tightened to domain anchors

**Decision:** Applied the same `.com` anchor fix to `deriveProvider()` for `reuters` and `bloomberg`.

**Rationale:** Handoff AC explicitly instructs "check `deriveProvider()` for the same pattern." Without this fix, a vietnambiz article slug containing "bloomberg" would be labelled `provider: "bloomberg"` in the `all` source aggregation, producing misleading source attribution even after the LIKE filter fix.

---

### D-3: SQLite slug extraction via inline SQL expression (not app-side processing)

**Decision:** Extract source slug in the SQL GROUP BY using CASE/substr/instr rather than fetching raw URLs and processing in TypeScript.

**Rationale:** Avoids loading all rag_analyses rows into application memory just to group them. SQLite can do the grouping server-side. The expression is verbose but correct for the known URL patterns (cafef.vn, www.vnexpress.net, vneconomy.vn, etc.).

**Risk accepted:** SQLite string functions are less expressive than regex. Edge cases (unusual URL formats) produce a null slug which is filtered by `HAVING source_slug IS NOT NULL AND source_slug != ''`. Any unrecognised format is silently excluded (acceptable — the endpoint returns only sources with parseable slugs).

---

### D-4: vpsProxy stale computed with 2h threshold (not per-service intervals)

**Decision:** In `fetchStatusHandler.ts`, vpsProxy stale is computed with a flat 2h threshold rather than the per-service EXPECTED_INTERVALS from `vpsProxyHealthHandler.ts`.

**Rationale:** The `fetchStatusHandler` is a consumer-facing freshness summary, not the authoritative operational SLA monitor (that is `vpsProxyHealthHandler`). The 2h threshold is consistent with the source freshness thresholds, giving a unified freshness concept across the response. The operational detail (5min prices / 10min news) stays in the dedicated VPS health endpoint.

---

### D-5: No auth on `/api/fetch-status`

**Decision:** No API key authentication on the new endpoint.

**Rationale:** Consistent with `/api/vps-proxy-health` (which is also unauthenticated). Both are read-only, no sensitive data. The endpoint serves the frontend dashboard directly.

---

## Test Results

21 tests, 0 failures — `bun test src/__tests__/F-1-fetch-ops-page-truth.test.ts`

## Live Verification

- `GET :3000/mcp/api/news/headlines?source=bloomberg` → `count: 0` (AC-1)
- `GET :3000/mcp/api/news/headlines?source=reuters` → `count: 0` (AC-2, no reuters.com URLs in DB — correct)
- `GET :3000/api/fetch-status` → `sources[13] + vpsProxy{prices,news,sbv,bctc} + bctcPipeline{pending:370,done:15,failed:0}` (AC-3, AC-4)
- No phantom bloomberg/reuters sources in `sources[]` (AC-4)
