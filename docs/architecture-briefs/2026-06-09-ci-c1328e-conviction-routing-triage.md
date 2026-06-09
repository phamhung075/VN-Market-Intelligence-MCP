# CI Triage Brief — Task 1328e: conviction-routing assertion failures
## Sprint: CI-RED-RECONCILE | Task: FIX-CI-C7-ASSERTION-LOGIC
## Date: 2026-06-09 | Architect cycle: arch-S14

---

## 1. Signature Classification

**Classification: (c) TEST-HARNESS/MOCK CONTAMINATION**

The 5 failing `it()` blocks in `1328e-conviction-display.test.ts` are NOT caused by a prod logic
bug, NOT caused by stale assertions against superseded behavior. They fail because
`047-bctc-orchestrator.test.ts` (run-order position [24]) installs a `mock.module()` stub for
`../infrastructure/notifiers/telegram.js` that does NOT export `notifyTelegramAlert` or
`formatConvictionBlock`. Bun 1.3.13's ESM registry is process-global (single-process sequential
runner). When `1328e` (position [306]) is loaded, its static import of `{ notifyTelegramAlert }`
fails with a hard `SyntaxError`.

---

## 2. Raw Evidence

### 2.1 Production `notifyTelegramAlert` — file:line

File: `apps/mcp-server/src/infrastructure/notifiers/telegram.ts`

Key locations:
- **`notifyTelegramAlert` function declaration:** line 549
- **Severity gate:** lines 553–555
  ```typescript
  if (severity !== "high" && severity !== "critical") {
    return false;
  }
  ```
  Current prod gate: only `"high"` and `"critical"` call the send path. `"medium"` and `"low"`
  return `false` immediately WITHOUT calling `fetchFn` / `coreSend`.
- **Conviction block emission:** lines 564–569
  ```typescript
  if (options.conviction) {
    const convBlock = formatConvictionBlock(options.conviction, options.convictionRisks ?? []);
    text = `${text}\n\n${convBlock}`;
  }
  ```
  Condition: `options.conviction` is truthy. Applied for ALL severity levels that pass the gate
  (i.e., `"high"` and `"critical"` only).
- **Send target:** line 594 — sends to `"bug"` channel via `coreSend("bug", text, sendOpts)`.
- **Multi-chunk split:** `splitMessage()` at line 141. Called inside `coreSend()` at line 194.
  Threshold: `TELEGRAM_MAX_LENGTH = 4096` (line 135). Any text > 4096 chars after NFC-normalize
  + HTML-strip is split on newlines; each chunk gets a separate `fetchFn` call (line 211, inside
  the `for (const chunk of chunks)` loop at line 197).
- **`fetchFn` injection:** `NotifyOptions.fetchFn` (line 86) is forwarded into
  `SendTelegramOptions` at lines 587–590:
  ```typescript
  if (options.fetchFn !== undefined) sendOpts.fetchFn = options.fetchFn;
  ```
  `coreSend` uses `options.fetchFn ?? (globalThis.fetch as FetchFn)` at line 186.

### 2.2 `formatConvictionBlock` — file:line

File: `apps/mcp-server/src/infrastructure/notifiers/telegram.ts`, lines 522–535.
Exported, standalone pure function. Not affected by the mock contamination (it's not called by
any test that imports from the contaminated module path at load time — but see section 2.5).

### 2.3 Git log staleness check

```
4690a32d fix(1328e): notifyTelegramAlert routes to BUG channel, not MARKET
523dc6a9 fix(1328e): route notifyTelegramAlert to bug channel, not market
40538481 fix: correct Telegram channel routing in notifyTelegramAlert + type consistency
ba865ca8 task(1328e): add formatConvictionBlock + conviction block in HIGH/CRITICAL alerts
```

The severity gate (`high`/`critical` only) is present since `ba865ca8`. The channel routing
was corrected in `523dc6a9`/`4690a32d`. No recent commit removed or changed the severity gate,
the conviction-block emission condition, or the multi-chunk split threshold. Prod behavior has
been stable. **The test is NOT stale** — it asserts correct current behavior.

### 2.4 Mock injection mechanism

