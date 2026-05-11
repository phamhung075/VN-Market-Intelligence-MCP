# TASK 1345d — VN-Index Cascade Broadcast Fix

**Sprint:** 1345
**Owner:** Developer
**Type:** FIX
**Status:** Todo
**Related Report IDs:** [1293]
**Blockers:** None
**WIP Slot:** Developer slot

---

## Acceptance Criteria

- [ ] Scheduler changes (no changes to `telegram.ts` or `cascadeEngine.ts`):
  - [ ] `apps/mcp-server/src/scheduler/news-analysis/intelligenceCycleJob.ts` step E:
    - [ ] ✓ Add pre-pass before per-alert loop to detect market-wide cascade batch
    - [ ] ✓ Filter `unnotifiedAlerts` where any signal has `message?.includes("market-wide cascade")`
    - [ ] ✓ If filtered batch size >= 2 AND distinct actionCode count >= 2:
      - [ ] ✓ Compose summary message (format: "[VN-Index] Tác động toàn thị trường — [severity]" + stock list + source)
      - [ ] ✓ Call `sendTelegramMarket(summaryMsg, { persist: { from_agent: "intelligence-cycle", message_type: "market_wide_cascade" } })`
    - [ ] ✓ Wrap `sendTelegramMarket` in try/catch (non-fatal — does not abort per-stock loop)
    - [ ] ✓ One market summary per cycle (not per stock)
  - [ ] Existing per-stock loop unchanged (routes to BUG via `notifyTelegramAlert`)

- [ ] Dependency injection (test injectable):
  - [ ] `CycleDeps` interface adds optional `sendMarketFn?: (text: string, opts?: any) => Promise<boolean>`
  - [ ] When provided in tests, use injected function instead of real `sendTelegramMarket`
  - [ ] In production, `sendMarketFn` defaults to `sendTelegramMarket`

- [ ] Unit tests (7 tests):
  - [ ] `apps/mcp-server/src/__tests__/1345d-vnindex-cascade-broadcast.test.ts` created
  - [ ] ✓ sends sendTelegramMarket summary when >= 2 market-wide cascade alerts in batch
  - [ ] ✓ does NOT send market summary when only 1 market-wide cascade alert
  - [ ] ✓ does NOT send market summary when no alerts have market-wide cascade signal
  - [ ] ✓ market summary message includes all affected stock codes
  - [ ] ✓ market summary failure does not abort per-stock alert loop
  - [ ] ✓ non-cascade alerts in same batch unaffected (still route to BUG)
  - [ ] ✓ CycleResult.telegramAlertsSent counts per-stock sends, not market summary

- [ ] Code review checklist:
  - [ ] String match `"market-wide cascade"` is locked via unit test (if string changes in cascadeEngine, test fails loudly)
  - [ ] Severity logic: `critical` if any alert has severity=critical, else `high`
  - [ ] Stock list includes all distinct actionCodes from market-wide batch (no duplicates)
  - [ ] Vietnamese message text in summary (matching user expectations)
  - [ ] All new functions have JSDoc comments
  - [ ] `sendTelegramMarket` import is from infrastructure (correct per DDD rules)

- [ ] Deployment validation:
  - [ ] `bun test` passes (count >= 7371 + 7 new tests from 1345d)
  - [ ] Integration test 1345e simulates VN-Index cascade event, verifies MARKET channel receives summary
  - [ ] Sanity check: grep for `"market-wide cascade"` in `cascadeEngine.ts` to confirm string match is stable

---

## Implementation Notes

### Problem Summary
- `intelligenceCycleJob.ts` step E sends alerts via `notifyTelegramAlert(alert)`
- `notifyTelegramAlert()` routes to BUG channel only (per Alert Commander rule: "only Alert Commander sends user-facing alerts to MARKET")
- Result: all cascade alerts (VIC and others) go to BUG
- User only sees VIC because it's the first/only consistent alert
- BA hypothesis partially wrong: routing doesn't filter by VIC specifically. Gap is different — no market-wide summary exists.

