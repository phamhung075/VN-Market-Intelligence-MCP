<!-- decision-journal -->
# Decision Journal — FIX-BCTC-SLA-THRESHOLD-360 QA Gate

**task-id:** FIX-BCTC-SLA-THRESHOLD-360
**by:** qa
**ts:** 2026-06-25T04:30:00Z
**verdict:** APPROVED-CODE-LEVEL (REBUILD_REQUIRED)

## What was considered

**DoD-1 — Full suite green, 103 failures pre-existing:**
- Full suite run: 13378 pass / 42 skip / 103 fail (Ran 13523 tests across 1126 files).
- Dev claimed 111 fail; actual count = 103 (lower, consistent — diff is prior fixes since dev's run).
- Pre-existing proof: 4 changed files are `freshnessSlaChecker.ts`, `FIX-BCTC-SLA-THRESHOLD-360.test.ts`, `FIX-BCTC-SLA-WEEKEND.test.ts`, `234-vps-health-sla.test.ts`. All 4 last-touch = `44c1402d` (Jun 25 05:18 CEST).
- Failing categories: `1309-bb-alert-scan-job` (last-touch `b3ea96fa` Jun 19) + `1133-foreign-flow-alert-job` (last-touch `b3ea96fa` Jun 19). Confirmed disjoint — zero import of `freshnessSlaChecker` in those files.
- Baseline-identical proof: swapped pre-fix version of `freshnessSlaChecker.ts` (from `87485c1c` parent), ran the 2 failing files → 11p/25f. Post-fix → 11p/25f. Identical. Fix has zero impact on those failures.

**DoD-2 — tsc clean:** `bun tsc --noEmit` → EXIT 0. Confirmed.

**DoD-3 — Behavioral proof (off-season PASS):**
- Container predates fix: built Jun 24 15:34 CEST, fix commit Jun 25 05:18 CEST. Container NOT rebuilt yet (expected — rebuild is ops post-approval).
- Live `get_sla_status` via HTTP MCP returns bctc=CRITICAL with threshold=120 — this is the PRE-FIX container confirming the bug is reproducible.
- Current wall-clock 04:26 UTC = inside VN market hours (02:00-08:59 UTC), so even post-fix the market-hours threshold (120 min) correctly applies during session.
- Direct behavioral proof using fixed source code at `2026-06-25T10:00:00Z` (off-hours fixture same as T-1/T-2/T-10):
  - `isBctcEarningsWindowActive` = false (month=6 not in [1,4,7,10])
  - `minutesSinceLastEarningsWindowEnd` = 102841 min (~71.4 days since Apr 14 23:59 UTC)
  - `getSlaThreshold("bctc")` = 102871 min (dynamic, not 360 fixed)
  - push-age 11985 min << 102871 → PASS (no breach)

**DoD-4 — True-positive preserved:**
- T-10b: staleAge = 102872 (1 min over threshold) → breach FIRES. Verified by unit test (18 tests all pass) and direct code execution.
- Fence real: T-1 push-age 11982 vs pre-fix threshold 360 → 11982 > 360 → T-1 FAILS on pre-fix code. Confirms the fence is non-vacuous.

**DoD-5 — Fence integrity:**
- T-1 assertion: `bctcBreach === undefined` (no breach). Pre-fix: 11982 > 360 → breaches → assertion FAILS. Fence is real.
- T-10b assertion: `bctcBreach !== undefined` (breach defined). Post-fix: staleAge=102872 > threshold=102871 → breach fires → assertion PASSES.

**Auditor flow coherence:**
- BCTC Healthy-Idle Gate (B-05): queue=0 + host-up = HEALTHY IDLE (do not emit signal). Logic correct.
- SLA Resolver out-of-window: `hours_since_last_earnings_window_end + 0.5h grace` — matches `freshnessSlaChecker.ts` minutesSinceLastEarningsWindowEnd + 30 min.

**DDD:** no infra imports in `freshnessSlaChecker.ts` (grep exit 1 = zero matches).
**Security:** no `process.env`, parameterized SQL irrelevant (pure domain service), mock-guard EXIT 0.

## Why this verdict

APPROVED-CODE-LEVEL: all code checks green (tsc, DDD, security, mock-guard, 45/45 targeted tests, full suite pre-existing failures confirmed disjoint). REBUILD_REQUIRED: live `get_sla_status` shows pre-fix container behavior (CRITICAL with threshold=120). Behavioral proof done at code level (direct bun invocation of fixed source) rather than container-level. Pattern matches cycles 309/311/312 — deferred live gate: next ops rebuild will flip bctc SLA to PASS off-hours.

## Why not CHANGES_REQUESTED

Zero test regression from the fix. 103 failures = pre-existing, identical before and after fix. tsc clean. DDD/security clean. The live container pre-dates the fix — this is not a code defect.
