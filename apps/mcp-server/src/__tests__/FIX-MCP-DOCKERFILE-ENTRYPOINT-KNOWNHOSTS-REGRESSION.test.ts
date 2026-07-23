/**
 * FIX-MCP-DOCKERFILE-ENTRYPOINT-KNOWNHOSTS-REGRESSION
 *
 * Root cause: 6165aa3b4 ("rebase Dockerfiles from Debian to Ubuntu") silently
 * dropped ALL of task-1779c's SSH infra from apps/mcp-server/Dockerfile —
 * both the `openssh-client` apt install and `ENTRYPOINT ["/entrypoint.sh"]`.
 * entrypoint.sh stayed tracked+clean at HEAD but was COPY'd/referenced by
 * NOTHING (dead code since the rebase) — a QA-approved wiring regressed with
 * no alarm. This test locks the Dockerfile wiring so a future rebase cannot
 * silently drop it again, AND locks entrypoint.sh's non-fatal degrade
 * contract (a VPS outage must never prevent mcp-server from booting).
 *
 * ACs:
 *   AC-1: Dockerfile COPYs entrypoint.sh to /entrypoint.sh
 *   AC-2: Dockerfile chmod +x's /entrypoint.sh
 *   AC-3: Dockerfile sets ENTRYPOINT ["/entrypoint.sh"]
 *   AC-4: Dockerfile still installs openssh-client via apt-get
 *   AC-5: entrypoint.sh does NOT use `set -e` (the original regression-prone
 *         fatal-by-default pattern) and does NOT `exit 1` anywhere
 *   AC-6: live behavior — VPS_HOST unset: wrapped command still runs (exit
 *         code passes through unchanged), WARN printed to stderr, no crash
 *   AC-7: live behavior — VPS_HOST set but ssh-keyscan yields nothing
 *         (simulates VPS unreachable): wrapped command still runs, WARN
 *         printed, known_hosts left unseeded, no crash
 *   AC-8: live behavior — VPS_HOST set and ssh-keyscan yields a real key
 *         line: known_hosts is seeded with that line, wrapped command runs
 *
 * Layer: infrastructure test — Dockerfile is read as a text artifact;
 * entrypoint.sh is executed for real via `sh` (POSIX, matches its shebang)
 * against a tmp KNOWN_HOSTS_DIR and a fake `ssh-keyscan` on PATH — no Docker
 * daemon, no real network call, no real /root/.ssh touched.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// import.meta.dir = apps/mcp-server/src/__tests__
const DOCKERFILE_PATH = join(import.meta.dir, "../../Dockerfile");
const ENTRYPOINT_PATH = join(import.meta.dir, "../../entrypoint.sh");

function readDockerfile(): string {
  return readFileSync(DOCKERFILE_PATH, "utf-8");
}

function readEntrypoint(): string {
  return readFileSync(ENTRYPOINT_PATH, "utf-8");
}

/** Builds a tmp dir with a fake `ssh-keyscan` on PATH, returning {binDir, hostsDir}. */
function makeFakeKeyscanEnv(keyscanBehavior: "empty" | "real"): { binDir: string; hostsDir: string } {
  const root = mkdtempSync(join(tmpdir(), "entrypoint-regression-"));
  const binDir = join(root, "bin");
  const hostsDir = join(root, "ssh");
  mkdirSync(binDir, { recursive: true });

  const scriptBody =
    keyscanBehavior === "empty"
      ? "#!/bin/sh\nexit 0\n" // simulates VPS unreachable: no output, exit 0 (real ssh-keyscan behavior on timeout)
      : "#!/bin/sh\necho '1.2.3.4 ssh-ed25519 AAAAFAKEKEY'\nexit 0\n";

  const keyscanPath = join(binDir, "ssh-keyscan");
  writeFileSync(keyscanPath, scriptBody);
  chmodSync(keyscanPath, 0o755);

  return { binDir, hostsDir };
}