### Approach
1. Add pre-pass in step E to detect market-wide cascade batch (alerts with "market-wide cascade" in signal message)
2. If batch >= 2 stocks: compose summary and send to MARKET channel (additive, not replacement)
3. Keep existing per-stock routing to BUG unchanged
4. Use dependency injection in `CycleDeps` for test mockability

### Cascade Message Detection
Grep `cascadeEngine.ts` for exact string "market-wide cascade" in `buildCausalChain()` output. This string is load-bearing — if it changes, the filter silently misses. Unit test must lock the string value to prevent future regressions.

### Market Summary Format
```
[VN-Index] Tác động toàn thị trường — CRITICAL (or HIGH)
Cổ phiếu bị ảnh hưởng: VIC, VCB, VNM, ...
Nguồn: market-wide cascade event
```

### Minimum Batch Size
Minimum 2 distinct stocks required for market summary. Rationale: single-stock cascade is not "market-wide" — avoids noise. Minimum 2 actionCodes prevents repeat sends of same stock if it appears in multiple alerts.

### DDD Layer Compliance
`sendTelegramMarket` is a direct infrastructure import in `intelligenceCycleJob.ts` (interface/scheduler layer). This is correct per dev-standards: interface/scheduler may import from infrastructure. No new abstraction needed.

### Testing Strategy
- Unit tests inject `sendMarketFn` spy to verify call signature and frequency
- Unit tests verify filter logic (string match, batch size thresholds)
- Integration test 1345e verifies real MARKET channel receives message
- Sanity check confirms "market-wide cascade" string is stable in cascadeEngine

---

## Branch & Files

**Branch:** `task/1345d-vnindex-broadcast`

**Files to create:**
- `apps/mcp-server/src/__tests__/1345d-vnindex-cascade-broadcast.test.ts` (7 tests)

**Files to modify:**
- `apps/mcp-server/src/scheduler/news-analysis/intelligenceCycleJob.ts` (add pre-pass + market summary send)
- `apps/mcp-server/src/domain/types/cycle.ts` (add `sendMarketFn?` to CycleDeps if not present)

---

## Definition of Done

All acceptance criteria pass. `bun test` ≥ 7371 + 7. Market-wide summary sends to MARKET channel when >= 2 cascade alerts in batch. Per-stock alerts unaffected (still route to BUG). String "market-wide cascade" is locked by unit test. Integration test 1345e confirms end-to-end MARKET channel dispatch.

---

## [QA] Review Record — 2026-04-27

**Reviewer:** QA agent
**Outcome:** APPROVED

### Test Results
- Task tests (1345d): 7 pass / 0 fail
- Channel routing guard (1313): 6 pass / 0 fail
- Full suite: 7400 pass / 3 fail
- TypeScript: 0 errors (bun tsc --noEmit)

### Pre-existing Failures (not caused by 1345d)
- `1338-sprint-goal-retrospective.test.ts` — 3 assertions expect sprint "1344" but project-stats.json now reads "1345". Stale test, pre-existing.
- `249-ssc-insider.test.ts`, `248-muasamcong.test.ts` — network-dependent, pass in isolation. Flaky/environmental, pre-existing.

### DDD Compliance: PASS
- `intelligenceCycleJob.ts` is in interface/scheduler — dynamic import from `infrastructure/notifiers/telegram.js` is correct.
- Zero domain→infrastructure imports in modified files.

### Security: PASS
- No `process.env` usage.
- No hardcoded credentials or secrets.
- `sendMarketFn` injection pattern is clean — production path uses real infra import.

### Code Quality
- Pre-pass is additive — per-stock loop untouched.
- try/catch wraps market summary send — non-fatal by design.
- `distinctCodes` uses `Set` deduplication correctly.
- Severity escalation logic correct (critical if any cascade alert is critical).
- JSDoc present on `sendMarketFn` in CycleDeps.
- `ALLOWED_SENDERS` in 1313 test updated to include `news-analysis/intelligenceCycleJob.ts`.

### Merge Commit
ebe7cab7 feat(1345d): add market-wide cascade summary broadcast to MARKET channel

