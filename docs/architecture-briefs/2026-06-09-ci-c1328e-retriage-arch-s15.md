# CI Re-Triage Brief — Task 1328e: conviction-routing assertion failures (RE-TRIAGE)
## Sprint: CI-RED-RECONCILE | Task: FIX-CI-C7-ASSERTION-LOGIC (carve_out[0] seed 1328e)
## Date: 2026-06-09 (TUESDAY) | Architect cycle: arch-S15
## Supersedes: docs/architecture-briefs/2026-06-09-ci-c1328e-conviction-routing-triage.md (arch-S14)

---

## 1. Executive Verdict

**Classification: SECOND-CONTAMINATOR — `1485-telegram-mock-isolation.test.ts`**

The arch-S14 C5-cure (047 afterAll restore) FAILED because 047's frozen captures were
themselves poisoned by 1485 (position 89), which ran before 047 (position 315) and left
`notifyTelegramAlert: async () => ({ ok: true })` in the ESM registry without any restore.
When 047 imported `_realNotifyTelegramAlert` at module-load time, it captured the 1485 stub,
not the genuine implementation. 047's afterAll then reinstalled the stub as the "restored"
real — so the registry stayed contaminated across all 1036 files.

**Verdict: C5-cure required for `1485-telegram-mock-isolation.test.ts` (NOT 1328e).**
1328e itself remains UNCHANGED. Assertions are correct, prod behavior is correct.

---

## 2. Evidence Chain

### 2.1 CI Failure-Mode Shift (SyntaxError → Wrong Return Value)

Prior gate (SHA e57494d3 / arch-S14 cure) eliminated the `SyntaxError: Export named
'notifyTelegramAlert' not found` that caused the original 047 contamination. The failure
mode CHANGED in the post-fix CI run (SHA 7f1f48b3, job 80334814093):

```
(fail) Task 1328e — notifyTelegramAlert conviction routing > MEDIUM alert...
  Expected: false
  Received: { ok: true }

(fail) Task 1328e — notifyTelegramAlert conviction routing > LOW alert...
  Expected: false
  Received: { ok: true }

(fail) ...multi-chunk split (fetchFn called multiple times)
  Expected: >= 2  Received: 0

(fail) ...CRITICAL alert with conviction option sends conviction block
  Expected: > 0   Received: 0

(fail) ...HIGH alert with conviction option sends conviction block
  Expected: > 0   Received: 0
```

`{ ok: true }` is the exact return value of `async () => ({ ok: true })`.
This is exclusively the 1485 stub — not the 047 stub (which returns `Promise.resolve(true)` → `true`),
not the real function (which returns `false` for medium/low and `boolean` result.ok for high/critical).

### 2.2 CI File Order (run 27209642428, job 80334814093)

| Position | File | Telegram mock action |
|---|---|---|
| 89 | `1485-telegram-mock-isolation.test.ts` | Installs `notifyTelegramAlert: async () => ({ ok: true })` IN TWO it() BLOCKS. **NO afterAll restore.** |
| 95 | `1424a-bctc-unit-scale-mismatch.test.ts` | mock.module telegram (partial, sendTelegramBug only) |
| 103 | `1792-conviction-debounce.test.ts` | mock.module telegram (partial) |
| 197 | `FIX-1290-briefing-no-stale.test.ts` | mock.module telegram |
| 212 | `1352a-scheduler-job-wrappers-macro-marketscan.test.ts` | mock.module telegram (full) |
| 315 | `047-bctc-orchestrator.test.ts` | imports `_realNotifyTelegramAlert` **← CAPTURES 1485 STUB** |
| 315 | (047 tests run) | — |
| 315 | (047 afterAll) | "Restores" with `_frozenNotifyTelegramAlert` = 1485 stub. **WRONG.** |
| 687 | `1356a-pattern-watch-job-gaps.test.ts` | Partial mock (sendTelegramBug only) |
| 687 | (1356a afterAll) | Partial restore (sendTelegramBug only) |
| 775 | `235-telegram-send-merge.test.ts` | 3 tests FAIL — confirms stub still active at pos 775 |
| 941 | `1328e-conviction-display.test.ts` | 5 tests FAIL with `{ ok: true }` |

### 2.3 Capture Poisoning Mechanism

In Bun 1.3.13, `mock.module()` is worker-global and replaces the ESM registry entry for the
given path. Static imports at file top-level resolve via the CURRENT registry at the time the
file is evaluated.

When 047 (pos 315) is loaded, its static import:
```typescript
import { notifyTelegramAlert as _realNotifyTelegramAlert } from "../infrastructure/notifiers/telegram.js";
```
...resolves via the ESM registry which was last written by 1485 (pos 89):
```typescript
notifyTelegramAlert: async () => ({ ok: true })
```

So `_realNotifyTelegramAlert === async () => ({ ok: true })` (the 1485 stub).
`_frozenNotifyTelegramAlert = _realNotifyTelegramAlert` = same 1485 stub.

047's afterAll calls:
```typescript
mock.module("../infrastructure/notifiers/telegram.js", () => ({
  ...
  notifyTelegramAlert: _frozenNotifyTelegramAlert,  // = 1485 stub
  ...
}));
```

