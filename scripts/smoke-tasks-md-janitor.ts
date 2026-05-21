/**
 * Smoke test: tasksMdJanitorJob — Task 1965b
 *
 * Covers AC-1..AC-5 via mocked listHeld + fixture TASKS.md.
 * Run: bun run scripts/smoke-tasks-md-janitor.ts
 *
 * Pass condition: 5/5 PASS (zero FAIL)
 */

import {
  runTasksMdJanitor,
  parseTasksMd,
  parseGitLog,
  findConcurrentCommits,
  appendDashboardRow,
  isDedupActive,
  markDedup,
  _resetDedupStore,
  type JanitorDeps,
} from "../apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.js";
import type { LockRow } from "../apps/mcp-server/src/infrastructure/db/coordinationStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const FIXTURE_TASKS_MD = `
# TASKS

## In Progress

| task | title | type | owner | depends | status |
|------|-------|------|-------|---------|--------|
| 1965b | Implement janitor cron | TASK | dev-mcp-server | 1965a | In Progress |
| 1965c | QA soak | OBSERVE | qa | 1965b | BACKLOG |
| 1966a | Echo cron | TASK | dev-mcp-server | 1965c | BACKLOG |

## Done

| task | title | type | owner | depends | status |
|------|-------|------|-------|---------|--------|
| 1965a | Design | TASK | agent-father | - | Done |
`.trim();

const FIXTURE_PIPELINE_STATE_ACTIVE = JSON.stringify({
  status: "in-progress",
  activeTaskId: "1965b",
  nextAgent: "qa",
  updatedAt: new Date().toISOString(),
});

const FIXTURE_PIPELINE_STATE_EMPTY = JSON.stringify({
  status: "idle",
  activeTaskId: null,
  nextAgent: null,
  updatedAt: new Date().toISOString(),
});

const FIXTURE_PIPELINE_STATE_MISMATCH = JSON.stringify({
  status: "in-progress",
  activeTaskId: "9999x",
  nextAgent: "qa",
  updatedAt: new Date().toISOString(),
});

const FIXTURE_DASHBOARD = `# Signal Dashboard
<!-- SSOT inbox for cowork agents. -->
_Updated: 2026-05-21T00:00Z_

---

## po
| id | ts | from | type | summary | status | payload |
|---|---|---|---|---|---|---|

## tran-ngoc-bau
| id | ts | from | type | summary | status | payload |
|---|---|---|---|---|---|---|
`;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface SmokeResult {
  name: string;
  pass: boolean;
  detail: string;
}

const results: SmokeResult[] = [];

function check(name: string, condition: boolean, detail: string): void {
  results.push({ name, pass: condition, detail });
  const icon = condition ? "PASS" : "FAIL";
  console.log(`  [${icon}] ${name}: ${detail}`);
}

function makeDeps(overrides: Partial<JanitorDeps>): JanitorDeps {
  return {
    listHeld: () => [],
    readFile: (_p: string) => "",
    writeFile: (_p: string, _s: string) => {},
    fileExists: (_p: string) => false,
    runShell: (_cmd: string) => "",
    sendBug: async (_text: string, _key: string) => {},
    nowIso: () => "2026-05-21T03:00:00.000Z",
    projectRoot: "/tmp/smoke-janitor",
    ...overrides,
  };
}

function makeLock(overrides: Partial<LockRow> = {}): LockRow {
  return {
    task_id: "task:1965b",
    task_kind: "sprint-task",
    owner_session: "session-abc",
    owner_agent: "dev-mcp-server",
    claimed_at: Math.floor(Date.now() / 1000) - 300,
    expires_at: Math.floor(Date.now() / 1000) + 3300,
    heartbeat_at: Math.floor(Date.now() / 1000) - 30,
    ttl_seconds: 3600,
    payload: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test AC-1: cron fires at 03:00Z, calls task_list_held
// Verifies: listHeld is called, result is used (held count = 0 on clean run)
// ─────────────────────────────────────────────────────────────────────────────

console.log("\nAC-1: task_list_held is called at job entry");
_resetDedupStore();

{
  let called = false;
  const deps = makeDeps({
    listHeld: () => {
      called = true;
      return [];
    },
    fileExists: (_p) => false,
    runShell: () => "",
  });

  const result = await runTasksMdJanitor(deps);
  check(
    "AC-1: listHeld called",
    called,
    called ? "listHeld was invoked" : "listHeld was NOT invoked",
  );
  check(
    "AC-1: clean result with no held locks",
    result.heldLocks === 0 && result.divergences.length === 0,
    `heldLocks=${result.heldLocks} divergences=${result.divergences.length}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test AC-2: divergence → DASHBOARD row created
