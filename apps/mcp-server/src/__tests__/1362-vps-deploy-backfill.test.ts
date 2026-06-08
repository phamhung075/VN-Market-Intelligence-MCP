Bun.env["DB_PATH"] = ":memory:";
// src/__tests__/1362-vps-deploy-backfill.test.ts
// Task 1362 — TDD: static content checks for deploy-vinahost.sh + systemd units (Sprint 124)
//
// Tests are written FIRST (RED state). Files being checked do NOT contain the required
// content yet — they will be created/modified in task 1363:
//   - deploy-vinahost.sh section 6           → task 1363
//   - vps-scripts/vn-ohlcv-backfill.service  → task 1363
//   - vps-scripts/vn-ohlcv-backfill.timer    → task 1363
//
// 4 test cases (all RED before 1363, all GREEN after):
//   TC-1: deploy-vinahost.sh contains reference to ohlcv-backfill-poll.sh (the script is deployed)
//   TC-2: vps-scripts/vn-ohlcv-backfill.service exists AND contains ExecStart=/root/ohlcv-backfill-poll.sh
//   TC-3: vps-scripts/vn-ohlcv-backfill.timer exists AND contains OnCalendar=*:0/30
//   TC-4: deploy-vinahost.sh enables the timer (contains vn-ohlcv-backfill.timer)
//
// No SSH, no subprocess, no network — pure static file content analysis.

import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// Project root: two levels up from src/__tests__/
const PROJECT_ROOT = join(import.meta.dir, "../../");

// ── TC-1: deploy-vinahost.sh references ohlcv-backfill-poll.sh ───────────────

describe("Task 1362 — TC-1: deploy-vinahost.sh references poll script", () => {
  it("TC-1: deploy-vinahost.sh contains 'ohlcv-backfill-poll.sh'", () => {
    const deployPath = join(PROJECT_ROOT, "deploy-vinahost.sh");
    expect(existsSync(deployPath)).toBe(true);
    const content = readFileSync(deployPath, "utf-8");
    expect(content.includes("ohlcv-backfill-poll.sh")).toBe(true);
  });
});

// ── TC-2: vps-scripts/vn-ohlcv-backfill.service exists + correct ExecStart ───

describe("Task 1362 — TC-2: vn-ohlcv-backfill.service exists + ExecStart", () => {
  it("TC-2: service file exists and contains ExecStart=/root/ohlcv-backfill-poll.sh", () => {
    const servicePath = join(PROJECT_ROOT, "vps-scripts/vn-ohlcv-backfill.service");
    expect(existsSync(servicePath)).toBe(true);
    const content = readFileSync(servicePath, "utf-8");
    expect(content.includes("ExecStart=/root/ohlcv-backfill-poll.sh")).toBe(true);
  });
});

// ── TC-3: vps-scripts/vn-ohlcv-backfill.timer exists + 30-min calendar ───────

describe("Task 1362 — TC-3: vn-ohlcv-backfill.timer exists + OnCalendar=*:0/30", () => {
  it("TC-3: timer file exists and contains OnCalendar=*:0/30", () => {
    const timerPath = join(PROJECT_ROOT, "vps-scripts/vn-ohlcv-backfill.timer");
    expect(existsSync(timerPath)).toBe(true);
    const content = readFileSync(timerPath, "utf-8");
    expect(content.includes("OnCalendar=*:0/30")).toBe(true);
  });
});

// ── TC-4: deploy-vinahost.sh enables the timer ────────────────────────────────

describe("Task 1362 — TC-4: deploy-vinahost.sh enables vn-ohlcv-backfill.timer", () => {
  it("TC-4: deploy-vinahost.sh contains 'vn-ohlcv-backfill.timer'", () => {
    const deployPath = join(PROJECT_ROOT, "deploy-vinahost.sh");
    expect(existsSync(deployPath)).toBe(true);
    const content = readFileSync(deployPath, "utf-8");
    expect(content.includes("vn-ohlcv-backfill.timer")).toBe(true);
  });
});
