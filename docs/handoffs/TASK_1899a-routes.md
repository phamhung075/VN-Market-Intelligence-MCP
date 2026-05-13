# TASK 1899a-routes — HTTP Routes: Hono Router & Handlers

**Sprint:** 1899a | **Branch:** `task/1899a-routes-handlers` | **Size:** M | **Zone:** apps/news-fetch/

---

## TLDR

Wire Hono router in src/interface/handlers.ts with routes: GET /health, POST /news/reuters/headlines, GET /news/reuters/headlines, POST /news/bloomberg/headlines, GET /news/bloomberg/headlines. Inject use cases + scrapers. Implement fallback logic: Reuters RSS fails → trigger fallback Playwright. Routes return `FetchResult` JSON.

---

## Planning Context

**Architecture Brief:** `docs/architecture-briefs/2026-05-13-news-fetch-service.md`
- §7: HTTP Route Table — 5 routes (health + 2 × source with GET alias)
- §6a/§6b: Reuters logic — RSS primary, fallback on error/empty
- §6c: Bloomberg — Playwright only (no fallback)
- Pattern: Mirror macro-indicators (POST primary + GET alias per endpoint)

**Routes Spec:**

| Method | Path | Handler | Notes |
|--------|------|---------|-------|
| GET | /health | inline | `{ status: "ok", service: "news-fetch", port: 5008 }` |
| POST | /news/reuters/headlines | FetchReutersHeadlinesUseCase + fallback | body: `{ maxItems?: number }` |
| GET | /news/reuters/headlines | (alias) | convenience GET variant |
| POST | /news/bloomberg/headlines | FetchBloombergHeadlinesUseCase | body: `{ maxItems?: number }` |
| GET | /news/bloomberg/headlines | (alias) | convenience GET variant |

**Files to Create:**

| File | Purpose | Lines |
|------|---------|-------|
| `apps/news-fetch/src/interface/handlers.ts` | Hono router, 5 routes, use case instantiation | ~120 |

**Fallback Logic (Reuters only):**
```
1. Try ReutersRssScraper.fetchHeadlines(maxItems)
2. If result.error != null OR result.articles.length === 0:
   3. Try ReutersStealthFallback.fetchHeadlines(maxItems)
   4. Return fallback result
5. Else: return RSS result
```

**Dependencies:** Depends on 1899a-app (use cases), 1899a-reuters-rss, 1899a-reuters-fallback, 1899a-bloomberg, 1899a-factory.

**Files to Modify:** `src/index.ts` (wire in Hono app).

**Knowledge Needed:**
- Brief §7 (route table)
- Brief §6a/§6b (fallback logic: RSS error → stealth)
- Hono basics (Hono.get(), Hono.post(), body parsing)

---

## Acceptance Criteria

- [ ] **src/interface/handlers.ts created**:
  - Imports `Hono` from hono
  - Imports use cases: `FetchReutersHeadlinesUseCase`, `FetchBloombergHeadlinesUseCase` from ../application/use-cases
  - Imports scrapers: `ReutersRssScraper`, `ReutersStealthFallback`, `BloombergStealth` from ../infrastructure/scrapers/
  - Exports default: Hono router instance

- [ ] **GET /health route**:
  - Handler: `app.get('/health', (c) => { return c.json({ status: 'ok', service: 'news-fetch', port: 5008 }) })`
  - Returns 200 JSON

- [ ] **POST /news/reuters/headlines route**:
  - Handler: instantiate ReutersRssScraper → use case → call .execute(maxItems)
  - Parse body: `{ maxItems?: number }` (default 15)
  - Fallback logic:
    - Call ReutersRssScraper.fetchHeadlines(maxItems)
    - If result.error != null OR articles.length === 0:
      - Call ReutersStealthFallback.fetchHeadlines(maxItems)
      - Return fallback result
    - Else: return RSS result
  - Return 200 JSON (FetchResult envelope)

- [ ] **GET /news/reuters/headlines route**:
  - Alias for POST (same handler, querystring fallback for maxItems)
  - `app.get('/news/reuters/headlines', (c) => { /* same logic as POST */ })`

- [ ] **POST /news/bloomberg/headlines route**:
  - Handler: instantiate BloombergStealth → use case → call .execute(maxItems)
  - Parse body: `{ maxItems?: number }` (default 10)
  - NO fallback (Bloomberg only path)
  - Return 200 JSON (FetchResult envelope)

- [ ] **GET /news/bloomberg/headlines route**:
  - Alias for POST (same handler)

- [ ] **Error handling**:
  - All routes wrapped in try/catch
  - On exception: return 500 JSON: `{ error: "Internal server error", ..., fetchedAt }`
  - Exceptions logged per dev-standards

- [ ] **Type safety**:
  - Request/response types explicit
  - No implicit any
  - Hono context typed (`c: Context`)

- [ ] **src/index.ts updated**:
  - Import handlers router
  - Wire into Hono app: `const app = new Hono().route('/', handlersRouter)` or similar
  - No logic duplication (handlers.ts owns all routes)

- [ ] **Commit message**:
  - Format: `feat(1899a-routes): HTTP routes — /health, /news/{reuters,bloomberg}/headlines with fallback`
  - Trailers: `Task: 1899a-routes`

---

## [Developer] Notes

**Hono router skeleton:**

