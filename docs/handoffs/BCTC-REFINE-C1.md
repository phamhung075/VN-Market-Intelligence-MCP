---
sprint: BCTC-REFINE-STALL-RETRIGGER
branch: task/BCTC-REFINE-C1-staleness-wiring
size: S
zone: apps/mcp-server/src/scheduler/financial-reports/ + docs/agents/refine_bctc_md/
type: SPRINT-S
priority: P2
depends_on: [BCTC-REFINE-A2]
blocks: []
---

## TLDR

Wire the staleness observability chain: (1) add `SqliteJobRunRepository.wrapRun` call to `refine_bctc_md` agent flow to log cycle completion to `cron_job_runs`, and (2) extend `freshnessSlaChecker` signal types to include `refine_bctc` signal (depends on BCTC-REFINE-A2 scaffolding). This closes Check 2 of the staleness watchdog (detecting when the cowork agent has gone dark).

## [PM] Planning Context

- **Zone:** `apps/mcp-server/src/scheduler/financial-reports/` + `docs/agents/refine_bctc_md/`
- **Type:** SPRINT-S (wiring + logging, small code + test)
- **Size:** S (~2h: wrapRun integration + signal type wiring + unit tests)
- **Priority:** P2 — completes observability chain; enables Check 2 of A2 staleness watchdog

### Acceptance Criteria

- [ ] **AC-1:** Add `SqliteJobRunRepository.wrapRun` call to `docs/agents/refine_bctc_md/flow/main.md`:
  - At cycle START: `wrapRun` with job_name='refine_bctc_md', status='in_progress'
  - At cycle END (after finalize): update status='completed' OR 'failed' + elapsed_time + doc_count processed
  - Fallback: if `SqliteJobRunRepository` unavailable, use direct INSERT to `cron_job_runs` table
- [ ] **AC-2:** Verify `cron_job_runs` table schema includes: `job_name, started_at, completed_at, status, elapsed_seconds, result_summary`
- [ ] **AC-3:** Extend signal types in `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts`:
  - Add `refine_bctc_drain_lapsed` signal type (triggered when last refine_bctc_md run >25h old)
  - Add `refine_queue_stale` signal type (triggered when refine_pending_count >0 for >24h) — this is the A2 watchdog output
- [ ] **AC-4:** Unit tests (≥3 cases):
  - Test refine_bctc_md flow with wrapRun: confirm `cron_job_runs` row created with correct job_name + timestamps
  - Test freshnessSlaChecker with old cron_job_runs row: confirm signal fired
  - Test freshnessSlaChecker with recent cron_job_runs row: confirm no signal
- [ ] **AC-5:** Live rebuild + manual test:
  - Manually set a `refine_bctc_md` row to completed_at >25h ago
  - Run freshnessSlaMonitorJob (or trigger it manually)
  - Confirm WORK alert fires with "refine_bctc_md agent not seen for >25h"

### Files to Read First

- `docs/architecture-briefs/2026-06-27-bctc-refine-stall-retrigger.md` § Track (c) — wiring diagram + signal types
- `docs/agents/refine_bctc_md/flow/main.md` — current refine cycle logic (Step 1: get pending, Step 2: push, Step 3: finalize)
- `apps/mcp-server/src/infrastructure/repositories/SqliteJobRunRepository.ts` — wrapRun pattern (reference `bctcBatchSweepJob.ts` usage)
- `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts` — signal type structure to extend
- BCTC-REFINE-A2 handoff — signal types scaffolded there

### Files to Modify

- **Modify:** `docs/agents/refine_bctc_md/flow/main.md` (add wrapRun integration, ~20L)
- **Modify:** `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts` (extend signal types, ~20L)
- **Create:** `apps/mcp-server/src/__tests__/bctcRefineStalenessWiring.test.ts` (~100L, test wrapRun + signal integration)

### Dependencies

