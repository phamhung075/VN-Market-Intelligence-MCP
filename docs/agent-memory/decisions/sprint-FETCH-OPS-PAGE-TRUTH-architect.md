# Decision Journal — Sprint FETCH-OPS-PAGE-TRUTH (Architect)

---

## STEP: ARCH-FETCH-OPS-1 — Technical blueprint for fetch-operations page truth

**task_id:** ARCH-FETCH-OPS-1
**sprint:** FETCH-OPS-PAGE-TRUTH
**timestamp:** 2026-06-06T21:17:36Z
**author:** architect

---

### What was considered

**Problem A — Bloomberg URL filter false-positive:**
`buildSql("bloomberg")` uses `LIKE '%bloomberg%'` which matches any URL containing the string, including `vietnambiz` articles whose slugs reference bloomberg (e.g. `/thi-truong/bloomberg-du-bao-xxx`). The stale ghost is a 19-day-old vietnambiz article, not a real Bloomberg article. The crawl pipeline never fetches from bloomberg.com.

Options considered:
1. Domain-anchor the LIKE: `LIKE '%bloomberg.com%'` — will return 0 results (correct, bloomberg not crawled). Simple one-line change.
2. Remove the bloomberg source filter entirely from VALID_SOURCES — changes the API contract; existing callers would get a 400. Not worth the break.
3. Switch to explicit domain whitelist table — over-engineering for a 1-line fix.

**Decision: Option 1.** Domain anchor in `buildSql()` and `deriveProvider()`. Rationale: minimal change, correct behavior, does not break API contract.

---

### What was considered

**Problem B — totalLatencyMs:0 in macro external response:**
`handlers_external.go` hardcodes `"totalLatencyMs": 0` in the summary map. The handler calls `ComputeMacroUseCase.Execute()` which reads from SQLite only — no live HTTP calls, so no real latency is available.

Options considered:
1. Measure real query latency (time the `Execute()` call) and emit that as totalLatencyMs — misleading; that's DB query latency not source fetch latency. The PO brief says "measure real per-source latency or remove the fields."
2. Remove totalLatencyMs and per-source latencyMs entirely — honest. The Go handler already knows it is serving cached data. The frontend guards with `!== undefined`.
3. Add a `cached: true` field to explain the absence — extra complexity, not asked for.

**Decision: Option 2.** Remove the field. The frontend conditional render `{summary.totalLatencyMs !== undefined && (...)}` means the span silently disappears. This is the honest path. The macro handler comment already says "no live scraper calls" — emitting `totalLatencyMs:0` contradicts that comment.

---

### What was considered

**Problem C — Frontend source panels: Reuters/Bloomberg vs actual crawl sources:**
The current page has Reuters and Bloomberg panels. The system does not crawl Reuters or Bloomberg directly (Reuters is VPS-pushed RSS; Bloomberg is not crawled). The news DB has cafef, vnexpress, vneconomy, reuters (via VPS RSS push), and potentially other sources.

Options considered:
1. Hardcode the correct source names in JSX — violates PO brief "query system-map.json sources — never hardcode."
2. Read system-map.json in the Remix loader (server-side file read) — system-map.json has 28 data_sources many of which are not web-scraped news sources (fred, bctc-discover, hose, etc.). Surfacing all 28 as "fetch operations panels" is wrong.
3. New `GET /api/fetch-status` endpoint that queries `rag_analyses` for sources actually present in the DB — ground truth. Returns only sources with real data. No phantom sources.

**Decision: Option 3.** The fetch-status endpoint is the source of truth. The frontend loader calls this endpoint; source panels are rendered from the response. This satisfies "never hardcode" while also filtering to only real crawl corpus sources.

---

### What was considered

**Problem D — Gateway /mcp/* prefix-strip duality:**
Direct `/mcp/api/news/headlines` call through the gateway: service name = "mcp", `ResolveProxyPath` strips `/mcp` → sends `/api/news/headlines` to mcp-server. But mcp-server registers the route AT `/mcp/api/news/headlines` (WITH prefix). Result: 404 on direct gateway path.

The not-deployed rerouter path (e.g., `/news/bloomberg/headlines` → reroutes to `/mcp/api/news/headlines`) WORKS because it sends the full `/mcp/api/news/headlines` path directly to mcp-server without stripping.

Root cause: there are two arrival paths to mcp-server for these routes, and they disagree on whether the `/mcp` prefix is present.

Options considered:
1. Register aliases in mcp-server: add `/api/news/headlines`, `/api/kinh-dich/*`, `/api/prices/*` routes pointing to the same handlers — additive, safe, unblocks direct gateway proxy.
2. Remove `/mcp/api/` routes and move them to `/api/` only, update rerouter — destructive, requires coordinated change across two services plus rerouter.
3. Change `ResolveProxyPath` to NOT strip the `/mcp` prefix for the mcp service — changes behavior for ALL mcp paths, may break other routes.
4. SPIKE first, measure scope — correct since F-4 touches two services.

**Decision: SPIKE (F-4).** Timebox 4h. Recommended implementation if time permits: Option 1 (alias-only, additive). If the SPIKE overflows, the existing not-deployed-rerouter paths for the affected routes (kinh-dich, prices, news) already work. The new `GET /api/fetch-status` endpoint avoids the duality entirely by using the `/api/` path (virtual alias, NoProbe=true). PO brief marks this as deferred if it balloons scope.

---

### Why this design approach

- **Pattern reuse:** `fetchStatusHandler.ts` mirrors `vpsProxyHealthHandler.ts` (same DI pattern: db injected by caller in server.ts, plain Node http handler, inline SQL). No new infrastructure abstractions needed.
- **Minimal blast radius:** F-1, F-2, F-3 are fully independent from each other (different zones). F-4 only touches routes, not business logic.
- **BUILD-STANDARD: lean** — all four zones already exist as microservices. No new service bootstrap needed.
- **WIP=2 compliance:** Batch 1 (F-1+F-2) parallel is safe because the two zones share no files. Batch 2 (F-3) depends on F-1's new endpoint. F-4 can run parallel with Batch 2 or be deferred.
