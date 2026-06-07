# FETCH-OPS-PAGE-TRUTH — Architect Handoff

**Sprint:** FETCH-OPS-PAGE-TRUTH
**Tick:** 20260606T211736Z
**Architect task ref:** ARCH-FETCH-OPS-1

---

## [Architect] Brownfield Findings

### Zone

Multi-zone. PM MUST split into per-zone subtasks as specified in §Subtask Spec below.

- **F-1 (mcp-server):** `apps/mcp-server/` — remove bloomberg URL-filter false-positive; add per-source freshness age; add fetch status REST endpoint for dashboard enrich panel.
- **F-2 (macro-indicators):** `apps/macro-indicators/` — remove hardcoded `totalLatencyMs:0`; either measure real per-source latency or omit the field.
- **F-3 (frontend):** `apps/frontend/` — replace Reuters/Bloomberg panels with real crawl sources from system-map.json; show AGE with direction; consume new F-1 fetch-status endpoint; hide fake-zero latency.
- **F-4 (api-gateway / SPIKE):** `apps/api-gateway/` — resolve `/mcp/*` prefix-strip duality. Scoped as SPIKE/deferred per PO sequencing note; see §Gateway Duality below.

---

### Verified Paths

**apps/mcp-server:**
- `apps/mcp-server/src/interface/mcp/routes/newsHeadlinesHandler.ts:47-51` — `buildSql()` uses `LIKE '%bloomberg%'` on `source_url`, which matches `vietnambiz` slugs containing the string "bloomberg" (false-positive). Also `LIKE '%reuters%'` has the same class of risk.
- `apps/mcp-server/src/interface/mcp/server.ts:1979` — `GET /mcp/api/news/headlines` registered WITH the `/mcp/` prefix; the not-deployed rerouter path reaches it; the direct `/mcp/*` gateway proxy path strips `/mcp` and hits `/api/news/headlines` which is NOT registered → 404 (the gateway duality bug, F-4).
- `apps/mcp-server/src/interface/mcp/routes/vpsProxyHealthHandler.ts:115-120` — already emits `{stale, last_push, pushes_24h, errors_24h}` per VPS service (news, prices, foreign-flow, sbv, bctc). This is the serving data for the enrich panel.
- `apps/mcp-server/src/interface/mcp/routes/vpsNewsHealthHandler.ts:34-39` — `GET /api/health/vps-news`: returns `{lastPushAt, ageMs, healthy}` for the news push channel only.
- `apps/mcp-server/src/interface/mcp/server.ts:729` — `GET /api/bctc-fetch-queue` exists; returns the BCTC VPS queue state (pending/done/failed counts).
- `apps/mcp-server/src/interface/mcp/server.ts:1946` — `GET /api/vps-proxy-health` exists; returns per-service push freshness. This is the primary ENRICH endpoint.
- `apps/mcp-server/src/interface/mcp/server.ts:361` — `GET /api/news-fetch/live` exists; returns live DB inspection view for news rows.

**apps/macro-indicators:**
- `apps/macro-indicators/pkg/interface/http/handlers_external.go:161` — hardcoded `"totalLatencyMs": 0` in the summary map. No per-source `latencyMs` is populated. The handler calls `ComputeMacroUseCase.Execute()` which reads from SQLite (cached data) — no live HTTP calls are made, so real per-fetch latency is not available at response time.
- `apps/macro-indicators/pkg/application/dtos.go` — DTOs carry `source_tier`, `is_estimate`, `fetched_at_source` per field but no per-source fetch latency (by design: latency is not cached).

**apps/frontend:**
- `apps/frontend/app/routes/dashboard.fetch.tsx:1-6` — top-of-file comment: "Shows: last fetched Reuters headlines, Bloomberg headlines" — these sources do NOT correspond to the actual crawl pipeline.
- `apps/frontend/app/routes/dashboard.fetch.tsx:35-63` — loader calls `fetchReutersHeadlines()` and `fetchBloombergHeadlines()` which hit `/news/reuters/headlines` and `/news/bloomberg/headlines` via the not-deployed rerouter (these work, but the bloomberg route returns a vietnambiz false-positive).
- `apps/frontend/app/lib/api/client.ts:165-175` — `fetchReutersHeadlines` / `fetchBloombergHeadlines` defined; both call gateway paths that go through the rerouter to `/mcp/api/news/headlines?source=reuters|bloomberg`.
- `apps/frontend/app/domain/market.ts:51-98` — `MacroSourceEntry` has optional `latencyMs`; `parseMacroSources()` is a pure function ready for extension. `MacroSummary.totalLatencyMs` is typed as optional — frontend already guards with `!== undefined` check.

