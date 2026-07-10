# SPIKE — CI per-file-isolation flake on a rotating set of test files

- **Task ID:** SPIKE-CI-PERFILE-ISOLATION-FLAKE
- **Time-box:** 120 min (used ~100 min)
- **Question:** Why does `apps/mcp-server` CI's `bun test` job (`scripts/ci-per-file-isolation.sh 16`) flake RED on a ROTATING set of test files across commits that touch ZERO application code (`fefa78255`, `adedbcdff`, `cf49daab0`)?

## Approach tried

1. Read `scripts/ci-per-file-isolation.sh` — confirmed it runs each test file as a **separate OS process** (`bun test "$f"`, `xargs -P 16`), so there is no shared-process/ESM-cache leakage between files. `STOCK_PRICE_DB_PATH` is already made unique per invocation (`$$` inside the per-file subshell). Per-file isolation is real for that one resource.
2. Confirmed `.github/workflows/ci.yml` runs the job on `runs-on: ubuntu-latest` with `bash ../../scripts/ci-per-file-isolation.sh 16` — 16-way parallel `bun test` processes on a 2–4 vCPU GitHub-hosted runner = 4×–8× CPU oversubscription.
3. Read the 3 implicated test files (`135-rag-temporal-decay.test.ts`, `106-intelligence-cycle.test.ts`, `1299b-skill-gated-bootstrap.test.ts`) plus their production code (`retriever.ts`, `intelligenceCycleJob.ts`, `agentBootstrap.ts`, `projectRoot.ts`).
4. Grepped `docs/data/orch/orch-state.json` for `FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH` and `DEFLAKE-1187-POLLNEWS-DEAD-PATH` — read both existing notes (see Findings §2, §4).
5. **Reproduced live**, on this dev machine, by manufacturing CPU contention (background `yes >/dev/null` flood, 40–120 procs on a 12-core box) and re-running each suspect file 16–30-way in parallel:
   - Quiet machine: 20/20 (135-rag) and 16/16 + 16/16 (135-rag, 1299b) all green under 16-way parallel — confirms this is NOT reproducible without genuine CPU starvation.
   - Under heavy contention (120 background `yes` + 24-way `bun test`): **135-rag failed 1/24**, **1299b failed 11/24** (6 of 9 tests failed in the worst run) — both reproduced with concrete evidence below.
   - `106-intelligence-cycle.test.ts` run once, uncontended: confirmed it fires **real, unmocked** live HTTP calls to Yahoo Finance and SBV on every test (log lines `[yahooFinance] fetched commodity prices` / `[sbv] macro snapshot fetched` with live-looking values) — did not need contention to prove the defect, just needed to read the log.

## Findings

**There is no single shared code bug. There are THREE independent, already-real latent defects, all exposed by the SAME environmental trigger: severe CPU oversubscription from `parallelism=16` on a constrained (2–4 vCPU) `ubuntu-latest` runner.** Which file "rotates" into the failing slot on any given CI run depends purely on OS-scheduling luck, not on which commit landed. This explains the evidence perfectly: docs-only commits go red because the trigger is infra/scheduling, not app code.

### 1. `1299b-skill-gated-bootstrap.test.ts` — cascading TDZ from a synchronous `execSync` inside a module-level singleton init (most severe; real architecture bug, not just a test bug)

`apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts:358`:
```ts
const toolNameMap: Map<string, ToolRegistryFn> = buildToolNameMap();
```
`buildToolNameMap()` synchronously invokes all ~107 tool-registration functions against a fake probe server (L311–355). One of them, `registerAgentMemoryTools`, calls `getProjectRoot()` (`apps/mcp-server/src/infrastructure/projectRoot.ts:16`):
```ts
_root = execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
```
`execSync` **blocks the whole thread** waiting for a forked `git` subprocess. Under CPU starvation, forking+scheduling that subprocess can take seconds instead of milliseconds. Reproduced live:
```
(fail) TC-2: getToolsForSkills(['news_scout']) returns ≤25 fns [5305.18ms]
  ^ this test timed out after 5000ms.
ReferenceError: Cannot access 'toolNameMap' before initialization.
    at resolveToolNames (agentBootstrap.ts:433:16)
```
Bun's per-test timeout fires while the module's top-level `const toolNameMap = buildToolNameMap()` is still stuck inside the blocking child-process wait. Per ES-module semantics, an evaluation that errors out mid-flight leaves that module instance permanently "errored" for the life of the process — every subsequent `await import("agentBootstrap.js")` in the same file replays the SAME `ReferenceError` near-instantly (0.14–0.7ms). Result: **one slow git spawn poisons every remaining test in the file.** In the worst reproduced run, 6 of 9 tests in `1299b` failed this way in a single shot.

