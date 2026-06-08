<!-- size-justification: 310L — three-zone split with crisp interface contracts, schema definitions, state machine, risk table. Splitting would require cross-file references that duplicate the queue contract. -->
# Architecture Brief — DFR-P2-DEEPFETCH: Conditional Deep-Fetch Pipeline

**Date:** 2026-06-08
**Authored by:** Architect (brownfield + directed design)
**Task ID:** ARCH-DFR-P2 (directed — PO hand-off 2026-06-08-dfr-p2-p3-architect-handoff.md)
**Sprint:** DEEPFETCH-RAG-REDESIGN
**Status:** DESIGN COMPLETE — ready for ba/pm → dev dispatch
**Zones:** multi — 3 sub-tasks required (dev-mcp-server, dev-vps-crawls, dev-mainserver-crawls)
**BUILD-STANDARD:** lean (new feature within existing zones — no new microservice)
**Feasibility input:** docs/architecture-briefs/2026-06-08-dfr-q1-q2-recon.md (both DONE, green)
**Phase 1 baseline:** DFR-P1-MCP/DFR-P1-RAG DONE — rag_analyses.body_text column live; LanceDB 8 metadata cols live

---

## Brownfield State (Phase 1 baseline verified)

- `rag_analyses.body_text TEXT` — **LIVE** (added by DFR-P1-MCP, idempotent try/catch, schema-news.ts:64)
- `rag_analyses.depth_tier` — NOT in SQLite schema; the value flows only through LanceDB metadata (indexed via ragIndex in pollNews.ts:depth_tier="shallow"). No SQLite column needed — LanceDB is the read surface.
- `pollNews.ts` — runs in `apps/mcp-server/src/application/usecases/pollNews.ts`. `tryInsertEntry()` at line 518 is the dedup gate. Deep-fetch queue insertion belongs AFTER `wasInserted = true` on line 946.
- `detectStocksInText` + `tickerWholeWordMatch` — imported in pollNews.ts from `domain/services/stockAliases.js`. Reuse for ticker gate.
- `normalizeNews()` returns `.impactScore` and `.sentiment` — available post-normalization, pre-dedup. Gate reads these.
- `article-body-fetcher.py` — **LIVE on VPS** (`vps-scripts/article-body-fetcher.py`). Supports `cafef.vn` + `vneconomy.vn`. Has `ALLOWED_DOMAINS = {"cafef.vn", "vneconomy.vn"}`.
- `vps-proxy-server.js` — **LIVE at VPS:8765**. `ARTICLE_BODY_ALLOWED_DOMAINS` at line 160: `new Set(["cafef.vn", "vneconomy.vn"])`. Route `/proxy/article-body` already shells out to article-body-fetcher.py.
- `vn-vps-proxy.service` (systemd) — 64MB MemoryMax, 43MB RSS idle. 469MB available headroom on VPS.
- `apps/mcp-server/src/scheduler/news-analysis/intelligenceCycleJob.ts` — calls `pollNews()` in Step A. Deep-fetch queue drain jobs are **independent** crons (not part of the 15-min cycle).
- `apps/news-fetch/` — zone path `apps/news-fetch/`, port 5008 per system-map.json. Has Playwright/Chromium for JS-rendered sources (Reuters, Bloomberg). This is the `mainserver-crawls` executor zone.
- `mcp.config.json` — already has `rag.decayHalfLifeDays` map (Phase 1). `deepFetch.*` config keys will be added here.

---

## 3-Zone Split

### Zone 1 — dev-mcp-server

**Scope:** Relevance gate in pollNews.ts; deep_fetch_queue + deep_fetch_stats tables; deepFetchVpsJob.ts + deepFetchMainJob.ts scheduler jobs; re-index on body fetch.

#### 1a. SQLite Schema — two new tables in schema-news.ts

