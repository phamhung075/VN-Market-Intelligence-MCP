# CI Triage: Task 235 — telegram-send-merge (arch-S16)

**Date:** 2026-06-09  
**Sprint:** CI-RED-RECONCILE  
**CI run:** 27211911171 / bun_job 80342965730 / sha 5e7c9b5c  
**File:** `apps/mcp-server/src/__tests__/235-telegram-send-merge.test.ts` (pos 775)  
**Failures:** 3 fails in this run (ci_absolute = 6 cumulative across runs)

---

## Verdict: CONTAMINATION

Path: (a) — third leaking file identified.

**Leaking file:** `apps/mcp-server/src/__tests__/1792-conviction-debounce.test.ts`  
**Position in CI:** pos 103 (runs before 235 at pos 775)  
**Leaked symbols:** `sendTelegramBug`, `sendTelegramMarket`, `sendTelegramWork`, `sendTelegram`  
**Stub fingerprint:** `sendTelegramBug: (msg: string) => Promise.resolve(true)` — returns `true` (boolean), not a number.  
**Missing teardown:** No `afterAll` restore in 1792. File-top `mock.module()` at line 28 poisons the process-global ESM registry permanently for all files at pos > 103.

---

## CI Evidence — Raw Failure Lines (job 80342965730)

Three `(fail)` entries for 235-telegram-send-merge at timestamp 2026-06-09T14:09:46:

**Failure 1 — line 102** (`capturedUrls.length`):
```
error: expect(received).toBe(expected)
Expected: 1
Received: 0
at 235-telegram-send-merge.test.ts:102:33
(fail) Task 235 — send_telegram channel routing > channel='market' sends to MARKET channel and returns success
```
Diagnosis: `sendTelegramMarket` stub from 1792 ignores `fetchFn` entirely — never calls mockFetch. `capturedUrls` stays empty.

**Failure 2 — line 133** (`msgId`):
```
error: expect(received).toBe(expected)
Expected: 999
Received: true
at 235-telegram-send-merge.test.ts:133:19
(fail) Task 235 — send_telegram channel routing > channel='bug' sends to BUG channel and returns success
```
Diagnosis: `sendTelegramBug` stub from 1792 returns `Promise.resolve(true)` — not a message_id number. `{ ok: true }` fingerprint.

**Failure 3 — line 150** (`result` when no token):
```
error: expect(received).toBe(expected)
Expected: false
Received: true
at 235-telegram-send-merge.test.ts:150:20
(fail) Task 235 — send_telegram channel routing > channel='market' with no token returns failure gracefully
```
Diagnosis: Stub ignores env vars entirely — returns `true` even when `TELEGRAM_BOT_TOKEN` is deleted. Real prod path returns `false` on missing token (telegram.ts L176-179).

---

## Contamination Chain (Full-CI file-order evidence)

| Position | File | Action |
|---|---|---|
| 89 | `1485-telegram-mock-isolation.test.ts` | afterAll C5-cure restores real module (sha 5e7c9b5c) |
| **103** | **`1792-conviction-debounce.test.ts`** | **file-top `mock.module()` L28 RE-POISONS registry — NO afterAll restore** |
| 197 | `FIX-1290-briefing-no-stale.test.ts` | file-top mock.module — stubs market+work only; reinforces poison |
| 212 | `1352a-scheduler-job-wrappers-macro-marketscan.test.ts` | captures poisoned stubs as "frozen real" — afterAll reinstalls stubs |
| 315 | `047-bctc-orchestrator.test.ts` | has C5-cure afterAll (arch-S14) but captures post-1792-poison values at file-top |
| **775** | **`235-telegram-send-merge.test.ts`** | **victim — `await import("telegram.js")` returns 1792 stub** |

The 1485 afterAll (pos 89) fires BEFORE 1792 runs (pos 103). 1792's file-top `mock.module()` is evaluated at module load time — it fires before any test runs in 1792's file. This re-contaminates the registry despite 1485's cure.

No file between pos 103 and pos 775 performs a registry restore with cache-busted real implementations. All later mocks (FIX-1290 pos 197, 1352a pos 212) capture and re-install stubs.

---

## Prod Verification (GENUINE-LOGIC check — definitively excluded)

`apps/mcp-server/src/infrastructure/notifiers/telegram.ts`:

- `sendTelegramMarket` (L265): calls `coreSend("market", text, options)`. Reads `fetchFn` from `options.fetchFn ?? globalThis.fetch` (L186). Returns `result.ok` (boolean). Correct.
- `sendTelegramBug` (L314): returns `result.messageId` (number) on success, `0` on failure, `-1` on dedup. Returns a number, NOT boolean. Correct.
- `coreSend` (L167): if `!botToken` → returns `{ ok: false, messageId: 0 }`. sendTelegramMarket returns `false` when no token. Correct.

All 3 test assertions exactly match current prod behavior. REWRITE / REMOVE / FIX-PROD are all excluded.

---

## C5-Cure Specification

**File to fix:** `apps/mcp-server/src/__tests__/1792-conviction-debounce.test.ts`  
**Mechanism:** Add afterAll restore using a cache-busted real-module ref captured at file top.

### Step 1 — add cache-busted real import at file top (before line 28 mock.module)

```typescript
// Load real telegram module via cache-bust (bypasses any prior mock.module stub from earlier files)
const _realMod1792 = await import(
  Bun.resolveSync("../infrastructure/notifiers/telegram.js", import.meta.dir) + "?isolate=1792"
);
```

Place this BEFORE the `mock.module("../infrastructure/notifiers/telegram.js", ...)` call at line 28.

### Step 2 — add afterAll restore at file bottom

```typescript
import { afterAll } from "bun:test";
// ... (add afterAll to the existing import line: `import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test"`)

afterAll(() => {
  mock.module("../infrastructure/notifiers/telegram.js", () => ({
    sendTelegramWork: _realMod1792.sendTelegramWork,
    sendTelegramMarket: _realMod1792.sendTelegramMarket,
    sendTelegramBug: _realMod1792.sendTelegramBug,
    sendTelegram: _realMod1792.sendTelegram,
    notifyTelegramAlert: _realMod1792.notifyTelegramAlert,
    notifyTelegramDocument: _realMod1792.notifyTelegramDocument,
    formatConvictionBlock: _realMod1792.formatConvictionBlock,
    deleteTelegramBug: _realMod1792.deleteTelegramBug,
  }));
});
```

### Constraints (C5-CURE ABSOLUTE)

- NO new file-top `mock.module()` added beyond what already exists at line 28 in 1792.
- The existing `mock.module()` stub at line 28 (capturing `bugMessages`) stays UNCHANGED — it is load-bearing for the it() test body assertions.
- The `afterEach(() => { closeDb(); })` teardown stays UNCHANGED.
- The cache-bust query `?isolate=1792` ensures the import bypasses any stub already in the registry at the time 1792 loads (e.g. from FIX-1290 if CI order changes).

---

## Expected CI Delta

- Task 235: 3 fail → 0 (direct victim)
- 1352a: its "frozen real" capture at pos 212 will now get genuine functions from the restored registry (net: any 1352a fails caused by 1792-stub contamination also flip)
- FIX-1290 (pos 197) still poisons market+work-only — but `sendTelegramBug` from the real module (restored by 1792's afterAll at pos 103) survives to pos 197 where FIX-1290 overwrites only market+work. The downstream 1352a at pos 212 then captures real `sendTelegramBug`.

NOTE: if 047's afterAll "frozen real" capture (pos 315) was itself poisoned by 1792/FIX-1290 stubs, a further delta may appear in 1328e. This is consistent with arch-S15's expected delta of ~-14. The 1792 cure COMPLETES the contamination chain.

---

## Scope / Classification

- **Zone:** `apps/mcp-server/src/__tests__/` only (test file)
- **BUILD-STANDARD:** not-applicable (bug-fix, no new primitives)
- **Prod risk:** none (zero production code change)
- **Test 1792's it() assertions:** unchanged — they exercise the real `isBctcSignalDebounced` + `recordBctcSignalSent` domain functions, unaffected by the afterAll restore

---

## Protecting Siblings (REMOVE not applicable)

Not applicable — verdict is CONTAMINATION, not REMOVE. Task 235's test is valid and asserts correct prod behavior.

---

## PO Note

Task state change (235 → DONE or FIX-queued) is PO's decision. This brief provides only the technical verdict and fix spec. Dev should apply the C5-cure to 1792 only; no change to 235 test, no change to prod. CI gate confirmation required.