**Blast radius:** `agentBootstrap.js` is imported by `apps/mcp-server/src/interface/mcp/server.ts:40` (production entry point) and directly/transitively by ~30 test files (`grep -rl "createMcpServerInstance\|bootstrap/agentBootstrap"` → 25 + 5 = 30 of 1187 files). Any one of those 30 is a candidate for this exact cascade on any given CI run — this alone is enough to explain "rotating set of test files." It is also a **production risk**, not just a test artifact: the live MCP server shells out to `git` synchronously on every cold start via the same path.

### 2. `106-intelligence-cycle.test.ts` — unmocked live network fetch (CONFIRMED, and already flagged as a known risk)

`intelligenceCycleJob.ts` Step A2 (`_runCycle`, L252–266) is **unconditional** ("always — builds σ history 24/7", runs regardless of market hours):
```ts
const macroFetchFn = deps.macroFetchFn ?? (async () => {
  const { fetchYahooFinancePrices, storeCommoditySnapshot } = await import(".../yahooFinance.js");
  const commodity = await fetchYahooFinancePrices();
  ...
  const { fetchSbvRates, storeSbvSnapshot } = await import(".../sbv.js");
  ...
});
await withTimeout(macroFetchFn(), "step A2 macroFetch"); // default 2-min internal timeout
```
`106-intelligence-cycle.test.ts`'s `NO_NET_MARKET_DEPS` and every individual test's deps object never set `macroFetchFn` or `vnstockSyncFn`. A live run on this machine confirmed real network I/O firing on every test:
```
[yahooFinance] fetched commodity prices {"brentCrudeUSD":76.01,"goldUSDPerOz":4126.3,...}
[sbv] macro snapshot fetched {"overnightRatePct":3,...}
```
This did not fail locally (fast network, quiet machine) but the exact same exposure was **already diagnosed and named** by `dev-mcp-server` itself in the `review_note` of `FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH` (orch-state.json, status REVIEW): *"Follow-up flagged (not fixed here...): 106-intelligence-cycle, 1228, 1255, 137, 1383, 1501, 278, 311 test files share the same unmocked-live-fetch exposure pattern ... currently passing but same flake class, candidate for a follow-up sweep."* This SPIKE independently reproduces and confirms that prediction for 106 specifically. Under CI's degraded network conditions (Vietnamese SBV endpoint reliability, possible Yahoo Finance throttling/geo-behavior) combined with CPU-starved event-loop scheduling from 16-way parallelism, this live call is exactly the kind of operation that occasionally exceeds bun's 30s (`bunfig.toml`) or the internal step timeouts non-deterministically.

### 3. `135-rag-temporal-decay.test.ts` — timestamp-straddling floating-point assertion (test-code bug, not a calendar/date-roll issue)

`applyTemporalDecay()` (`retriever.ts:106-131`) captures `now = Date.now()` **inside** the function at call time. The test `"brand-new result (0h ago) gets maximum boost"` captures `createdAt: new Date().toISOString()` **before** calling the function:
```ts
const result = makeResult({ distance: 0.6, createdAt: new Date().toISOString() });
const decayed = applyTemporalDecay([result], config)[0]!;
expect(decayed.distance).toBeLessThanOrEqual(0.6);
```
If the process is scheduled away between those two lines (any nonzero elapsed wall-clock time), `ageHours` becomes measurably positive, `decayFactor` drops fractionally below 1, and `adjustedDistance` becomes fractionally **greater** than 0.6. Reproduced live under contention:
```
Expected: <= 0.6
Received: 0.6000000002062938
(fail) brand-new result (0h ago) gets maximum boost — adjusted distance < raw distance [7.15ms]
```
This is **not** the PO's "date roll 07-07→07-10" hypothesis (a) — that theory is disproved: the math only needs a few ms of scheduling jitter between two `Date.now()`-adjacent calls, not a calendar boundary, and it can happen on any date/time. The other tests in the same file with tighter `toBeCloseTo(x, 3–4)` tolerances were checked and are numerically immune (either the `maxBoost=0` denominator cancels `decayFactor` entirely, or the required drift to break a 0.0005/0.00005 tolerance would need ~70+ minutes of elapsed time — implausible). Only this one assertion is exposed, because it is the only one making a strict inequality against an *exact* boundary value (0.6) with zero tolerance.

### 4. `DEFLAKE-1187-POLLNEWS-DEAD-PATH` (existing BACKLOG row, not directly investigated)

Not one of the 3 files in this SPIKE's evidence. Its own title ("passes 5/5 local, fails ~1/N under CI isolation") is consistent with the same environmental trigger (parallelism=16 oversubscription) as a plausible hypothesis for whoever picks it up next, but this SPIKE did not read `1187-pollnews-dead-path.test.ts` or reproduce it — no evidence to claim its root cause, so it is **not folded in**.

