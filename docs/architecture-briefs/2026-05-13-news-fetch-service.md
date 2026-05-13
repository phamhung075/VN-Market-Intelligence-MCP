# Architecture Brief — news-fetch Microservice

<!-- size-justification: 200L — new service design; covers module layout, routes, entities, ports,
     Dockerfile strategy, RAM budget, test tiers, cron wiring, gateway diff, failure modes.
     All sections needed by developer to scaffold without back-and-forth. -->

**Date:** 2026-05-13
**Author:** architect
**Status:** READY FOR SCAFFOLD
**Blocking:** ops-mainserver-fetch container sizing

---

## 1. Port Assignment — RISK FLAG

The ops handoff at `docs/handoffs/ops-news-fetch-scaffold.md` specifies **port 5007**.
Port 5007 is already assigned to `forensic-analysis` in `docs/architecture-briefs/2026-05-12-forensic-analysis-host.md`.

**Decision: news-fetch uses port 5008.**

Developer must update the ops handoff and docker-compose accordingly.
forensic-analysis (5007) is designed but not yet in docker-compose — verify before deploying both.

---

## 2. Module Layout

```
apps/news-fetch/
├── Dockerfile
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                              ← entry: wiring + Bun.serve export
│   ├── domain/
│   │   ├── models.ts                         ← Article, NewsSource enum, FetchResult
│   │   └── repositories.ts                   ← ReutersNewsPort, BloombergNewsPort (interfaces)
│   ├── application/
│   │   └── use-cases.ts                      ← FetchReutersHeadlinesUseCase,
│   │                                            FetchBloombergHeadlinesUseCase
│   ├── infrastructure/
│   │   └── scrapers/
│   │       ├── reuters-rss.ts                ← Primary: Reuters RSS (no bot protection)
│   │       ├── reuters-stealth.ts            ← Fallback: Playwright stealth (DataDome)
│   │       └── bloomberg-stealth.ts          ← Primary: Playwright stealth (PerimeterX passive)
│   └── interface/
│       └── handlers.ts                       ← Hono router: /health, /news/reuters/headlines,
│                                                /news/bloomberg/headlines
```

120-line split policy applies. If any file grows beyond 120L, split at the nearest logical boundary
and add a barrel `index.ts` per subfolder that exceeds one file.

Playwright scraper files MUST import and call a shared `PlaywrightBrowserFactory` (single
responsibility: launch/configure/close Chromium). Both scrapers receive it via constructor
injection — no direct `playwright.chromium.launch()` calls inside scraper bodies.

---

## 3. Domain Entities (`src/domain/models.ts`)

```typescript
export enum NewsSource {
  REUTERS  = 'reuters',
  BLOOMBERG = 'bloomberg',
}

/** A single scraped news article headline. */
export interface Article {
  source: NewsSource;
  headline: string;
  url: string | null;          // null when RSS does not include link
  publishedAt: string | null;  // ISO timestamp or null if unparseable
  fetchedAt: string;           // ISO timestamp — set by scraper
  confidence: 'HIGH' | 'LOW';  // HIGH = structured DOM/RSS; LOW = Playwright heuristic
}

/** Envelope returned by every scraper. */
export interface FetchResult {
  source: NewsSource;
  articles: Article[];
  fetchedAt: string;
  method: 'rss' | 'playwright-stealth';
  error: string | null;        // null on success; populated on partial/full failure
}
```

---

## 4. Port Interfaces (`src/domain/repositories.ts`)

```typescript
export interface ReutersNewsPort {
  fetchHeadlines(maxItems?: number): Promise<FetchResult>;
}

export interface BloombergNewsPort {
  fetchHeadlines(maxItems?: number): Promise<FetchResult>;
}
```

Golden rule holds: `domain/` imports nothing from `infrastructure/`.

---

## 5. Application Use Cases (`src/application/use-cases.ts`)

Two use cases, one per source. Each takes the port via constructor injection.

