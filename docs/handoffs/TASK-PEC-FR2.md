---
sprint: SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP
branch: task/pec-fr2-calibration-feedback
size: M
zone: apps/mcp-server/
depends_on: [TASK-PEC-PREP-FIXTURES]
blocks: []
---

## TLDR

Implement the weekly calibration-to-prediction feedback loop (D2 fix). Create a new `calibration_correction_factors` store that captures per-confidence-bucket correction factors derived from weekly calibration reports, then wire `get_evidence_summary` to apply these factors when computing published probabilities. This closes the loop: calibration_snapshots (weekly measurement) → correction_factors (write-back) → prediction-publishing (read on next cycle).

## [PM] Planning Context

**Zone:** apps/mcp-server/

**Acceptance Criteria:**
- [ ] New file `apps/mcp-server/src/infrastructure/db/calibrationCorrectionStore.ts` created, mirroring `likelihoodRatioStore.ts` 1:1 (upsert/get/getAll methods, same neutral-prior + clamp guards)
- [ ] New table `calibration_correction_factors` added to `schema-system.ts` with exact schema: `(id PK, confidence_bucket REAL NOT NULL UNIQUE, correction_factor REAL DEFAULT 1.0, sample_size INTEGER DEFAULT 0, source_snapshot_id INTEGER NOT NULL, last_updated TEXT NOT NULL)`
- [ ] `calibrationCorrectionStore.getCorrection Factor(db, bucketMidpoint)` returns `correction_factor` (defaults `1.0` if no row; cold start, zero regression) with same neutral-prior guard + `clampLikelihoodRatio(0.1, 5.0)` bounds as LR store
- [ ] New function `computeCorrectionFactor(actualHitRate, bucketMidpoint, sampleSize, minSample=10): number` in `baseRateComputer.ts`: `sampleSize < minSample → 1.0`; else `clampLikelihoodRatio(actualHitRate / bucketMidpoint)`
- [ ] `calibrationReportJob.ts` new Step 6.5 (between existing Step 6 `computeCalibrationCurve` and Step 7 `trend_delta`): for each bucket in the curve, upsert `{confidence_bucket: bucket.bucket_midpoint, correction_factor: computeCorrectionFactor(...), sample_size: bucket.sample_size, source_snapshot_id: snapshotId}`
- [ ] `CalibrationJobResult` return contract unchanged (no breaking change); Step 6.5 write is a side-effect only
- [ ] `get_evidence_summary` (from FR-3) now calls `calibrationCorrectionStore.getCorrection Factor(db, bucketMidpoint)` to populate correction factors before final clamp
- [ ] `1128-calibration-report-job.test.ts` test fixture includes the `calibration_correction_factors` table DDL (ensured by TASK-PEC-PREP-FIXTURES)
- [ ] Integration test: `calibrationReportJob` processes a week's predictions and upserts correction factors for each non-empty bucket, with `source_snapshot_id` matching the snapshot just inserted
- [ ] All existing test suites (1121/1127/1128/1129/1173/1392 + 1116/1117/1124/1194) stay green

**Files to read first:**
- `docs/handoffs/SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP-BA-spec.md` [Architect] Brownfield Findings §FR-2, §Design decisions (new store, Step 6.5, schema choice, direction-agnostic keying rationale), §Regression-risk finding (second bullet, 1128 fixture)
- `apps/mcp-server/src/infrastructure/db/likelihoodRatioStore.ts` (template pattern for new store)
- `apps/mcp-server/src/infrastructure/db/calibrationSnapshotStore.ts` (existing store precedent)
- `apps/mcp-server/src/scheduler/macro/calibrationReportJob.ts:195-233` (compute curve), :494-524 (steps 6-9, where Step 6.5 lands)
- `apps/mcp-server/src/infrastructure/db/schema-system.ts:1-20` (header inventory comment), :170-183 (evidence_likelihood_ratios DDL pattern)
- `apps/mcp-server/src/domain/services/baseRateComputer.ts` (existing precedent for domain-pure functions)

