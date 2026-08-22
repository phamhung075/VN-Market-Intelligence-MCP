---
sprint: SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP
branch: task/pec-fr4-recency-bound
size: M
zone: apps/mcp-server/
depends_on: []
blocks: [TASK-PEC-FR1]
---

## TLDR

Add evidence score recency bound to prevent stale cache rows (older than 30 days) from being served as current predictions. Implements honest-degrade messaging when a score is stale, fixing D4 from the po's investigation (VPB served a 13-day-old score with no backing fragments as if it were current).

## [PM] Planning Context

**Zone:** apps/mcp-server/

**Acceptance Criteria:**
- [ ] `evidenceFragmentStore.ts` exports `MAX_SCORE_AGE_DAYS = 30` constant (same 30-day window used by `runEvidenceAccumulator`)
- [ ] `evidenceFragmentStore.ts` exports `isScoreStale(scoreDate: string, maxAgeDays?, now?): boolean` helper function that checks if a score exceeds the age bound
- [ ] `get_evidence_summary` in `evidenceTools.ts` calls `isScoreStale()` immediately after fetching a score row; if true, returns an honest-degrade message EARLY (before fragment SELECT or probability computation), textually distinct from "(no fragments found)" and "No evidence accumulated yet"
- [ ] Degrade message format: `"No fresh evidence for {ticker} — last score computed {score_date} ({ageDays}d ago), exceeds the {MAX_SCORE_AGE_DAYS}d freshness bound. Treat as unreliable."`
- [ ] `evidenceTools.ts` docstring for `get_evidence_summary` is updated from "Data is at most 23 hours stale" to describe the new honest-degrade behavior and the 30-day bound
- [ ] Unit test `isScoreStale`: boundary cases (exactly MAX_SCORE_AGE_DAYS, one day under, one day over)
- [ ] Integration test `get_evidence_summary`: score older than bound returns degrade message; stock with fresh score and fragments proceeds normally; distinguish the 3 different empty states (stale score, no fragments found, no accumulated score)

**Files to read first:**
- `docs/handoffs/SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP-BA-spec.md` [Architect] Brownfield Findings §FR-4 and §Edge Cases (stale cache, three distinguishable messages)
- `apps/mcp-server/src/infrastructure/db/evidenceFragmentStore.ts:269-291` (getLatestEvidenceScore, current unbounded read)
- `apps/mcp-server/src/interface/mcp/tools/macro/evidenceTools.ts:174-182` (tool docstring), :214-222 (fragment SELECT), :249-290 (horizon-selection logic)

**Files to create:** None (helpers added to existing files)

**Files to modify:**
- `apps/mcp-server/src/infrastructure/db/evidenceFragmentStore.ts` (add constant + helper, no changes to getLatestEvidenceScore signature)
- `apps/mcp-server/src/interface/mcp/tools/macro/evidenceTools.ts` (integrate isScoreStale check, update docstring)

**Dependencies:** None (independent, can run in parallel with FR-1)

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- Understanding of date arithmetic (30 days = 30 * 24 * 60 * 60 * 1000 milliseconds)
- ISO8601 date parsing

---

## Technical Details

### Part A: Add Recency Helper to evidenceFragmentStore.ts

Add the constant and helper function:
```typescript
export const MAX_SCORE_AGE_DAYS = 30;  // same window as runEvidenceAccumulator

export function isScoreStale(
  scoreDate: string,
  maxAgeDays = MAX_SCORE_AGE_DAYS,
  now = new Date()
): boolean {
  const ageMs = now.getTime() - new Date(scoreDate + "T00:00:00Z").getTime();
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}
```

Note: `scoreDate` is expected as YYYY-MM-DD string from the database; we append "T00:00:00Z" to treat it as start-of-day UTC for consistent comparison.

### Part B: Integrate Honest-Degrade into get_evidence_summary (evidenceTools.ts)

After fetching the latest score row (the existing `getLatestEvidenceScore` call), check staleness BEFORE proceeding:

```typescript
const scoreRow = evidenceFragmentStore.getLatestEvidenceScore(db, ticker);
if (scoreRow && isScoreStale(scoreRow.score_date)) {
  const ageDays = Math.floor((Date.now() - new Date(scoreRow.score_date + "T00:00:00Z").getTime()) / (24 * 60 * 60 * 1000));
  return {
    ticker,
    message: `No fresh evidence for ${ticker} — last score computed ${scoreRow.score_date} (${ageDays}d ago), exceeds the ${MAX_SCORE_AGE_DAYS}d freshness bound. Treat as unreliable.`,
    bullish_score: null,
    bearish_score: null,
    neutral_score: null,
    fragments: [],
    reason: "score_stale"
  };
}
```

This degrade message must be returned EARLY, before any fragment SELECT or probability computation.

### Part C: Update Tool Docstring

Change from:
```
"Data is at most 23 hours stale"
```

To something like:
```
"Returns evidence summary for a ticker, including latest computed scores and supporting fragments. Evidence scores older than 30 days are treated as stale and degrade to an honest 'unreliable' message. Fragment data reflects the most recent evidence fragments within the active window."
```

---

## Three Distinguishable Empty States

Make sure the code keeps these SEPARATE (don't collapse them):
1. **Score is stale (D4):** `"No fresh evidence for {ticker} — last score computed {date} ({ageDays}d ago)..."`
2. **No fragments found (live SELECT empty):** `"(no fragments found)"` (existing)
3. **No accumulated score yet:** `"No evidence accumulated yet"` (existing)

---

## Verification

- Unit tests for `isScoreStale`: boundary at exactly 30 days, below, above
- Integration test: call `get_evidence_summary` with:
  - (a) A ticker with a fresh score and fragments → full normal output
  - (b) A ticker with a stale score but matching row → returns degrade message
  - (c) A ticker with no evidence_scores row → "No evidence accumulated yet" (existing path)
  - (d) A ticker with a fresh score but no fragments → "(no fragments found)" (existing path)

All four paths should be tested independently to confirm they don't bleed into each other.

---

## SPIKE Fold Note

This task absorbs the findings from `SPIKE-EVIDENCE-SCORE-CACHE-FRAGMENT-DECOUPLE` (created 2026-07-16, architect-owned, not re-minted per po's instruction). The SPIKE's root-class investigation concluded: root is **(b) cache never recomputed/invalidated**, confirmed by this fix. The recency bound + honest degrade achieves the SPIKE's corrective outcome without requiring a live fragment-count reconciliation check (heavier alternative that would add extra query cost).

