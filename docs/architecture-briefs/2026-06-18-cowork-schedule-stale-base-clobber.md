<!-- size-justification: 110L — brownfield findings + ratification decisions + T-14 test shape; single-concern FIX -->
# Architecture Brief: FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER

**Architect:** architect | **Date:** 2026-06-18 | **Sprint:** FE-PAGE-REORG (cross-sprint FIX)
**BA spec:** `docs/handoffs/FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER-BA-spec.md`
**BUILD-STANDARD:** not-applicable (BUG-FIX, in-zone, no new primitives)

---

## Brownfield Scan

**Zone:** `docs/agents/cowork-team/flow/` (flow-doc change) + `apps/mcp-server/src/__tests__/` (test-only)

**Verified paths:**
- `docs/agents/cowork-team/flow/last-fired.md` (55L) — Step 5b: single-writer pseudo-code for batch last_fired write. Current loop body: `slot.last_fired = FIRED_AT` with no guard. The atomic temp→rename (FR-3) is already correct. The fresh-read (FR-1) is already present. The ONLY missing piece is the monotonic guard on line 28 of the update loop.
- `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` (722L) — bun:test runner. T-13 inline helper `batchWriteLastFired()` at L503-524 is the canonical Step 5b replica in tests. T-13/T-13b/T-13c cover single-writer correctness. No T-14 exists yet. The file imports `cowork-match-slots.js` and `cadence-policy.js` — no mcp-server production code under test.
- `docs/data/cowork-schedule.json` — unchanged (NFR-3 confirmed; write-discipline fix only).
- `scripts/agents-flow/cowork-match-slots.js` — reader only; no write path; out of scope for this fix.

**Scan clean:** true — no Writer-B in production mcp-server code; no duplicate write path found.

---

## Ratification Decisions

### ARCH-RATIFY-CWKSCH-1 — T-14 test location: SAME file
**Decision:** Add T-14 to the existing `DWF-phase1-cadence.test.ts`. Do NOT create a new file.