```typescript
export class FetchReutersHeadlinesUseCase {
  constructor(private readonly repo: ReutersNewsPort) {}
  async execute(maxItems = 15): Promise<FetchResult> { ... }
}

export class FetchBloombergHeadlinesUseCase {
  constructor(private readonly repo: BloombergNewsPort) {}
  async execute(maxItems = 10): Promise<FetchResult> { ... }
}
```

No domain service layer needed — no business calculation, only orchestration of a single port.

---

## 6. Infrastructure Scrapers

### 6a. reuters-rss.ts  (implements ReutersNewsPort — PRIMARY path)

- URL: `https://feeds.reuters.com/reuters/businessNews`
- Method: `fetch()` with browser User-Agent (per dev-standards coding rule)
- Parser: XML via Bun's native `DOMParser` or a minimal XML parse utility
- Confidence: HIGH
- RAM: ~30–50 MB (no browser)
- Timeout: 10 s

### 6b. reuters-stealth.ts  (implements ReutersNewsPort — FALLBACK only)

- Invoked only when `reuters-rss.ts` returns `error != null` or zero articles
- Method: Playwright Chromium + playwright-stealth JS patch
- DOM selectors from recon: `[data-testid="Heading"]`, `article[data-testid="Article"]`,
  `time[data-testid="DateLineTime"]`
- Human simulation: random pre-navigation pause 0.5–1.5 s, scroll to 33% then 50%
- `browser.close()` in `finally` block — mandatory per technique doc
- Confidence: LOW (JS-level stealth declining effectiveness per technique doc)

### 6c. bloomberg-stealth.ts  (implements BloombergNewsPort — only path)

- Method: Playwright Chromium + playwright-stealth JS patch
- Strategy: PerimeterX passive phase bypass (200 delivered on first load)
- DOM selectors from recon: `[data-component="headline"]`, `a[href^="/news/articles/"]`,
  `time[data-type="published-at"]`
- Also attempt `script#__NEXT_DATA__` JSON path:
  `props.pageProps.stories[].headline` + `publishedAt`
- `browser.close()` in `finally` block — mandatory
- Paywall note: only public/free headlines accessible regardless of stealth technique
- Confidence: HIGH for DOM; LOW if only `__NEXT_DATA__` fallback fires

### PlaywrightBrowserFactory (shared, lives in `src/infrastructure/scrapers/`)

Responsibility: launch Chromium with standard stealth args, apply `playwright-stealth`,
return `{ browser, context, page }`. Both 6b and 6c import only this factory.
Caller closes the browser via the returned handle.

---

## 7. HTTP Route Table (`src/interface/handlers.ts`)

| Method | Path                          | Handler                       | Notes                                    |
|--------|-------------------------------|-------------------------------|------------------------------------------|
| GET    | /health                       | inline                        | `{ status:"ok", service:"news-fetch", port:5008 }` |
| POST   | /news/reuters/headlines       | FetchReutersHeadlinesUseCase  | optional body `{ maxItems?: number }`    |
| GET    | /news/reuters/headlines       | FetchReutersHeadlinesUseCase  | convenience alias                        |
| POST   | /news/bloomberg/headlines     | FetchBloombergHeadlinesUseCase| optional body `{ maxItems?: number }`    |
| GET    | /news/bloomberg/headlines     | FetchBloombergHeadlinesUseCase| convenience alias                        |

Pattern: mirrors macro-indicators (POST primary + GET alias per endpoint). Hono router.

---

## 8. Dockerfile Strategy

**Base image: `mcr.microsoft.com/playwright:v1.44.0-jammy`**

Rationale:
- Microsoft's official Playwright image ships Chromium + all system libraries pre-installed
  (libnss3, libatk, libgbm, etc.) — eliminates the fragile `apk add chromium` path on Alpine
