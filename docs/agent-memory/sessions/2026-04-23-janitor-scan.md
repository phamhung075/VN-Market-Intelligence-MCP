# Code Janitor Scan — 2026-04-23 14:35 VN

**Agent**: code-janitor
**Duration**: 0h35m
**Previous scan**: 2026-04-22 16:16:31Z
**Commits analyzed**: 43 new commits to src/

---

## Checks Run

All 5 checks from janitor-procedures.md executed in order:

1. **Check 1: Duplicate classification maps** — CLEAN. No new Record<string, {...}> duplications.
2. **Check 2: Hardcoded ticker arrays** — CLEAN. Arrays verified as business logic or test fixtures.
3. **Check 3: Repeated magic numbers** — CLEAN. Cron strings canonical, timeouts service-specific.
4. **Check 4: Schema duplication** — CLEAN. All DDL canonical to schema/*.ts, intentional dual documented.
5. **Check 5: Config drift + Layer violations** — VIOLATIONS FOUND (2x HIGH)

---

## Critical Finding

**DDD Layer Violation** (HIGH severity, test suite failing)

**Files affected**:
- `src/domain/services/newsNormalizer.ts:23` imports `formatAnalysisNewsSummary` from `infrastructure/adapters/analysisFormatters.js`
- `src/domain/services/policyImpactMapper.ts:17` imports `formatAnalysisPolicySummary` from `infrastructure/adapters/analysisFormatters.js`

**Root cause**: Task 1300b attempted to use `infrastructure/adapters/` as a DDD boundary layer, but adapters is internal to infrastructure. DDD rule (strict): domain/ cannot import from infrastructure/, period.

**Impact**:
- Test `1321-ddd-no-infra-imports-in-domain.test.ts` FAILS (2 violations detected)
- Architectural rule enforcement broken
- Future maintenance confusion (inline comments claim "approved exception")

**Fix strategy**:
- Option A: Move formatAnalysis* functions to `domain/utilities/textFormatters.ts` (break infrastructure coupling)
- Option B: Create `src/domain/adapters/` module and move functions there (creates new layer, may propagate complexity)
- Recommendation: Option A (cleaner, keeps domain pure). Requires refactor of TelegramMessageFactory truncation logic.

---

## Status Summary

| Check | Result | Notes |
|-------|--------|-------|
| Check 1 | CLEAN | 0 new duplications |
| Check 2 | CLEAN | 0 new arrays |
| Check 3 | CLEAN | 0 new thresholds |
| Check 4 | CLEAN | 0 new schema drift |
| Check 5 | VIOLATIONS | 2x HIGH (DDD layer) |

**Overall**: 4/5 checks clean. 1 critical blocker requiring architectural decision + refactor.

---

## Knowledge Updates

1. **Pattern**: Updated `docs/agent-memory/patterns/DDD-violations.md` with 1300b violation details
2. **State file**: Updated `docs/data/code-janitor-known-findings.json` with fingerprints + current status
3. **Task needed**: Add "Fix Task 1300b DDD violations" to TASKS.md backlog (multi-file, HIGH priority, architectural review required)

---

## Recommendation

**Ship**: Decision deferred to PM. This is a blocker requiring architectural review.
**Backlog**: Create task `JANITOR-1300-DDD-fix` with decision gate before implementation.
**Urgency**: HIGH (test suite failing, affects CI/CD).