**apps/api-gateway:**
- `apps/api-gateway/pkg/primitive/not-deployed-rerouter/reroute.go:44-55` — rewrites `/news/reuters/headlines` → `/mcp/api/news/headlines?source=reuters` (WITH /mcp prefix). This path works because mcp-server registers the route AT `/mcp/api/news/headlines`.
- `apps/api-gateway/pkg/primitive/proxy-path-resolver/resolve.go:23-33` — `ResolveProxyPath` for non-`noProbe` services: `SplitN(reqPath, "/", 3)` strips the leading `/:service` segment. So `/mcp/api/news/headlines` → strips `/mcp` → `/api/news/headlines`. mcp-server has NO route at `/api/news/headlines`. This is the 404 path.
- `apps/api-gateway/pkg/infrastructure/registry.go:38-40` — `"api"` virtual alias registered as `NoProbe: true` which preserves the full path. `"mcp"` registered as `NoProbe: false` which strips the prefix.

---

### Reuse Patterns

- **F-1 news filter fix:** Extend `newsHeadlinesHandler.ts` `buildSql()` — replace URL-substring filter with an exact domain anchor (`source_url LIKE 'https://cafef.vn/%'` etc.). Do NOT duplicate the handler; edit in place.
- **F-1 fetch-status endpoint:** NEW endpoint `GET /api/fetch-status` — server-side aggregation of: `getVpsProxyHealth()` (already exists in `vpsPushLogStore.ts`), BCTC queue counts (already in `GET /api/bctc-fetch-queue` handler logic), and a per-source article freshness query (latest `created_at` per source slug group from `rag_analyses`). This is a NEW route in `server.ts` dispatching to a new handler `apps/mcp-server/src/interface/mcp/routes/fetchStatusHandler.ts` following the DI pattern (db injected).
- **F-2 macro latency:** Edit `handlers_external.go:161` in place — drop `totalLatencyMs` from the summary map. The frontend already guards with `!== undefined`, so removing the field causes the `{(summary.totalLatencyMs / 1000).toFixed(1)}s total` span to not render (correct behavior).
- **F-3 frontend loader:** Replace `fetchReutersHeadlines` + `fetchBloombergHeadlines` calls in `dashboard.fetch.tsx` loader with: (a) `fetchNewsHeadlines("all")` — a single endpoint call returning all sources, grouped server-side, and (b) `fetchFetchStatus()` — new client function calling `GET /api/fetch-status` via not-deployed rerouter (add to `client.ts`). Source panels derive from actual `system-map.json` data; do NOT hardcode source names in JSX.
- **F-4 gateway duality (SPIKE):** The simplest fix is registering the conflicting routes in mcp-server WITHOUT the `/mcp/` prefix (i.e., at `/api/news/headlines`, `/api/kinh-dich/market`, etc.) and updating the not-deployed rerouter to drop `/mcp` from its target paths. This is non-trivial because the rerouter rewrites and the direct proxy path must both land on the same mcp-server route. Scoped as SPIKE — dev-api-gateway must measure scope before committing. If scope is ≤ 4h, implement; if not, defer to own sprint.

---

### Design Decisions

**D-1: Source truth from system-map.json, not hardcoded JSX.**
Frontend loader reads `docs/data/system-map.json` at... actually, this is server-side Remix. The frontend Remix loader runs on the server (Node/Bun), so it CAN read the file directly with `fs.readFileSync` at loader time. Alternatively, the new `GET /api/fetch-status` endpoint in mcp-server returns the source list derived from the DB, not from the JSON file. Decision: `GET /api/fetch-status` endpoint constructs the source list by querying `rag_analyses` for distinct source URL groups — this is the ground truth (what is actually in the DB). No JSON file import in the Remix loader.

