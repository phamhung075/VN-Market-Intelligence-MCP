Bun.env["DB_PATH"] = ":memory:";
/**
 * Phase 0 — Monorepo Scaffold Gate Test
 *
 * Verifies the monorepo structure is correctly set up:
 * 1. apps/mcp-server has all required DDD files + configs
 * 2. Shared packages exist at monorepo root (packages/)
 * 3. docker-compose.yml exists at root
 * 4. pnpm-workspace.yaml exists at root
 * 5. Symlinks resolve correctly (mcp.config.json, docs/, etc.)
 *
 * ROOT from this test file: apps/mcp-server/ (import.meta.dir/../..)
 * MONOREPO_ROOT: apps/mcp-server/../../ = project root
 */

import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// apps/mcp-server/ — the mcp-server workspace root
const WORKSPACE_ROOT = resolve(import.meta.dir, "../..");

// monorepo root (two levels above apps/mcp-server/)
const MONOREPO_ROOT = resolve(WORKSPACE_ROOT, "../..");

describe("Phase 0 — Monorepo Scaffold: mcp-server workspace", () => {
  it("apps/mcp-server/src/ directory exists", () => {
    expect(existsSync(join(WORKSPACE_ROOT, "src"))).toBe(true);
  });

  it("apps/mcp-server/package.json exists with correct name", () => {
    const pkgPath = join(WORKSPACE_ROOT, "package.json");
    expect(existsSync(pkgPath)).toBe(true);
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
    expect(pkg["name"]).toBe("vn-market");
  });

  it("apps/mcp-server/tsconfig.json exists", () => {
    expect(existsSync(join(WORKSPACE_ROOT, "tsconfig.json"))).toBe(true);
  });

  it("apps/mcp-server/bunfig.toml exists", () => {
    expect(existsSync(join(WORKSPACE_ROOT, "bunfig.toml"))).toBe(true);
  });

  it("apps/mcp-server/Dockerfile exists", () => {
    expect(existsSync(join(WORKSPACE_ROOT, "Dockerfile"))).toBe(true);
  });

  it("mcp.config.json resolves from apps/mcp-server/ (symlink or direct)", () => {
    expect(existsSync(join(WORKSPACE_ROOT, "mcp.config.json"))).toBe(true);
  });

  it("docs/ resolves from apps/mcp-server/ (symlink)", () => {
    expect(existsSync(join(WORKSPACE_ROOT, "docs"))).toBe(true);
  });

  it("bctc-schema.ts resolves from apps/mcp-server/ (symlink)", () => {
    expect(existsSync(join(WORKSPACE_ROOT, "bctc-schema.ts"))).toBe(true);
  });

  it("apps/mcp-server/src/domain/ DDD structure intact", () => {
    expect(existsSync(join(WORKSPACE_ROOT, "src", "domain", "models"))).toBe(true);
    expect(existsSync(join(WORKSPACE_ROOT, "src", "domain", "services"))).toBe(true);
    expect(existsSync(join(WORKSPACE_ROOT, "src", "domain", "repositories"))).toBe(true);
  });
});

describe("Phase 0 — Monorepo Scaffold: monorepo root structure", () => {
  it("pnpm-workspace.yaml exists at monorepo root", () => {
    expect(existsSync(join(MONOREPO_ROOT, "pnpm-workspace.yaml"))).toBe(true);
  });

  it("docker-compose.yml exists at monorepo root", () => {
    expect(existsSync(join(MONOREPO_ROOT, "docker-compose.yml"))).toBe(true);
  });

  it("docker-compose.yml references mcp-server service", () => {
    const content = readFileSync(join(MONOREPO_ROOT, "docker-compose.yml"), "utf-8");
    expect(content).toContain("mcp-server:");
    expect(content).toContain("3000:3000");
  });

  it("packages/shared-types/ exists", () => {
    expect(existsSync(join(MONOREPO_ROOT, "packages", "shared-types"))).toBe(true);
  });

  it("packages/shared-types/index.ts has Alert + Signal + ExtractPDFRequest", () => {
    const content = readFileSync(
      join(MONOREPO_ROOT, "packages", "shared-types", "index.ts"),
      "utf-8"
    );
    expect(content).toContain("interface Alert");
    expect(content).toContain("interface Signal");
    expect(content).toContain("interface ExtractPDFRequest");
    expect(content).toContain("interface ComputeTARequest");
    expect(content).toContain("interface SearchRequest");
  });

  it("packages/shared-db/ exists", () => {
    expect(existsSync(join(MONOREPO_ROOT, "packages", "shared-db"))).toBe(true);
  });

  it("packages/shared-config/ exists with loadMcpConfig function", () => {
    const content = readFileSync(
      join(MONOREPO_ROOT, "packages", "shared-config", "index.ts"),
      "utf-8"
    );
    expect(content).toContain("loadMcpConfig");
    expect(content).toContain("getMcpConfig");
  });

  it("pnpm-workspace.yaml lists apps/* and packages/*", () => {
    const content = readFileSync(join(MONOREPO_ROOT, "pnpm-workspace.yaml"), "utf-8");
    expect(content).toContain("apps/*");
    expect(content).toContain("packages/*");
  });
});
