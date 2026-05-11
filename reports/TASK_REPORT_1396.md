# TASK REPORT 1396 — fix(pollNewsJob): cron health not recording + VPS TasksMax crash

**Sprint:** 140
**Date:** 2026-04-17
**Status:** APPROVED

## Problem

Two issues discovered via cron health audit:

1. **`pollNewsJob` cron health stale (last run 2026-04-13)** — The `/api/push-news` endpoint calls `pollNews()` as fire-and-forget inside `setImmediate` but never wraps it in `recordJobRun`. Every VPS push succeeded (225 items/cycle confirmed in VPS logs) but zero rows written to `cron_job_runs` for `pollNewsJob`.

2. **Playwright `pthread_create: Resource temporarily unavailable`** — `vn-news-fetch.service` had `TasksMax=32`, too low for Chromium/Playwright which needs ~50+ threads. Caused `vneconomy-finance` browser source to crash every cycle, yielding 0 items from that source.

## Fix

### server.ts — wrap pollNews in recordJobRun
- `src/interface/mcp/server.ts` lines 824–853
- Added `recordJobRun(getDb(), "pollNewsJob", ...)` wrapper inside the `setImmediate` callback
- Imports `recordJobRun` and `getDb` dynamically (consistent with existing dynamic import pattern)

### VPS — raise TasksMax
- `/etc/systemd/system/vn-news-fetch.service`: `TasksMax=32 → 256`
- `systemctl daemon-reload && systemctl restart vn-news-fetch.service` applied live

## Verification

- `bun tsc --noEmit` clean
- `curl http://localhost:3000/health` → `{"status":"ok","toolCount":98}`
- VPS service restarted, `TasksMax=256` confirmed via `systemctl show`
- Next VPS push cycle will write `pollNewsJob` row to `cron_job_runs`