- Jammy (Ubuntu 22.04) base is stable and well-tested for Playwright headless
- Image is large (~1.3 GB compressed) but that size is dominated by Chromium, which is
  mandatory regardless — no Alpine image avoids it
- `oven/bun:1.3.13-alpine` cannot be used as base because Alpine musl libc is incompatible
  with Chromium's glibc dependencies

Multi-stage build:

```dockerfile
# Stage 1: install Bun deps
FROM oven/bun:1.3.13-alpine AS bun-builder
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .

# Stage 2: runtime on Playwright image (ships Chromium)
FROM mcr.microsoft.com/playwright:v1.44.0-jammy
WORKDIR /app

# Install Bun into Playwright image
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

COPY --from=bun-builder /app/node_modules ./node_modules
COPY --from=bun-builder /app/src ./src
COPY package.json tsconfig.json ./

EXPOSE 5008
ENV PORT=5008
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

CMD ["bun", "run", "src/index.ts"]
```

Note: `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` is the path where Microsoft's image pre-installs
browsers. Do NOT run `playwright install` again in the Dockerfile — browsers are already present.

Alternative (if image pull is blocked): `oven/bun:1.3.13-debian` + inline Chromium install via
apt-get. Dockerfile becomes ~30L longer but avoids the MCR pull dependency.

---

## 9. RAM Budget

| Component                              | Idle    | Peak per scrape |
|----------------------------------------|---------|-----------------|
| Bun runtime + Hono server              | ~40 MB  | ~40 MB          |
| Reuters RSS fetcher (no browser)       | ~0 MB   | ~40 MB          |
| Playwright Chromium (Reuters fallback) | 0 MB*   | ~400–500 MB     |
| Playwright Chromium (Bloomberg)        | 0 MB*   | ~400–500 MB     |
| **Steady idle**                        | ~40 MB  |                 |
| **Single scrape (RSS path)**           |         | ~80 MB          |
| **Single scrape (Bloomberg only)**     |         | ~450 MB         |
| **Concurrent both (worst case)**       |         | ~980 MB         |
| **docker-compose memory limit**        | **2 GB reserved, 2.5 GB limit** |    |

`*` Playwright browsers are launched on-demand and closed after each scrape. Zero idle RAM.

Ops constraint: do NOT schedule Reuters Playwright fallback and Bloomberg concurrently.
The cron dispatcher (see §11) must serialize them via sequential dispatch.

---

## 10. Gateway Routing Config Diff

### `apps/api-gateway/src/index.ts` — add to `serviceUrls`:

```typescript
news: process.env['NEWS_URL'] ?? 'http://news-fetch:5008',
```

### `apps/api-gateway/src/infrastructure/health_checker.ts` — add to `buildServiceConfigs`:

```typescript
news: {
  name: 'news',
  baseUrl: urls['news'] ?? 'http://news-fetch:5008',
  healthPath: '/health',
  timeoutMs: timeout,
},
```

### `apps/api-gateway/src/interface/handlers.ts` — add `'news'` to `DASHBOARD_SERVICES`:

```typescript
const DASHBOARD_SERVICES: ReadonlyArray<string> = [
  'mcp', 'pdf', 'rag', 'ta', 'macro', 'stock', 'kinh-dich', 'alert', 'news',
];
```

### `docker-compose.yml` — add service block (after `alert-engine`):

```yaml
news-fetch:
  build:
    context: apps/news-fetch
    dockerfile: Dockerfile
  ports:
    - "5008:5008"
  volumes:
    - market_data:/app/data:ro
  environment:
    - PORT=5008
    - DB_PATH=/app/data/market.db
    - DB_READONLY=true
  restart: unless-stopped
  healthcheck:
    test: ["CMD", "wget", "-qO-", "http://localhost:5008/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 30s          # longer start: Playwright image is large
  deploy:
    resources:
      limits:
        memory: 2.5g
        cpus: '1.0'
      reservations:
        memory: 2g
        cpus: '0.5'
```

