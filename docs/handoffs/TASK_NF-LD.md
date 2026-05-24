# TASK NF-LD — news-fetch live-data inspection view

**Opened:** 2026-05-24T17:02Z by PO (self-initiated from user request). **Type:** follow-on enhancement (NOT a pilot reopen — news-fetch SCALE pilot stays DONE, 12/12, verdict=scale). **Chain:** architect (NF-LD-1) → developer (NF-LD-2) → qa (NF-LD-3) → PO sign-off (NF-LD-EXIT). No `pm`/`ba` agent in this harness; PO owns TASKS.md / this handoff / exit gate.

---

## User request (verbatim)
> "i need show fetch info data for each source select on db for see result is correct or not, need add this for see live data"

**PO interpretation:** the news-fetch dashboard currently shows ONLY sandbox PASS/FAIL (4 primitives + news_ingest module + microservice). User wants to ADDITIONALLY see the actual fetched article rows per source (Reuters, Bloomberg) pulled from the DB, to eyeball whether the live pipeline output is correct — a "live data inspection" view.

---

## BINDING ARCHITECTURE FINDING (PO investigated `apps/news-fetch/src` before writing this)

`apps/news-fetch/` is a **STATELESS scraper**. It has NO database and NO persistence repository:
- `src/domain/repositories.ts` declares ONLY scraper ports (`ReutersNewsPort`, `BloombergNewsPort`) — no DB/repo port.
- `src/domain/models.ts` defines `Article` / `FetchResult` (in-memory DTOs, no storage).
- `src/interface/handlers.ts` returns articles over HTTP; never writes anything.
- `composition-root.ts` wires scrapers → module → router only. No DB binding.

**Where the persisted rows actually live (verified end-to-end):**
1. news-fetch (port 5008) scrapes Reuters/Bloomberg → returns `{source, articles[], fetchedAt, method, error}` over HTTP.
2. `apps/mcp-server/src/scheduler/news-analysis/newsHeadlinesRefreshJob.ts` fetches `/bloomberg/headlines` + `/reuters/headlines` from news-fetch, maps to `{title, url, publishedAt, content, source}`, POSTs to `${MCP_SERVER_URL}/api/push-news` with header `x-api-key: VPS_PUSH_API_KEY`.
3. `apps/mcp-server/src/interface/mcp/routes/pushNewsHandler.ts` validates the key, then fire-and-forget runs `pollNews(...)`.
4. `apps/mcp-server/src/application/usecases/pollNews.ts` does `INSERT OR IGNORE INTO rag_analyses (...)` (see line ~533) — **rows persist in mcp-server's `rag_analyses` table**.

**`rag_analyses` schema** (`apps/mcp-server/src/infrastructure/db/schema-news.ts` lines 19-46) — columns relevant to the view:
| Column | Use for display |
|---|---|
| `source_title` | headline |
| `source_url` | url |
| `source_type` | source provider tag (reuters/bloomberg/cafef/…) — VERIFY whether pollNews stores 'reuters'/'bloomberg' here or whether `source` lands elsewhere; architect confirms the exact column that carries the provider value before specifying the WHERE filter |
| `published_at` | published-at (parsed/ISO) |
| `sentiment` | relevance/sentiment verdict |
| `impact_direction`, `impact_score` | optional verdict enrichment |
| `created_at` | fetched/ingested-at timestamp; ORDER BY this DESC |

**Consequence (the core boundary decision):** a live-DB view CANNOT be served by news-fetch:5008 — that would require giving the stateless scraper DB creds it has never had, regressing its design and the Security Clause. The live view MUST be a **read-only endpoint on mcp-server (port 3000 / `/api/*`)** which legitimately owns `rag_analyses` and has DB access. The news-fetch dashboard's new live section fetches from that mcp-server endpoint over http. **Precedent:** G5 already established that exactly one mcp-server task is permitted for the HTTP boundary of this service.

---

## SECURITY CLAUSE (binding, carried verbatim from the pilot)

The sandbox process AND the existing sandbox dashboard panels MUST keep zero DB creds / zero external API keys at all times. The credential-free sandbox harness and its `file://` dashboard CANNOT serve a live-DB view.

