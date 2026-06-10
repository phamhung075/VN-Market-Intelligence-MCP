# GFD-3: Pre-deploy validation gate for technical-analysis

**Task ID:** GFD-3  
**Owner:** dev-technical-analysis  
**Sprint:** GO-FLEET-DEPLOY  
**Size:** S (est. 2h)  
**Depends on:** GFD-1 (architecture brief complete)  
**Status:** IN_PROGRESS

## Context

technical-analysis is a Go service with go build exit 0 confirmed by PO (2026-06-10). Before ops can deploy, dev-technical-analysis must verify the service is production-ready: health endpoint working, linting clean, CGO=0 flag set (modernc sqlite, no CGO), and compose healthcheck properly configured.

**Architecture brief reference:** docs/architecture-briefs/2026-06-10-go-fleet-deploy/brief.md § (a) § Go-Port Status Inventory

## Acceptance Criteria (DoD)

- [ ] `cmd/server/main.go` /health endpoint exists and returns HTTP 200 locally with JSON containing `"status":"ok"` or equivalent
- [ ] `golangci-lint run ./...` passes with depguard enabled (Factory v2 G12 gate)
- [ ] Dockerfile has `CGO_ENABLED=0` explicitly set (modernc/sqlite, no CGO dependencies)
- [ ] `docker-compose.yml` healthcheck definition correct for port 5003 (interval, timeout, retries)

## File Paths

- Zone root: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/technical-analysis`
- Health endpoint: `apps/technical-analysis/cmd/server/main.go`
- Lint config: `apps/technical-analysis/.golangci.yml`
- Dockerfile: `apps/technical-analysis/Dockerfile`
- Compose: `docker-compose.yml` (search for technical-analysis section)

## Steps

1. **Verify health endpoint implementation:**
   - Confirm `/health` GET endpoint is defined in cmd/server/main.go
   - Run locally: `go run ./cmd/server/main.go` (in apps/technical-analysis)
   - In another terminal: `curl -s http://localhost:5003/health | jq .`
   - Confirm response is 200 and contains status field

2. **Verify CGO=0 flag:**
   - Check Dockerfile has: `ENV CGO_ENABLED=0`
   - Verify go.mod uses modernc/sqlite, NOT github.com/mattn/go-sqlite3

3. **Verify linting:**
   - From apps/technical-analysis: `golangci-lint run ./...` must exit 0
   - Check depguard is configured in .golangci.yml

4. **Verify compose healthcheck:**
   - Confirm docker-compose.yml has healthcheck definition for technical-analysis service:
     - `test: ["CMD", "curl", "-f", "http://localhost:5003/health"]` or equivalent
     - Interval, timeout, retries set reasonably (e.g., interval=30s, timeout=10s, retries=3)

## Next Steps (for ops)

Once GFD-3 passes, it unblocks GFD-6 (deploy + HONOR-PANIC-GUARD soak).

## Notes

- This is a gate check, not a feature implementation
- modernc/sqlite is CGO=0 compatible (pure Go)
- If Dockerfile missing CGO_ENABLED=0, add it