**D-2: Bloomberg false-positive fix — domain anchor, not delete.**
Change `WHERE source_url LIKE '%bloomberg%'` to `WHERE source_url LIKE '%bloomberg.com%'` (anchored to the actual domain). `vietnambiz` slugs containing "bloomberg" do not contain `.com`. Also fix reuters: `LIKE '%reuters.com%'`. This is a one-line change per source in `buildSql()`. The `deriveProvider()` function needs the same tightening.

**D-3: Macro latency — remove fake field, do not fabricate.**
Remove `totalLatencyMs: 0` from the summary map in `handlers_external.go`. The handler already knows it only reads from SQLite (no live HTTP calls), so latency is not a meaningful metric here. The frontend `MacroSummary.totalLatencyMs` is `optional` in the TypeScript type — the conditional render `{summary.totalLatencyMs !== undefined && (...)}` means the span disappears cleanly when the field is absent. Per-source `latencyMs` is also absent for the same reason — remove both.

**D-4: Fetch-status endpoint — NEW handler, server-side aggregation.**
`GET /api/fetch-status` (no /mcp prefix — plain `/api/` path, reachable via direct mcp-server call or via gateway `/api/*` virtual-alias which is `NoProbe: true` and passes the full path). Returns:
```json
{
  "sources": [
    { "id": "cafef", "lastArticleAt": "<ISO>", "ageMs": 1234, "count24h": 42, "status": "fresh|stale|no-data" },
    { "id": "vnexpress", ... },
    ...
  ],
  "vpsProxy": {
    "news": { "last_push": "<ISO>", "stale": false, "pushes_24h": 88, "errors_24h": 0 },
    "bctc": { ... },
    "prices": { ... },
    "sbv": { ... },
    "foreign-flow": { ... }
  },
  "bctcPipeline": {
    "pending": 5, "done": 120, "failed": 2
  }
}
```
The `sources[]` array is computed by querying `rag_analyses` for MAX(`created_at`) and COUNT WHERE `created_at > now()-24h`, GROUP BY source slug (derived from `source_url` domain). This gives honest per-source freshness age. Staleness threshold: >2h = stale.

**D-5: Frontend panel redesign — replace brand panels with source-truth panels.**
Remove the two-column Reuters/Bloomberg layout. New layout: (a) a per-source freshness table driven by `fetchFetchStatus().sources`, showing source name, age (e.g. "14 min ago"), direction indicator (fresh/stale), and 24h article count; (b) VPS proxy status panel driven by `fetchFetchStatus().vpsProxy` (existing data, surfaced for the first time); (c) BCTC pipeline summary driven by `fetchFetchStatus().bctcPipeline` (pending/done/failed); (d) Macro snapshot status (existing MacroPanel — keep but remove fake latency rendering).

**D-6: Age display with direction.**
Age = `now - lastArticleAt` formatted as "N min ago" / "N h ago". Direction indicator: green dot if fresh (<2h), amber if 2–12h, red if >12h. This satisfies "show per-source freshness AGE with direction."

---

### DDD Layer Assignment

| File | DDD Layer |
|------|-----------|
| `newsHeadlinesHandler.ts` | interface/http |
| `fetchStatusHandler.ts` (NEW) | interface/http |
| `fetchStatusHandler.ts` DB query | infrastructure (inline SQL in handler, consistent with existing pattern in vpsProxyHealthHandler.ts) |
| `handlers_external.go` | interface/http |
| `dashboard.fetch.tsx` | interface (Remix route/view) |
| `client.ts` additions | interface (API client tier-3) |
| `domain/market.ts` additions | domain (pure types) |

---

### Risk Flags

**R-1 (CRITICAL): Source list must not hardcode names from system-map.json.**
system-map.json `data_sources[*].id` includes entries that are NOT web-scraped news sources (e.g., `bctc-discover`, `muasamcong`, `sbv-vps`, `fred`, `hose`). The frontend must NOT display all 28 sources as "fetch operations" panels. The `GET /api/fetch-status` endpoint narrows to sources that actually have rows in `rag_analyses` — this is the correct filter. Never import system-map.json in the frontend directly; always use the serving endpoint.

