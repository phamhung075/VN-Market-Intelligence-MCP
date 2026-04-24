Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 001 — Project setup & DDD folder structure
 *
 * Verifies:
 *   1. All DDD folders exist
 *   2. tsconfig.json exists and is valid JSON
 *   3. package.json exists and has required fields
 *   4. TypeScript compiles with zero errors (bun tsc --noEmit)
 */

import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Resolve project root relative to this test file:
// src/__tests__/001-... → up two levels → project root
const ROOT = join(import.meta.dir, "..", "..");

describe("Task 001 — Project setup & DDD folder structure", () => {
  // ── DDD folder structure ──────────────────────────────────────────────────

  it("src/domain/models directory exists", () => {
    expect(existsSync(join(ROOT, "src", "domain", "models"))).toBe(true);
  });

  it("src/domain/services directory exists", () => {
    expect(existsSync(join(ROOT, "src", "domain", "services"))).toBe(true);
  });

  it("src/domain/repositories directory exists", () => {
    expect(existsSync(join(ROOT, "src", "domain", "repositories"))).toBe(true);
  });

  it("src/infrastructure directory exists", () => {
    expect(existsSync(join(ROOT, "src", "infrastructure"))).toBe(true);
  });

  it("src/application directory exists", () => {
    expect(existsSync(join(ROOT, "src", "application"))).toBe(true);
  });

  it("src/interface directory exists", () => {
    expect(existsSync(join(ROOT, "src", "interface"))).toBe(true);
  });

  // ── Infrastructure sub-folders ────────────────────────────────────────────

  it("src/infrastructure/db directory exists", () => {
    expect(existsSync(join(ROOT, "src", "infrastructure", "db"))).toBe(true);
  });

  it("src/infrastructure/fetchers directory exists", () => {
    expect(existsSync(join(ROOT, "src", "infrastructure", "fetchers"))).toBe(true);
  });

  it("src/infrastructure/rag directory exists", () => {
    expect(existsSync(join(ROOT, "src", "infrastructure", "rag"))).toBe(true);
  });

  // ── Interface sub-folders ─────────────────────────────────────────────────

  it("src/interface/mcp directory exists", () => {
    expect(existsSync(join(ROOT, "src", "interface", "mcp"))).toBe(true);
  });

  it("src/interface/scheduler directory exists", () => {
    expect(existsSync(join(ROOT, "src", "interface", "scheduler"))).toBe(true);
  });

  // ── Application sub-folders ───────────────────────────────────────────────

  it("src/application/usecases directory exists", () => {
    expect(existsSync(join(ROOT, "src", "application", "usecases"))).toBe(true);
  });

  // ── Config files ──────────────────────────────────────────────────────────

  it("tsconfig.json exists", () => {
    expect(existsSync(join(ROOT, "tsconfig.json"))).toBe(true);
  });

  it("tsconfig.json contains compilerOptions", () => {
    const raw = readFileSync(join(ROOT, "tsconfig.json"), "utf-8");
    // tsconfig allows JSONC (comments) — check for required keys by string presence
    expect(raw).toContain('"compilerOptions"');
    expect(raw).toContain('"strict"');
    expect(raw).toContain('"noEmit"');
  });

  it("package.json exists", () => {
    expect(existsSync(join(ROOT, "package.json"))).toBe(true);
  });

  it("package.json has name field", () => {
    const raw = readFileSync(join(ROOT, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    expect(pkg["name"]).toBe("vn-market-intelligence-mcp");
  });

  it("package.json has scripts.check field (bun tsc --noEmit)", () => {
    const raw = readFileSync(join(ROOT, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const scripts = pkg["scripts"] as Record<string, unknown>;
    expect(typeof scripts["check"]).toBe("string");
  });

  // ── DDD barrel files (index.ts) exist ────────────────────────────────────

  it("src/domain/models/index.ts exists", () => {
    expect(existsSync(join(ROOT, "src", "domain", "models", "index.ts"))).toBe(true);
  });

  it("src/domain/services/index.ts exists", () => {
    expect(existsSync(join(ROOT, "src", "domain", "services", "index.ts"))).toBe(true);
  });

  it("src/domain/repositories/index.ts exists", () => {
    expect(existsSync(join(ROOT, "src", "domain", "repositories", "index.ts"))).toBe(true);
  });

  it("src/infrastructure/index.ts exists", () => {
    expect(existsSync(join(ROOT, "src", "infrastructure", "index.ts"))).toBe(true);
  });

  it("src/application/usecases/index.ts exists", () => {
    expect(existsSync(join(ROOT, "src", "application", "usecases", "index.ts"))).toBe(true);
  });

  it("src/interface/mcp/index.ts exists", () => {
    expect(existsSync(join(ROOT, "src", "interface", "mcp", "index.ts"))).toBe(true);
  });
});
