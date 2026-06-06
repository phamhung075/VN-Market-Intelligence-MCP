# F-1: mcp-server — news filter fix + fetch-status endpoint

**Sprint:** FETCH-OPS-PAGE-TRUTH  
**Owner:** dev-mcp-server  
**Size:** M  
**Created:** 2026-06-06T21:35:00Z  
**Depends:** None  
**Blocks:** F-3 (frontend depends on new fetch-status endpoint)

---

## Summary

Fix two related issues in mcp-server:

1. **News filter false-positive:** `LIKE '%bloomberg%'` matches vietnambiz slugs containing "bloomberg" (stale 19d ghost articles). Tighten to domain anchor `LIKE '%bloomberg.com%'` and `LIKE '%reuters.com%'`.
2. **New fetch-status endpoint:** Add `GET /api/fetch-status` aggregating: per-source article freshness (MAX created_at from rag_analyses), VPS proxy health, BCTC queue counts. Consumed by frontend dashboard.

---

## Files to Modify

- `apps/mcp-server/src/interface/mcp/routes/newsHeadlinesHandler.ts` — fix `buildSql()` LIKE filters
- `apps/mcp-server/src/interface/mcp/server.ts` — register `GET /api/fetch-status` route
- `apps/mcp-server/src/interface/mcp/routes/fetchStatusHandler.ts` (NEW) — handler for fetch-status aggregation

---

## Acceptance Criteria

1. **AC-1:** `GET :3000/mcp/api/news/headlines?source=bloomberg` returns `count:0` (no stale vietnambiz articles).
2. **AC-2:** `GET :3000/mcp/api/news/headlines?source=reuters` returns only articles with `source_url LIKE '%reuters.com%'`.
3. **AC-3:** `GET :3000/api/fetch-status` returns JSON with `sources[]`, `vpsProxy{}`, `bctcPipeline{}` structure (see response schema below).
4. **AC-4:** `sources[]` array contains only sources that have actual rows in `rag_analyses` table (no phantom sources).
5. **AC-5:** Unit test added: `buildSql("bloomberg")` and `buildSql("reuters")` SQL assertions verify domain anchors.

---

## Design Details

### Fix 1: Domain-Anchored LIKE Filters

**File:** `newsHeadlinesHandler.ts:47-51` (approx)

**Current:**
```typescript
WHERE source_url LIKE '%bloomberg%' OR source_url LIKE '%reuters%'
```

**Replace with:**
```typescript
WHERE source_url LIKE '%bloomberg.com%' OR source_url LIKE '%reuters.com%'
```

Also check `deriveProvider()` function for the same pattern and apply the same tightening.

---

### Fix 2: New GET /api/fetch-status Endpoint

**Response schema:**
```json
{
  "sources": [
    {
      "id": "cafef",
      "lastArticleAt": "2026-06-06T19:23:45Z",
      "ageMs": 123456,
      "count24h": 42,
      "status": "fresh"
    },
    {
      "id": "vnexpress",
      "lastArticleAt": "2026-06-06T18:15:30Z",
      "ageMs": 3600000,
      "count24h": 18,
      "status": "stale"
    }
  ],
  "vpsProxy": {
    "news": {
      "last_push": "2026-06-06T21:30:00Z",
      "stale": false,
      "pushes_24h": 88,
      "errors_24h": 0
    },
    "bctc": { ... },
    "prices": { ... },
    "sbv": { ... },
    "foreign-flow": { ... }
  },
  "bctcPipeline": {
    "pending": 5,
    "done": 120,
    "failed": 2
  }
}
```

**Handler logic:**

1. **sources[]:** Query `rag_analyses` for:
   - GROUP BY: source_url domain (extracted from domain path)
   - SELECT: MAX(created_at) as lastArticleAt, COUNT(*) WHERE created_at > NOW()-24h as count24h
   - Derive id from domain (e.g., "https://cafef.vn/..." → id="cafef")
   - Calculate ageMs = NOW - lastArticleAt
   - status = "fresh" if ageMs < 2h, "stale" if 2h–12h, "no-data" if null
   - **Guard:** Handle null `source_url` with `CASE WHEN source_url IS NOT NULL THEN ... END`

2. **vpsProxy{}:** Reuse existing `getVpsProxyHealth()` from `vpsPushLogStore.ts` (already available in `vpsProxyHealthHandler.ts`).

3. **bctcPipeline{}:** Extract pending/done/failed counts from the logic already in `GET /api/bctc-fetch-queue` handler.

**Route registration in server.ts:**
```typescript
app.get('/api/fetch-status', fetchStatusHandler.handle)
```

**Note:** Register at `/api/fetch-status` (NOT `/mcp/api/fetch-status`) to avoid the prefix-strip duality bug resolved in F-4. Use the `"api"` virtual alias in the gateway (NoProbe=true).

---

## Implementation Notes

- **DDD Layer:** `fetchStatusHandler.ts` is in `interface/http` layer (consistent with existing `vpsProxyHealthHandler.ts`). SQL query is inline (acceptable per existing pattern).
- **Reuse:** Leverage existing health/queue data sources — do NOT duplicate logic.
- **Testing:** Add unit test for `buildSql()` domain anchor verification.

---

## Risk Flags

- **R-2 (gateway path):** Frontend will call `/api/fetch-status`, NOT `/mcp/api/fetch-status`. Do NOT register under `/mcp/` prefix.
- **R-5 (null URLs):** Guard SQL GROUP BY with `CASE WHEN source_url IS NOT NULL`.

---

## Handoff Acceptance

This task is complete when:
- [ ] newsHeadlinesHandler LIKE filters tightened to `.com` domain anchors
- [ ] GET /api/fetch-status endpoint registered and responds with correct schema
- [ ] All AC above verified on running container at :3000
- [ ] Unit test added for buildSql domain anchors
- [ ] mcp-server container REBUILT (dev-team ops)
