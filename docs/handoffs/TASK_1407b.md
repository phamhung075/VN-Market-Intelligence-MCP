# TASK 1407b — SLA Monitor: Skip price+foreign_flow Escalations Outside Market Hours

**Type:** FIX
**Priority:** P0
**Branch:** `task/1407b-sla-market-hours-gate`
**Reported:** TASK 1407 missed deadline 2026-04-29 02:00 UTC
**Baseline:** 8225 tests passing

---

## Problem

`freshnessSlaMonitorJob.ts` runs every 30 minutes, 24/7 (`*/30 * * * *`).

For `price` (SLA = 10 min) and `foreign_flow` (SLA = 10 min), data is legitimately
stale outside VN market hours (02:00–08:59 UTC Mon–Fri) because the VPS does not
push price updates when the market is closed. The monitor fires breach escalations
all night → false alarms → Alert Commander sends noise to user.

---

## Root Cause

`runFreshnessSlaMonitor()` processes all signal types without checking whether the
current time is inside market hours. `isVnMarketHours()` already exists in
`freshnessSlaChecker.ts` but is never called by the monitor before escalating.

**Signals that are market-hours-only** (should not alert off-hours):
- `price` — VPS pushes only during 02:00–08:59 UTC Mon–Fri
- `foreign_flow` — same window

**Signals that are 24/7** (must still alert off-hours):
- `bctc` — PDFs arrive at any time after SSC filing
- `news` — continuous feed
- `sbv_fx` — SBV publishes rates any business day

---

## Fix Specification

### Change — `freshnessSlaMonitorJob.ts`

In `runFreshnessSlaMonitor()`, before the escalation call, add a market-hours gate:

```typescript
import { isVnMarketHours } from "../../domain/services/freshnessSlaChecker.js";

// (inside the breach processing loop)
const MARKET_HOURS_ONLY_SIGNALS: SignalType[] = ["price", "foreign_flow"];

for (const breach of slaCheck.breaches) {
  breaches++;
  recordSlaBreach(db, breach.signalType, breach.ageMinutes, breach.thresholdMinutes, breach.severity!);

  // Gate: price + foreign_flow are market-hours-only sources.
  // Outside market hours, staleness is expected — do not escalate.
  if (MARKET_HOURS_ONLY_SIGNALS.includes(breach.signalType) && !isVnMarketHours()) {
    console.debug(
      `[sla-monitor] off-hours: skipping escalation for ${breach.signalType} (expected stale outside market hours)`
    );
    continue;
  }

  if (!isEscalationCooldownActive(db, breach.signalType)) {
    // ... existing escalation logic unchanged ...
  }
}
```

No changes to thresholds, cooldown logic, or recovery tracking.

---

## Files to Change

1. `/apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts`
   - Import `isVnMarketHours` from domain layer
   - Add `MARKET_HOURS_ONLY_SIGNALS` constant
   - Add off-hours gate before escalation call (~8 lines net)

---

## Tests Required

New test file: `apps/mcp-server/src/__tests__/1407b-sla-market-hours-gate.test.ts`

Tests (all use injected `db` in-memory + mock `escalateToCommander`):
1. Off-hours + price breach → escalation NOT called, breach still recorded
2. Off-hours + foreign_flow breach → escalation NOT called, breach still recorded
3. Off-hours + bctc breach → escalation IS called (24/7 source)
4. Off-hours + news breach → escalation IS called (24/7 source)
5. Off-hours + sbv_fx breach → escalation IS called (24/7 source)
6. Market hours + price breach → escalation IS called
7. Market hours + foreign_flow breach → escalation IS called
8. Off-hours gate does not affect recovery tracking (recoveries still recorded)

---

## Acceptance Criteria

- [ ] `price` and `foreign_flow` escalations suppressed outside 02:00–08:59 UTC Mon–Fri
- [ ] `bctc`, `news`, `sbv_fx` escalations fire normally 24/7
- [ ] Off-hours breach still recorded in `sla_breach_audit` (for audit trail)
- [ ] Debug log line emitted when escalation is skipped
- [ ] All 8 new tests pass
- [ ] No regression on existing SLA monitor tests (1352c, 1354b)
- [ ] Baseline test count does not decrease (>= 8225 passing)
- [ ] TypeScript 0 errors (`tsc --noEmit`)
