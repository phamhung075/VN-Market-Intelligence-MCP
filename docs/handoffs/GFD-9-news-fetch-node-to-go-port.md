# GFD-9: Port news-fetch from Node to Go (RSS/API paths only)

**Task ID:** GFD-9  
**Owner:** developer (no dedicated specialist)  
**Sprint:** GO-FLEET-DEPLOY  
**Size:** L (est. 8h)  
**Depends on:** GFD-1 (architecture brief complete)  
**Status:** READY

## Context

news-fetch is currently a Node/Bun service with Playwright dependency. Per architect brief § (b) § news-fetch Port Scope, we are porting the CORE RSS/API news fetch logic to Go, but EXCLUDING Playwright/chromium scraping (that path is delegated to mcp-server's existing chromium cron).

**Why Go?** Playwright/Chromium is a runtime dependency, not language-specific. The RSS/API paths (vneconomy-rss, vnexpress-rss, newsapi, news-vps proxy) have no browser dependency and port cleanly to Go HTTP client.

**Why exclude Playwright?** The trading-economics-chromium source is already served by mcp-server's existing chromium scraper; news-fetch doesn't need its own headless browser.

**Architecture brief reference:** docs/architecture-briefs/2026-06-10-go-fleet-deploy/brief.md § (b) § news-fetch Port Scope

## Acceptance Criteria (DoD)

- [ ] New `go.mod` created at `apps/news-fetch/go.mod`
- [ ] Ported RSS/API news fetch logic: vneconomy-rss, vnexpress-rss, newsapi, news-vps proxy paths implemented in Go
- [ ] Playwright/chromium scraping NOT in scope (delegated to mcp-server); no browser dependency in new code
- [ ] Implement GET `/health` endpoint returning HTTP 200 with JSON `{"status":"ok"}`
- [ ] SQLite writes via modernc/sqlite with CGO=0 (pure Go)
- [ ] `golangci-lint run ./...` passes with depguard (Factory v2 G12 standard)
- [ ] Unit test coverage for each fetch path (RSS/API/VPS proxy)
- [ ] `go build ./...` exits 0 in apps/news-fetch

## File Paths

- Zone root: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/news-fetch`
- Existing Node code: `apps/news-fetch/src/` (for reference only; will be replaced)
- Existing compose config: `docker-compose.yml` (search for news-fetch section; port mapping 5008 stays same)
- New Go module: `apps/news-fetch/go.mod` (to create)
- Main entry: `apps/news-fetch/cmd/server/main.go` (to create)

## Implementation Scope

### In Scope (Port to Go)
- RSS feed fetchers: vneconomy-rss, vnexpress-rss (HTTP GET + XML parse + SQLite insert)
- NewsAPI path: newsapi.org integration (HTTP + JSON parse + SQLite insert)
- VPS proxy path: news-vps proxy integration (HTTP to VPS endpoint + response forward)
- `/health` endpoint for Docker healthcheck (port 5008)
- Unit tests covering each path
- golangci-lint + depguard compliance

### Out of Scope (Stay in mcp-server or skip)
- Playwright/Chromium scraping (trading-economics-chromium source)
- Headless browser functionality (not ported to Go version)
- mcp-server internal fallback path (remains unchanged)

## Implementation Steps

1. **Create project structure:**
   ```
   apps/news-fetch/
   ├── go.mod
   ├── go.sum
   ├── cmd/server/main.go
   ├── internal/
   │   ├── fetcher/
   │   │   ├── rss.go (vneconomy-rss, vnexpress-rss)
   │   │   ├── newsapi.go (NewsAPI integration)
   │   │   └── vps_proxy.go (news-vps proxy)
   │   └── store/
   │       └── sqlite.go (modernc/sqlite persistence)
   ├── .golangci.yml
   └── _test.go files (unit tests)
   ```

2. **Initialize Go module:**
   ```bash
   cd apps/news-fetch
   go mod init github.com/example/news-fetch
   go get github.com/ncruces/go-sqlite3
   go get github.com/nats-io/nats.go  # Or other HTTP lib as needed
   ```

3. **Implement RSS fetcher (internal/fetcher/rss.go):**
   - Fetch RSS feeds from vneconomy-rss and vnexpress-rss URLs
   - Parse XML, extract title, link, pubDate, summary
   - Write to SQLite via modernc/sqlite

4. **Implement NewsAPI fetcher (internal/fetcher/newsapi.go):**
   - Call NewsAPI endpoint with configured API key
   - Parse JSON response
   - Write results to SQLite

5. **Implement VPS proxy fetcher (internal/fetcher/vps_proxy.go):**
   - HTTP proxy to news-vps endpoint at configured VPS_HOST
   - Forward requests and responses
   - No transformation needed (passthrough)

6. **Implement SQLite store (internal/store/sqlite.go):**
   - Open modernc/sqlite database file
   - Provide Insert/Upsert functions for fetched news items
   - Ensure schema matches existing mcp-server expectations

7. **Implement main.go:**
   - FastAPI-like router (using chi or similar lightweight HTTP router)
   - GET `/health` → 200 OK
   - POST `/fetch` or GET endpoints that trigger fetchers
   - Start HTTP server on port 5008

8. **Add linting + depguard:**
   - Create `.golangci.yml` with depguard rules (no external cgo, no CGO_ENABLED)
   - Run `golangci-lint run ./...` and fix any issues

9. **Add unit tests:**
   - Test each fetcher path (mock HTTP responses, verify SQLite writes)
   - Aim for ≥80% coverage on fetch paths

10. **Verify build:**
    - `go build ./...` exits 0 from apps/news-fetch

## Testing

- **Local unit tests:** `go test ./...`
- **Local integration:** Run locally, verify `/health` endpoint
- **Lint:** `golangci-lint run ./...`

## Next Steps (for ops)

Once GFD-9 passes (Go port complete), it unblocks GFD-10 (deploy + HONOR-PANIC-GUARD soak).

## Notes

- This is a genuine port (Node → Go), not a feature addition
- Playwright remains in mcp-server; no new headless browser dependency
- SQLite schema must match existing mcp-server table structure (coordinate with dev-mcp-server if needed)
- news-fetch serves mcp-server's `get_agent_signals` tool; verify that tool path still works post-deploy
