---
sprint: SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP
branch: task/pec-prep-fixtures
size: S
zone: apps/mcp-server/
depends_on: []
blocks: [TASK-PEC-PREP-GETLR, TASK-PEC-FR1]
---

## TLDR

Update two test fixture files to include DDL for tables (`evidence_likelihood_ratios`, `calibration_correction_factors`) that will be written by new code paths in FR-1 and FR-2. Without these fixtures, the respective test suites will throw hard SQL errors when new code runs.

## [PM] Planning Context

**Zone:** apps/mcp-server/

**Acceptance Criteria:**
- [ ] `apps/mcp-server/src/__tests__/1118-evidence-accumulator-job.test.ts`'s `createEvidenceSchema()` helper now creates the `evidence_likelihood_ratios` table (copy DDL from `apps/mcp-server/src/infrastructure/db/schema-system.ts:170-183`)
- [ ] `apps/mcp-server/src/__tests__/1128-calibration-report-job.test.ts`'s local schema fixture block (lines 49-101) now includes `calibration_correction_factors` table DDL (copy from FR-2's schema definition, once available; or use the spec in architect handoff §FR-2 section, table shape)
- [ ] Both test files run their existing tests without SQL errors; no logic changes, fixture-only
- [ ] Existing exact-value assertions in 1118 remain unchanged (the neutral-prior guard means missing LR rows default to 1.0, so existing tests pass identically under the new fixture)

**Files to read first:**
- `docs/handoffs/SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP-BA-spec.md` [Architect] Brownfield Findings §FR-1/FR-2/NFR-2 (regression risks section)

**Files to create:** None

**Files to modify:**
- `apps/mcp-server/src/__tests__/1118-evidence-accumulator-job.test.ts:21-49` (createEvidenceSchema function)
- `apps/mcp-server/src/__tests__/1128-calibration-report-job.test.ts:49-101` (local schema fixture)

**Dependencies:** None

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- Understanding of SQLite CREATE TABLE syntax
- Reference: both target files' existing schema patterns

---

## Technical Details

### Task 1: Update 1118-evidence-accumulator-job.test.ts

The `createEvidenceSchema()` function currently creates only `evidence_fragments` and `evidence_scores` tables. The new FR-1 code will call `getLikelihoodRatios(db, evidence_type, direction)` which performs a SELECT on `evidence_likelihood_ratios` table.

**What to add:**
Copy the `evidence_likelihood_ratios` table DDL from `apps/mcp-server/src/infrastructure/db/schema-system.ts` (lines 170-183) into the fixture's `createEvidenceSchema()` function.

**Verify:**
Run `npm test -- 1118-evidence-accumulator-job.test.ts` and confirm all tests pass with no SQL errors.

### Task 2: Update 1128-calibration-report-job.test.ts

The `1128-calibration-report-job.test.ts` file defines its own local schema in the fixture block (not importing `schema-system.ts`). The new FR-2 code will upsert into `calibration_correction_factors` table, which currently doesn't exist in this fixture.

**What to add:**
Add the `calibration_correction_factors` table DDL to the fixture. The table schema is:
```sql
CREATE TABLE IF NOT EXISTS calibration_correction_factors (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  confidence_bucket  REAL NOT NULL,
  correction_factor  REAL NOT NULL DEFAULT 1.0,
  sample_size        INTEGER NOT NULL DEFAULT 0,
  source_snapshot_id INTEGER NOT NULL,
  last_updated       TEXT NOT NULL,
  UNIQUE(confidence_bucket)
)
```

**Verify:**
Run `npm test -- 1128-calibration-report-job.test.ts` and confirm all tests pass with no SQL errors.

---

## Notes

- These are fixture-only changes; no production code is modified.
- Both fixture updates are prerequisites for their respective code tasks (FR-1 and FR-2) to run unit tests without throwing.
- The `evidence_likelihood_ratios` table structure is already live in production schema; we're just copying it into the test fixture.
- The `calibration_correction_factors` table is new in FR-2; its exact schema is specified in the architect's design handoff.

