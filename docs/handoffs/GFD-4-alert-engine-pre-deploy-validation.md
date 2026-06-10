# GFD-4: Pre-deploy validation gate for alert-engine

**Task ID:** GFD-4  
**Owner:** dev-alert-engine  
**Sprint:** GO-FLEET-DEPLOY  
**Size:** S (est. 2h)  
**Depends on:** GFD-1 (architecture brief complete)  
**Status:** READY

## Context

alert-engine is a Go service with go build exit 0 confirmed by PO (2026-06-10). Before ops can deploy, dev-alert-engine must verify the service is production-ready: health endpoint working, linting clean, CGO sqlite + musl/libc in image, and compose healthcheck properly configured.

**Architecture brief reference:** docs/architecture-briefs/2026-06-10-go-fleet-deploy/brief.md § (a) § Go-Port Status Inventory

## Acceptance Criteria (DoD)

- [ ] `cmd/server/main.go` /health endpoint exists and returns HTTP 200 locally with JSON containing `"status":"ok"` or equivalent
- [ ] `golangci-lint run ./...` passes with depguard enabled (Factory v2 G12 gate)
- [ ] Dockerfile has musl/libc base image for CGO sqlite support (e.g., FROM alpine:3.x or similar musl-based)
- [ ] `docker-compose.yml` healthcheck definition correct for port 5006 (interval, timeout, retries)

## File Paths

- Zone root: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/alert-engine`
- Health endpoint: `apps/alert-engine/cmd/server/main.go`
- Lint config: `apps/alert-engine/.golangci.yml`
- Dockerfile: `apps/alert-engine/Dockerfile`
- Compose: `docker-compose.yml` (search for alert-engine section)

## Steps

1. **Verify health endpoint implementation:**
   - Confirm `/health` GET endpoint is defined in cmd/server/main.go
   - Run locally: `go run ./cmd/server/main.go` (in apps/alert-engine)
   - In another terminal: `curl -s http://localhost:5006/health | jq .`
   - Confirm response is 200 and contains status field

2. **Verify CGO sqlite + musl/libc:**
   - Check Dockerfile base image: `FROM alpine:3.x` or other musl-based distro (musl libc required for CGO sqlite)
   - Verify go.mod uses github.com/mattn/go-sqlite3 or similar CGO-enabled sqlite driver
   - Note: CGO is ENABLED (unlike technical-analysis), so libc must be present

3. **Verify linting:**
   - From apps/alert-engine: `golangci-lint run ./...` must exit 0
   - Check depguard is configured in .golangci.yml

4. **Verify compose healthcheck:**
   - Confirm docker-compose.yml has healthcheck definition for alert-engine service:
     - `test: ["CMD", "curl", "-f", "http://localhost:5006/health"]` or equivalent
     - Interval, timeout, retries set reasonably (e.g., interval=30s, timeout=10s, retries=3)

## Next Steps (for ops)

Once GFD-4 passes, it unblocks GFD-6 (deploy + HONOR-PANIC-GUARD soak).

## Notes

- This is a gate check, not a feature implementation
- CGO sqlite requires libc; alpine musl is correct choice
- If Dockerfile missing musl, switch base image or add libc package
