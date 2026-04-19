# TASK_1485a — RED: mock isolation regression test

task: 1485_a
phase: RED
sprint: 186
req_ref: fix(test-isolation) — 047 mock.module poisons 034+1254+1163+vnstock

---

## Goal

Write `src/__tests__/1485-telegram-mock-isolation.test.ts` — a test that:
1. Simulates 047 running first by calling `mock.module` on `../infrastructure/notifiers/telegram.js` with a stub that returns `{ ok: true }` (CoreSendResult shape, not boolean)
2. Imports `sendTelegramMarket` from the same path
3. Asserts the stub is active (returns a non-boolean object)
4. Then applies a `mock.module` override restoring the real signature
5. Imports again and asserts `sendTelegramMarket` with a missing-token env returns `false` (real logic, boolean)

This test MUST FAIL red before the GREEN fix because step 5 will receive the stub (non-boolean) instead of the real function.

---

## File to create

`src/__tests__/1485-telegram-mock-isolation.test.ts`

```typescript
Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1485 — Telegram mock.module isolation regression
 *
 * Proves that mock.module() is process-global in Bun:
 *   - When 047 stubs telegram.js before this file runs, victims receive the stub.
 *   - After applying a local mock.module override, the real module is restored.
 *
 * RED phase: step 5 fails because victim has no override yet.
 */

import { describe, it, expect } from "bun:test";
import { mock } from "bun:test";

describe("Task 1485 — mock.module isolation regression", () => {
  it("RED: after 047-style stub, sendTelegramMarket returns stub shape, not boolean", async () => {
    // Step 1 — simulate 047 stub (CoreSendResult-shape, not boolean)
    mock.module("../infrastructure/notifiers/telegram.js", () => ({
      sendTelegramMarket: async (_msg: string, _opts?: unknown) => ({ ok: true, result: {} }),
      notifyTelegramAlert: async () => ({ ok: true }),
      notifyTelegramDocument: async () => ({ ok: true }),
      sendTelegramWork: async () => ({ ok: true }),
      sendTelegramBug: async () => ({ ok: true }),
    }));

    // Step 2 — import (receives stub due to module cache)
    const { sendTelegramMarket: stubbed } = await import(
      "../infrastructure/notifiers/telegram.js"
    );

    // Step 3 — confirm stub is active (returns object, not boolean)
    const stubResult = await stubbed("test");
    expect(typeof stubResult).toBe("object"); // stub shape

    // Step 4 — apply override that restores real module exports
    // (In GREEN phase the victim files do this; here we do it inline)
    const realMod = await import("../infrastructure/notifiers/telegram.js?real");
    // Note: Bun cache means we must use mock.module to re-register real impl
    mock.module("../infrastructure/notifiers/telegram.js", () => ({
      sendTelegramMarket: realMod.sendTelegramMarket,
      notifyTelegramAlert: realMod.notifyTelegramAlert,
      notifyTelegramDocument: realMod.notifyTelegramDocument,
      sendTelegramWork: realMod.sendTelegramWork,
      sendTelegramBug: realMod.sendTelegramBug,
    }));

    // Step 5 — import again (should now get real function)
    delete (Bun.env as Record<string, string | undefined>).TELEGRAM_BOT_TOKEN;
    delete (Bun.env as Record<string, string | undefined>).TELEGRAM_INFO_MARKET_GROUP_ID;

    const { sendTelegramMarket: real } = await import(
      "../infrastructure/notifiers/telegram.js"
    );

    const result = await real("hello");
    // RED: this fails because Bun module cache still returns stub from step 1
    // GREEN: passes after victim files apply mock.module override at file top
    expect(typeof result).toBe("boolean");
    expect(result).toBe(false);
  });

  it("RED: 034-style dynamic import receives poisoned stub when no override present", async () => {
    // Set stub again (simulates 047 running before 034 in process)
    mock.module("../infrastructure/notifiers/telegram.js", () => ({
      sendTelegramMarket: async () => ({ ok: true, result: {} }),
      notifyTelegramAlert: async () => ({ ok: true }),
      notifyTelegramDocument: async () => ({ ok: true }),
      sendTelegramWork: async () => ({ ok: true }),
      sendTelegramBug: async () => ({ ok: true }),
    }));

    // Victim import (034-style: dynamic import inside test, no override at top)
    const { sendTelegramMarket } = await import(
      "../infrastructure/notifiers/telegram.js"
    );

    // With token present, real impl returns boolean true
    // With stub active, returns object — so typeof !== "boolean"
    Bun.env.TELEGRAM_BOT_TOKEN = "test-token";
    Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = "99999";

    const mockFetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: {} }),
        text: async () => '{"ok":true}',
      } as unknown as Response);

    const result = await sendTelegramMarket("hello", { fetchFn: mockFetch });

    // RED: stub returns object, real returns boolean true
    // After GREEN fix (mock.module override at top of 034), this becomes true
    expect(typeof result).toBe("boolean");
    expect(result).toBe(true);
  });
});
```

---

## Why this approach

Bun's `mock.module()` writes to a **process-global module registry**. When 047 calls it, the registration persists for all subsequent `import()` calls in the same process — including dynamic imports in 034/1254/1163.

The fix is NOT to change 047. Instead each victim adds its own `mock.module()` override **at the top of the file** (before any imports), which wins because Bun processes the last-registered factory.

The `?real` URL trick in Step 4 is a diagnostic probe; it will throw in RED (not a real Bun API). This is intentional — the test is designed to fail at step 5 to prove the poison.

---

## Acceptance criteria for RED

- `bun test src/__tests__/1485-telegram-mock-isolation.test.ts` → 2 tests FAIL
- Failure message on test 1: `TypeError: Cannot read ...` or assertion `expected "object" to be "boolean"`
- Failure message on test 2: assertion `expected "object" to be "boolean"`
- `bun tsc --noEmit` passes (no new type errors)

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1485-telegram-mock-isolation.test.ts   # created: RED test proving mock.module process-global poison

tests_written:
- src/__tests__/1485-telegram-mock-isolation.test.ts   # 2 tests, 1 FAIL (test 2 — poison confirmed), 1 PASS (test 1 — Bun 1.3.11 allows re-mock within same test body); suite exits code 1 = RED

tests_skipped: []

notes: |
  Bun 1.3.11: test 1 partially passes because second mock.module() call within same test body
  restores real module for that test's import. Test 2 correctly fails — cross-test poison proven.
  Added `@ts-expect-error` on `?real` import to keep tsc clean (intentional probe URL).

tsc_clean: true
full_suite_pass: false   # expected — this is the RED phase
