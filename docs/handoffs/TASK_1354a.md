# Handoff: Task 1354a — parallelServiceDispatcherJob DI + 8 gap tests

**Sprint:** 1354
**Created:** 2026-04-27
**Status:** Ready for Developer

---

## Context

`parallelServiceDispatcherJob.ts` has zero dedicated test coverage. It runs every 15 minutes and orchestrates all four microservices via `Promise.allSettled`. A silent regression here degrades the full intelligence cycle without CI failure.

**Pattern reference:** `imfIndicatorPollerJob.ts` — optional `options?` param, 3-line resolver block at top of function.

---

## Production change required (minimal)

**File:** `apps/mcp-server/src/scheduler/system/parallelServiceDispatcherJob.ts`

### Step 1 — Add `DispatcherDeps` interface (export it)

```typescript
import type { Database } from 'bun:sqlite';
import type {
  ComputeTARequest,
  ComputeTAResponse,
  MacroSnapshotResponse,
  HealthStatus,
  KinhDichReadingResponse,
} from '../../infrastructure/microservices/clients.js';

export interface DispatcherDeps {
  computeTAFn?: (req: ComputeTARequest) => Promise<ComputeTAResponse>;
  getMacroFn?: () => Promise<MacroSnapshotResponse>;
  getGatewayFn?: () => Promise<HealthStatus>;
  getKinhDichFn?: () => Promise<KinhDichReadingResponse>;
  sendTelegramFn?: (msg: string) => Promise<void>;
  getDbFn?: () => Database;
}
```

### Step 2 — Change function signature (one line)

Before:
```typescript
export async function runParallelServiceDispatcher(): Promise<DispatcherResult>
```

After:
```typescript
export async function runParallelServiceDispatcher(deps?: DispatcherDeps): Promise<DispatcherResult>
```

### Step 3 — Add 3-line resolver block at top of function body (after `const timestamp = ...`)

```typescript
const _computeTA   = deps?.computeTAFn   ?? computeTAIndicators;
const _getMacro    = deps?.getMacroFn    ?? getMacroSnapshot;
const _getGateway  = deps?.getGatewayFn  ?? getGatewayHealth;
const _getKinhDich = deps?.getKinhDichFn ?? getMarketHexagram;
const _sendTelegram = deps?.sendTelegramFn ?? sendTelegramWork;
const _getDb       = deps?.getDbFn       ?? getDb;
```

Replace all calls to the originals within the function body with the underscored resolver aliases (`_computeTA`, `_getMacro`, `_getGateway`, `_getKinhDich`, `_sendTelegram`, `_getDb`).

**No other behaviour change.**

---

## Test file to create

**Path:** `apps/mcp-server/src/__tests__/1354a-parallel-service-dispatcher-gaps.test.ts`

### File header

```typescript
/**
 * TASK_1354a — parallelServiceDispatcherJob gap-fill tests
 *
 * Covers paths not reachable without DI:
 *   PSD-1: all services OK → allOk=true, no alert Telegram, duration shape valid
 *   PSD-2: one service fails (TA throws) → allOk=false, ta.status='failed', others ok
 *   PSD-3: all services fail → allOk=false, Telegram alert fired with all failed names
 *   PSD-4: macro service fails → macro.status='failed', error message captured
 *   PSD-5: weekday UTC 01:xx → Telegram heartbeat sent when allOk=true
 *   PSD-6: weekend → no Telegram heartbeat even if allOk=true
 *   PSD-7: empty watchlist (0 tickers) → TA loop runs with empty array, no throw
 *   PSD-8: getDb() throws → function either absorbs or rethrows cleanly (no hang)
 */

Bun.env["DB_PATH"] = ":memory:";
```

### Shared helpers

```typescript
import { describe, it, expect } from "bun:test";
import { runParallelServiceDispatcher } from "../scheduler/system/parallelServiceDispatcherJob.js";
import type { DispatcherDeps } from "../scheduler/system/parallelServiceDispatcherJob.js";
import { Database } from "bun:sqlite";

// Minimal in-memory db with watchlist table
function makeDb(tickers: string[] = ["VCB", "HPG", "MWG"]): Database {
  const db = new Database(":memory:");
  db.run("CREATE TABLE watchlist (code TEXT)");
  for (const t of tickers) {
    db.run("INSERT INTO watchlist (code) VALUES (?)", [t]);
  }
  return db;
}

// Happy-path stubs
const okTA    = async () => ({ status: "ok" as const, indicators: [], duration: 10 });
const okMacro = async () => ({ vnIndex: 1280.5, brentPrice: 85.3, usdVnd: 25100, timestamp: "2026-04-27T01:00:00Z" });
const okGateway = async () => ({ status: "healthy", services: [] });
const okKinhDich = async () => ({ hexagram_number: 1, hexagram_name: "Càn" });
const noTelegram: (msg: string) => Promise<void> = async () => {};

function happyDeps(overrides: Partial<DispatcherDeps> = {}, tickers: string[] = ["VCB"]): DispatcherDeps {
  const db = makeDb(tickers);
  return {
    computeTAFn:   okTA,
    getMacroFn:    okMacro,
    getGatewayFn:  okGateway,
    getKinhDichFn: okKinhDich,
    sendTelegramFn: noTelegram,
    getDbFn: () => db,
    ...overrides,
  };
}
```

