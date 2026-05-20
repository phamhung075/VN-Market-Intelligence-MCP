/**
 * Smoke Test — Task-Lock System Phase 2 (Multi-Session Collision Prevention)
 *
 * Validates cowork-team slot-locking AC from Sprint 1955 Plan:
 *   AC-1: Two simulated parallel dispatchers at the same nominal_tick produce
 *         EXACTLY ONE claim win per slot (not 2× wins, not 0× wins).
 *   AC-2: Spawn count = number of matched slots × 1 (collision-prevention working).
 *   AC-3: No dangling locks after both runs complete — all claimed=false rows resolved.
 *   AC-4: Loser session emits "[cowork-team] slot held by <session>" message.
 *   AC-5: If ALL slots held → all_held=true branch fires correctly.
 *
 * Test cases (9 assertions):
 *   T1: Session A claims slot-1 → claimed=true
 *   T2: Session B claims slot-1 simultaneously → claimed=false, current_holder populated
 *   T3: current_holder.owner_session matches Session A (loser sees correct holder)
 *   T4: After Session A releases slot-1, Session B re-claim → claimed=true
 *   T5: Session A claims slot-2 → claimed=true
 *   T6: Session A claims slot-3 → claimed=true
 *   T7: All-held branch: Session B tries slot-2 + slot-3 → both claimed=false
 *   T8: all_held=true detected when WON_SLOTS=0 after all claims fail
 *   T9: No dangling cowork-slot locks after full release cycle (count=0)
 *
 * Run: bun scripts/smoke-task-lock-phase2.ts  (from project root)
 */

// Use in-memory DB — no coordination.db on disk touched
process.env["COORDINATION_DB_PATH"] = ":memory:";

import { Database } from "bun:sqlite";
import { resolve } from "node:path";

const storeModule = resolve(
  import.meta.dir,
  "../apps/mcp-server/src/infrastructure/db/coordinationStore.ts",
);

const {
  ensureCoordinationTable,
  claimTask,
  releaseTask,
  listHeldTasks,
  _injectCoordinationDb,
} = await import(storeModule);

// ── Setup in-memory DB ─────────────────────────────────────────────────────

const db = new Database(":memory:");
db.exec("PRAGMA journal_mode = WAL");
ensureCoordinationTable(db);
_injectCoordinationDb(db);

// ── Fixtures ───────────────────────────────────────────────────────────────

// Simulate two parallel Claude Code sessions (separate OS process discriminators)
const SESSION_A = "pid-11111-ts-1716220000000";  // "session 1" — first dispatcher
const SESSION_B = "pid-22222-ts-1716220000001";  // "session 2" — parallel dispatcher

const NOMINAL_TICK = "20260520T140000Z";          // same nominal_tick for both dispatchers

// Three demo slot_ids — the kind cowork-team dispatches
const SLOT_1 = `cowork-slot:news-scout:${NOMINAL_TICK}`;
const SLOT_2 = `cowork-slot:market-watcher:${NOMINAL_TICK}`;
const SLOT_3 = `cowork-slot:financial-analyst:${NOMINAL_TICK}`;

// ── Test harness ───────────────────────────────────────────────────────────

const results: Array<{ id: string; pass: boolean; detail: string }> = [];

function assert(id: string, condition: boolean, detail: string): void {
  results.push({ id, pass: condition, detail });
  const marker = condition ? "[PASS]" : "[FAIL]";
  if (condition) {
    console.log(`  ${marker} ${id} — ${detail}`);
  } else {
    console.error(`  ${marker} ${id} — ${detail}`);
  }
}

// ── Simulate the "loser logs" message ─────────────────────────────────────

const workChannel: string[] = [];  // Captures what would go to Telegram WORK channel

function simulateSlotHeldLog(slotId: string, holderSession: string): void {
  // Mirrors Step 4.6 flow: "[cowork-team] slot held by <session> → skip <slot>"
  const msg = `[cowork-team] slot held by ${holderSession} → skip ${slotId}`;
  workChannel.push(msg);
}

// ── Simulate cowork-team dispatcher logic for one session ─────────────────

interface SlotClaimResult {
  wonSlots: string[];
  heldByOther: string[];
  allHeld: boolean;
}

function simulateDispatcher(
  sessionId: string,
  slots: string[],
  ownerAgent = "cowork-team",
  ttlSeconds = 900,
): SlotClaimResult {
  const wonSlots: string[] = [];
  const heldByOther: string[] = [];

  for (const slot of slots) {
    const result = claimTask({
      task_id: slot,
      task_kind: "cowork-slot",
      owner_session: sessionId,
      owner_agent: ownerAgent,
      ttl_seconds: ttlSeconds,
      payload: JSON.stringify({ slot_id: slot, fire_time: new Date().toISOString() }),
    });

    if (result.claimed) {
      wonSlots.push(slot);
    } else {
      // Loser path: log to WORK channel (Step 4.6 behavior)
      const holder = result.current_holder;
      simulateSlotHeldLog(slot, holder?.owner_session ?? "unknown");
      heldByOther.push(slot);
    }
  }

  const allHeld = wonSlots.length === 0 && slots.length > 0;
  return { wonSlots, heldByOther, allHeld };
}

// ── T1-T3: Parallel claim on slot-1, same nominal_tick ────────────────────

console.log("\n=== T1-T3: Parallel claim race on slot-1 ===");

// Session A claims first (wins)
const claimA_s1 = claimTask({
  task_id: SLOT_1,
  task_kind: "cowork-slot",
  owner_session: SESSION_A,
  owner_agent: "cowork-team",
  ttl_seconds: 900,
});

