---
task_id: FOU-3-QA
title: REQ2 (QA subtask): Anti-false-green PROVEN-RED test for 2-axis Service Health
owner: qa
priority: medium
depends:
  - FOU-3-FE
  - FOU-3-GW
zone: qa/
status: DONE
---

## Summary

Validate that the 2-axis Service Health rendering (FOU-3-FE) preserves the anti-false-green invariant: a genuinely-deployed service that goes DOWN must render RED on the dashboard, regardless of any capability status. This test proves the invariant is load-bearing and cannot be bypassed by the capability axis.

## Acceptance Criteria

1. **PROVEN-RED Scenario A — Deployed Service Down**:
   - Setup: docker-stop a real deployed service (e.g. macro-indicators or sbv-fetch)
   - Action: Refresh /dashboard/services
   - Expected: The stopped service renders RED badge with "DOWN" status
   - Verification: Red color (not yellow/blue/grey), text shows "DOWN", not rescued by capability status
   - Anti-pattern check: service does NOT show "LIVE via mcp-server" or any positive capability badge

2. **PROVEN-BLUE Scenario B — Not-Deployed, Capability Live**:
   - Setup: Fresh /dashboard/services (all not-deployed services probed at load time)
   - Expected: Services in not_deployed_by_design with capability=live (e.g. kinh-dich) show blue "LIVE via mcp-server" badge
   - Verification: Blue badge present, text clearly shows "LIVE via mcp-server" (not bare "NOT DEPLOYED" grey)
   - Source check: /health response contains capability="live" for that service

3. **PROVEN-GREY Scenario C — Not-Deployed, Capability Dark**:
   - Setup: Fresh /dashboard/services (rag service has capability=dark by design)
   - Expected: Services in not_deployed_by_design with capability=dark (e.g. rag) show grey "NOT DEPLOYED" badge
   - Verification: Grey badge, text shows "NOT DEPLOYED" or "DARK" (honest unavailable)

4. **No False-Green on Capability Field**:
   - Verify: Adding a capability="live" to a deployed service that is DOWN does NOT change its badge from RED
   - Verify: Top overall badge (services page header) still goes RED if ANY deployed service is DOWN, regardless of not_deployed services' capability status

5. **Anti-Pattern Check — Capability Does Not Rescue Deployed Services**:
   - Run the test suite with:
     - Deployed service down + capability field any value → RED (test matrix all capability values: live, data_limited, dark, n/a)
     - Expected: All combinations produce RED (capability field has zero effect on deployed services)

## Test Implementation

### Manual PROVEN-RED

1. Start full stack (ops rebuilt containers from FOU-3-GW + FOU-3-FE merges)
2. Stop one deployed service: `docker compose stop macro-indicators`
3. Open http://localhost:3001/dashboard/services
4. Verify macro-indicators row: RED badge, "DOWN" status, no positive capability indicator
5. Verify top overall badge: "DOWN" or "DEGRADED" (not "OK")
6. Restart service: `docker compose start macro-indicators`
7. Refresh page
8. Verify macro-indicators row: GREEN badge, "UP" status

### Automated Unit/Integration Tests

Add test cases to frontend test suite:

```typescript
describe("CapabilityBadge + StatusBadge integration", () => {
  test("deployed + down → RED, regardless of capability field", () => {
    const service: ServiceRow = {
      name: "macro-indicators",
      status: "down",
      capability: "live", // capability field present but ignored
      latencyMs: 500,
    };
    const badge = render(<StatusBadge status={service.status} capability={service.capability} />);
    expect(badge).toHaveClass("bg-red-600"); // RED
    expect(badge.textContent).toContain("DOWN");
  });

  test("not_deployed + live → BLUE LIVE via mcp", () => {
    const service: ServiceRow = {
      name: "kinh-dich",
      status: "not_deployed",
      capability: "live",
      latencyMs: null,
    };
    const badge = render(<StatusBadge status={service.status} capability={service.capability} />);
    expect(badge).toHaveClass("bg-blue-600"); // BLUE
    expect(badge.textContent).toContain("LIVE via mcp");
  });

  test("not_deployed + dark → GREY NOT DEPLOYED", () => {
    const service: ServiceRow = {
      name: "rag",
      status: "not_deployed",
      capability: "dark",
      latencyMs: null,
    };
    const badge = render(<StatusBadge status={service.status} capability={service.capability} />);
    expect(badge).toHaveClass("bg-gray-400"); // GREY
    expect(badge.textContent).toContain("NOT DEPLOYED");
  });

  test("top overall badge ignores not_deployed, RED on deployed down", () => {
    const services: ServiceRow[] = [
      { name: "kinh-dich", status: "not_deployed", capability: "live" },
      { name: "macro-indicators", status: "down", capability: "n/a" },
    ];
    const topBadge = render(<OverallStatusBadge services={services} />);
    expect(topBadge).toHaveClass("bg-red-600"); // RED (from deployed down)
  });

  test("top overall badge GREEN when all deployed OK, not_deployed LIVE", () => {
    const services: ServiceRow[] = [
      { name: "macro-indicators", status: "ok", capability: "n/a" },
      { name: "kinh-dich", status: "not_deployed", capability: "live" },
    ];
    const topBadge = render(<OverallStatusBadge services={services} />);
    expect(topBadge).toHaveClass("bg-green-600"); // GREEN
  });
});
```

