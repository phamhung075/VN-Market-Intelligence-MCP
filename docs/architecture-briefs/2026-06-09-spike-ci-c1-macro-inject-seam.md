# SPIKE-CI-C1-MACRO-INJECT-SEAM — Verdict Brief

**Date:** 2026-06-09 (TUESDAY)
**Task:** SPIKE-CI-C1-MACRO-INJECT-SEAM (SPIKE, architect, 90m timebox)
**Sprint:** CI-RED-RECONCILE
**Zone:** apps/mcp-server/src/interface/mcp/tools/macro/
**Input brief:** docs/architecture-briefs/2026-06-09-ci-241-residual-taxonomy.md (C1 cluster)

---

## 1. Evidence: Commit History for Seam Removal

### The seam-removal commit

**SHA:** `98df0f43`
**Date:** 2026-05-23
**Message:** `feat(mcp-server,macro-indicators): cycle-41 — P2-B1 MCP HTTP rewire (R-3 unblock) — 4 macro tools → port 5004`
**Net change:** macroTools.ts +503 / -697 lines (603 net reduction)

This commit was an INTENTIONAL architectural refactor:

- **Before P2-B1:** `registerMacroTools()` in macroTools.ts called Yahoo Finance and SBV fetchers directly (domain imports), built human-readable text sections (`=== Macro Snapshot ===`, `[Commodity Prices]`, `[SBV Central Bank Rates]`, `[Macro Signal Summary]`, `[Global Macro Inputs — Thien Thoi]`, `[Dinh Gia — Asset Valuation]`), and exposed three injection seams: `_testCommodityClient`, `_testSbvClient`, `_testDinhGiaInputs`.
- **After P2-B1:** `registerMacroTools()` is a thin HTTP proxy — it calls `POST {MACRO_INDICATORS_URL}/snapshot` (Go microservice, port 5004), receives structured JSON (`MacroSnapshotResponse`), and wraps it as `{ source_tier, text: JSON.stringify(data), fetchedAt }`. No text-section formatting. No injection seams. No domain imports.

### What the production tool emits now

The `get_macro_snapshot` tool response shape (added by follow-up commit `260655e3`, 2026-06-05):
```json
{
  "source_tier": 2,
  "text": "{\"status\":\"ok\",\"vnIndex\":1282.5,\"oilUsd\":82.1,...,\"signals\":{\"carry\":{...},\"yield\":{...}}}",
  "fetchedAt": "2026-06-09T..."
}
```

The Go `MacroSnapshotResponse` DTO (apps/macro-indicators/pkg/application/dtos.go) has fields:
`status`, `vnIndex`, `oilUsd`, `goldUsd`, `usdVnd`, `dataSource`, `signals`, `fetchedAt`, plus `{field}_is_estimate` / `{field}_source_tier` provenance fields.

**The Go service does NOT produce `[Commodity Prices]`, `=== Macro Snapshot ===`, `[SBV Central Bank Rates]`, `[Macro Signal Summary]`, `[Dinh Gia]`, or any human-readable section headers.**

### What the pure helpers still export

`formatThienThoi(ThienThoiInputs): string[]` and `formatDinhGia(DinhGiaInputs): string[]` remain exported from macroTools.ts for backward compatibility with tests `1423d` and `1570c`. These functions are correct and fully testable as pure helpers. They are NOT called by `registerMacroTools()` in the current production path.

---

## 2. Verdict

**VERDICT: (A) — INTENTIONAL seam removal. Plus a partial (B) sub-class: the tool output FORMAT changed in production (from human-readable text to JSON proxy), so users receive a different format — but the underlying signals are still served.**

**Exact partition:**

| Sub-class | Count | Description |
|---|---|---|
| **(A) Test-only seam fix** | **~40** | Tests that use `_testCommodityClient` / `_testSbvClient` / `_testDinhGiaInputs` injection params that are now silently ignored by the HTTP proxy tool. These tests must be rewritten to mock `globalThis.fetch` (the new injection point). |
| **(B) Test-format assertion fix** | **~31** | Tests asserting human-readable section headers (`[Commodity Prices]`, `[SBV Central Bank Rates]`, `=== Macro Snapshot ===`, `[Macro Signal Summary]`, `[Dinh Gia]`) that the TS tool no longer emits — because formatting moved to the Go service. The new assertions must match the `{ source_tier, text: JSON..., fetchedAt }` wrapper shape. |

**Note on overlap:** Most (A) tests also fail on (B) assertions simultaneously. The 71-count from the CI taxonomy is the total failure count; the A/B split is by primary fix mechanism.

**There is NO production regression on signal correctness.** The carry trade signal, yield spread, oil/gold/USD-VND signals are all served live through the Go `macro-indicators` service at port 5004. The format change (text sections → JSON) is intentional per DSI-INV-1 and the AC-3 source-tier contract. However, consumers of the MCP tool now receive raw JSON instead of human-readable formatted text — this is a behavioral change that affects the cowork agents that parse the output.

---

## 3. Production Severity Assessment

**Is the live `get_macro_snapshot` currently degraded?**

No, in the sense that the Go service returns correct live data (carry spread, regime, prices). However:

1. **Output format changed:** Consumers that expected `=== Macro Snapshot ===` formatted text now receive `{ source_tier, text: "{...json...}", fetchedAt }`. The actual macro data is inside `text` as a JSON string-within-JSON. Any consumer that does `result.text.includes("[Commodity Prices]")` in production code will fail.

2. **Cowork agent impact:** The `get_macro_snapshot` MCP tool IS consumed by the cowork/daily-document flow. If the cowork agent or chef agent naively renders the `text` field as plain text, users see raw JSON in the MARKET channel instead of formatted macro intelligence. This is likely already happening in production if the cowork agents have not been updated to parse the new `text` JSON wrapper.

3. **The 1881a contract tests (20 tests) pass** — they correctly mock `globalThis.fetch` and assert the `{ source_tier, text, fetchedAt }` shape. So the DSI-INV-1 contract is satisfied from a test-contract perspective.

**Severity: MEDIUM.** Data is live and correct. Format is machine-readable JSON, not human-readable sections. Cowork agents that call `get_macro_snapshot` may be rendering raw JSON to users.

**Cross-check with cowork consumption:** Check `docs/agents/cowork-team/flow/main.md` and the chef agent for `get_macro_snapshot` calls. If the cowork flow calls this tool and renders `result.text` directly, users see JSON dump instead of macro narrative.

---

## 4. Ordered Fix Plan for dev-mcp-server

### Sub-task A: Test rewrite — injection seam migration (owner: dev-mcp-server)
**~40 tests across 5 files. Timebox estimate: 90m.**

**The new injection strategy:** mock `globalThis.fetch` in `beforeAll` / `beforeEach`, returning a controlled `MacroSnapshotResponse`-shaped JSON. The 1881a-source-tier.test.ts already demonstrates the exact pattern (lines 94–134).

**Files to rewrite (integration/tool tests that use `_test*` params):**

1. `apps/mcp-server/src/__tests__/089-tool-macro.test.ts`
   - All `callTool(server, "get_macro_snapshot", { _testCommodityClient: ..., _testSbvClient: ... })` calls
   - Replace with `globalThis.fetch` mock returning a `MacroSnapshotResponse` JSON
   - Update assertions: `expect(text).toContain("[Commodity Prices]")` → `expect(parsed.text).toContain("oilUsd")` (or equivalent JSON field checks)
   - Tests MT-01 through neutral-signal tests: ~17 tests affected

2. `apps/mcp-server/src/__tests__/1423d-thien-thoi-snapshot.test.ts`
   - Integration tests TT-07/TT-08/TT-09/TT-10 (4 tests) use `_testCommodityClient`/`_testSbvClient` injection
   - Unit tests TT-01 through TT-06 call `formatThienThoi()` directly — **these PASS already** (pure function unchanged)
   - Rewrite TT-07..TT-10 to use `fetch` mock; update assertions to match `{ source_tier, text, fetchedAt }` wrapper
   - TT-08 assertion `text.indexOf("[Commodity Prices]")` — no longer valid; remove or change to check JSON structure

3. `apps/mcp-server/src/__tests__/1423f-deposit-rate-display.test.ts`
   - All 3 tests use `_testSbvClient` injection → rewrite to `fetch` mock
   - Update assertions: `expect(text).toContain("Max Deposit Rate:")` — this section no longer emitted by TS tool; need to check if Go service emits it OR mark as format-change and assert the JSON fields instead

4. `apps/mcp-server/src/__tests__/1903a-dispatch-regression.test.ts`
   - Suite B (GMS-REG-02..04, 3 tests): `_testCommodityClient`/`_testSbvClient` injection
   - GMS-REG-02 `expect(text).toContain("[Macro Signal Summary]")` — no longer valid; replace with structural check on the `{ source_tier, text: JSON }` shape
   - GMS-REG-03 negative-space guards (no ĐIỆN LỰC, no portfolio) — still valid, keep
   - GMS-REG-04 `content.length === 1` — still valid, keep

5. `apps/mcp-server/src/__tests__/1570c-dinh-gia-snapshot.test.ts`
   - Integration tests (file-level `callTool` tests) use `_testDinhGiaInputs`/`_testCommodityClient`/`_testSbvClient`
   - Unit tests for `formatDinhGia()` are pure and unaffected
   - Rewrite integration tests to use `fetch` mock
   - Assert `[Dinh Gia]` section: this section is NOT in the Go service JSON output — assertions checking for `[Dinh Gia — Asset Valuation]` in tool output must be REMOVED or replaced with JSON field checks (`signals.yield.label`, etc.)

### Sub-task B: Assertion update — section-header checks (owner: dev-mcp-server)
**Embedded within the same 5 files above. No additional files needed.**

New assertion pattern for any test checking `get_macro_snapshot` tool output:
```typescript
// Parse the tool result
const raw = JSON.parse(firstText(result)); // { source_tier, text, fetchedAt }
expect(raw.source_tier).toBe(2);
expect(typeof raw.text).toBe("string");
// Parse the inner text to check data
const inner = JSON.parse(raw.text); // MacroSnapshotResponse
expect(inner.oilUsd).toBeGreaterThan(0); // instead of "[Commodity Prices]"
expect(inner.signals?.carry?.regime).toBeDefined(); // instead of "[Macro Signal Summary]"
```