```sql
-- deep_fetch_queue: work queue for pending article body fetches
CREATE TABLE IF NOT EXISTS deep_fetch_queue (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source_url   TEXT    NOT NULL,
  source_domain TEXT   NOT NULL,
  rag_id       TEXT    NOT NULL,   -- FK → rag_analyses.id (for re-index upsert)
  ticker       TEXT,               -- primary ticker from gate (may be NULL)
  status       TEXT    NOT NULL DEFAULT 'pending'
                       CHECK(status IN ('pending','vps-fetching','vps-failed','done','expired')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  queued_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  fetched_at   TEXT,               -- populated on done
  UNIQUE(source_url)               -- dedup: same URL never double-queued
);

CREATE INDEX IF NOT EXISTS idx_dfq_status_queued ON deep_fetch_queue(status, queued_at);
CREATE INDEX IF NOT EXISTS idx_dfq_domain        ON deep_fetch_queue(source_domain);

-- deep_fetch_stats: per-domain daily cap counter
CREATE TABLE IF NOT EXISTS deep_fetch_stats (
  domain       TEXT NOT NULL,
  date         TEXT NOT NULL,   -- YYYY-MM-DD UTC
  fetch_count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (domain, date)
);
```

Add both tables to `initNewsTables()` in `apps/mcp-server/src/infrastructure/db/schema-news.ts`.

#### 1b. Domain Gate — deepFetchGate.ts

**File:** `apps/mcp-server/src/domain/services/deepFetchGate.ts`
**Layer:** domain (pure function — no infrastructure imports)

```typescript
export interface DeepFetchGateInput {
  title: string;
  snippet: string;
  impactScore: number;
  sentiment: string;             // "bullish"|"bearish"|"neutral"
  sourceUrl: string;
  affectedActions: string[];     // from normalizeNews()
  watchlistTickers: string[];    // from system-map.json watchlist
  sectorKeywords: Map<string, string[]>;  // sector → keywords (derived from system-map at startup)
}

export function shouldDeepFetch(input: DeepFetchGateInput): boolean
// Returns true when ANY of the three signals fires:
// 1. Ticker match: detectStocksInText(title+snippet, watchlistTickers).length > 0
//                  OR affectedActions.some(t => watchlistTickers.includes(t.toUpperCase()))
// 2. Sector keyword: title+snippet contains any keyword in sectorKeywords values
// 3. Impact+sentiment: impactScore >= 7 AND sentiment !== "neutral"
```

Gate is a pure function exported for unit testing. It imports from domain only (`stockAliases.js`). It does NOT import from infrastructure.

**Sector keyword map:** derived at startup from `docs/data/system-map.json` (jq `.project.watchlist | map({sector, ticker}) | group_by(.sector)`) — NEVER hardcoded. Pass to gate via constructor injection or startup-loaded singleton in `mcp.config.ts`.

#### 1c. Infrastructure — deepFetchQueueStore.ts

**File:** `apps/mcp-server/src/infrastructure/db/deepFetchQueueStore.ts`
**Layer:** infrastructure

Exports:
```typescript
enqueueIfNotPresent(db, { source_url, source_domain, rag_id, ticker }): boolean
// INSERT OR IGNORE ON source_url; returns true if newly inserted

pollPending(db, limit: number): DeepFetchQueueRow[]
// SELECT WHERE status='pending' AND queued_at > NOW()-4h LIMIT limit
// Also marks returned rows as 'vps-fetching'/'pending' (caller decides)

markDone(db, id: number, fetched_at: string): void
markVpsFailed(db, id: number): void
markExpired(db, id: number): void
incrementAttempts(db, id: number): void

checkDomainDailyCap(db, domain: string, cap: number): boolean
// returns true if today's fetch_count < cap
incrementDomainCounter(db, domain: string): void
// UPSERT into deep_fetch_stats(domain, date) ON CONFLICT increment fetch_count
```

#### 1d. Relevance Gate injection point in pollNews.ts

Insert AFTER `wasInserted = true` line (currently line 948, inside the `if (wasInserted)` block), BEFORE the ragInsertFn call:

```typescript
// DFR-P2: deep-fetch gate (runs only on newly inserted articles — no re-fetch of duplicates)
try {
  const { shouldDeepFetch } = await import("../../domain/services/deepFetchGate.js");
  const hit = shouldDeepFetch({
    title: entry.sourceTitle,
    snippet: entry.summary,
    impactScore: entry.impactScore ?? 0,
    sentiment: entry.sentiment ?? "neutral",
    sourceUrl: entry.sourceUrl ?? "",
    affectedActions: entry.affectedActions,
    watchlistTickers: /* loaded once per pollNews cycle from DB */ watchlist.map(w => w.actionCode),
    sectorKeywords: /* startup-loaded singleton */ getSectorKeywordMap(),
  });
  if (hit && entry.sourceUrl) {
    const { enqueueIfNotPresent } = await import("../../infrastructure/db/deepFetchQueueStore.js");
    const ragId = entry.id;  // rag_analyses.id used for re-index upsert
    const domain = source_domain || "";
    enqueueIfNotPresent(db, { source_url: entry.sourceUrl, source_domain: domain, rag_id: ragId, ticker: primaryTickerUpper ?? null });
  }
} catch (err) {
  logger.warn("[pollNews] deep-fetch gate error (non-fatal)", { error: String(err) });
}
```

