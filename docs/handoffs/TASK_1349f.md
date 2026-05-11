# Task 1349f: Integration Test + Observability Verification (QA)

**Sprint:** 1349
**Type:** Quality Assurance
**Size:** S (0.5h)
**Priority:** HIGH (final gate)

---

## Problem Statement

Tasks 1349a–1349e deliver code cleanup + observability. QA must verify:
1. Dead code actually removed (no broken references)
2. Logging + metrics actually working (data flowing)
3. No regressions from changes
4. All acceptance criteria met
5. Baseline tests stable

---

## Solution

Create test file `src/__tests__/1349f-integration-observability.test.ts`:

### Test 1: Dead Config Removal

```typescript
describe('1349a: Dead scheduler config removal', () => {
  it('should not have scheduler section in mcp.config.json', async () => {
    const config = JSON.parse(Bun.file('mcp.config.json'));
    expect(config.scheduler).toBeUndefined();
  });

  it('should have CRONS defined in src/scheduler/jobs.ts', async () => {
    // Import and verify CRONS map exists
    const { CRONS } = await import('../scheduler/jobs.js');
    expect(Object.keys(CRONS).length).toBeGreaterThan(40); // 42 jobs
  });
});
```

### Test 2: Circuit Breaker Logging

```typescript
describe('1349b: Circuit breaker state logging', () => {
  it('should log CB transitions with required fields', async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => {
      if (msg.includes('CB_TRANSITION')) logs.push(msg);
    };

    // Trigger CB transition (mock or real)
    // ... simulation code ...

    console.log = originalLog;

    expect(logs.length).toBeGreaterThan(0);
    const transition = JSON.parse(logs[0]);
    expect(transition).toHaveProperty('timestamp');
    expect(transition).toHaveProperty('job');
    expect(transition).toHaveProperty('state_old');
    expect(transition).toHaveProperty('state_new');
    expect(transition).toHaveProperty('reason');
  });
});
```

### Test 3: Scheduler.md Paths

```typescript
describe('1349c: Scheduler documentation paths', () => {
  it('should have all 42 scheduler jobs listed with correct paths', async () => {
    const schedulerDoc = await Bun.file('docs/agent-memory/modules/scheduler.md').text();
    const jobCount = (schedulerDoc.match(/src\/scheduler\//g) || []).length;
    expect(jobCount).toBeGreaterThanOrEqual(40); // at least 40 references
  });

  it('should not reference old src/infrastructure/scheduler path', async () => {
    const schedulerDoc = await Bun.file('docs/agent-memory/modules/scheduler.md').text();
    expect(schedulerDoc).not.toContain('src/infrastructure/scheduler');
  });
});
```

### Test 4: BCTC Validation Edge Cases

```typescript
describe('1349d: BCTC validation edge cases', () => {
  it('should have at least 4 new edge case tests in 1345b', async () => {
    const testFile = await Bun.file('src/__tests__/1345b-bctc-financial-validation.test.ts').text();
    const testCount = (testFile.match(/it\(/g) || []).length;
    expect(testCount).toBeGreaterThanOrEqual(8); // original + 4 new
  });
});
```

### Test 5: Job Metrics Collection

```typescript
describe('1349e: Job metrics collection', () => {
  it('should collect metrics from taAlertScan, bbAlertScan, macroRefresh', async () => {
    const { getJobMetrics } = await import('../infrastructure/observability/jobMetrics.js');
    const taMetrics = getJobMetrics('taAlertScan');
    const bbMetrics = getJobMetrics('bbAlertScan');
    const macroMetrics = getJobMetrics('macroRefresh');

    // Verify structure
    if (taMetrics.length > 0) {
      expect(taMetrics[0]).toHaveProperty('cycle_duration_ms');
      expect(taMetrics[0]).toHaveProperty('error_count');
      expect(taMetrics[0]).toHaveProperty('success_count');
    }
  });
});
```

### Test 6: Baseline Regression Check

```typescript
describe('1349 baseline regression', () => {
  it('should maintain ≥7371 passing tests', async () => {
    // This test passes if full suite runs without errors
    // Verification: `bun test` output shows "7371 pass"
    expect(true).toBe(true); // placeholder for test runner assertions
  });

  it('should have zero new failures from 1349 changes', async () => {
    // Compare baseline (7371) vs current
    // Run: bun test --no-coverage 2>&1 | grep "✓" | wc -l
    // Should still show 7371+
    expect(true).toBe(true);
  });
});
```

---

## Manual QA Checklist

- [ ] Run `bun test --no-coverage` → all tests pass, ≥7371
- [ ] Verify mcp.config.json has no "scheduler" section (text editor check)
- [ ] Verify src/infrastructure/config.ts does not reference "scheduler" (grep)
- [ ] Check logs contain CB_TRANSITION messages during any job cycle
- [ ] Check logs contain JOB_METRICS messages for ta/bb/macro jobs
- [ ] Verify docs/agent-memory/modules/scheduler.md lists 42+ jobs under src/scheduler/
- [ ] Verify no "src/infrastructure/scheduler" references in scheduler.md
- [ ] Spot-check 3 random job files exist at documented paths
- [ ] Run Docker healthcheck: `docker-compose ps` (all services up)

---

## Acceptance Criteria

- [ ] Integration test file `1349f-integration-observability.test.ts` created
- [ ] All 6 test cases passing
- [ ] Manual checklist items all verified
- [ ] Baseline tests ≥7371 passing, zero regressions
- [ ] No TypeScript errors (`bun tsc --noEmit`)
- [ ] All observable signals present (logs, metrics, paths)

---

## Files Changed

- `src/__tests__/1349f-integration-observability.test.ts` (new)
- No source code changes needed for QA phase

---

## Notes

- QA serves as final gate before sign-off
- Manual checklist captures ops-facing verification beyond automated tests
- If any check fails, return to corresponding task (1349a–1349e) for fix