### `apps/api-gateway/src/index.ts` environment block — add to docker-compose `api-gateway` env:

```yaml
- NEWS_URL=http://news-fetch:5008
```

---

## 11. Cron Job Design

news-fetch does NOT run its own scheduler. It is a pure HTTP service.

The mcp-server scheduler (`src/scheduler/news-analysis/`) dispatches to it via HTTP,
following the same pattern as `taAlertScanJob` → TA service and `macroRefresh` → macro service.

### New cron job: `newsHeadlinesRefreshJob.ts`

Location: `apps/mcp-server/src/scheduler/news-analysis/newsHeadlinesRefreshJob.ts`

Cadence: every 30 minutes (configurable via `mcp.config.json#scheduler.newsHeadlinesRefresh`)

Behavior:
1. POST `http://news-fetch:5008/news/bloomberg/headlines`
2. POST `http://news-fetch:5008/news/reuters/headlines`  (sequential — not concurrent; see §9)
3. On each success: call mcp-server internal `POST /api/push-news` with normalised items
4. On error: log + continue (non-blocking; Bloomberg failure must not block Reuters)

The cron job is added to the `news-analysis` module barrel and registered in
`src/scheduler/jobs.ts` alongside the existing `intelligenceCycleJob`.

---

## 12. Test Tier Plan

### Unit tests — `apps/news-fetch/src/__tests__/unit/`

| File | What is mocked | What is tested |
|------|----------------|----------------|
| `reuters-rss.test.ts` | `fetch()` → fixture XML string | Article parsing, date normalization, empty-feed guard |
| `bloomberg-stealth.test.ts` | `PlaywrightBrowserFactory` returns mock page | DOM selector extraction, `__NEXT_DATA__` JSON path, `browser.close()` called in finally |
| `use-cases.test.ts` | `ReutersNewsPort`, `BloombergNewsPort` interfaces | Use-case delegation, error propagation, maxItems forwarding |

### Integration tests — `apps/news-fetch/src/__tests__/integration/`

| File | What runs live | Guard |
|------|----------------|-------|
| `reuters-rss-live.test.ts` | Real HTTP to Reuters RSS endpoint | Skip if `CI=true` env not set |
| `bloomberg-stealth-live.test.ts` | Real Playwright Chromium → bloomberg.com | `PLAYWRIGHT_LIVE=true` required; skipped by default |

Integration tests are excluded from `bun test` default run. Run manually before release.

### E2E tests — `apps/mcp-server/src/__tests__/e2e/`

| File | Scope |
|------|-------|
| `newsHeadlinesRefreshJob.e2e.test.ts` | Inject mock HTTP client for news-fetch; verify mcp-server normalises + inserts articles |

---

## 13. Failure Modes and Fallback Policy

| Failure | Detection | Response |
|---------|-----------|----------|
| Reuters RSS returns 0 items | `articles.length === 0` after parse | Activate `reuters-stealth.ts` fallback; log `[reuters] rss-empty → stealth-fallback` |
| Reuters RSS HTTP error (4xx/5xx) | `resp.ok === false` | Same fallback activation path |
| Reuters Playwright DataDome hard-block (`x-dd-b: 3` visible in response) | Response body contains `captcha-delivery.com` | Return `FetchResult { error: "datadome-block", articles: [] }`; log WARNING; DO NOT retry in same cycle |
| Bloomberg PerimeterX challenge (403 after initial GET) | `page.content()` contains `px-block` class | Return `FetchResult { error: "perimeterx-challenge", articles: [] }`; log WARNING |
| Bloomberg returns 0 DOM headlines + empty `__NEXT_DATA__` | `articles.length === 0` | Return empty result; log INFO — not an error (paywall may hide all content) |
| Playwright process OOM | Bun `spawn` error or SIGKILL from Docker | `finally` block releases browser; error logged; cron job moves on |
| news-fetch container down | Gateway 502 on health probe | Ops receives WORK alert via existing `cronHealthAlertJob` pattern |

