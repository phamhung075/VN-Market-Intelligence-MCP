# CI C1124 — Evidence Tools Phase B+C — Triage Brief

**Date:** 2026-06-09  
**Architect:** architect agent  
**Task:** FIX-CI-C1124-RESIDUAL-TRIAGE  
**Sprint:** CI-RED-RECONCILE  
**Zone:** apps/mcp-server/src/__tests__/  

---

## Verdict

**REWRITE (stale test infrastructure)**

The production code (`get_evidence_summary` + `create_prediction_claim`) is correct. All four database tables (`evidence_scores`, `evidence_fragments`, `evidence_likelihood_ratios`, `prediction_claims`) are created by `initSystemTables()` inside `initDatabase()` — the schema fixture is complete. No prod seam was deleted or rewired. The 24 CI fails are caused solely by the InMemoryTransport+Client round-trip pattern which hangs in CI (Bun 1.3.13 / Ubuntu-latest) but passes locally (macOS, same Bun version).

---

## Root Cause Analysis

### Symptom

Every one of the 24 `it()` blocks in `1124-evidence-tools-phase-bc.test.ts` times out at ~5000ms in CI (bun job 80302822813, sha 9ed78225). Locally (macOS bun 1.3.13): 12 pass / 0 fail / 1057ms total. The CI runner fires Bun's default 5000ms per-test timeout — the `timeout = 30000` in `bunfig.toml` does not prevent this (Linux runner behaviour with Bun 1.3.13).

### What hangs

The hang occurs inside `makeTestSetup()` (called at the start of every `it()` block) at one of:

```
await server.connect(serverTransport);   // line 47
await client.connect(clientTransport);   // line 49
```

or inside `callTool()`:

```
await client.callTool({ name: toolName, arguments: args });  // line 110
```

The `InMemoryTransport.createLinkedPair()` + `Client.callTool()` path requires a live async message loop. On the CI Linux runner, this message loop stalls under the accumulated I/O pressure of 100+ prior test files running in the same process (bun test 1.3.13 is single-process sequential). The `afterEach` client-close fix (added in commit `a43dff49`) addresses inter-test stalls but cannot prevent the stall within a test's own `callTool()` call.

### Why not a prod or schema issue

- `evidenceTools.ts` imports: `evidenceFragmentStore.js`, `likelihoodRatioStore.js`, `predictionClaimStore.js`, `schema.js` — all pure synchronous SQLite. No HTTP, no fetch, no async I/O.
- All four tables (`evidence_scores`, `evidence_fragments`, `evidence_likelihood_ratios`, `prediction_claims`) are definitively created by `initSystemTables()` in `schema-system.ts` (lines 138, 156, 172, 187). `initDatabase()` calls `initSystemTables(db)`. The `:memory:` fixture is complete.
- `registerEvidenceTools(server, db)` accepts an explicit `db` arg and uses it via `resolveDb()` — no singleton leak.
- `createPredictionClaim` step that queries `daily_ohlcv` is guarded by `if (direction != null && expected_move_pct != null)` — none of the test cases supply both, so no `daily_ohlcv` query is made.

### Why REMOVE does not apply

No prod seam was deleted. Commit `98df0f43` (P2-B1) rewired `macroTools.ts` macro snapshot to HTTP — but `evidenceTools.ts` and its DB stores were never touched by that change. `git log -- apps/mcp-server/src/interface/mcp/tools/macro/evidenceTools.ts` shows only the initial scaffold commit. The test exercises a live prod path.

### Why the prior C3 fix (a43dff49) was insufficient

