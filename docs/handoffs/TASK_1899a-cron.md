# TASK 1899a-cron — MCP Scheduler: newsHeadlinesRefreshJob

**Sprint:** 1899a | **Branch:** `task/1899a-cron-scheduler` | **Size:** M | **Zone:** apps/mcp-server/

---

## TLDR

Create newsHeadlinesRefreshJob.ts in mcp-server scheduler: HTTP dispatch to news-fetch (sequential: Bloomberg first, then Reuters), parse results, call `/api/push-news` with normalized items. Register job in jobs.ts CRONS map. Cadence: 30 minutes (configurable via mcp.config.json).

---

## Planning Context

**Architecture Brief:** `docs/architecture-briefs/2026-05-13-news-fetch-service.md`
- §11: Cron Job Design — newHeadlinesRefreshJob.ts pattern
- Cadence: 30 minutes (configurable)
- Dispatch order: SEQUENTIAL (Bloomberg first, Reuters second; not concurrent)
- §9: RAM constraint — sequential dispatch enforced (no concurrent Playwright browsers)

**Job Behavior:**
1. POST `http://news-fetch:5008/news/bloomberg/headlines`
2. Parse FetchResult, normalize items to mcp-server schema
3. POST `http://news-fetch:5008/news/reuters/headlines`
4. Parse FetchResult, normalize items
5. POST `/api/push-news` with merged items (or separate calls per source)
6. On error: log + continue (non-blocking)

**Files to Create:**

| File | Purpose | Lines |
|------|---------|-------|
| `apps/mcp-server/src/scheduler/news-analysis/newsHeadlinesRefreshJob.ts` | Job orchestrator (HTTP dispatch + normalization) | ~100 |

**Files to Modify:**

| File | Changes |
|------|---------|
| `apps/mcp-server/src/scheduler/news-analysis/index.ts` | Export `newsHeadlinesRefreshJob` from module barrel |
| `apps/mcp-server/src/scheduler/jobs.ts` | (1) Import job, (2) add CRONS entry, (3) register in startScheduler() |
| `mcp.config.json` | Add scheduler section: `newsHeadlinesRefresh: { cadence: '*/30 * * * *', ... }` |

**Dependencies:** Depends on 1899a-gateway (news-fetch running in docker-compose).

**Knowledge Needed:**
- Brief §11 (cron job spec, sequential dispatch)
- Existing cron pattern (compare taAlertScanJob, macroRefresh)
- mcp.config.json structure (scheduler section)
- `/api/push-news` endpoint schema (or reverse-engineer from code)

---

## Acceptance Criteria

- [ ] **apps/mcp-server/src/scheduler/news-analysis/newsHeadlinesRefreshJob.ts created**:
  - Exports `async function newsHeadlinesRefreshJob()`
  - Imports `fetch` (Bun native), logger utilities, optional config loader
  - No external service imports (HTTP only)

- [ ] **Sequential dispatch behavior**:
  - Step 1: `POST http://news-fetch:5008/news/bloomberg/headlines` (maxItems default or from config)
    - Await response (blocking)
    - Parse JSON response as `FetchResult`
    - If error: log warning, continue (non-blocking)
    - Collect articles into local array
  - Step 2: `POST http://news-fetch:5008/news/reuters/headlines`
    - Same: await, parse, collect articles
    - If error: log warning, continue
  - Step 3: POST `/api/push-news` with normalized articles (or make two calls, one per source)
    - Endpoint location: `http://localhost:3000/api/push-news` (internal mcp-server)
    - Payload: array of normalized items (schema TBD; likely similar to existin mcp-server news items)
    - Error handling: log only (non-blocking)

