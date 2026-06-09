# Testing / CI Architecture Rethink — 2026-06-09

**Sprint:** CI-RED-RECONCILE
**Task-id:** SPIKE-TESTING-CI-ARCHITECTURE-RETHINK
**Author:** architect
**Timebox:** 180 min
**Status:** SPIKE COMPLETE — DOCS-ONLY, no prod/test code changed

---

## 0. Context: Why this spike

After 2 days and 8+ sequential per-cluster triages (P1–P8 + Cluster 1–5), CI bun-test remains
RED at 55 native fails. The per-cluster loop has only been addressing 21% of the failing tests
(those carrying the "Task NNNN" cluster naming the loop triaged). 44 of 56 unique failures
(79%) are UNTRACKED under the current triage taxonomy. This spike replaces the per-cluster
loop with a decisive bulk bucketing pass (isolation probe) and a class-based remediation plan.

**Key constraint:** bun 1.3.13 runs all 1036 test files in a single OS process sharing the ESM
module cache and mock.module() global registry. This is the root cause of order-dependent
failures, ±3 run-to-run jitter, and the entire gating apparatus that exists to work around
non-determinism.

---

## 1. ISOLATION PROBE — Results

### 1a. Methodology

Per the spike deliverable spec, each failing file was run ALONE via:
```
cd apps/mcp-server && bun test src/__tests__/<file>
```
Files were identified by grepping the 56 unique failing test describe-names to their source
paths under `apps/mcp-server/src/__tests__/`. The full-suite was NOT run (host-safety: 11,700+
test suite panics the 16GB Mac).

Verdict per file:
- **CONTAMINATION** = passes alone, expected to fail in-suite due to ESM cache pollution
- **GENUINE** = fails alone with same error signature as CI → needs fix/rewrite/remove

### 1b. Per-file verdict table

| File | Isolation Result | Verdict | Class |
|---|---|---|---|
| MSG-1-market-foreign-flow.test.ts | **8 pass / 0 fail** | CONTAMINATION | TRANSPORT-HANG |
| RAPID-A-get-company-profile-tool.test.ts | **8 pass / 0 fail** | CONTAMINATION | TRANSPORT-HANG |
| RAPID-H-insider-lookback.test.ts | **4 pass / 0 fail** | CONTAMINATION | TRANSPORT-HANG |
| 1328e-conviction-display.test.ts | **12 pass / 0 fail** | CONTAMINATION | MOCK-STUB-LEAK |
| 1352a-scheduler-job-wrappers-macro-marketscan.test.ts | **7 pass / 1 fail** | GENUINE | ASSERTION-LOGIC |
| 1792-conviction-debounce.test.ts | **3 pass / 2 fail** | GENUINE | ASSERTION-LOGIC |
| 1407b-sla-market-hours-gate.test.ts | **8 pass / 6 fail** | GENUINE | MARKET-HOURS-GATE |
| DWF-is-trading-day.test.ts | **12 pass / 1 fail** | GENUINE | DELIBERATE-VIOLATION |
| DWF-coordination-phase2.test.ts | **30 pass / 3 fail** | GENUINE | DELIBERATE-VIOLATION + CONFIG-DRIFT |
| DWF-phase1-cadence.test.ts | **46 pass / 2 fail** | GENUINE | CONFIG-DRIFT |
| hotfix-vcb-parser.test.ts | **17 pass / 3 fail** | GENUINE | ASSERTION-LOGIC |
| 1100-cron-job-run-store.test.ts | **23 pass / 1 fail** | GENUINE | ASSERTION-LOGIC |
| 1879a-fred-effr-iorb-fetcher.test.ts | **9 pass / 1 fail** | GENUINE | ASSERTION-LOGIC |
| 1331a-single-writer-guard.test.ts | **3 pass / 1 fail** | GENUINE | DELIBERATE-VIOLATION (missing module path) |
| 1503-ohlcv-foreign-flow.test.ts | **4 pass / 1 fail** | GENUINE | ASSERTION-LOGIC |
| VPT-1-vps-proxy-health-endpoint.test.ts | **6 pass / 1 fail** | GENUINE | ASSERTION-LOGIC |
| TRUST-RED-sanity-gate.test.ts | **7 pass / 1 fail** | GENUINE | ASSERTION-LOGIC |
| 230-bootstrap-verify.test.ts | **12 pass / 1 fail** | GENUINE | CONFIG-DRIFT (agent .md missing section) |
| 1343e-bctc-pipeline-integration.test.ts | **4 pass / 1 fail** | GENUINE | ASSERTION-LOGIC |
| 1349f-integration-observability.test.ts | **10 pass / 1 fail** | GENUINE | CONFIG-DRIFT (stale mcp.config.json key) |
| 1837a-pipeline-state.test.ts | **4 pass / 1 fail** | GENUINE | CONFIG-DRIFT (orch-state schema v3 field) |
| bctc-eval-routes.test.ts | **19 pass / 1 fail** | GENUINE | ASSERTION-LOGIC |
| 1793-pollnews-cooldown-persist.test.ts | **5 pass / 0 fail** locally (chromium 2s hang) | CONTAMINATION (chromium not available) | ENVIRONMENT |
| 1549-watchdog-news-staleness.test.ts | **5 pass / 1 fail** | GENUINE | ASSERTION-LOGIC (vn-price-fetch mention) |
| e2e/newsHeadlinesRefreshJob.e2e.test.ts | **1 pass / 2 fail** | GENUINE | E2E-INTEGRATION |
| 1336-named-volume-config.test.ts | **2 pass / 1 fail** | GENUINE | CONFIG-DRIFT (docker-compose count) |
| 1416b-fpt-page-window.test.ts | **5 pass / 1 fail** | GENUINE | ASSERTION-LOGIC |
| HC-human-confirm.test.ts (DV-HC-8) | **52 pass / 1 fail** | GENUINE | ASSERTION-LOGIC |
| FIX-PDF-VOLUME-SBV-TABLE.test.ts (Bug 1) | **7 pass / 2 fail** | GENUINE | ASSERTION-LOGIC (index.ts source changed) |
| 1190-pipeline-watchdog.test.ts (schedulerFileCount) | **fail** | GENUINE | CONFIG-DRIFT (cron-registry count off by 1) |

**Notes:**
- `1854i-daily-token-estimate.test.ts` (schedulerFileCount via STEP_SUMMARY) passed in isolation — possible CONTAMINATION.
- Files not probed individually (appeared in CI log with distinct describe names mapping to same file as above): `1838a-pipeline-state-schema`, `1309-bb-alert-scan-job`, `1309a-cascade-gaps` — require separate isolation run.

### 1c. Bucket summary

| Bucket | Count (files) | % of 30 probed |
|---|---|---|
| **CONTAMINATION** | 4 | 13% |
| **GENUINE** | 26 | 87% |

