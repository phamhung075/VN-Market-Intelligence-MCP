/**
 * Smoke Test — Task-Lock System Phase 1
 *
 * Validates the complete claim → heartbeat → stale-steal → release cycle
 * with concurrent claim race-free semantics on an in-memory coordination.db.
 *
 * Steps:
 *   1. Claim `cowork-slot:smoke-test:20260520T000000Z`
 *   2. Heartbeat 3x — all must succeed
 *   3. Competing claim from different fake owner_session — must FAIL
 *   4. Manipulate expires_at to simulate stale → try claim again → must SUCCEED via stale-steal
 *   5. Release — confirms DELETE returns ok=true
 *   6. Re-claim after release — must succeed
 *
 * Run: bun scripts/smoke-task-lock.ts  (from project root)
 */

// Use in-memory DB for smoke test
process.env["COORDINATION_DB_PATH"] = ":memory:";

// Note: bun:sqlite is available in this context
import { Database } from "bun:sqlite";
import { resolve } from "node:path";

// Use import.meta.dir for path resolution relative to THIS script file
// scripts/ is at project root; coordinationStore.ts is in apps/mcp-server/src/
// import.meta.dir resolves to /path/to/project/scripts/
// We need to go up one level to reach the project root, then into apps/mcp-server/src/
const storeModule = resolve(import.meta.dir, "../apps/mcp-server/src/infrastructure/db/coordinationStore.ts");
const {
  ensureCoordinationTable,
  claimTask,
  heartbeatTask,
  releaseTask,
  listHeldTasks,
  _injectCoordinationDb,
  _resetCoordinationDbState,
} = await import(storeModule);

// ─── Setup in-memory DB ────────────────────────────────────────────────────

const db = new Database(":memory:");
db.exec("PRAGMA journal_mode = WAL");
ensureCoordinationTable(db);
_injectCoordinationDb(db);

// ─── Test state ────────────────────────────────────────────────────────────

const TASK_ID = "cowork-slot:smoke-test:20260520T000000Z";
const SESSION_A = "smoke-session-A";
const SESSION_B = "smoke-session-B";
const results: Array<{ step: string; pass: boolean; detail?: string }> = [];

function pass(step: string, detail?: string): void {
  results.push({ step, pass: true, detail });
  console.log(`  [PASS] ${step}${detail ? ` — ${detail}` : ""}`);
}

function fail(step: string, detail: string): void {
  results.push({ step, pass: false, detail });
  console.error(`  [FAIL] ${step} — ${detail}`);
}

// ─── Step 1: Claim ─────────────────────────────────────────────────────────

console.log("\nStep 1: Initial claim");
const r1 = claimTask({
  task_id: TASK_ID,
  task_kind: "cowork-slot",
  owner_session: SESSION_A,
  owner_agent: "cowork-team",
  ttl_seconds: 900,
  payload: JSON.stringify({ slot_id: "smoke-test", fire_time: new Date().toISOString() }),
});

if (r1.claimed) {
  pass("Step 1", "claim succeeded");
} else {
  fail("Step 1", `claim failed — expected claimed=true, got: ${JSON.stringify(r1)}`);
}

// ─── Step 2: Heartbeat 3x ──────────────────────────────────────────────────

console.log("\nStep 2: Heartbeat 3x");
for (let i = 1; i <= 3; i++) {
  const hb = heartbeatTask(TASK_ID, SESSION_A);
  if (hb.ok && hb.expires_at > 0) {
    pass(`Step 2.${i}`, `heartbeat ok — expires_at=${hb.expires_at}`);
  } else {
    fail(`Step 2.${i}`, `heartbeat failed — ok=${hb.ok} expires_at=${hb.expires_at}`);
  }
}

// ─── Step 3: Competing claim must FAIL ─────────────────────────────────────

console.log("\nStep 3: Competing claim from different session — must fail");
const r3 = claimTask({
  task_id: TASK_ID,
  task_kind: "cowork-slot",
  owner_session: SESSION_B,
  owner_agent: "cowork-team",
  ttl_seconds: 900,
});

if (!r3.claimed) {
  const holder = (r3 as { current_holder?: { owner_session: string } }).current_holder;
  pass("Step 3", `competing claim correctly rejected — holder: ${holder?.owner_session ?? "?"}`);
} else {
  fail("Step 3", `competing claim incorrectly succeeded — claimed=true`);
}

// ─── Step 4: Stale-steal ───────────────────────────────────────────────────

console.log("\nStep 4: Simulate stale lock → stale-steal must succeed");

// Set expires_at to past to simulate TTL expiry
db.prepare("UPDATE task_locks SET expires_at = 1 WHERE task_id = ?").run(TASK_ID);

const r4 = claimTask({
  task_id: TASK_ID,
  task_kind: "cowork-slot",
  owner_session: SESSION_B,
  owner_agent: "cowork-team",
  ttl_seconds: 900,
});

if (r4.claimed && (r4 as { stolen?: boolean }).stolen === true) {
  pass("Step 4", "stale-steal succeeded — stolen=true");
} else {
  fail("Step 4", `stale-steal failed — claimed=${r4.claimed} stolen=${(r4 as Record<string, unknown>).stolen}`);
}

// ─── Step 5: Release ───────────────────────────────────────────────────────

console.log("\nStep 5: Release by SESSION_B — must succeed");
const r5 = releaseTask(TASK_ID, SESSION_B);
if (r5.ok) {
  pass("Step 5", "release ok — row deleted");
} else {
  fail("Step 5", "release returned ok=false");
}

// Verify row is actually gone
const row = db.prepare("SELECT * FROM task_locks WHERE task_id = ?").get(TASK_ID);
if (!row) {
  pass("Step 5b", "confirmed row deleted from DB");
} else {
  fail("Step 5b", "row still present after release");
}

// ─── Step 6: Re-claim after release ────────────────────────────────────────

console.log("\nStep 6: Re-claim after release — must succeed");
const r6 = claimTask({
  task_id: TASK_ID,
  task_kind: "cowork-slot",
  owner_session: SESSION_A,
  owner_agent: "cowork-team",
  ttl_seconds: 900,
});

if (r6.claimed) {
  pass("Step 6", "re-claim after release succeeded");
} else {
  fail("Step 6", `re-claim failed — ${JSON.stringify(r6)}`);
}

// ─── List all locks as final state ─────────────────────────────────────────

console.log("\nFinal lock state:");
const finalList = listHeldTasks();
console.log(JSON.stringify(finalList, null, 2));

// ─── Summary ───────────────────────────────────────────────────────────────

const total = results.length;
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;

console.log("\n" + "=".repeat(60));
console.log(`SMOKE TEST SUMMARY: ${passed}/${total} steps passed`);

if (failed > 0) {
  console.log("\nFAILED steps:");
  results.filter(r => !r.pass).forEach(r => {
    console.error(`  [FAIL] ${r.step}: ${r.detail}`);
  });
  console.log("\n*** SMOKE TEST RESULT: FAIL ***");
  process.exit(1);
} else {
  console.log("\n*** SMOKE TEST RESULT: PASS ***");
  process.exit(0);
}
