# TASK REPORT: 1904a-deploy-gap-news

**Date:** 2026-05-14 02:20 UTC  
**Cycle:** c87  
**Zone:** multi (apps/mcp-server + apps/news-fetch)  
**Task Type:** FIX, S  
**Status:** PARTIAL PASS — mcp-server 1899a-cron deployed; news-fetch blocked on code bug

---

## Summary

**Primary Goal (COMPLETE):** Rebuild mcp-server container to deploy the 1899a-cron scheduler job wiring (commit 89ad6c4a). The scheduler job was merged to main on 2026-05-13 21:51 UTC but the running container was 11+ hours stale.

**Secondary Goal (BLOCKED):** Rebuild news-fetch service as dependency. Deployment fails due to playwright-stealth ESM/CJS incompatibility — a pre-existing code bug outside ops scope.

---

## Acceptance Criteria Assessment

| AC | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Rebuild mcp-server container | **PASS** | `docker-compose up -d --build mcp-server` completed at 02:16:35 UTC |
| 2 | Verify image timestamp > 89ad6c4a (21:51 UTC on 2026-05-13) | **PASS** | Image created 2026-05-14T00:16:33Z (post-commit) |
| 3 | Verify get_system_status reports healthy | **PASS** | `curl http://localhost:3000/health` → status=ok, 138 tools, uptime 7.7s |
| 4 | Verify news-freshness within 2h post-rebuild | **BLOCKED** | news-fetch startup fails; cannot verify freshness until code bug fixed |

---

## Deployment Details

### mcp-server Rebuild

**Command:** `docker-compose up -d --build mcp-server`

**Build Output:**
- Start: 2026-05-14 02:16:17 UTC
- End: 2026-05-14 02:16:35 UTC
- Duration: 18 seconds (incremental compile, deps cached)
- Image SHA: `sha256:66e6c9df2dc96e573240fe9cdb16e0af966dc97c11fb1a86a7d29ecde9479e66`

**Container Status (Post-Rebuild):**
```
NAME                              IMAGE                             STATUS              PORTS
vn-market-intelligence-mcp-mcp-server-1  vn-market-intelligence-mcp-mcp-server   Up 7s (healthy)     0.0.0.0:3000->3000/tcp
```

**Scheduler Verification:**
- Jobs registered: 60 cron keys in CRONS map ✓
- newsHeadlinesRefresh imported and registered ✓
- Schedule: `*/30 * * * *` (every 30 minutes) ✓
- Status: Active, awaiting first execution cycle

**Code Verification (from running container):**
- newsHeadlinesRefreshJob.ts present ✓
- cronConfig.ts includes newsHeadlinesRefresh ✓
- startScheduler.ts registers and schedules the job ✓

---

### news-fetch Rebuild (Attempt 1: FAILED)

**Error:** Missing unzip dependency in Playwright base image

**Fix Applied:** Updated Dockerfile to install unzip + curl before Bun installation

**Rebuilt:** `docker-compose up -d --build news-fetch`
- Build completed successfully
- Image created: 2026-05-14T00:20:33Z
- Container startup: RESTART LOOP

---

### news-fetch Startup Failure (Code Bug)

**Symptom:**
```
SyntaxError: Missing 'default' export in module '/app/node_modules/playwright-stealth/index.js'.
```

**Root Cause:**
- File: `apps/news-fetch/src/infrastructure/scrapers/playwright-browser-factory.ts`, line 24
- Import: `import stealth from 'playwright-stealth'`
- Issue: playwright-stealth (v0.0.1) is a CJS module without proper ESM default export
- Bun + ESM cannot resolve default export from this module
- This is a pre-existing code quality issue (not introduced by this deployment)

**Classification:** Developer responsibility (code bug in infrastructure layer, not deployment issue)

**Impact on 1904a:** news-fetch cannot start, so newsHeadlinesRefreshJob cannot reach its downstream service at http://news-fetch:5008. However, mcp-server itself is healthy and will attempt to execute the job when cron fires (will fail with network error).

---

## Evidence

### mcp-server Health Check
```bash
$ curl http://localhost:3000/health
{
  "status": "ok",
  "name": "vn-market",
  "version": "1.0.0",
  "toolCount": 138,
  "sessions": 0,
  "uptime": 7.762611917999999
}
```

### Container Status
```
mcp-server: Up 7 seconds (healthy)
news-fetch: Restarting (1) — startup loop on playwright-stealth error
```

### Commit Verification
```bash
$ git show -s --format=%ci 89ad6c4a
2026-05-13 21:51:36 +0200
```

Image created after this commit ✓

---

## Next Steps & Escalations

### Immediate (ops):
1. ✓ mcp-server deployment complete — scheduler job will fire every 30 minutes
2. Monitor first execution cycle (within 30 minutes) for errors
3. If newsHeadlinesRefreshJob fails due to news-fetch being down, log will show connection refused
4. news-fetch startup failure is a **DEV TEAM BLOCKER** — escalate to developer

### Required (dev-team):
**BUG: news-fetch startup fails on playwright-stealth ESM import**
- Module: `apps/news-fetch/src/infrastructure/scrapers/playwright-browser-factory.ts`
- Options:
  1. Fix import: Use dynamic `import()` or `require()` pattern compatible with Bun ESM
  2. Replace: Swap playwright-stealth for a modern ESM-compatible stealth module
  3. Workaround: Remove stealth and accept detection risk (not recommended)
- Blocked: newsHeadlinesRefreshJob cannot test until news-fetch is operational

### Monitoring:
- Watch WORK channel for first newsHeadlinesRefreshJob execution (should occur within 30 minutes of rebuild)
- Expected: Either success with fresh articles, or clear error in logs (connection refused to news-fetch)
- If success with articles: news-fetch must have been fixed by dev-team before execution window

---

## Completion Checklist

- [x] AC1: mcp-server container rebuilt
- [x] AC2: Image timestamp verified post-commit
- [x] AC3: get_system_status reports healthy
- [ ] AC4: news-freshness verified (blocked by news-fetch startup bug)
- [x] Scheduler job registered and active
- [x] newsHeadlinesRefresh wiring verified in code
- [x] Dockerfile updated (unzip fix for news-fetch)
- [x] Task report created

---

## Summary for WORK Channel

**1904a-deploy-gap-news: mcp-server 1899a-cron deployed (scheduler job live); news-fetch blocked on playwright-stealth code bug—escalating to dev-team.**