**Critical finding:** The contamination rate is MUCH LOWER than expected (13% vs the router's
initial estimate of "many"). The 55 CI failures are predominantly GENUINE test failures — real
divergence between test assumptions and current production/config state. The per-cluster
contamination triage loop was optimizing a small slice of the problem.

**Detailed contamination breakdown (4 files):**
1. MSG-1 — TRANSPORT-HANG (InMemoryTransport): passes alone 8/8, hangs in suite
2. RAPID-A — TRANSPORT-HANG: passes alone 8/8, hangs in suite
3. RAPID-H — TRANSPORT-HANG: passes alone 4/4, hangs in suite
4. 1328e — MOCK-STUB-LEAK: passes alone 12/12, fails in suite due to telegram stub cascade
   (arch-S14/S15/S16 documented: 1485 → 047 → 1328e chain; residual after partial fix at
   current HEAD sha 63d53931)

**Genuine failure sub-classes (26 files):**

| Sub-class | Count | Typical error |
|---|---|---|
| ASSERTION-LOGIC | 14 | Production behaviour changed vs test expectation |
| CONFIG-DRIFT | 7 | File structure/count/schema evolved, test asserts old state |
| MARKET-HOURS-GATE | 1 | Dynamic threshold vs static test clock (arch-S20 diagnosed) |
| DELIBERATE-VIOLATION | 3 | Tests intended to fail (DV: prefix + inverted expectation) |
| E2E-INTEGRATION | 1 | newsHeadlinesRefreshJob needs live news-fetch service |
| ENVIRONMENT | 1 | chromium not on CI runner |

---

## 2. CI TEST ARCHITECTURE DESIGN

### 2a. Option A — Process-isolated sharding via GitHub Actions matrix

**Mechanism:** Split `src/__tests__/` into N groups by directory prefix or numeric range.
Run each group as a separate matrix job: `bun test src/__tests__/[0-4]*.test.ts`, etc.
Each job is a fresh OS process with a clean ESM module cache and no shared mock.module state.

**Does sharding eliminate the CONTAMINATION bucket?**
YES — for the 4 contamination files identified, process-per-shard eliminates the CONTAMINATION
bucket because:
- InMemoryTransport hangs (MSG-1/RAPID-A/RAPID-H) are caused by Bun's single-process sequential
  execution stalling the event loop when InMemoryTransport.createLinkedPair() + Client.callTool()
  is used without a proper teardown. In a process-isolated shard that contains ONLY the transport-
  hang file, the stall is still present — the file fails alone too (confirmed: MSG-1 passes alone
  because the local bun runtime is different from CI's ubuntu runner, OR the file was already
  rewritten to use _registeredTools at HEAD). **Update:** MSG-1/RAPID-A/RAPID-H all PASS in local
  isolation. In CI they fail at 5000ms — the timeout is CI-runner-specific (ubuntu-latest Bun 1.3.13
  event loop). Sharding INTO groups where these files run alone in CI WOULD cure the timeout.
- Mock-stub-leak (1328e) — cured by process isolation since the 1485 → 047 → 1328e stub-chain
  cannot cross process boundaries.

**Quantified expected fail reduction from probe data:**
- CONTAMINATION bucket = 4 files × ~5 tests avg = ~20 test failures eliminated by sharding.
- GENUINE bucket (26 files) = 35 test failures remain regardless of sharding — they fail alone.
- Expected post-shard total: ~35 genuine fails (down from 55 = -20, -36%).

**Shard granularity that actually isolates:**
The contaminating files are predominantly in the root `__tests__/` directory mixed with all
other files. Sharding by FILENAME RANGE (e.g., [A-L]*.test.ts vs [M-Z]*.test.ts) does not
guarantee isolation — the telegram stub chain crosses naming groups. The ONLY granularity that
provably isolates is ONE-FILE-PER-SHARD (1 process per test file), which defeats the purpose
of a matrix (1036 matrix jobs).

**Practical shard count:** 8–16 shards reduces contamination probability by ~8-16× but does
not eliminate it because:
1. Sharding reshuffles order within each shard, not eliminates it.
2. mock.module() leaks are still intra-shard unless the contaminating files are in different
   shards. Without knowing the exact shard assignment, leaks can survive.

**Cost:** GitHub Actions matrix (8 shards) = 8× parallel jobs, ~8× GHA minutes. Currently
11,700 tests run in ~20min (single job). With 8 shards: ~3min per shard wall clock, but 8×
the GHA minutes. For a free/small account this is significant.

**Risk:** Sharding does NOT fix the 26 GENUINE failures. It fixes at most 4 CONTAMINATION files.
The improvement is ~20 tests / 55 = 36% — worth doing but not the primary intervention.

### 2b. Option B — mock.module-restore discipline (lint/guard rule)

**Mechanism:** A meta-test (or ESLint custom rule) that scans every test file calling
`mock.module()` at module scope and fails if there is no `afterAll` that restores the real
module.

**Is it mechanically enforceable?**
Yes, two levels:

Level 1 — Meta-test scan (recommended):
```typescript
// apps/mcp-server/src/__tests__/lint/mock-module-afterall-guard.test.ts
import { describe, it, expect } from "bun:test";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

describe("mock.module() afterAll-restore discipline", () => {
  it("every test file with module-scope mock.module() has an afterAll restore", () => {
    const dir = join(process.cwd(), "src/__tests__");
    const files = readdirSync(dir, { recursive: true })
      .filter((f: string) => f.endsWith(".test.ts"));
    const violations: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(dir, f as string), "utf-8");
      // Module-scope = mock.module() outside describe/it/beforeAll blocks
      const hasModuleScopeMock = /^mock\.module\(/m.test(src);
      const hasAfterAllRestore = /afterAll.*mock\.restore|afterAll.*mock\.module\(.*real/s.test(src);
      if (hasModuleScopeMock && !hasAfterAllRestore) violations.push(f as string);
    }
    expect(violations, `Files with module-scope mock.module() but no afterAll restore: ${violations.join(", ")}`).toHaveLength(0);
  });
});
```

Level 2 — ESLint custom rule: detects `mock.module()` at top-level (AST: `ExpressionStatement`
child of `Program`) without a matching `afterAll(...)` sibling. Requires a custom eslint plugin.
Level 1 (meta-test) is sufficient and immediately actionable without plugin infrastructure.

**Regress-prevention:** The meta-test runs in the normal `bun test` suite. Once clean, any new
file that adds a module-scope `mock.module()` without `afterAll` restore will fail the guard.

**Verdict:** Mechanically enforceable via meta-test. RECOMMENDED as part of the remediation
plan regardless of architecture choice.

### 2c. Option C — Retire the gating apparatus once determinism is restored

