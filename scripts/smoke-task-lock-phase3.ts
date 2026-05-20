/**
 * Smoke Test — Task-Lock System Phase 3 (Multi-Session: sprint-task + dashboard-row)
 *
 * Validates Phase 3 dev-team wiring AC from Sprint 1960 Plan:
 *   AC-1: Two sessions race same sprint-task claim — exactly one wins.
 *   AC-2: Heartbeat from holder extends TTL; non-holder heartbeat returns ok=false.
 *   AC-3: Session A releases → Session B can claim same task_id.
 *   AC-4: dashboard-row kind: Session A claims, Session B blocked; A releases → no dangling rows.
 *   AC-5: TTL expiry simulation (manual DB poke) — next claim from new session succeeds (stale-steal).
 *   AC-6: Cross-kind isolation — sprint-task:X and dashboard-row:X are independent.
 *
 * Test matrix (10 tests):
 *   --- sprint-task kind (TTL=3600) ---
 *   T1: Session A claims `sprint-task:1960c` → claimed=true
 *   T2: Session B same task_id, different owner_session → claimed=false, current_holder.owner_session==A
 *   T3: Heartbeat from Session A extends expiry (ok=true, expires_at renewed)
 *   T4: Heartbeat from Session B (non-holder) → ok=false
 *   T5: A releases → B can claim same task_id → claimed=true
 *   --- dashboard-row kind (TTL=1800) ---
 *   T6: Session A claims `dashboard-row:dash:po:row-1960` → claimed=true
 *   T7: Session B same row → claimed=false
 *   T8: A releases → no dangling task_locks rows for that task_id (count=0)
 *   --- TTL expiry simulation (manual DB poke) ---
 *   T9: Backdate expires_at on held row → next claim from new session succeeds (stolen=true)
 *   --- Cross-kind isolation ---
 *   T10: `sprint-task:X` and `dashboard-row:X` are independent (kind is part of uniqueness)
 *
 * Flow integration grep checks (non-runtime):
 *   G1: .claude/flows/po/sprint-kickoff.md contains task_claim
 *   G2: .claude/flows/po/sprint-signoff.md contains task_release
 *   G3: .claude/flows/pm/main.md contains task_heartbeat
 *   G4: .claude/flows/developer/main.md contains task_claim AND task_heartbeat
 *   G5: .claude/flows/developer/microservice-main.md contains task_claim AND task_heartbeat
 *   G6: .claude/flows/qa/main.md contains task_heartbeat AND task_release
 *   G7: .claude/flows/agent-father/edit-apply.md contains task_claim AND task_heartbeat AND task_release
 *   G8: .claude/flows/dev-team/drain-signals.md contains task_claim AND task_release
 *   G9: All 8 flow files contain task-lock skill lazy-load line
 *
 * Pipeline-state AUGMENT checks:
 *   P1: docs/pipeline-state.json exists and is valid JSON
 *   P2: pipeline-state.json contains expected SSOT fields (not removed by 1960c edits)
 *
 * MCP grammar check:
 *   M1: All wired flow files use call_tool(server="vn-market") meta-syntax (not curl/fetch)
 *
 * Run: bun scripts/smoke-task-lock-phase3.ts  (from project root)
 */

// Use in-memory DB — no coordination.db on disk touched
process.env["COORDINATION_DB_PATH"] = ":memory:";

import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";

const PROJECT_ROOT = resolve(import.meta.dir, "..");

const storeModule = resolve(
  PROJECT_ROOT,
  "apps/mcp-server/src/infrastructure/db/coordinationStore.ts",
);

