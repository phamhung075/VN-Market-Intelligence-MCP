---
sprint: BCTC-REFINE-STALL-RETRIGGER
branch: task/BCTC-REFINE-A2-staleness-watchdog
size: S
zone: apps/mcp-server/src/scheduler/financial-reports/
type: SPRINT-S
priority: P1
depends_on: []
blocks: [BCTC-REFINE-C1]
---

## TLDR

Implement server-side `bctcRefineStalenessJob` — a cron watchdog that detects when the refine queue has aged beyond 24h without draining, and alerts the WORK channel. This is observability + self-healing trigger, not a replacement cron (the cowork `refine_bctc_md` agent remains the actual drain). The job must also detect when the cowork drain has lapsed (last refine attempt >25h old) and escalate to HIGH.

## [PM] Planning Context

- **Zone:** `apps/mcp-server/src/scheduler/financial-reports/`
- **Type:** SPRINT-S (new feature, leaf code + test)
- **Size:** S (~2h): new job file + domain signal type + jobs.ts wiring + unit tests
- **Priority:** P1 — closes the observability gap that enabled 20 days of silent stall

### Acceptance Criteria

- [ ] **AC-1:** New file `apps/mcp-server/src/scheduler/financial-reports/bctcRefineStalenessJob.ts` implements:
  - Check 1: `COUNT(*) FROM financial_reports WHERE text_status='COMPLETE' AND refine_status IN ('PENDING','PARTIAL') AND parsed_at < (now - 86400)` → refine_pending_count
  - Check 2: Last refine_bctc_md run age from `cron_job_runs` table (requires C1 to be landed; **INTERIM: use freshness gate on refine_bctc_md log if cron_job_runs unavailable**)
  - Cron schedule: every 2h (not 6h — want to catch 24h-old stalls within the day)
  - Alert thresholds (WORK channel, 6h dedup per type):
    - refine_pending_count > 0 for >24h: "BCTC refine queue stalled: N docs PENDING/PARTIAL older than 24h"
    - refine_pending_count > 5: escalate to HIGH priority
    - last_refine_attempt > 25h AND refine_pending_count > 0: "refine_bctc_md agent not seen for Xh — check cowork cron"
- [ ] **AC-2:** Domain signal type added: extend `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts` with `refine_bctc` signal type (BCTC-refine-queue-aged, BCTC-refine-drain-lapsed)
- [ ] **AC-3:** Job registered in `apps/mcp-server/src/scheduler/jobs.ts` with cron schedule `0 */2 * * *` (every 2 hours)
- [ ] **AC-4:** Unit tests (≥3 cases):
  - Test with 0 PENDING docs → no alert
  - Test with 5 PENDING docs aged >24h → WARN alert with count
  - Test with 10 PENDING docs aged >24h → HIGH alert
  - Test with last_refine_attempt >25h + PENDING docs → escalate to HIGH
- [ ] **AC-5:** Live rebuild + WORK channel verification: job fires at next 2h boundary and logs alert (if test data exists in named volume)

### Files to Read First

- `docs/architecture-briefs/2026-06-27-bctc-refine-stall-retrigger.md` § Track (c) — detailed requirements
- `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts` — reference pattern for similar watchdog
- `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts` — signal type structure to extend
- `apps/mcp-server/src/scheduler/jobs.ts` — cron registration pattern

### Files to Modify

- **Create:** `apps/mcp-server/src/scheduler/financial-reports/bctcRefineStalenessJob.ts` (new, ~120L)
- **Modify:** `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts` (add refine_bctc signal types, ~15L)
- **Modify:** `apps/mcp-server/src/scheduler/jobs.ts` (register job, ~5L)
- **Create:** `apps/mcp-server/src/__tests__/bctcRefineStalenessJob.test.ts` (~80L, test with makeDb() helpers)

### Dependencies

- **Blocked by:** BCTC-REFINE-C1 (for cron_job_runs integration; INTERIM: use heuristic on refine_bctc_md flow logs if C1 not landed yet)
- **Blocks:** BCTC-REFINE-C1 (C1 depends on this for signal-type scaffolding)

---

## Implementation Guidance

### Option 1: Use cron_job_runs (load-bearing on C1)
```typescript
// Check 2: Last refine_bctc_md run age
const lastRun = db.prepare(`
  SELECT completed_at FROM cron_job_runs
  WHERE job_name = 'refine_bctc_md'
  ORDER BY completed_at DESC LIMIT 1
`).get() as { completed_at: string } | undefined;

const lastRunAge = lastRun
  ? (Date.now() - new Date(lastRun.completed_at).getTime()) / 1000 / 3600  // hours
  : Infinity;

if (lastRunAge > 25 && refinePendingCount > 0) {
  // Alert: "refine_bctc_md agent not seen for Xh — check cowork cron"
}
```

### Option 2: Interim heuristic (if C1 delays)
```typescript
// Until cron_job_runs is populated, use the most recent refine_bctc_md flow invocation timestamp
// from docs/agent-memory/notebooks/refine_bctc_md.md (parse the latest cycle timestamp)
// Fallback: if no recent notebook entry, assume drain has lapsed
```

### Unit test setup
Use the existing `makeDb()` helper to seed test financial_reports rows with varied parsed_at timestamps.

---

## Risk & Notes

**Risk-1 (MEDIUM — deferred to C1):** Check 2 (cron_job_runs probe) requires C1 to be landed. If C1 slips, implement Check 2 as an interim heuristic or defer Check 2 to a follow-up patch.

**Risk-2 (LOW):** The 2h cron schedule is aggressive but necessary to catch 24h-old stalls within the same calendar day for human intervention.

**Risk-3 (LOW):** Alert dedup via 6h window is coarse (may suppress back-to-back stall resolutions). Revisit if noise becomes a problem.

---

## Success Criteria (Done-Verified Gate)

✅ **DONE-VERIFIED when:**
- AC-1: Job logic passes unit tests (zero PENDING → quiet; N PENDING aged >24h → WARN; aged + >5 docs → HIGH)
- AC-2: freshnessSlaChecker signal types added + compile clean
- AC-3: jobs.ts registration succeeds + bun run rebuild
- AC-4: Live rebuild + manual test: seed old PENDING docs in test DB, trigger job, confirm WORK alert lands with correct count/severity
- AC-5: After rebuild deployed, wait 2h boundary and verify real cron_job_runs shows job completion