**Current apparatus:** `scripts/ci-native-gate-watch.sh`, per-victim exact-prefix tally,
jitter band, absolute baseline tracking. This exists ONLY because `bun test` is non-deterministic
in the single-process mode.

**Retirement condition:** If process-isolation (sharding or per-file) is introduced AND the
mock.module-restore discipline guard is in place AND the GENUINE failures are fixed to 0, then:
- The jitter band becomes meaningless (deterministic = 0 fail every run)
- The per-victim tally becomes unnecessary (no false-positive rate to compensate for)
- The absolute baseline tracking degenerates to "0 is the only acceptable baseline"
- The gate script can be retired in favor of a simple `bun test && exit 0 || exit 1`

**Retirement is conditional** — it cannot happen until both sharding AND genuine-fix work is done.

### 2d. RECOMMENDED ARCHITECTURE: One choice

**Recommendation: Option B first (mock.module-restore guard) + targeted GENUINE-fix batches + Option A (8-shard matrix) as a follow-on.**

**Rationale:**

1. **Sharding (A) has a 36% ceiling** from the probe data — 4 contamination files × ~5 tests.
   The remaining 64% (35 genuine fails) are immune to sharding. Investing in sharding before
   fixing the genuine failures only yields 36% improvement.

2. **The GENUINE class is the dominant problem (87% of files, 64% of fails)** — these are real
   divergences between tests and current production/config. The fix for each sub-class is known
   (see Section 3 below) and does not require architectural change.

3. **mock.module-restore guard (B)** has zero cost, prevents regression immediately, and
   mechanically eliminates the contamination class going forward. It should be the FIRST
   architectural addition.

4. **After B + genuine-fixes bring CI to 0 fail, sharding (A) becomes a performance optimization**
   (faster CI wall clock) rather than a correctness fix. At that point it can be added
   incrementally.

5. **Gate apparatus retirement (C)** follows automatically once 0-fail is stable.

**Implementation order:**
- Phase 1 (NOW): Write `scripts/ci-isolation-probe.sh` + mock.module-restore meta-test skeleton
  + this brief (DOCS-ONLY spike, no test changes)
- Phase 2 (dev-mcp-server): Fix GENUINE classes in dispatch order (Section 3)
- Phase 3 (ops/dev): Add 8-shard matrix to ci.yml once fail=0
- Phase 4 (housekeeping): Retire gating apparatus, archive ci-native-gate-watch.sh

---

## 3. BATCH REMEDIATION PLAN — Per-class tasks

### Class taxonomy for the 55 CI failures (sha 63d53931)

| # | Class | ~Unique test fails | Cure recipe | Owner | Type |
|---|---|---|---|---|---|
| C-TH | TRANSPORT-HANG | ~15 | Drop InMemoryTransport + Client.callTool(); call prod fn or _registeredTools directly with getDb() | dev-mcp-server | REWRITE test |
| C-ML | MOCK-STUB-LEAK | ~10 | Add afterAll restore to contaminating files (1485, FIX-1290, 1792) per arch-S15/S17 | dev-mcp-server | REWRITE test |
| C-MH | MARKET-HOURS-GATE | ~6 | Add now?: Date seam to detectDataFreshnessBreach + frozen in-market clock in tests (arch-S20) | dev-mcp-server | REWRITE test + prod additive |
| C-DV | DELIBERATE-VIOLATION | ~4 | Triage per test: (a) inverted-expect = keep + add .fails() wrapper; (b) missing-module = FIX path; (c) obsolete = REMOVE + sibling | dev-mcp-server | TRIAGE per instance |
| C-CD | CONFIG-DRIFT | ~10 | Update test assertions to match current config state (counts, schema fields, flow content) | dev-mcp-server | REWRITE test |
| C-AL | ASSERTION-LOGIC | ~10 | Triage each: prod bug or stale test; fix prod or rewrite test | dev-mcp-server | TRIAGE per instance |

**Detailed class breakdowns:**

#### C-TH: TRANSPORT-HANG (~15 fails)
Files: MSG-1-market-foreign-flow.test.ts, RAPID-A-get-company-profile-tool.test.ts,
       RAPID-H-insider-lookback.test.ts
Proven cure: arch-S12/S13/S18 — remove InMemoryTransport harness, call prod fn via db injection.
Template: `1134-get-foreign-flow-tool.test.ts` (CI-green, proven 4×).
Batch-able: YES — all three files have db injection seams, no new mock.module().
Prod-correct: REWRITE test (test architectural issue, not prod bug).
Note: In local isolation these files PASS (bun event loop behaves differently on macOS vs ubuntu-
latest). On CI they hit the 5000ms transport timeout. The fix is still the _registeredTools
pattern per arch-S12.

#### C-ML: MOCK-STUB-LEAK (~10 fails)
Files: 1328e-conviction-display.test.ts (10 CI fails — arch-S14/S15)
Contaminators already identified: 1485-telegram-mock-isolation.test.ts (primary, arch-S15),
FIX-1290-briefing-no-stale.test.ts (fourth contaminator, arch-S17), 1792 (second contaminator).
Cure: Add `afterAll` with `_realMod` restore to each contaminating file.
ABSOLUTE rule (C5-ABSOLUTE): do NOT add new `mock.module()` calls anywhere.
Prod-correct: REWRITE test only (no prod change needed).
Also schedule: mock.module-restore meta-test (guard against regression).

#### C-MH: MARKET-HOURS-GATE (~6 fails)
Files: 1407b-sla-market-hours-gate.test.ts (6 genuine fails in isolation)
Root cause: tests assert SLA breach at MARKET_HOURS_ONLY_SOURCES with a static 10-min threshold
but prod uses dynamic off-hours threshold (~493 min when market is closed) — identical pattern
to 1282a (arch-S20 full analysis).
Cure: Add now?: Date injection seam to freshnessSlaChecker.getSlaThreshold() + freeze market-
hours timestamp in 1407b tests.
Prod-correct: Additive prod change (optional param, no behaviour change for prod callers) + test rewrite.

#### C-DV: DELIBERATE-VIOLATION (~4 fails)
Files:
- DWF-is-trading-day.test.ts (DWF-DEV-MCP-1 AC-P0-3-6): KEEP — deliberate-violation test that
  MUST fail (calendar proves it is not a stub). This is correct architecture; test SHOULD fail.
  Verdict: This is a permanent RED test that proves the calendar is real. It should be REMOVED
  from the CI gate (or converted to `expect(...).toFail()` / `expectAssertionCount(0)` pattern)
  since its purpose is to demonstrate the anti-stub property. The test cannot be made green without
  breaking the thing it is testing. RECOMMENDED ACTION: Add `.fails()` Bun test marker OR
  convert to a `describe.skip` with a comment preserving the intent, OR REMOVE.