### Sub-task C (OPTIONAL — separate task, lower priority): Go service text formatting
**If the team wants `[Commodity Prices]`-style human-readable output for cowork agents:**
- Add a text-formatter function in the Go service's `handleSnapshot` that produces the old human-readable format and stores it in a `formatted_text` field of the response
- OR: reintroduce `formatThienThoi`/`formatDinhGia` calls in the TS proxy layer on top of the Go JSON response
- This is NOT required to fix CI (the tests just need to align with current output); it IS required if cowork agents rely on formatted text sections

**Owner zone:** `apps/mcp-server/src/interface/mcp/tools/macro/` (TS proxy) + `apps/macro-indicators/` (Go service)
**Assign to:** dev-mcp-server for the TS side; dev-macro-indicators for the Go side
**Decision deferred to PO:** whether to restore formatted text or update consumers to parse JSON

---

## 5. Files Affected (exact paths)

**Test files to rewrite (dev-mcp-server, test-only zone):**
- `apps/mcp-server/src/__tests__/089-tool-macro.test.ts`
- `apps/mcp-server/src/__tests__/1423d-thien-thoi-snapshot.test.ts` (integration section only)
- `apps/mcp-server/src/__tests__/1423f-deposit-rate-display.test.ts`
- `apps/mcp-server/src/__tests__/1570c-dinh-gia-snapshot.test.ts` (integration section only)
- `apps/mcp-server/src/__tests__/1903a-dispatch-regression.test.ts` (Suite B only)

**Production files: NO CHANGES REQUIRED** for CI fix (seam removal was intentional).

**Reference / do-not-modify:**
- `apps/mcp-server/src/__tests__/1881a-source-tier.test.ts` — already PASSES (correct fetch mock pattern); use as the injection-strategy reference
- `apps/mcp-server/src/__tests__/1423d-thien-thoi-snapshot.test.ts` TT-01..TT-06 — pure `formatThienThoi()` unit tests; already correct; DO NOT touch
- `apps/mcp-server/src/__tests__/1570c-dinh-gia-snapshot.test.ts` `formatDinhGia()` units — already correct; DO NOT touch

---

## 6. Injection Strategy Reference (dev copy-paste template)

From `1881a-source-tier.test.ts` lines 92–135:

```typescript
beforeAll(async () => {
  await initDatabase();
  const originalFetch = globalThis.fetch;
  (globalThis as any).fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/snapshot")) {
      const snapshot = {
        status: "ok",
        fetchedAt: "2026-06-09T00:00:00Z",
        vnIndex: 1282.5,
        oilUsd: 84.0,
        goldUsd: 2350.0,
        usdVnd: 25400.0,
        dataSource: "live",
        signals: {
          carry: { regime: "NEUTRAL", carrySpread: 1.38, vndDepositRate: 5.0,
                   fedFundsRate: 3.62, is_estimate: false, source_tier: 2 },
          yield: { label: "CHEAP", spread: 3.2, earningYield: 8.2,
                   depositRate: 5.0, is_estimate: false, source_tier: 2 },
          oil: { impact: "NEUTRAL", priceUSD: 84.0 },
          gold: { direction: "BULLISH", priceUSD: 2350.0 },
          usdvnd: { direction: "STABLE", rateVND: 25400.0 },
          "investment-clock": { phase: "RECOVERY" }
        }
      };
      return new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(input, _init);
  };
  restoreFetch = () => { globalThis.fetch = originalFetch; };
});

afterAll(async () => {
  restoreFetch?.();
  closeDb();
  await initDatabase(); // singleton reinit per P7 contract
});
```

---

## 7. Build-Standard Classification

**BUILD-STANDARD: not-applicable** — test-only fix (BUG-FIX / REFACTOR within existing zone, no new primitives).

No new interfaces, no new services, no new domain objects. The fix is: rewrite test injection strategy from dead `_test*` params to `globalThis.fetch` mock, and update assertions from section-header strings to JSON field checks.

---

## 8. Recurring-Bug Pattern Note

This is the **second** major CI failure event in `macroTools.ts`:
1. First event (CI-TEST-ISOLATION-SPIKE, 2026-06-08): Injectable seam removed → 80-150 Class A failures in the 629-era taxonomy
2. This event (SPIKE-CI-C1-MACRO-INJECT-SEAM, 2026-06-09): Same dead seams still in 71 tests after two CI fix sprints

Root cause of recurrence: the P2-B1 seam removal was done without updating the tests. CI was RED for other reasons (Clusters 1+2 mock-contam + symlink ENOENT), masking the seam failures. Clusters 1+2 fix unmasked C1 as the largest residual.

**Guard recommendation:** When removing a `_test*` injection seam from any tool, add a task to update all test files that use that seam in the SAME sprint (not a follow-up). Pattern: `grep -r "_testCommodityClient\|_testSbvClient\|_testDinhGia" src/__tests__/` should return zero results after the seam removal commit.
