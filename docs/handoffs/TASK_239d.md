# Task Context — 239d: QA Verification — refresh job execution audit + SLA enforcement

## TLDR (read this first)

change: QA manual verification + smoke test automation (no new production code)
test: src/__tests__/239-macro-indicator-refresh.test.ts (already passing from 239b) + manual execution audit
branch: task/239d-macro-refresh-qa (no code branch — QA review only)

depends: 239c ✓ (schema + registry + scheduler all wired)
knowledge_needed: [bundle-developer, qa-checklist]

---

sprint: 239
branch: task/239d-macro-refresh-qa
status: todo (wait for 239c merge)
req_ref: (BA pending)
tech_ref: TECH-239

---

## [PM] Planning Context

layer: QA verification (execution audit + production smoke tests)
depends_on: 239c ✓ (integration complete, job ready to run)

files_to_read:
- docs/TECH_239.md (lines 127–134) → QA test plan
- docs/knowledge/qa-checklist.md → QA review standards
- src/__tests__/239-macro-indicator-refresh.test.ts → unit test verification
- reports/TASK_REPORT_239a.md, 239b.md, 239c.md → prior task completion records

files_to_create:
- reports/TASK_REPORT_239d.md (QA final report, after verification complete)

files_to_modify:
- (none)

test_file: (smoke tests manual + automated integration)

acceptance_criteria:

**Given** 239a–239c complete + macroIndicatorRefreshJob scheduled + macro_indicators table migrated
**When** QA performs execution audit + SLA validation

**AC-1:** Unit tests (239a–239b) all pass: `bun test 239-macro-indicator-refresh.test.ts` → 10 PASS, 0 FAIL
**AC-2:** Type check passes: `bun tsc --noEmit` → 0 errors
**AC-3:** Smoke test: manually trigger macroIndicatorRefreshJob() → completes without error
**AC-4:** last_refresh_job column written: SELECT last_refresh_job FROM macro_indicators shows populated row (e.g., "2026-04-21T14:30:45Z — yahoo (3 cols)")
**AC-5:** WORK channel receives job status message with source used (yahoo/sbv/gso) + indicator count
**AC-6:** SLA check passes when data age ≤ 24h → no alert sent
**AC-7:** SLA check fails when data age > 24h → escalation alert sent to WORK with message "Macro data [N hours] stale — refresh job failed"
**AC-8:** Circuit breaker logs attempted HTTP calls (no naked fetches)
**AC-9:** Fallback chain verified: if yahoo is blocked/slow, sbv is tried + succeeds (or gso as last resort)
**AC-10:** morningBriefing (08:00 job) displays macro section with values (no longer null/empty)

---

## QA Execution Plan

### Phase 1: Unit Test Verification

**Command:**
```bash
bun test src/__tests__/239-macro-indicator-refresh.test.ts
```

**Expected result:**
- 10 PASS, 0 FAIL
- All assertions resolve in < 5 seconds
- No timeout, no unhandled promise rejections

**Sign-off:** Verify test output matches expected count.

---

### Phase 2: Type Safety Verification

**Command:**
```bash
bun tsc --noEmit
```

**Expected result:**
- 0 errors
- No missing symbols: fetchAndStoreMacroIndicators, FetchResult, macroIndicatorRefreshJob, validateMacroFreshnessOnStartup

**Sign-off:** Type check clean.

---

### Phase 3: Smoke Test — Manual Job Execution

**Setup:**
- Server running: `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp`
- Check server healthy: `curl http://localhost:3000/health` → HTTP 200

**Test 1: Trigger macro refresh job**
```bash
# (Requires internal endpoint or manual function call)
# Example: POST /admin/trigger-job?id=macroIndicatorRefreshJob
```

**Expected behavior:**
1. Job starts execution
2. Attempts to fetch macro data (should log attempt to stdout/WORK channel)
3. Completes within 30 seconds
4. Returns FetchResult: `{ success: true, sourceUsed: "yahoo"/"sbv"/"gso", indicatorCount: N, fetchedAt: "ISO-timestamp" }`

**Verify outputs:**
- WORK channel message received: e.g., "Macro refresh: yahoo (3 cols) at 2026-04-21T14:30:45Z"
- Database updated: `SELECT last_refresh_job FROM macro_indicators` shows "2026-04-21T14:30:45Z — yahoo (3 cols)"

**Sign-off:** Log message + database entry confirm successful execution.

---

### Phase 4: SLA Validation

