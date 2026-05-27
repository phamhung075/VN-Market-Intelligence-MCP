# TASK_MLP-D5 — docker-compose.yml + Final Verification & Commit

**Task:** MLP-D5
**Sprint:** MACRO-LIVE-PRICES
**Owner:** dev-macro-indicators
**Zone:** apps/macro-indicators/ + docker-compose.yml
**Depends on:** MLP-D1, MLP-D2, MLP-D3, MLP-D4 (all dev subtasks complete)
**Blocks:** MLP-OPS (force-recreate container), MLP-QA (end-to-end test)
**Priority:** HIGH
**Date:** 2026-05-28
**Architect ref:** docs/architecture-briefs/2026-05-28-macro-live-prices.md §9, §11

---

## Overview

Final task in the dev chain:
1. Add one line to `docker-compose.yml` env block for macro-indicators
2. Run all tests (fixture-mode green to confirm backward compatibility)
3. Explicit-file staging and commit

After this task, MLP-DEV is complete and ready for ops rebuild (MLP-OPS).

---

## Acceptance Criteria

### AC-1: Add COMMODITY_LIVE_MODE=true to docker-compose.yml
**Status:** TODO  
**Evidence:** git diff docker-compose.yml

Add exactly one line to the macro-indicators environment block in `docker-compose.yml` (per brief §9).

**Current environment block (lines 185–217 approx, adjust as needed):**
```yaml
macro-indicators:
  image: macro-indicators:latest
  # ... other config ...
  environment:
    - PORT=5004
    - DB_PATH=/app/data/market.db
    - DB_READONLY=true
    # ← ADD THIS LINE:
    - COMMODITY_LIVE_MODE=true
```

**Full resulting environment block (per brief §9):**
```yaml
environment:
  - PORT=5004
  - DB_PATH=/app/data/market.db
  - DB_READONLY=true
  - COMMODITY_LIVE_MODE=true
```

**Implementation notes:**
- Exact position: after `DB_READONLY=true`, before any other env vars (if any)
- Line format: `- COMMODITY_LIVE_MODE=true` (exact string)
- No other docker-compose.yml changes
- The `market_data` volume mount on macro-indicators is already present (confirmed in brief §9 L192 reference) — no change needed

**Acceptance:** Docker-compose.yml has exactly this one line added to macro-indicators environment. Brief §9 line count (~1 line) matches.

---

### AC-2: Market data volume already mounted
**Status:** TODO  
**Evidence:** code inspection (verify line exists)

Confirm the `market_data` named volume is already mounted on macro-indicators (it should be, per brief §6 data-source decision).