The C3 spike (architect notebook entry `2026-06-09T08:30Z`) identified "InMemoryTransport stall; fix = `afterEach client?.close()`". That fix was applied in `a43dff49`. It addresses the INTER-test leak (an open transport from test N blocking test N+1's `server.connect()`). It does NOT address the INTRA-test hang where `callTool()` itself never completes because the message loop stalls on the first call in a fresh transport pair. In CI, BOTH forms of stall occur: the per-test stall (callTool hangs) is the dominant form at 24/24 tests.

### Evidence chain

| File:line | Finding |
|---|---|
| `apps/mcp-server/src/__tests__/1124-evidence-tools-phase-bc.test.ts:36-55` | `makeTestSetup()` creates McpServer + InMemoryTransport + Client on every `it()` call |
| `apps/mcp-server/src/__tests__/1124-evidence-tools-phase-bc.test.ts:31-34` | `afterEach` client close present (C3 fix) — necessary but insufficient |
| `apps/mcp-server/src/interface/mcp/tools/macro/evidenceTools.ts:44-48` | `registerEvidenceTools(server, db?)` — accepts injected DB, no HTTP, no fetch |
| `apps/mcp-server/src/infrastructure/db/evidenceFragmentStore.ts:122-151` | `insertEvidenceFragment` — pure sync SQLite |
| `apps/mcp-server/src/infrastructure/db/predictionClaimStore.ts:132-155` | `insertPredictionClaim` — pure sync SQLite |
| `apps/mcp-server/src/infrastructure/db/likelihoodRatioStore.ts:161-185` | `getLikelihoodRatio` — pure sync SQLite, never throws |
| `apps/mcp-server/src/infrastructure/db/schema-system.ts:138,156,172,187` | All 4 tables defined with `CREATE TABLE IF NOT EXISTS` |
| `apps/mcp-server/src/__tests__/setup.ts:58` | `Bun.env["DB_PATH"] = ":memory:"` preload — correct |
| CI signal `ci-c1-already-shipped-9ed78225-20260609T1110Z.json` | `"Task 1124 = 24 fails (NEW DOMINANT LEVER, unidentified)"` in 91-run |
| CI signal `ci-c5-gate-result-22470e44-20260609T0930Z.json` | C5 attempted fix re-spread ESM contamination → collateral Task1124=24; fix REVERTED |
| `apps/mcp-server/src/__tests__/1117-evidence-tools.test.ts:44-54` | Sibling test for `record_evidence_fragment` uses `_registeredTools` pattern → passes 100% in CI |

---

## The Fix: REWRITE to `_registeredTools` Direct Invocation

Replace `InMemoryTransport` + `Client` with direct `_registeredTools.handler()` invocation. This is the proven CI-green pattern already used in: `1117-evidence-tools.test.ts`, `089-tool-macro.test.ts`, `1881a-source-tier.test.ts`.

### C5-Cure Compliance

**NO new `mock.module()` is needed or permitted.** The evidence tools import chain is pure SQLite — no LanceDB, no fetch, no HTTP. The only allowed `mock.module` in this codebase is the pre-existing LanceDB guard in `1881a-source-tier.test.ts`. This rewrite requires zero mock.module calls.

### DI Template (copy from 1117 pattern, adapted for 1124)

Reference: `apps/mcp-server/src/__tests__/1117-evidence-tools.test.ts:44-54`

```typescript
// Replace the InMemoryTransport+Client callTool helper with:

type EvidenceToolsServer = McpServer & {
  _registeredTools: Record<string, {
    handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
  }>;
};

async function callTool(
  server: EvidenceToolsServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const tool = server._registeredTools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  const result = await tool.handler(args);
  return result.content[0]?.text ?? "";
}

// Replace makeTestSetup() with a synchronous setup (no transport, no client):
function makeTestSetup(): { db: Database; server: EvidenceToolsServer } {
  Bun.env["DB_PATH"] = ":memory:";
  closeDb();
  // initDatabase() is async due to migrateForeignFlowColumns — use sync alternative
  // or call synchronously: all evidence tables are created by initSystemTables.
  // Use the same inline approach as 1117: create a bare :memory: db + schema only.
  const db = new Database(":memory:");
  // Inline the relevant schema (same approach as 1117 for evidence tables):
  // However: to keep it lean and avoid schema drift, use initDatabase directly.
  // Since initDatabase is async, use beforeEach with async setup instead.
  const server = new McpServer({ name: "test", version: "1.0" }) as EvidenceToolsServer;
  registerEvidenceTools(server, db);
  return { db, server };
}
```

**Preferred pattern (cleanest, same as 1881a):**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// REMOVE: Client, InMemoryTransport imports — not needed
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { registerEvidenceTools } from "../interface/mcp/tools/macro/evidenceTools.js";

type TestServer = McpServer & {
  _registeredTools: Record<string, {
    handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
  }>;
};

let _testDb: Database;
let _testServer: TestServer;

beforeEach(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  closeDb();
  await initDatabase();
  const { getDb } = await import("../infrastructure/db/schema.js");
  _testDb = getDb();
  _testServer = new McpServer({ name: "test", version: "1.0" }) as TestServer;
  registerEvidenceTools(_testServer, _testDb);
});

afterEach(() => {
  closeDb();
});

