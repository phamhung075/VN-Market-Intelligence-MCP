# F-4: api-gateway SPIKE — /mcp/* prefix-strip duality

**Sprint:** FETCH-OPS-PAGE-TRUTH  
**Owner:** dev-api-gateway  
**Size:** SPIKE (4h timebox, DEFERRABLE)  
**Created:** 2026-06-06T21:35:00Z  
**Depends:** F-1 (must not break while F-4 is in progress)  
**Blocks:** None (F-3 does not use /mcp/* paths)

---

## Summary

Resolve the `/mcp/*` vs `/api/*` prefix-strip duality bug. The gateway has two path routes:

1. **Not-deployed rerouter:** Rewrites `/news/reuters/headlines` → `/mcp/api/news/headlines?source=reuters` (preserves /mcp prefix in target path).
2. **Direct proxy (production path):** Strips the service prefix via `proxy-path-resolver`, so `/mcp/api/news/headlines` becomes `/api/news/headlines` → **404** (mcp-server only registers routes at `/mcp/api/...`, not `/api/...`).

**Scope:** 4h timebox. Measure scope before committing. Recommended approach: **additive alias-only fix** (safest, minimal risk).

---

## Files to Modify

- `apps/mcp-server/src/interface/mcp/server.ts` — add route aliases (additive approach)
- `apps/api-gateway/pkg/primitive/not-deployed-rerouter/reroute.go` — optional, only if full cleanup is in scope

---

## Acceptance Criteria

1. **AC-1:** `GET :4000/mcp/api/news/headlines?source=cafef&limit=5` returns fresh cafef articles (was 404, now 200).
2. **AC-2:** Not-deployed rerouter path still works: `GET :4000/news/reuters/headlines` returns valid articles.
3. **AC-3:** Existing rerouter unit tests pass.
4. **AC-4:** api-gateway container REBUILT (dev-team ops).
5. **AC-5:** mcp-server container REBUILT if modified (dev-team ops).

---

## Design Details

### The Duality Bug Explained

**Not-deployed rerouter path:**
```
GET /news/reuters/headlines
  → rerouter rewrites to /mcp/api/news/headlines?source=reuters
  → gateway proxy-path-resolver receives /mcp/api/news/headlines
  → SplitN(reqPath, "/", 3) strips first segment (/mcp) → /api/news/headlines
  → mcp-server has NO route at /api/news/headlines
  → 404
```

**Why it "works":**  
The rerouter is in the not-deployed path (old fallback), so in practice it's never hit. F-1 adds the new `/api/fetch-status` endpoint which uses the NOT-deployed `/api/*` route. This breaks the direct proxy path for F-3 unless we fix the duality.

---

### Recommended Fix: Additive Alias-Only Approach

**Files to modify:** `apps/mcp-server/src/interface/mcp/server.ts` only.

Add route aliases without `/mcp/` prefix. These are additive (don't remove existing `/mcp/api/*` routes).

**Pseudocode:**
```go
// Existing routes (keep these)
app.Get("/mcp/api/news/headlines", newsHeadlinesHandler.Handle)
app.Get("/mcp/api/fetch-status", fetchStatusHandler.Handle)
app.Get("/mcp/api/kinh-dich/market", kindhichHandler.Handle)
app.Get("/mcp/api/kinh-dich/reading/:code", kindhichReadingHandler.Handle)
app.Get("/mcp/api/prices/history", pricesHistoryHandler.Handle)
app.Get("/mcp/api/prices/batch", pricesBatchHandler.Handle)

// New aliases (add these)
app.Get("/api/news/headlines", newsHeadlinesHandler.Handle)
app.Get("/api/fetch-status", fetchStatusHandler.Handle)
app.Get("/api/kinh-dich/market", kindhichHandler.Handle)
app.Get("/api/kinh-dich/reading/:code", kindhichReadingHandler.Handle)
app.Get("/api/prices/history", pricesHistoryHandler.Handle)
app.Get("/api/prices/batch", pricesBatchHandler.Handle)
```

**Result:**
- Direct proxy path `/mcp/*` → gateway strips `/mcp` → `/api/*` → aliases now work ✓
- Not-deployed rerouter path still works (routes at `/mcp/api/*` still exist) ✓
- No breaking changes ✓
- Scope: ~30 min (2 registrations per route)

---

### Alternative: Full Cleanup (Higher Scope Risk)

If 4h is insufficient after initial measurement, defer this approach.

**Would entail:**
1. Remove all `/mcp/api/*` route registrations from mcp-server.
2. Keep only `/api/*` routes.
3. Update not-deployed rerouter target paths to drop `/mcp` prefix.
4. Update all related tests.

**Scope:** 2–4h (8+ routes, 2+ test files).

**Risk:** Higher — touching rerouter logic is risky. Only attempt if alias-only proves insufficient and full cleanup is explicitly greenlit.

---

## Implementation Plan

1. **Measurement phase (30 min):**
   - Identify all `/mcp/api/*` routes in server.ts (list them).
   - For each route, determine if a simple `app.Get("/api/...", handler)` alias is feasible.
   - Verify no routing conflicts or middleware ordering issues.

2. **Implementation phase (30 min–1h):**
   - Add alias routes.
   - Run existing unit tests for routing (do NOT change tests).
   - Manual verification: `curl http://localhost:3000/api/news/headlines?source=cafef` returns data.

3. **Gateway testing (30 min):**
   - Build and run api-gateway locally or on test host.
   - Verify `GET :4000/mcp/api/news/headlines?source=cafef` returns data (direct proxy path).
   - Verify rerouter still works (if testing not-deployed path).

4. **Decision: Scope sufficient or defer?**
   - If alias-only completes in 1h with all tests passing → ship.
   - If unexpected issues or scope overrun → escalate to PM and architect, defer F-4 to own sprint.

---

## Risk Flags

- **R-6 (duality boundary):** The additive alias approach is fully backward-compatible and carries minimal risk. Full cleanup is riskier and only recommended if scope is confirmed ≤4h.
- **Breaking change risk:** Adding aliases does NOT break existing code; direct proxy path will now work instead of 404.

---

## Testing

Existing rerouter unit tests should pass unchanged (they test the `/mcp/api/*` paths, which still exist in the alias-only approach).

New test (optional but recommended):
```go
func TestGatewayDirectProxyPath(t *testing.T) {
  // Verify /api/news/headlines (alias) works
  resp, _ := http.Get("http://localhost:3000/api/news/headlines?source=cafef")
  assert.Equal(t, 200, resp.StatusCode)
  
  // Verify /mcp/api/news/headlines (original) still works
  resp, _ = http.Get("http://localhost:3000/mcp/api/news/headlines?source=cafef")
  assert.Equal(t, 200, resp.StatusCode)
}
```

---

## Handoff Acceptance

This task is complete when:
- [ ] Initial scope measurement completed (alias-only feasibility confirmed)
- [ ] Route aliases added to mcp-server server.ts (additive only)
- [ ] Existing routing tests pass
- [ ] Manual verification: `GET :3000/api/news/headlines?source=cafef` returns 200
- [ ] Gateway test: `GET :4000/mcp/api/news/headlines?source=cafef` returns data (direct proxy)
- [ ] Rerouter test (if applicable): existing tests still pass
- [ ] AC-1 through AC-5 verified
- [ ] If scope overrun: escalate to PM, document decision, defer if needed
- [ ] api-gateway container REBUILT (dev-team ops)
- [ ] mcp-server container REBUILT if modified (dev-team ops)