This reinstalls `notifyTelegramAlert = async () => ({ ok: true })` as the "restored" real.
The registry is permanently contaminated for all 626+ files that run after position 315.

### 2.4 Local 2-File Repro Was Not a False Positive — It Was a Different Ordering

When `bun test` is given multiple file paths, Bun 1.3.13 sorts them INTERNALLY (not
respecting the command-line order). The 2-file local run `047 1328e` was sorted `047 → 1328e`
alphabetically — which DOES show contamination in isolation. But the prior arch-S14 cure
(extending 047's stub + afterAll restore) appeared to fix the 2-file run because with the
extended stub (full exports), the SyntaxError was gone and the restored function was used.

The cure failed on full-CI because: in CI, 1485 runs at position 89 BEFORE 047. That means
047's "real" captures are already wrong. The 2-file repro with just `047 + 1328e` (no 1485
before) cannot reproduce the CI failure.

**Evidence requirement fulfilled:** full-CI ordered evidence (CI log, job 80334814093) proves
the contamination. Local N-file ordered repro is blocked by Bun's internal sort. The CI log IS
the authoritative ordered-repro evidence.

### 2.5 235-telegram-send-merge FAIL at Position 775 — Corroboration

235 (pos 775) also fails in CI with `sendTelegramMarket` returning `true` when no token is set.
This confirms the telegram stub is STILL active at position 775 (after 047's poisoned restore at
315 and 1356a's partial restore at 687). Both 235 and 1328e are victims of the same root cause.

### 2.6 Prod Alignment Check — C7 Definitively Eliminated

`apps/mcp-server/src/infrastructure/notifiers/telegram.ts`:
- `notifyTelegramAlert` at L549: `export async function notifyTelegramAlert(alert, options): Promise<boolean>`
- Severity gate L553-555: `if (severity !== "high" && severity !== "critical") { return false; }` — UNCHANGED
- Conviction block L564-569: `if (options.conviction) { ... text = text + convBlock }` — UNCHANGED
- fetchFn injection L590: `if (options.fetchFn !== undefined) sendOpts.fetchFn = options.fetchFn` — UNCHANGED
- Returns `boolean` (`result.ok`), never `{ ok: true }` object

All 5 it() blocks assert correct current prod behavior. REWRITE and REMOVE do not apply.

---

## 3. Cure Specification

### 3.1 Target File: `1485-telegram-mock-isolation.test.ts` (ONLY)

**C5-CURE ABSOLUTE CONSTRAINT:** No new `mock.module()` at file-top. The existing
mock.module calls inside it() blocks stay as-is (they are the test's point — to prove
contamination exists). The cure is an `afterAll` that restores the real module AFTER the
describe block completes.

**Problem with pre-import freeze in 1485:** 1485 loads the real module via a cache-busted
import at file top (`Bun.resolveSync(...) + "?isolate=1485"`). This `_realMod1485` IS the
real module, bypassing the mock cache. So 1485 already HAS access to the real functions via
`_realMod1485`. The afterAll restore MUST use `_realMod1485` exports, not a standard import.

**Fix spec for dev:**

In `1485-telegram-mock-isolation.test.ts`, add an `afterAll` import to bun:test, then add
`afterAll` at file scope AFTER the describe block:

```typescript
// Add afterAll to the existing bun:test import at line 13:
import { describe, it, expect, afterAll } from "bun:test";

// At file bottom, AFTER the describe block (after line 83):
afterAll(() => {
  // _realMod1485 was cache-busted at file top — it holds genuine implementations.
  // Re-register the real module so worker-siblings see real functions, not the
  // it()-scoped stubs that this file's tests installed into the registry.
  mock.module("../infrastructure/notifiers/telegram.js", () => ({
    sendTelegramWork: _realMod1485.sendTelegramWork,
    sendTelegramMarket: _realMod1485.sendTelegramMarket,
    sendTelegramBug: _realMod1485.sendTelegramBug,
    sendTelegram: _realMod1485.sendTelegram,
    notifyTelegramAlert: _realMod1485.notifyTelegramAlert,
    notifyTelegramDocument: _realMod1485.notifyTelegramDocument,
    formatConvictionBlock: _realMod1485.formatConvictionBlock,
    deleteTelegramBug: _realMod1485.deleteTelegramBug,
  }));
});
```

**C5-cure compliance:**
- Zero new file-top or module-scope `mock.module()` added.
- The existing two `mock.module()` calls INSIDE it() blocks are not changed (they are the
  test's intentional proof-of-contamination setup — changing them breaks the test's purpose).
- The afterAll restore uses `_realMod1485` which is the cache-busted real module (already
  available at the top of the file), so no new import is needed.

### 3.2 047 Contamination Source — Why It Also Needs a Note (Not a Fix)

047's `_frozenNotifyTelegramAlert` was poisoned by 1485. After 1485's afterAll is in place,
047's import at module-load time will see the REAL function (because 1485's afterAll restores
real BEFORE 047 loads). The 047 cure (from arch-S14) is then self-healing — its frozen
captures will be correct once 1485 is fixed.