This block is non-fatal (best-effort like ragInsertFn). Gate failure NEVER aborts the poll cycle.

#### 1e. Scheduler Jobs

**File 1:** `apps/mcp-server/src/scheduler/news-analysis/deepFetchVpsJob.ts`
**Layer:** interface/scheduler
**Cron:** `*/5 * * * *` (every 5 min, 24/7 — deep-fetch is out-of-band)
**Config key:** `CRON_DEEP_FETCH_VPS` in `cronConfig.ts` + `deepFetch.maxPerCycle` in `mcp.config.json` (default: 10)

Logic:
1. `pollPending(db, limit=maxPerCycle)` — get up to 10 `status='pending'` rows
2. Skip rows where `queued_at < NOW() - 4h` → mark `status='expired'`
3. Per row: check `checkDomainDailyCap(db, domain, cap)` — skip if at cap
4. `fetch(VPS_PROXY_URL + '/proxy/article-body?url=' + encodeURIComponent(source_url))` with 15s timeout
5. On 200 + non-empty `body_text`:
   - `UPDATE rag_analyses SET body_text = ? WHERE id = rag_id` — write SQLite
   - Call `ragIndex({ id: rag_id, ..., depth_tier: "deep", body_text snippet capped at 4000 chars })` — re-index LanceDB with richer content (upsert by id via the existing `table.add()` + dedup-by-id logic — NO delete)
   - `markDone(db, row.id, now)`; `incrementDomainCounter(db, domain)`
6. On empty `body_text` or HTTP error: `markVpsFailed(db, row.id)`; `incrementAttempts`
7. Honour `human_delay(1500, 2500)` between fetches (politeness)

**File 2:** `apps/mcp-server/src/scheduler/news-analysis/deepFetchMainJob.ts`
**Layer:** interface/scheduler
**Cron:** `*/5 * * * *` (same cadence, separate job)
**Config key:** `CRON_DEEP_FETCH_MAIN` + `deepFetch.maxPlaywrightPerCycle` (default: 5)