**Files to create:**
- `apps/mcp-server/src/infrastructure/db/calibrationCorrectionStore.ts` (new store, ~80-100L, upsert/get/getAll + neutral-prior guard)

**Files to modify:**
- `apps/mcp-server/src/infrastructure/db/schema-system.ts` (add `calibration_correction_factors` table DDL + header inventory comment)
- `apps/mcp-server/src/domain/services/baseRateComputer.ts` (add `computeCorrectionFactor` function)
- `apps/mcp-server/src/scheduler/macro/calibrationReportJob.ts` (add Step 6.5, import correctionStore + baseRateComputer)
- `apps/mcp-server/src/interface/mcp/tools/macro/evidenceTools.ts` (wire correction-factor read in get_evidence_summary, if not already done by FR-3)

**Dependencies:** TASK-PEC-PREP-FIXTURES (1128 fixture must have calibration_correction_factors table before tests run)

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- Existing store patterns (likelihoodRatioStore, calibrationSnapshotStore)
- Clamping / neutral-prior pattern (`clampLikelihoodRatio`)

---

## Technical Details

### Part A: Create calibrationCorrectionStore.ts

New file mirroring likelihoodRatioStore.ts:

```typescript
import { Database } from "bun:sqlite";

export interface CorrectionFactorRow {
  id: number;
  confidence_bucket: number;
  correction_factor: number;
  sample_size: number;
  source_snapshot_id: number;
  last_updated: string;
}

const MIN_SAMPLE = 10;

export function getCorrectionFactor(
  db: Database,
  confidenceBucket: number
): number {
  try {
    const row = db
      .prepare("SELECT correction_factor FROM calibration_correction_factors WHERE confidence_bucket = ?")
      .get(confidenceBucket) as { correction_factor: number } | undefined;
    return row ? clampLikelihoodRatio(row.correction_factor) : 1.0;  // neutral default
  } catch {
    // never throw even if table is missing in some edge case
    return 1.0;
  }
}

export function upsertCorrectionFactor(
  db: Database,
  data: {
    confidence_bucket: number;
    correction_factor: number;
    sample_size: number;
    source_snapshot_id: number;
  }
): void {
  const now = new Date().toISOString();
  try {
    db.prepare(`
      INSERT OR REPLACE INTO calibration_correction_factors
      (confidence_bucket, correction_factor, sample_size, source_snapshot_id, last_updated)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.confidence_bucket,
      data.correction_factor,
      data.sample_size,
      data.source_snapshot_id,
      now
    );
  } catch (err) {
    logger.error(`Failed to upsert correction factor for bucket ${data.confidence_bucket}:`, err);
    throw;  // write failures must surface, not silently swallow
  }
}