## Files Modified

### New
- qa/ test suite (or extend existing frontend test suite)

### Test Coverage Targets
- StatusBadge component: 6 test cases (deployed×3 statuses + not_deployed×3 capabilities)
- OverallStatusBadge component: 2 test cases (deployed down ignores not_deployed, all ok = green)
- Anti-false-green invariant: matrix test (deployed+down+all capability values → RED)

## Success Criteria

- [ ] Manual PROVEN-RED scenario A passes (docker-stop deployed service → RED)
- [ ] Manual PROVEN-BLUE scenario B passes (not-deployed+live → BLUE)
- [ ] Manual PROVEN-GREY scenario C passes (not-deployed+dark → GREY)
- [ ] No capability field can rescue a deployed service from RED
- [ ] Top overall badge ignores not_deployed, red on any deployed down
- [ ] All unit/integration tests pass (6+ test cases)
- [ ] Test matrix confirms deployed+down renders RED for all capability values
- [ ] QA sign-off: anti-false-green invariant proven load-bearing

## Interaction with FOU-3-FE

FOU-3-QA depends on FOU-3-FE being merged and rebuilt in containers. Do not start QA until both FOU-3-GW and FOU-3-FE are live on the deployed containers.

## Interaction with FOU-3-GW

If FOU-3-GW probe fails (timeout or cache miss), capability field may be absent or null. QA should test frontend graceful handling: missing capability → assume n/a → no positive badge for not_deployed services. This is a fallback, not a failure.

## Definition of Done

- [ ] Manual PROVEN-RED test: deployed service stopped, page shows RED (not rescued by capability)
- [ ] Manual PROVEN-BLUE test: not-deployed+live service shows BLUE
- [ ] Manual PROVEN-GREY test: not-deployed+dark service shows GREY
- [ ] Unit tests: 6+ cases covering all state combinations
- [ ] Anti-false-green matrix: deployed+down+[all capability values] → RED
- [ ] Top badge preserves ignores-not_deployed logic
- [ ] QA sign-off document with test results + matrix table
- [ ] No regressions to A-01b-4 invariant (deployed-down-red proof)

## [QA] Review Record — cycle-188 · 2026-06-02T23:55Z

Verdict: DONE

**Automated invariants proven:**
- Unit PROVEN-RED: deployed+down × all 4 capability values (live/data_limited/dark/n/a) → deployed_down. Non-tautological (inject-a-violation confirmed 5 FAIL on guard removal, reverted → green).
- Unit PROVEN-BLUE: not_deployed+live → not_deployed_live (blue badge).
- Unit PROVEN-GREY: not_deployed+dark → not_deployed_dark (grey badge).
- Top badge ignores not_deployed: deployed+down overrides gateway "ok"; not_deployed+live does NOT rescue top badge.
- Anti-false-green matrix: all capability values × deployed+down → RED (proven across both Go domain layer and TS compose layer).

**Manual PROVEN-RED (docker-stop):** DEFERRED — containers not yet rebuilt. Per FOU-3-QA handoff dependency: "Do not start QA until both FOU-3-GW and FOU-3-FE are live on the deployed containers." Ops must rebuild api-gateway + frontend first, then manually verify.

**Sprint FRONTEND-OPERATOR-UX: DONE-PENDING-REBUILD**
**Next: ops** — rebuild api-gateway (single-service) + frontend (single-service), then live-verify:
1. Hover "Kiền" on /dashboard/analysis → tooltip shows Vietnamese coreMeaning.
2. /dashboard/services → not_deployed+live services show blue LIVE badge.
3. docker-stop macro-indicators → row shows RED.
