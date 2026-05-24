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

## NF-LD-2 — Developer (BLOCKED on NF-LD-1)
Implement per architect ACs. Scope: `apps/mcp-server/` (one read-only route) + `apps/news-fetch/dashboard/index.html` (new live section). Sandbox runner / `data.js` / 3 sandbox panels UNTOUCHED. Smoke: news-fetch `bun test` + `bun tsc --noEmit` green; mcp-server tests for the new route green; sandbox still 16/16 (no regression). Paste evidence here before DONE.

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