**Inspect `docker-compose.yml`:**
- Find the macro-indicators service definition
- Confirm volumes block includes: `market_data:/app/data`
- If absent, ADD it (but brief states it's already present)

**Acceptance:** market_data volume is mounted on macro-indicators at `/app/data`.

---

### AC-3: T-MLP-6 / T-MLP-7 / T-MLP-8 / T-MLP-9 / T-MLP-10 — Fixture-mode tests still pass
**Status:** TODO  
**Evidence:** go test ./... exit 0 output

All existing tests must pass in fixture mode (no COMMODITY_LIVE_MODE env var set during test).

**Execute:**
```bash
cd apps/macro-indicators
unset COMMODITY_LIVE_MODE   # Ensure unset (fixture-mode default)
go test ./...
```

**Expected:** All tests green, including:
- T-MLP-1, T-MLP-2, T-MLP-3 (infrastructure tests — SQLiteCommodityRepository on in-memory :memory:)
- T-MLP-4, T-MLP-5 (application tests — mocked port)
- Existing tests in the service (repositories_test.go, usecases_test.go, handlers_snapshot_contract_test.go if present)

**Acceptance:** go test ./... exit code 0, zero failures.

---

### AC-4: Build and lint pass
**Status:** TODO  
**Evidence:** go build ./... exit 0, golangci-lint run exit 0 (if lint is configured)

Verify the service builds and passes any linting rules.

**Execute:**
```bash
cd apps/macro-indicators && go build ./...
```

**If golangci-lint is configured for this service:**
```bash
cd apps/macro-indicators && golangci-lint run
```

**Acceptance:** Build succeeds, lint green (if applicable).

---

### AC-5: Commit with explicit-file staging
**Status:** TODO  
**Evidence:** git log --oneline (final commit shows MLP-D5 subject)

Create the final commit using explicit-file staging ONLY (no `git add .` or `git add -A`).

**Staging (exact paths):**
```bash
git add apps/macro-indicators/pkg/infrastructure/repositories.go
git add apps/macro-indicators/pkg/infrastructure/repositories_test.go
git add apps/macro-indicators/pkg/application/usecases_test.go
git add apps/macro-indicators/cmd/server/main.go
git add apps/macro-indicators/pkg/interface/http/<response-file>  # adjust path for actual file
git add docker-compose.yml
git add docs/agent-memory/notebooks/pm.md
```

**Commit subject (brief but clear):**
```
feat(macro-indicators): MLP-D5 — COMMODITY_LIVE_MODE env gate + docker-compose
```

Or if all D1-D5 tasks land in one commit (not split per task):
```
feat(macro-indicators): MACRO-LIVE-PRICES dev complete — SQLiteCommodityRepository + live wiring (T-MLP-1..10)
```

**Verify staging (CRITICAL):**
```bash
git diff --cached --name-only
```

Expected output: ONLY the files above (apps/macro-indicators/*, docker-compose.yml, pm notebook). NO foreign paths (api-gateway, pdf-extractor, etc.).

**Acceptance:** Commit created with correct subject, exact staged files, main branch only, no --force/--no-verify.

---

### AC-6: Test results summary
**Status:** TODO  
**Evidence:** output summary in commit message or pm notebook

Document the test results in the PM notebook or commit message footer.

**Example footer:**
```
T-MLP-1..5: PASS (new infrastructure + application tests)
T-MLP-6..8: PASS (existing tests, fixture mode green)
T-MLP-9..10: PASS (composition root env gate)
Build: PASS
Lint: PASS
All tests: 15/15 PASS
```

**Acceptance:** Test summary present and all green (15 or more tests passing, zero failures).

---

## Implementation Checklist

- [ ] Add `COMMODITY_LIVE_MODE=true` to docker-compose.yml macro-indicators environment block
- [ ] Confirm market_data volume mounted on macro-indicators
- [ ] Run `go test ./...` from apps/macro-indicators (all green)
- [ ] Run `go build ./...` from apps/macro-indicators (success)
- [ ] Run lint if configured (success)
- [ ] Stage exact files only: `git add <explicit-paths>`
- [ ] Verify `git diff --cached --name-only` shows ONLY intended files
- [ ] Commit with clear subject line
- [ ] Update PM notebook with test results summary

---

## Integration with Prior Tasks

Before MLP-D5, ensure:
- **MLP-D1 complete:** SQLiteCommodityRepository struct, FetchPrices(), fetchCommodityPricesFromDB() helper, T-MLP-1/2/3 tests, all in repositories.go + repositories_test.go
- **MLP-D2 complete:** T-MLP-4 and T-MLP-5 tests in usecases_test.go
- **MLP-D3 complete:** Env-gate wiring in cmd/server/main.go
- **MLP-D4 complete:** DataSource field in HTTP response struct

MLP-D5 assumes all prior tasks are committed and verified green locally.

---

## Success Metrics

1. All 6 ACs above verified PASS
2. docker-compose.yml has one new line (COMMODITY_LIVE_MODE=true)
3. go test ./... exit 0 (15+ tests, all green)
4. go build ./... exit 0
5. Commit staging is explicit-file only (no foreign paths)
6. Commit subject clear and descriptive
7. Main branch only, no --force/--no-verify

---

## Rollback / Revert Plan

If final tests fail unexpectedly:
1. Diagnose in local `go test` output
2. If docker-compose is the issue: `git checkout -- docker-compose.yml` and retest
3. If code is the issue: revert the specific MLP-D task that introduced the failure
4. Rerun `go test ./...` and iterate

---

## Notes

- **Fixture-mode gate:** This is the critical backward-compatibility check. All existing tests run with COMMODITY_LIVE_MODE unset, so fixture mode is active. If tests fail, the env gate logic is broken.
- **No runtime verification yet:** This task does NOT verify live wiring works (that's MLP-OPS force-recreate + MLP-QA get_macro_snapshot test). This task verifies LOCAL fixture-mode green only.
- **Zone isolation:** All work stays in apps/macro-indicators/ + docker-compose.yml. No mcp-server, api-gateway, or other cross-zone changes.
- **Serialized commit:** Main terminal commits this (no subagent spin). Explicit-file staging enforced to avoid concurrent commit race (feedback_concurrent_commit_race).

---

## Next Step

After this task DONE:
- Main terminal commits: `feat(macro-indicators): MLP-D5 — ... (test summary: T-MLP-1..10 all green)`
- **TIMER STARTS FOR MLP-OPS REBUILD:** ops standby per PM timing recommendation (defer if host is loaded, or run immediately if user requests urgent live wiring)
- After ops REBUILD complete: MLP-QA dispatched (get_macro_snapshot end-to-end test via call_tool)
- After QA gate PASS: MLP-EXIT (PO sign-off)

---

## PM Timing Recommendation for MLP-OPS

**DEFER ops rebuild to next tick or quieter session.**

**Rationale:** Current host load is high (parallel pdf-extractor + mcp-server sessions). Force-recreate on macro-indicators will cause Docker pool churn. 26h staleness bound means fixtures are still valid for ~6-8h. Not time-critical.

**UNLESS:** User explicitly requests urgent live wiring → ops runs immediately (safe, reversible).

**When host quiets:** ops REBUILD macro-indicators (force-recreate, not restart), then MLP-QA can run end-to-end test.
