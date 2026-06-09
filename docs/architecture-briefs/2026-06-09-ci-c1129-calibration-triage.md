# Architecture Brief — CI C1129 Calibration Triage
**Date:** 2026-06-09
**Task:** FIX-CI-C1129-RESIDUAL-TRIAGE
**Sprint:** CI-RED-RECONCILE (active_sprints[24])
**Author:** architect
**Scope:** Prod-vs-test triage only. No fix written. No board flip. PO opens dev-fix task.

---

## 1. Observed Failure Signature

**File:** `apps/mcp-server/src/__tests__/1129-calibration-tools.test.ts`
**Tool under test:** `get_calibration_report`
**CI run:** sha 8916675a, run 27205559638, bun_job 80320331863
**Fail count:** 5 it() × 2 = 10 native fails (5 test timeouts + 5 stalled afterEach client.close())
**Timing:** All 5 it() blocks at ~5003ms — uniform 5000ms timeout fingerprint.

The 5003ms uniform timeout fingerprint is the canonical **1124-transport-hang** signature:
InMemoryTransport + MCP Client.callTool() async message loop stalls on Bun 1.3.13 / Ubuntu-latest
single-process sequential runner. The stall occurs because the SDK's async message pump never
yields on this platform/runner combination, causing every it() to exhaust its 5000ms Bun test
timeout. The afterEach `client?.close()` then also stalls (same transport still blocked),
producing the ×2 failure count arithmetic observed: 5 it() timeout + 5 afterEach stall = 10.

---

## 2. Signature Classification

**Verdict: (a) — 1124-transport-hang. REWRITE.**

---

## 3. Raw Evidence

### 3.1 Prod register function — file:line

**File:** `apps/mcp-server/src/interface/mcp/tools/macro/calibrationTools.ts`
**Register function:** `registerCalibrationTools` at line 276.

```ts
export function registerCalibrationTools(
  server: McpServer,
  db?: Database,          // ← db-injection arg PRESENT (optional)
): void {
  const resolveDb = () => db ?? getDb();
  // ...
  server.tool("get_calibration_report", ..., async ({ date }) => { ... });
}
```

**SQLite or HTTP-proxy?** Pure SQLite. No `fetch`, no HTTP proxy, no port reference, no
`globalThis.fetch`, no microservice call anywhere in `calibrationTools.ts`. The tool imports:
- `calibrationSnapshotStore.ts` — pure SQLite CRUD (parameterized queries)
- `marketMessageStore.ts` — pure SQLite CRUD
- `schema.ts::getDb` — SQLite singleton (used as fallback when `db` arg is omitted)

The git log shows **no HTTP-proxy migration commit** for this file. Last substantive change is
commit `1f6363e1` (task(1129): add get_calibration_report MCP tool), then minor description and
diacritics fixes. The `98df0f43` macro-rewire commit that converted 4 macro tools to HTTP proxies
did NOT touch calibrationTools.ts.

### 3.2 db-injection arg check

`registerCalibrationTools(server, db?: Database)` — `db` is an **optional** second argument at
line 276–279. The test already passes `db` correctly (`registerCalibrationTools(server, db)`) at
line 38 of the victim test. The DI seam is live and has never been removed.

### 3.3 Deleted-seam check (signature b rule-out)

No `_testReferenceDate`, no `_testDb` module-level seam, no `_testFallback` — none of these
are referenced in `calibrationTools.ts` or its imports. The seam the test needs is purely the
`db?: Database` constructor argument, which is present. Signature (b) is ruled out.

### 3.4 Genuine prod bug check (signature c rule-out)

The handler logic is correct:
- `snapshot === null` → returns `NO_DATA_MESSAGE` (AC-5, AC-7b)
- `snapshot.total_resolved === 0` → returns "no resolved predictions" message (AC-extra)
- Otherwise → calls `formatFullReport(snapshot)` (AC-6, AC-7)

The `date` param is passed to `getCalibrationSnapshotByDate(database, date)` when non-null,
or `getLatestCalibrationSnapshot(database)` otherwise. Both store functions are pure SQLite and
have no logic defects. Signature (c) is ruled out.

### 3.5 Current test harness — the stalling pattern

The victim test uses:
```ts
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
const client = new Client({ name: "test-client", version: "1.0" });
await client.connect(clientTransport);
// ...
const result = await client.callTool({ name: "get_calibration_report", arguments: {} });
```
The `makeTestSetup()` helper builds this per-it() via `beforeEach`. The `afterEach` closes the
client only (`client?.close()`) but the test server's transport is never explicitly closed.
Both the `callTool()` await and the `client.close()` stall on Bun 1.3.13 / Ubuntu-latest.

### 3.6 C5-CURE compliance check

The existing test has NO `mock.module()` calls anywhere. The only imports are:
`bun:test`, `bun:sqlite`, `@modelcontextprotocol/sdk/server/mcp.js`,
`@modelcontextprotocol/sdk/client/index.js`, `@modelcontextprotocol/sdk/inMemory.js`,
`schema.js`, `calibrationTools.js`, `calibrationSnapshotStore.js`.

The REWRITE must add zero new file-top `mock.module()`. The prod import chain is:
`calibrationTools.ts` → `calibrationSnapshotStore.ts` (pure SQLite) + `marketMessageStore.ts`
(pure SQLite) + `schema.ts::getDb` (SQLite singleton). No LanceDB, no retriever.js, no RAG.
The shared retriever.js LanceDB guard is **not needed** for this rewrite (no LanceDB in
the import chain). Zero mock.module() required.

