<!-- agent: developer | task: GFD-9 | sprint: GO-FLEET-DEPLOY -->

# Decision Journal — developer — GO-FLEET-DEPLOY

---

## DJ-GATE-1 — GFD-9: news-fetch Node→Go port

**Date:** 2026-06-10T21:08Z
**Agent:** developer
**Task-id:** GFD-9
**Sprint:** GO-FLEET-DEPLOY

### Decision

Port apps/news-fetch RSS/API paths from Node/Bun to Go. Playwright/chromium
scraping is explicitly excluded (stays in mcp-server's existing chromium cron).

### Scope delivered

- `apps/news-fetch/go.mod` — module `github.com/vn-market-intelligence/news-fetch`,
  go 1.22, chi v5 + modernc.org/sqlite v1.29.9 (pure-Go, CGO_ENABLED=0).
- `apps/news-fetch/cmd/server/main.go` — chi router, /health + 4 fetch endpoints
  + /fetch/all aggregate, port 5008, graceful shutdown.
- `apps/news-fetch/internal/fetcher/rss.go` — VnEconomyFetcher (2 feeds, dedup)
  + VnExpressFetcher. Browser UA set (Vietnamese sites block bots).
- `apps/news-fetch/internal/fetcher/newsapi.go` — NewsAPIFetcher with stub path
  (empty apiKey → zero I/O, safe in no-key deployments).
- `apps/news-fetch/internal/fetcher/vps_proxy.go` — VPSProxyFetcher, passthrough
  to VPS_HOST/news, stub path when VPS_HOST empty.
- `apps/news-fetch/internal/store/sqlite.go` — Store wrapping modernc/sqlite.
  Schema: rag_analyses DDL matching mcp-server schema-news.ts contract.
  UpsertNewsItem uses INSERT OR IGNORE (dedup by PK + source_url unique index).
- `apps/news-fetch/.golangci.yml` — v2 format, depguard 3 fences (Fence-A/B/C).
- Unit tests: 21 tests, 100% of fetch paths covered.

### Schema contract verification

Columns written by news-fetch Go service:
  `id, created_at, level='global', source_url, source_title, source_type, published_at`

These map exactly to the rag_analyses DDL in
`apps/mcp-server/src/infrastructure/db/schema-news.ts` lines 20-46.
Analysis columns (sentiment, impact_score, summary, etc.) remain NULL —
filled by mcp-server's fetch_and_analyze flow as before.
The source_url UNIQUE index is replicated so INSERT OR IGNORE deduplicates
on URL across restarts.

### Out of scope confirmed

No headless browser, no Playwright, no CGO. Node src/ directory retained for
reference. Deletion deferred to post-deploy GFD-10 verification.

### DoD evidence

- `go build ./...` exit 0
- `golangci-lint run ./...` — 0 issues (depguard Fence-A/B/C all pass)
- `go test ./...` — 21/21 PASS (fetcher: 15 tests, store: 6 tests)
- /health → 200 {"status":"ok","service":"news-fetch","port":5008}

### Status flip

GFD-9: READY → DONE (same commit as this DJ entry per DJ-GATE-1 rule).
GFD-10 (ops deploy) is now unblocked.

---

## GFD-12-CODE — api-gateway NOT_DEPLOYED_SERVICES stale default cleared

**Date:** 2026-06-11T00:45Z
**Agent:** dev-api-gateway
**Task-id:** GFD-12-CODE
**Sprint:** GO-FLEET-DEPLOY

### Root-cause

`apps/api-gateway/cmd/server/main.go:44` hard-coded `"rag,ta,stock,kinh-dich,alert,news"` as the fallback default for `NOT_DEPLOYED_SERVICES`. `docker-compose.yml:280` also pinned the same 6-list as the explicit env value. Both caused the gateway `/health` to report all 6 now-live SSOT-graduated services as `not_deployed` even after commit a6e1e8f8 promoted them to deployed.

### Fix

Changed both to empty: default arg `""` in main.go, and `NOT_DEPLOYED_SERVICES=` (blank) in docker-compose.yml. The `splitCSV("")` call returns an empty slice — correct zero-exclusion behaviour. `go build ./...` exits 0.
