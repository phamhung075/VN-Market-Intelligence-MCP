## Task Report CI-RED-c5b5f885-FIX
date: 2026-07-07
outcome: APPROVED

## Claim under review
dev-mcp-server: CI bun-test stable-red on 3 consecutive main HEADs (c5b5f885 → fb366a1e → f71643fb).
Root cause: `1410-tool-diacritics-sweep.test.ts` + `262-mcp-tools-042.test.ts` call
`getClimateRiskSignals`/`getEnergyGridStatus` → `fetchWeatherWarnings`/`fetchReservoirLevels`
(weatherVn.js/hydrologicalData.js) with no DI hook — real network, 15s axios timeout vs
bun-test's 5s default per-test timeout, under CI's 16-way parallel per-file isolation.
Fix commit 1efb6f918 (mock.module both fetchers, freeze-before-mock + afterAll-restore,
un-skip 2 energy tests in 262). Pushed to origin/main; bookkeeping commit 833318545 followed.

## RAW verification performed by QA (not relayed)

### 1. GitHub Actions — real run inspection
- `gh run list --branch main --limit 15`: confirms exactly 3 consecutive `bun test` job
  failures on c5b5f885 (28632717350), fb366a1e (28687445571), f71643fb (28689707086),
  then success on 1efb6f918 (28886901289) and 833318545 (28887280793).
- Pulled per-job conclusion via `gh run view --json jobs`: `bun test` job specifically
  (not just workflow aggregate) = `success` on both post-fix runs.
- Pulled the `bun test` job log for 28886901289: `14164 pass / 51 skip / 0 fail` via
  `ci-per-file-isolation.sh 16` (the real CI mechanism).
- Pulled the 3 pre-fix red job logs: `FAILEDFILE` lists match the claim exactly —
  1410 fails 3/3, 262 fails 2/3, 183-alert-accuracy fails 1/3 (fb366a1e run only,
  unrelated/no network dep, correctly left untouched).
- Not flaky-green: two independent post-fix pushes (fix commit + follow-up bookkeeping
  commit) both green.

### 2. Diff inspection (`git show 1efb6f918`)
- 2 files changed, both test files (`apps/mcp-server/src/__tests__/1410-*.test.ts`,
  `.../262-*.test.ts`). Zero production/domain code touched. `mock-guard.sh` confirms:
  "No production source files to scan. PASS."
- Mocking pattern: `mock.module()` placed before the static `climateTools.js`/`energyTools.js`
  import, freeze-before-mock via namespace-spread copy (`{..._realX}`), `afterAll()` restore —
  matches the established `1355b-dav-pharmacy-job-gaps.test.ts` precedent (same freeze +
  restore philosophy; that file uses named-import capture, these use namespace-spread —
  equivalent in effect).
- Un-skipped 2 energy tests in 262 assert real MCP response shape (`content` array,
  `{type:"text"}`, exported function) — not trivial (`expect(true)` style) assertions.

### 3. Mock-leak spot-check (independently reproduced, not just trusted)
- Ran `bun test 1410-tool-diacritics-sweep.test.ts 257-weather-vn.test.ts` together in one
  process: 37 pass / 0 fail. 257's DI-based fetchWeatherWarnings tests (typhoon/flood/drought
  parsing via injected HTML client) still pass — proves the mock did NOT leak into the sibling
  file (a leak would make 257's parsing assertions fail since the mocked fn ignores args).
- Ran `bun test 262-mcp-tools-042.test.ts 258-hydro-data.test.ts` together: 14 pass / 0 fail.
  258 log shows real extracted reservoir levels (`count:2, names:["Hòa Bình","Sơn La"]`) —
  proves the real (non-mocked) fetcher ran for the sibling, confirming afterAll-restore works.
- Reviewed `scripts/ci-per-file-isolation.sh`: CI invokes `bun test "$f"` as a SEPARATE
  process per file — mock.module() leak across files is structurally impossible under the
  actual CI harness regardless.

### 4. Full local suite (CI-equivalent isolation script, not bare `bun test`)
`cd apps/mcp-server && bash ../../scripts/ci-per-file-isolation.sh 16`:
`14151 pass / 40 skip / 24 fail` (12 failed files) — **neither 1410 nor 262 appear in the
failed-files list.** The 12 failures are all RSS/pollNews/SSC-breaker/source-health tests
(network-dependent in this local sandbox) — same class of pre-existing local-only flake
documented in the prior `TASK_REPORT_CI-RED-323b512b-FIX.md` QA pass and absent from all 3
real CI runs' failed-file lists. Not a regression from this fix.
`bun tsc --noEmit`: exit 0, 0 errors.

### 5. Decision journal (DJ-GATE-1)
`docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md` STEP dev-mcp-server-S2
contains `task-id:** CI-RED-c5b5f885-FIX` with concrete what-done/what-considered/why-decision.
Gate satisfied.

## Verdict: APPROVED
- CI genuinely green post-push (2 independent runs, `bun test` job specifically, real log
  content inspected — not badge-relayed).
- Diff is genuinely test-only; mocking pattern sound; independently reproduced no mock-leak
  across file boundaries (both directions) plus structural leak-impossibility per the CI
  harness's per-file-process design.
- Un-skipped tests assert real MCP response contracts, not trivial passes.
- Local CI-equivalent full-suite run corroborates: target files pass, no regression, residual
  fails are pre-existing local-network flake (documented pattern, matches prior QA baseline).
- Journal entry present — DJ-GATE-1 satisfied.

Verification_gate `ci_green_on_subsequent_push` (per `docs/agents/dev-team/flow/ci-health-probe.md`
CI-4): satisfied — 1efb6f918 differs from the original failing SHA f71643fb and both post-push
runs conclude `success`.
