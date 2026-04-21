# Task Context — 239c: Integration — schema + cron registry update + job wiring

## TLDR (read this first)

change: `src/infrastructure/db/schema-macro.ts` (MODIFY: add last_refresh_job column) + `docs/data/cron-registry.json` (MODIFY: add job entry) + `src/scheduler/index.ts` (MODIFY: register job)
test: schema migration succeeds, registry JSON valid, job registered in cron list
branch: task/239c-macro-refresh-integration

depends: 239b ✓ (macroIndicatorFetcher + job implementation complete)
knowledge_needed: [bundle-developer]

---

sprint: 239
branch: task/239c-macro-refresh-integration
status: todo (wait for 239b merge)
req_ref: (BA pending)
tech_ref: TECH-239

---

## [PM] Planning Context

layer: infrastructure + scheduler wiring
depends_on: 239b ✓ (both files implemented)

files_to_read:
- docs/TECH_239.md (lines 9–24, 120–126) → schema + registry changes
- src/infrastructure/db/schema-macro.ts → existing macro_indicators table
- docs/data/cron-registry.json → registry structure (existing entries as reference)
- src/scheduler/index.ts → scheduler registration pattern

files_to_create:
- (none — all are modifications)

files_to_modify:
- src/infrastructure/db/schema-macro.ts (MODIFY: add last_refresh_job TEXT column)
- docs/data/cron-registry.json (MODIFY: append macroIndicatorRefreshJob entry)
- src/scheduler/index.ts (MODIFY: register macroIndicatorRefreshJob + validateMacroFreshnessOnStartup)

test_file: (integration tests in 239a already validate schema changes)

acceptance_criteria:

**Given** 239b implementation complete (fetchAndStoreMacroIndicators + macroIndicatorRefreshJob ready)
**When** integration tasks are completed

**AC-1:** ALTER TABLE macro_indicators ADD COLUMN last_refresh_job TEXT — migration succeeds
**AC-2:** last_refresh_job column defaults to NULL for existing rows (no data loss)
**AC-3:** docs/data/cron-registry.json has valid JSON + new entry: schedule="0 6 * * * (06:00 VN daily)", description="Macro indicator daily refresh with SLA validation"
**AC-4:** cron-registry.json: schedulerFileCount incremented to 38 (was 37 in TECH-239 context, may vary)
**AC-5:** src/scheduler/index.ts registers macroIndicatorRefreshJob with cron expression "0 6 * * *"
**AC-6:** src/scheduler/index.ts calls validateMacroFreshnessOnStartup() on startup (before first 06:00 run)
**AC-7:** Existing job tests still pass (no breaking changes to scheduler API)
**AC-8:** bun tsc --noEmit shows 0 errors (schema import + registry types valid)

---

## Implementation Details

### 1. Schema Migration: src/infrastructure/db/schema-macro.ts

**Change:** Add new column to track last refresh job attempt.

**SQL:**
```sql
ALTER TABLE macro_indicators ADD COLUMN last_refresh_job TEXT;
```

**Implementation pattern** (if using Bun sqlite + migration system):
- Append migration block to schema-macro.ts migration array
- Migration check: if column exists, skip (idempotent)
- Example: `if (!columnsInTable.includes("last_refresh_job")) { db.exec("ALTER TABLE macro_indicators ADD COLUMN last_refresh_job TEXT"); }`
- No rollback needed (additive, no data loss)
- Existing rows default to NULL (expected)

**Verification:**
- `SELECT sql FROM sqlite_master WHERE type='table' AND name='macro_indicators'` shows new column

### 2. Cron Registry Update: docs/data/cron-registry.json

**Current structure** (reference):
```json
{
  "_maintained_by": "PM / scheduler",
  "jobs": [
    {
      "id": "morningBriefingJob",
      "schedule": "0 8 * * * (08:00 VN daily)",
      "filePath": "src/scheduler/briefing/morningBriefingJob.ts",
      "description": "Generate + send morning briefing at market open"
    },
    ...
  ],
  "schedulerFileCount": 37,
  "lastUpdated": "2026-04-21"
}
```

**New entry to append:**
```json
{
  "id": "macroIndicatorRefreshJob",
  "schedule": "0 6 * * * (06:00 VN daily)",
  "filePath": "src/scheduler/macro/macroIndicatorRefreshJob.ts",
  "description": "Macro indicator daily refresh with SLA validation (yahoo → sbv → gso fallback)"
}
```

**Updates:**
- Append new job object to `jobs` array
- Increment `schedulerFileCount` from current value to +1 (e.g., 37 → 38)
- Update `lastUpdated` to "2026-04-21"

### 3. Scheduler Registration: src/scheduler/index.ts

**Pattern:**
Register the new job in the scheduler's main index file (wherever other jobs are registered).

**Pseudo-code:**
```typescript
import { macroIndicatorRefreshJob, validateMacroFreshnessOnStartup } from "./macro/index.js";

// On scheduler startup:
await validateMacroFreshnessOnStartup();

// Register cron job:
scheduleCron("0 6 * * *", async () => {
  try {
    await macroIndicatorRefreshJob();
  } catch (error) {
    console.error("macroIndicatorRefreshJob failed:", error);
    // Alert to WORK channel already sent by job
  }
});
```

**Key requirements:**
- Import path uses `.js` extension (ES modules)
- validateMacroFreshnessOnStartup() runs ONCE at server startup (not repeated every 6 hours)
- macroIndicatorRefreshJob() runs daily at 06:00 GMT+7 (cron "0 6 * * *")
- Error handling: job catches exceptions internally; scheduler logs failures but doesn't crash
- No duplicate registration (check existing entries first)

---

## Database Schema Contract

After migration, macro_indicators table should have:
- id (primary key)
- country (text, unique)
- cpi (real)
- gdp (real)
- interest_rate (real)
- unemployment (real)
- inflation (real)
- trade_balance (real)
- current_account (real)
- govt_debt (real)
- budget_deficit (real)
- manufacturing_pmi (real)
- consumer_confidence (real)
- retail_sales (real)
- created_at (timestamp)
- updated_at (timestamp)
- **last_refresh_job (text)** ← NEW COLUMN

---

## Testing Strategy

- Schema migration: verify ALTER TABLE succeeds + column exists
- Registry JSON: parse + validate JSON structure (no syntax errors)
- Scheduler registration: verify job is in cron list + runs at correct time (mocked cron in test)
- Existing scheduler tests: ensure no breakage (integration tests in scheduler suite)
- Type check: `bun tsc --noEmit` must pass

---

## Acceptance Criteria (for merge)

- Schema: `src/infrastructure/db/schema-macro.ts` includes last_refresh_job column migration
- Registry: `docs/data/cron-registry.json` has new macroIndicatorRefreshJob entry, schedulerFileCount incremented
- Scheduler: `src/scheduler/index.ts` registers job + calls validateMacroFreshnessOnStartup() on startup
- Migration: ALTER TABLE succeeds (no SQL syntax errors, idempotent)
- Tests: all existing scheduler tests still pass
- Type check: `bun tsc --noEmit` shows 0 errors
- Branch: `task/239c-macro-refresh-integration`
- Ready for 239d (QA smoke tests)