**R-2: Gateway `/api/*` virtual alias path for fetch-status.**
`GET /api/fetch-status` uses the `"api"` virtual alias (NoProbe=true, full path preserved). The frontend client must call `/api/fetch-status`, NOT `/mcp/api/fetch-status`. This avoids the duality bug entirely for the new endpoint.

**R-3: `totalLatencyMs` removal is a breaking schema change on the macro response.**
Frontend `MacroSummary.totalLatencyMs` is typed `optional` and guarded with `!== undefined` — safe to remove server-side. Verify the conditional render guard before shipping.

**R-4: Bloomberg domain anchor is a behavior change.**
`LIKE '%bloomberg.com%'` will return 0 results (Bloomberg is not actually crawled). This is correct and expected — the PO brief confirms the bloomberg panel is a false-positive. The route `/news/bloomberg/headlines` returns 0 results → `[]` → the frontend "no headlines" state. This is honest. Dev must verify the stale article (the 19d ghost) no longer appears.

**R-5: `rag_analyses` source_url domain extraction.**
The GROUP-BY-domain query must handle null `source_url` (known to occur). Use `CASE WHEN source_url IS NOT NULL THEN ... END` guard. Also handle articles from VPS-pushed news where the URL format may differ from RSS-crawled articles.

**R-6 (gateway duality SPIKE boundary).**
F-4 touches the not-deployed rerouter AND all mcp-server `/mcp/api/*` route registrations. Changing route registrations in mcp-server is non-trivial (8+ routes). If the SPIKE overflows, the correct deferred solution is: add an explicit `/api/news/headlines` route alias in mcp-server server.ts pointing to the same handler (additive, not destructive). This would unblock the direct `/mcp/*` path without touching the rerouter. PM may choose to scope F-4 as this alias-only fix rather than full consolidation.

---

### BUILD-STANDARD

```
NEW FEATURE (apps/<svc>/ already exists for mcp-server, macro-indicators, frontend, api-gateway)
→ BUILD-STANDARD: lean
→ BUILD-STANDARD-REF: docs/standards/microservice-build-standard.md
→ NOTE: dev-* drives end-to-end per zone; no relay required
```

---

### Scan Clean

true ✓ — No DDD violations detected. New `fetchStatusHandler.ts` stays in interface layer (no domain imports from infrastructure). `buildSql()` fix is infrastructure-layer SQL, correct placement.

---

## Subtask Spec (for PM)

WIP cap = 2. Sequence: F-1 + F-2 in parallel (first batch, independent zones), then F-3 after F-1 ships (F-3 depends on new fetch-status endpoint), F-4 SPIKE in parallel with F-3 or deferred.

### F-1: ZONE apps/mcp-server/ — news filter fix + fetch-status endpoint

**Owner:** dev-mcp-server
**Size:** M
**Files:**
- `apps/mcp-server/src/interface/mcp/routes/newsHeadlinesHandler.ts` — fix `buildSql()` domain anchors
- `apps/mcp-server/src/interface/mcp/server.ts` — add `GET /api/fetch-status` dispatch
- `apps/mcp-server/src/interface/mcp/routes/fetchStatusHandler.ts` (NEW) — aggregated fetch status handler

**AC:**
1. `GET :3000/mcp/api/news/headlines?source=bloomberg` returns `count:0` (no stale vietnambiz ghost).
2. `GET :3000/mcp/api/news/headlines?source=reuters` returns only articles with `source_url LIKE '%reuters.com%'`.
3. `GET :3000/api/fetch-status` returns JSON with `sources[]` (AGE per source from DB), `vpsProxy{}`, `bctcPipeline{}`.
4. `sources[]` contains only sources that have actual rows in `rag_analyses` (no phantom sources).
5. Unit test: `buildSql("bloomberg")` SQL contains `reuters.com` / `bloomberg.com` domain anchors, not bare `%bloomberg%`.

### F-2: ZONE apps/macro-indicators/ — remove fake latency

**Owner:** dev-macro-indicators
**Size:** XS
**Files:**
- `apps/macro-indicators/pkg/interface/http/handlers_external.go:161` — remove `"totalLatencyMs": 0` from summary map; remove any per-source `latencyMs` fields that are hardcoded 0.