Market signal policy: Bloomberg and Reuters failures are non-critical. mcp-server's
`intelligenceCycleJob` already runs 9 VN news sources. Missing one EN-language international
cycle degrades signal richness but does not break the pipeline.

---

## 14. market.db Read-Only Mount

news-fetch mounts `market_data:/app/data:ro` and sets `DB_READONLY=true`. This mirrors the
macro-indicators pattern. The service does NOT write to SQLite. All article persistence is
handled by mcp-server after the cron job calls `/api/push-news`.

DDD implication: no `SqliteNewsRepository` implementation is needed in this service. The
`ReutersNewsPort` and `BloombergNewsPort` are pure HTTP-scraper ports with no DB dependency.
The market.db mount is present for future use only (e.g., watchlist read for headline filtering).

---

## 15. Files to Create

| File | Layer | Note |
|------|-------|------|
| `apps/news-fetch/Dockerfile` | infra | §8 |
| `apps/news-fetch/package.json` | infra | mirror macro-indicators; add `playwright`, `playwright-stealth` deps |
| `apps/news-fetch/tsconfig.json` | infra | copy macro-indicators |
| `apps/news-fetch/src/index.ts` | interface | DDD wiring + Bun.serve export |
| `apps/news-fetch/src/domain/models.ts` | domain | §3 |
| `apps/news-fetch/src/domain/repositories.ts` | domain | §4 |
| `apps/news-fetch/src/application/use-cases.ts` | application | §5 |
| `apps/news-fetch/src/infrastructure/scrapers/reuters-rss.ts` | infra | §6a |
| `apps/news-fetch/src/infrastructure/scrapers/reuters-stealth.ts` | infra | §6b |
| `apps/news-fetch/src/infrastructure/scrapers/bloomberg-stealth.ts` | infra | §6c |
| `apps/news-fetch/src/infrastructure/scrapers/playwright-browser-factory.ts` | infra | shared factory |
| `apps/news-fetch/src/interface/handlers.ts` | interface | §7 |

## 16. Files to Modify

| File | Change |
|------|--------|
| `docker-compose.yml` | Add `news-fetch` service block (§10) |
| `apps/api-gateway/src/index.ts` | Add `news` entry in `serviceUrls` (§10) |
| `apps/api-gateway/src/infrastructure/health_checker.ts` | Add `news` in `buildServiceConfigs` (§10) |
| `apps/api-gateway/src/interface/handlers.ts` | Add `'news'` to `DASHBOARD_SERVICES` (§10) |
| `apps/mcp-server/src/scheduler/news-analysis/` | Add `newsHeadlinesRefreshJob.ts` + barrel update (§11) |
| `apps/mcp-server/src/scheduler/jobs.ts` | Register `newsHeadlinesRefreshJob` (§11) |
| `docs/ARCHITECTURE.md` | Add news-fetch row to services table + port map |
| `docs/handoffs/ops-news-fetch-scaffold.md` | Correct port from 5007 → 5008 |

---

## 17. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Port 5007 conflict with forensic-analysis | HIGH | **Already resolved above: use 5008.** Verify forensic-analysis is not yet in docker-compose before closing. |
| DataDome block on Reuters Playwright path | MEDIUM | RSS is primary; Playwright is only the fallback. RSS has no bot protection. |
| Playwright image size (~1.3 GB) increases build time | LOW | Acceptable trade-off. Chromium is mandatory; image size is non-negotiable. |
| Concurrent Bloomberg + Reuters Playwright → OOM | MEDIUM | Sequential dispatch mandate in cron job (§11). |
| Bloomberg PerimeterX active challenge after initial passive | MEDIUM | Graceful error return; no retry; log for monitoring. |
| playwright-stealth JS-level effectiveness declining (2026 per technique doc) | MEDIUM | Acceptable: Bloomberg PX is passive-phase only; Reuters RSS covers the primary path. |
