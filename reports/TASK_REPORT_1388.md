# TASK_REPORT_1388 — GREEN fix: morning-briefing filler removal

verdict: APPROVED
date: 2026-04-17
branch: main (merged via 5af3b3d)

---

## Results

| Check | Result |
|-------|--------|
| T1: vnIndex=null → no "chưa có dữ liệu" | PASS |
| T2: watchlistSummary=[] → no "Chưa có dữ liệu giá" | PASS |
| T3: price=null entry absent, others present | PASS |
| T4: all data present → sections rendered correctly | PASS |
| Targeted suite (1387-morning-briefing-filler.test.ts) | 4/4 pass, 21 assertions |
| Full regression | 5026 pass, 0 fail, 21 skip |
| tsc --noEmit | 0 errors |
| Filler strings in morningBriefingJob.ts | 0 matches |
| DDD compliance | CLEAN |

## Filler scan

```
grep "chưa có dữ liệu|Chưa có dữ liệu giá|N/A" src/scheduler/morningBriefingJob.ts
→ 0 matches
```

## DDD compliance

- `morningBriefingJob.ts` (scheduler/interface layer) imports `application/usecases/assembleBriefing.js` — allowed
- `logger` from `infrastructure` — cross-cutting concern, allowed at all layers
- No domain layer importing upward — clean

## Files confirmed clean

- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/morningBriefingJob.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1387-morning-briefing-filler.test.ts

## Implementation summary

3 changes to `formatBriefingMessage`:
1. VN-Index `else` branch removed — section omitted when `vnIndex=null`
2. Watchlist header moved inside `entries.length > 0` guard — omitted when empty/all-null
3. `"Chưa có dữ liệu giá"` fallback removed; null-price entries filtered via `w.price != null`

merge_commit: 5af3b3d (chore: mark task 1388 Review) + 5b974ba (fix commit)
