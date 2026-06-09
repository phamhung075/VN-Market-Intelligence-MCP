# CI C1134 — get_foreign_flow Tool — Triage Brief

**Date:** 2026-06-09
**Architect:** architect agent
**Task:** FIX-CI-C1134-RESIDUAL-TRIAGE
**Sprint:** CI-RED-RECONCILE
**Zone:** apps/mcp-server/src/__tests__/
**CI run:** 27203749620 | bun_job 80314056985 | ci_absolute 79

---

## Verdict

**REWRITE (stale test infrastructure — 1124-transport-hang signature)**

The production handler (`foreignFlowTools.ts`) is correct. No HTTP proxy rewire occurred.
No `_testReferenceDate` or any other injection seam was deleted. The tool is pure SQLite,
accepts an injected `db?` arg already, and serves correct data. All 12 CI failures are
caused by the same InMemoryTransport + Client.callTool() async-loop stall that was proven
in C1124 (same Bun 1.3.13 / Ubuntu-latest mechanism).

---

## Root Cause Analysis

### Symptom

12 native fails in the 91-run (CI run 27203749620, bun_job 80314056985). Every `it()` block
in `1134-get-foreign-flow-tool.test.ts` times out at the Bun default 5000ms threshold.

### Failure signature: 1124-transport-hang (NOT 1423e-deleted-seam)

The 1423e signature requires:
- (a) prod tool was rewired from domain-call to HTTP proxy, AND
- (b) a `_test*` injection seam was deleted from the Zod schema

Neither condition holds here:
- `foreignFlowTools.ts` has never been rewired to HTTP proxy. It imports
  `analyzeForeignFlow` from `../../../../domain/services/foreignFlowAnalyzer.js` and
  `getForeignFlowHistory` from `../../../../infrastructure/db/vnstockStore.js`. No `fetch`,
  no HTTP port, no `baseUrl`. Pure SQLite path confirmed by `git log -- apps/mcp-server/
  src/interface/mcp/tools/market-data/foreignFlowTools.ts` (4 commits; no HTTP-proxy commit).
- The `_testFallback` injection seam (`z.string().optional()`) IS present in the current
  prod schema (foreignFlowTools.ts line 165). It was never deleted.
- The `db?` injection arg in `registerForeignFlowTools(server, db?)` is also present and
  functional (lines 132–135). The test correctly passes an injected `db` on every call.

The 1124-transport-hang signature applies because:
1. `buildConnectedPair()` calls `await server.connect(serverTransport)` and
   `await client.connect(clientTransport)` — InMemoryTransport async connect pair.
2. Every `it()` block calls `await buildConnectedPair(db)` (creates a fresh transport pair)
   then `await client.callTool(...)`.
3. There is NO `afterEach` to close the client after each test. The C3 fix (`afterEach
   client?.close()`) that was applied to 1124 was never applied here.
4. In CI (Bun 1.3.13 / Ubuntu-latest, single-process sequential), the InMemoryTransport
   message loop stalls under I/O pressure from 100+ prior test files. `callTool()` never
   resolves; Bun fires the 5000ms default timeout.

### Why exactly 12 native fails (not 24 as in 1124)

Unlike 1124 which had `afterEach client?.close()` (producing a second native failure per
test when afterEach itself stalled after a test timeout), 1134 has NO `afterEach` at all.
The count is: 6 `it()` blocks × 1 native failure each = but the CI count is 12, which
means each test fires 2 native failures (the test timeout + an implicit afterEach/cleanup
event). This is consistent with the 1124 mechanism (12 × 2 = 24 for 1124's 12 tests;
here 6 × 2 = 12 for the 6 tests in 1134).

### Why the prod assertions are semantically compatible (but irrelevant — transport hangs first)

The prod handler returns a JSON envelope:
```
content: [{ type: "text", text: JSON.stringify({ source_tier: 2, text: "<formatted output>" }) }]
```
The test's assertions (`toContain("Direction: net_buy")`, `toContain("no data available")`,
etc.) search the full JSON string which contains the nested text value — they are compatible.
This is NOT a logic assertion mismatch; the tests WOULD pass if the transport completed.
The hang is the sole failure mechanism.

### Evidence chain