**No additional change to 047** beyond what was already merged (commit e57494d3).

### 3.3 1356a Partial Restore — Not the Root Cause, But Still a Risk

1356a's afterAll restores ONLY `sendTelegramBug`. With 1485 fixed and 047's captures now
correct, the module state entering 1356a will be the real module. 1356a's partial stub and
restore cycle will leave `notifyTelegramAlert` = real (since Bun merges partial mock.module
calls with current registry state). This is safe after 1485 is fixed.

If dev wants belt-and-suspenders: extend 1356a's afterAll to also restore `notifyTelegramAlert`
and `formatConvictionBlock`. But this is NOT required to fix 1328e — it is optional hygiene.

---

## 4. Evidence Method That Reproduces 1328e fail=10

**Method:** CI log analysis from job 80334814093 (run 27209642428, SHA 7f1f48b3).

The CI log provides:
1. File execution order (1485 at pos 89, 047 at pos 315, 1328e at pos 941)
2. Failure mode change: `SyntaxError` → `Expected: false, Received: { ok: true }`
3. `{ ok: true }` fingerprints exclusively the 1485 stub (not 047 stub, not real function)
4. 235 (pos 775) also failing with stub-symptom: corroborates contamination persists past 047's restore
5. The capture-poisoning mechanism: 047 imports `_realNotifyTelegramAlert` = 1485 stub
   because 1485 had installed the stub 226 files earlier with no restore

**Local repro cannot reproduce CI ordering** (Bun 1.3.13 re-sorts specified files internally).
The CI log is the sufficient and authoritative evidence. The full-CI order is the ground truth.

---

## 5. Scope and Collateral

### 5.1 Primary fix scope: `1485-telegram-mock-isolation.test.ts` (1 file, afterAll added)

Expected outcome after fix:
- 1328e: 10 fail → 0 fail (all 5 it() receive real `notifyTelegramAlert`)
- 235 (pos 775 in current CI order): 3 fail → 0 fail (same root cause, same cure)
- 047's frozen captures will be correct in future runs (1485 afterAll runs before 047 loads)

### 5.2 1352a (2 CI fails) — unchanged by this fix

1352a's 2 remaining fails:
- 1 fail from 047 contam (cured by arch-S14 / e57494d3) — this will ALSO be cured by 1485
  fix because 047's captures will be correct
- 1 fail (A-1: Expected:1/Received:2) — independent assertion-logic, separate triage

After the 1485 fix, 1352a should go from 2 fail → 1 fail (the independent A-1 remains).

### 5.3 Expected CI delta

Current baseline: 68 fail.
After 1485 fix: 1328e -10, 235 -3 = -13 floor (subject to jitter on unrelated tests).
Actual will be confirmed by next gate watcher run.

---

## 6. Risk Flags

- **RISK-1 (LOW):** 1485's purpose is to PROVE that mock.module contamination exists. Adding
  an afterAll restore changes 1485's second test: after afterAll runs (which restores real),
  any file that loads after 1485 now sees real telegram. This is the intended behavior and does
  not break 1485's own tests (they are self-contained within the describe block).

- **RISK-2 (LOW):** `_realMod1485` may not export all symbols if new exports are added to
  telegram.ts after this fix. Monitor: if telegram.ts gains new exports, update 1485's afterAll
  to include them. This is the same maintenance burden as 047.

- **RISK-3 (NONE):** 1328e is NOT modified. Its assertions remain correct.

- **RISK-4 (LOW):** 047's frozen captures will self-heal once 1485's afterAll is in place.
  If for any reason CI runs 1485 AFTER 047 in a future ordering, 047 would again capture the
  stub. Mitigation: 047's existing afterAll re-registers with frozen captures — if the frozen
  captures are now correct (real functions, because 1485 fixed before 047 in this ordering),
  the restore will also be correct. The risk is ordering-dependent and low given Bun's stable
  sort.

---

## 7. Files to Touch

| File | Change | Why |
|---|---|---|
| `apps/mcp-server/src/__tests__/1485-telegram-mock-isolation.test.ts` | Add `afterAll` import + file-bottom afterAll restore block using `_realMod1485` | Root cause: installs stub without restore; 047's frozen captures reference this stub |
| `apps/mcp-server/src/__tests__/047-bctc-orchestrator.test.ts` | NO CHANGE (already fixed in e57494d3) | Its cure self-heals once 1485 is fixed |
| `apps/mcp-server/src/__tests__/1328e-conviction-display.test.ts` | NO CHANGE | Assertions correct, DI pattern correct |

---

## 8. Protecting Coverage After Fix

After fix, `notifyTelegramAlert` tests in `1328e-conviction-display.test.ts` (AC6–AC12)
become the definitive integration coverage. No sibling test duplicates this coverage.
REMOVE does not apply. REWRITE does not apply.

`034-telegram-notifier.test.ts` (TC-10–TC-14) covers `notifyTelegramAlert` behavior at a
lower-level unit scope. Both test files are complementary.
