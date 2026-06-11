<!-- DEV-REAUDIT-1 — reputation trend fix — generated 2026-06-11 by PM -->

## Task: DEV-REAUDIT-1 — Fix reputation trend-delta compute defect

**Task ID:** REAUDIT-001  
**Title:** Fix reputation trend-delta compute defect  
**Sprint:** SHIP-WAVE-REAUDIT  
**Zone:** apps/mcp-server/  
**Owner:** dev-mcp-server  
**Priority:** CRITICAL  
**Depends on:** none  
**Est. effort:** 2 hours (implementation + test)  
**Architecture:** docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md § 1. Reputation Trend Defect

---

## Problem Statement

**Item A-16:** `reputation_scores` live DB probe (2026-06-11) shows all 235 rows have `trend="stable"`. VCB test series shows genuine score deltas (62.5 → 45 → 64 → 58 → 66), but trend never changes from "stable".

**Root cause:** `reputationComputeJob.ts` attempts exact-date match for -7d prior record. Since actual probe dates are irregular (2026-05-18, 05-22, 05-31, 06-03, 06-06, 06-09), no row exists at exactly -7 calendar days. Query returns null. `if (priorScore !== undefined)` block never executes → trend always "stable".

**Code location:** 
- `reputationComputeJob.ts` L190-197: exact-date prior lookup (broken)
- `reputationStore.ts` L84-89: `getReputation()` does WHERE date=? (too strict)

---

## Acceptance Criteria

1. **Add `getReputationPrior()` to `reputationStore.ts`**
   - Signature: `export function getReputationPrior(db, code, beforeDate): ReputationScore | null`
   - SQL: `WHERE code=? AND date < ? ORDER BY date DESC LIMIT 1`
   - Returns most recent row with date strictly before `beforeDate`
   - Returns null if no prior row exists
   - Handle null/undefined safely

2. **Replace prior lookup in `reputationComputeJob.ts`**
   - Line 193-197 OLD: `const priorRecord = getReputation(db, code, priorDate);` (exact match)
   - Line 193-197 NEW: `const priorRecord = getReputationPrior(db, code, today);` (most recent before today)
   - No handler change needed (trend persisted in DB at compute time)

3. **Unit tests**
   - `getReputationPrior` empty DB: returns null
   - `getReputationPrior` single row before threshold: returns that row
   - `getReputationPrior` multiple rows with gaps: returns most recent row before threshold
   - `computeReputationForTicker` with prior score 10 lower: returns "improving"
   - `computeReputationForTicker` with prior score 10 higher: returns "deteriorating"

4. **Verification**
   - No compilation errors after build
   - Unit tests pass
   - No handler contract changes (reputation response shape unchanged)
   - QA to verify trend distribution on next 08:30 UTC cron run (task completes, QA waits for cron cycle)

---

## Files to Modify

| File | Layer | Change |
|---|---|---|
| `apps/mcp-server/src/infrastructure/db/reputationStore.ts` | infrastructure | Add `getReputationPrior(db, code, beforeDate)` |
| `apps/mcp-server/src/scheduler/news/reputationComputeJob.ts` | interface/scheduler | Replace exact-date lookup with `getReputationPrior()` call |
| `apps/mcp-server/src/scheduler/news/reputationComputeJob.test.ts` (if exists, else create) | test | Unit tests for prior lookup and trend computation |

---

## Critical Timing Note

**QA verification:** After dev completes this task:
1. Dev tasks completes → ops rebuilds mcp-server container
2. Trend values in DB only update on next cron run (daily 08:30 UTC)
3. QA must wait for that cron cycle to verify live trend distribution is no longer all "stable"
4. QA can manually trigger job to speed verification (trigger endpoint or background job if exposed)

**This task unblocks downstream stale-flag fixes** (DEV-REAUDIT-2, etc.) because reputation trend is consumed by leaderboard display. No other task depends on this functionally, but it is CRITICAL for data integrity.

---

## Decision Journal

**Why not move prior-lookup to handler?**  
Trend is computed once per cron cycle in scheduler, persisted in DB. Handler reads stored trend. Moving logic to handler would compute on every read (wasteful) and break the immutable-at-interval pattern. Correct location is compute job.

**Why `beforeDate` = today vs. a fixed offset?**  
The actual computation happens at cron time. Using `today` (the date being computed for) ensures we fetch the most recent prior complete period, regardless of calendar/trading day irregular intervals. This is resilient to gaps.

---

## Downstream Tasks

- **DEV-REAUDIT-2:** NFR-C-1 stale flags in 5 handlers (including reputation) — can start once this task merged
- **FE-REAUDIT-1:** Stale banners on 5 pages — depends on DEV-REAUDIT-2 mcp-server contract completion

---

## Links

- Architect brief: `docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md`
- BA spec: `docs/handoffs/SHIP-WAVE-REAUDIT-BA-spec.md` § A-16
- Zone standard: `docs/policies/dev-standards.md` § Zone Enforcement
