Bun.env["DB_PATH"] = ":memory:";
// src/__tests__/1378-vps-auto-deploy.test.ts
// Task 1378 — TDD: maybe-deploy-vps.sh detection logic (Sprint 132)
//
// All tests use --dry-run + FAKE_DIFF env var — no git history manipulation,
// no SSH, no network. Script must be RED before scripts/maybe-deploy-vps.sh
// exists (file-exists assertion fails). GREEN after task 1379.
//
// TC-1: script file exists and is executable
// TC-2: trigger path — FAKE_DIFF contains vps-scripts/ path → "VPS deploy triggered"
// TC-3: skip path   — FAKE_DIFF contains only src/ path → "VPS deploy skipped"
// TC-4: trigger path — FAKE_DIFF contains deploy-vinahost.sh → "VPS deploy triggered"
// TC-5: prefix guard — FAKE_DIFF contains src/test-vps-scripts/helper.ts → "VPS deploy skipped"
// TC-6: empty diff   — FAKE_DIFF="" → "VPS deploy skipped"

import { describe, it, expect } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

const PROJECT_ROOT = join(import.meta.dir, "../../");
const SCRIPT = join(PROJECT_ROOT, "scripts/maybe-deploy-vps.sh");

// Helper: run script synchronously with --dry-run and FAKE_DIFF env
function runScript(fakeDiff: string): { stdout: string; exitCode: number } {
  const result = Bun.spawnSync(["bash", SCRIPT, "--dry-run"], {
    env: { ...process.env, FAKE_DIFF: fakeDiff },
    cwd: PROJECT_ROOT,
  });
  return {
    stdout: result.stdout.toString(),
    exitCode: result.exitCode ?? 1,
  };
}

// TC-1: file exists and is executable
describe("Task 1378 — TC-1: script exists and is executable", () => {
  it("TC-1: scripts/maybe-deploy-vps.sh exists", () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it("TC-1: scripts/maybe-deploy-vps.sh is executable", () => {
    const st = statSync(SCRIPT);
    // owner execute bit (0o100)
    expect(!!(st.mode & 0o100)).toBe(true);
  });
});

// TC-2: trigger path via vps-scripts/
describe("Task 1378 — TC-2: trigger on vps-scripts/ path", () => {
  it("TC-2: stdout contains 'VPS deploy triggered' and exits 0", () => {
    const { stdout, exitCode } = runScript("vps-scripts/fetch-prices.sh\nsrc/scheduler/jobs.ts");
    expect(stdout).toContain("VPS deploy triggered");
    expect(exitCode).toBe(0);
  });
});

// TC-3: skip path — only src/ files
describe("Task 1378 — TC-3: skip on non-VPS paths", () => {
  it("TC-3: stdout contains 'VPS deploy skipped' and exits 0", () => {
    const { stdout, exitCode } = runScript("src/scheduler/jobs.ts\ndocs/TECH_132.md");
    expect(stdout).toContain("VPS deploy skipped");
    expect(exitCode).toBe(0);
  });
});

// TC-4: trigger path via deploy-vinahost.sh itself
describe("Task 1378 — TC-4: trigger on deploy-vinahost.sh", () => {
  it("TC-4: stdout contains 'VPS deploy triggered' and exits 0", () => {
    const { stdout, exitCode } = runScript("deploy-vinahost.sh");
    expect(stdout).toContain("VPS deploy triggered");
    expect(exitCode).toBe(0);
  });
});

// TC-5: prefix guard — substring 'vps-scripts' inside different dir must not trigger
describe("Task 1378 — TC-5: prefix guard — src/test-vps-scripts/ must not trigger", () => {
  it("TC-5: stdout contains 'VPS deploy skipped' and exits 0", () => {
    const { stdout, exitCode } = runScript("src/test-vps-scripts/helper.ts");
    expect(stdout).toContain("VPS deploy skipped");
    expect(exitCode).toBe(0);
  });
});

// TC-6: empty diff
describe("Task 1378 — TC-6: empty FAKE_DIFF → skipped", () => {
  it("TC-6: stdout contains 'VPS deploy skipped' and exits 0", () => {
    const { stdout, exitCode } = runScript("");
    expect(stdout).toContain("VPS deploy skipped");
    expect(exitCode).toBe(0);
  });
});
