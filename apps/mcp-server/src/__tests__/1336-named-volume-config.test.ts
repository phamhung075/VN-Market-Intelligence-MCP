// apps/mcp-server/src/__tests__/1336-named-volume-config.test.ts
// Verifies docker-compose.yml uses named volume instead of bind-mount for data directory.
// Root cause: macOS Virtualization.VirtualMachine holds fd on market.db-shm during container
// stop → torn SHM write → SQLite "malformed disk image". Named volumes stay inside Docker VM
// filesystem, eliminating the virtualization boundary crossing.
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

// import.meta.dir = .../VN-Market-Intelligence-MCP/apps/mcp-server/src/__tests__
// 4 x ".." reaches the monorepo root
const COMPOSE_PATH = resolve(import.meta.dir, "../../../../docker-compose.yml");
const content = readFileSync(COMPOSE_PATH, "utf-8");

describe("Task 1336 — Named volume for SQLite data directory", () => {
  it("has no bind-mount ./data references remaining", () => {
    const bindMountMatches = content.match(/- \.\/data:\/app\/data/g);
    expect(bindMountMatches).toBeNull();
  });

  it("declares market_data named volume at top level", () => {
    // Must have a top-level volumes: section declaring market_data
    expect(content).toContain("market_data:");
    // And the driver: local declaration
    expect(content).toContain("driver: local");
  });

  it("uses market_data named volume in service definitions", () => {
    // Each service volume reference should use the named volume key
    const namedVolumeRefs = content.match(/- market_data:\/app\/data/g);
    expect(namedVolumeRefs).not.toBeNull();
    // 9 services mount data: mcp-server, pdf-extractor, rag-service,
    // technical-analysis, macro-indicators, stock-price, kinh-dich-service, alert-engine,
    // + 1 additional service added after Task 1336 shipped (count grew from 8 → 9)
    expect(namedVolumeRefs!.length).toBe(9);
  });
});
