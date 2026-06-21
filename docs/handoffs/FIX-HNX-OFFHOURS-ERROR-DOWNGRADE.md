---
task_id: FIX-HNX-OFFHOURS-ERROR-DOWNGRADE
title: "Downgrade off-hours empty-result log from ERROR to DEBUG in HNX/UPCOM fetchers"
sprint: FIX-HNX-OFFHOURS-ERROR-DOWNGRADE
type: FIX
priority: low
zone: apps/mcp-server/
status: REVIEW
rebuild_required: yes
---

## [PM] Work Order

**Problem:** `fetchHnxPrices` and `fetchUpcomPrices` emit `logger.error("all HNX/UPCOM price
sources failed")` on every off-hours `force:true` cycle. When VN market is closed the empty
result is EXPECTED — logging it at ERROR floods the error log and pollutes error-rate alerting
with non-actionable noise.

**Fix scope:** Log-level branch only — no fetch logic, no retry, no source order change.
- Off-hours (market closed): downgrade to `logger.debug` with "no off-hours data (market closed)"
- Market hours: keep `logger.error` (real source failure worth alerting)
- Use SSOT domain helper `isVnTradingWindow` from `domain/services/tradingWindow.ts`
- Apply to both emit sites: `fetchHnxPrices` (line ~353) and `fetchUpcomPrices` (line ~431)
- Inject clock via `options.now?: Date` for deterministic testing

**AC:**
- [ ] Both emit sites covered
- [ ] `isVnTradingWindow` used (not hardcoded hour math)
- [ ] Test: off-hours empty → no error log
- [ ] Test: market-hours empty → error log emitted
- [ ] Fixed clock injection via `options.now`
- [ ] tsc clean + pnpm check EXIT 0
- [ ] Ops to REBUILD container after merge (code-in-container change)

---

## [Developer] Implementation Record

### Files changed

| File | Change |
|---|---|
| `apps/mcp-server/src/infrastructure/fetchers/hnx.ts` | Added `isVnTradingWindow` import; extended `options` type to `{ force?: boolean; now?: Date }` on both `fetchHnxPrices` and `fetchUpcomPrices`; replaced both `logger.error` emit sites with conditional branch keyed on `isVnTradingWindow(options?.now)` |
| `apps/mcp-server/src/__tests__/FIX-HNX-OFFHOURS-ERROR-DOWNGRADE.test.ts` | New test file — 6 tests across 2 describe blocks covering both functions, 3 instants (closed weekday, closed weekend, open weekday) |
| `docs/handoffs/FIX-HNX-OFFHOURS-ERROR-DOWNGRADE.md` | This file |
| `docs/agent-memory/decisions/sprint-FIX-HNX-OFFHOURS-ERROR-DOWNGRADE.md` | Decision journal entry |

### Before / after log-level table

| Condition | Before | After |
|---|---|---|
| Off-hours (outside 02:00–08:59 UTC Mon–Fri), HNX empty | `ERROR` "all HNX price sources failed" | `DEBUG` "all HNX price sources returned empty — no off-hours data (market closed)" |
| Off-hours, UPCOM empty | `ERROR` "all UPCOM price sources failed" | `DEBUG` "all UPCOM price sources returned empty — no off-hours data (market closed)" |
| Market hours (inside 02:00–08:59 UTC Mon–Fri), HNX empty | `ERROR` | `ERROR` (unchanged) |
| Market hours, UPCOM empty | `ERROR` | `ERROR` (unchanged) |

### Trading-window helper used

`isVnTradingWindow(now?: Date): boolean` — exported from `apps/mcp-server/src/domain/services/tradingWindow.ts`.
Returns `true` for Mon–Fri 02:00–08:59 UTC (= 09:00–15:59 VN time).
Import direction: `infrastructure/fetchers/hnx.ts` → `domain/services/tradingWindow.ts` — allowed (infra may import domain pure helpers).

### Emit sites covered

1. `fetchHnxPrices` — was line 353, now inside `if (isVnTradingWindow(options?.now)) { logger.error(...) } else { logger.debug(...) }`
2. `fetchUpcomPrices` — was line 431, same pattern

### Tests written

`apps/mcp-server/src/__tests__/FIX-HNX-OFFHOURS-ERROR-DOWNGRADE.test.ts` — 6 assertions, 6 pass.

