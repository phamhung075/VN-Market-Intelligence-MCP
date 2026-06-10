# GFD-2: Pre-deploy validation gate for kinh-dich-service

**Task ID:** GFD-2  
**Owner:** dev-kinh-dich  
**Sprint:** GO-FLEET-DEPLOY  
**Size:** S (est. 2h)  
**Depends on:** GFD-1 (architecture brief complete)  
**Status:** IN_PROGRESS

## Context

kinh-dich-service is a Go service with go build exit 0 confirmed by PO (2026-06-10). Before ops can deploy and run the HONOR-PANIC-GUARD soak window, dev-kinh-dich must verify the service is genuinely ready for production bring-up: health endpoint working, linting clean, and compose healthcheck properly configured.

**Architecture brief reference:** docs/architecture-briefs/2026-06-10-go-fleet-deploy/brief.md § (c) § Bring-up order

## Acceptance Criteria (DoD)

- [ ] `cmd/server/main.go` /health endpoint exists and returns HTTP 200 locally with JSON containing `"status":"ok"` or equivalent
- [ ] `golangci-lint run ./...` passes with depguard enabled (Factory v2 G12 gate)
- [ ] `docker-compose.yml` healthcheck definition correct for port 5005 (interval, timeout, retries)
- [ ] No build errors: `go build ./...` exits 0 in apps/kinh-dich-service

## File Paths

- Zone root: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/kinh-dich-service`
- Health endpoint: `apps/kinh-dich-service/cmd/server/main.go`
- Lint config: `apps/kinh-dich-service/.golangci.yml`
- Compose: `docker-compose.yml` (search for kinh-dich section)

## Steps

1. **Verify health endpoint implementation:**
   - Confirm `/health` GET endpoint is defined in cmd/server/main.go
   - Run locally: `go run ./cmd/server/main.go` (in apps/kinh-dich-service)
   - In another terminal: `curl -s http://localhost:5005/health | jq .`
   - Confirm response is 200 and contains status field

2. **Verify linting:**
   - From apps/kinh-dich-service: `golangci-lint run ./...` must exit 0
   - Check depguard is configured in .golangci.yml

3. **Verify compose healthcheck:**
   - Confirm docker-compose.yml has healthcheck definition for kinh-dich service:
     - `test: ["CMD", "curl", "-f", "http://localhost:5005/health"]` or equivalent
     - Interval, timeout, retries set reasonably (e.g., interval=30s, timeout=10s, retries=3)

4. **Verify build:**
   - `cd apps/kinh-dich-service && go build ./...` must exit 0

## Next Steps (for ops)

Once GFD-2 passes, it unblocks GFD-6 (deploy + HONOR-PANIC-GUARD soak).

## Notes

- This is a gate check, not a feature implementation
- No code changes expected if health endpoint already exists
- If health endpoint missing, implement it before proceeding