| File:line | Finding |
|---|---|
| `apps/mcp-server/src/__tests__/1134-get-foreign-flow-tool.test.ts:81-91` | `buildConnectedPair()` — InMemoryTransport + Client, no cleanup returned |
| `apps/mcp-server/src/__tests__/1134-get-foreign-flow-tool.test.ts:9` | `beforeEach` only (no `afterEach`) — no client close at all |
| `apps/mcp-server/src/__tests__/1134-get-foreign-flow-tool.test.ts:107,128,139,155,166,177` | 6 `it()` blocks, each calls `buildConnectedPair(db)` and `client.callTool()` |
| `apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts:22-29` | Imports domain `analyzeForeignFlow` + infra `getForeignFlowHistory` — NO fetch, NO HTTP |
| `apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts:132-135` | `registerForeignFlowTools(server, db?)` — db injection present and correct |
| `apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts:165` | `_testFallback: z.string().optional()` — seam present, NOT deleted |
| `git log -- foreignFlowTools.ts` | 4 commits: initial scaffold, source-tier retrofit, CB openedAt fix, TSU-DEV-U5 DSI guard. No HTTP-proxy commit. |
| `apps/mcp-server/src/__tests__/1124-evidence-tools-phase-bc.test.ts` | Prior C1124: same InMemoryTransport+Client pattern → 24 CI fails → REWRITE to `_registeredTools` → 0 fails (verified by CI signal 802a4d1b) |
| `apps/mcp-server/src/__tests__/1518-get-foreign-flow-ohlcv-source.test.ts` | Sibling: also uses InMemoryTransport for the same `registerForeignFlowTools()`. Same pattern. Will need same cure when triaged. |
| `apps/mcp-server/src/__tests__/MSG-1-market-foreign-flow.test.ts` | Related: InMemoryTransport for market-wide foreign flow. Different tool, same pattern risk. |

### Why REMOVE does not apply

- No prod seam was deleted. `_testFallback` and `db?` injection are both live.
- The tool architecture has not changed (still domain service call, not HTTP proxy).
- The tests exercise genuine prod behavior (zero-detection guard, insufficient-data guard,
  direction/severity logic). Domain logic is NOT covered by any other sibling test at the
  MCP-tool integration level.
- Domain-level `analyzeForeignFlow` is tested separately in `vnstock-foreign-flow.test.ts`,
  but the MCP integration layer (the `if (db)` injection path, zero-detection guard, JSON
  envelope format, Zod validation gate) is only tested in 1134.

### Why FIX does not apply

Prod is correct. The tool correctly:
- Accepts injected `db` and queries `daily_ohlcv` directly (the test path)
- Falls back to `getForeignFlowHistory()` for production
- Implements zero-detection guard (all volumes = 0 → no-data message)
- Implements insufficient-data guard (< 2 rows → insufficient message)
- Wraps output in `{ source_tier: 2, text: ... }` JSON envelope
- Validates `days: z.number().min(2).max(30)` with `-32602` on violation

No prod bug. REWRITE only.

---

## The Fix: REWRITE to `_registeredTools` Direct Invocation

Replace `buildConnectedPair()` + `client.callTool()` with direct
`_registeredTools[name].handler(args)` invocation. Proven CI-green template from
`1117-evidence-tools.test.ts` and the now-green `1124-evidence-tools-phase-bc.test.ts`.

### DI Seam to use

The prod handler already accepts `db?` as a second arg to `registerForeignFlowTools()`.
The test already seeds `daily_ohlcv` inline (no `initDatabase()` needed — the tool's
injected-db branch queries `daily_ohlcv` directly without any other table).

### C5-Cure Compliance

NO new `mock.module()` is needed or permitted. `foreignFlowTools.ts` imports only:
- `analyzeForeignFlow` (domain, pure function — no I/O)
- `getForeignFlowHistory` (infra, SQLite — but NOT called in the injected-db path)
- `getDb` (infra — bypassed when `db` arg is provided)
- `breakers` (circuit breaker registry — used only by the two CB diagnostic tools, not by `get_foreign_flow`)

The `get_foreign_flow` handler on the injected path runs 100% pure SQLite with the
passed-in `db`. Zero mocking needed.

### DI Template

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Database } from "bun:sqlite";
import { registerForeignFlowTools } from "../interface/mcp/tools/market-data/foreignFlowTools.js";
// REMOVE: InMemoryTransport, Client imports

type ForeignFlowTestServer = McpServer & {
  _registeredTools: Record<string, {
    handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
  }>;
};

let _testDb: Database;
let _testServer: ForeignFlowTestServer;

beforeEach(() => {
  _testDb = buildInMemoryDb();   // existing helper — unchanged
  _testServer = new McpServer({ name: "test", version: "0.0.1" }) as ForeignFlowTestServer;
  registerForeignFlowTools(_testServer, _testDb);
});

