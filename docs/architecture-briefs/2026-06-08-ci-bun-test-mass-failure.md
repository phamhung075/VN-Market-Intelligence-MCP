# Architecture Brief: CI bun-test Mass Failure Root-Cause SPIKE

**Date:** 2026-06-08
**Author:** agents-architect
**Status:** READY-FOR-IMPLEMENTATION
**Task:** CI-TEST-ISOLATION-SPIKE
**Sprint:** CI-RED-RECONCILE
**Zone:** apps/mcp-server/

---

## DJ-GATE-1 — Decision Journal

**task-id:** CI-TEST-ISOLATION-SPIKE
**decision:** MULTI-CLASS failure: the 639 CI failures are NOT one systemic cascade but three distinct, independent failure classes (see §3). Class A (infrastructure mismatch) is the largest and highest-leverage fix. Class B (real code bugs not yet implemented) is the second largest. Class C (network timeout isolation) is bounded and already has prior art. Recommended task title: **CI-BUN-TEST-MULTI-CLASS-FIX** (not REGRESSION — CI has never been green in the 200-run history; this is accumulated debt, not a regression event).
**rationale:** Full-log analysis of CI job 80171150187 (639 fail, 33 skip), cross-checked against local isolated runs, reveals bimodal timing (1ms vs 5000ms), distinct assertion error patterns, and a local Bun crash that rules out a single shared bootstrap failure. The classification below is evidence-first with specific failing tests mapped to each class.
**alternatives-rejected:** (1) "Single systemic cascade from shared beforeAll / global DB-init" — refuted by the fact that unrelated tests pass within the same full run (DV-FU6F-B3-1/2/3, Task 1241 geopolitical keywords, Task 242 SBV Circular, >350 other passing tests). (2) "Inverted assertions / green/red swap" — refuted by assertion errors showing Received: null vs Expected: non-null or Expected: 1 Received: 0 across unrelated domains. (3) "All 639 are network-blocked" — refuted by 1ms failures which are pure in-process assertion errors with no network call.
**risk:** Class B (code-not-implemented) may require PO scoping decisions on which tests to retire vs implement. Class A fix complexity depends on whether macroTools.ts is migrated back to injectable or the tests are rewritten against the HTTP seam.

---

## 1. Problem Statement

CI job `bun test` in `.github/workflows/ci.yml` reports **639 tests failed, 33 skipped** on every push to main. The failure has **never been green** in the last 200 CI runs (2026-05-11 to 2026-06-08). The earliest available run (2026-05-11, job 75298920640) showed 703 failures — the count has slightly decreased over the sprint period as point-fixes landed. This is accumulated test debt, not a triggered regression.

The earlier estimate of "~40 failures (network/timer/DB-isolation)" was a sampled undercount based on a subset of failing test names. Raw count is 639.

---

## 2. Evidence Base

| Source | Finding |
|---|---|
| CI job 80171150187 (2026-06-08T18:48Z) | 639 fail, 33 skip, many pass (bimodal timing) |
| CI job 75298920640 (2026-05-11T06:33Z) | 703 fail — same test files failing in first available run |
| `gh run list` last 200 runs | 0 successes — CI has never been green |
| Local `bun test 028-sbv-rates.test.ts` | 14 pass, 0 fail — test isolation works per-file |
| Local `bun test 1423f-deposit-rate-display.test.ts` | 0 pass, 3 fail — same failure locally AND in CI |
| Local `bun test` (full suite) | Bun crash — OOM/RSS 1.69GB peak, C++ exception in bun v1.3.13 |
| `apps/mcp-server/bunfig.toml` | `preload = ["./src/__tests__/setup.ts"]`; `timeout = 30000`; `coverage = true` |
| `setup.ts` | Sets `DB_PATH=:memory:`, `STOCK_PRICE_DB_PATH=/tmp/test_stock_price.db`, creates data/ subdirs |
| `ci.yml` | No `env:` section — zero SBV/network env vars injected |

---

## 3. Root-Cause Classification: THREE Independent Classes

### Class A — Test/Implementation Mismatch (injectable seam removed)

**Volume estimate:** ~80–150 failures (macroTools-dependent tests + downstream callers)
**Bimodal timing:** 1–3ms (immediate assertion failure, no I/O)

**Root cause:** `get_macro_snapshot` tool in `macroTools.ts` was refactored to a pure HTTP proxy routing to the Go `macro-indicators` microservice at port 5004. The tool schema now accepts only `_params?: Record<string, unknown>`. However, tests written before or during the refactor (e.g., `1423f-deposit-rate-display.test.ts`, `Task 1426c`, `Task 1423f`) pass `_testCommodityClient` and `_testSbvClient` injectable parameters which the tool **completely ignores** — it just forwards `_params` to `${baseUrl}/snapshot`.