- [ ] **Error handling**:
  - Network timeout: log, continue (don't block next cycle)
  - Malformed response: log, continue
  - Missing endpoint: log, continue
  - No retry logic (cron will re-run in 30 min)

- [ ] **Logging**:
  - Log start: `[newsHeadlinesRefreshJob] starting — dispatch to news-fetch`
  - Log per source: `[newsHeadlinesRefreshJob] bloomberg: X articles fetched (method: playwright-stealth)`
  - Log per source: `[newsHeadlinesRefreshJob] reuters: Y articles fetched (method: rss)`
  - Log on error: `[newsHeadlinesRefreshJob] error pushing articles: {error}`
  - Log completion: `[newsHeadlinesRefreshJob] complete — {total} articles pushed`

- [ ] **apps/mcp-server/src/scheduler/news-analysis/index.ts updated**:
  - Add export: `export { newsHeadlinesRefreshJob } from './newsHeadlinesRefreshJob'`
  - (Or confirm barrel already exists and add import/export)

- [ ] **apps/mcp-server/src/scheduler/jobs.ts updated**:
  - Import: `import { newsHeadlinesRefreshJob } from './news-analysis'` (line ~36-40 with other jobs)
  - Add CRONS entry: `newsHeadlinesRefresh: process.env['CRON_NEWS_HEADLINES_REFRESH'] ?? '*/30 * * * *',`
  - Register in `startScheduler()`:
    ```typescript
    cron.schedule(CRONS.newsHeadlinesRefresh, () => {
      recordJobRun(getDb(), 'newsHeadlinesRefreshJob', async () => {
        await newsHeadlinesRefreshJob();
      });
    });
    ```
  - Pattern matches existing taAlertScanJob, macroRefresh entries

- [ ] **mcp.config.json updated**:
  - Add or update scheduler section with:
    ```json
    "newsHeadlinesRefresh": {
      "cadence": "*/30 * * * *",
      "description": "Fetch Reuters + Bloomberg headlines every 30 minutes"
    }
    ```
  - Or use environment variable override: `CRON_NEWS_HEADLINES_REFRESH`

- [ ] **Typescript compilation**:
  - `tsc --noEmit` in apps/mcp-server passes
  - Job function is callable: no unresolved imports

- [ ] **Commit message**:
  - Format: `feat(1899a-cron): newsHeadlinesRefreshJob — sequential Bloomberg + Reuters HTTP dispatch`
  - Trailers: `Task: 1899a-cron`

---

## [Developer] Notes

**Job skeleton:**

```typescript
// src/scheduler/news-analysis/newsHeadlinesRefreshJob.ts
import { FetchResult } from '../../domain/models'; // shared types if available

const NEWS_FETCH_URL = process.env['NEWS_FETCH_URL'] ?? 'http://news-fetch:5008';
const API_GATEWAY_URL = 'http://localhost:3000'; // internal

export async function newsHeadlinesRefreshJob(): Promise<void> {
  const logger = console; // or import getLogger()
  const jobId = `newsHeadlinesRefreshJob@${new Date().toISOString()}`;
  
  logger.log(`[${jobId}] starting — dispatch to news-fetch`);

  try {
    const articles: any[] = [];

    // Step 1: Bloomberg
    try {
      const resp = await fetch(`${NEWS_FETCH_URL}/news/bloomberg/headlines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxItems: 10 }),
      });
      
      if (!resp.ok) {
        logger.warn(`[${jobId}] bloomberg HTTP ${resp.status}`);
      } else {
        const result = (await resp.json()) as FetchResult;
        if (result.error) {
          logger.warn(`[${jobId}] bloomberg error: ${result.error}`);
        } else {
          logger.info(`[${jobId}] bloomberg: ${result.articles.length} articles (${result.method})`);
          articles.push(...result.articles);
        }
      }
    } catch (err) {
      logger.error(`[${jobId}] bloomberg exception:`, err);
    }

    // Step 2: Reuters (sequential — after Bloomberg)
    try {
      const resp = await fetch(`${NEWS_FETCH_URL}/news/reuters/headlines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxItems: 15 }),
      });
      
      if (!resp.ok) {
        logger.warn(`[${jobId}] reuters HTTP ${resp.status}`);
      } else {
        const result = (await resp.json()) as FetchResult;
        if (result.error) {
          logger.warn(`[${jobId}] reuters error: ${result.error}`);
        } else {
          logger.info(`[${jobId}] reuters: ${result.articles.length} articles (${result.method})`);
          articles.push(...result.articles);
        }
      }
    } catch (err) {
      logger.error(`[${jobId}] reuters exception:`, err);
    }

    // Step 3: Push to mcp-server
    if (articles.length > 0) {
      try {
        const pushResp = await fetch(`${API_GATEWAY_URL}/api/push-news`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: articles }),
        });
        
        if (!pushResp.ok) {
          logger.warn(`[${jobId}] push-news HTTP ${pushResp.status}`);
        } else {
          logger.info(`[${jobId}] pushed ${articles.length} articles`);
        }
      } catch (err) {
        logger.error(`[${jobId}] push-news exception:`, err);
      }
    }

    logger.log(`[${jobId}] complete — ${articles.length} total`);
  } catch (err) {
    logger.error(`[${jobId}] fatal error:`, err);
  }
}
```

**CRONS pattern (from existing jobs.ts):**
```typescript
const CRONS = {
  taAlertScan: process.env['CRON_TA_ALERT_SCAN'] ?? '*/5 * * * *',
  macroRefresh: process.env['CRON_MACRO_REFRESH'] ?? '*/15 * * * *',
  newsHeadlinesRefresh: process.env['CRON_NEWS_HEADLINES_REFRESH'] ?? '*/30 * * * *',
  // ... others
};

// In startScheduler():
cron.schedule(CRONS.newsHeadlinesRefresh, () => {
  recordJobRun(getDb(), 'newsHeadlinesRefreshJob', async () => {
    await newsHeadlinesRefreshJob();
  });
});
```

**Config pattern (mcp.config.json):**
```json
{
  "scheduler": {
    "newsHeadlinesRefresh": {
      "cadence": "*/30 * * * *",
      "enabled": true,
      "description": "Fetch international headlines from Bloomberg + Reuters"
    }
  }
}
```

**Sequential dispatch note:**
- Brief §9 RAM constraint: concurrent Playwright browsers (Bloomberg + Reuters fallback) can spike to ~980 MB
- Sequential dispatch ensures only one browser at a time (max ~500 MB at peak)
- cron.schedule ensures no overlap (next cycle starts 30 min later)
- Error isolation: Bloomberg failure does NOT block Reuters execution

**Testing locally (post-merge):**
```bash
docker-compose up -d mcp-server news-fetch
sleep 10
# Manually trigger via MCP tool if available, or wait 30 min for cron
curl -X POST http://localhost:3000/api/start-job -H "Content-Type: application/json" -d '{"jobName": "newsHeadlinesRefreshJob"}'
```

---

## Zone Enforcement

**Zone:** `apps/mcp-server/`
- File creation: src/scheduler/news-analysis/newsHeadlinesRefreshJob.ts
- File modifications: src/scheduler/jobs.ts, src/scheduler/news-analysis/index.ts
- Config: mcp.config.json (root, shared)

**Next task:** 1899a-tests (unit + integration test suite)
