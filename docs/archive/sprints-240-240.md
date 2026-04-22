# Archive: Sprint 240 (VN Market Intelligence MCP)

> **Period:** 2026-04-21 (1 day)
> **Summary:** 1 sprint, 4 tasks. Price pipeline recovery + data freshness enforcement. Code implementation complete. Infrastructure investigation pending.

---

## Sprint 240 — COMPLETE: Price Pipeline Recovery + Data Freshness Enforcement (2026-04-21)

**Goal:** Restore price data freshness monitoring, implement backfill service, hardening price watchdog for auto-escalation, add freshness gates to briefing jobs. Recover from 25-day market_prices staleness caused by VPS geo-block infrastructure outage.

**Code Status:** COMPLETE & VERIFIED (6124 tests passing / 0 fail)

| ID | Title | Status | Role | Notes |
|----|-------|--------|------|-------|
| 240a | TDD RED — price pipeline recovery test suite (12+ assertions) | Done | Dev | 13 tests, all green |
| 240b | GREEN — priceBackfillService + watchdog escalation + freshness gates | Done | Dev | All DDD constraints satisfied |
| 240c | Integration — recordJobRun wrapper + schema UNIQUE(ticker, date, source) | Done | Dev | Merged, tested |
| 240e | QA Smoke test — SLA monitor fix + briefing freshness verification | Done | QA | Code verified clean; VPS infrastructure pending ops recovery |

---

## Technical Summary

**Root Cause (Postmortem):** SLA monitor job queried non-existent `foreign_flow` table, causing briefing generation to fail silently.

**Fix Applied:** Commit `f628da2` — slaStatusTools.ts line 54 now correctly queries `vnstock_trading_stats.fetched_at` instead of non-existent table.

**Code Artifacts:**
- **Price Backfill Service:** `src/domain/services/priceBackfillService.ts` (handles 25-day gap recovery)
- **Price Watchdog:** `src/scheduler/market-data/priceUpdateWatchdogJob.ts` (6h threshold + auto-escalation)
- **Briefing Freshness Gate:** `src/application/usecases/assembleBriefing.ts` (suppresses stale briefings)
- **SLA Monitor Fix:** `src/interface/mcp/tools/system/slaStatusTools.ts` (line 54, vnstock_trading_stats query)

**Test Coverage:**
- Task 240a: 13 tests green (price pipeline recovery)
- Task 240b: Integrated into morning briefing tests (14 pass)
- Task 240c: Integrated into E2E briefing tests (39 pass)
- Task 240e: Full suite 6124 pass / 0 fail

---

## Infrastructure Status

**VPS Services (as of 2026-04-21 17:30 UTC):**
- All 5 geo-blocked services unreachable (ops investigation required)
- market_prices table stale 25 days
- **NOT a code issue — infrastructure/ops problem**

**Ops Checklist:**
1. SSH to Vinahost VPS: `ssh root@$VINAHOST_IP /root/vps-status.sh`
2. Check service status: `systemctl status vn-price-fetch.service vn-news-fetch.service`
3. If alive: restart: `systemctl restart vn-price-fetch.service`
4. If dead: restart via panel + redeploy: `./deploy-vinahost.sh`
5. Monitor `vps_service_health` table for recovery

---

## Sign-Off

- Code implementation: COMPLETE (240a–240c merged)
- QA verification: PASSED (240e code review)
- Test suite: 6124 pass / 0 fail
- TypeScript: 0 errors
- DDD compliance: 100%
- Infrastructure: PENDING (VPS recovery awaited)

**Ready for production deployment once VPS services recover and 24h live data validated.**

---

## See Also

- Task reports: `reports/TASK_REPORT_240a.md`, `reports/TASK_REPORT_240b.md`, `reports/TASK_REPORT_240c.md`, `reports/TASK_REPORT_240e.md`
- Technical spec: `docs/TECH-240.md`
- Requirements: `docs/REQ-240.md`
- Current sprint status: `SPRINT_GOAL.md`
