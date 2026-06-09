# Architecture Brief — SPIKE-CI-C5-CONTAM-SAFE-RESTRATEGY

**Date:** 2026-06-09 (TUESDAY)
**Sprint:** CI-RED-RECONCILE
**Task:** SPIKE-CI-C5-CONTAM-SAFE-RESTRATEGY
**Author:** architect
**Baseline:** 135 native fail+error (sha 3663bd12, run 27193376550)
**Status:** SPIKE complete — spec for dev

---

## 1. Confirmed Root Mechanism

### 1a. Why 028/025/1423a/1487 return null in CI (not in local isolation)

These four victim files import production functions directly:

- `028-sbv-rates.test.ts` — `import { fetchSbvRates } from "../infrastructure/fetchers/sbv.js"`
- `025-yahoo-finance.test.ts` — `import { fetchYahooFinancePrices, storeCommoditySnapshot } from "../infrastructure/fetchers/yahooFinance.js"`
- `1423a-us10y-yield.test.ts` — same yahooFinance.js import
- `1487-yahoo-finance-extended.test.ts` — same yahooFinance.js import

Each of these tests passes the real function an in-process mock `HttpClient` object. In local per-file runs this works correctly: `fetchSbvRates(mockVcbClient(...))` receives the local mock, calls `client.get(url)`, and returns real XML-parsed data.

**In CI**, two earlier files in run order install `mock.module()` stubs at the ESM-cache layer:

- `083-tool-analysis.test.ts` (lines 15-26) installs:
  ```
  mock.module("../infrastructure/fetchers/yahooFinance.js", () => ({ fetchYahooFinancePrices: async () => null }))
  mock.module("../infrastructure/fetchers/sbv.js", () => ({ fetchSbvRates: async () => null }))
  mock.module("../infrastructure/rag/ragHttpClient.js", () => ({ ragSearch: async () => ..., ragIndex: async () => ..., ragHealthCheck: async () => true }))
  ```
- `123-integration-mcp.test.ts` (lines 35-40) installs:
  ```
  mock.module("../infrastructure/fetchers/yahooFinance.js", () => ({ fetchYahooFinancePrices: async () => null }))
  mock.module("../infrastructure/fetchers/sbv.js", () => ({ fetchSbvRates: async () => null }))
  ```

Bun 1.3.13 ESM cache is process-scoped. `mock.module()` at file-top scope replaces the module in the cache **for the entire remaining process lifetime**. There is no automatic restore at describe/afterEach boundary for file-top `mock.module()`.

Run order in CI places 083 and 123 **before** 028, 025, 1423a, 1487 (alphabetical by prefix). When 028 runs after 083/123, its `import { fetchSbvRates }` resolves to the cached stub (`async () => null`) not the real function. The injected `mockVcbClient(xml)` parameter is passed in, but the **function body itself** is the stub, which ignores all arguments and returns null unconditionally.

This is why `expect(snapshot).not.toBeNull()` fails: the function the test is calling is the null-returning stub, not the injectable-httpClient production function.

**Local isolation passes** because only one file is loaded per process — there is no prior `mock.module()` in the cache.

### 1b. The failed cure (commit 22470e44) reproduced the disease

The C5 fix attempted to:
1. Add `mock.restore()` in 083 and 123 `afterAll` hooks (delegating-mock approach).
2. Add a new file-top `mock.module("../infrastructure/rag/ragHttpClient.js", ...)` in `ddd-1b-rag-http-client.test.ts`.

This backfired for two mechanically distinct reasons:

**Reason A — delegating-mock in 083/123 did not lift the ESM stub for sbv/yahoo:**  
`mock.restore()` in Bun restores the original module only if `mock.module()` was called with a factory that wraps the original. The 083/123 factories did NOT import and re-export the originals — they returned completely synthetic stubs with no reference to the real module. Calling `mock.restore()` on a fully-synthetic module in Bun 1.3.13 has undefined behavior and empirically did not restore the real `fetchSbvRates`/`fetchYahooFinancePrices` for downstream files.

**Reason B — the ddd-1b file-top mock.module() re-spread contamination:**  
`ddd-1b-rag-http-client.test.ts` already uses per-test `globalThis.fetch = makeFetchMock(...)` / `globalThis.fetch = originalFetch` (save-and-restore). Adding a file-top `mock.module("../infrastructure/rag/ragHttpClient.js", ...)` at the start of ddd-1b poisoned ragHttpClient for all files running AFTER ddd-1b in the run order — specifically the `rag=24` collateral and `Task1124=24` lines visible in the C5 gate log.