Assertion strategy: the logger singleton is created at import time with `minLevel='info'` (from
`loadConfig()`), so debug lines are filtered before reaching `console.log`. Tests therefore assert
the ABSENCE of error-level log for the closed case, and PRESENCE of error-level log for the open
case. Both together prove the correct conditional branch is executed. Clock injected via
`options.now` — no wall-clock dependency.

Fixed instants used:
- `MARKET_OPEN_UTC` = 2026-06-17T03:00Z (Wed, inside 02:00–08:59 UTC window → OPEN)
- `MARKET_CLOSED_UTC` = 2026-06-17T22:00Z (Wed, outside window → CLOSED)
- `WEEKEND_UTC` = 2026-06-20T04:00Z (Sat → CLOSED)

### Git commits

(SHA to be filled in after commit)

### tsc status

`bun tsc --noEmit` — EXIT 0, 0 errors.

### Full suite

New test: 6 pass / 0 fail.
Regression (027-hnx-prices.test.ts): 29 pass / 0 fail.
`pnpm check` EXIT 0.

### Docs updated

NONE — log-level branch change; no API contract, MCP tool, or cron doc affected.

### Graphify

Skipped — no docs impacted.

### Rebuild required

YES — code runs inside the `mcp-server` container. Router to dispatch ops rebuild after QA sign-off.

---

## Status

APPROVED — QA gate passed 2026-06-21.

---

## [QA] Review Record

**Verdict:** APPROVED
**Reviewer:** qa
**Date:** 2026-06-21
**Commit under review:** 93e9dbeb

### Formal Gate Results

| Gate | Command | Result |
|---|---|---|
| 1 | `bun tsc --noEmit` | EXIT 0 — 0 errors |
| 2 | `pnpm check` | EXIT 0 |
| 3 | `bun test FIX-HNX-OFFHOURS-ERROR-DOWNGRADE.test.ts --no-cache` | 6 pass / 0 fail |
| 4 | `bun test 027-hnx-prices.test.ts --no-cache` | 29 pass / 0 fail (regression clean) |

### Log-Level Assertion Confirmation

Clock-deterministic: YES. All 6 tests inject a fixed `now` via `options.now` — no wall-clock dependency. Three instants used: `MARKET_OPEN_UTC = 2026-06-17T03:00Z` (Wed, inside 02:00–08:59 UTC → OPEN), `MARKET_CLOSED_UTC = 2026-06-17T22:00Z` (Wed, outside → CLOSED), `WEEKEND_UTC = 2026-06-20T04:00Z` (Sat → CLOSED).

Assertion strategy: logger singleton `minLevel='info'` filters debug lines before the console.log sink. Tests assert ABSENCE of `level=error` entries for the closed path (off-hours empty → no error log emitted) and PRESENCE of `level=error` entries for the open path (market-hours all-fail → error log emitted). Both together prove the conditional branch executes correctly. Not a trivial no-op: the open-path test uses `failingClient()` (throws), confirmed by test run output showing `"[hnx] all HNX price sources failed"` and `"[hnx] all UPCOM price sources failed"` at error level during the market-open tests.

### Both Emit Sites Covered

- `fetchHnxPrices` — line ~354: `if (isVnTradingWindow(options?.now)) { logger.error("[hnx] all HNX price sources failed", ...) } else { logger.debug("[hnx] all HNX price sources returned empty — no off-hours data (market closed)", ...) }` — CONFIRMED
- `fetchUpcomPrices` — line ~436: identical pattern for UPCOM — CONFIRMED
- Both sites changed symmetrically. In-window path retains `logger.error` — genuine market-hours source failures remain visible and alertable.

### DDD Compliance

- `infrastructure/fetchers/hnx.ts` imports `isVnTradingWindow` from `domain/services/tradingWindow.ts` — infra → domain direction: ALLOWED (pure domain helper, no infrastructure imports in tradingWindow.ts).
- `tradingWindow.ts` has zero infrastructure imports (confirmed by grep — only exports `isVnTradingWindow` and `tradingWindowLabel`, no `import` from infrastructure or application layers).
- DDD: PASS

### Security

- No `process.env` additions in changed files.
- No hardcoded secrets, passwords, or tokens.
- No shell interpolation.
- mock-guard EXIT 0 — no fabricated-data patterns in production source.
- Security: PASS

### BCTC Eval Gate

Not applicable — task does not touch any BCTC report.

### Rebuild Required

YES — code runs inside the `mcp-server` container. Router to dispatch ops rebuild after this approval.