- **Depends on:** BCTC-REFINE-A2 (A2 defines signal types that C1 extends)
- **Blocks:** Nothing (downstream verification happens in A2 after both land)

---

## Implementation Guidance

### Step 1: Integrate wrapRun in refine_bctc_md flow

```typescript
// docs/agents/refine_bctc_md/flow/main.md (pseudo-code, translate to flow format)

// At cycle start (inside refine-bctc-slot handler):
const runId = await SqliteJobRunRepository.wrapRun({
  job_name: 'refine_bctc_md',
  started_at: new Date(),
});

// Main cycle: get pending → push → finalize
const pending = await get_bctc_pending_refine();
const count = pending.length;

try {
  for (const doc of pending) {
    await push_bctc_refined_unit({ reset: true });  // existing logic
  }
  await finalize_bctc_refine();  // existing logic
  
  // At cycle end (after finalize):
  await SqliteJobRunRepository.wrapRun({
    runId,
    status: 'completed',
    result_summary: `Processed ${count} docs`,
    completed_at: new Date(),
  });
} catch (err) {
  await SqliteJobRunRepository.wrapRun({
    runId,
    status: 'failed',
    result_summary: `Error: ${err.message}`,
    completed_at: new Date(),
  });
  throw err;  // re-throw to fail the flow
}
```

### Step 2: Extend freshnessSlaChecker signal types

```typescript
// apps/mcp-server/src/domain/services/freshnessSlaChecker.ts

export interface SignalType {
  // existing types...
  refine_bctc_drain_lapsed?: {
    last_run_age_hours: number;
    severity: 'HIGH' | 'CRITICAL';
  };
  refine_queue_stale?: {
    pending_count: number;
    oldest_doc_age_hours: number;
    severity: 'WARN' | 'HIGH' | 'CRITICAL';
  };
}

export async function checkRefineStaleness(
  db: Database,
): Promise<(SignalType['refine_bctc_drain_lapsed'] | SignalType['refine_queue_stale'])[]> {
  const signals = [];
  
  // Check 1: queue depth (already in A2)
  // Check 2: drain lapse (this task)
  const lastRun = db.prepare(`
    SELECT completed_at FROM cron_job_runs
    WHERE job_name = 'refine_bctc_md'
    ORDER BY completed_at DESC LIMIT 1
  `).get() as { completed_at: string } | undefined;
  
  if (lastRun) {
    const ageHours = (Date.now() - new Date(lastRun.completed_at).getTime()) / 1000 / 3600;
    if (ageHours > 25) {
      signals.push({
        refine_bctc_drain_lapsed: {
          last_run_age_hours: ageHours,
          severity: ageHours > 48 ? 'CRITICAL' : 'HIGH',
        },
      });
    }
  }
  
  return signals;
}
```

---

## Risk & Notes

**Risk-1 (LOW):** `SqliteJobRunRepository` may not exist yet. If absent, implement direct INSERT to `cron_job_runs` table as fallback (5L SQL, no dependency on a missing class).

**Risk-2 (MEDIUM — deferred):** Check 2 (last_refine_attempt age) requires C1 to land. A2 can operate with just Check 1 (queue depth) in interim. Once C1 lands, A2 auto-gains Check 2 capability.

**Risk-3 (LOW):** The 25h threshold for "agent not seen" is arbitrary. Tune post-landing if false positives occur (real cowork agents just slow to respond).

---

## Success Criteria (Done-Verified Gate)

✅ **DONE-VERIFIED when:**
- AC-1: wrapRun integration merged into refine_bctc_md flow (verified by code review + rebuild clean)
- AC-2: cron_job_runs schema confirmed (via PRAGMA table_info)
- AC-3: Signal types extended in freshnessSlaChecker + compile clean
- AC-4: Unit tests pass (wrapRun creates row + signal fired on old timestamp)
- AC-5: Live rebuild + manual test: set old completed_at, trigger monitor, confirm WORK alert fires