/** Runs entrypoint.sh via `sh` with a controlled env + wrapped sentinel command. */
async function runEntrypoint(
  env: Record<string, string>,
  wrappedExitCode: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(
    ["sh", ENTRYPOINT_PATH, "sh", "-c", `echo WRAPPED_RAN; exit ${wrappedExitCode}`],
    {
      env: { ...process.env, ...env },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

// ---------------------------------------------------------------------------
// 1. Dockerfile wiring — static text checks (fix-docker-python3.test.ts pattern)
// ---------------------------------------------------------------------------

describe("mcp-server Dockerfile — entrypoint wiring (regression guard)", () => {
  it("AC-1: COPYs entrypoint.sh to /entrypoint.sh", () => {
    const content = readDockerfile();
    expect(content).toMatch(/COPY\s+apps\/mcp-server\/entrypoint\.sh\s+\/entrypoint\.sh/);
  });

  it("AC-2: chmod +x's /entrypoint.sh", () => {
    const content = readDockerfile();
    expect(content).toMatch(/RUN\s+chmod\s+\+x\s+\/entrypoint\.sh/);
  });

  it("AC-3: sets ENTRYPOINT [\"/entrypoint.sh\"]", () => {
    const content = readDockerfile();
    expect(content).toMatch(/ENTRYPOINT\s*\[\s*"\/entrypoint\.sh"\s*\]/);
  });

  it("AC-4: still installs openssh-client via apt-get", () => {
    const content = readDockerfile();
    expect(content).toMatch(/apt-get install[^&]*openssh-client/s);
  });
});

// ---------------------------------------------------------------------------
// 2. entrypoint.sh source — never-fatal pattern guard
// ---------------------------------------------------------------------------

describe("entrypoint.sh — non-fatal degrade contract (source guard)", () => {
  it("AC-5a: does not use `set -e` (the original regression's fatal-by-default trap)", () => {
    const content = readEntrypoint();
    expect(content).not.toMatch(/^\s*set\s+-e/m);
  });

  it("AC-5b: never calls `exit 1` (or any nonzero exit) — VPS reachability must not gate startup", () => {
    const content = readEntrypoint();
    expect(content).not.toMatch(/\bexit\s+[1-9]/);
  });

  it("AC-5c: always ends with `exec \"$@\"` — hands off to the real server process unconditionally", () => {
    const content = readEntrypoint();
    expect(content.trim().endsWith('exec "$@"')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. entrypoint.sh — live behavioral checks (real `sh` subprocess, fake ssh-keyscan)
// ---------------------------------------------------------------------------

describe("entrypoint.sh — live non-fatal degrade (AC-6/7/8)", () => {
  it("AC-6: VPS_HOST empty/not set — wrapped command still runs, WARN printed, exit code passes through", async () => {
    const { binDir, hostsDir } = makeFakeKeyscanEnv("empty");
    const result = await runEntrypoint(
      {
        PATH: `${binDir}:${process.env["PATH"]}`,
        KNOWN_HOSTS_DIR: hostsDir,
        VPS_HOST: "",
      },
      0,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("WRAPPED_RAN");
    expect(result.stderr).toMatch(/WARN/);
    expect(result.stderr).not.toMatch(/ERROR/);
  });

  it("AC-7: VPS_HOST set, ssh-keyscan yields nothing (VPS unreachable) — no crash, no known_hosts write", async () => {
    const { binDir, hostsDir } = makeFakeKeyscanEnv("empty");
    const result = await runEntrypoint(
      {
        PATH: `${binDir}:${process.env["PATH"]}`,
        KNOWN_HOSTS_DIR: hostsDir,
        VPS_HOST: "unreachable.example.invalid",
      },
      0,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("WRAPPED_RAN");
    expect(result.stderr).toMatch(/WARN.*known_hosts NOT seeded/);
    expect(existsSync(join(hostsDir, "known_hosts"))).toBe(false);
  });

  it("AC-7b: wrapped command's real nonzero exit code still passes through unmangled (proves exec handoff, not swallowed)", async () => {
    const { binDir, hostsDir } = makeFakeKeyscanEnv("empty");
    const result = await runEntrypoint(
      {
        PATH: `${binDir}:${process.env["PATH"]}`,
        KNOWN_HOSTS_DIR: hostsDir,
        VPS_HOST: "unreachable.example.invalid",
      },
      42,
    );
    expect(result.exitCode).toBe(42);
  });

  it("AC-8: VPS_HOST set, ssh-keyscan yields a real key line — known_hosts seeded, wrapped command runs", async () => {
    const { binDir, hostsDir } = makeFakeKeyscanEnv("real");
    const result = await runEntrypoint(
      {
        PATH: `${binDir}:${process.env["PATH"]}`,
        KNOWN_HOSTS_DIR: hostsDir,
        VPS_HOST: "125.212.251.27",
      },
      0,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("WRAPPED_RAN");
    // "known_hosts seeded" is a plain (non-WARN) status line → stdout, not stderr
    expect(result.stdout).toMatch(/known_hosts seeded/);
    const hostsFile = join(hostsDir, "known_hosts");
    expect(existsSync(hostsFile)).toBe(true);
    expect(readFileSync(hostsFile, "utf-8")).toContain("ssh-ed25519 AAAAFAKEKEY");
  });
});