`1328e` uses `makeCaptureFetch()` — a **constructor-arg / options.fetchFn DI injection**:
```typescript
function makeCaptureFetch(captured: string[]): (url: string, init: RequestInit) => Promise<Response>
const fetchFn = makeCaptureFetch(calls);
await notifyTelegramAlert(alert, { fetchFn });
```
No `mock.module()` anywhere in the file. The DI pattern is clean and correct — identical to the
C5-cure-compliant DI approach. This is NOT the source of the failure.

### 2.5 Contaminator: `047-bctc-orchestrator.test.ts`

Run-order position [24]. File-top (line 17):
```typescript
mock.module("../infrastructure/notifiers/telegram.js", () => ({
  sendTelegramWork: () => Promise.resolve(true),
  sendTelegramMarket: () => Promise.resolve(true),
  sendTelegramBug: () => Promise.resolve(true),
  sendTelegram: () => Promise.resolve(true),
}));
```
047's stub exports ONLY 4 functions. Missing: `notifyTelegramAlert`, `formatConvictionBlock`,
`notifyTelegramDocument`, `deleteTelegramBug`, `sendTelegramWork`, `FetchFn` type, etc.

047's `afterAll` (line 139) does NOT restore the telegram mock:
```typescript
afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
});
```
The stub persists in the ESM registry for ALL files run after position [24] in the full suite.

**No file between position [24] and position [306] restores the telegram mock.** Verified by
scanning all 287 files in that window — zero calls to `mock.module` for telegram besides 047.
(`1485-telegram-mock-isolation.test.ts` is at position [484], AFTER 1328e at [306];
`FIX-1290-briefing-no-stale.test.ts` is at position [891].)

### 2.6 Empirical proof

Local two-file run confirms the exact failure mechanism:

```
$ bun test src/__tests__/047-bctc-orchestrator.test.ts src/__tests__/1328e-conviction-display.test.ts

# Unhandled error between tests
SyntaxError: Export named 'notifyTelegramAlert' not found in module
  '/...apps/mcp-server/src/infrastructure/notifiers/telegram.ts'.

 9 pass
 1 fail
 1 error
```

Isolated run of 1328e alone:
```
$ bun test src/__tests__/1328e-conviction-display.test.ts
 12 pass / 0 fail
```

The ~1ms failure latency cited in the CI board (vs ~5003ms for transport-hang cluster) is
explained by this being a module-load-time `SyntaxError` — it fires immediately, not during
test execution. Bun reprints the error twice (in-progress + summary) → 5 unique × 2 = 10 native
fail count in CI log.

### 2.7 Per-it() agree/disagree analysis

| it() name | Prod behavior | Test assertion | Agree? | Fails why |
|---|---|---|---|---|
| "MEDIUM alert does not call fetchFn (skipped by severity gate)" | `notifyTelegramAlert` with `severity="medium"` returns `false`, never calls fetchFn | `expect(result).toBe(false); expect(calls.length).toBe(0)` | AGREE | `notifyTelegramAlert` not in 047 stub → SyntaxError on module load |
| "LOW alert does not call fetchFn (skipped by severity gate)" | Same — `severity="low"` returns `false` | `expect(result).toBe(false); expect(calls.length).toBe(0)` | AGREE | Same SyntaxError |
| "message over 4096 chars triggers multi-chunk split (fetchFn called multiple times)" | `summary="A".repeat(4000)` + alert text + severityLabel + conviction block ≫ 4096 chars → `splitMessage()` → ≥2 `fetchFn` calls | `expect(calls.length).toBeGreaterThanOrEqual(2)` | AGREE | Same SyntaxError |
| "CRITICAL alert with conviction option sends conviction block" | `severity="critical"` + `conviction` option → `coreSend("bug", ...)` with `formatConvictionBlock` appended → fetchFn called, text contains `"Tại sao:"` etc. | `expect(calls.length).toBeGreaterThan(0)` + conviction headers | AGREE | Same SyntaxError |
| "HIGH alert with conviction option sends conviction block" | Same for `severity="high"` | `expect(calls.length).toBeGreaterThan(0)` + conviction headers | AGREE | Same SyntaxError |

All 5 failing assertions are correct. Prod AGREES with every assertion. The only failure
mechanism is contamination from 047's stub.