In CI: no Go macro-indicators service runs → `fetch()` throws/returns error → tool returns `{error: "macro-indicators service unavailable"}`. The test then calls `expect(text).toContain("Max Deposit Rate:")` on an error JSON string → fail.

In local dev: the Go service IS running locally → tool returns live snapshot data that also doesn't contain "Max Deposit Rate:" in the expected format → same failure locally.

**Evidence:** Local run of `1423f-deposit-rate-display.test.ts` fails with:
```
Received: "{\"source_tier\":2,\"text\":\"...live vnIndex/oilUsd/goldUsd...\",\"fetchedAt\":\"...\"}"
Expected to contain: "Max Deposit Rate:  0.00%"
```
The received string is a live Go service response, not the formatted SBV output the test expects.

**Related failures using same pattern:** Task 1426c (DinhGia integration via `get_macro_snapshot`), Task 028 (`028-sbv-rates.test.ts` — see §3.1 sub-analysis), Task 1352a (macroIndicatorRefreshJob using macroTools HTTP path).

#### §3.1 Sub-analysis: 028-sbv-rates.test.ts CI-only failure

`028-sbv-rates.test.ts` passes locally (14/14) but fails in CI. The test calls `fetchSbvRates(mockClient)` directly, bypassing the tool layer. The ONLY null-return path is `!fxFetchSucceeded && overnightRatePct === 0 && refinancingRatePct === 0`.

**Probable cause:** Module-level constants `DEFAULT_OVERNIGHT_RATE` and `DEFAULT_REFINANCING_RATE` in `sbv.ts` are computed once at import time via `parseFloat(Bun.env["SBV_OVERNIGHT_RATE"] || "3.0")`. In CI's full-suite run, the module load order is not guaranteed. If a test file that mutates `Bun.env` (e.g., `FU-EI-P2-COV-env-check-coverage.test.ts` which deletes `REQUIRED_ENV_VARS`) loads `sbv.ts` during its import chain AFTER deleting all env vars, AND if an as-yet-untraced test sets `SBV_OVERNIGHT_RATE=""` or `SBV_OVERNIGHT_RATE=0` before sbv.ts is first imported, the defaults would bake in as 0. More investigation needed in the fix sprint (check: add `console.log(DEFAULT_OVERNIGHT_RATE, DEFAULT_REFINANCING_RATE)` to sbv.ts init, observe CI log).

**Alternate cause:** cheerio@1.2.0 pulls in `undici@7.x` as a transitive dep. Undici 7 uses native WASM/N-API bindings. If Bun 1.3.13 on Ubuntu 24.04 has a native module compatibility issue with undici@7 when >N test files have loaded the module (memory pressure), `cheerio.load()` may throw inside the try-catch block, making `fxFetchSucceeded = false`. If simultaneously the DEFAULT rates happen to be 0 (from env mutation), null is returned.

**Fix approach:** Decouple `DEFAULT_OVERNIGHT_RATE` et al from module-level constants — move them inside `fetchSbvRates()` so they re-read `Bun.env` at call time, not at import time. This is a one-line move per constant and is safe (function is stateless).

### Class B — Real Code Not Yet Implemented (RED tests as living spec)

**Volume estimate:** ~300–400 failures
**Bimodal timing:** 1ms (pure assertion, no I/O — feature not yet written)

**Root cause:** A significant fraction of the 639 failures are tests for features that exist as specifications but whose implementation was either never completed or was removed/refactored and the test not updated. These represent "RED tests as living spec" — intentional RED in TDD workflow.

**Evidence patterns:**
- `Task 1423f` (Max Deposit Rate display): test expects formatted SBV output from `get_macro_snapshot` but the tool now routes via HTTP — implementation diverged from test
- `Task 239c` AC-3: test expects `macroIndicatorRefreshJob.schedule` to contain `"0 6 * * *"` but actual schedule is `"13 19 * * * (19:13 UTC daily)"` — cron time was changed, test hardcodes old value
- `Task 1792` (conviction debounce): `vcbMessages.length` expected 1, received 0 — debounce logic exists but Telegram mock path not wired correctly
- `1414 FILE 1` (kinhDichTools.ts diacritics): expects Vietnamese diacritics at specific line numbers — code may have been refactored
- `1881a` (source_tier at JSON root): expects `source_tier` field present in JSON output from multiple tools — contract assertion for new field not yet added

These are NOT systemic infrastructure failures — each is a targeted assertion about a specific feature. They fail at 1ms because the assertion is about a string value or mock call count, with no external I/O.

**Fix approach:** Per-test triage. Each failing test in this class requires either: (a) implement the missing feature (if the test is a forward-looking spec), or (b) update/retire the test (if the implementation deliberately changed). PO scoping decision required.

