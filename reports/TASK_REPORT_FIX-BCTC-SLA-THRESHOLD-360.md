## Task Report FIX-BCTC-SLA-THRESHOLD-360

changed:
  - apps/mcp-server/src/domain/services/freshnessSlaChecker.ts (new exports: isBctcEarningsWindowActive, lastExpectedEarningsWindowEnd, minutesSinceLastEarningsWindowEnd; constants BCTC_EARNINGS_WINDOW_TRIGGER_MONTHS, BCTC_EARNINGS_WINDOW_DAYS; getSlaThreshold("bctc") earnings-window-aware off-hours path)
  - apps/mcp-server/src/__tests__/FIX-BCTC-SLA-THRESHOLD-360.test.ts (new, 18 DoD tests — 18/0)
  - apps/mcp-server/src/__tests__/FIX-BCTC-SLA-WEEKEND.test.ts (updated, 17 tests — 17/0)
  - apps/mcp-server/src/__tests__/234-vps-health-sla.test.ts (updated, 10 tests — 10/0)
  - docs/agents/system-auditor/flow/main.md (SLA resolver out-of-window rule + BCTC Healthy-Idle Gate)

tests: 13378 pass / 103 fail (pre-existing, disjoint) | 45/45 targeted | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: EXIT 0
verdict: APPROVED-CODE-LEVEL (REBUILD_REQUIRED)

### Pre-existing 103 failures — disjoint proof

Failing categories: 1309-bb-alert-scan-job (last-touch b3ea96fa Jun 19) + 1133-foreign-flow-alert-job (last-touch b3ea96fa Jun 19). Zero import of freshnessSlaChecker in those files. Baseline-identical: swapped pre-fix freshnessSlaChecker.ts from parent commit 87485c1c → same failures (11p/25f for those 2 files both before and after fix). Fix contributes zero new failures.

### Live get_sla_status note

Container (built Jun 24 15:34 CEST) predates fix commit (Jun 25 05:18 CEST). Live get_sla_status shows bctc=CRITICAL with threshold=120 because (a) pre-fix code in container, (b) probe ran during VN market hours (04:26 UTC = inside 02:00-08:59 UTC window where 120-min tight SLA correctly applies even post-fix). REBUILD_REQUIRED: ops to rebuild mcp-server. Post-rebuild, off-hours get_sla_status will return bctc threshold=102871 min, push-age 11985 min → PASS.