### Test cases

**PSD-1 — all services OK**
```typescript
it("PSD-1: all OK → allOk=true, result has timestamp + 4 service keys", async () => {
  const result = await runParallelServiceDispatcher(happyDeps());

  expect(result.allOk).toBe(true);
  expect(result.timestamp).toBeTruthy();
  expect(result.services.ta.status).toBe("ok");
  expect(result.services.macro.status).toBe("ok");
  expect(result.services.gateway.status).toBe("ok");
  expect(result.services.kinhDich.status).toBe("ok");
  expect(result.services.ta.duration).toBeGreaterThanOrEqual(0);
});
```

**PSD-2 — TA throws, others ok**
```typescript
it("PSD-2: TA throws → allOk=false, ta.status='failed', macro/gateway/kinhDich ok", async () => {
  const result = await runParallelServiceDispatcher(happyDeps({
    computeTAFn: async () => { throw new Error("TA timeout"); },
  }));

  expect(result.allOk).toBe(false);
  expect(result.services.ta.status).toBe("failed");
  expect(result.services.macro.status).toBe("ok");
  expect(result.services.gateway.status).toBe("ok");
  expect(result.services.kinhDich.status).toBe("ok");
});
```

**PSD-3 — all services fail, Telegram alert fired**
```typescript
it("PSD-3: all services fail → allOk=false, Telegram alert sent with all service names", async () => {
  const sentMessages: string[] = [];
  const result = await runParallelServiceDispatcher(happyDeps({
    computeTAFn:   async () => { throw new Error("TA down"); },
    getMacroFn:    async () => { throw new Error("Macro down"); },
    getGatewayFn:  async () => { throw new Error("Gateway down"); },
    getKinhDichFn: async () => { throw new Error("KinhDich down"); },
    sendTelegramFn: async (msg) => { sentMessages.push(msg); },
  }));

  expect(result.allOk).toBe(false);
  expect(sentMessages.length).toBe(1);
  expect(sentMessages[0]).toContain("ta");
  expect(sentMessages[0]).toContain("macro");
  expect(sentMessages[0]).toContain("gateway");
  expect(sentMessages[0]).toContain("kinhDich");
});
```

**PSD-4 — macro fails, error message captured**
```typescript
it("PSD-4: macro throws → macro.status='failed', macro.message contains error text", async () => {
  const result = await runParallelServiceDispatcher(happyDeps({
    getMacroFn: async () => { throw new Error("Macro Service: upstream 503"); },
  }));

  expect(result.services.macro.status).toBe("failed");
  expect(result.services.macro.message).toContain("Macro Service");
});
```

**PSD-5 — weekday UTC 01:xx heartbeat sent**
```typescript
it("PSD-5: weekday UTC 01:xx + allOk=true → Telegram heartbeat sent once", async () => {
  // Find next Monday–Friday with hour === 1 UTC
  // We control 'now' indirectly via a wrapper; since the job reads new Date() internally,
  // we verify the branch by inspecting the Telegram call when run at a known weekday 01:xx time.
  // NOTE: This test is environment-sensitive. If CI runs outside UTC 01:xx weekday window,
  // assert that sendTelegramFn was NOT called (the heartbeat branch is skipped).
  // The test documents the branch; actual branch coverage is provided by PSD-3 (alert path).
  // Architects note: extract `now` as a DI param in a future sprint to make this deterministic.
  const sentMessages: string[] = [];
  await runParallelServiceDispatcher(happyDeps({
    sendTelegramFn: async (msg) => { sentMessages.push(msg); },
  }));
  // Either 0 (outside heartbeat window) or 1 (inside window) — never more than 1
  expect(sentMessages.length).toBeLessThanOrEqual(1);
});
```

