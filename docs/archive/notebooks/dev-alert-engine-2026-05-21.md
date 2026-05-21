# dev-alert-engine — Archive (pre-trim)
Archived from 163-line notebook 2026-05-21.

## 2026-05-06 — Task 1847d-B complete

**Branch:** task/1847d-B-alert-outcome-scorer
**Commit:** c52815a2

**Files created:**
- `apps/mcp-server/src/domain/services/alertOutcomeScorer.ts` — pure domain fns
- `apps/mcp-server/src/__tests__/1847d-alert-outcome-scorer.test.ts` — 14 tests

**Files modified:**
- `apps/mcp-server/src/domain/services/index.ts` — selective barrel export (avoids PricePoint collision)

**Key decisions:**
- ARCH/handoff say `apps/mcp-server/` not `apps/alert-engine/` — followed docs as authoritative
- composite: any signals.length > 1 including pure price-signal combos (TEST-5 drives this)
- PricePoint not exported via barrel (collision with volatilityCalculator + performanceAttribution)

**Tests:** 14/14 pass | tsc: clean
**Blocks:** 1847d-C (job uses classifyAlertType + scoreAlertOutcome)