// Held lock for 1965b, but TASKS.md shows status=BACKLOG → divergence emitted
// ─────────────────────────────────────────────────────────────────────────────

console.log("\nAC-2: divergence (lock held, TASKS.md status=BACKLOG) → DASHBOARD row");
_resetDedupStore();

{
  const dashboardWrites: string[] = [];
  const bugMessages: string[] = [];

  // TASKS.md with 1965b showing BACKLOG in the status CELL (not the section header)
  const mismatchTasksMd = `
# TASKS

## In Progress

| task | title | type | owner | depends | status |
|------|-------|------|-------|---------|--------|
| 1965b | Implement janitor cron | TASK | dev-mcp-server | 1965a | BACKLOG |
| 1965c | QA soak | OBSERVE | qa | 1965b | BACKLOG |

## Done

| task | title | type | owner | depends | status |
|------|-------|------|-------|---------|--------|
| 1965a | Design | TASK | agent-father | - | Done |
`.trim();

  const deps = makeDeps({
    listHeld: () => [makeLock()],
    readFile: (p) => {
      if (p.includes("TASKS.md")) return mismatchTasksMd;
      if (p.includes("pipeline-state.json")) return FIXTURE_PIPELINE_STATE_ACTIVE;
      if (p.includes("DASHBOARD.md")) return FIXTURE_DASHBOARD;
      return "";
    },
    writeFile: (_p, content) => { dashboardWrites.push(content); },
    fileExists: (_p) => true,
    runShell: () => "",
    sendBug: async (text) => { bugMessages.push(text); },
  });

  const result = await runTasksMdJanitor(deps);

  const hasStatusDivergence = result.divergences.some(
    (d) => d.kind === "status" && d.taskId === "1965b",
  );
  check(
    "AC-2: status divergence detected",
    hasStatusDivergence,
    hasStatusDivergence
      ? `divergences found: ${result.divergences.map(d => d.summary).join("; ")}`
      : `divergences: [${result.divergences.map(d => `${d.kind}:${d.taskId}`).join(", ")}]`,
  );
  check(
    "AC-2: DASHBOARD.md was written",
    dashboardWrites.length > 0,
    `writes=${dashboardWrites.length}`,
  );
  check(
    "AC-2: BUG telegram sent",
    bugMessages.length > 0,
    `bugMessages=${bugMessages.length}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test AC-3: clean day → zero false positives in ## po
// Held lock for 1965b, TASKS.md shows status=In Progress, owners match
// ─────────────────────────────────────────────────────────────────────────────

console.log("\nAC-3: clean day (lock + TASKS.md coherent) → zero DASHBOARD rows");
_resetDedupStore();

{
  const dashboardWrites: string[] = [];

  const deps = makeDeps({
    listHeld: () => [makeLock()],
    readFile: (p) => {
      if (p.includes("TASKS.md")) return FIXTURE_TASKS_MD; // 1965b has "In Progress"
      if (p.includes("pipeline-state.json")) return FIXTURE_PIPELINE_STATE_ACTIVE;
      return "";
    },
    fileExists: (p) => p.includes("TASKS.md") || p.includes("pipeline-state.json"),
    writeFile: (_p, content) => { dashboardWrites.push(content); },
    runShell: () => "",
    sendBug: async () => {},
  });

  const result = await runTasksMdJanitor(deps);

  check(
    "AC-3: zero divergences on clean day",
    result.divergences.length === 0,
    `divergences=${result.divergences.length}: [${result.divergences.map(d => d.summary).join(", ")}]`,
  );
  check(
    "AC-3: no DASHBOARD writes on clean day",
    dashboardWrites.length === 0,
    `writes=${dashboardWrites.length}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test AC-4: task_list_held empty + pipeline-state.activeTaskId non-null → alert
// ─────────────────────────────────────────────────────────────────────────────

console.log("\nAC-4: task_list_held empty + pipeline-state.activeTaskId non-null → DASHBOARD alert");
_resetDedupStore();

{
  const dashboardWrites: string[] = [];
  const bugMessages: string[] = [];

  const deps = makeDeps({
    listHeld: () => [], // empty — no held locks
    readFile: (p) => {
      if (p.includes("pipeline-state.json")) return FIXTURE_PIPELINE_STATE_MISMATCH; // activeTaskId=9999x
      if (p.includes("DASHBOARD.md")) return FIXTURE_DASHBOARD;
      return "";
    },
    fileExists: (p) => p.includes("pipeline-state.json") || p.includes("DASHBOARD.md"),
    writeFile: (_p, content) => { dashboardWrites.push(content); },
    runShell: () => "",
    sendBug: async (text) => { bugMessages.push(text); },
  });

  const result = await runTasksMdJanitor(deps);

  const hasPipelineMismatch = result.divergences.some(
    (d) => d.kind === "pipeline_mismatch",
  );
  check(
    "AC-4: pipeline_mismatch divergence emitted",
    hasPipelineMismatch,
    hasPipelineMismatch
      ? `found: ${result.divergences.find(d => d.kind === "pipeline_mismatch")?.summary}`
      : `divergences: [${result.divergences.map(d => d.kind).join(", ")}]`,
  );
  check(
    "AC-4: DASHBOARD row written for pipeline mismatch",
    dashboardWrites.length > 0,
    `writes=${dashboardWrites.length}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test AC-5: concurrent commit detection via git log
// Two commits within 30s → DASHBOARD alert
// ─────────────────────────────────────────────────────────────────────────────

console.log("\nAC-5: concurrent TASKS.md commits within 30s → DASHBOARD alert");
_resetDedupStore();

{
  const dashboardWrites: string[] = [];

  // Simulate two commits 10 seconds apart
  const baseEpoch = 1716260000; // arbitrary epoch
  const gitOutput = [
    `aaaa1111 ${new Date(baseEpoch * 1000).toISOString()}`,
    `bbbb2222 ${new Date((baseEpoch + 10) * 1000).toISOString()}`, // 10s later → concurrent
    `cccc3333 ${new Date((baseEpoch + 3600) * 1000).toISOString()}`, // 1h later → NOT concurrent
  ].join("\n");

  const deps = makeDeps({
    listHeld: () => [],
    fileExists: (p) => p.includes("DASHBOARD.md") || p.includes("pipeline-state.json"),
    readFile: (p) => {
      if (p.includes("pipeline-state.json")) return FIXTURE_PIPELINE_STATE_EMPTY;
      if (p.includes("DASHBOARD.md")) return FIXTURE_DASHBOARD;
      return "";
    },
    writeFile: (_p, content) => { dashboardWrites.push(content); },
    runShell: (_cmd) => gitOutput,
    sendBug: async () => {},
  });

  const result = await runTasksMdJanitor(deps);

  const hasConcurrentCommits = result.divergences.some(
    (d) => d.kind === "concurrent_commit",
  );
  check(
    "AC-5: concurrent commit pair detected",
    hasConcurrentCommits,
    hasConcurrentCommits
      ? `found: ${result.divergences.find(d => d.kind === "concurrent_commit")?.summary}`
      : `divergences: [${result.divergences.map(d => d.kind).join(", ")}]`,
  );
  check(
    "AC-5: DASHBOARD row written for concurrent commits",
    dashboardWrites.length > 0,
    `writes=${dashboardWrites.length}`,
  );
  check(
    "AC-5: only 1 pair found (not the 1h gap)",
    result.concurrentCommits.length === 1,
    `pairs=${result.concurrentCommits.length} (expected 1)`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

const passed = results.filter(r => r.pass).length;
const total = results.length;

console.log(`\n${"=".repeat(60)}`);
console.log(`Smoke result: ${passed}/${total} PASS`);

if (passed < total) {
  const failed = results.filter(r => !r.pass);
  console.error("\nFailed checks:");
  for (const f of failed) {
    console.error(`  FAIL: ${f.name} — ${f.detail}`);
  }
  process.exit(1);
} else {
  console.log("All AC-1..AC-5 checks passed.");
}