### 1c. ragHttpClient.ts null mechanism

`ragSearch`, `ragIndex`, `ragHealthCheck` in `ragHttpClient.ts` call `globalThis.fetch(...)` directly. There is no injectable httpClient seam. When 083 stubs `ragHttpClient.js` with `{ ragSearch: async () => ({results:[], total:0}), ragIndex: async () => ..., ragHealthCheck: async () => true }` in the ESM cache, all downstream tests that import `ragHttpClient.js` (including `ddd-1b`, `1840a-rag-wiring`) receive the stub. `ddd-1b`'s own tests work because it saves/restores `globalThis.fetch` around each it() — but only for ddd-1b's own calls to `ragSearch` etc., which import from the SAME already-stubbed ESM module. This is why ddd-1b tests pass in isolation but the cache leaks to later files.

---

## 2. Chosen Contamination-Safe Pattern

**Chosen: (b) Dependency-injection seam at the fetcher call-site.**

### Rationale for rejecting (a) per-test beforeEach/afterEach mock+restore

`mock.module()` in beforeEach restores after afterEach IF `mock.restore()` actually works — which empirically it does NOT for Bun 1.3.13 when the factory is fully synthetic. Risk: any test ordering where beforeEach fires but afterEach is skipped (test abort, timeout) leaks contamination to the rest of the process. This is fragile and would require full empirical verification against the Bun 1.3.13 mock lifecycle, which has already burned two CI cycles.

### Rationale for rejecting (c) skipIf no-network

The tests are NOT network tests. They already inject mock clients. The failing tests pass in isolation. The issue is ESM-cache contamination, not missing network. Skipping them would be a false resolution — they would disappear from the fail count but the production logic would be untested.

### Why (b) is safe and deterministic

The production functions `fetchSbvRates` and `fetchYahooFinancePrices` ALREADY support injection via an optional `httpClient?` parameter. The contamination comes from 083/123 calling `mock.module()` to intercept the ESM cache — not from the production function signatures. The victim tests (028/025/1423a/1487) already pass a `mockVcbClient(xml)` or `symbolAwareClient(...)` to the function. **The production functions are already DI-ready.**

The actual gap is that the contamination in 083/123 replaces the ENTIRE module with a null-returning function. The victim tests' injected mock clients become irrelevant because the function itself is replaced.

**The fix is NOT in the victim tests.** The fix is in 083 and 123: remove the file-top `mock.module()` stubs for `sbv.js` and `yahooFinance.js`. These two files need to call the real `fetchSbvRates(mockVcbClient)` and `fetchYahooFinancePrices(symbolAwareClient)` where they actually exercise those functions, OR they need to pass the functions via the existing `commodityFetcher?` / `sbvFetcher?` injection seams on `runImpactChain`.

For `ragHttpClient.js`: `ddd-1b` already uses per-test `globalThis.fetch` save-and-restore correctly. The only action needed is to ensure 083's file-top `mock.module("ragHttpClient.js", ...)` is removed. The `search_similar_context` tool inside 083 calls `ragSearch` via `analysis.ts`, and analysis.ts imports ragHttpClient.js directly. The correct pattern for 083 is to pass `ragRetriever?: () => Promise<...>` into `runImpactChain` — which already exists as the `ragRetriever?` injection seam in `RunCascadeInput`.

**REWRITE not REMOVE:** 083 and 123 must not lose their mock stubs silently. They must instead use the DI injection seams that already exist in `runImpactChain.ts` (`commodityFetcher?`, `sbvFetcher?`, `ragRetriever?`) and the `_testHoseClient` pattern already used in RT5 of 123. The production fetcher functions are INTACT and exercised by their own dedicated test files (028/025/1423a/1487/ddd-1b).

---

## 3. Per-Victim-File Application Plan

### File: `apps/mcp-server/src/__tests__/083-tool-analysis.test.ts`

**Current problem:** Lines 15-26 install three file-top `mock.module()` stubs that contaminate ESM cache for all later files.