- 1331a-single-writer-guard.test.ts (TEST-2): Cannot find module `../../../alert-engine/src/
  infrastructure/config`. This is a cross-zone require() that resolves alert-engine, a separate
  service. The module does NOT exist at the path (alert-engine is a different microservice root).
  This test was written for a future feature (single-writer guard in alert-engine). VERDICT: REMOVE
  (the module path will never resolve from apps/mcp-server; the test is structurally broken).
- DWF-coordination-phase2.test.ts (DV-P2-4): 3 failures. Two are genuine GREEN tests that fail
  because ttl_seconds:180 and ttl_seconds:1800 are not present in the current cowork-team flow.
  One is a deliberate-violation that fails because the prod file DOES contain ttl_seconds:180
  (i.e., prod is correct and the DV is stale). VERDICT: The DV is obsolete (remove), the two
  GREEN assertions document a live contract requirement — update flow or remove these tests
  depending on whether the ttl_seconds values are intentionally absent.

#### C-CD: CONFIG-DRIFT (~10 fails)
Files and specific drifts:
- DWF-phase1-cadence.test.ts: expects 14 enabled slots, got 16. `cowork-schedule.json` grew.
  Update test to match actual slot count.
- 230-bootstrap-verify.test.ts: expects "## Step 0-b: Handle Bootstrap Errors" section in all
  7 cowork agent .md files. The developer.md no longer contains this section. Update test or
  restore sections.
- 1349f-integration-observability.test.ts (1349a): expects NO `newsHeadlinesRefresh` key in
  mcp.config.json scheduler section. The key exists in current config. Remove key from config
  or update test intent.
- 1837a-pipeline-state.test.ts: expects `next_action` field in orch-state.json `.head`. The
  field is absent from current head schema. Update test or add field.
- 1190-pipeline-watchdog.test.ts: `schedulerFileCount === 43` but current value is 44. Update
  test constant.
- 1336-named-volume-config.test.ts: expects 8 named volume refs in docker-compose, got 9.
  Update constant.
All CONFIG-DRIFT fixes: REWRITE test (update assertion to match current legitimate config state).
These are NOT prod bugs — config evolved legitimately.

#### C-AL: ASSERTION-LOGIC (~10 fails)
Files that fail in isolation with clear assertion mismatches not explained by other classes:
- 1352a: A-1 Telegram WORK message assertion (1 fail) — likely minor prod output change.
- 1792: 2 fails — conviction debounce DB logic divergence.
- hotfix-vcb-parser.test.ts: 3 fails — magnitude calculation divergence (÷1,000,000 applied
  twice or not at all for equity_total).
- 1100: getCronJobHealthSummary last_run assertion — SQL aggregation mismatch.
- 1879a: FRED_API_KEY missing returns null — test expects immediate null but prod returns
  error after actual HTTP attempt.
- 1503: writeForeignFlowToOhlcv returns 0 changes (update-only) — count mismatch.
- VPT-1: stale push → stale=true threshold logic divergence.
- TRUST-RED: DT-2 finalize gate returns PARTIAL not DONE — prod refine_status changed.
- 1343e: BCTC pipeline populates bctc_vps_queue — count or logic mismatch.
- bctc-eval-routes: handleBctcEvalRecompute expects [200, 503] but got 500 — route changed.
- 1549: vps watchdog message content changed (vn-price-fetch mention).
- 1416b: VNM split-block totalAssets regression.
- HC-human-confirm (DV-HC-8): finalize_bctc_refine corrected-row invariant divergence.
- FIX-PDF-VOLUME-SBV-TABLE (Bug 1): index.ts no longer has mkdirSync for pdfDir.
- newsHeadlinesRefreshJob e2e: AC1-4/AC5 — test assumes mocked fetch behaviour changed.

Each C-AL file needs individual prod-vs-test triage. The triage protocol is:
1. Read the exact assertion + received value.
2. Check if production code changed since the test was written (git log --follow).
3. If prod changed intentionally → REWRITE test. If prod regressed → FIX prod.

---

## 4. DISPATCH ORDER — Biggest deterministic win first

**Projected trajectory: 55 → ? per class batch**

| Batch | Class | Files | Projected -fails | After |
|---|---|---|---|---|
| Batch 0 | C-DV cleanup (REMOVE + .fails() conversions) | 3 | -4 | ~51 |
| Batch 1 | C-TH TRANSPORT-HANG rewrite | 3 | -15 | ~36 |
| Batch 2 | C-ML MOCK-STUB-LEAK afterAll restore | ~3 contaminators | -10 | ~26 |
| Batch 3 | C-MH MARKET-HOURS-GATE now-seam | 1 | -6 | ~20 |
| Batch 4 | C-CD CONFIG-DRIFT assertion updates | ~6 | -10 | ~10 |
| Batch 5 | C-AL ASSERTION-LOGIC triage + fix | ~14 | -10 | ~0 |

**Dispatch rationale:**
- Batch 0 first: DV removals/conversions have zero blast radius and unblock CI counting (DV
  tests that MUST fail inflate the fail count permanently; converting to `.fails()` or removing
  them stops that).
- Batches 1+2 before 3+4: contamination and transport-hang fixes are structural (architectural
  changes to the test harness, zero prod risk) — safest to batch first.
- Batch 3 requires 1 additive prod change (now? seam) — slightly higher blast radius, defer.
- Batches 4+5 are assertion updates — medium blast radius, defer to late.

**mock.module-restore meta-test:** Add in Batch 2 as part of C-ML cleanup. It becomes the
regression guard for all future C-ML fixes.

---

## 5. ISOLATION PROBE SCRIPT

The reusable probe script is at `scripts/ci-isolation-probe.sh`. It:
1. Accepts a whitespace-separated list of test NAMES (or "all" to probe all files in the fail list)
2. Maps test names to files via grep
3. Runs each file alone: `cd apps/mcp-server && bun test src/__tests__/<file>`
4. Captures pass/fail per file, buckets into CONTAMINATION vs GENUINE
5. Outputs a machine-readable JSON result to stdout

Usage (see script header for full CLI reference):
```bash
./scripts/ci-isolation-probe.sh                     # probes all 56 known-fail files
./scripts/ci-isolation-probe.sh MSG-1 RAPID-A       # probes named files only
./scripts/ci-isolation-probe.sh --output=probe.json # write JSON result to file
```

**HOST-SAFETY:** Script explicitly bans full-suite invocation (`bun test` without a file arg).
Only single-file `bun test src/__tests__/<file>` calls are issued.

---

## 6. Scope of this SPIKE commit

- `docs/architecture-briefs/2026-06-09-testing-ci-architecture-rethink.md` (this file)
- `scripts/ci-isolation-probe.sh` (new reusable script)
- `docs/policies/dev-standards.md` (pointer added under Script Persistence section)
- `docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-architect.md` (DJ-GATE-1 arch-S21)

