---
---

# Reuters & Trading Economics RSS stalled 4+ hours

**Detection Date:** 2026-04-24 05:52 UTC
**Duration:** 4+ hours (last success ~01:52 UTC)
**Error Count:** 35+ consecutive failures
**Status:** Stalled (circuit may be open)
**Impact:** Missing global macro news during trading hours. VPS vn-news-fetch.service should be delivering all sources, but Reuters/Trading Economics RSS appears to have broken upstream. All other sources (CafeF, VnExpress, VnEconomy, nhandan, tuoitre, vietnambiz, vietstock, vnbusiness) healthy.
**Action:** Check if VPS service restart needed or if Reuters/TE RSS feeds moved/changed URL.