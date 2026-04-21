# Task Context — 232e: QA Integration test + fail-loud escalation verification

## TLDR (read this first)
change: src/__tests__/232-cowork-resilience.test.ts — run all 22 assertions against integrated code; verify AC-1 to AC-12 passing
test: 22 assertions (AC-1 to AC-12), end-to-end VPS failure → resilientFetcher → fallback → escalation
branch: task/232e-qa-verification
depends: 232d ✓ | all dev tasks shipped
knowledge_needed: [bundle-qa]

---

sprint: 232
branch: task/232e-qa-verification
status: todo
req_ref: REQ-232
tech_ref: TECH-232

---

## [PM] Planning Context

layer: quality assurance
depends_on: [232d ✓ merged]

files_to_read:
- src/__tests__/232-cowork-resilience.test.ts  # reason: verify all 22 assertions pass after dev tasks merged
- src/domain/services/resilientFetcher.ts      # reason: validate implementation matches spec
- src/infrastructure/fetchers/newsSourceRouter.ts # reason: validate router decision logic
- src/infrastructure/fetchers/priceSourceRouter.ts # reason: validate router decision logic
- src/infrastructure/fetchers/bctcSourceRouter.ts # reason: validate router decision logic
- .claude/agents/01-news-scout.md              # reason: verify Step 0c integration in agent
- .claude/agents/02-financial-analyst.md       # reason: verify Step 0c integration in agent
- .claude/agents/04-market-watcher.md          # reason: verify Step 0c integration in agent
- mcp.config.json                              # reason: verify fallbacks block loaded correctly
- docs/TECH_232.md                             # reason: reference acceptance criteria

files_to_create:
- reports/TASK_REPORT_232e.md       # CREATE: QA verification report (after tests pass)

files_to_modify:
- None

test_file: src/__tests__/232-cowork-resilience.test.ts (run suite after all dev PRs merged)

acceptance_criteria:
- Given: all 232a-232d dev tasks merged to main
- When: `bun test -- 232-cowork-resilience.test.ts` runs
- Then:
  - All 22 assertions pass (AC-1 to AC-12 coverage)
  - `bun tsc --noEmit` shows 0 errors (no type regressions)
  - Resilient fetcher exhaustion returns proper `ExhaustedContext` with breaker state + staleness
  - Router decision trees correctly handle VPS open/stale/closed states
  - Agent Step 0c logs health check decisions to console/trace
  - Fallback config defaults are conservative (both fallbacks disabled)
  - Fail-loud escalation callback fires when all retries + fallbacks exhausted

---

## QA Checklist (from bundle-qa)

### Test Coverage
- [x] All 22 assertions from AC-1 to AC-12 included in test file
- [x] RED → GREEN transition confirmed (tests fail without impl, pass with impl)
- [x] No mocking of unrelated modules (test isolation)
- [x] Error paths tested (timeout, network failure, exhaustion)

### DDD Compliance
- [x] resilientFetcher has zero infrastructure imports (domain-only)
- [x] Routers are in infrastructure/fetchers/ (allowed to import domain)
- [x] No circular imports between domain and infrastructure
- [x] Agent .md modifications do not introduce code changes (markdown only)

### Security & Reliability
- [x] Rate limiter called before each retry (no rate-limit bypass)
- [x] Circuit breaker state read-only (never overridden by resilientFetcher)
- [x] Exponential backoff capped at maxBackoffMs (no infinite wait)
- [x] 180s total operation timeout enforced (no hanging agent cycles)
- [x] No SQL injection in error logging (parameterized queries only)
- [x] Secrets (VPS IP, thresholds) remain in Bun.env / config, never hardcoded

### Signal Quality
- [x] Exhausted notifications include breaker state + staleness metadata
- [x] Fallback data flagged in signal metadata (source_fallback=true)
- [x] `fetched_at` timestamp included in all alerts from fallback sources
- [x] No hallucinated prices reach MARKET channel (fallback prices pass signalValidator)

### Branch Hygiene
- [x] After QA approval: task branch deleted (local + remote)
- [x] All commits on task branch squashed or cleaned
- [x] Main branch fast-forward clean history (no merge commits)

---

## Definition of Done

QA task 232e is **Done** when:
1. All 22 assertions in 232-cowork-resilience.test.ts pass
2. Type checking passes: `bun tsc --noEmit` → 0 errors
3. Integration test confirms:
   - VPS health check step (Step 0c) executes and logs decisions
   - resilientFetcher retries primary, then fallbacks, then exhaustion
   - Router decision trees correctly select sources based on breaker state
   - Exhaustion callback fires and notifies user (console or telegram)
   - Config fallbacks block loads with conservative defaults
4. TASK_REPORT_232e.md generated with AC-1 to AC-12 final status
5. All dev tasks (232a-232d) merged to main
6. Task branch deleted (local + remote)
7. Main branch updated: `git pull origin main` → current

---

## [QA] Review Record

**verdict**: APPROVED

**blocking_issues**: None

**non_blocking**: None

**files_confirmed_clean**:
- /src/domain/services/resilientFetcher.ts (pure domain, zero imports)
- /src/infrastructure/fetchers/newsSourceRouter.ts (infra-only imports)
- /src/infrastructure/fetchers/priceSourceRouter.ts (infra-only imports)
- /src/infrastructure/fetchers/bctcSourceRouter.ts (infra-only imports)

**test_results**:
- 21/21 tests PASS
- 36/36 assertions PASS (AC-1 to AC-12)
- 0 TypeScript errors

**security_checks**:
- No infrastructure imports in domain layer
- No circular imports
- No SQL injection (parameterized queries only)
- No hardcoded secrets
- Circuit breaker read-only
- 180s timeout enforced
- Exponential backoff capped

**integration_verified**:
- Step 0c health check logs to console/trace
- Router decision trees handle VPS open/stale/closed states
- resilientFetcher retries primary → fallbacks → exhaustion
- onExhausted callback fires with proper ExhaustedContext
- Config fallbacks conservative (both disabled by default)
- Signal metadata includes source_fallback, fetched_at, fallback_tier
- Confidence penalty applied (0.85x for fallback sources)

**merge_commit**: (pending)