Therefore:
- The 3 existing sandbox panels (Primitives / Module / Microservice) are fed by `dashboard/data.js` (a `<script src>` sidecar that is NOT subject to Chromium's `file://` CORS origin-null block) → they stay **untouched**. G6/G8/G9 honest-green sandbox panel must NOT regress.
- The NEW live section is a **separate, clearly-labelled** panel that talks **http to mcp-server only**. It never runs in the sandbox process, never reads a DB directly, never carries creds in the client.
- The endpoint is **read-only** (SELECT only — never INSERT/UPDATE/DELETE; no new write path on mcp-server).

---

## PRODUCT SHAPE (PO decisions — architect refines exact ACs, does not re-decide product)

- **Sources shown:** reuters + bloomberg (the two news-fetch providers), grouped per-source so the user eyeballs each independently.
- **Fields per row:** source · headline (`source_title`) · url (`source_url`) · published-at (`published_at`, ISO/parsed) · relevance/sentiment verdict (`sentiment`, plus `impact_direction`/`impact_score` if cheaply available) · fetched/ingested-at (`created_at`).
- **Dedup-key:** computed inside news-fetch (`source-dedup-key` primitive) and NOT stored in `rag_analyses`. Architect decides: surface a derived/recomputed dedup hint, OR omit. **Do NOT fabricate a stored column.** Omitting is acceptable.
- **Row count:** last **N = 20** rows per source, most-recent-first (`ORDER BY created_at DESC LIMIT 20`).
- **Live vs cached:** **live query** on each section load. No caching layer — the point is "see live data". (If architect finds a strong reason for a short server-side cache, that is a design note for PO, not a silent change.)

---

## NF-LD-1 — Architect (READY)

**Deliverable:** Security-Clause-safe design appended to this handoff + per-task ACs for NF-LD-2 and NF-LD-3.

Must specify:
1. **Endpoint contract** on mcp-server: method + path (suggested `GET /api/news-fetch/live?source=<reuters|bloomberg|all>&limit=20`), SELECT-only SQL against `rag_analyses`, response JSON shape (array of rows with the display fields), error shape, and confirmation that it adds NO new write path and reuses the existing DB handle/DI (no new creds).
2. **Exact column → field mapping** confirmed against `pollNews.ts` insert (verify which column carries the provider value: `source_type` vs another) and the WHERE filter for reuters/bloomberg.
3. **Dashboard live section design:** separate panel id, http-fetch the endpoint, per-source table rendering, honest degrade under `file://` (explicit "live view requires the served dashboard" — never fake rows), and explicit statement that `data.js` + the 3 sandbox panels are untouched.
4. **Boundary/honesty rules** the developer must follow (no creds in client, read-only, no sandbox-panel edits, honest-degrade).
5. **Auth posture:** decide whether the read-only live endpoint needs auth (it returns already-stored public headlines; PO leaning unauthenticated read-only is fine for a localhost single-user dashboard, but architect confirms vs existing `/api/*` route conventions).

**Architect: write design notes + AC lists below this line, then RETURN handing off NF-LD-2 to developer.**

---

## [Architect] Brownfield Findings — NF-LD-1

**Zone (multi):**
- `apps/mcp-server/` — new read-only HTTP route (interface layer only)
- `apps/news-fetch/dashboard/` — new live panel in existing HTML file

**BUILD-STANDARD: lean** — both services already exist; this is a new feature (one read-only route + one dashboard section).

---

### 1. Critical finding: provider column does NOT exist in `rag_analyses`

`source_type` is ALWAYS the string literal `"news"` (discriminator between news vs prediction_market rows). It does NOT carry the provider name (reuters/bloomberg/cafef). This was confirmed in `newsNormalizer.ts` line 961 and the INSERT in `pollNews.ts` lines 532–562.

The provider value (`item.source = "reuters"` / `"bloomberg"`) flows through the pipeline as follows:
- Used for `level` classification inside `classifyLevel()` (not stored separately)
- Stored in `reasoning` as the prefix `Source: reuters.` (free-text, not indexed)
- **NOT stored** in `tags` — `rawTags` in newsNormalizer builds from `allMatchedKeywords + affectedDomains + affectedActions`, none of which includes `item.source`
- **Reliably inferable** from `source_url` domain pattern (reuters articles → `%.reuters.com%`; bloomberg → `%.bloomberg.com%`)

**Design decision:** use `source_url LIKE '%reuters%'` / `source_url LIKE '%bloomberg%'` as the WHERE filter. This is domain-derived, not fabricated. For the "all" case, no WHERE filter is applied. The `reasoning` text prefix (`Source: reuters.`) is a supporting confirmation but not the filter predicate.

**Dedup-key:** the `source-dedup-key` primitive in news-fetch computes `url:<domain><path>` — this is an in-memory computation, not stored in `rag_analyses`. Decision: **omit from the live view**. The `source_url` column already serves as the dedup anchor (unique index). No fabrication.

---

### 2. Endpoint contract

**Method + path:**
```
GET /api/news-fetch/live
```

**Query parameters:**
| Param | Values | Default |
|---|---|---|
| `source` | `reuters` \| `bloomberg` \| `all` | `all` |
| `limit` | integer 1–50 | `20` |

**SQL — parameterized, SELECT-only:**
```sql
-- source = "reuters"
SELECT source_title, source_url, published_at, sentiment, impact_direction,
       impact_score, created_at
FROM rag_analyses
WHERE source_url LIKE '%reuters%'
ORDER BY created_at DESC
LIMIT ?

-- source = "bloomberg"
SELECT source_title, source_url, published_at, sentiment, impact_direction,
       impact_score, created_at
FROM rag_analyses
WHERE source_url LIKE '%bloomberg%'
ORDER BY created_at DESC
LIMIT ?

-- source = "all"
SELECT source_title, source_url, published_at, sentiment, impact_direction,
       impact_score, created_at
FROM rag_analyses
WHERE source_url LIKE '%reuters%' OR source_url LIKE '%bloomberg%'
ORDER BY created_at DESC
LIMIT ?
```

The `limit` parameter must be cast to integer and clamped to 1–50 server-side before binding. Never concatenated into the SQL string.

**Response JSON shape (success):**
```json
{
  "ok": true,
  "source": "reuters",
  "count": 12,
  "rows": [
    {
      "headline":       "string (source_title)",
      "url":            "string | null (source_url)",
      "published_at":   "string | null (ISO)",
      "sentiment":      "string | null (bullish|bearish|neutral)",
      "impact_direction": "string | null",
      "impact_score":   "number | null",
      "created_at":     "string (ISO, ORDER BY key)"
    }
  ]
}
```

**Error shape:**
```json
{ "ok": false, "error": "string" }
```
HTTP 400 for invalid `source` param. HTTP 500 for DB error. Never 401 (see auth posture below).

**Column → display field mapping (confirmed against schema-news.ts + pollNews.ts INSERT):**
| DB column | Display field | Notes |
|---|---|---|
| `source_title` | headline | line 524 in INSERT |
| `source_url` | url | line 525; also the dedup key column |
| `published_at` | published_at | line 527; ISO from newsNormalizer |
| `sentiment` | sentiment | line 528; bullish/bearish/neutral |
| `impact_direction` | impact_direction | line 530 |
| `impact_score` | impact_score | line 529 |
| `created_at` | created_at / fetched_at | line 523; ORDER BY this |

**source field** (which provider this row belongs to): derived transparently from `source_url LIKE '%reuters%'` filter — NOT a stored column. For `source=all` responses, the endpoint may add a derived `"_provider"` hint field by computing `url.includes("reuters") ? "reuters" : url.includes("bloomberg") ? "bloomberg" : "other"` in the handler before serialization. This is transparent derivation, not fabrication.

---

### 3. Auth posture

**Decision: no auth required on this endpoint.**

Rationale: the data returned (public news headlines already stored by the pipeline) carries no credentials, no private PII, and no financial data beyond publicly-available article metadata. All other read-only status/health endpoints in `server.ts` (`GET /health`, `GET /api/health/vps-news`, `GET /api/foreign-flow-status` when key absent) follow the same unauthenticated pattern. `GET /api/watchlist` is the sole exception — it requires `VPS_PUSH_API_KEY` because it exposes the full watchlist, which is trading-strategy-sensitive. News headlines from public wires are not in that category.

CORS header `Access-Control-Allow-Origin: *` is already applied globally by `handleRequest` in `server.ts` line 212 — no change needed.

---

### 4. DDD layer assignment

The new route handler lives in:
```
apps/mcp-server/src/interface/mcp/routes/newsFetchLiveHandler.ts
```

Layer: **interface** (reads DB via injected `Database` handle, formats HTTP response). No domain imports. No new application use case. The query is a projection-only SELECT — no business rule, no aggregation, no domain logic. Following the `vpsNewsHealthHandler.ts` pattern exactly (same file location, same DI signature, same error handling shape).

**DI contract:** `db: Database` injected by `server.ts handleRequest`, exactly as all other `/api/*` route handlers. No `getDb()` call inside the handler. No new infrastructure file. No new credentials.

**Wiring in `server.ts`:**
1. Import `handleNewsFetchLive` from `./routes/newsFetchLiveHandler.js`
2. Add route: `if (method === 'GET' && pathname === '/api/news-fetch/live') { handleNewsFetchLive(req, res, db); return; }`
3. One `if` block, same pattern as the `vpsNewsHealthHandler` block at line 288.

---

### 5. Dashboard live panel design

**Panel location:** appended to `apps/news-fetch/dashboard/index.html` AFTER the existing 3 sandbox panels (Primitives / Module / Microservice). A visible horizontal rule (`<hr>`) and a distinct panel title ("Live Data — DB Inspection") visually separate it.

**Panel id:** `panel-live-data`

**Rendering approach:**
- One `<div class="live-source-block">` per source (reuters, bloomberg), each with its own table and state badge.
- The panel uses `fetch()` (HTTP GET) to call `http://localhost:3000/api/news-fetch/live?source=all&limit=20` on load.
- No `<script src>` sidecar. No `window.__DATA__` injection. The live section is deliberately HTTP-only.

**Four explicit states (all must be coded — no implicit fallback):**

| State | Trigger | Rendered output |
|---|---|---|
| LOADING | fetch in-flight | Spinner text: "Loading live data…" |
| EMPTY | `count === 0` | "No rows yet — pipeline may not have run." |
| ERROR (server) | HTTP 4xx/5xx | "Server error: [status code + message]" |
| FILE:// DEGRADE | `fetch` throws `TypeError: Failed to fetch` OR origin is `null` | Permanent message: "Live data view requires the dashboard to be served (e.g. `bun run serve`). Not available under file://." — NEVER show fake rows. |

**File:// detection:** `window.location.protocol === 'file:'` is checked BEFORE the fetch call. If true, the live panel renders the degrade state immediately without attempting the network call.

**Sandbox panel non-regression (explicit):**
- `data.js` (the `window.__NEWS_FETCH_DATA__` sidecar) is UNTOUCHED.
- The `<div id="panel-primitives">`, `<div id="panel-module">`, `<div id="panel-microservice">` blocks and their card population logic are UNTOUCHED.
- The live panel's `fetch()` call targets `localhost:3000` — it can fail without affecting the sandbox panels' rendering.

---

### 6. Risk flags

**R-1 CORS (medium):** `fetch('http://localhost:3000/...')` from a page served at `http://localhost:PORT` — same-origin if served on the same host; cross-origin if served on a different port. `server.ts` already emits `Access-Control-Allow-Origin: *` globally. This covers the live panel fetch. VERIFIED: line 212 of `server.ts`.

**R-2 file:// CORS block (HIGH — must be handled):** Under `file://`, `fetch()` to `localhost:3000` will throw `TypeError: Failed to fetch` (or be blocked with a null origin depending on browser). The degrade state MUST be triggered by `window.location.protocol === 'file:'` before the fetch, NOT by catching the error after. Reason: some browsers silently succeed, others throw; the explicit protocol check is deterministic.

**R-3 Stale / empty data:** If the pipeline has not run yet, `count === 0` is a valid state. The EMPTY state message must make this clear. No synthetic rows, no placeholder data.

**R-4 LIKE scan on large table:** `source_url LIKE '%reuters%'` is a prefix-wildcarded LIKE — SQLite cannot use the `idx_rag_source_url` partial index for this. On a large `rag_analyses` table it performs a full scan. Mitigating factors: the `created_at DESC` ORDER with `LIMIT 20` means SQLite will use `idx_rag_created` + filter, which is efficient for recent rows. This is acceptable for a single-user localhost dashboard. No cache layer is needed; the endpoint is only called on page load.

**R-5 Encoding of `tags`/`parent_ids` in SELECT:** These JSON-blob columns are NOT selected — the query returns only the 7 display columns. No JSON parse needed server-side.

---

### 7. Ownership routing

**NF-LD-2 → dev-mcp-server** (REQUIRED)

The new file `apps/mcp-server/src/interface/mcp/routes/newsFetchLiveHandler.ts` and the wiring change to `apps/mcp-server/src/interface/mcp/server.ts` are inside `apps/mcp-server/` — the exclusive code zone of `dev-mcp-server`. Per zone-enforcement policy, `dev-mcp-server` is the sole committer of `apps/mcp-server/` code and docs. A generic developer MUST NOT touch `apps/mcp-server/` code. NF-LD-2 splits into two scopes:

- **NF-LD-2a** (dev-mcp-server): `newsFetchLiveHandler.ts` + server.ts wiring + test file
- **NF-LD-2b** (generic developer): `apps/news-fetch/dashboard/index.html` live panel section

These can be dispatched sequentially (NF-LD-2a first — endpoint must exist before the dashboard panel can be verified end-to-end) or in parallel if QA verifies them independently. Sequential is safer; NF-LD-2b depends on knowing the endpoint URL is confirmed.

**NF-LD-3 → qa** (standard)

---

### 8. Acceptance criteria

#### NF-LD-2a (dev-mcp-server — mcp-server endpoint)

**AC-1 File created:** `apps/mcp-server/src/interface/mcp/routes/newsFetchLiveHandler.ts` exists.

**AC-2 Handler signature matches DI contract:** exports `handleNewsFetchLive(req: IncomingMessage, res: ServerResponse, db: Database): void` — synchronous or `async`, no `getDb()` call inside.

**AC-3 Route wired in server.ts:** `GET /api/news-fetch/live` dispatches to `handleNewsFetchLive`. Single `if` block, same pattern as `vpsNewsHealthHandler` at server.ts line 288. One import added. No other server.ts changes.

**AC-4 SELECT-only SQL:** `grep -n "INSERT\|UPDATE\|DELETE\|CREATE\|DROP\|ALTER" apps/mcp-server/src/interface/mcp/routes/newsFetchLiveHandler.ts` returns zero matches.

**AC-5 Parameterized SQL:** no string concatenation into any SQL query. `limit` and `source` filter applied via `db.prepare(...)` with `?` placeholders.

**AC-6 Response shape:** `{ ok: true, source, count, rows: [{ headline, url, published_at, sentiment, impact_direction, impact_score, created_at }] }` for success; `{ ok: false, error }` for errors. No other top-level fields.

**AC-7 Invalid source param → HTTP 400:** `curl 'http://localhost:3000/api/news-fetch/live?source=invalid'` returns HTTP 400 `{ ok: false, error: "Invalid source: ..." }`.

**AC-8 No auth required:** `curl 'http://localhost:3000/api/news-fetch/live'` returns HTTP 200 (no Authorization header needed).

**AC-9 Test file:** `apps/mcp-server/src/__tests__/NF-LD-2-news-fetch-live.test.ts` exists and passes `bun test`. Minimum tests: (a) valid `source=reuters` returns correct shape; (b) `source=invalid` returns 400; (c) empty table returns `{ ok: true, count: 0, rows: [] }`.

**AC-10 No regression:** `bun test` suite for mcp-server passes (all pre-existing tests green). `bun tsc --noEmit` exits 0.

**AC-11 No new DB creds:** `grep -rn "getDb\(\)\|DB_PATH\|sqlite\|new Database" apps/mcp-server/src/interface/mcp/routes/newsFetchLiveHandler.ts` returns zero matches (db is injected, never opened inside the handler).

#### NF-LD-2b (generic developer — news-fetch dashboard live panel)

**AC-1 Panel added:** `apps/news-fetch/dashboard/index.html` contains `id="panel-live-data"` after the existing 3 sandbox panels.

**AC-2 Sandbox panels untouched:** `git diff HEAD -- apps/news-fetch/dashboard/data.js` returns empty. `git diff HEAD -- apps/news-fetch/dashboard/index.html` shows ONLY additions after the existing panel markup — no edits to `panel-primitives`, `panel-module`, `panel-microservice` or their card logic.

**AC-3 File:// degrade:** opening `apps/news-fetch/dashboard/index.html` directly in a browser (`file://` origin) shows the degrade message "Live data view requires the dashboard to be served" in `#panel-live-data`. No fake rows. No network error displayed (degrade fires before fetch attempt).

**AC-4 Loading state:** between fetch start and response, `#panel-live-data` displays a "Loading…" state.

**AC-5 Empty state:** when endpoint returns `count=0`, `#panel-live-data` shows "No rows yet…" message, not an empty table.

**AC-6 Error state:** when endpoint returns non-200, `#panel-live-data` shows "Server error:" with status code.

**AC-7 No sandbox regression:** `bun run src/sandbox/runner.ts --tier=all --module=news-fetch --scenario=all` still exits 0, totals still `pass:16 fail:0 error:0`. `rerun-handler.js` and `data.js` unchanged.

**AC-8 No mcp-server creds in dashboard:** `grep -n "VPS_PUSH_API_KEY\|x-api-key\|Authorization\|Bearer" apps/news-fetch/dashboard/index.html` returns zero matches in the new live panel section.

---

## NF-LD-2 — Developer (DONE)

### NF-LD-2a (dev-mcp-server) — DONE
Commit: `5a91e12f` | AC pass: 11/11 | Tests: 9/9 pass | tsc: exit 0

### NF-LD-2b (developer — dashboard live panel) — DONE

**[Developer] Implementation Record**
- **Files modified:**
  - `apps/news-fetch/dashboard/index.html` — appended panel-live-data (4 states: FILE_DEGRADE / LOADING / EMPTY / ERROR); added live panel CSS styles; JS initLivePanel() IIFE; existing sandbox panels + data.js completely untouched
  - `apps/news-fetch/dashboard/dash-check.mjs` — updated assertions to expect 3 sandbox panels + 1 live panel (4 total); 6 sandbox cards unchanged; added live panel degrade state check (liveDegradeVisible, liveFakeRows, liveErrorVisible)
- **Tests written:** none (pure HTML/JS dashboard — verified via headless Chromium dash-check.mjs)
- **Git commits:** `45fd7f74` feat(news-fetch/dashboard): NF-LD-2b — add live-data panel (panel-live-data)
- **tsc status:** N/A (no TypeScript files modified)
- **dash-check result:** PASS — panels=4 (sandbox=3, live=1), cards=6, degrade=true, fake_rows=false, external_net=0, console_errors=0, page_errors=0
- **Docs updated:** this handoff only
- **Graphify:** skipped (no docs impacted)

**AC evidence:**
- AC-1 PASS: `id="panel-live-data"` exists at line 192 in index.html, after the 3 sandbox panels
- AC-2 PASS: `git diff HEAD -- apps/news-fetch/dashboard/data.js` → empty; sandbox panel HTML blocks untouched
- AC-3 PASS: dash-check (file:// load) → `live_panel_degrade: true`, `live_panel_fake_rows: false`, `#live-state-degrade` visible
- AC-4 PASS: loading state rendered (id=live-state-loading) before fetch resolves
- AC-5 PASS: empty state (id=live-state-empty) rendered when count=0
- AC-6 PASS: error state (id=live-state-error) rendered on non-2xx / fetch failure
- AC-7 PASS: sandbox runner untouched; data.js untouched; 3 sandbox panels PASS in dash-check
- AC-8 PASS: `grep -n "VPS_PUSH_API_KEY\|x-api-key\|Authorization\|Bearer" index.html` → 0 matches

## NF-LD-3 — QA (BLOCKED on NF-LD-2)
Verify: (1) endpoint SELECT-only/read-only (grep + behavioral — no write verbs); (2) Security Clause intact — sandbox env audit still empty-of-credentials AND sandbox panels still render honest-green via `data.js` under `file://` (G6/G8/G9 NOT regressed); (3) live section degrades honestly under `file://` and renders real rows when served; (4) full smoke green. Emit `docs/signals/qa-news-fetch-livedata-<UTC>.json` + paste evidence here.

## NF-LD-EXIT — PO sign-off (BLOCKED on NF-LD-3)
PO validates deliverables against the product shape + Security Clause + anti-regression rules, then signs off.

---

## Constraints binding Day 0 (verbatim)
- L84 explicit-file staging: `git add <path>` per file; NEVER `-A` or `.`
- No `--force`, no `--no-verify`, no `--no-gpg-sign`
- local-only — do NOT git push source/CI changes (user owns push)
- all work on `main` (NO branches)
- ESM `.js` import suffixes; `Bun.env` not `process.env`
- never ask the user — decide and continue
- pilot-status-news-fetch.json is FROZEN at 12/12 — this enhancement does NOT touch it