## Recommended next step

**Do NOT create one generic "de-flake CI" ticket.** Evidence shows 3 independently real, differently-shaped bugs sharing only an environmental amplifier. Recommend 3 separate, scoped follow-ups:

1. **NEW backlog item, HIGH priority — real architecture bug, not just test flake:** stop `getProjectRoot()` (`apps/mcp-server/src/infrastructure/projectRoot.ts`) from running a blocking `execSync` inside `agentBootstrap.ts`'s eager top-level `buildToolNameMap()` singleton (`agentBootstrap.ts:358`), which is on `server.ts`'s production boot path. Options: memoize via `import.meta.dir`-relative walk-up (no subprocess), or make `registerAgentMemoryTools`'s project-root resolution lazy (called at tool-invocation time, not at registration-probe time). This is the highest-value fix — it also protects real MCP server cold-start latency, not only CI.
2. **PROMOTE the existing `FIX-CYCLEJOB-1294` `review_note`'s "follow-up sweep" candidate list to a tracked backlog row** — this SPIKE has now confirmed (not just predicted) that `106-intelligence-cycle.test.ts` fires live network I/O. Inject `macroFetchFn`/`vnstockSyncFn` no-op stubs into `106-intelligence-cycle.test.ts` (mirror the pattern already used in `1294-macro-spam-fix.test.ts`), then sweep the other 7 named files (1228, 1255, 137, 1383, 1501, 278, 311). Keep this as its OWN item — do not fold into item 1, unrelated code path.
3. **LOW-priority, tiny fix:** in `135-rag-temporal-decay.test.ts`, either inject a frozen `now` into `applyTemporalDecay` for that one test, or relax `toBeLessThanOrEqual(0.6)` to tolerate sub-ms jitter (e.g. `toBeLessThanOrEqual(0.6001)`). Keep separate — unrelated code path, unrelated file.
4. `DEFLAKE-1187-POLLNEWS-DEAD-PATH` — leave as-is (already correctly triaged BACKLOG/low); do not fold in, no evidence gathered here.

None of these 3 fixes should be expected to make `ci-per-file-isolation.sh 16` categorically un-flaky on its own — parallelism=16 on a 2–4 vCPU runner will keep surfacing new instances of "hidden timing/sync assumption" bugs as the suite grows. A structural mitigation worth a PLAN-ONLY follow-up: either lower CI parallelism to match runner vCPU count (trade CI wall-time for determinism) or fail loud on process-level rc (the aggregation loop in `ci-per-file-isolation.sh` currently only counts parsed "N fail" lines from the summary, never checks `rc` from the per-file JSON — a genuinely crashed/killed process with 0 parsed fails would currently be silently invisible to the gate; not observed in this SPIKE's evidence but worth a defensive fix given `rc` is already captured and unused).

## Code reference

- `apps/mcp-server/scripts/ci-per-file-isolation.sh` — parallel runner, per-file isolation mechanism, `rc` captured but unused in aggregation
- `.github/workflows/ci.yml` — `runs-on: ubuntu-latest`, `bash ../../scripts/ci-per-file-isolation.sh 16`
- `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts:311-358` — `buildToolNameMap()` eager synchronous init
- `apps/mcp-server/src/infrastructure/projectRoot.ts:9-21` — blocking `execSync("git rev-parse --show-toplevel")`
- `apps/mcp-server/src/interface/mcp/server.ts:40` — production import of `agentBootstrap.js`
- `apps/mcp-server/src/scheduler/news-analysis/intelligenceCycleJob.ts:250-266` — Step A2 unconditional live macro fetch, `macroFetchFn` default
- `apps/mcp-server/src/__tests__/106-intelligence-cycle.test.ts` — `NO_NET_MARKET_DEPS` missing `macroFetchFn`/`vnstockSyncFn`
- `apps/mcp-server/src/infrastructure/rag/_deprecated/retriever.ts:106-131` — `applyTemporalDecay`, `now = Date.now()` at call time
- `apps/mcp-server/src/__tests__/135-rag-temporal-decay.test.ts:86-94` — "brand-new result" test, zero-tolerance boundary assertion
- `apps/mcp-server/src/__tests__/1299b-skill-gated-bootstrap.test.ts` — all 9 TCs, cascading TDZ failure observed live
- Existing backlog: `docs/data/orch/orch-state.json#FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH` (status REVIEW, review_note already names 106-intelligence-cycle as a follow-up candidate — now confirmed), `docs/data/orch/orch-state.json#DEFLAKE-1187-POLLNEWS-DEAD-PATH` (status BACKLOG, not investigated here)
- Branch: `spike/ci-perfile-isolation-flake` (deleted at cleanup)
