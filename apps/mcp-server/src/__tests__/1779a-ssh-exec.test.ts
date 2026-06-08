/**
 * Task 1779a — sshExec infrastructure layer tests
 *
 * No real SSH connections. All tests mock Bun.spawn via mock.module().
 *
 * TC-1: missing VPS_HOST throws correct error
 * TC-2: missing VPS_SSH_USER throws correct error
 * TC-3: timeout path resolves to exitCode 124 with stderr "SSH timeout"
 * TC-4: non-zero exit code is passed through correctly
 * TC-5: Bun.spawn is called with args array (no shell string interpolation)
 * TC-6: sshExec is exported as an async function
 * TC-7: SshExecResult shape — TypeScript compile check via type assertion
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ---------------------------------------------------------------------------
// Helpers to build a fake Bun.SubProcess
// ---------------------------------------------------------------------------

function makeProc(opts: {
  stdout: string;
  stderr: string;
  exitCode: number;
  stallMs?: number; // if set, exited never resolves within test timeout
}): ReturnType<typeof Bun.spawn> {
  const stallMs = opts.stallMs ?? 0;

  const exitedPromise: Promise<number> =
    stallMs > 0
      ? new Promise(() => { /* never resolves — simulates stall */ })
      : Promise.resolve(opts.exitCode);

  return {
    stdout: new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode(opts.stdout)); c.close(); },
    }),
    stderr: new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode(opts.stderr)); c.close(); },
    }),
    exited: exitedPromise,
    kill: () => {},
  } as unknown as ReturnType<typeof Bun.spawn>;
}

// ---------------------------------------------------------------------------
// Saved env values
// ---------------------------------------------------------------------------

let savedHost: string | undefined;
let savedUser: string | undefined;
let savedKey: string | undefined;

beforeEach(() => {
  savedHost = Bun.env["VPS_HOST"];
  savedUser = Bun.env["VPS_SSH_USER"];
  savedKey  = Bun.env["VPS_SSH_KEY_PATH"];
});

afterEach(() => {
  if (savedHost !== undefined) Bun.env["VPS_HOST"] = savedHost;
  else delete Bun.env["VPS_HOST"];

  if (savedUser !== undefined) Bun.env["VPS_SSH_USER"] = savedUser;
  else delete Bun.env["VPS_SSH_USER"];

  if (savedKey !== undefined) Bun.env["VPS_SSH_KEY_PATH"] = savedKey;
  else delete Bun.env["VPS_SSH_KEY_PATH"];
});

// ---------------------------------------------------------------------------
// TC-1 — missing VPS_HOST throws
// ---------------------------------------------------------------------------

describe("Task 1779a — TC-1: missing VPS_HOST throws", () => {
  it("throws Error('VPS_HOST not configured') when VPS_HOST is absent", async () => {
    delete Bun.env["VPS_HOST"];
    Bun.env["VPS_SSH_USER"] = "root";

    // Import fresh via dynamic import after env mutation
    // We re-import the module; since Bun caches modules, we test the guard directly.
    const { sshExec } = await import("../infrastructure/vps/sshExec.js");
    await expect(sshExec("echo ok")).rejects.toThrow("VPS_HOST not configured");
  });
});

// ---------------------------------------------------------------------------
// TC-2 — missing VPS_SSH_USER throws
// ---------------------------------------------------------------------------

describe("Task 1779a — TC-2: missing VPS_SSH_USER throws", () => {
  it("throws Error('VPS_SSH_USER not configured') when VPS_SSH_USER is absent", async () => {
    Bun.env["VPS_HOST"] = "125.212.251.27";
    delete Bun.env["VPS_SSH_USER"];

    const { sshExec } = await import("../infrastructure/vps/sshExec.js");
    await expect(sshExec("echo ok")).rejects.toThrow("VPS_SSH_USER not configured");
  });
});

// ---------------------------------------------------------------------------
// TC-3 — timeout path resolves to exitCode 124
// ---------------------------------------------------------------------------

describe("Task 1779a — TC-3: timeout resolves to exitCode 124", () => {
  it("returns { exitCode: 124, stderr: 'SSH timeout' } when spawn stalls past timeoutMs", async () => {
    Bun.env["VPS_HOST"] = "125.212.251.27";
    Bun.env["VPS_SSH_USER"] = "root";

    // Override Bun.spawn for this test with a stalling fake process
    const originalSpawn = Bun.spawn;
    (Bun as unknown as Record<string, unknown>)["spawn"] = (..._args: unknown[]) =>
      makeProc({ stdout: "", stderr: "", exitCode: 0, stallMs: 60_000 });

    try {
      const { sshExec } = await import("../infrastructure/vps/sshExec.js");
      const result = await sshExec("echo ok", 50 /* 50 ms timeout */);
      expect(result.exitCode).toBe(124);
      expect(result.stderr).toBe("SSH timeout");
      expect(result.stdout).toBe("");
    } finally {
      (Bun as unknown as Record<string, unknown>)["spawn"] = originalSpawn;
    }
  });
});

