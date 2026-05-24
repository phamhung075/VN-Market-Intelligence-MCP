# dev-api-gateway — Notebook

Zone: `apps/api-gateway/` | Stack: TS/Bun (active) + Go 1.22 (Phase 1 new sibling) | DB: none

## Working Memory

**Last task:** P1-AG-E2 G4 architecture fence (depguard + CI job) — 2026-05-24

**Status:** P1-AG-E2 DONE — commit 9fd1634e

**What changed (P1-AG-E2):**
- NEW: `apps/api-gateway/.golangci.yml` — golangci-lint v2 depguard config. fence-a: prim→module/app/interface/infra/net/http/net/http/httputil all denied. fence-b: module→app/interface/infra denied. fence-c: infra only in cmd/server/main.go.
- UPDATED: `.github/workflows/ci.yml` — added `api-gateway-go-lint` job (mirrors macro-go-lint shape), scoped to apps/api-gateway/, uses golangci-lint-action@v6.1.1 --config .golangci.yml.
- NEW: `apps/api-gateway/docs/g4-fence.md` — fence evidence doc: deny rules table, fence command, deliberate-violation protocol (Fence-A), CI job description.

**Test count:** 57 tests PASS (unchanged). go build exit 0. sandbox primitive total=11 pass=11. sandbox module total=1 pass=1.

**BITES PROOF (G4 proven non-false-green):**
- Violation: `import _ "net/http"` added to pkg/primitive/overall-status-computer/compute.go
- With violation: lint exit 1 — `import 'net/http' is not allowed from list 'fence-a': Fence-A: primitive must be pure-compute (zero I/O) — net/http forbidden (depguard)`
- After revert: lint exit 0 — `0 issues.`
- Violation NOT committed.

**AC status (P1-AG-E2):**
- AC-1: golangci-lint config with depguard rules present. PASS.
- AC-2: CI job api-gateway-go-lint added. PASS.
- AC-3: PROVEN-BITES — depguard named in non-zero output, clean after revert. Violation not committed. PASS.
- AC-4: go build ./... + go test ./... pass. PASS.
- AC-5 (G12): clean lint exit 0 + 57 go tests PASS. PASS.

**Signal:** docs/signals/dev-api-gateway-P1-AG-G4fence-done-2026-05-24T082113Z.json

**Previous tasks DONE:** B1 (overall-status-computer, ab534044), B2 (proxy-path-resolver, 239533dd), B3 (route-service-matcher, in HEAD), C1 (module/gateway, c956631d), E2 (G4 fence, 9fd1634e)

**Next tasks (Phase 1):**
- B5: cmd/sandbox runner + scenario execution (CGO_ENABLED=0 go run ./cmd/sandbox)
- B6: Trust dashboard HTML