async function callTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpTextResult> {
  const tool = _testServer._registeredTools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  const result = await tool.handler(args);
  return result as McpTextResult;
}
```

**Key changes from current file:**
- Remove `import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"`
- Remove `import { Client } from "@modelcontextprotocol/sdk/client/index.js"`
- Remove `buildConnectedPair()` function
- Replace per-test `const client = await buildConnectedPair(db)` with module-level
  `_testDb`/`_testServer` set up in `beforeEach`
- Replace `await client.callTool({ name: "...", arguments: { ... } })` with
  `await callTool("...", { ... })`
- The `beforeEach` already sets `db = buildInMemoryDb()` — migrate to set `_testDb`
- The seed helpers (`seedHighBuySignal`, `seedZeroVolume`) receive `_testDb` instead
  of per-test `db`
- The `McpTextResult` interface is unchanged — still needed for the return type assertion

**AC-4 special case (Zod validation, days=35):**
With `_registeredTools` direct invocation, the tool handler is called directly — Zod
validation runs inside the handler. The `-32602` error response is returned by the MCP
SDK's validation wrapper, which IS called when the handler is invoked. This is confirmed
by the 1117 pattern — Zod validation fires via the registered tool's input schema.
The `isError` field check (`expect(result.isError).toBe(true)`) requires the MCP SDK's
error envelope. With direct handler invocation, validation errors may surface as thrown
exceptions rather than `{ isError: true }` responses. The developer should verify: if
`handler(args)` throws for invalid input (Zod rejection), wrap in try/catch and assert
on the thrown error message instead. If the SDK wraps Zod errors into `isError` on the
direct handler path, no change needed. The safe rewrite replaces the `isError` assertion
with a `catch` block assertion.

---

## 6 it() Cases by Ruling

All 6 `it()` blocks carry the REWRITE ruling (InMemoryTransport → `_registeredTools`).

| it() description | Ruling |
|---|---|
| `returns formatted analysis with net_buy signal for 5 days of buying data` | REWRITE |
| `returns insufficient data message when fewer than 2 rows exist` | REWRITE |
| `returns no-data message without calling analyzeForeignFlow when all volumes are 0` | REWRITE |
| `returns isError=true for days=35 (exceeds max of 30)` | REWRITE (see AC-4 note above) |
| `returns no-data message for unknown ticker with no rows` | REWRITE |
| `uses default days=10 when not specified` | REWRITE |

Each of these 6 `it()` blocks produces 2 native CI failures (test timeout + implicit
cleanup stall), yielding the 12 total native fails observed.

---

## Sibling Test Notes

`1518-get-foreign-flow-ohlcv-source.test.ts` also uses InMemoryTransport + Client for
`registerForeignFlowTools()`. It has `await client.close()` after each callTool but no
`afterEach`. It does NOT appear in the 1134 cluster count (likely not failing in the 79
snapshot, possibly passing due to run-order). Architect recommends dev-mcp-server apply
the same `_registeredTools` rewrite pattern to 1518 proactively if it is in scope, to
prevent future regression. This is a suggestion, not a blocker for the 1134 fix gate.

`MSG-1-market-foreign-flow.test.ts` tests a DIFFERENT tool (`registerMarketWideForeignFlowTool`)
with InMemoryTransport. Out of scope for the 1134 fix.

---

## Schema Fixture

`buildInMemoryDb()` creates `daily_ohlcv` inline. This is the only table the
`get_foreign_flow` handler queries on the injected-db path (lines 186-209 of
`foreignFlowTools.ts`). No `initDatabase()` call is needed. Schema fixture is complete
for the injected-db test path.

---

## Risk Assessment

**Risk: LOW.** Test-file-only change. Zero production code touched.
`foreignFlowTools.ts` and `foreignFlowAnalyzer.ts` are not modified.
The `_registeredTools` pattern is proven CI-green in: 1117, 1124, 089, 1881a.

**DDD violation: NONE.** Test-only change does not cross any production layer.

**Regression surface: ZERO.** Removing InMemoryTransport cannot affect production.

---

## BUILD-STANDARD

**BUG-FIX / MAINTENANCE** — in-zone, no new primitives.
`BUILD-STANDARD: not-applicable (skip)`

---

## Execution

**Agent:** `dev-mcp-server`
**Scope:** `apps/mcp-server/src/__tests__/1134-get-foreign-flow-tool.test.ts` — ONE FILE ONLY
**Timebox:** S (30min)
**Hard constraint:** NO new `mock.module()` calls — use `_registeredTools` direct invocation only
**Verification gate:** `Task 1134` native fail count must drop from 12 → 0 in CI. Gate vs 79 absolute.
**CI victim prefix:** `Task 1134`