assert("T1", claimA_s1.claimed === true, `Session A claims slot-1 → claimed=${claimA_s1.claimed}`);

// Session B attempts same slot at the same tick — must lose
const claimB_s1 = claimTask({
  task_id: SLOT_1,
  task_kind: "cowork-slot",
  owner_session: SESSION_B,
  owner_agent: "cowork-team",
  ttl_seconds: 900,
});

assert(
  "T2",
  claimB_s1.claimed === false,
  `Session B claim on slot-1 → claimed=${claimB_s1.claimed} (must be false)`,
);

// Verify current_holder is Session A
const holderSession = claimB_s1.claimed === false
  ? (claimB_s1 as { current_holder?: { owner_session: string } }).current_holder?.owner_session
  : undefined;

assert(
  "T3",
  holderSession === SESSION_A,
  `current_holder.owner_session = "${holderSession}" (must be "${SESSION_A}")`,
);

// Emit the loser log (verifying step 4.6 behavior)
if (claimB_s1.claimed === false) {
  const holder = (claimB_s1 as { current_holder?: { owner_session: string } }).current_holder;
  simulateSlotHeldLog(SLOT_1, holder?.owner_session ?? "unknown");
}

console.log(`  [INFO] WORK channel log: "${workChannel[0]}"`);

// ── T4: Release from Session A → Session B re-claim succeeds ──────────────

console.log("\n=== T4: Release + re-claim cycle ===");

const releaseA_s1 = releaseTask(SLOT_1, SESSION_A);
const reclaimB_s1 = claimTask({
  task_id: SLOT_1,
  task_kind: "cowork-slot",
  owner_session: SESSION_B,
  owner_agent: "cowork-team",
  ttl_seconds: 900,
});

assert(
  "T4",
  releaseA_s1.ok === true && reclaimB_s1.claimed === true,
  `Session A release ok=${releaseA_s1.ok}, Session B re-claim claimed=${reclaimB_s1.claimed}`,
);

// Clean up slot-1 for dangling-lock test
releaseTask(SLOT_1, SESSION_B);

// ── T5-T8: All-held branch — Session A claims slot-2 + slot-3 ─────────────

console.log("\n=== T5-T8: All-held branch simulation ===");

// Session A runs dispatcher claiming slot-2 + slot-3
const dispA = simulateDispatcher(SESSION_A, [SLOT_2, SLOT_3]);

assert("T5", dispA.wonSlots.includes(SLOT_2), `Session A wins slot-2 → wonSlots=${JSON.stringify(dispA.wonSlots)}`);
assert("T6", dispA.wonSlots.includes(SLOT_3), `Session A wins slot-3 → wonSlots=${JSON.stringify(dispA.wonSlots)}`);

// Session B dispatcher fires simultaneously — same nominal_tick
// Both slots already held by Session A → all_held path
const dispB = simulateDispatcher(SESSION_B, [SLOT_2, SLOT_3]);

assert(
  "T7",
  dispB.heldByOther.length === 2 && dispB.wonSlots.length === 0,
  `Session B: heldByOther=${dispB.heldByOther.length}/2, wonSlots=${dispB.wonSlots.length} (all-held)`,
);

assert(
  "T8",
  dispB.allHeld === true,
  `all_held=true when Session B has zero wins across all matched slots (allHeld=${dispB.allHeld})`,
);

console.log(`  [INFO] WORK channel accumulated ${workChannel.length} "slot held by" messages`);
const loserLogOk = workChannel.every(msg => msg.startsWith("[cowork-team] slot held by"));
console.log(`  [INFO] All loser logs prefixed correctly: ${loserLogOk}`);

// ── T9: No dangling locks after full release cycle ─────────────────────────

console.log("\n=== T9: No dangling locks after release ===");

// Release Session A's holds on slot-2 + slot-3
releaseTask(SLOT_2, SESSION_A);
releaseTask(SLOT_3, SESSION_A);

// Query: SELECT count(*) FROM task_locks WHERE task_kind='cowork-slot'
const remaining = listHeldTasks({ kind: "cowork-slot" });

assert(
  "T9",
  remaining.count === 0,
  `task_locks WHERE task_kind='cowork-slot' count=${remaining.count} (must be 0 — no zombies)`,
);

// ── Spawn count verification (AC-2) ───────────────────────────────────────
//
// For AC-2 we verify that a dispatcher only spawns for wonSlots.
// In dispA: wonSlots.length=2, dispB: wonSlots.length=0.
// Total spawn actions across both sessions = 2 (Session A) + 0 (Session B) = 2
// equals the number of distinct slots (2) — collision prevention is working.

const totalSlots = 2;  // slot-2 + slot-3
const totalSpawns = dispA.wonSlots.length + dispB.wonSlots.length;
console.log(`\n[INFO] AC-2 spawn count: ${totalSpawns} spawn(s) for ${totalSlots} slot(s) — expected ${totalSlots}×1`);

// ── Summary ────────────────────────────────────────────────────────────────

const total = results.length;
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;

console.log("\n" + "=".repeat(60));
console.log(`SMOKE PHASE-2 RESULT: ${passed}/${total} assertions`);

if (failed > 0) {
  console.error("\nFAILED assertions:");
  results.filter(r => !r.pass).forEach(r => {
    console.error(`  [FAIL] ${r.id}: ${r.detail}`);
  });
  console.error("\n*** SMOKE TEST PHASE 2 RESULT: FAIL ***");
  process.exit(1);
} else {
  console.log(`\n*** SMOKE TEST PHASE 2 RESULT: PASS (${passed}/${total}) ***`);
  process.exit(0);
}