### Class C — Network/Timer Isolation (CI sandbox has no external access)

**Volume estimate:** ~100–150 failures
**Bimodal timing:** 5000–5055ms (AbortError, network timeout at the configured 5s test timeout)

**Root cause:** Tests that make real network calls to external sources (Yahoo Finance, NewsAPI, VnStock TCP, HOSE/HNX/UPCOM exchange APIs) without a CI-env skip guard or mock. CI runner has no internet access to Vietnamese market APIs.

**Key failing tests:**
- `Task 1345a` (pollNews newsapi fallback): 5052ms — live newsapi call
- `Task 1288` (PollNewsResult shape): 4 tests × 5000ms — all fetchers timeout
- HOSE/HNX/UPCOM `AbortError: The operation was aborted` — exchange APIs unreachable
- `Task 1487` (Yahoo Finance 12-symbol): external Yahoo Finance API call

**Fix approach (existing pattern):** Use `if (Bun.env["CI"] === "true") { it.skip(...) }` or inject a mock fetcher via the injectable seam pattern (already used in many tests). GitHub Actions automatically sets `CI=true`. Per `dev-standards.md` test template: injectable HttpClient pattern is the canonical approach.

**Important note:** Class C is SEPARABLE from Classes A and B. All three classes can be fixed independently. CI will go green when ALL three classes are addressed.

---

## 4. Historical Regression Analysis

**Finding: NOT a recent regression.** The earliest CI run available (2026-05-11, sha `e273fc9d`) showed 703 test failures. The count has decreased to 639 over the sprint period as point-fixes landed (FIX-MCP-TOOL-COUNT-DRIFT, FIX-MCP-CI-NETWORK-GUARD addressed specific subsets). The 639 count represents the pre-existing baseline, not a cliff introduced by a specific commit.

**Bun crash on full local run:** Local `bun test` (full 1036-file suite) crashes with `A C++ exception occurred` at RSS 1.69GB peak. This is a Bun v1.3.13 bug under memory pressure when running all tests with `coverage = true`. It does NOT occur in CI because CI processes the tests in a different order/batch, or because the crash happens before the summary is printed (CI shows 639 fail rather than no output). This local crash masks the ability to get a reliable local total count — must rely on CI numbers.

---

## 5. CI Environment Analysis

**Setup (ci.yml):**
- Ubuntu 24.04 LTS, Bun 1.3.13 (from `.tool-versions`)
- No `env:` section — no SBV_*, TELEGRAM_*, FRED_*, or other env vars injected
- No `services:` section — no database, no Go microservices, no mock servers
- `bun test` run from `apps/mcp-server/` with `bunfig.toml` preload and 30s timeout
- CI also runs `bun test` a SECOND TIME in the "Report test summary" step, so the CI log shows the test suite output twice

**Critical CI-specific gap:** The `services:` section is completely absent. Tests for features that depend on the Go `macro-indicators` microservice (port 5004), the `rag-service` (port 8765), or any other co-deployed service WILL fail in CI unless they use injectable seams or skip-in-CI guards.

---

## 6. Is It CI-ENV-SPECIFIC or Universal?

**Mixed: both.** 
- Class A: fails BOTH in CI and locally (with mocks removed, the implementation diverged)
- Class B: fails BOTH in CI and locally (code not implemented)  
- Class C: CI-specific (local dev has internet access; CI runner does not)

The `028-sbv-rates.test.ts` failure is **CI-specific** (passes locally in isolation but fails in CI full-suite). Cause is likely module-level constant baking from env mutation by a co-running test — need to fix by moving constants inside function body.

---

## 7. Scope Verdict and Task Rename

**Recommended new task title:** `CI-BUN-TEST-MULTI-CLASS-FIX`

**Rationale for rename:** "TEST-ISOLATION-SPIKE" implies a single root cause around test isolation (network/DB). The actual failure set spans three distinct classes: (A) implementation mismatch, (B) unimplemented features, (C) network isolation. A rename better communicates the scope and helps PO dispatch the three sub-fixes to the right developers in parallel.

**Recurring-bug class?** Partially. Class C (network isolation) is a known recurring-bug class (prior fix FIX-MCP-CI-NETWORK-GUARD addressed some; more slipped through). Class A and B are new diagnoses. Recommend PO flag Class C as a CI-POLICY recurring concern: all new fetcher tests MUST use injectable pattern per `dev-standards.md`.

---

## 8. Fix Plan

### Ordering: Root Cause First

**Fix 1 (Class A — UNBLOCK):** Restore injectable seam in `macroTools.ts` `get_macro_snapshot` for test-time injection, OR rewrite the affected tests to mock the HTTP layer instead.