```typescript
// src/interface/handlers.ts
import { Hono, Context } from 'hono';
import { FetchReutersHeadlinesUseCase } from '../application/use-cases';
import { FetchBloombergHeadlinesUseCase } from '../application/use-cases';
import { ReutersRssScraper } from '../infrastructure/scrapers/reuters-rss';
import { ReutersStealthFallback } from '../infrastructure/scrapers/reuters-stealth';
import { BloombergStealth } from '../infrastructure/scrapers/bloomberg-stealth';
import { FetchResult } from '../domain/models';

export const app = new Hono();

app.get('/health', (c: Context) => {
  return c.json({
    status: 'ok',
    service: 'news-fetch',
    port: 5008,
  });
});

app.post('/news/reuters/headlines', async (c: Context) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const maxItems = body.maxItems ?? 15;

    // Primary: RSS
    const rssAdapter = new ReutersRssScraper();
    const rssUseCase = new FetchReutersHeadlinesUseCase(rssAdapter);
    const rssResult = await rssUseCase.execute(maxItems);

    // Fallback: Playwright if RSS failed or empty
    if (rssResult.error != null || rssResult.articles.length === 0) {
      const fallbackAdapter = new ReutersStealthFallback();
      const fallbackUseCase = new FetchReutersHeadlinesUseCase(fallbackAdapter);
      const fallbackResult = await fallbackUseCase.execute(maxItems);
      return c.json(fallbackResult);
    }

    return c.json(rssResult);
  } catch (err) {
    console.error('[reuters/headlines] error:', err);
    return c.json({
      error: 'Internal server error',
      fetchedAt: new Date().toISOString(),
    }, 500);
  }
});

app.get('/news/reuters/headlines', async (c: Context) => {
  // Delegate to POST handler
  const maxItems = c.req.query('maxItems') ? parseInt(c.req.query('maxItems')!) : 15;
  // Re-use POST logic (or extract to shared function)
  return app.request(
    new Request('http://localhost:5008/news/reuters/headlines', {
      method: 'POST',
      body: JSON.stringify({ maxItems }),
    })
  );
});

app.post('/news/bloomberg/headlines', async (c: Context) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const maxItems = body.maxItems ?? 10;

    const adapter = new BloombergStealth();
    const useCase = new FetchBloombergHeadlinesUseCase(adapter);
    const result = await useCase.execute(maxItems);
    return c.json(result);
  } catch (err) {
    console.error('[bloomberg/headlines] error:', err);
    return c.json({
      error: 'Internal server error',
      fetchedAt: new Date().toISOString(),
    }, 500);
  }
});

app.get('/news/bloomberg/headlines', async (c: Context) => {
  // Delegate to POST (same as Reuters GET)
  const maxItems = c.req.query('maxItems') ? parseInt(c.req.query('maxItems')!) : 10;
  return app.request(
    new Request('http://localhost:5008/news/bloomberg/headlines', {
      method: 'POST',
      body: JSON.stringify({ maxItems }),
    })
  );
});

export default app;
```

**Important notes:**
- GET/POST aliases can be implemented two ways:
  1. Duplicate logic (simpler but DRY violation)
  2. Extract shared handler + wire both methods (cleaner)
  - Brief pattern mirrors macro-indicators (GET alias for convenience)
- Fallback is Reuters-only: if RSS error/empty → try Playwright, return result regardless
- Bloomberg has no fallback (single path)
- Body parsing: Hono's `c.req.json()` handles it; wrap in try/catch for invalid JSON
- Error logging: use console.error per dev-standards

**Testing locally:**
```bash
cd apps/news-fetch
bun src/index.ts &  # Start server in background
sleep 2

# Test health
curl http://localhost:5008/health

# Test Reuters
curl -X POST http://localhost:5008/news/reuters/headlines -H "Content-Type: application/json" -d '{"maxItems": 5}'

# Test Bloomberg
curl http://localhost:5008/news/bloomberg/headlines?maxItems=3
```

---

## Zone Enforcement

**Zone:** `apps/news-fetch/` (single service).
- All files in src/interface/
- Update src/index.ts to wire handler router (minimal change)
- Next task (1899a-gateway) will add gateway routing + docker-compose

---

## [Developer] Implementation Record

- **Service:** news-fetch
- **Zone:** apps/news-fetch/
- **Files created:**
  - `apps/news-fetch/src/interface/handlers.ts:142L` — createRouter() factory, 5 routes (health + reuters POST/GET + bloomberg POST/GET), RSS→fallback logic, DI ports
  - `apps/news-fetch/__tests__/1899a-routes-health-reuters.test.ts:199L` — 18 tests: health shape, reuters success/fallback/error/defaults
  - `apps/news-fetch/__tests__/1899a-routes-bloomberg.test.ts:197L` — 17 tests: bloomberg success/error/defaults, GET aliases for both sources
- **Files modified:**
  - `apps/news-fetch/src/index.ts:35L` — composition root: imports createRouter + scrapers, wires real ports
  - `apps/news-fetch/__tests__/1899a-core-smoke.test.ts:35L` — updated health shape assertion (version→port, per AC)
- **Tests written:** 35 new route tests across 2 files (split policy ≤200L each), 137 total / 0 fail
- **Git commits:** `2c0b9f45 feat(1899a-routes): Hono router + 5 routes + Reuters fallback wiring`
- **Type check:** clean (0 errors)
- **Service tests:** 137 pass / 0 fail
- **Docs updated:** docs/TASKS.md — 1899a-routes moved to IN REVIEW
- **Graphify:** skipped (no docs/architecture impacted)