---

## 4. Rewrite Template

Apply the proven 1134 template (commit 8916675a, CI-green). Exact structure:

```ts
// ─ File-top imports (NO mock.module()) ─────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Database } from "bun:sqlite";
import { registerCalibrationTools } from "../interface/mcp/tools/macro/calibrationTools.js";
import {
  insertCalibrationSnapshot,
  type CalibrationSnapshotInput,
} from "../infrastructure/db/calibrationSnapshotStore.js";

// ─ RegisteredToolsServer type ───────────────────────────────────────────────
interface McpTextResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

type RegisteredToolsServer = {
  _registeredTools: Record<string, {
    handler: (args: Record<string, unknown>) => Promise<McpTextResult>;
  }>;
};

// ─ Module-level fixtures ────────────────────────────────────────────────────
let _testDb: Database;
let _testServer: McpServer;

// ─ Setup / Teardown ─────────────────────────────────────────────────────────
beforeEach(() => {
  _testDb = buildInMemoryDb();   // CREATE TABLE calibration_snapshots inline (IF NOT EXISTS)
  _testServer = new McpServer({ name: "test", version: "0.0.1" });
  registerCalibrationTools(_testServer, _testDb);
});

afterEach(() => {
  _testDb.close();
});

// ─ callTool helper ──────────────────────────────────────────────────────────
async function callTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpTextResult> {
  const tool = (_testServer as unknown as RegisteredToolsServer)._registeredTools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  return await tool.handler(args);
}
```

The `buildInMemoryDb()` function must create the `calibration_snapshots` table with the exact
DDL from `schema-system.ts` lines 213–227 (all 12 columns, matching types). No call to
`initDatabase()` — inline DDL only (Contract-B pattern, avoids schema-singleton coupling).

The `makeSnapshot()` fixture helper can be ported verbatim from the existing test.

---

## 5. Per-AC Zod-Bypass Adaptation Notes

The `get_calibration_report` Zod schema is:
```ts
{ date: z.string().optional() }
```

**AC-5** (`arguments: {}` — no `date` key):
- `z.string().optional()` with no `.default()`: when `date` is absent from the args object,
  the handler receives `{ date: undefined }` on the direct path. This is identical to the
  protocol path (optional with no default = undefined when absent).
- **No adaptation needed.** Pass `{}` or `{ date: undefined }` — both work.

**AC-extra** (`arguments: {}` — same as AC-5):
- Same analysis. `date` = undefined → `getLatestCalibrationSnapshot(database)` is called.
- **No adaptation needed.**

**AC-6** (`arguments: {}` — same):
- **No adaptation needed.**

**AC-7** (`arguments: { date: "2026-04-06" }`):
- Direct string value passed explicitly. No Zod transformation involved for `z.string()`.
- **No adaptation needed.**

**AC-7b** (`arguments: { date: "2026-01-01" }`):
- Same as AC-7. **No adaptation needed.**

**Summary:** The `date` arg is `z.string().optional()` with no `.default()` and no `.coerce`.
There is zero Zod-bypass adaptation risk for any of the 5 ACs. The direct-handler path receives
the same values as the protocol path for all test cases.

The `get_label_accuracy_report` tool has `since_days: z.coerce.number()...default(90)` but that
tool is **not under test in 1129**. No cross-contamination.

---

## 6. Protecting Sibling Tests (domain coverage)

Since verdict is REWRITE (not REMOVE), the sibling coverage question is informational:

- `apps/mcp-server/src/__tests__/1127-calibration-snapshot-store.test.ts` — unit tests for
  `calibrationSnapshotStore.ts` (insert/read/date-filter). Covers the DB layer independently.
- `apps/mcp-server/src/__tests__/1173-calibration-label-integration.test.ts` — integration
  coverage for label accuracy path.
- `apps/mcp-server/src/__tests__/1392-calibration-report-diacritics.test.ts` — diacritics
  sweep for calibration tool output.

The REWRITE of 1129 preserves all 5 it() ACs. Domain coverage is retained end-to-end.

---

## 7. Preconditions for Dev (REWRITE gate)

Before applying the rewrite template, dev must verify:
1. `registerCalibrationTools` signature at `calibrationTools.ts:276` — CONFIRMED: `db?: Database` present.
2. No HTTP proxy in prod tool — CONFIRMED: pure SQLite.
3. `insertCalibrationSnapshot(db, input)` exported from `calibrationSnapshotStore.ts` — CONFIRMED at line 156.
4. Zero `mock.module()` in victim test — CONFIRMED: none present.
5. `calibration_snapshots` DDL in `schema-system.ts:213` — CONFIRMED: 12 columns, IF NOT EXISTS safe.

All preconditions met. REWRITE is unblocked.

---

## 8. BUILD-STANDARD Classification

**BUG-FIX / MAINTENANCE** — test harness transport replacement, zero new primitives.
`BUILD-STANDARD: not-applicable`

---

## 9. Risk Flags

- **None.** The rewrite is a pure test-harness swap: InMemoryTransport → direct handler.
  No production code changes. No new imports. No Zod-bypass adaptation required.
  `calibration_snapshots` inline DDL is idempotent. The store functions are synchronous-safe
  when called from a direct-handler (no async transport needed).