- **Option A1 (preferred):** Add `_testSbvClient` and `_testCommodityClient` back as recognized test-injection params in `get_macro_snapshot` handler. When non-null, bypass the HTTP call and run the original formatting logic inline. This is the smallest change and keeps the existing test assertions valid.
- **Option A2:** Rewrite tests to mock `fetch()` globally in the test file. More invasive — changes test strategy for all macroTools tests.
- **Files:** `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts` + affected test files (1423f, 1426c, 1352a).

**Fix 2 (Class A variant — 028 sbv.ts module constant):** Move `DEFAULT_OVERNIGHT_RATE`, `DEFAULT_REFINANCING_RATE` etc. from module-level constants into the body of `fetchSbvRates()`. Alternatively, always re-read `Bun.env` at call time inside the function (remove the module-level `const` pre-computation).

- **File:** `apps/mcp-server/src/infrastructure/fetchers/sbv.ts` lines 53–70

**Fix 3 (Class C — CI NETWORK GUARD):** Add `it.skip()` guards for all remaining tests that make live network calls to external APIs (HOSE/HNX/UPCOM/Yahoo/NewsAPI). Use `const isCI = Bun.env["CI"] === "true"` guard pattern. This is the same approach FIX-MCP-CI-NETWORK-GUARD used successfully.

- **Files:** `025-yahoo-finance.test.ts`, `1345a-pollnews-newsapi-fallback.test.ts`, `1288-pollnews-result-shape.test.ts`, plus any other test files with raw HTTP fetch to external endpoints not through injectable client.

**Fix 4 (Class B — per-test triage):** Systematic review of the 1ms failure cohort. Each test should be classified as: (i) spec for future feature → leave RED with comment, or (ii) implementation diverged → update test OR restore implementation. This is the largest class by volume and requires PO prioritization.

- Suggested starting batch: `1423f`, `239c` AC-3 (cron schedule hardcode), `1414 kinhDichTools diacritics`, `1881a source_tier`, `Task 234 MCP tool registration`, `Task 1792 debounce`.
- **Files:** 30–60 test files in `apps/mcp-server/src/__tests__/`

### Dev Zone

All fixes are in **dev-mcp-server** zone (`apps/mcp-server/`). No Go services, no infra changes.

### Single Fix or Batch?

**Three sequential batches, each independently verifiable:**
1. Fix 1 + Fix 2 (Class A injectable seam + sbv constant) — smallest delta, highest unblock value
2. Fix 3 (Class C network guards) — bounded scope, known pattern
3. Fix 4 (Class B per-test triage) — largest but separable; can be done in parallel sub-tasks per domain

---

## 9. Risk Flags

| Risk | Severity | Mitigation |
|---|---|---|
| Fix 1 Option A1 re-introduces coupling between test-time and production paths in `macroTools.ts` | Medium | Use `_test` prefix convention + `if (Bun.env["BUN_TEST"] ?? false)` guard to prevent test params leaking into production execution |
| Bun crash on local full-suite (OOM) masks pass/fail ratio | High | Run tests in batches by domain (`bun test src/__tests__/1423*.test.ts` etc.) or increase ulimit; do NOT rely on local full-suite run as verification |
| Class B triage may retire tests that are actually valid forward specs | Medium | PO reviews each retirement; rule: never retire a test without a linked task-board entry explaining why |
| Module-level constant migration (Fix 2) changes initialization order semantics | Low | No behavior change in production (Bun.env values are the same at runtime vs test time for SBV defaults); only test-observable behavior changes |

---

## 10. Affected Files

| File | Change Type | Class |
|---|---|---|
| `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts` | Injectable seam restoration | A |
| `apps/mcp-server/src/infrastructure/fetchers/sbv.ts` | Move module constants into function | A |
| `apps/mcp-server/src/__tests__/1423f-deposit-rate-display.test.ts` | Update seam usage | A |
| `apps/mcp-server/src/__tests__/1426c-*.test.ts` | Update seam usage | A |
| `apps/mcp-server/src/__tests__/1352a-*.test.ts` | Update seam usage | A |
| `apps/mcp-server/src/__tests__/028-sbv-rates.test.ts` | Verify after Fix 2 | A |
| `apps/mcp-server/src/__tests__/025-yahoo-finance.test.ts` | Add CI skip guard | C |
| `apps/mcp-server/src/__tests__/1345a-*.test.ts` | Add CI skip guard | C |
| `apps/mcp-server/src/__tests__/1288-*.test.ts` | Add CI skip guard | C |
| `apps/mcp-server/src/__tests__/[30–60 files]` | Per-test triage | B |

---

## 11. Signals Dropped

- Signal to PO: `brief_complete` — CI-BUN-TEST-MULTI-CLASS-FIX, ready for po→ba→pm→dev-mcp-server→qa dispatch