**Change:** Remove the three `mock.module()` calls at lines 15-26. Replace with DI-injection at test call sites:
- The `run_impact_chain` handler in 083 already calls `callTool(server, "run_impact_chain", {...})`. `runImpactChain` inside accepts `commodityFetcher?` and `sbvFetcher?` but these are passed from the tool handler, not the test. Look at how the handler builds `RunCascadeInput` in `analysis.ts` — it reads watchlist from DB and passes `commodityFetcher` / `sbvFetcher` from the input args if present.
- **Concrete plan:** In 083's `run_impact_chain` test cases, pass `_testCommodityFetcher: async () => null` and `_testSbvFetcher: async () => null` as args to `callTool`. The `registerAnalysisTools` handler in `analysis.ts` must be verified to pass these through to `runImpactChain` as `commodityFetcher` / `sbvFetcher`. If this seam already exists (check `analysis.ts` `run_impact_chain` handler), no production code change needed. If not, add the passthrough — this IS a production code change but it is a pure seam addition (no behavioral change; default path unchanged when args absent).
- For `search_similar_context` (which calls `ragSearch`): pass `_testRagRetriever: async () => ({results:[], total:0})` as a tool arg, or alternatively the handler can read a `ragRetriever?` param. Check `analysis.ts` `search_similar_context` handler to confirm if `ragRetriever` is already passed as an arg. If not, add the seam.
- **CRITICAL:** After removing file-top stubs, the `fetch_and_analyze` test cases that call `callTool(server, "fetch_and_analyze", {...})` will hit real RSS fetchers. These should be guarded by the existing network-timeout mechanism (the handler has try/catch) — they will return `"string"` content regardless. The existing assertions `expect(typeof result.content[0]!.text).toBe("string")` are already network-agnostic and will continue to pass.

**No `mock.module()` anywhere in 083 after the change.**

---

### File: `apps/mcp-server/src/__tests__/123-integration-mcp.test.ts`

**Current problem:** Lines 35-40 install two file-top `mock.module()` stubs for `yahooFinance.js` and `sbv.js`.