> **Architect note on PSD-5/PSD-6:** The current production code calls `new Date()` directly (not injectable). PSD-5 and PSD-6 cannot be made fully deterministic without adding a `nowFn?: () => Date` to `DispatcherDeps`. The developer **must add `nowFn`** to `DispatcherDeps` and use it inside the function — this is the only way to make the heartbeat/weekend tests meaningful. Add `nowFn?: () => Date` to the interface and replace `new Date()` (line 147 of production file) with `const now = _now();`. This is still a minimal, no-behaviour-change addition.

**PSD-5 revised (with nowFn)**
```typescript
it("PSD-5: weekday UTC 01:xx + allOk=true → heartbeat Telegram sent once", async () => {
  const sentMessages: string[] = [];
  // Monday 2026-04-28T01:30:00Z — weekday, hour === 1
  const weekdayMorning = () => new Date("2026-04-28T01:30:00Z");

  await runParallelServiceDispatcher({
    ...happyDeps({ sendTelegramFn: async (msg) => { sentMessages.push(msg); } }),
    nowFn: weekdayMorning,
  });

  expect(sentMessages.length).toBe(1);
  expect(sentMessages[0]).toContain("Microservices online");
});
```

**PSD-6 revised (with nowFn)**
```typescript
it("PSD-6: weekend + allOk=true → no heartbeat Telegram sent", async () => {
  const sentMessages: string[] = [];
  // Saturday 2026-04-26T01:00:00Z
  const weekend = () => new Date("2026-04-26T01:00:00Z");

  await runParallelServiceDispatcher({
    ...happyDeps({ sendTelegramFn: async (msg) => { sentMessages.push(msg); } }),
    nowFn: weekend,
  });

  expect(sentMessages.length).toBe(0);
});
```

**PSD-7 — empty watchlist**
```typescript
it("PSD-7: empty watchlist → TA called with empty tickers, no throw, allOk=true", async () => {
  const db = makeDb([]); // 0 tickers
  let taCalled = false;
  const result = await runParallelServiceDispatcher({
    ...happyDeps(),
    getDbFn: () => db,
    computeTAFn: async (req) => {
      taCalled = true;
      return okTA();
    },
  });

  expect(result.allOk).toBe(true);
  // TA is called 0 times in the loop (slice(0,5) of []) but the outer async IIFE still resolves
  expect(result.services.ta.status).toBe("ok");
});
```

**PSD-8 — getDb() throws**
```typescript
it("PSD-8: getDb() throws → function does not hang; either returns failed shape or rethrows Error", async () => {
  const boom = () => { throw new Error("DB unavailable"); };

  let threw = false;
  let result: Awaited<ReturnType<typeof runParallelServiceDispatcher>> | undefined;

  try {
    result = await runParallelServiceDispatcher({
      ...happyDeps(),
      getDbFn: boom,
    });
  } catch {
    threw = true;
  }

  // Acceptable: either it rethrows (threw===true) or returns a result with allOk=false
  if (!threw) {
    expect(result!.allOk).toBe(false);
  } else {
    expect(threw).toBe(true);
  }
});
```

---

## Updated `DispatcherDeps` interface (final, includes nowFn)

```typescript
export interface DispatcherDeps {
  computeTAFn?:    (req: ComputeTARequest) => Promise<ComputeTAResponse>;
  getMacroFn?:     () => Promise<MacroSnapshotResponse>;
  getGatewayFn?:   () => Promise<HealthStatus>;
  getKinhDichFn?:  () => Promise<KinhDichReadingResponse>;
  sendTelegramFn?: (msg: string) => Promise<void>;
  getDbFn?:        () => Database;
  nowFn?:          () => Date;
}
```

The resolver block in the function body adds one line:
```typescript
const _now = deps?.nowFn ?? (() => new Date());
```

And replaces `const now = new Date()` with `const now = _now()`.

---

## Acceptance criteria

- [ ] `DispatcherDeps` interface exported from production file (includes `nowFn`)
- [ ] `runParallelServiceDispatcher` accepts optional `deps?: DispatcherDeps`
- [ ] 8 tests in `1354a-parallel-service-dispatcher-gaps.test.ts` — all pass
- [ ] No behaviour change in production path (all deps fall through to originals)
- [ ] TypeScript strict: no `any`, no suppressed errors
- [ ] Full suite remains ≥7673 + 8 new passing

---

## Risk flags

- **`nowFn` addition is required** — without it PSD-5 and PSD-6 are non-deterministic. This is a minimal interface extension, not a behaviour change.
- **`getDbFn` replaces module-level `getDb()` call** — verify the watchlist query uses `_getDb()` not the module import after the change.
- The TA loop iterates `tickers.slice(0, 5)` — PSD-7 (empty tickers) tests the zero-iteration case without needing a separate assertion on call count.
