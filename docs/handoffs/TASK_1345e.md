# TASK 1345e — Integration Test + Dashboard Validation

**Sprint:** 1345
**Owner:** QA
**Type:** QA Gate
**Status:** Todo
**Related Report IDs:** (none — post-merge validation)
**Blockers:** None (waits for 1345a–1345d merged)
**Dependencies:** 1345a, 1345b, 1345c, 1345d (all must be merged to main)

---

## Acceptance Criteria

- [ ] Integration test creation:
  - [ ] `apps/mcp-server/src/__tests__/1345e-integration-pipeline.test.ts` created
  - [ ] 5 integration tests (see section 2.3)

- [ ] Test suite:
  - [ ] ✓ Test 1: `bun test` count >= 7371 (no regressions from sprint 1345 new tests: +8+15+7+7 = +37 expected total)
    - Actual count should be ~7408 (7371 baseline + 37 from 1345a–1345d)
  - [ ] ✓ Test 2: `get_source_health()` MCP tool returns Reuters circuit-breaker state (added in 1345a)
  - [ ] ✓ Test 3: `prediction_markets.fetched_at` is within 60 minutes of now (live DB check from 1345c)
    - Queries `SELECT MAX(fetched_at) FROM prediction_markets`, verifies age <= 60 min
  - [ ] ✓ Test 4: VNM BCTC Q4 2024 row has `confidence_financial < 1.0` in BCTC table (added in 1345b)
    - Searches for VNM Q4 2024 row, confirms confidence_financial is populated and < 1.0
  - [ ] ✓ Test 5: Simulated VN-Index cascade event dispatches market summary to MARKET channel (from 1345d)
    - Creates mock cascade alert batch (2+ stocks with "market-wide cascade" signal)
    - Injects test spy for `sendTelegramMarket`
    - Verifies spy was called with summary message containing all stock codes

- [ ] Live DB validation (manual checklist post-merge, before task closure):
  - [ ] VPS services running: `systemctl status vn-reuters-fetch` = active (from 1345a)
  - [ ] VPS services running: `systemctl status vn-tradingeconomics-fetch` = active (from 1345a)
  - [ ] VPS deploy log shows no errors: `cat /var/log/vps-deploy.log` (from 1345a)
  - [ ] BCTC confidence audit script ran: `reports/BCTC_CONFIDENCE_AUDIT_1345b.md` exists and reviewed (from 1345b)
  - [ ] Docker container healthy: `docker-compose logs -f mcp-server` shows no fatal errors
  - [ ] Reuters data flowing: `SELECT COUNT(*) FROM rag_analyses WHERE source='reuters' AND created_at > now - 2h;` > 0

- [ ] Dashboard checks (if dashboard exists):
  - [ ] All 5 data sources (VN news, Reuters, TE, prices, prediction markets) show green health
  - [ ] No stale data warnings on main intelligence dashboard
  - [ ] VN-Index cascade events appear in MARKET channel (if event occurred during 1345 sprint)

- [ ] Code review checklist:
  - [ ] All 5 integration tests use `describe()` and `it()` (Jest conventions)
  - [ ] Live DB tests are NOT mocked (real queries against running DB)
  - [ ] No hardcoded timestamps (use `Date.now()` and compare age)
  - [ ] Test comments explain why each check matters for sprint 1345 completion
  - [ ] All new assertions have descriptive failure messages

- [ ] Deployment validation:
  - [ ] `bun test` output shows 1345e integration tests passing
  - [ ] No new test failures introduced (count stays >= 7408)
  - [ ] Task branch merges to main without conflicts
  - [ ] All 1345a–1345d branches merged first (1345e waits for all)

---

## Implementation Notes

### Scope
QA task only — no production code changes. Runs after 1345a, 1345b, 1345c, 1345d merged to main.

### Purpose
Verify sprint 1345 changes are deployed correctly and working end-to-end:
1. Test count: no regressions
2. Reuters source health: circuit-breaker state queryable
3. Polymarket freshness: data updated within 60 min
4. BCTC confidence: corruption detection working (VNM has low confidence)
5. Cascade broadcast: market-wide events route to MARKET channel

### Live DB Checks
- `prediction_markets.fetched_at <= 60 minutes old` confirms 1345c staleness guard
- VNM BCTC row confidence_financial populated confirms 1345b extraction running
- Reuters data count confirms 1345a VPS services wired correctly

### Manual VPS Validation
Post-merge, before task closure, QA or ops runs:
```bash
# SSH to VPS
ssh vps
systemctl status vn-reuters-fetch     # expect: active
systemctl status vn-tradingeconomics-fetch  # expect: active
tail -f /var/log/vn-reuters.log       # expect: fetch cycles running
```

### Dashboard Validation
If a live ops dashboard exists, it should show all 5 sources green. If VN-Index cascade occurred during sprint, MARKET channel logs should contain market-wide summary message (from 1345d).

### Test Failure Interpretation
- Test 1 fails: some 1345a–1345d task introduced regression (revert + investigate)
- Test 2 fails: `get_source_health()` not registered or Reuters CB missing (1345a incomplete)
- Test 3 fails: Polymarket fetch broke (1345c staleness guard still being debugged) or scheduler not running (infra issue)
- Test 4 fails: BCTC confidence extraction not deployed (1345b incomplete or py service not running)
- Test 5 fails: cascade broadcast logic missing (1345d incomplete)

---

## Branch & Files

**Branch:** `task/1345e-integration-test`

**Files to create:**
- `apps/mcp-server/src/__tests__/1345e-integration-pipeline.test.ts` (5 integration tests)

**Files to review (read-only):**
- `docs/handoffs/TASK_1345a.md` (understand Reuters source changes)
- `docs/handoffs/TASK_1345b.md` (understand BCTC confidence changes)
- `docs/handoffs/TASK_1345c.md` (understand Polymarket staleness changes)
- `docs/handoffs/TASK_1345d.md` (understand cascade broadcast changes)

---

## Definition of Done

All 5 integration tests pass. `bun test` >= 7408 (7371 + 37 from 1345a–1345d). Live DB shows Reuters data updated, Polymarket fresh, VNM confidence < 1.0, cascade events in MARKET channel. VPS services confirmed running via SSH. Task branch merges cleanly to main.

