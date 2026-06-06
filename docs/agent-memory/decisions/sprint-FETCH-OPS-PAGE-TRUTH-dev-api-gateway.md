# Decision Journal — F-4 SPIKE: /mcp/* prefix-strip duality
**Sprint:** FETCH-OPS-PAGE-TRUTH
**Agent:** dev-api-gateway
**Date:** 2026-06-07
**Task:** F-4

---

## Decision: Alias-only approach chosen (not full cleanup)

**Options considered:**
1. **Alias-only (chosen):** Add `/api/` prefix aliases in `apps/mcp-server/src/interface/mcp/server.ts` pointing to the same handlers as existing `/mcp/api/` routes. Additive, zero breaking changes.
2. **Full cleanup:** Remove `/mcp/api/` routes, keep `/api/` only, update not-deployed rerouter target paths. Non-trivial (8+ routes, rerouter logic, 2+ test files).

**Rationale:** Alias-only fit well within the 4h timebox (actual ~30 min). The full cleanup carries higher risk (touching rerouter rewrites which are tested but brittle). The alias-only approach:
- Does NOT break `/mcp/api/` paths (rerouter still works)
- Fixes the direct proxy 404 (gateway strips /mcp → /api/ aliases now resolve)
- Zero test changes required (rerouter unit tests pass unchanged)
- Backward-compatible: both `/mcp/api/` and `/api/` paths work in parallel

**Routes aliased (5 pairs):**
- `/mcp/api/kinh-dich/market` → alias at `/api/kinh-dich/market`
- `/mcp/api/kinh-dich/reading/:code` → alias at `/api/kinh-dich/reading/:code`
- `/mcp/api/prices/history` → alias at `/api/prices/history`
- `/mcp/api/prices/batch` → alias at `/api/prices/batch`
- `/mcp/api/news/headlines` → alias at `/api/news/headlines`

Note: `/api/fetch-status` (F-1) was already registered without `/mcp/` prefix — no alias needed.

---

## Scope measurement outcome

Measurement phase: 15 min (grep all `/mcp/api/` registrations, verified no middleware ordering issues, confirmed handler names were in scope).
Implementation: 15 min (10 if-blocks added, same handler references).
Test + verify: 15 min.
Total: ~45 min well within 4h timebox.

---

## Verification

**AC-1:** `GET :4000/mcp/api/news/headlines?source=cafef&limit=5` → HTTP 200, 3 cafef articles. PASS.
**AC-2:** `GET :4000/news/reuters/headlines` → HTTP 200, rerouter still works. PASS.
**AC-3:** `go test ./pkg/primitive/not-deployed-rerouter/...` → 15/15 PASS. Full `go test ./...` → 10 packages PASS.
**AC-4:** api-gateway NOT modified (alias-only touches mcp-server only) → gateway container rebuild NOT required.
**AC-5:** mcp-server container REBUILT — fresh image sha256:835858c91f5121014dc1a363b98f56bc975e6e97e98005fed49fb9945a0fca3d matches running container.

---

## Risk mitigation

- R-6 (duality boundary): alias-only is fully backward-compatible. Rerouter target paths (`/mcp/api/...`) still work because `/mcp/api/` routes remain registered.
- No Go code touched → no gateway rebuild required → api-gateway container untouched.