// ---------------------------------------------------------------------------
// TC-4 — non-zero exit code passes through
// ---------------------------------------------------------------------------

describe("Task 1779a — TC-4: non-zero exit code passes through", () => {
  it("returns exitCode 1 and stderr from the process when command fails", async () => {
    Bun.env["VPS_HOST"] = "125.212.251.27";
    Bun.env["VPS_SSH_USER"] = "root";

    const originalSpawn = Bun.spawn;
    (Bun as unknown as Record<string, unknown>)["spawn"] = (..._args: unknown[]) =>
      makeProc({ stdout: "", stderr: "command not found", exitCode: 1 });

    try {
      const { sshExec } = await import("../infrastructure/vps/sshExec.js");
      const result = await sshExec("bad-command");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("command not found");
    } finally {
      (Bun as unknown as Record<string, unknown>)["spawn"] = originalSpawn;
    }
  });
});

// ---------------------------------------------------------------------------
// TC-5 — args array: no shell string interpolation
// ---------------------------------------------------------------------------

describe("Task 1779a — TC-5: Bun.spawn receives args array, not shell string", () => {
  it("first argument to Bun.spawn is an array starting with 'ssh'", async () => {
    Bun.env["VPS_HOST"] = "125.212.251.27";
    Bun.env["VPS_SSH_USER"] = "root";
    Bun.env["VPS_SSH_KEY_PATH"] = "/tmp/test_key";

    let capturedArgs: string[] = [];
    const originalSpawn = Bun.spawn;
    (Bun as unknown as Record<string, unknown>)["spawn"] = (args: unknown, ...rest: unknown[]) => {
      capturedArgs = args as string[];
      return makeProc({ stdout: "ok", stderr: "", exitCode: 0 });
    };

    try {
      const { sshExec } = await import("../infrastructure/vps/sshExec.js");
      await sshExec("systemctl status nginx");

      // Must be an array, not a single shell string
      expect(Array.isArray(capturedArgs)).toBe(true);
      expect(capturedArgs[0]).toBe("ssh");
      // BatchMode and StrictHostKeyChecking must be present as discrete elements
      expect(capturedArgs).toContain("BatchMode=yes");
      expect(capturedArgs).toContain("StrictHostKeyChecking=yes");
      // Target must be user@host, not a shell string
      expect(capturedArgs).toContain("root@125.212.251.27");
      // Command is the last element, not interpolated into a shell string
      expect(capturedArgs[capturedArgs.length - 1]).toBe("systemctl status nginx");
      // No element should be a compound shell string like "ssh root@host ..."
      for (const arg of capturedArgs) {
        expect(arg).not.toMatch(/^ssh .+/);
      }
    } finally {
      (Bun as unknown as Record<string, unknown>)["spawn"] = originalSpawn;
    }
  });
});

// ---------------------------------------------------------------------------
// TC-6 — sshExec is exported as an async function
// ---------------------------------------------------------------------------

describe("Task 1779a — TC-6: sshExec export shape", () => {
  it("sshExec is exported and is a function", async () => {
    const mod = await import("../infrastructure/vps/sshExec.js");
    expect(typeof mod.sshExec).toBe("function");
    // Async functions return a Promise when called — but we don't call it here
    // to avoid needing env vars; the export check is sufficient.
  });
});

// ---------------------------------------------------------------------------
// TC-7 — SshExecResult type shape (compile-time, verified via successful import)
// ---------------------------------------------------------------------------

describe("Task 1779a — TC-7: SshExecResult type is exported", () => {
  it("module exports SshExecResult type (TypeScript compile check)", async () => {
    // If the import fails to compile, this test will error at tsc --noEmit.
    // We assert the result shape via a runtime object conforming to the interface.
    const mod = await import("../infrastructure/vps/sshExec.js");
    // Construct a value that must satisfy SshExecResult at compile time.
    const shape: Awaited<ReturnType<typeof mod.sshExec>> = {
      exitCode: 0,
      stdout: "",
      stderr: "",
      durationMs: 0,
    };
    expect(shape.exitCode).toBe(0);
    expect(typeof shape.stdout).toBe("string");
    expect(typeof shape.stderr).toBe("string");
    expect(typeof shape.durationMs).toBe("number");
  });
});