**Test 2: SLA check when data is fresh**
- Data age: < 24 hours
- Run SLA check
- Expected: no alert sent, SLA status = PASS

**Test 3: SLA check when data is stale**
- Manually set `updated_at` in macro_indicators to 48 hours ago
- Run macroIndicatorRefreshJob()
- Expected: escalation alert sent to WORK channel with message "Macro data 48h stale — refresh failed" (or similar)
- Expected: `last_refresh_job` column updated with timestamp

**Sign-off:** Both SLA scenarios verified.

---

### Phase 5: Fallback Chain Verification

**Test 4: Yahoo source succeeds**
- Job runs normally
- sourceUsed = "yahoo"
- Indicator count ≥ 3 (CPI, GDP, interest_rate at minimum)

**Test 5: Fallback to SBV**
- (Optional: if yahoo is temporarily down)
- Kill yahoo endpoint or mock failure
- Re-run job
- sourceUsed = "sbv" (verify in last_refresh_job column)
- Job succeeds (no exception thrown)

**Test 6: Fallback to GSO**
- (Optional: if sbv is also down)
- Kill both yahoo + sbv
- Re-run job
- sourceUsed = "gso"
- Job succeeds or returns success=false if gso also unavailable

**Sign-off:** Fallback chain works as designed.

---

### Phase 6: Circuit Breaker Verification

**Test 7: Circuit breaker wraps HTTP calls**
- Check server logs for circuit breaker events (e.g., "CircuitBreaker: wrap() called for yahoo-macro-fetch")
- Verify no naked fetch() calls in logs
- Verify each HTTP attempt is counted by circuit breaker

**Sign-off:** Circuit breaker instrumentation present.

---

### Phase 7: Morning Briefing Integration

**Test 8: morningBriefing displays macro section**
- Trigger morningBriefing job (08:00 or manual trigger)
- Expected: briefing message includes macro indicators section with values (e.g., "CPI: 3.2%, GDP: 2.5%, interest_rate: 4.0%")
- Expected: no null fields or [N/A] placeholders (unlike prior broken state)

**Sign-off:** morningBriefing now includes populated macro section.

---

## QA Checklist (from .claude/knowledge/qa-checklist.md)

- [ ] All unit tests pass (10/10 assertions)
- [ ] Type check clean (0 errors)
- [ ] No new console.errors or unhandled rejections
- [ ] Database schema migration succeeds
- [ ] WORK channel receives expected alerts
- [ ] Fallback chain tested (at least 2 sources verified)
- [ ] SLA enforcement working (both pass + escalation)
- [ ] No breaking changes to existing jobs/endpoints
- [ ] Branch hygiene: task branch will be deleted after merge
- [ ] Task report: reports/TASK_REPORT_239d.md completed

---

## Task Report Template (reports/TASK_REPORT_239d.md)

After QA sign-off:
```markdown
# TASK_REPORT_239d: Macro Indicator Refresh — QA Verification

## Summary
- Task: 239d — QA smoke tests + SLA enforcement audit
- Status: DONE
- Sprint: 239
- Branch: task/239d-macro-refresh-qa

## Verification Results

### Unit Tests
- Command: bun test 239-macro-indicator-refresh.test.ts
- Result: 10 PASS, 0 FAIL
- Duration: < 5s

### Smoke Tests
- [ ] Manual job trigger: success (source: yahoo/sbv/gso)
- [ ] last_refresh_job column: populated with ISO timestamp + source
- [ ] WORK alert: message received
- [ ] SLA check (fresh data): no alert
- [ ] SLA check (stale data): escalation alert sent
- [ ] Fallback chain: verified (at least 2 sources)
- [ ] Morning briefing: macro section populated (no nulls)

### Risks / Issues Found
(none) — all tests passed, all alerts fired as expected

## Signed Off
- QA: (agent name)
- Date: 2026-04-21

## Next Steps
- Merge task/239d-macro-refresh-qa to main
- Delete task branch
- Sprint 239 complete
```

---

## Acceptance Criteria (for QA sign-off)

- [ ] Unit tests: 10/10 pass
- [ ] Type check: 0 errors
- [ ] Smoke test: job executes, last_refresh_job written, WORK alert received
- [ ] SLA validation: both fresh + stale scenarios tested
- [ ] Fallback chain: verified (yahoo → sbv → gso)
- [ ] Morning briefing: macro section populated
- [ ] No regressions in existing jobs
- [ ] Task report: reports/TASK_REPORT_239d.md complete
- [ ] Branch: task/239d-macro-refresh-qa deleted after merge to main

