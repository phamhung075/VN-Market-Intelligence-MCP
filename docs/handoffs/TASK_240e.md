# Task Context — 240e: QA Smoke test — live price flow + briefing freshness

## TLDR (read this first)
change: manual smoke test during market hours (09:00–15:00 UTC+7)
test: verify backfill rows ≥500 | prices ≤24h fresh | watchdog escalation works | briefing sent or suppressed correctly
branch: none (QA review + report)
depends: 240a-c ✓ (all implementation merged)
knowledge_needed: [TECH-240-success-metrics, qa-checklist, VN-market-hours]

---

**sprint:** 240
**branch:** none (QA review phase)
**status:** todo (after 240c done)
**req_ref:** REQ-240
**tech_ref:** TECH-240 (success metrics lines 377–387)

---

## [PM] Planning Context

**layer:** qa (smoke test + system verification)

**depends_on:** [240a ✓, 240b ✓, 240c ✓ all merged to main]

**verification_steps:**

Execute during VN market hours (09:00–15:00 UTC+7 = 02:00–08:00 UTC):

1. **Backfill Verification**
   - Query: `SELECT COUNT(*) FROM market_prices WHERE source='backfill' AND inserted_at >= '2026-04-20'`
   - Expected: ≥500 rows
   - Log result to report

2. **Price Freshness Check**
   - Query: `SELECT MAX(updated_at) FROM market_prices`
   - Calculate age in hours: (NOW - maxUpdatedAt) / (1000 * 60 * 60)
   - Expected: ≤24 hours old
   - Log latest update timestamp to report

3. **Briefing Delivery Verification**
   - Trigger morning briefing (if not auto-sent)
   - Check Telegram MARKET channel: briefing posted with ≥3 watchlist movers
   - Check JSON file: `./data/briefings/2026-04-21.json` contains price data
   - If prices stale: briefing suppressed, WORK alert sent (check logs)
   - Log outcome (sent / suppressed) to report

4. **Evening Summary Verification**
   - Trigger evening summary (if not auto-sent)
   - Check Telegram MARKET channel: summary posted with updated prices
   - Check JSON file: `./data/briefings/2026-04-21-evening.json` exists
   - Log freshness gate result to report

5. **Watchdog Escalation Test** (if staleness occurs)
   - Manually trigger staleness condition (or wait for natural staleness >6h)
   - Verify watchdog detects it (logs + cooldown)
   - Verify WORK alert sent: "[PRICE STALENESS] VN prices >6h old..."
   - Verify MARKET alert sent: "[Market Data Alert] Prices updating..."
   - Verify SSH restart attempted (check logs for systemctl cmd)
   - Log alert timestamps + results to report

6. **No Duplicate Prices**
   - Query: `SELECT COUNT(*) FROM market_prices GROUP BY ticker, date, source HAVING COUNT(*) > 1`
   - Expected: 0 (no duplicates)
   - Log to report

---

## Test Checklist

- [ ] Server running (bun start or launchctl kickstart)
- [ ] Market hours window identified (09:00–15:00 UTC+7)
- [ ] Database ready (SQLite + schema with UNIQUE constraint)
- [ ] Backfill query executed → count ≥500 recorded
- [ ] Latest price timestamp queried → age ≤24h recorded
- [ ] Briefing delivered or suppressed correctly (check MARKET + WORK channels + JSON files)
- [ ] Evening summary delivered or suppressed correctly (check MARKET + WORK channels + JSON files)
- [ ] Watchdog escalation tested (if staleness present) → WORK + MARKET alerts verified
- [ ] No duplicate price tuples in market_prices
- [ ] All assertions passed

---

## Report Generation

Create `reports/TASK_REPORT_240e.md` with format:

```markdown
# TASK_REPORT_240e: QA Smoke Test — Price Pipeline Recovery (Sprint 240)

**Date:** 2026-04-21
**Executed by:** QA
**Test Duration:** [HH:MM–HH:MM UTC+7]
**Server Status:** ✓ Running
**Database:** ✓ Ready

## Acceptance Criteria Results

| AC | Metric | Target | Result | Status |
|----|--------|--------|--------|--------|
| AC-1 | Backfill rows (source='backfill', inserted_at >= 2026-04-20) | ≥500 | [COUNT] | ✓ PASS |
| AC-2 | Latest price age (max(updated_at)) | ≤24h | [AGE] hours | ✓ PASS |
| AC-3 | Briefing delivery | sent or suppressed + logged | [OUTCOME] | ✓ PASS |
| AC-4 | Evening summary delivery | sent or suppressed + logged | [OUTCOME] | ✓ PASS |
| AC-5 | Watchdog escalation (if stale) | WORK + MARKET alerts + SSH attempt | [LOGGED] | ✓ PASS |
| AC-6 | No duplicate (ticker, date, source) tuples | COUNT = 0 | [COUNT] | ✓ PASS |

## Evidence Artifacts

- Latest price timestamp: [ISO timestamp]
- Backfill row count: [N]
- Briefing JSON path: [path]
- Evening summary JSON path: [path]
- Telegram MARKET channel screenshots: [links if available]
- Watchdog alert logs: [grep output if applicable]
- SSH restart status: [attempted/not-needed]

## Observations

[Free-form notes on test execution, any issues, anomalies, workarounds]

## Sign-Off

- [x] All 6 acceptance criteria passed
- [x] No blocking issues found
- [x] Ready for production deployment
- Sprint 240 COMPLETE

**Signed:** QA
**Date:** 2026-04-21
```

---

## Success Criteria (TECH-240 lines 377–387)

All metrics must be verified and logged:

1. market_prices rows ≥500 with updated_at >= 2026-04-20 ✓
2. Evening briefing shows ≥3 watchlist movers with recent prices ✓
3. VN Index price ≤1 day stale in briefing ✓
4. Briefing freshness gate logs suppression (if stale) ✓
5. Watchdog escalates to WORK + MARKET on staleness >6h ✓
6. No duplicate (ticker, date, source) tuples in market_prices ✓

---

## Verification Checklist

- [ ] Sprint 240 implementation (240a–240c) fully merged
- [ ] Server started and healthy
- [ ] SQLite database initialized with schema constraints
- [ ] All manual smoke test steps executed during market hours
- [ ] All 6 success metrics verified
- [ ] TASK_REPORT_240e.md generated and committed
- [ ] Sign-off complete → Sprint 240 DONE

---

## [QA] Review Record

**verdict:** CHANGES_REQUIRED

**blocking_issues:**
- **CRITICAL: VPS Proxy Infrastructure DOWN** — vps_service_health table shows all 5 geo-blocked services (price-fetch, bctc-fetch, news-fetch, sbv-fetch, foreign-flow) unreachable since 17:30 UTC. Contact Vinahost support to verify VPS instance health. No market data ingestion for 25 days.
- Backfill schema mismatch: `source` column does not exist in market_prices; spec clarification needed
- Evening briefing job not running: no 2026-04-21-evening.json files; verify cron schedule in cron-registry.json

**non_blocking:**
- Test 125 timezone dependency: test seeds RAG with `Date.now() - 1h`, fails if run late UTC. Fix: use midnightVietnamAsUtc() buffer (src/__tests__/125-test-e2e-briefing.test.ts:1153)

**files_confirmed_clean:**
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/briefings/morningBriefingJob.ts — no DDD violations
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/assembleBriefing.ts — no security issues
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/125-test-e2e-briefing.test.ts — test code only, non-blocking failure

**test_results:**
- bun test: 6119 pass / 1 fail / 21 skip across 500 files (45s runtime)
- bun tsc --noEmit: 0 TypeScript errors
- curl /health: 200 OK (server healthy, 103 tools, 150 sessions)

**smoke_test_summary:**
- Server Health: PASS
- Database Schema: PASS (73 tables initialized)
- Type Safety: PASS
- Unit Tests: FAIL (1 test, timing-dependent, non-blocking)
- Price Pipeline: FAIL (25-day stale data, VPS investigation needed)
- Briefing Assembly: SUPPRESSED (cannot generate meaningful briefing without fresh prices)
- Evening Summary Job: FAIL (not running)

**merge_commit:** (pending blocking issue resolution)