Logic:
1. `pollVpsFailed(db, limit=5)` — get up to 5 `status='vps-failed'` rows
2. Skip rows where `queued_at < NOW() - 4h` → mark `expired`
3. Per row: call `apps/news-fetch` microservice (port 5008) `POST /fetch-article { url }` — returns `{ body_text }` via existing Playwright infrastructure
4. Same storage path as VpsJob (step 5 above)
5. On failure: `markExpired` (don't retry Playwright — too heavy)

**Registration in startScheduler.ts:**
```typescript
import { runDeepFetchVpsJob } from './news-analysis/deepFetchVpsJob.js'
import { runDeepFetchMainJob } from './news-analysis/deepFetchMainJob.js'
// ...
cron.schedule(CRONS.deepFetchVps,  () => runDeepFetchVpsJob())
cron.schedule(CRONS.deepFetchMain, () => runDeepFetchMainJob())
```

**Registration in cronConfig.ts:**
```typescript
deepFetchVps:  Bun.env.CRON_DEEP_FETCH_VPS  ?? '*/5 * * * *',
deepFetchMain: Bun.env.CRON_DEEP_FETCH_MAIN ?? '*/5 * * * *',
```

#### 1f. LanceDB Re-index (upsert — NO silent delete)

The re-index call on deep content uses the existing `ragIndex()` / `POST /index` path. The key invariant: **NEVER call `table.delete()` before `table.add()`**. The rag-service `insert()` method calls `table.add([row])` which appends. The dedup logic in `search()` deduplicates by `(title, summary)` at read-time. The Phase 1 `depth_tier` filter allows consumers to explicitly request `depth_tier="deep"` rows — so two rows with the same source_url (one shallow, one deep) can coexist. The consumer uses `depth_tier` as a pre-filter to prefer deep content.

For the re-index payload from deepFetchVpsJob:
```typescript
await ragIndex({
  id: rag_id + "_deep",      // _deep suffix to distinguish from shallow entry
  level: original_level,
  title: original_title,
  summary: original_summary,  // summary unchanged (Phase 1 propagated)
  tags: [...original_tags, "deep"],
  action_code: original_action_code,
  doc_type: "news",
  depth_tier: "deep",          // KEY: marks this as deep content
  source_domain: domain,
  published_at: original_published_at,
  confidence: original_confidence,
  impact_score: original_impact_score,
  ticker: original_ticker,
  sector: original_sector,
  content: body_text.slice(0, 4000),   // embedding input = richer full body
});
```

The `_deep` suffix on the id ensures the LanceDB row is a distinct entry (not a collision with the original shallow entry). Both coexist; `depth_tier="deep"` filter selects the richer one.

#### 1g. mcp.config.json additions

```json
"deepFetch": {
  "maxPerCycle": 10,
  "maxPlaywrightPerCycle": 5,
  "staleExpiryHours": 4,
  "domainDailyCap": {
    "cafef.vn": 50,
    "vneconomy.vn": 30,
    "vnexpress.net": 40
  }
}
```

All values read via `loadMcpConfig()` — never hardcoded inline.

---

### Zone 2 — dev-vps-crawls

**Scope:** Extend `article-body-fetcher.py` with `extract_vnexpress()` + update `ALLOWED_DOMAINS`; add `vnexpress.net` to `ARTICLE_BODY_ALLOWED_DOMAINS` in `vps-proxy-server.js`; restart `vn-vps-proxy.service`.

**NO new systemd service** (per DFR-Q2 verdict — endpoint already live at VPS:8765/proxy/article-body).

#### 2a. article-body-fetcher.py changes

1. Add `"vnexpress.net"` to `ALLOWED_DOMAINS`:
   ```python
   ALLOWED_DOMAINS = {"cafef.vn", "vneconomy.vn", "vnexpress.net"}
   ```

2. Add `extract_vnexpress()` function (working recipe from DFR-Q1 recon):
   ```python
   def extract_vnexpress(html: str, url: str) -> dict:
       soup = BeautifulSoup(html, "html.parser")
       container = soup.find("article", class_="fck_detail") or soup.find("article")
       if not container:
           return {"title": "", "body_text": "", "published_at": ""}
       for tag in container.find_all(["script", "style", "figure", "figcaption", "ins"]):
           tag.decompose()
       body_text = re.sub(r"\s+", " ", container.get_text(separator=" ", strip=True)).strip()
       og_title = soup.find("meta", property="og:title")
       pub_time = soup.find("meta", property="article:published_time")
       return {
           "title": og_title["content"] if og_title else "",
           "body_text": body_text[:8000],
           "published_at": pub_time["content"] if pub_time else "",
       }
   ```
   Headers: add `"Referer": "https://vnexpress.net/kinh-doanh"` to `HEADERS` dict.

3. Wire `extract_vnexpress()` into the existing `dispatch_extract(domain, html, url)` function (or equivalent dispatch block that routes to `extract_cafef` / `extract_vneconomy`).

**Plain HTTP only. NO Chromium on VPS. NO new Python dependencies (requests + beautifulsoup4 already installed).**

#### 2b. vps-proxy-server.js change

One-line patch at the `ARTICLE_BODY_ALLOWED_DOMAINS` declaration (currently line 160):
```js
const ARTICLE_BODY_ALLOWED_DOMAINS = new Set(["cafef.vn", "vneconomy.vn", "vnexpress.net"]);
```

#### 2c. Service restart

```bash
sudo systemctl restart vn-vps-proxy.service
sudo systemctl status vn-vps-proxy.service
```

Verify: `curl http://localhost:8765/proxy/article-body?url=https://vnexpress.net/vn-index-giam-gan-50-diem-5083195.html` → expect `{"status":"ok","body_text":"...","published_at":"..."}`.

**RAM impact:** 1.94 MB peak per call (measured via tracemalloc). 10 concurrent × 1.94 MB = 19.4 MB — within `vn-vps-proxy.service` 64MB MemoryMax.

---

### Zone 3 — dev-mainserver-crawls (apps/news-fetch/)

**Scope:** Add `POST /fetch-article` endpoint to `apps/news-fetch/` microservice (port 5008). This is the Playwright fallback executor — called ONLY for `status='vps-failed'` rows.

**Playwright ONLY on main-server. NOT on VPS.**

#### 3a. New endpoint in apps/news-fetch/

**File:** `apps/news-fetch/src/routes/fetchArticle.ts` (or equivalent — dev-mainserver-crawls to determine exact path per news-fetch zone conventions)

```typescript
POST /fetch-article
Request:  { url: string }
Response: { status: "ok"|"error", body_text: string, published_at: string, url: string }
```

Logic: uses existing Playwright browser pool (already live for Reuters/Bloomberg headline fetching). Navigates to `url`, extracts `document.body.innerText` or `article` tag body, returns up to 8000 chars. Same `ALLOWED_DOMAINS` guard as VPS (to prevent SSRF).

**No new service.** This is an additional route on the existing news-fetch microservice.

**ALLOWED_DOMAINS guard (SSRF prevention):**
```typescript
const ALLOWED_DOMAINS = new Set([
  // VN sources that VPS can't render (JS-heavy or behind light auth)
  "vietstock.vn", "vietnambiz.vn", "vnbusiness.vn",
  // International (already handled by news-fetch for Reuters/Bloomberg)
  "reuters.com", "bloomberg.com",
]);
// Guard: if new URL(req.url).hostname not in ALLOWED_DOMAINS → 400
```

Domain list is the initial seed. Dev-mainserver-crawls should load it from `mcp.config.json` under `deepFetch.playwrightAllowedDomains` — never hardcoded.

---

## Interface Contracts (zone boundaries)

### Contract A — mcp-server → VPS /proxy/article-body

```
Request:  GET VPS_PROXY_URL/proxy/article-body?url=<encoded article URL>
          Caller: deepFetchVpsJob.ts
          VPS_PROXY_URL: Bun.env.VPS_PROXY_URL ?? "http://125.212.251.27:8765"

Response (success):
  HTTP 200
  {
    "status": "ok",
    "url": "<original url>",
    "source_domain": "vnexpress.net",
    "title": "<og:title>",
    "body_text": "<extracted article body, max 8000 chars>",
    "published_at": "<ISO 8601 from article:published_time meta>",
    "fetched_at": "<ISO 8601 UTC>"
  }

Response (not supported):
  HTTP 200  { "status": "error", "reason": "domain not allowed", "url": "..." }
  OR HTTP 200  { "status": "ok", "body_text": "" }   ← empty = domain not supported
  (mcp-server treats empty body_text as vps-failed)

Response (error):
  HTTP 200  { "status": "error", "reason": "<message>", "url": "..." }
  (mcp-server treats any non-ok status as vps-failed)
```

### Contract B — mcp-server → news-fetch /fetch-article

```
Request:  POST http://localhost:5008/fetch-article
          Content-Type: application/json
          { "url": "<article URL>" }
          Caller: deepFetchMainJob.ts
          Timeout: 30s (Playwright is slow)

Response (success):
  HTTP 200
  {
    "status": "ok",
    "url": "<original url>",
    "body_text": "<extracted text, max 8000 chars>",
    "published_at": "<ISO or empty string>",
  }

Response (error / not supported):
  HTTP 200  { "status": "error", "reason": "...", "url": "..." }
  OR HTTP 400  (domain not in ALLOWED_DOMAINS)
```

### Contract C — deep_fetch_queue state machine

```
States: pending → vps-fetching → vps-failed → [mainserver picks up] → done
                                             → expired (if queued_at < NOW()-4h)
        pending → expired (if stale and not yet processed)
        
Invariants:
  - source_url UNIQUE — one queue row per article URL, ever
  - INSERT OR IGNORE — second push of same URL is silently dropped
  - Only deepFetchVpsJob transitions: pending → vps-fetching → vps-failed|done
  - Only deepFetchMainJob transitions: vps-failed → done|expired
  - Stale expiry: queued_at < NOW()-4h AND status IN ('pending','vps-failed') → expired
  - Max attempts: deepFetchVpsJob.attempts = 1 (single VPS try); if vps-failed → mainserver
  - Stale cleanup cron: daily at 03:30 UTC → mark expired + soft-delete rows older than 7 days
    (deepFetchVpsJob also marks rows expired inline when polling)
```

---

## Mandatory Guardrails (bake into dev task spec)

| Guardrail | Where enforced |
|-----------|----------------|
| Max 10 deep-fetch per cycle (VPS) | `deepFetch.maxPerCycle` config + `pollPending(db, limit=maxPerCycle)` |
| Max 5 Playwright per cycle | `deepFetch.maxPlaywrightPerCycle` config + `pollVpsFailed(db, limit=5)` |
| Per-domain daily cap | `deep_fetch_stats` table + `checkDomainDailyCap()` before fetch |
| 4h stale expiry | `queued_at < NOW()-4h` check in both executor jobs |
| `source_url UNIQUE` | `UNIQUE(source_url)` constraint on `deep_fetch_queue` + `INSERT OR IGNORE` |
| NO silent delete | `table.add()` only — never `table.delete()` before re-index |
| VPS = plain HTTP only | article-body-fetcher.py uses `requests` only — no playwright import |
| Playwright only on main-server | news-fetch zone only — no playwright on VPS systemd services |
| No hardcoded system data | sector keywords from `system-map.json`; caps from `mcp.config.json` |
| No branches | All work on `main` |

---

## DDD Layer Assignments

| Component | File | Layer | Rule |
|-----------|------|-------|------|
| `deep_fetch_queue` table DDL | `schema-news.ts` | infrastructure | Infra owns schema |
| `deep_fetch_stats` table DDL | `schema-news.ts` | infrastructure | Infra owns schema |
| `deepFetchGate.ts` | `domain/services/` | **domain** | Pure fn, zero infra imports |
| `deepFetchQueueStore.ts` | `infrastructure/db/` | infrastructure | DB access |
| `deepFetchVpsJob.ts` | `scheduler/news-analysis/` | interface/scheduler | Calls VPS via HTTP |
| `deepFetchMainJob.ts` | `scheduler/news-analysis/` | interface/scheduler | Calls news-fetch via HTTP |
| Gate injection in pollNews.ts | `application/usecases/` | application | Orchestration |
| VPS extract_vnexpress() | `vps-scripts/` | (VPS, not DDD) | Extend existing |
| news-fetch /fetch-article | `apps/news-fetch/` | interface/http | New route on existing svc |

**Golden rule check:** `deepFetchGate.ts` imports `detectStocksInText` from `domain/` only. It does NOT import from `infrastructure/`. ✓

---

## Risk Table

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| R-P2-1 | Gate too loose → queue flood | Medium | Hard cap (maxPerCycle=10), daily domain cap, 4h stale expiry |
| R-P2-2 | VPS hits rate-limit on vnexpress.net | Low | human_delay(1500,2500) between fetches; daily cap 40/domain |
| R-P2-3 | news-fetch Playwright timeout | Low | 30s timeout; deepFetchMainJob marks expired on failure |
| R-P2-4 | deep_fetch_queue grows unbounded if executors fail | Medium | 4h stale expiry in executor + daily cleanup cron |
| R-P2-5 | deepFetchVpsJob and intelligence cycle both write rag_analyses.body_text | Low | Same single-writer invariant (mcp-server); no concurrent writes |
| R-P2-6 | shallow + deep rows for same article in LanceDB search | Low | `depth_tier` pre-filter; `_deep` suffix on LanceDB id prevents id collision |
| R-P2-7 | outward-facing crawl hits live news sites | Medium | Per domain daily cap + stale expiry + plain-HTTP-only on VPS (no Playwright) + politeness delays |

---

## Acceptance Criteria (for QA)

1. `deep_fetch_queue` and `deep_fetch_stats` tables created by `initNewsTables()` on startup (idempotent).
2. After pollNews cycle: VNM/HPG/VCB articles with impact >= 7 appear in `deep_fetch_queue` with status='pending'.
3. deepFetchVpsJob: at most 10 rows processed per run; rows transition pending → done/vps-failed.
4. `rag_analyses.body_text` non-NULL for a done row (body text present).
5. LanceDB query with `depth_tier="deep"` returns the re-indexed entry (not the shallow one).
6. deepFetchMainJob picks up `status='vps-failed'` rows (not `status='pending'`).
7. `source_url UNIQUE` — second enqueueIfNotPresent for same URL → INSERT OR IGNORE, no duplicate.
8. Rows older than 4h with status='pending'/'vps-failed' → marked 'expired' on next executor run.
9. `curl VPS:8765/proxy/article-body?url=vnexpress.net-url` → `{"status":"ok","body_text":"..."}`.
10. VPS RAM after 10 concurrent calls: within vn-vps-proxy 64MB MemoryMax (measure via `systemctl status vn-vps-proxy.service`).

---

## BUILD-STANDARD: lean
New feature within existing zones (mcp-server scheduler + vps-scripts + news-fetch). No new microservice. All three zones have existing specialist developers.