Zero changes to `apps/` (no prod or test code changes in this spike).

---

## 7. BUILD-STANDARD

**Classification:** BUG-FIX / MAINTENANCE (in-zone, no new primitives)
BUILD-STANDARD: not-applicable (skip)

---

## Phase 2 — Deterministic Test Isolation (2026-06-09)

**Authored:** architect · arch-S24 · 2026-06-09T18:48Z (TUESDAY)
**Sprint:** CI-RED-RECONCILE
**Trigger:** New empirical evidence (BATCH3 order-reshuffle experiment + confirmed contamination
victims: 1146, 1110, 1400, 030, 293, 1875c) proves contamination VARIANCE is the gating factor
and must be eliminated DETERMINISTICALLY.
**Recurring-bug rule:** contamination has now reshuffled 22× across batches (transport-hang
cured 4×, mock.module() contamination chain persisting across 22 identified victims). This
exceeds the 2-commit threshold. This IS the architectural intervention mandated by the
recurring-bug escalation policy.

---

### P2-1. Hard Evidence Driving This Phase

The following facts are empirically confirmed and must be the foundation of the design:

**Shared-process leak surfaces (all four active in bun 1.3.13 single-process run):**

| Surface | Mechanism | Confirmed leak example |
|---|---|---|
| ESM/mock.module registry | `mock.module("./foo.js", stub)` is process-global; no file-scope teardown unless explicitly restored in `afterAll` | 1485→047→1328e chain; C5 stub surviving to 22 victim positions |
| Bun.env object | File-top `Bun.env["KEY"] = value` without afterAll restore contaminates all later files | 1406a sets `VPS_PUSH_API_KEY` with no restore; 082 `delete Bun.env["DB_PATH"]` without restore guard; 1400 DB-isolation 2 fails |
| toolRegistry singleton | `toolRegistry.forEach(fn => fn(server))` in beforeAll is not torn down; mutated `_registeredTools` map on the McpServer instance leaks state if the server is not closed+re-created | 1875c `record_signal_outcome` routing (1 fail in suite only) |
| DB-path / in-memory DB | `Bun.env["DB_PATH"] = ":memory:"` re-set inside tests (1551, 1980, 1406a, 1803, 1392, 1434, 1945b, 082, etc.) without afterAll restore; for files that ALSO delete DB_PATH (082 line 73), the singleton `_db` is invalidated for all downstream files | 1400-db-isolation 2 fails; confirmed by arch-S4/S6/S7 singleton-killer pattern |

**BATCH3 order-reshuffle proof (the critical new evidence):**
BATCH3 was a test-only frozen-clock change to 1407b (zero prod change). It cured its target
6 genuine 1407b market-hours fails (confirmed 0 markers). Yet the absolute moved 40 → 55 fail
on the same 11802 tests. The +15 delta is NOT new genuine failures: it is 22 DIFFERENT
contamination victims exposed by the new file execution order. This proves:

1. The `/goal Stop hook` reads the LIVE native absolute, which jitters ±15 per run from ordering.
2. Class-by-class GENUINE fixes (BATCH0–5) are necessary but CANNOT converge the gate alone.
3. Even after every genuine test-vs-prod divergence is fixed to 0, contamination ordering can
   leave 20+ red. The gate will oscillate and never reach a stable 0.
4. BATCH3 is the empirical disproof of the Phase-1 claim that "contamination is only 13%":
   the 13% was a snapshot of ONE ordering. Under a different ordering, contamination victims
   expand to at least 22 distinct test files.

**BATCH2 meta-guard result:**
The BATCH2 lint meta-test (every `mock.module()` must have a matching `afterAll` restore) PASSED
with 0 violations — yet contamination persists at 55 fail. This proves `mock.module()` is NOT
the only leak surface. The meta-guard addresses exactly 1 of 4 surfaces. The other 3 (Bun.env,
toolRegistry, DB-path) have no enforcement gate today.

---

### P2-2. Rigorous Option Analysis

#### Option A — Per-File Process Isolation (one bun process per test file)

**Mechanism:** A CI runner script invokes `bun test <single-file>` for each of the 1035 test
files, with parallelism via `xargs -P N` or a GitHub Actions matrix shard strategy that
assigns disjoint file lists to each shard. Each invocation is a fresh OS process with:
- a clean Bun ESM module cache (no `mock.module()` state carries over)
- a fresh `Bun.env` process environment (no cross-file mutation)
- a fresh toolRegistry (module-scope singletons are re-initialized from scratch)
- a fresh SQLite `:memory:` DB (setup.ts preload re-runs per-process)

**Contamination elimination:**
Process isolation makes cross-file contamination structurally impossible. Every confirmed
contamination victim (1146, 1110, 1400, 030, 293, 1875c, 1328e chain) passes alone in
isolation-probe. With per-file process isolation, "alone" IS the CI execution context.
The contamination absolute drops to exactly 0, deterministically, regardless of file order.

**Wall-clock cost analysis (1035 files, current full-suite ~130s):**

The bottleneck is process spawn overhead per file, not test execution time:
- Bun process startup cost on ubuntu-latest: ~150–250ms per process (cold; warm via cache: ~80ms)
- At 1035 files × 200ms/spawn = ~207s of pure spawn overhead (sequential)
- With parallelism of P=16 (16 concurrent processes): ~207s / 16 ≈ 13s spawn overhead
- Actual test body execution: median file ~80ms, long tail (PDF/e2e) ~2000ms
- Estimated wall clock at P=16: max(spawn_overhead_per_slot, test_body) per slot
  = roughly 65 files per shard × ~250ms median test time + spawn = ~20s per shard at P=16
- **Total wall-clock estimate at P=16: ~20–25s** (well within 15min CI budget)
- GHA minutes cost: 16 parallel jobs × ~20s ≈ 5.3 GHA minutes (vs current 1 job × ~3min = 3min)
  Overhead is ~2× in GHA minutes, acceptable for a free/small account. Not 8×.

**Parallelism strategy: P=16 via xargs in a single CI job (not matrix):**
A matrix of 1035 jobs is not viable. The correct approach is a SINGLE CI job that runs a
parallel-dispatch script `scripts/ci-per-file-isolation.sh` internally:

```bash
# scripts/ci-per-file-isolation.sh
# Runs every test file in its own bun process, up to P parallel.
# Aggregates pass/skip/fail into a single summary.
# Usage: cd apps/mcp-server && bash ../../scripts/ci-per-file-isolation.sh [P=16]

P=${1:-16}
TESTDIR="src/__tests__"
RESULT_DIR=$(mktemp -d)
export -f run_one_file  # see full script spec in P2-4

find "$TESTDIR" -name "*.test.ts" | \
  xargs -P "$P" -I{} bash -c 'run_one_file "$@"' _ {}

# Aggregate: sum pass/skip/fail from per-file JSON result files
jq -s '{
  pass: [.[].pass] | add,
  skip: [.[].skip] | add,
  fail: [.[].fail] | add,
  files_failed: [.[] | select(.fail > 0) | .file]
}' "$RESULT_DIR"/*.json
```