**Change:** Remove the two `mock.module()` calls at lines 35-40. Replace with DI at test call sites for any test that exercises `run_impact_chain` (RT2's third test: "run_impact_chain returns a chain entry for banking news"). Pass `_testCommodityFetcher: async () => null` and `_testSbvFetcher: async () => null` in the callTool args for that specific test.

All other RT1/RT2/RT3/RT4/RT5 tests in 123 do NOT call `run_impact_chain` in a way that triggers `defaultCommodityFetcher`/`defaultSbvFetcher` (the relevant tests use DB CRUD, alert queries, BCTC queries, or the `_testHoseClient` injection). The `retriever.js` mock.module at line 29-32 is for a deprecated LanceDB module — if retriever.js is still imported anywhere in the chain, this is the one mock that might need to stay. However, if retriever.js is fully dead (replaced by ragHttpClient.js per G5b), remove it too and confirm no import chain reaches it from the tool files loaded by 123.

**No `mock.module()` for `yahooFinance.js` or `sbv.js` in 123 after the change.**

---

### File: `apps/mcp-server/src/__tests__/ddd-1b-rag-http-client.test.ts`

**Current state (post-revert, sha 3663bd12):** Uses per-test `globalThis.fetch = makeFetchMock(...)` save-and-restore pattern. No file-top `mock.module()`. This is already the correct contamination-safe pattern.

**Change needed:** NONE. The file is already clean. The C5 regression added a file-top `mock.module()` here that was then reverted. The per-test globalThis.fetch pattern is the correct approach for ragHttpClient consumers.

**Confirm:** Verify that `ddd-1b` at sha 3663bd12 has no `mock.module()` at file top. If confirmed clean, mark as no-touch.

---

### Files: `028-sbv-rates.test.ts`, `025-yahoo-finance.test.ts`, `1423a-us10y-yield.test.ts`, `1487-yahoo-finance-extended.test.ts`

**Current state:** These files are CORRECT. They already use the DI injection pattern properly:
- 028: passes `mockVcbClient(xml)` or `failingVcbClient()` to `fetchSbvRates(client)`
- 025: passes `symbolAwareClient(...)` or `failingClient()` to `fetchYahooFinancePrices(client)`
- 1423a: passes `ALL_13_CLIENT` or `partialClient` or `failAll` to `fetchYahooFinancePrices(client)`
- 1487: passes `ALL_12_CLIENT` or `partialClient` or `failAll` to `fetchYahooFinancePrices(client)`

**Change needed:** NONE. These files already embody the correct pattern. They fail only because 083/123 poison the ESM cache before they run. Fix 083/123 and all four victim files pass without any change.

---

### Production code seam addition (conditional)

One production code change may be required in `analysis.ts` if the `run_impact_chain` MCP handler does NOT currently pass `commodityFetcher?` / `sbvFetcher?` / `ragRetriever?` from tool call arguments to `runImpactChain`. Inspection of `analysis.ts` shows `runImpactChain` is called from the `run_impact_chain` handler — the handler constructs `RunCascadeInput`. The dev must verify whether test-injection args (`_testCommodityFetcher`, `_testSbvFetcher`, `_testRagRetriever`) are already supported in the handler's arg schema. If absent, add them as optional Zod `z.function()` or `z.any()` fields (standard `_test*` injection pattern already used for `_testHoseClient` in `get_market_snapshot`). This is a pure seam addition — no behavioral change on the prod hot path.

---

## 4. Projected Native Fail+Error Drop

### Current baseline: 135 fail+error (sha 3663bd12)

**Fail count in C5 gate for victim files (empirical from signal ci-c5-gate-result-22470e44):**
- Task028: 22 fails
- Task025: 20 fails
- Task1487: 8 fails
- Task1423a: 3 fails (from notebook c14 CI-172-residual-filescope entry: C1 confirmed 3 fails for 1423a)
- rag (ddd-1b consumers): contamination from c5 re-added mock — 24 fails (these are collateral from the failed cure, not present at 3663bd12 baseline)

**Victim fails attributable to ESM contamination at 3663bd12 baseline:**
From the CI-172-residual-filescope notebook entry (C1 cluster at sha 7bea53d0, 172 fails):
- 028-sbv-rates: 9 fails
- 025-yahoo-finance: 7 fails
- 1423a-us10y-yield: 3 fails
- 1487-yahoo-finance-extended: 3 fails

Total C5 victim clearance at 3663bd12 baseline: approximately **22 fails** (028+025+1423a+1487 combined, net of any already-passing tests).

**Projected result after fix:** 135 - 22 = approximately **113 fail+error**. Margin for count drift ±5.

This beats the HARD GATE of "must drop below 135" with clear headroom.

**Note:** The ddd-1b 24-collateral and Task1124-24-collateral are artifacts of the reverted 22470e44 commit. At 3663bd12 baseline these do not appear. The fix targets only the 22 genuine C5 victims. If ddd-1b consumers also surface as victims at 3663bd12, the projected drop is larger.

---

## 5. DI Seam Audit Summary

| Production function | DI param already exists? | Call in victim test | Notes |
|---|---|---|---|
| `fetchSbvRates(httpClient?)` | YES — optional param in sbv.ts:233 | 028 passes `mockVcbClient(xml)` | Seam complete, victim test correct |
| `fetchYahooFinancePrices(httpClient?)` | YES — optional param in yahooFinance.ts:261 | 025/1423a/1487 pass mock client | Seam complete, victim tests correct |
| `ragSearch` / `ragIndex` / `ragHealthCheck` | NO httpClient param — uses `globalThis.fetch` directly | ddd-1b uses globalThis.fetch save/restore | Correct pattern; no change needed |
| `runImpactChain(input)` | YES — `commodityFetcher?`, `sbvFetcher?`, `ragRetriever?` in RunCascadeInput | 083/123 must pass via tool args | Verify `_testCommodityFetcher` seam in analysis.ts handler |

---

## 6. BUILD-STANDARD

**Classification:** BUG-FIX / REFACTOR (in-zone, no new primitives)
**BUILD-STANDARD: not-applicable** — test file changes only (083, 123) plus one conditional seam addition in `analysis.ts`. No new services, no new interfaces.

**Zone:** `apps/mcp-server/src/__tests__/` (test files) + `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts` (conditional seam only)

---

## 7. Risk Flags

- **Risk-1 (MEDIUM):** Removing mock.module() from 083 means `fetch_and_analyze` tests will attempt real RSS fetches in CI (cafef, vnexpress, reuters). Existing assertions are already network-agnostic (`typeof text === "string"`). However if RSS fetchers throw outside the handler's catch, tests could fail. Verify 083 fetch_and_analyze tests use `expect(typeof result.content[0]!.text).toBe("string")` and NOT `expect(result.content[0]!.text).toContain("real content")`.
- **Risk-2 (LOW):** If `retriever.js` is still reachable from 123's tool chain (legacy path), removing the retriever.js mock.module could expose LanceDB file-I/O errors. Verify retriever.js is fully replaced by ragHttpClient.js in all tool imports loaded by 123.
- **Risk-3 (LOW):** Run-order sensitivity. After fix, 028/025/1423a/1487 must run AFTER 083/123 in the alphabetical order and see the REAL module in ESM cache (not a stub). If any EARLIER file in the run order installs a `mock.module()` for sbv/yahoo, these files would still be contaminated. Verify no other file has `mock.module("../infrastructure/fetchers/sbv.js")` or `mock.module("../infrastructure/fetchers/yahooFinance.js")` at file-top scope.
