# CI Triage: Task 235 Residual — arch-S17

**Date:** 2026-06-09
**Sprint:** CI-RED-RECONCILE
**CI run:** 27214052876 / bun_job 80350659632 / sha 09dce373
**File:** `apps/mcp-server/src/__tests__/235-telegram-send-merge.test.ts` (CI pos 775)
**Prior brief:** `docs/architecture-briefs/2026-06-09-ci-c235-telegram-send-merge-triage.md` (arch-S16)
**Gate signal:** `docs/signals/ci-c235-gate-result-09dce373-20260609T1450Z.json`

---

## Evidence Bar — Reaffirmed

The gate signal for run 27214052876 records Task 235 as `(fail)` exactly **4 times** in the log.
Raw CI log inspection reveals these are **2 unique failing test descriptions × 2 occurrences each**:
once at runtime (14:43:58 timestamp block) and once in bun's final summary dump (14:45:05 block).
The per-victim exact-prefix tally counts all `(fail)` prefix occurrences = 4.
Unique failing tests = 2.

Full-CI file ordering extracted from `##[group]` log lines (authoritative):

| Timestamp | File | Notes |
|---|---|---|
| 14:41:42 | 1485-telegram-mock-isolation.test.ts | has afterAll restore |
| 14:41:43 | 1792-conviction-debounce.test.ts | NOW has afterAll restore (09dce373) |
| 14:42:17 | **FIX-1290-briefing-no-stale.test.ts** | **file-top mock.module — NO afterAll** |
| 14:42:18 | 1352a-scheduler-job-wrappers-macro-marketscan.test.ts | afterAll restores frozen-stub |
| 14:42:29 | 047-bctc-orchestrator.test.ts | afterAll restores frozen-stub |
| 14:43:58 | **235-telegram-send-merge.test.ts** | **victim** |

---

## Raw CI Failure Lines — Surviving 2 Failing Tests

**Failure 1 — line 102** (runtime occurrence, 14:43:58):
```
Expected: 1
Received: 0
at 235-telegram-send-merge.test.ts:102:33
(fail) Task 235 — send_telegram channel routing > channel='market' sends to MARKET channel and returns success
```

**Failure 2 — line 150** (runtime occurrence, 14:43:58):
```
Expected: false
Received: true
at 235-telegram-send-merge.test.ts:150:20
(fail) Task 235 — send_telegram channel routing > channel='market' with no token returns failure gracefully
```

**Both also appear in the bun final summary dump at 14:45:05** — these are the other 2 of the 4 log-lines.

**Passing (was failing pre-09dce373):**
```
(pass) Task 235 — send_telegram channel routing > channel='bug' sends to BUG channel and returns success
```
The 1792 afterAll cure (09dce373) successfully removed the `sendTelegramBug: () => Promise.resolve(true)` boolean-stub leak. The `channel='bug'` test now passes, confirming the partial fix is correct.

---

## Stub Fingerprint

**Active stub at 235's runtime:** `sendTelegramMarket: async (text: string) => { marketMessages.push(text); return true; }`

This stub:
- Ignores `fetchFn` entirely — `capturedUrls` stays empty → line 102 `Expected: 1, Received: 0`
- Ignores `process.env["TELEGRAM_BOT_TOKEN"]` entirely → returns `true` even when token is deleted → line 150 `Expected: false, Received: true`
- Returns `true` (boolean), NOT a message_id (number)

This is NOT the 1792 stub (`sendTelegramBug: () => Promise.resolve(true)`). The leaking symbol is `sendTelegramMarket`, not `sendTelegramBug`. Different contaminator.

---

## Verdict: (a) FOURTH CONTAMINATOR

**Leaking file:** `apps/mcp-server/src/__tests__/FIX-1290-briefing-no-stale.test.ts`
**CI position:** runs at 14:42:17, between 1792 (14:41:43) and 235 (14:43:58)
**Leaked symbol:** `sendTelegramMarket`
**Stub (exact):**
```typescript
mock.module("../infrastructure/notifiers/telegram.js", () => ({
  sendTelegramMarket: async (text: string) => {
    marketMessages.push(text);
    return true;
  },
  sendTelegramWork: async (text: string) => {
    workMessages.push(text);
    return true;
  },
}));
```
Located at lines 21–30 of `FIX-1290-briefing-no-stale.test.ts`. **No `afterAll` restore anywhere in the file** (173 lines, verified).

