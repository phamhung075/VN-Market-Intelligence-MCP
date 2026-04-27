/**
 * fix/docker-python3 — Dockerfile python3 install guard
 *
 * TDD RED → GREEN cycle:
 *   RED:   Dockerfile missing python3 / pip3 install step → test fails
 *   GREEN: Dockerfile gains python3 + pip3 + vnstock install → test passes
 *
 * What this tests:
 *   1. The mcp-server Dockerfile contains `python3` in its apt-get install list.
 *   2. The Dockerfile contains a pip install step for `vnstock`.
 *   3. vnstockBridge.runPython returns null gracefully on empty script
 *      (regression guard — never throws, always falls back).
 *
 * Layer: infrastructure test — reads Dockerfile as a text artifact.
 * No Docker daemon required; no real python3 subprocess spawned.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// import.meta.dir = apps/mcp-server/src/__tests__
// ../../Dockerfile         = apps/mcp-server/Dockerfile
const DOCKERFILE_PATH = join(
  import.meta.dir,
  "../../Dockerfile",
);

function readDockerfile(): string {
  return readFileSync(DOCKERFILE_PATH, "utf-8");
}

// ---------------------------------------------------------------------------
// 1. Dockerfile structural checks
// ---------------------------------------------------------------------------

describe("mcp-server Dockerfile — python3 availability", () => {
  it("installs python3 via apt-get", () => {
    const content = readDockerfile();
    // Must contain python3 in an apt-get install block
    expect(content).toMatch(/apt-get install[^&]*python3/s);
  });

  it("installs pip3 (python3-pip) via apt-get", () => {
    const content = readDockerfile();
    expect(content).toMatch(/apt-get install[^&]*python3-pip/s);
  });

  it("installs vnstock Python package via pip", () => {
    const content = readDockerfile();
    // pip install ... vnstock
    expect(content).toMatch(/pip3?\s+install[^\n]*vnstock/);
  });
});

// ---------------------------------------------------------------------------
// 2. vnstockBridge graceful-null guard
// ---------------------------------------------------------------------------

describe("vnstockBridge.runPython — graceful null on bad python", () => {
  it("fetchVnstockPrices returns empty array when called with empty list", async () => {
    // Empty codes list short-circuits before spawning python3 — always []
    const { fetchVnstockPrices } = await import(
      "../infrastructure/fetchers/vnstockBridge.js"
    );
    const result = await fetchVnstockPrices([]);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("fetchVnstockOfficers returns empty array when python3 exits non-zero", async () => {
    // We mock Bun.spawn to simulate python3 not found (exit code 127)
    const originalSpawn = Bun.spawn;
    // @ts-expect-error — intentional mock override
    Bun.spawn = (_cmd: string[], _opts: unknown) => {
      const encoder = new TextEncoder();
      const emptyStream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
      const errStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("python3: command not found\n"));
          controller.close();
        },
      });
      return {
        stdout: emptyStream,
        stderr: errStream,
        exited: Promise.resolve(127),
        kill: () => {},
      };
    };

    try {
      const { fetchVnstockOfficers } = await import(
        "../infrastructure/fetchers/vnstockBridge.js"
      );
      const result = await fetchVnstockOfficers("VCB");
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    } finally {
      Bun.spawn = originalSpawn;
    }
  });
});