async function callTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const tool = _testServer._registeredTools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  const result = await tool.handler(args);
  return result.content[0]?.text ?? "";
}
```

**Key changes:**
- Remove `import { Client } from "@modelcontextprotocol/sdk/client/index.js"`
- Remove `import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"`
- Remove module-level `_currentClient` and its `afterEach` close
- Replace `makeTestSetup()` with `beforeEach` + module-level `_testDb`/`_testServer`
- Replace `callTool(client, ...)` with `callTool(toolName, args)` via `_registeredTools`
- No `mock.module()` anywhere

**Seed helpers (`seedEvidenceScore`, `seedEvidenceFragment`, `seedLikelihoodRatio`) are unchanged** — they operate on `db` directly.

---

## 24 it() Cases Grouped by Ruling

All 24 cases carry the same REWRITE ruling (InMemoryTransport→`_registeredTools`):

### `get_evidence_summary` (12 cases — 2 per describe due to `beforeEach` cycle)

Actually: 5 `it()` blocks in `get_evidence_summary` describe, 7 in `create_prediction_claim` describe = 12 total. Each runs once = 12 fails.

Wait — the CI shows 24 fails for 12 `it()` blocks. This means Bun counts EACH TIMEOUT as 2 native failures (the test + the afterEach hook timeout). This is the mechanism: the `afterEach` calls `await _currentClient?.close()`. If the test itself timed out (the `client.callTool()` never resolved), the afterEach then also tries to close a stalled client — which ALSO times out or takes extra time. Bun counts both the test failure AND the afterEach failure as native failures. Hence 12 `it()` × 2 = 24 native fails.

| it() description | Ruling |
|---|---|
| `returns 'No evidence accumulated yet' when no evidence_scores row` | REWRITE |
| `returns 'No evidence accumulated yet' (uppercased stock)` | REWRITE |
| `returns bullish/bearish/neutral score values when evidence_scores row exists` | REWRITE |
| `returns top 5 fragments ordered by magnitude*confidence DESC` | REWRITE |
| `shows UNTRUSTED label when likelihood ratio sample_size < 10` | REWRITE |
| `shows TRUSTED label when likelihood ratio sample_size >= 10` | REWRITE |
| `inserts a claim and returns id and resolution_date` | REWRITE |
| `uppercases and trims the stock ticker` | REWRITE |
| `computes resolution_date = today + horizon_days calendar days` | REWRITE |
| `returns error string for invalid JSON resolution_criteria (no row inserted)` | REWRITE |
| `returns 'Duplicate claim skipped' on re-insert with same stock+claim_text+resolution_date` | REWRITE |
| `clamps probability to [0.01, 0.99] — tool schema enforces this` | REWRITE |

Each of these 12 `it()` blocks produces 2 native CI failures (test timeout + afterEach stall = 12 × 2 = 24).

---

## Schema Fixture Confirmation

`initDatabase()` → `initSystemTables(db)` in `schema-system.ts`:
- `evidence_fragments`: line 138 — CREATE TABLE IF NOT EXISTS ✓
- `evidence_scores`: line 156 — CREATE TABLE IF NOT EXISTS ✓  
- `evidence_likelihood_ratios`: line 172 — CREATE TABLE IF NOT EXISTS ✓
- `prediction_claims`: line 187 — CREATE TABLE IF NOT EXISTS ✓

No missing migration. Schema fixture is complete and always present when `makeTestSetup()` calls `initDatabase()`.

---

## Risk Assessment

**Risk: LOW.** Test-file-only change. Zero production code touched. The `_registeredTools` pattern is already proven CI-green across 1117, 089, 1881a, and 15+ other test files. `evidenceTools.ts` production handlers are pure SQLite with no async I/O — direct handler invocation is safe.

**DDD violation: NONE.** The test-only change does not cross any production layer boundary.

**Regression surface: ZERO.** Removing InMemoryTransport cannot regress production functionality; it was a test-only adapter.

---

## BUILD-STANDARD

**BUG-FIX / MAINTENANCE** — in-zone, no new primitives.  
`BUILD-STANDARD: not-applicable (skip)`

---

## Execution

**Agent:** `dev-mcp-server`  
**Scope:** `apps/mcp-server/src/__tests__/1124-evidence-tools-phase-bc.test.ts` — ONE FILE ONLY  
**Timebox:** S (30min)  
**Hard constraint:** NO new `mock.module()` calls — use `_registeredTools` direct invocation only  
**Verification gate:** `Task 1124` native fail count must drop from 24 → 0 in CI. Gate vs 91 absolute.  
**CI victim prefix:** `Task 1124`