export function getAllCorrectionFactors(
  db: Database
): CorrectionFactorRow[] {
  try {
    return db
      .prepare("SELECT * FROM calibration_correction_factors ORDER BY confidence_bucket")
      .all() as CorrectionFactorRow[];
  } catch {
    return [];
  }
}
```

Import `clampLikelihoodRatio` and `logger` from existing locations.

### Part B: Add Table DDL to schema-system.ts

Add to the header inventory comment (around line 1-20) and in the actual schema definitions:

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

**Key design decisions (documented in comments):**
- `confidence_bucket` is REAL (0.05 to 0.95, matching the 10 bucket midpoints: 0.05, 0.15, ..., 0.95)
- UNIQUE constraint on confidence_bucket ensures one correction factor per bucket
- `sample_size` is stored for transparency (same `sample_size` as the calibration_curve bucket that produced this row)
- `source_snapshot_id` provides traceability back to the calibration_snapshots row that generated this correction
- `correction_factor` defaults to 1.0 (neutral, no correction); all factors are clamped to `[0.1, 5.0]`

### Part C: Add computeCorrectionFactor to baseRateComputer.ts

```typescript
export function computeCorrectionFactor(
  actualHitRate: number,
  bucketMidpoint: number,
  sampleSize: number,
  minSample = 10,
): number {
  if (sampleSize < minSample) {
    return 1.0;  // neutral (cold start, insufficient data)
  }
  const rawFactor = actualHitRate / bucketMidpoint;
  return clampLikelihoodRatio(rawFactor);  // reuse existing [0.1, 5.0] clamp
}
```

**Semantics:**
- `actualHitRate / bucketMidpoint` directly captures whether a bucket over/under-performs its stated confidence
- If actual hit rate = predicted midpoint, factor = 1.0 (well-calibrated)
- If actual < predicted, factor < 1.0 (over-confident, dial down)
- If actual > predicted, factor > 1.0 (under-confident, dial up)
- Clamp to `[0.1, 5.0]` prevents runaway corrections on small samples

### Part D: Wire Step 6.5 into calibrationReportJob.ts

In the main job function, after Step 6 `computeCalibrationCurve` (which produces the `calibration_curve` array):

```typescript
// Step 6.5: Write correction factors from calibration curve
const snapshotId = /* the snapshot.id from Step 9 */;  // capture the ID as it's created
for (const bucket of calibrationCurve) {
  const correctionFactor = computeCorrectionFactor(
    bucket.actual_hit_rate,
    bucket.bucket_midpoint,
    bucket.sample_size
  );
  upsertCorrectionFactor(db, {
    confidence_bucket: bucket.bucket_midpoint,
    correction_factor: correctionFactor,
    sample_size: bucket.sample_size,
    source_snapshot_id: snapshotId
  });
}
```

**Placement:** Between Step 6 (`computeCalibrationCurve`) and Step 7 (`trend_delta`), same weekly cron run.

**Import statements:**
```typescript
import { upsertCorrectionFactor } from '../infrastructure/db/calibrationCorrectionStore';
import { computeCorrectionFactor } from '../../domain/services/baseRateComputer';
```

### Part E: Wire Correction Read into get_evidence_summary (FR-3 integration)

In `evidenceTools.ts` `get_evidence_summary` (after shrinkage is computed), before final clamp:

```typescript
const bucketMidpointBullish = confidenceBucketMidpoint(shrunkBullishScore);
const correctionFactorBullish = calibrationCorrectionStore.getCorrection Factor(db, bucketMidpointBullish);
const publishedProbabilityBullish = Math.max(0.05, Math.min(0.95, shrunkBullishScore * correctionFactorBullish));

// ... repeat for bearish, neutral
```

(This logic is already sketched in TASK-PEC-FR3-FR5; just making explicit that the store call happens here.)

---

## Verification Checklist

- [ ] New store file created with upsert/get/getAll methods
- [ ] Schema table added to schema-system.ts with UNIQUE constraint on confidence_bucket
- [ ] `computeCorrectionFactor` is exported from baseRateComputer.ts and reuses `clampLikelihoodRatio` verbatim
- [ ] Step 6.5 lands between Steps 6 and 7 in calibrationReportJob.ts
- [ ] `CalibrationJobResult` return type unchanged (Step 6.5 is side-effect only)
- [ ] Integration test: job runs, upserts correction factors for each bucket, rows persist in table
- [ ] `source_snapshot_id` in inserted rows matches the snapshot just created (traceability)
- [ ] All existing test suites green (1128 fixture now has calibration_correction_factors table, so writes don't throw)
- [ ] Cold-start scenario: new system with zero correction_factors rows → all calls return 1.0 (no regression)

---

## Notes on n=17 Constraint

With only n=17 resolved predictions in the 90d window, every bucket ships `correction_factor = 1.0` today (neutral). This is correct: we are NOT refit-ting the curve on this sample, we are WIRING the mechanism so it opens for future accumulation. Per po's Entry 7 directive, this is a structural fix, not a statistical re-tuning.

---

## Direction-Agnostic Keying Rationale

The correction-factor store is keyed by `confidence_bucket` only, not `(bucket, direction)`. This follows po's guidance that direction-specific correction is explicitly OUT of scope (n=17 per direction ≈ n=3 per extreme bucket is too thin to refit by direction). The single correction per bucket reuses the EXISTING per-bucket calibration curve computation verbatim, adding no new statistical surface.