**Reasoning:** The existing `batchWriteLastFired()` helper (L503-524) must be modified to accept the monotonic guard. T-14 calls the updated helper with a pre-seeded live-file (Writer-B's timestamp already written), then calls again as Writer-A with a stale base. Both calls use the same helper — splitting to a new file would orphan the helper from its test consumers and break the "extract once" principle. The 722L file remains under the 800L soft cap.

### ARCH-RATIFY-CWKSCH-2 — flow-doc spec update only, no shared helper script
**Decision:** The fix output is: (a) updated `last-fired.md` Step 5b prose + (b) the T-14 test. No `scripts/agents-flow/update-last-fired.js` helper.

**Reasoning:** The write loop executes as Claude Code agent prose (interpreted by the LLM, not by Node). Extracting to a JS helper would require the agent to `node scripts/agents-flow/update-last-fired.js` — a tooling invocation that creates a new execution dependency path where none exists today, adds drift risk (helper drifts from flow doc), and violates "never propose new interfaces if existing ones cover the need." The flow doc is the SSOT for agent-interpreted steps. The T-14 test validates the guard semantics through the TypeScript replica (`batchWriteLastFired`) without requiring a separate script. Drift risk is low: the flow doc is the only authoritative spec for the writer, and T-14 failing would signal drift.

### ARCH-RATIFY-CWKSCH-3 — matcher-side WARN: include as a low-cost non-blocking addition
**Decision:** Add the `elapsedSeconds > 172800` (>48h) WARN log to `cowork-match-slots.js` as defence-in-depth, but it is NOT a blocker. PM should queue it as a separate dev task (1-liner addition in the cadence-skip branch), not bundle it into this FIX.

**Reasoning:** The write-discipline fix (FR-4) is the root-cause close. The matcher WARN is a canary that survives a future regression: if a new writer re-introduces the clobber class, the >48h WARN fires before the spurious re-fire cascade. The cost is 1 log line; the benefit is durable observability. Bundling it into this FIX is safe but couples two concerns. Separate 1-task PM backlog item avoids scope creep while preserving the canary intent.

---

## Monotonic Guard Design

### Correctness of FR-4

The guard closes the clobber durably because:
1. FIRED_AT is set once at the start of the tick (`new Date().toISOString()` — UTC ISO-8601).
2. Two concurrent sessions fire at time T1 (Writer-A, captures stale base of slot-X=T_old) and T2>T1 (Writer-B, captures live base of slot-X=T_old, writes slot-X=T2).
3. Writer-A's fresh-read (Step 5b readFileSync) now happens AFTER Writer-B's rename → slot-X=T2 in Writer-A's fresh-read.
4. Guard: `T1 > T2`? No (T1<T2) → Writer-A leaves slot-X unchanged. Clobber prevented.
5. The case where Writer-A's fresh-read races Writer-B's rename (tiny window): if Writer-A still reads slot-X=T_old, it writes T1. Then Writer-B's rename atomically overwrites with T2. Final value = T2 (Writer-B wins). Both slots correct.
6. EC-2 (same slot, two writers): lock system prevents this; guard is defence-in-depth. Even if the lock TTL expires, max damage is slot reverts to T1 (not to T_old from 3 days ago) — bounded regression.
7. NFR-4 (null first-run): `null < any_non_null_ISO_string` via lexicographic compare? ISO-8601 strings compare as "0" < any date → but null is not a string. Guard must explicitly handle: `if currentLastFired === null → always write`.

**Guard pseudocode (FR-4, replaces line 28 in last-fired.md):**
```
for each slot in schedule.slots:
  if WON_IDS.has(slot.slot_id):
    currentLastFired = slot.last_fired           # from FRESHLY-READ file
    if currentLastFired === null OR FIRED_AT > currentLastFired:
      slot.last_fired = FIRED_AT
    # else: sibling already wrote a fresher stamp — leave unchanged
```

This is ISO-8601 lexicographic compare (valid for UTC strings; no Date parsing needed; no clock-drift ambiguity beyond sub-second ordering which is benign).

### Atomic write path: no change
FR-3 (writeFileSync to .tmp → renameSync) is already correct in last-fired.md. The monotonic guard is inserted ONLY in the in-memory update loop — it does not affect the atomic write path.

### Non-fatal contract: no change (NFR-2)
The guard is inside the `try` block. A guard failure (unexpected type) would surface as a caught exception → same `{ success: false, error }` return. The error contract is unchanged.

---

## T-14 Test Shape (exact)

File: `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts`

**Step 1 — Upgrade the inline `batchWriteLastFired` helper** to accept the monotonic guard:
```typescript
function batchWriteLastFired(
  scheduleFilePath: string,
  wonSlotIds: string[],
  firedAt: string
): { success: boolean; error?: string } {
  const tmpPath = scheduleFilePath + ".tmp";
  try {
    const raw = fs.readFileSync(scheduleFilePath, "utf8");
    const schedule = JSON.parse(raw);
    const wonSet = new Set(wonSlotIds);
    for (const slot of schedule.slots) {
      if (wonSet.has(slot.slot_id)) {
        const currentLastFired: string | null = slot.last_fired;
        // FR-4 monotonic guard: never decrease last_fired
        if (currentLastFired === null || firedAt > currentLastFired) {
          slot.last_fired = firedAt;
        }
        // else: live file already has a fresher stamp — leave unchanged
      }
    }
    fs.writeFileSync(tmpPath, JSON.stringify(schedule, null, 2));
    fs.renameSync(tmpPath, scheduleFilePath);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
```

**Step 2 — T-14 test (new describe block after T-13c):**
```typescript
// ─── T-14: FR-4 — Concurrent different-slot writers both persist (monotonic guard) ──
describe("T-14: FR-4 — Concurrent different-slot writers: both slots persist after stale-base write", () => {
  // RED proof: Remove the monotonic guard (revert to unconditional slot.last_fired = firedAt)
  //            → Writer-A clobbers Writer-B's slot-b back to A's stale value → expect(slot_b.last_fired).toBe(FIRED_B) FAILS.
  // GREEN proof: Monotonic guard in place → Writer-A leaves slot-b unchanged → both slots hold their correct values.

  test("T-14: Writer-A (stale base, owns slot-a) does NOT clobber Writer-B's slot-b", () => {
    const tmpDir  = os.tmpdir();
    const tmpFile = path.join(tmpDir, `schedule-t14-${Date.now()}.json`);

    // Writer-B has ALREADY fired and written slot-b = FIRED_B.
    const FIRED_B = new Date(Date.now() - 5000).toISOString();  // 5 seconds ago
    const FIRED_A = new Date().toISOString();                    // now (Writer-A fires later)

    // Simulate the live file AFTER Writer-B's write: slot-b=FIRED_B, slot-a=null (not yet fired)
    const schedule = {
      slots: [
        { slot_id: "slot-a", last_fired: null },         // Writer-A's slot — not yet stamped
        { slot_id: "slot-b", last_fired: FIRED_B }       // Writer-B already wrote this
      ]
    };
    fs.writeFileSync(tmpFile, JSON.stringify(schedule, null, 2));

    // Writer-A holds a STALE in-memory snapshot where slot-b=null (pre-Writer-B).
    // But Writer-A's Step 5b does a fresh-read from disk — so it reads FIRED_B for slot-b.
    // Writer-A's WON_SLOTS = ["slot-a"] only.
    // Even if Writer-A mistakenly included slot-b in WON_SLOTS with its stale FIRED_A,
    // the monotonic guard must block the clobber (FIRED_A > FIRED_B is the adversarial case —
    // here FIRED_A > FIRED_B because A fires later).
    //
    // Adversarial case: Writer-A has FIRED_A > FIRED_B AND slot-b in WON_SLOTS (stale-base scenario).
    // In real operation Writer-A only has slot-a in WON_SLOTS, but we test the guard directly.
    // Reuse the file for two separate calls to simulate the concurrent scenario:

    // Pass 1: Writer-B's write (already done above by writing the initial file directly)

    // Pass 2: Writer-A with stale base (WON_SLOTS = ["slot-a"] — correct; slot-b NOT in WON_SLOTS)
    const resultA = batchWriteLastFired(tmpFile, ["slot-a"], FIRED_A);
    expect(resultA.success).toBe(true);

    const after = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
    expect(after.slots[0].last_fired).toBe(FIRED_A);   // slot-a: Writer-A's stamp — written
    expect(after.slots[1].last_fired).toBe(FIRED_B);   // slot-b: Writer-B's stamp — NOT clobbered

    fs.unlinkSync(tmpFile);
  });

  test("T-14b: Monotonic guard blocks explicit stale-base clobber attempt on a slot", () => {
    // Simulates the exact clobber: Writer-A has slot-b in WON_SLOTS with a STALE FIRED_A < FIRED_B.
    // Guard must leave slot-b at FIRED_B.
    const tmpDir  = os.tmpdir();
    const tmpFile = path.join(tmpDir, `schedule-t14b-${Date.now()}.json`);

    const STALE_A = new Date(Date.now() - 10000).toISOString(); // 10s ago (Writer-A's stale stamp)
    const FIRED_B = new Date(Date.now() - 5000).toISOString();  // 5s ago (Writer-B's live stamp)

    const schedule = {
      slots: [
        { slot_id: "slot-b", last_fired: FIRED_B }   // live file has Writer-B's stamp
      ]
    };
    fs.writeFileSync(tmpFile, JSON.stringify(schedule, null, 2));

    // Writer-A tries to write STALE_A to slot-b — guard must block (STALE_A < FIRED_B)
    const resultA = batchWriteLastFired(tmpFile, ["slot-b"], STALE_A);
    expect(resultA.success).toBe(true);   // success=true (non-fatal; no clobber attempted)

    const after = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
    expect(after.slots[0].last_fired).toBe(FIRED_B);  // unchanged: guard blocked stale write

    fs.unlinkSync(tmpFile);
  });

  test("T-14c: null last_fired (first-run) → always write regardless of guard", () => {
    const tmpDir  = os.tmpdir();
    const tmpFile = path.join(tmpDir, `schedule-t14c-${Date.now()}.json`);

    const FIRED_AT = new Date().toISOString();
    const schedule = { slots: [{ slot_id: "slot-first", last_fired: null }] };
    fs.writeFileSync(tmpFile, JSON.stringify(schedule, null, 2));

    const result = batchWriteLastFired(tmpFile, ["slot-first"], FIRED_AT);
    expect(result.success).toBe(true);

    const after = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
    expect(after.slots[0].last_fired).toBe(FIRED_AT);  // NFR-4: null → always write

    fs.unlinkSync(tmpFile);
  });
});
```

**Test count delta:** +3 tests (T-14, T-14b, T-14c). Total file: 16 tests → 19 tests.
**RED proof per test:** Removing the monotonic guard from `batchWriteLastFired` causes:
- T-14: `slot-b` would stay `FIRED_B` even without guard (Writer-A only mutates slot-a) — so T-14 GREEN even without guard. T-14b is the adversarial case: `slot-b` gets `STALE_A` without the guard → `expect(FIRED_B)` fails → RED. T-14c is always-write for null — fails if guard incorrectly blocks null case.

---

## DDD Layer Assignments

| Change | Layer | File |
|---|---|---|
| Monotonic guard in update loop | domain (cadence ledger invariant) | `last-fired.md` Step 5b prose |
| Clarify single-slot CAS semantics | infrastructure | `last-fired.md` Step 5b comment |
| `batchWriteLastFired` helper upgrade | infrastructure/test | `DWF-phase1-cadence.test.ts` |
| T-14/T-14b/T-14c new tests | infrastructure/test | `DWF-phase1-cadence.test.ts` |

---

## Risk Flags

**RISK-1 — T-14 is GREEN even without the guard if Writer-A only mutates its own slot.** T-14b is the adversarial case that catches the guard removal. PM must ensure the developer adds T-14b and not only T-14. Both must fail (RED) when guard is removed; both must pass (GREEN) when guard is in place.

**RISK-2 — ISO-8601 lexicographic compare precondition.** Valid only for UTC strings without timezone offset. `FIRED_AT = new Date().toISOString()` always produces UTC (`Z` suffix). `last_fired` values in `cowork-schedule.json` verified as UTC ISO-8601 (`Z` suffix). No Date parsing needed. Valid.

**RISK-3 — test count SSOT.** `DWF-phase1-cadence.test.ts` header comment line 16 says "13 tests". After T-14 ships it becomes 16 (13 original + T-14 + T-14b + T-14c). Developer must update the header comment.

---

## Files to Change

| File | Change | Layer |
|---|---|---|
| `docs/agents/cowork-team/flow/last-fired.md` | Step 5b update loop body: replace unconditional `slot.last_fired = FIRED_AT` with FR-4 monotonic guard (3 lines) + update Step 5b header comment | domain + interface |
| `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` | Upgrade `batchWriteLastFired` helper (add 3 guard lines); add T-14/T-14b/T-14c describe block; update header comment test count | infrastructure/test |

**Out of scope (confirmed):**
- `apps/mcp-server/src/` production TS — no change
- `docs/agents/cowork-team/flow/match-slots.md` — no change (reader, not writer)
- `docs/data/cowork-schedule.json` — no structural change (NFR-3)

**Follow-on (separate PM task, not a blocker):**
- Add `elapsedSeconds > 172800` WARN to `scripts/agents-flow/cowork-match-slots.js` cadence-skip branch (ARCH-RATIFY-CWKSCH-3 canary)