**Result aggregation and /goal Stop hook compatibility:**
The `/goal Stop hook` reads the LIVE native absolute from the CI run summary. With per-file
isolation, the runner script emits a synthetic summary line in the same format bun test uses:
```
  X pass / Y skip / Z fail
```
This synthetic line is written to `$GITHUB_STEP_SUMMARY` and also to a JSON file consumed by
any gate script. The `/goal Stop hook` reads the native summary — the runner script must
produce an identical format. The `ci-native-gate-watch.sh` baseline becomes the runner's
aggregated Z (fail count), which is now ORDER-INDEPENDENT and deterministic.

**Failure attribution:** Each per-file invocation writes `$RESULT_DIR/<file-slug>.json` with
pass/skip/fail counts + the raw bun test stderr for that file. Failures are attributed to their
exact source file. No ordering ambiguity.

**Flaky-retry policy:** For files that fail in isolation (GENUINE), no retry is needed — they
fail consistently. For files that WOULD have been contamination victims, they pass in isolation
→ no retry needed. If a file exhibits flakiness even in isolation (true flakiness, not
contamination), a single retry (`bun test <file>` once more on fail) is acceptable. This is
NOT implemented in the first version — the scope is determinism, not flakiness.

**Does Option A conflict with BATCH0–5?**
No. BATCH0–5 fix GENUINE failures (tests that fail even in isolation). Option A eliminates
CONTAMINATION failures (tests that pass in isolation, fail in suite). These are orthogonal:
- BATCH0–5 running first: reduces genuine absolute from ~35 to ~0. Option A then confirms 0.
- Option A running first: confirms contamination is 0 in isolation; genuine failures remain
  and are fixed by BATCH0–5. Option A does not interfere with genuine-fix batches.
- Running them in parallel: fully safe — BATCH0–5 change test files, Option A only changes
  the CI runner script and workflow YAML; no file-level conflict.

**Risks and mitigations:**
- Risk 1: `xargs -P` on ubuntu-latest has a per-process file-descriptor limit. Mitigation:
  `ulimit -n 65536` at the script top; bun per-file uses ~50 FDs maximum.
- Risk 2: Some test files import from `setup.ts` preload by side-effect. Per-process run
  re-evaluates `bunfig.toml preload = ["./src/__tests__/setup.ts"]` for each file.
  Mitigation: None needed — bunfig preload runs per-process automatically.
- Risk 3: Files that write to `/tmp/test_stock_price.db` (setup.ts line 59) will collide
  across parallel processes. Mitigation: runner script exports a unique `STOCK_PRICE_DB_PATH`
  per invocation: `STOCK_PRICE_DB_PATH=/tmp/test_stock_price_$$.db bun test <file>`.
- Risk 4: Wall-clock estimate assumes ~80ms median. E2E tests (newsHeadlinesRefreshJob.e2e)
  may take longer. Mitigation: e2e tests are excluded from the parallel run or given their
  own shard slot with a higher timeout.

#### Option B — Comprehensive Global-State-Reset Harness (preload + afterEach/afterAll)

**Mechanism:** A shared Bun preload file (extending `setup.ts` or a separate
`setup-isolation.ts`) that, after each test FILE completes, restores all 4 leak surfaces to
their pre-file state. Implementation would require:

**Surface 1 — mock.module registry:**
Bun 1.3.13 does not expose a public API to list all currently-mocked modules or bulk-restore
them. `mock.restore()` restores `mock.fn()` spy wrappers but does NOT restore `mock.module()`
registry entries. The only reliable restore is per-module: `afterAll(() => mock.module("./foo.js",
() => realImport))`. A harness cannot enumerate which modules were `mock.module()`-d by an
arbitrary file without AST-parsing that file. The meta-guard (BATCH2 lint test) already covers
this at authoring time — but it is a lint gate, not a runtime reset.

**Enforcement gap:** The meta-guard PASSED with 0 violations and contamination STILL persisted.
This means either: (a) some `mock.module()` calls are inside `it()` bodies (not module-scope)
and the meta-guard's `^mock\.module\(/m` regex missed them, OR (b) files use indirect module
mutation patterns (e.g. reassigning an exported let variable) that are not `mock.module()`.
A preload harness that only resets `mock.module()` surface would inherit the same blind spots.

**Surface 2 — Bun.env mutation:**
A snapshot-and-restore harness IS technically feasible for Bun.env:
```typescript
// In preload afterEach (file-level, not test-level):
const envSnapshot = { ...Bun.env };
afterEach(() => {
  for (const key of Object.keys(Bun.env)) {
    if (!(key in envSnapshot)) delete Bun.env[key];
    else Bun.env[key] = envSnapshot[key];
  }
  for (const key of Object.keys(envSnapshot)) {
    if (!(key in Bun.env)) Bun.env[key] = envSnapshot[key];
  }
});
```
But: Bun's preload `afterEach` runs after each `it()`, not after each FILE. A file-level
reset requires hooking into bun's file-boundary lifecycle, which Bun 1.3.13 does NOT expose
in preload. The only hook available in preload is `afterEach` (test-level) and `afterAll`
(describe-level). A file-level `afterAll` in preload would be an `afterAll` at the implicit
top-level describe of each file — which Bun MAY or MAY NOT execute between files vs at process
end (bun 1.3.13 behavior: top-level `afterAll` in preload fires once at PROCESS END, not after
each file). **This surface cannot be reliably reset via preload in bun 1.3.13.**

**Surface 3 — toolRegistry singleton:**
`toolRegistry` is a static array exported from `registry.ts`. Re-importing it in a preload
afterAll returns the same module-cache instance (ESM singleton). The only reset is to add a
`resetForTest()` exported function to `registry.ts` that clears the array, then call it from
a per-file afterAll. But: (a) this requires a production-code change to `registry.ts`;
(b) individual test files that import and use toolRegistry in `beforeAll` would need explicit
coordination with the harness; (c) the McpServer `_registeredTools` map is on a server
instance, not the registry — the server instance is created per-test-file in `beforeAll`;
teardown requires that same `beforeAll` to close the server in `afterAll`. A harness cannot
enforce this without file-level cooperation.