The 7 PASSING tests (`describe("Task 1328e — formatConvictionBlock")`) call `formatConvictionBlock`
directly. Bun resolves named-export errors lazily per-import-binding; `formatConvictionBlock` was
already resolved before the 047 mock was installed (static import hoisting semantics). The
SyntaxError manifests specifically when the `notifyTelegramAlert` binding is first accessed at
test-execution time.

---

## 3. Verdict

**REWRITE-assertions is NOT the correct verdict — assertions are all correct.**
**FIX-prod is NOT correct — prod behavior is correct.**

Verdict: **TEST-HARNESS/MOCK CONTAMINATION — cure `047-bctc-orchestrator.test.ts`**

The fix is to add a teardown `afterAll` to `047-bctc-orchestrator.test.ts` that restores
the real telegram module exports, OR add the missing exports (`notifyTelegramAlert`,
`formatConvictionBlock`, `notifyTelegramDocument`) to 047's stub so downstream files can load
cleanly.

**Recommended cure (C5-cure COMPLIANT):**

Add a teardown `afterAll` to `047-bctc-orchestrator.test.ts` that re-registers the real
implementations. Pattern: same as `1352a-scheduler-job-wrappers-macro-marketscan.test.ts`
teardown describe (the established restore pattern in the codebase):

```typescript
// At TOP of 047 file, BEFORE mock.module() — capture real implementations:
import {
  sendTelegramWork as _realSendTelegramWork,
  sendTelegramMarket as _realSendTelegramMarket,
  sendTelegramBug as _realSendTelegramBug,
  sendTelegram as _realSendTelegram,
  notifyTelegramAlert as _realNotifyTelegramAlert,
  notifyTelegramDocument as _realNotifyTelegramDocument,
  formatConvictionBlock as _realFormatConvictionBlock,
  deleteTelegramBug as _realDeleteTelegramBug,
} from "../infrastructure/notifiers/telegram.js";

// Freeze before mock.module() overwrites live bindings:
const _frozenNotifyTelegramAlert = _realNotifyTelegramAlert;
// ... (same pattern as 1352a)

// Existing 047 stub — UNCHANGED (still needed to prevent live Telegram sends during 047 tests)
mock.module("../infrastructure/notifiers/telegram.js", () => ({
  sendTelegramWork: () => Promise.resolve(true),
  sendTelegramMarket: () => Promise.resolve(true),
  sendTelegramBug: () => Promise.resolve(true),
  sendTelegram: () => Promise.resolve(true),
  notifyTelegramAlert: () => Promise.resolve(true),
  notifyTelegramDocument: () => Promise.resolve(true),
  formatConvictionBlock: _realFormatConvictionBlock,
  deleteTelegramBug: () => Promise.resolve(false),
}));

// NEW afterAll in existing teardown / at file bottom:
afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
  // Restore real telegram module so 1328e and other siblings see the real functions.
  mock.module("../infrastructure/notifiers/telegram.js", () => ({
    sendTelegramWork: _frozenRealSendTelegramWork,
    sendTelegramMarket: _frozenRealSendTelegramMarket,
    sendTelegramBug: _frozenRealSendTelegramBug,
    sendTelegram: _frozenRealSendTelegram,
    notifyTelegramAlert: _frozenNotifyTelegramAlert,
    notifyTelegramDocument: _frozenRealNotifyTelegramDocument,
    formatConvictionBlock: _realFormatConvictionBlock,
    deleteTelegramBug: _frozenRealDeleteTelegramBug,
  }));
});
```

**C5-CURE ABSOLUTE compliance:** Zero new file-top/module-scope `mock.module()` is ADDED. The
existing 047 stub is extended (adding missing exports), and a restore teardown is added.
No new mock.module() in 1328e — the test file itself is NOT modified. The fix is entirely in
`047-bctc-orchestrator.test.ts`.

**1328e itself needs NO changes.** Its assertions are correct, its DI pattern is correct, and
its `formatConvictionBlock` tests already pass.

---

## 4. 1792 and 1352a scope analysis

### 1792 (`1792-conviction-debounce.test.ts`, 2 CI fails, position [557])

**NOT the same root cause as 1328e.**

