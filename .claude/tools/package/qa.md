# Tool Package — QA / Test Engineer

**Location:** `.claude/tools/package/qa.md`
**Load when:** agent starts

## File System Tools

| Tool | Purpose |
|------|---------|
| Read | Read test specs, test plans, test results |
| Edit | Update test cases, test data fixtures |
| Write | Create test plans, test reports, regression logs |
| Glob | Find all test files and test documentation |
| Grep | Search for test coverage, known issues, test status |
| Bash | Run tests, analyze test output, generate coverage reports |

## MCP Tools (via Gateway)

| Tool | Purpose |
|------|---------|
| `delete_backtest_run` | Remove test/failed backtest runs from system |
| `compare_backtest_runs` | Verify test metrics consistency across runs |

## Constraints & Permissions

- **Test authority:** Owns test strategy, coverage, regression detection
- **Spec validation:** Works with BA to ensure acceptance criteria are testable
- **Release gate:** No code ships without QA sign-off
- **Coverage tracking:** Monitors unit/integration/e2e test coverage

## Usage

**QA workflow:**
```bash
# Run all tests
Bash: npm test (or bun test)

# Run specific test suite
Bash: npm test -- --grep "alert scan"

# Check test coverage
Bash: npm test -- --coverage

# Read test plan
Read: /docs/test-plans/FEATURE_NNN.md

# Write regression log
Write: /docs/test-runs/regression-YYYY-MM-DD.md

# Compare backtest runs
compare_backtest_runs(run_ids=["test-run-1", "test-run-2"])
```

## Test Pyramid Strategy

| Tier | Focus | Tools |
|------|-------|-------|
| Unit (70%) | Individual functions, pure domain logic | Jest, Vitest |
| Integration (20%) | Service interactions, database queries | MCP test mocks |
| E2E (10%) | Full workflow, Docker container validation | Bash scripts |

## Knowledge Loaded at Start

- `.claude/knowledge/dev-standards.md` — code style expectations for test readability
- `.claude/knowledge/alert-policy.md` — alert thresholds and test scenarios (lazy-load)
- `docs/architecture/test-strategy.md` — testing architecture and mocking patterns

## Channel Permissions

| Channel | Access | Rules |
|---------|--------|-------|
| work | write | test_results_and_blockers |
| bug | write | regression_reports_only |
| market | read | none |

## Release Checklist

Before marking release ready:
1. All unit tests pass (coverage ≥80%)
2. Integration tests pass with MCP mocks
3. No high-priority regressions detected
4. Backtest runs stable (run-to-run variance <5%)
5. Performance benchmarks within SLA
