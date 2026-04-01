/**
 * Task 155 — Log File Rotation
 *
 * Tests for size-based log file rotation in the structured logger.
 * Strategy: when the log file exceeds maxFileSizeMb, rename <name>.log → <name>.1.log
 * (shifting existing rotated files) and open a fresh <name>.log.
 * Keep at most 3 rotated files (1.log, 2.log, 3.log).
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  createRotatingFileSink,
  rotateLogs,
} from "../infrastructure/logger.js";

// ── helpers ────────────────────────────────────────────────────────────────

/** Create a fresh temp directory for each test and clean it up after. */
function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "log-rotation-test-"));
}

function rmrf(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── tests ──────────────────────────────────────────────────────────────────

describe("Task 155 — Log File Rotation", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmrf(tmpDir);
  });

  // ── rotateLogs() unit tests ───────────────────────────────────────────────

  describe("rotateLogs()", () => {
    it("renames <name>.log to <name>.1.log when called", () => {
      const logFile = path.join(tmpDir, "app.log");
      fs.writeFileSync(logFile, "original content\n");

      rotateLogs(logFile);

      expect(fs.existsSync(path.join(tmpDir, "app.1.log"))).toBe(true);
      expect(fs.existsSync(logFile)).toBe(false);
    });

    it("shifts existing rotated files (1→2, 2→3) before rotating current", () => {
      const logFile = path.join(tmpDir, "app.log");
      const rot1 = path.join(tmpDir, "app.1.log");
      const rot2 = path.join(tmpDir, "app.2.log");
      const rot3 = path.join(tmpDir, "app.3.log");

      fs.writeFileSync(logFile, "current\n");
      fs.writeFileSync(rot1, "rotation 1\n");
      fs.writeFileSync(rot2, "rotation 2\n");

      rotateLogs(logFile);

      expect(fs.existsSync(logFile)).toBe(false);
      expect(fs.readFileSync(rot1, "utf8")).toBe("current\n");
      expect(fs.readFileSync(rot2, "utf8")).toBe("rotation 1\n");
      expect(fs.readFileSync(rot3, "utf8")).toBe("rotation 2\n");
    });

    it("deletes <name>.3.log before rotating when all 3 slots are full", () => {
      const logFile = path.join(tmpDir, "app.log");
      const rot3 = path.join(tmpDir, "app.3.log");

      fs.writeFileSync(logFile, "current\n");
      fs.writeFileSync(path.join(tmpDir, "app.1.log"), "oldest-1\n");
      fs.writeFileSync(path.join(tmpDir, "app.2.log"), "oldest-2\n");
      fs.writeFileSync(rot3, "oldest-3-to-be-deleted\n");

      rotateLogs(logFile);

      // The old .3.log content should be gone; replaced by what was .2.log
      const newRot3 = fs.readFileSync(rot3, "utf8");
      expect(newRot3).toBe("oldest-2\n");
    });

    it("does nothing when the log file does not exist", () => {
      const logFile = path.join(tmpDir, "app.log");
      // Should not throw
      expect(() => rotateLogs(logFile)).not.toThrow();
      expect(fs.existsSync(path.join(tmpDir, "app.1.log"))).toBe(false);
    });
  });

  // ── createRotatingFileSink() integration tests ─────────────────────────

  describe("createRotatingFileSink()", () => {
    it("writes log lines to the target file", () => {
      const logFile = path.join(tmpDir, "server.log");
      const sink = createRotatingFileSink(logFile, { maxFileSizeMb: 10 });

      sink('{"level":"info","message":"hello"}');

      const content = fs.readFileSync(logFile, "utf8");
      expect(content).toContain("hello");
    });

    it("rotates when file size exceeds maxFileSizeMb", () => {
      const logFile = path.join(tmpDir, "server.log");
      // Use a tiny threshold (1 byte) so a single line triggers rotation
      const sink = createRotatingFileSink(logFile, { maxFileSizeMb: 0.0001 });

      // Write a line that will push size over the limit (needs to exceed ~105 bytes)
      sink('{"level":"info","message":"line1 — this line is definitely long enough to exceed one hundred and five bytes threshold"}');

      // Trigger a rotation check manually (simulates the setInterval tick)
      sink.__checkRotation();

      // After rotation, .1.log should exist
      expect(fs.existsSync(path.join(tmpDir, "server.1.log"))).toBe(true);
    });

    it("fresh log file after rotation is smaller than the limit", () => {
      const logFile = path.join(tmpDir, "server.log");
      const maxMb = 0.0001; // ~100 bytes
      const sink = createRotatingFileSink(logFile, { maxFileSizeMb: maxMb });

      sink('{"level":"info","message":"fills over the tiny threshold for sure"}');
      sink.__checkRotation();

      // Write one more line after rotation
      sink('{"level":"info","message":"fresh"}');

      const freshSize = fs.statSync(logFile).size;
      expect(freshSize).toBeLessThan(maxMb * 1024 * 1024);
    });

    it("creates the log directory if it does not exist", () => {
      const nestedDir = path.join(tmpDir, "nested", "logs");
      const logFile = path.join(nestedDir, "app.log");

      const sink = createRotatingFileSink(logFile, { maxFileSizeMb: 10 });
      sink('{"level":"info","message":"nested"}');

      expect(fs.existsSync(logFile)).toBe(true);
    });

    it("keeps at most 3 rotated files", () => {
      const logFile = path.join(tmpDir, "server.log");
      const maxMb = 0.0001;

      // Pre-populate 3 rotation slots
      fs.writeFileSync(path.join(tmpDir, "server.1.log"), "slot1\n");
      fs.writeFileSync(path.join(tmpDir, "server.2.log"), "slot2\n");
      fs.writeFileSync(path.join(tmpDir, "server.3.log"), "slot3-will-be-overwritten\n");

      const sink = createRotatingFileSink(logFile, { maxFileSizeMb: maxMb });
      sink("x".repeat(200)); // well over 100-byte threshold
      sink.__checkRotation();

      // Only 1, 2, 3 should exist — no .4.log
      expect(fs.existsSync(path.join(tmpDir, "server.4.log"))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, "server.1.log"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "server.2.log"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "server.3.log"))).toBe(true);
    });
  });
});
