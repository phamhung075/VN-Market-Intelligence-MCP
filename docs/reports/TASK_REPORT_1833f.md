# Task Report — TASK 1833f: vn-news-fetch lastHeartbeat Fix

**Branch**: `task/1833f-vn-news-heartbeat`
**Commit**: `ac0fd6e8`
**Date**: 2026-05-02

---

## Problem

`vn-news-fetch` health endpoint reported "unhealthy" despite 90+ successful pushes per 24h.

**Root cause**: The freshness config for `vn-news-fetch` in `DEFAULT_FRESHNESS_CONFIGS` used:

```sql
SELECT MAX(created_at) AS latest_at FROM rag_analyses
```

When the VPS pushes articles that are all duplicates (already in the DB), `pollNews` deduplicates them and inserts 0 new rows into `rag_analyses`. The health check then reads a stale `MAX(created_at)` and reports "unhealthy", even though `vn-news-fetch` is actively pushing data.

---

## Fix

**File**: `apps/mcp-server/src/domain/services/vpsHealthPoller.ts`

Changed `latestTimestampSql` for `vn-news-fetch` to take `MAX` across two sources:

```sql
SELECT MAX(latest_at) AS latest_at FROM (
  SELECT MAX(pushed_at) AS latest_at
    FROM vps_push_log
   WHERE service = 'news' AND status = 'ok'
  UNION ALL
  SELECT MAX(created_at) AS latest_at
    FROM rag_analyses
)
```

- `vps_push_log.pushed_at` — updated on every successful HTTP push, regardless of deduplication. This is the true liveness heartbeat.
- `rag_analyses.created_at` — retained as a secondary source for backward compatibility with existing observability tests.

Result: `healthy` = either a recent push OR a recent rag insert within 30-minute SLA.

---

## Tests

**New test file**: `apps/mcp-server/src/__tests__/1833f-vn-news-heartbeat.test.ts`

| Test | Result |
|------|--------|
| AC-1: healthy when vps_push_log has recent ok push (rag_analyses stale) | PASS |
| AC-2: unhealthy when vps_push_log has no recent push | PASS |
| AC-3: latestTimestampSql includes vps_push_log | PASS |

**Regression check**:
- `FIX-VPS-HEALTH-FRESHN.test.ts`: 16/16 pass (no regression)
- `234-vps-health-sla.test.ts`: 12/12 pass
- `1406b-vps-health-idle-constraint.test.ts`: 3/3 pass
- Full suite: 8721 pass, 1 pre-existing fail (1331a unrelated)

---

## Handoff to QA

Branch `task/1833f-vn-news-heartbeat` is ready for review.

Verify:
1. `bun test apps/mcp-server/src/__tests__/1833f-vn-news-heartbeat.test.ts` — 3 pass
2. `bun test apps/mcp-server/src/__tests__/FIX-VPS-HEALTH-FRESHN.test.ts` — 16 pass
3. In production: after VPS pushes 90+ news articles/day all deduped, `get_vps_service_health` should return `healthy` for `vn-news-fetch` instead of `unhealthy`.