---

## Contamination Propagation Chain

After 1792's `afterAll` restores the real module (end of 1792's test group), FIX-1290 immediately re-poisons `sendTelegramMarket` with a stub at file-top evaluation time.

- **1352a** (14:42:18): imports `sendTelegramMarket as _realSendTelegramMarket` at file top — gets FIX-1290's stub, not the real function. Its `afterAll` "restores" to FIX-1290's stub.
- **047** (14:42:29): imports `sendTelegramMarket as _realSendTelegramMarket` at file top — gets FIX-1290's stub. Its `afterAll` "restores" to FIX-1290's stub.
- **235** (14:43:58): `await import("../infrastructure/notifiers/telegram.js")` returns FIX-1290's stub. `sendTelegramMarket` ignores `fetchFn` and env vars, returns `true`. Both surviving test failures explained.

Note: `sendTelegramBug` is NOT included in FIX-1290's stub (only `sendTelegramMarket` and `sendTelegramWork` are mocked). After 1792's afterAll, `sendTelegramBug` is correctly restored to the real function and propagates through 1352a/047 frozen-real captures. This explains why `channel='bug'` now PASSES while only `sendTelegramMarket` tests still fail.

---

## Prod Verification (GENUINE-LOGIC definitively excluded)

`apps/mcp-server/src/infrastructure/notifiers/telegram.ts`:
- `sendTelegramMarket` (L265): calls `coreSend("market", text, options)`, reads `fetchFn` from `options.fetchFn ?? globalThis.fetch`, returns `result.ok` (boolean). Correct.
- `coreSend` (L167): if `!botToken` → returns `{ ok: false, messageId: 0 }`. `sendTelegramMarket` returns `false` when no token. Correct.
- Both assertions (line 101: `result === true`, line 102: `capturedUrls.length === 1`, line 150: `result === false`) exactly match current prod behavior.

REWRITE and REMOVE are excluded. The test is valid and asserts correct prod behavior.

---

## C5-Cure Specification

**File to fix:** `apps/mcp-server/src/__tests__/FIX-1290-briefing-no-stale.test.ts`
**Mechanism:** Add afterAll restore using a cache-busted real-module ref captured at file top.

### Step 1 — add afterAll to bun:test import (line 12)

```typescript
// BEFORE:
import { describe, it, expect, beforeEach, mock } from "bun:test";

// AFTER:
import { describe, it, expect, beforeEach, afterAll, mock } from "bun:test";
```

### Step 2 — add cache-busted real import BEFORE line 21 mock.module call

```typescript
// Load real telegram module via cache-bust (bypasses any prior stub in registry)
const _realMod1290 = await import(
  Bun.resolveSync("../infrastructure/notifiers/telegram.js", import.meta.dir) + "?isolate=1290"
);
```

Place this BEFORE the `mock.module("../infrastructure/notifiers/telegram.js", ...)` call at line 21.

### Step 3 — add afterAll restore at file bottom

```typescript
afterAll(() => {
  mock.module("../infrastructure/notifiers/telegram.js", () => ({
    sendTelegramWork:       _realMod1290.sendTelegramWork,
    sendTelegramMarket:     _realMod1290.sendTelegramMarket,
    sendTelegramBug:        _realMod1290.sendTelegramBug,
    sendTelegram:           _realMod1290.sendTelegram,
    notifyTelegramAlert:    _realMod1290.notifyTelegramAlert,
    notifyTelegramDocument: _realMod1290.notifyTelegramDocument,
    formatConvictionBlock:  _realMod1290.formatConvictionBlock,
    deleteTelegramBug:      _realMod1290.deleteTelegramBug,
  }));
});
```

### Constraints (C5-CURE ABSOLUTE)