1792 fails in ISOLATION (confirmed empirically: `bun test 1792-conviction-debounce.test.ts`
→ `3 pass / 2 fail` before any 047 contamination). The 2 failures:
- "10 rapid fires for same ticker+quarter → only 1 Telegram bug message sent" →
  `Expected: 1, Received: 0` (bugMessages array stays empty)
- "different ticker+quarter is not blocked by VCB debounce" →
  `Expected: 1, Received: 0`

Root cause: 1792's debounce-capture depends on `sendTelegramBug` being called via
`parseBctcReport`. The `bugMessages` capture array receives 0 items — either the debounce
table is not properly initialized in the per-test `:memory:` DB, or the `sendTelegramBug`
mock is not being reached because parseBctcReport's call path short-circuits before the
Telegram send (e.g., the `isDuplicateReport` dedup check throws and proceeds, or the
bctc_signal_debounce table is missing from `initDatabase()`). This is an INDEPENDENT
assertion-logic failure requiring its own triage.

**Fixing 047 does NOT cure 1792.** Different file, different root cause.

### 1352a (`1352a-scheduler-job-wrappers-macro-marketscan.test.ts`, 2 CI fails, position [362])

**MIXED: 1 fail from 047 contamination + 1 fail independent.**

- **Contamination fail (1 of 2):** 1352a imports `notifyTelegramDocument as _realNotifyTelegramDocument`
  at top-level. With 047's stub active (missing `notifyTelegramDocument`), this produces:
  `SyntaxError: Export named 'notifyTelegramDocument' not found`. Confirmed:
  ```
  $ bun test src/__tests__/047-bctc-orchestrator.test.ts src/__tests__/1352a-scheduler-job-wrappers-macro-marketscan.test.ts
  SyntaxError: Export named 'notifyTelegramDocument' not found...
  9 pass / 1 fail / 1 error
  ```
  Curing 047 (adding `notifyTelegramDocument` to stub + teardown restore) eliminates this fail.

- **Independent fail (1 of 2):** 1352a in isolation → `1 fail: A-1: Telegram WORK message sent
  on getMacroSnapshot success with correct values` → `Expected: 1, Received: 2`.
  This is an independent assertion-logic failure (A-1 test expects 1 WORK message but receives 2).
  Needs its own triage.

**Conclusion:** The 047-cure covers 1 of 1352a's 2 CI fails. The other 1 fail in 1352a requires
a separate triage.

---

## 5. Dev-fix scope

**Primary scope: `047-bctc-orchestrator.test.ts` (1 file)**

Fix addresses:
- All 5 unique it() failures in `1328e-conviction-display.test.ts` (= 10 native CI fail count)
- 1 of 2 failures in `1352a-scheduler-job-wrappers-macro-marketscan.test.ts`

**NOT in scope of this fix:**
- `1792-conviction-debounce.test.ts` (2 fails, independent root cause)
- `1352a` A-1 failure (`Expected: 1, Received: 2` — independent assertion logic)

**Protecting sibling tests for coverage of `notifyTelegramAlert` behavior:**
- The 7 `formatConvictionBlock` unit tests (AC1–AC5) in `1328e` already pass and will continue
  to cover the conviction-block format.
- AC8 ("HIGH alert without conviction option → output unchanged from pre-1328e baseline") PASSES
  today and covers the no-conviction path.
- After 047 restore fix, AC6/AC7/AC10/AC11/AC12 in 1328e will pass — these are the definitive
  conviction-routing integration tests. No sibling test duplicates this coverage. REMOVE does
  not apply.

**BUILD-STANDARD: not-applicable** (test-file-only fix, no new primitives)

---

## 6. Risk flags

- **RISK-1 (LOW):** 047's `parseBctcReport` tests depend on `sendTelegramBug` being stubbed (to
  prevent real Telegram sends and to suppress low-confidence warnings). The fixed stub must retain
  `sendTelegramBug: () => Promise.resolve(true)` for 047's own tests to remain isolated.
- **RISK-2 (LOW):** Adding `formatConvictionBlock: _realFormatConvictionBlock` to 047's stub
  means 047's own tests could accidentally call the real conviction formatter. Audit: 047's test
  corpus does NOT call `formatConvictionBlock` — zero risk.
- **RISK-3 (NONE):** `1328e` is NOT modified. The existing correct DI pattern is preserved as-is.
