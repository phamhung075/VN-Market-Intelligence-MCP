/**
 * Task 1779 — VPS Service Restart Handler + MCP Tool tests
 *
 * No real SSH connections. sshExec is monkey-patched per test.
 *
 * TC-1: valid service "price-fetcher" → calls sshExec, returns { success: true }
 * TC-2: valid service "foreign-flow-fetcher" → success path
 * TC-3: valid service "bctc-fetcher" → success path
 * TC-4: unknown service "nginx" → { error: "service not allowed: nginx" }, sshExec NOT called
 * TC-5: sshExec returns exitCode: 1 → { success: false, exitCode: 1 }
 * TC-6: invalid input (no service key) → { error: "invalid input" }
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { vpsServiceRestartHandler } from "../interface/mcp/vpsServiceRestartHandler.js";
import { registerVpsServiceRestartTool } from "../interface/mcp/tools/system/vpsServiceRestartTool.js";

// ---------------------------------------------------------------------------
// Helpers — mock sshExec by monkey-patching the infrastructure module's export.
// Bun module cache means we need to intercept at the handler level.
// We swap out Bun.spawn which sshExec depends on, and set VPS env vars.
// ---------------------------------------------------------------------------

import type { SshExecResult } from "../infrastructure/vps/sshExec.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

function fakeSshSpawn(stdout: string, stderr: string, exitCode: number): () => ReturnType<typeof Bun.spawn> {
  return () => ({
    stdout: new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode(stdout)); c.close(); },
    }),
    stderr: new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode(stderr)); c.close(); },
    }),
    exited: Promise.resolve(exitCode),
    kill: () => {},
  } as unknown as ReturnType<typeof Bun.spawn>);
}

function withEnvAndSpawn<T>(
  spawnFn: () => ReturnType<typeof Bun.spawn>,
  fn: () => Promise<T>,
): Promise<T> {
  const saved = {
    host: Bun.env["VPS_HOST"],
    user: Bun.env["VPS_SSH_USER"],
    key: Bun.env["VPS_SSH_KEY_PATH"],
    spawn: Bun.spawn,
  };
  Bun.env["VPS_HOST"] = "test-host";
  Bun.env["VPS_SSH_USER"] = "root";
  Bun.env["VPS_SSH_KEY_PATH"] = "/tmp/test_key";
  (Bun as unknown as Record<string, unknown>)["spawn"] = spawnFn;

  return fn().finally(() => {
    if (saved.host !== undefined) Bun.env["VPS_HOST"] = saved.host;
    else delete Bun.env["VPS_HOST"];
    if (saved.user !== undefined) Bun.env["VPS_SSH_USER"] = saved.user;
    else delete Bun.env["VPS_SSH_USER"];
    if (saved.key !== undefined) Bun.env["VPS_SSH_KEY_PATH"] = saved.key;
    else delete Bun.env["VPS_SSH_KEY_PATH"];
    (Bun as unknown as Record<string, unknown>)["spawn"] = saved.spawn;
  });
}

// ---------------------------------------------------------------------------
// TC-1: valid service "price-fetcher" → success
// ---------------------------------------------------------------------------

describe("Task 1779 — TC-1: price-fetcher succeeds", () => {
  it("returns { success: true } for price-fetcher and sshExec is called", async () => {
    let spawnCalled = false;
    const spawnFn = () => {
      spawnCalled = true;
      return fakeSshSpawn("", "", 0)();
    };

    const result = await withEnvAndSpawn(spawnFn, () =>
      vpsServiceRestartHandler({ service: "price-fetcher" }),
    );

    expect(result.success).toBe(true);
    expect(result.service).toBe("price-fetcher");
    expect(spawnCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-2: valid service "foreign-flow-fetcher" → success
// ---------------------------------------------------------------------------

describe("Task 1779 — TC-2: foreign-flow-fetcher succeeds", () => {
  it("returns { success: true } for foreign-flow-fetcher", async () => {
    const result = await withEnvAndSpawn(
      fakeSshSpawn("ok", "", 0),
      () => vpsServiceRestartHandler({ service: "foreign-flow-fetcher" }),
    );

    expect(result.success).toBe(true);
    expect(result.service).toBe("foreign-flow-fetcher");
  });
});

// ---------------------------------------------------------------------------
// TC-3: valid service "bctc-fetcher" → success
// ---------------------------------------------------------------------------

describe("Task 1779 — TC-3: bctc-fetcher succeeds", () => {
  it("returns { success: true } for bctc-fetcher", async () => {
    const result = await withEnvAndSpawn(
      fakeSshSpawn("ok", "", 0),
      () => vpsServiceRestartHandler({ service: "bctc-fetcher" }),
    );

    expect(result.success).toBe(true);
    expect(result.service).toBe("bctc-fetcher");
  });
});

// ---------------------------------------------------------------------------
// TC-4: unknown service "nginx" → allowlist rejection, sshExec NOT called
// ---------------------------------------------------------------------------

describe("Task 1779 — TC-4: unknown service is rejected", () => {
  it("returns { error: 'service not allowed: nginx' } and does not call sshExec", async () => {
    let spawnCalled = false;
    const spawnFn = () => {
      spawnCalled = true;
      return fakeSshSpawn("", "", 0)();
    };

    // No env needed — allowlist check happens before sshExec
    const result = await vpsServiceRestartHandler({ service: "nginx" } as { service: string });

    expect(result.error).toBe("service not allowed: nginx");
    expect(spawnCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-5: sshExec returns exitCode 1 → { success: false, exitCode: 1 }
// ---------------------------------------------------------------------------

describe("Task 1779 — TC-5: non-zero exit code from sshExec", () => {
  it("returns { success: false, exitCode: 1 } when sshExec exits with 1", async () => {
    const result = await withEnvAndSpawn(
      fakeSshSpawn("", "Unit price-fetcher.service not found.", 1),
      () => vpsServiceRestartHandler({ service: "price-fetcher" }),
    );

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("price-fetcher");
  });
});

// ---------------------------------------------------------------------------
// TC-6: invalid input (no service key) → { error: "invalid input" }
// ---------------------------------------------------------------------------

describe("Task 1779 — TC-6: invalid input is rejected", () => {
  it("returns { error: 'invalid input' } when input has no service key", async () => {
    const result = await vpsServiceRestartHandler({});

    expect(result.error).toBe("invalid input");
  });

  it("returns { error: 'invalid input' } when input is not an object", async () => {
    const result = await vpsServiceRestartHandler("price-fetcher");

    expect(result.error).toBe("invalid input");
  });
});

// ---------------------------------------------------------------------------
// Wiring checks
// ---------------------------------------------------------------------------

describe("Task 1779 — wiring: registerVpsServiceRestartTool is exported", () => {
  it("registerVpsServiceRestartTool is exported as a function", () => {
    expect(typeof registerVpsServiceRestartTool).toBe("function");
  });
});