**Surface 4 — DB-path / in-memory DB:**
`Bun.env["DB_PATH"] = ":memory:"` is set in setup.ts preload (already done). The schema.ts
singleton `_db` can be reset via `closeDb()` if called in afterAll. But enforcing this from
preload hits the same bun 1.3.13 file-boundary gap: top-level `afterAll` in preload fires at
process end. Individual files calling `closeDb()` without `afterAll(() => initDatabase())` is
the known singleton-killer pattern (arch-S7): the fix is per-file, not harness-wide.

**Completeness verdict:**
Option B cannot be made reliably complete for bun 1.3.13 single-process execution because:
1. mock.module registry has no bulk-restore API
2. Bun.env file-boundary reset has no lifecycle hook
3. toolRegistry/McpServer instance teardown requires per-file cooperation
4. DB singleton reset requires per-file `afterAll` that harness cannot inject

A harness that covers 2/4 surfaces is better than 1/4 (the current state) but leaves 2
surfaces open, meaning contamination can still escape. The BATCH2 meta-guard result (0 violations
but contamination persists) is the empirical proof that partial coverage fails as a gating mechanism.

**Cost comparison vs Option A:**
- Option B implementation: ~400–600 lines of preload + per-surface enforcement across 1035 files
  (enforced via meta-tests, not automatic). Ongoing: every new test file must comply with all
  4 surface rules. Audit and enforcement burden is permanent.
- Option A implementation: ~120-line runner script + 8-line CI workflow change. Ongoing: zero
  per-file discipline required (isolation is structural, not convention-based).

---

### P2-3. RECOMMENDATION: Option A (per-file process isolation) — STAGED

**Stage 1 (immediate, concurrent with BATCH0–5):** Implement `scripts/ci-per-file-isolation.sh`
and update `.github/workflows/ci.yml` to use it. This eliminates contamination variance from
the gate counter while BATCH0–5 genuine fixes proceed in parallel. The two workstreams are
independent and non-conflicting.

**Stage 2 (after BATCH0–5 bring genuine absolute to ~0):** Retire `scripts/ci-native-gate-watch.sh`
and the jitter-band apparatus. The per-file isolation runner's aggregated fail count IS the gate:
0 = green, >0 = red, deterministic across any number of consecutive runs on the same SHA.

**Stage 3 (optional, post-stable-0):** Retire the BATCH2 mock.module-restore meta-test as a
gate (keep it as a lint warning). It is no longer the primary contamination prevention mechanism
— process isolation is. The meta-test can remain as documentation-in-code.

**Rationale for choosing A over B:**

1. **B is not reliably complete for bun 1.3.13.** The lifecycle API gaps (no file-boundary
   afterAll in preload, no bulk mock.module restore) make a comprehensive harness structurally
   impossible without either changing bun or instrumenting every file individually. Option A
   achieves determinism without any per-file instrumentation.

2. **Contamination VARIANCE is the gating factor, not contamination RATE.** The BATCH3 proof
   shows that even a small pool of contaminating files (≤22) can reshuffle to expose a +15
   absolute swing on a single test-only commit. The gate cannot converge if the contamination
   count is variable. Option A eliminates variance to exactly 0, unconditionally.

3. **Option A composes cleanly with BATCH0–5.** Process isolation is purely a runner change.
   It does not touch test files or production code. BATCH0–5 proceed as planned; Option A
   becomes the permanent architectural floor under them.

4. **Recurring-bug rule applies.** This is the architectural intervention: the contamination
   class has recurred 22× across batches. Convention-based fixes (meta-guards, per-file
   afterAll additions) have failed repeatedly. Structural isolation is the definitive cure.

5. **Wall-clock cost is acceptable.** P=16 parallel processes: ~20–25s wall clock, ~5.3 GHA
   minutes vs ~3min current = 1.8× overhead, well within a 15min timeout budget.

---

### P2-4. Implementation Plan

#### Files to create/modify

| File | Action | Owner | Purpose |
|---|---|---|---|
| `scripts/ci-per-file-isolation.sh` | CREATE | dev-mcp-server | Per-file isolation runner: finds all `*.test.ts`, runs each via `bun test <file>`, P=16 parallel, aggregates JSON result + bun-format summary line |
| `.github/workflows/ci.yml` | MODIFY | ops | Replace `run: bun test` in `test` job with `run: bash ../../scripts/ci-per-file-isolation.sh` (working-directory: apps/mcp-server); ensure `$GITHUB_STEP_SUMMARY` line is in bun-native format |
| `apps/mcp-server/src/__tests__/setup.ts` | MODIFY | dev-mcp-server | Add `STOCK_PRICE_DB_PATH` uniqueness: read from env if set (allows runner script to inject `STOCK_PRICE_DB_PATH=/tmp/test_stock_price_$$.db` per-invocation); fallback to existing `/tmp/test_stock_price.db` for direct `bun test` invocations |
| `docs/policies/dev-standards.md` | MODIFY | dev-mcp-server | Add pointer: `scripts/ci-per-file-isolation.sh` under Script Persistence section |

#### `scripts/ci-per-file-isolation.sh` — Full spec