- NO new file-top `mock.module()` beyond what already exists at line 21 in FIX-1290.
- The existing `mock.module()` stub at lines 21–30 (capturing `marketMessages`/`workMessages`) stays UNCHANGED — it is load-bearing for AC-1/AC-2/AC-3 assertions.
- The `beforeEach` resetters stay UNCHANGED.
- Cache-bust `?isolate=1290` ensures the import bypasses any stub in registry at evaluation time.
- All telegram exports restored — not just sendTelegramMarket and sendTelegramWork — so downstream 1352a/047 frozen-real captures receive the real functions.

---

## Evidence Bar Requirement

Per the reaffirmed evidence bar (three consecutive false-positive local repros at arch-S14/S15/S16):
**A 2-file local joint-pass is NOT sufficient proof.**
The fix must be verified by full-CI run with per-victim exact-prefix tally:
- Task 235: `(fail)` count expected to go from 4 → 0 (2 failing tests × 2 occurrences each → 0)

---

## Expected CI Delta

- Task 235: 4 log occurrences → 0 (2 unique tests × 2 log positions, all cured)
- 1352a's `_frozenRealSendTelegramMarket` will now capture the real function → any 1352a fails sourced from this stub may also flip (independent check needed)
- 047's `_frozenSendTelegramMarket` similarly corrected
- Total net: at minimum -1 native fail (2 test fails from unique tests, counted once in native summary), likely more if downstream frozen-stub propagation affected other victims

---

## Collateral Assessment: `channel='bug'` Test

Line 133 (`channel='bug' sends to BUG channel and returns success`) is NOW PASSING (shown in CI log at 14:43:58). This test is NOT part of the residual. No action needed for it.

---

## Scope / Classification

- **Zone:** `apps/mcp-server/src/__tests__/` only (test file)
- **BUILD-STANDARD:** not-applicable (test isolation fix, no new primitives)
- **Prod risk:** none (zero production code change)
- **FIX-1290's own assertions:** unchanged — they exercise the real `morningBriefingJob` / `runMorningBriefing` logic, unaffected by the afterAll restore

---

## Systemic Pattern Analysis

Four confirmed telegram `mock.module` contaminators in this family within a single CI run:

| Contaminator | CI position | Leaked symbol | AfterAll | Status |
|---|---|---|---|---|
| 1485-telegram-mock-isolation | pos 89 | notifyTelegramAlert (stub `{ok:true}`) | Added (arch-S15 5e7c9b5c) | CURED |
| 1792-conviction-debounce | pos 103 | sendTelegramBug (`Promise.resolve(true)`) | Added (arch-S16 09dce373) | CURED |
| FIX-1290-briefing-no-stale | ~pos 197 | sendTelegramMarket (capture-array, `true`) | **MISSING** | THIS FIX |
| 047-bctc-orchestrator | pos 315 | frozen-stub re-install | Has afterAll but captures stubs | SECONDARY — propagates FIX-1290's leak via frozen capture |

A **repo-wide afterAll-restore sweep** of all telegram-stub files is the structurally correct fix over one-victim-at-a-time remediation. The pattern is:
- File has `mock.module("../infrastructure/notifiers/telegram.js", ...)` at file-top or module-scope
- File has NO `afterAll` that restores the real module via a cache-busted `_realMod*` import
- This contaminates ALL files running after it in the full-CI sequential ordering

Files to audit (known or suspected, beyond the four above):
- Any file with file-top `mock.module` on `telegram.js` and no `afterAll` restore
- Search: `grep -r "mock\.module.*telegram\.js" apps/mcp-server/src/__tests__/ | grep -v afterAll`

**Recommendation to router/PO:** Queue a single task `FIX-CI-TELEGRAM-STUB-AFTERALL-SWEEP` to add cache-bust + afterAll restores to ALL telegram-stub files missing them in one pass. This drains the entire mock-contamination class without per-victim archaeology. Each new contaminator found costs one full CI run cycle (90+ min) under the current one-at-a-time approach. The sweep is low-risk (teardown-only, no production change, pattern established) and bounded (the `grep` above enumerates the full set).

---

## PO Note

Task state change (235 → DONE or FIX-queued) is PO's decision. This brief provides the technical verdict and fix spec only. Dev should apply the C5-cure to FIX-1290 only; no change to 235 test, no change to prod. CI gate confirmation with full-CI per-victim tally required.
