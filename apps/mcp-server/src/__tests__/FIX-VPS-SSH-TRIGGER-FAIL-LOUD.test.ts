/**
 * FIX-VPS-SSH-TRIGGER-FAIL-LOUD — cron audit item 2
 *
 * Root cause: none of the 5 trigger_*_vps_fetch tools ever called sshExec() (or any
 * process launch) in "live" mode — they string-built a command, appended fake
 * "will be executed / fire-and-forget" prose to log_tail, and returned a
 * success-shaped {attempted:[],success:[],failed:[]} payload regardless. See
 * vpsDebugSshTrigger.ts header for the full RCA.
 *
 * This file tests the shared executor in isolation (sanitizeTicker /
 * buildVpsDebugCommand / triggerVpsDebugScript) with an injected fake sshExecFn —
 * NEVER spawns a real ssh process.
 *
 * ACs:
 *   AC-1: sanitizeTicker accepts valid 1-10 char alnum tickers, uppercases them
 *   AC-2: sanitizeTicker rejects shell-metacharacter / oversized / empty input
 *   AC-3: sanitizeTickers splits a mixed list into valid/invalid buckets
 *   AC-4: buildVpsDebugCommand shape (no tickers, with tickers, verbose)
 *   AC-5: triggerVpsDebugScript ok=true only when injected sshExecFn resolves exitCode 0
 *   AC-6: triggerVpsDebugScript ok=false + reason populated on non-zero exit
 *   AC-7: triggerVpsDebugScript ok=false + reason populated when sshExecFn throws
 *         (e.g. VPS_HOST not configured, ssh binary missing) — never silently succeeds
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  sanitizeTicker,
  sanitizeTickers,
  buildVpsDebugCommand,
  triggerVpsDebugScript,
  type SshExecFn,
} from "../interface/mcp/vpsDebugSshTrigger.js";
import { handleTriggerPriceDebug } from "../interface/mcp/priceDebugTriggerHandler.js";
import { handleTriggerSbvDebug } from "../interface/mcp/sbvDebugTriggerHandler.js";
import { handleTriggerBctcDebug } from "../interface/mcp/bctcDebugTriggerHandler.js";

describe("FIX-VPS-SSH-TRIGGER-FAIL-LOUD — sanitizeTicker", () => {
  it("AC-1: accepts a valid ticker and uppercases it", () => {
    expect(sanitizeTicker("fpt")).toBe("FPT");
    expect(sanitizeTicker("VIC")).toBe("VIC");
    expect(sanitizeTicker("vn30")).toBe("VN30");
  });

  it("AC-2: rejects shell metacharacters", () => {
    expect(sanitizeTicker("FPT; rm -rf /")).toBeNull();
    expect(sanitizeTicker("FPT`whoami`")).toBeNull();
    expect(sanitizeTicker("FPT && echo pwned")).toBeNull();
    expect(sanitizeTicker("$(id)")).toBeNull();
  });

  it("AC-2b: rejects oversized and empty input", () => {
    expect(sanitizeTicker("A".repeat(11))).toBeNull();
    expect(sanitizeTicker("")).toBeNull();
    expect(sanitizeTicker("   ")).toBeNull();
  });
});

describe("FIX-VPS-SSH-TRIGGER-FAIL-LOUD — sanitizeTickers", () => {
  it("AC-3: splits a mixed list into valid/invalid", () => {
    const { valid, invalid } = sanitizeTickers(["FPT", "VIC; rm -rf /", "hpg"]);
    expect(valid).toEqual(["FPT", "HPG"]);
    expect(invalid).toEqual(["VIC; rm -rf /"]);
  });

  it("AC-3b: undefined input returns empty buckets", () => {
    const { valid, invalid } = sanitizeTickers(undefined);
    expect(valid).toEqual([]);
    expect(invalid).toEqual([]);
  });
});

describe("FIX-VPS-SSH-TRIGGER-FAIL-LOUD — buildVpsDebugCommand", () => {
  it("AC-4a: no tickers, no verbose", () => {
    expect(buildVpsDebugCommand("run-sbv-debug.sh", [], false)).toBe("/root/run-sbv-debug.sh");
  });

  it("AC-4b: with tickers and verbose", () => {
    expect(buildVpsDebugCommand("run-price-debug.sh", ["FPT", "VIC"], true)).toBe(
      "/root/run-price-debug.sh --ticker FPT --ticker VIC --verbose",
    );
  });

  it("AC-4c: verbose only, no tickers", () => {
    expect(buildVpsDebugCommand("run-news-debug.sh", [], true)).toBe(
      "/root/run-news-debug.sh --verbose",
    );
  });
});

describe("FIX-VPS-SSH-TRIGGER-FAIL-LOUD — triggerVpsDebugScript", () => {
  it("AC-5: ok=true when injected sshExecFn resolves exitCode 0", async () => {
    const outcome = await triggerVpsDebugScript("run-sbv-debug.sh", [], true, async (command) => ({
      exitCode: 0,
      stdout: "queued",
      stderr: "",
      durationMs: 12,
    }));

    expect(outcome.ok).toBe(true);
    expect(outcome.command).toBe("/root/run-sbv-debug.sh --verbose");
    expect(outcome.reason).toBeUndefined();
  });

  it("AC-6: ok=false + reason populated on non-zero exit — never success-shaped", async () => {
    const outcome = await triggerVpsDebugScript("run-price-debug.sh", ["FPT"], false, async () => ({
      exitCode: 255,
      stdout: "",
      stderr: "ssh: connect to host 125.212.251.27 port 22: Connection refused",
      durationMs: 50,
    }));

    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toContain("Connection refused");
    expect(outcome.exitCode).toBe(255);
  });

  it("AC-7: ok=false + reason populated when sshExecFn throws (e.g. missing ssh binary / VPS_HOST unset)", async () => {
    const outcome = await triggerVpsDebugScript("run-foreign-flow-debug.sh", [], true, async () => {
      throw new Error("VPS_HOST not configured");
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe("VPS_HOST not configured");
    expect(outcome.exitCode).toBe(-1);
  });

  it("AC-7b: invalid/unsanitized tickers must never reach the remote command unfiltered", async () => {
    // Caller is responsible for sanitizing BEFORE calling triggerVpsDebugScript —
    // this proves the command builder does not itself inject anything extra,
    // and that a sanitized empty valid[] produces a clean no-ticker command.
    const { valid } = sanitizeTickers(["FPT; rm -rf /"]);
    expect(valid).toEqual([]);
    const command = buildVpsDebugCommand("run-price-debug.sh", valid, false);
    expect(command).toBe("/root/run-price-debug.sh");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Handler-level integration — real handler functions + injected fake sshExecFn.
// Proves the end-to-end fix (not just the shared module in isolation): a
// "live" call now actually reflects the real SSH outcome in attempted/success/
// failed, and NEVER returns a success-shaped payload when the SSH call failed
// or was never attempted.
// ─────────────────────────────────────────────────────────────────────────────

const fakeOk: SshExecFn = async () => ({ exitCode: 0, stdout: "queued", stderr: "", durationMs: 5 });
const fakeFail: SshExecFn = async () => ({
  exitCode: 255,
  stdout: "",
  stderr: "ssh: connect to host 125.212.251.27 port 22: Connection refused",
  durationMs: 20,
});

describe("FIX-VPS-SSH-TRIGGER-FAIL-LOUD — handler-level: price (ticker-based)", () => {
  it("live + injected success → success populated, failed empty, log_tail says exited 0", async () => {
    const result = await handleTriggerPriceDebug(
      { tickers: ["FPT", "VIC"], verbose: false, dry_run: false },
      fakeOk,
    );
    expect(result.success).toEqual(["FPT", "VIC"]);
    expect(result.failed).toEqual([]);
    expect(result.log_tail).toContain("exited 0");
  });

  it("live + injected failure → failed populated with real reason, success empty (never success-shaped)", async () => {
    const result = await handleTriggerPriceDebug(
      { tickers: ["FPT"], verbose: false, dry_run: false },
      fakeFail,
    );
    expect(result.success).toEqual([]);
    expect(result.failed).toEqual([{ ticker: "FPT", reason: expect.stringContaining("Connection refused") }]);
  });

  it("live + all-invalid tickers → rejected without ever calling sshExecFn", async () => {
    let called = false;
    const spy: SshExecFn = async (cmd) => { called = true; return fakeOk(cmd); };
    const result = await handleTriggerPriceDebug(
      { tickers: ["FPT; rm -rf /"], verbose: false, dry_run: false },
      spy,
    );
    expect(called).toBe(false);
    expect(result.success).toEqual([]);
    expect(result.failed[0]!.reason).toContain("invalid ticker format");
  });

  it("dry_run=true never calls sshExecFn even if injected", async () => {
    let called = false;
    const spy: SshExecFn = async (cmd) => { called = true; return fakeOk(cmd); };
    await handleTriggerPriceDebug({ tickers: ["FPT"], verbose: false, dry_run: true }, spy);
    expect(called).toBe(false);
  });
});

describe("FIX-VPS-SSH-TRIGGER-FAIL-LOUD — handler-level: sbv (no tickers)", () => {
  it("live + injected success → success=[vn-sbv-fetch]", async () => {
    const result = await handleTriggerSbvDebug({ verbose: false, dry_run: false }, fakeOk);
    expect(result.success).toEqual(["vn-sbv-fetch"]);
    expect(result.failed).toEqual([]);
  });

  it("live + injected failure → failed=[{source, reason}], never success-shaped", async () => {
    const result = await handleTriggerSbvDebug({ verbose: false, dry_run: false }, fakeFail);
    expect(result.success).toEqual([]);
    expect(result.failed).toEqual([{ source: "vn-sbv-fetch", reason: expect.stringContaining("Connection refused") }]);
  });
});

describe("FIX-VPS-SSH-TRIGGER-FAIL-LOUD — handler-level: bctc (queue + tickers)", () => {
  function createTestDb(): Database {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE bctc_vps_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_code TEXT NOT NULL,
        period_year INTEGER NOT NULL,
        period_quarter TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        source_url TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status) VALUES (?, ?, ?, 'pending')`,
    ).run("FPT", 2026, "Q1");
    return db;
  }

  it("live + injected success → success populated from real ssh outcome", async () => {
    const db = createTestDb();
    const result = await handleTriggerBctcDebug(
      { tickers: ["FPT"], verbose: false, dry_run: false },
      db,
      fakeOk,
    );
    expect(result.success).toEqual(["FPT"]);
    expect(result.failed).toEqual([]);
  });

  it("live + injected failure → failed populated, queued state still reported (queue read is separate from ssh outcome)", async () => {
    const db = createTestDb();
    const result = await handleTriggerBctcDebug(
      { tickers: ["FPT"], verbose: false, dry_run: false },
      db,
      fakeFail,
    );
    expect(result.queued).toEqual(["FPT"]);
    expect(result.success).toEqual([]);
    expect(result.failed).toEqual([{ ticker: "FPT", reason: expect.stringContaining("Connection refused") }]);
  });
});