**AC:**
1. `GET :5004/external` response: `summary` object does NOT contain `totalLatencyMs` field.
2. Per-source entries under `sources` do NOT contain `latencyMs` field (or contain it only when a real measured value is available — which currently never happens; remove entirely).
3. Existing test `handlers_snapshot_contract_test.go` updated to assert absence of `totalLatencyMs`.
4. REBUILD macro-indicators container after change.

### F-3: ZONE apps/frontend/ — honest source panels + age display

**Owner:** dev-frontend
**Depends:** F-1 (fetch-status endpoint must exist), F-2 (macro latency removed)
**Size:** M
**Files:**
- `apps/frontend/app/routes/dashboard.fetch.tsx` — replace Reuters/Bloomberg panels; new source freshness table; VPS proxy panel; BCTC pipeline summary
- `apps/frontend/app/lib/api/client.ts` — add `fetchFetchStatus()` calling `GET /api/fetch-status`
- `apps/frontend/app/domain/market.ts` — add `FetchStatus`, `FetchSourceStatus`, `VpsProxyStatus`, `BctcPipelineStatus` types

**AC:**
1. `GET :3001/dashboard/fetch` 200 — no Reuters or Bloomberg panel rendered.
2. Source freshness table shows sources present in DB only (no phantom sources).
3. Each source row shows: name, age string ("N min ago"), direction indicator (green/amber/red), 24h count.
4. VPS proxy section shows: news/prices/bctc/sbv/foreign-flow last push time and stale status.
5. BCTC pipeline section shows: pending / done / failed counts.
6. Macro panel does NOT render the latency span (totalLatencyMs absent from response → conditional renders nothing).
7. Raw verify: no hardcoded source names in the TSX — all source names come from the API response.
8. REBUILD frontend container after change.

### F-4: ZONE apps/api-gateway/ + apps/mcp-server/ — /mcp/* prefix-strip duality (SPIKE)

**Owner:** dev-api-gateway
**Size:** SPIKE (timebox 4h)
**Depends:** F-1 (must not break while F-4 is in progress)
**Files:**
- `apps/mcp-server/src/interface/mcp/server.ts` — add `/api/news/headlines`, `/api/kinh-dich/market`, `/api/kinh-dich/reading/:code`, `/api/prices/history`, `/api/prices/batch` as aliases (same handlers) WITHOUT /mcp prefix
- `apps/api-gateway/pkg/primitive/not-deployed-rerouter/reroute.go` — update target paths to drop `/mcp` prefix once mcp-server aliases exist (or leave as-is since both paths now work)

**SPIKE boundary:** If both registrations (with and without `/mcp`) are needed for backward compat during rollout, keep both. The alias-only approach (add `/api/` prefixed routes) is additive and safe. If full cleanup (remove `/mcp/api/` routes + update rerouter) can be done in 4h with tests passing, do it. Otherwise scope to alias-only.

**AC:**
1. `GET :4000/mcp/api/news/headlines?source=cafef&limit=5` returns fresh cafef articles (was 404).
2. Not-deployed rerouter path still works: `GET :4000/news/reuters/headlines` still returns valid articles.
3. Existing rerouter unit tests pass.
4. REBUILD api-gateway container.
5. REBUILD mcp-server container (if mcp-server modified).

---

## Sequence / WIP Plan

```
Batch 1 (parallel, WIP=2): F-1 (mcp-server) + F-2 (macro-indicators)
Batch 2 (after F-1 DONE): F-3 (frontend)
Batch 3 (parallel with F-3 or deferred): F-4 SPIKE (api-gateway)
QA: verify all AC above on live containers at :3001/dashboard/fetch
```

---

## RETURN

```
DONE: Technical design complete, brownfield findings written to docs/handoffs/FETCH-OPS-PAGE-TRUTH-ARCH.md
ZONE: multi — F-1 apps/mcp-server/, F-2 apps/macro-indicators/, F-3 apps/frontend/, F-4 apps/api-gateway/ (SPIKE)
NEXT: pm | break into 4 subtasks per §Subtask Spec, respect WIP=2 cap, sequence Batch1→Batch2→Batch3+QA
HANDOFF: docs/handoffs/FETCH-OPS-PAGE-TRUTH-ARCH.md
PIPELINE: continue
```