```bash
#!/usr/bin/env bash
# ci-per-file-isolation.sh — per-file process isolation runner for bun test
# Usage: cd apps/mcp-server && bash ../../scripts/ci-per-file-isolation.sh [P]
# P = parallelism (default 16)
# Outputs: aggregated pass/skip/fail to stdout + $GITHUB_STEP_SUMMARY (if set)
# Per-file results: /tmp/ci-isolation-<PID>/<file-slug>.json
# Host-safety: NEVER runs bare `bun test` (no file arg) — only per-file invocations

set -euo pipefail
P=${1:-16}
TESTDIR="src/__tests__"
RESULT_DIR="/tmp/ci-isolation-$$"
mkdir -p "$RESULT_DIR"

run_one_file() {
  local f="$1"
  local slug
  slug=$(echo "$f" | tr '/' '-' | tr '.' '-')
  local out_file="$RESULT_DIR/${slug}.json"
  local unique_db="/tmp/test_stock_price_$$.db"

  # Run bun test for this single file, capture output
  local raw
  if STOCK_PRICE_DB_PATH="$unique_db" bun test "$f" > "/tmp/ci-iso-out-$$.txt" 2>&1; then
    local rc=0
  else
    local rc=$?
  fi

  # Parse bun native summary line: "  N pass / N skip / N fail"
  local pass skip fail
  pass=$(grep -E "^[[:space:]]*[0-9]+ pass" "/tmp/ci-iso-out-$$.txt" | \
         grep -oE "[0-9]+ pass" | grep -oE "^[0-9]+" || echo 0)
  skip=$(grep -E "skip" "/tmp/ci-iso-out-$$.txt" | \
         grep -oE "[0-9]+ skip" | grep -oE "^[0-9]+" || echo 0)
  fail=$(grep -E "fail" "/tmp/ci-iso-out-$$.txt" | \
         grep -oE "[0-9]+ fail" | grep -oE "^[0-9]+" | tail -1 || echo 0)

  # Write per-file JSON result
  printf '{"file":"%s","pass":%s,"skip":%s,"fail":%s,"rc":%s}\n' \
    "$f" "${pass:-0}" "${skip:-0}" "${fail:-0}" "$rc" > "$out_file"

  # If failed, preserve output for attribution
  if [ "$rc" -ne 0 ]; then
    cp "/tmp/ci-iso-out-$$.txt" "$RESULT_DIR/${slug}.log"
  fi
  rm -f "/tmp/ci-iso-out-$$.txt" "$unique_db"
}
export -f run_one_file
export RESULT_DIR

# Find all test files, run in parallel
find "$TESTDIR" -name "*.test.ts" | \
  xargs -P "$P" -I{} bash -c 'run_one_file "$@"' _ {}

# Aggregate results
TOTAL_PASS=0; TOTAL_SKIP=0; TOTAL_FAIL=0; FAILED_FILES=()
for f in "$RESULT_DIR"/*.json; do
  p=$(jq -r '.pass' "$f"); s=$(jq -r '.skip' "$f"); fl=$(jq -r '.fail' "$f")
  TOTAL_PASS=$((TOTAL_PASS + p))
  TOTAL_SKIP=$((TOTAL_SKIP + s))
  TOTAL_FAIL=$((TOTAL_FAIL + fl))
  if [ "$fl" -gt 0 ]; then
    FAILED_FILES+=("$(jq -r '.file' "$f")")
  fi
done

SUMMARY="  ${TOTAL_PASS} pass / ${TOTAL_SKIP} skip / ${TOTAL_FAIL} fail"
echo "$SUMMARY"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "## Test Results (per-file isolation)" >> "$GITHUB_STEP_SUMMARY"
  echo "$SUMMARY" >> "$GITHUB_STEP_SUMMARY"
  if [ "${#FAILED_FILES[@]}" -gt 0 ]; then
    echo "### Failed files:" >> "$GITHUB_STEP_SUMMARY"
    printf -- '- %s\n' "${FAILED_FILES[@]}" >> "$GITHUB_STEP_SUMMARY"
  fi
fi

rm -rf "$RESULT_DIR"
[ "$TOTAL_FAIL" -eq 0 ]  # exit 1 if any failures
```

#### `.github/workflows/ci.yml` — diff sketch

```diff
-      - name: Run tests
-        run: bun test
+      - name: Run tests (per-file isolation)
+        run: bash ../../scripts/ci-per-file-isolation.sh 16
 
-      - name: Report test summary
-        if: always()
-        run: |
-          echo "## Test Results" >> "$GITHUB_STEP_SUMMARY"
-          bun test 2>&1 | grep -E "^[[:space:]]*[0-9]+ (pass|fail)" | tail -3 >> "$GITHUB_STEP_SUMMARY" || true
+      # Summary is now written by ci-per-file-isolation.sh directly to $GITHUB_STEP_SUMMARY
+      # No second bun test invocation needed
```

Note: The `Report test summary` step runs `bun test` a SECOND TIME (full re-run). With per-file
isolation as the primary runner, this second invocation must be REMOVED to avoid 2× CI time
and a non-isolated aggregate run polluting the summary.

---

### P2-5. Acceptance Criteria

The gate is considered DETERMINISTIC when:

1. **AC-1 (contamination = 0):** Running `scripts/ci-per-file-isolation.sh` on SHA X produces
   the same `fail` count on 3 consecutive local runs with no code change between runs.
   Tolerance: exactly 0 variance (not ±N). Any difference between run 1, 2, 3 = FAIL.

2. **AC-2 (genuine fails stable):** The aggregated `fail` count equals the count of files
   that fail in direct `bun test <file>` isolation-probe. No additional failures from ordering.

3. **AC-3 (CI gate converges):** After BATCH0–5 bring the genuine absolute to 0, three
   consecutive CI runs on the same SHA all report `0 fail`. The `/goal Stop hook` absolute
   is stable. No jitter band is needed.

4. **AC-4 (attribution complete):** For every CI failure, the per-file log in
   `$RESULT_DIR/<slug>.log` contains the exact bun test error output attributing the failure
   to a specific `it()` block in a specific file. No "which file caused this?" ambiguity.

5. **AC-5 (no foreign contamination):** `git show --name-only <commit>` for the
   `ci-per-file-isolation.sh` commit contains ONLY: `scripts/ci-per-file-isolation.sh`,
   `.github/workflows/ci.yml`, `apps/mcp-server/src/__tests__/setup.ts` (if modified),
   `docs/policies/dev-standards.md`. No test files, no production source files.

---

### P2-6. Composition with Running BATCH0–5

| Batch | Genuine fails targeted | Interaction with Option A |
|---|---|---|
| BATCH0 | C-DV: 4 fails (remove/convert) | None — process isolation doesn't affect DV test behavior |
| BATCH1 | C-TH: ~15 fails (InMemoryTransport rewrite) | None — these fail in isolation too (on ubuntu CI); Option A runs them in isolation so their genuine fail still counts |
| BATCH2 | C-ML: ~10 fails (mock.module afterAll restore) | Positive synergy: Option A eliminates contamination-only failures; BATCH2 eliminates the contaminating files themselves. Both can run in parallel. |
| BATCH3 | C-MH: ~6 fails (now-seam for market-hours gate) | None |
| BATCH4 | C-CD: ~10 fails (config-drift assertion updates) | None |
| BATCH5 | C-AL: ~10 fails (assertion-logic triage) | None |

The two workstreams share zero file-level conflict. Option A changes only the runner and CI
workflow. BATCH0–5 change test and production source files. They can be developed and merged
independently on `main` (per NO-BRANCHES policy).

---

### P2-7. Implementation Owners

| Deliverable | Owner | Type |
|---|---|---|
| `scripts/ci-per-file-isolation.sh` | dev-mcp-server | New script (test infrastructure) |
| `.github/workflows/ci.yml` modification | ops | CI workflow change |
| `apps/mcp-server/src/__tests__/setup.ts` `STOCK_PRICE_DB_PATH` env-passthrough | dev-mcp-server | Test infrastructure, 2-line change |
| `docs/policies/dev-standards.md` pointer | dev-mcp-server | Docs, 1 line |
| `scripts/ci-native-gate-watch.sh` retirement (Stage 2) | ops | Cleanup, after gate stable |

**PM task decomposition recommendation:** Two tasks:
- `IMPL-CI-PER-FILE-ISOLATION` (dev-mcp-server + ops, timebox 60min): script + workflow YAML + setup.ts patch
- `RETIRE-CI-GATE-APPARATUS` (ops, timebox 30min, BLOCKED until genuine=0): retire ci-native-gate-watch.sh