const {
  ensureCoordinationTable,
  claimTask,
  heartbeatTask,
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
const SESSION_A = "pid-11111-ts-1716220000000";  // "session 1" — first agent
const SESSION_B = "pid-22222-ts-1716220000001";  // "session 2" — parallel agent
const SESSION_C = "pid-33333-ts-1716220000002";  // "session 3" — third agent (for T9)

// Task IDs used in tests
const SPRINT_TASK_ID = "sprint-task:1960c";                  // T1-T5
const DASH_ROW_ID    = "dashboard-row:dash:po:row-1960";     // T6-T8
const CROSS_TASK_ID  = "sprint-task:cross-kind-X";           // T10 (sprint-task kind)
const CROSS_DASH_ID  = "dashboard-row:cross-kind-X";         // T10 (dashboard-row kind — same bare ID)
const EXPIRE_TASK_ID = "sprint-task:1960c-ttl-expire";       // T9

// ── Test harness ───────────────────────────────────────────────────────────

const results: Array<{ id: string; pass: boolean; detail: string }> = [];
let failCount = 0;

function assert(id: string, condition: boolean, detail: string): void {
  results.push({ id, pass: condition, detail });
  const marker = condition ? "[PASS]" : "[FAIL]";
  if (condition) {
    console.log(`  ${marker} ${id} — ${detail}`);
  } else {
    console.error(`  ${marker} ${id} — ${detail}`);
    failCount++;
  }
}

// ── Helper: read flow file content ────────────────────────────────────────

function readFlow(relPath: string): string {
  const absPath = resolve(PROJECT_ROOT, relPath);
  if (!existsSync(absPath)) return "";
  return readFileSync(absPath, "utf-8");
}

// ── T1-T2: Two sessions race on same sprint-task ───────────────────────────

console.log("\n=== T1-T2: Two sessions race on sprint-task:1960c ===");

const claimA = claimTask({
  task_id:     SPRINT_TASK_ID,
  task_kind:   "sprint-task",
  owner_session: SESSION_A,
  owner_agent: "developer",
  ttl_seconds: 3600,
  payload:     JSON.stringify({ task_title: "Phase 3 smoke", branch: "main" }),
});

assert(
  "T1",
  claimA.claimed === true,
  `Session A claims sprint-task:1960c → claimed=${claimA.claimed} (must be true)`,
);

const claimB = claimTask({
  task_id:     SPRINT_TASK_ID,
  task_kind:   "sprint-task",
  owner_session: SESSION_B,
  owner_agent: "developer",
  ttl_seconds: 3600,
});

const holderSession = claimB.claimed === false
  ? (claimB as { current_holder?: { owner_session: string } }).current_holder?.owner_session
  : undefined;

assert(
  "T2",
  claimB.claimed === false && holderSession === SESSION_A,
  `Session B claim → claimed=${claimB.claimed}, current_holder.owner_session="${holderSession}" (must be SESSION_A)`,
);

// ── T3: Heartbeat from Session A extends expiry ────────────────────────────

console.log("\n=== T3-T4: Heartbeat from holder vs non-holder ===");

// Read current expires_at before heartbeat
const rowBefore = db.prepare("SELECT expires_at, heartbeat_at FROM task_locks WHERE task_id = ?")
  .get(SPRINT_TASK_ID) as { expires_at: number; heartbeat_at: number } | null;

const hbA = heartbeatTask(SPRINT_TASK_ID, SESSION_A);

const rowAfter = db.prepare("SELECT expires_at, heartbeat_at FROM task_locks WHERE task_id = ?")
  .get(SPRINT_TASK_ID) as { expires_at: number; heartbeat_at: number } | null;

assert(
  "T3",
  hbA.ok === true && hbA.expires_at > 0 && (rowAfter?.expires_at ?? 0) >= (rowBefore?.expires_at ?? 0),
  `Session A heartbeat ok=${hbA.ok}, expires_at=${hbA.expires_at} (renewed, must be >0)`,
);

// ── T4: Heartbeat from Session B (non-holder) → ok=false ──────────────────

const hbB = heartbeatTask(SPRINT_TASK_ID, SESSION_B);

assert(
  "T4",
  hbB.ok === false,
  `Session B heartbeat (non-holder) ok=${hbB.ok} (must be false — owner_session mismatch)`,
);

// ── T5: A releases → B can claim same task_id ─────────────────────────────

console.log("\n=== T5: Release + re-claim cycle (sprint-task) ===");

const releaseA = releaseTask(SPRINT_TASK_ID, SESSION_A);
const reclaimB = claimTask({
  task_id:     SPRINT_TASK_ID,
  task_kind:   "sprint-task",
  owner_session: SESSION_B,
  owner_agent: "developer",
  ttl_seconds: 3600,
});

assert(
  "T5",
  releaseA.ok === true && reclaimB.claimed === true,
  `Session A release ok=${releaseA.ok}, Session B re-claim claimed=${reclaimB.claimed} (both must be true)`,
);

// Clean up for next tests
releaseTask(SPRINT_TASK_ID, SESSION_B);

// ── T6-T7: dashboard-row kind ─────────────────────────────────────────────

console.log("\n=== T6-T7: dashboard-row claim (per-row drain collision) ===");

const claimDashA = claimTask({
  task_id:     DASH_ROW_ID,
  task_kind:   "dashboard-row",
  owner_session: SESSION_A,
  owner_agent: "dev-team",
  ttl_seconds: 1800,
  payload:     JSON.stringify({ row_id: "row-1960", from: "qa", type: "qa-approved" }),
});

assert(
  "T6",
  claimDashA.claimed === true,
  `Session A claims dashboard-row:dash:po:row-1960 → claimed=${claimDashA.claimed} (must be true)`,
);

const claimDashB = claimTask({
  task_id:     DASH_ROW_ID,
  task_kind:   "dashboard-row",
  owner_session: SESSION_B,
  owner_agent: "dev-team",
  ttl_seconds: 1800,
});

assert(
  "T7",
  claimDashB.claimed === false,
  `Session B claims same dashboard row → claimed=${claimDashB.claimed} (must be false — duplicate drain prevented)`,
);

// ── T8: A releases → no dangling rows ─────────────────────────────────────

console.log("\n=== T8: Release dashboard-row → no dangling rows ===");

releaseTask(DASH_ROW_ID, SESSION_A);

const dashRemaining = listHeldTasks({ kind: "dashboard-row" });
// Filter to our specific task_id
const danglers = dashRemaining.locks.filter(r => r.task_id === DASH_ROW_ID);

assert(
  "T8",
  danglers.length === 0,
  `After A releases dashboard-row, dangling rows for that task_id = ${danglers.length} (must be 0)`,
);

// ── T9: TTL expiry simulation (manual DB poke) ────────────────────────────

console.log("\n=== T9: TTL expiry simulation via manual DB backdate ===");

// Session A claims with normal TTL first
const claimExpire = claimTask({
  task_id:     EXPIRE_TASK_ID,
  task_kind:   "sprint-task",
  owner_session: SESSION_A,
  owner_agent: "developer",
  ttl_seconds: 3600,
});

// Backdate expires_at to the past (simulate TTL expiry without waiting)
const nowS = Math.floor(Date.now() / 1000);
db.prepare("UPDATE task_locks SET expires_at = ?, heartbeat_at = ? WHERE task_id = ?")
  .run(nowS - 10, nowS - 400, EXPIRE_TASK_ID);

// Session C (new session) tries to claim — should succeed via stale-steal
const stealC = claimTask({
  task_id:     EXPIRE_TASK_ID,
  task_kind:   "sprint-task",
  owner_session: SESSION_C,
  owner_agent: "developer",
  ttl_seconds: 3600,
});

assert(
  "T9",
  claimExpire.claimed === true && stealC.claimed === true && (stealC as { stolen?: boolean }).stolen === true,
  `Session A initial claim=${claimExpire.claimed}, after backdate Session C steal claimed=${stealC.claimed}, stolen=${(stealC as { stolen?: boolean }).stolen} (all must be true)`,
);

// Clean up
releaseTask(EXPIRE_TASK_ID, SESSION_C);

// ── T10: Cross-kind isolation ──────────────────────────────────────────────

console.log("\n=== T10: Cross-kind isolation (sprint-task:X ≠ dashboard-row:X) ===");

// Claim sprint-task with bare id "cross-kind-X" as Session A
const claimCrossTask = claimTask({
  task_id:     CROSS_TASK_ID,
  task_kind:   "sprint-task",
  owner_session: SESSION_A,
  owner_agent: "developer",
  ttl_seconds: 3600,
});

// Session A also claims dashboard-row with same bare id — should be independent
const claimCrossDash = claimTask({
  task_id:     CROSS_DASH_ID,
  task_kind:   "dashboard-row",
  owner_session: SESSION_A,
  owner_agent: "dev-team",
  ttl_seconds: 1800,
});

// Session B tries to claim the sprint-task — blocked
const claimCrossTaskB = claimTask({
  task_id:     CROSS_TASK_ID,
  task_kind:   "sprint-task",
  owner_session: SESSION_B,
  owner_agent: "developer",
  ttl_seconds: 3600,
});

// Verify sprint-task and dashboard-row with same "name" are fully independent
assert(
  "T10",
  claimCrossTask.claimed === true
    && claimCrossDash.claimed === true
    && claimCrossTaskB.claimed === false,
  `sprint-task:X claimed by A=${claimCrossTask.claimed}, dashboard-row:X claimed by A=${claimCrossDash.claimed}, sprint-task:X blocked for B=${claimCrossTaskB.claimed===false} (all must match)`,
);

// Clean up
releaseTask(CROSS_TASK_ID, SESSION_A);
releaseTask(CROSS_DASH_ID, SESSION_A);

// ── Verify zero dangling locks ─────────────────────────────────────────────

const allLocks = listHeldTasks();
console.log(`\n[INFO] Total dangling locks after cleanup: ${allLocks.count} (expected 0)`);

// ── Flow integration grep checks (G1-G9) ──────────────────────────────────

console.log("\n=== Flow Integration Grep Checks (G1-G9) ===");

const FLOW_FILES: Record<string, string> = {
  "po/sprint-kickoff.md":          ".claude/flows/po/sprint-kickoff.md",
  "po/sprint-signoff.md":          ".claude/flows/po/sprint-signoff.md",
  "pm/main.md":                    ".claude/flows/pm/main.md",
  "developer/main.md":             ".claude/flows/developer/main.md",
  "developer/microservice-main.md":".claude/flows/developer/microservice-main.md",
  "qa/main.md":                    ".claude/flows/qa/main.md",
  "agent-father/edit-apply.md":    ".claude/flows/agent-father/edit-apply.md",
  "dev-team/drain-signals.md":     ".claude/flows/dev-team/drain-signals.md",
};

const flowContents: Record<string, string> = {};
for (const [key, relPath] of Object.entries(FLOW_FILES)) {
  flowContents[key] = readFlow(relPath);
}

assert(
  "G1",
  flowContents["po/sprint-kickoff.md"].includes("task_claim"),
  "po/sprint-kickoff.md contains task_claim",
);

assert(
  "G2",
  flowContents["po/sprint-signoff.md"].includes("task_release"),
  "po/sprint-signoff.md contains task_release",
);

assert(
  "G3",
  flowContents["pm/main.md"].includes("task_heartbeat"),
  "pm/main.md contains task_heartbeat",
);

assert(
  "G4",
  flowContents["developer/main.md"].includes("task_claim")
    && flowContents["developer/main.md"].includes("task_heartbeat"),
  "developer/main.md contains task_claim AND task_heartbeat",
);

assert(
  "G5",
  flowContents["developer/microservice-main.md"].includes("task_claim")
    && flowContents["developer/microservice-main.md"].includes("task_heartbeat"),
  "developer/microservice-main.md contains task_claim AND task_heartbeat",
);

assert(
  "G6",
  flowContents["qa/main.md"].includes("task_heartbeat")
    && flowContents["qa/main.md"].includes("task_release"),
  "qa/main.md contains task_heartbeat AND task_release",
);

assert(
  "G7",
  flowContents["agent-father/edit-apply.md"].includes("task_claim")
    && flowContents["agent-father/edit-apply.md"].includes("task_heartbeat")
    && flowContents["agent-father/edit-apply.md"].includes("task_release"),
  "agent-father/edit-apply.md contains task_claim AND task_heartbeat AND task_release",
);

assert(
  "G8",
  flowContents["dev-team/drain-signals.md"].includes("task_claim")
    && flowContents["dev-team/drain-signals.md"].includes("task_release"),
  "dev-team/drain-signals.md contains task_claim AND task_release",
);

// G9: All 8 flow files contain task-lock skill lazy-load line
const SKILL_LINE = ".claude/skills/task-lock/SKILL.md";
const allHaveSkillRef = Object.entries(flowContents).every(([_k, content]) =>
  content.includes(SKILL_LINE)
);
const missingSkillRef = Object.entries(flowContents)
  .filter(([_k, content]) => !content.includes(SKILL_LINE))
  .map(([k]) => k);

assert(
  "G9",
  allHaveSkillRef,
  allHaveSkillRef
    ? "All 8 flow files contain task-lock skill lazy-load line"
    : `Missing skill lazy-load in: ${missingSkillRef.join(", ")}`,
);

// ── Pipeline-state AUGMENT checks (P1-P2) ─────────────────────────────────

console.log("\n=== Pipeline-State AUGMENT Checks (P1-P2) ===");

const pipelineStatePath = resolve(PROJECT_ROOT, "docs/pipeline-state.json");
let pipelineState: Record<string, unknown> | null = null;

try {
  pipelineState = JSON.parse(readFileSync(pipelineStatePath, "utf-8"));
} catch {
  pipelineState = null;
}

assert(
  "P1",
  pipelineState !== null,
  `docs/pipeline-state.json exists and parses as valid JSON`,
);

const psHasRequiredFields = pipelineState !== null
  && "status" in pipelineState
  && "nextAgent" in pipelineState
  && "updatedAt" in pipelineState;

assert(
  "P2",
  psHasRequiredFields,
  `pipeline-state.json retains SSOT fields (status, nextAgent, updatedAt) — AUGMENT not REPLACE confirmed`,
);

// ── MCP grammar check (M1) ────────────────────────────────────────────────

console.log("\n=== MCP Grammar Check (M1) ===");

// Verify no flow file uses literal 'curl' or 'fetch(' for task_claim/task_heartbeat/task_release
// (correct form is call_tool(server="vn-market", ...))
const MCP_PATTERN = /call_tool\s*\(\s*(?:server\s*=\s*["']vn-market["']|["']task_(?:claim|heartbeat|release)["'])/;
const CURL_PATTERN = /curl.*task_(?:claim|heartbeat|release)/;

const mcpViolations: string[] = [];
const curlViolations: string[] = [];

for (const [key, content] of Object.entries(flowContents)) {
  // Check only files that have task_ calls
  const hasTaskCall = content.includes("task_claim") || content.includes("task_heartbeat") || content.includes("task_release");
  if (!hasTaskCall) continue;

  // Must use call_tool form (meta-syntax for agent)
  if (!MCP_PATTERN.test(content) && !content.includes("call_tool(")) {
    mcpViolations.push(key);
  }
  // Must NOT use literal curl for task lock calls
  if (CURL_PATTERN.test(content)) {
    curlViolations.push(key);
  }
}

assert(
  "M1",
  mcpViolations.length === 0 && curlViolations.length === 0,
  mcpViolations.length === 0 && curlViolations.length === 0
    ? "All wired flow files use call_tool(...) meta-syntax (not curl) for task_claim/heartbeat/release"
    : `Grammar violations — missing call_tool: [${mcpViolations.join(", ")}]; using curl: [${curlViolations.join(", ")}]`,
);

// ── Summary ────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(70));

const smokePassed   = results.filter(r => r.id.startsWith("T") && r.pass).length;
const smokeTotal    = results.filter(r => r.id.startsWith("T")).length;
const grepPassed    = results.filter(r => r.id.startsWith("G") && r.pass).length;
const grepTotal     = results.filter(r => r.id.startsWith("G")).length;
const psPassed      = results.filter(r => r.id.startsWith("P") && r.pass).length;
const psTotal       = results.filter(r => r.id.startsWith("P")).length;
const mcpPassed     = results.filter(r => r.id.startsWith("M") && r.pass).length;
const mcpTotal      = results.filter(r => r.id.startsWith("M")).length;
const totalPassed   = results.filter(r => r.pass).length;
const totalAll      = results.length;

console.log(`Smoke (T): ${smokePassed}/${smokeTotal}`);
console.log(`Grep  (G): ${grepPassed}/${grepTotal}`);
console.log(`PS    (P): ${psPassed}/${psTotal}`);
console.log(`MCP   (M): ${mcpPassed}/${mcpTotal}`);
console.log(`─`.repeat(40));
console.log(`TOTAL:     ${totalPassed}/${totalAll}`);

if (failCount > 0) {
  console.error("\nFAILED assertions:");
  results.filter(r => !r.pass).forEach(r => {
    console.error(`  [FAIL] ${r.id}: ${r.detail}`);
  });
  console.error("\n*** SMOKE TEST PHASE 3 RESULT: FAIL ***");
  process.exit(1);
} else {
  console.log(`\n*** SMOKE TEST PHASE 3 RESULT: PASS (${totalPassed}/${totalAll}) ***`);
  process.exit(0);
}
