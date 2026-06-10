# GFD-5: Pre-deploy validation gate for stock-price

**Task ID:** GFD-5  
**Owner:** dev-stock-price  
**Sprint:** GO-FLEET-DEPLOY  
**Size:** S (est. 2h)  
**Depends on:** GFD-1 (architecture brief complete)  
**Status:** READY

## Context

stock-price is a Go service with go build exit 0 confirmed by PO (2026-06-10). Before ops can deploy, dev-stock-price must verify the service is production-ready: health endpoint working, linting clean, CGO sqlite + VPS_HOST env wiring correct, and compose healthcheck properly configured.

**Architecture brief reference:** docs/architecture-briefs/2026-06-10-go-fleet-deploy/brief.md § (b) § Target Topology

## Acceptance Criteria (DoD)

- [ ] `cmd/server/main.go` /health endpoint exists and returns HTTP 200 locally with JSON containing `"status":"ok"` or equivalent
- [ ] `golangci-lint run ./...` passes with depguard enabled (Factory v2 G12 gate)
- [ ] `docker-compose.yml` has `VPS_HOST` environment variable correctly wired (e.g., to vinahost VPS endpoint)
- [ ] `docker-compose.yml` healthcheck definition correct for ports 5000 and 5010 (interval, timeout, retries)

## File Paths

- Zone root: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/stock-price`
- Health endpoint: `apps/stock-price/cmd/server/main.go`
- Lint config: `apps/stock-price/.golangci.yml`
- Dockerfile: `apps/stock-price/Dockerfile`
- Compose: `docker-compose.yml` (search for stock-price section)

## Steps

1. **Verify health endpoint implementation:**
   - Confirm `/health` GET endpoint is defined in cmd/server/main.go
   - Run locally: `go run ./cmd/server/main.go` (in apps/stock-price)
   - In another terminal: `curl -s http://localhost:5000/health | jq .`
   - Confirm response is 200 and contains status field

2. **Verify VPS_HOST env wiring:**
   - Check docker-compose.yml has environment variable `VPS_HOST` set
   - Confirm it points to the correct VPS proxy endpoint (e.g., vinahost VPS)
   - Verify that code in cmd/server/main.go reads and uses VPS_HOST correctly

3. **Verify linting:**
   - From apps/stock-price: `golangci-lint run ./...` must exit 0
   - Check depguard is configured in .golangci.yml

4. **Verify compose healthcheck:**
   - Confirm docker-compose.yml has healthcheck definition for stock-price service:
     - `test: ["CMD", "curl", "-f", "http://localhost:5000/health"]` or equivalent
     - Interval, timeout, retries set reasonably (e.g., interval=30s, timeout=10s, retries=3)
   - Note: stock-price exposes both 5000 (internal) and 5010 (external); healthcheck should use 5000

## Next Steps (for ops)

Once GFD-5 passes, it unblocks GFD-6 (deploy + HONOR-PANIC-GUARD soak).

## Notes

- This is a gate check, not a feature implementation
- VPS_HOST wiring is critical for live market data fetch to work post-deploy
- If VPS_HOST missing, add it to docker-compose.yml environment section
