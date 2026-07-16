// apps/mcp-server/src/__tests__/1336-named-volume-config.test.ts
// Verifies docker-compose.yml bind-mounts the data directory from host disk
// (NOT a Docker named volume).
//
// History: Task 1336 originally introduced a `market_data` named volume to
// eliminate a macOS Virtualization.VirtualMachine fd-holding issue on
// market.db-shm (torn SHM write -> SQLite "malformed disk image" on container
// stop). Commit 5ba622eca ("fix(infra): bind-mount market data to host disk
// instead of Docker named volume", 2026-07-15) deliberately REVERTED that
// named volume back to a host bind-mount (`./data/live:/app/data`), because a
// VM rebuild after a hypervisor crash DESTROYED the named volume and wiped
// live market data — only the host-disk backup survived. Data durability
// across VM rebuilds now outweighs the torn-SHM risk (tracked separately;
// re-litigating that tradeoff is an architect infra decision, not a test fix).
//
// This test asserts the CURRENTLY COMMITTED architecture: bind-mount to
// ./data/live on the 9 services that read/write market data, and no
// `market_data` named volume anywhere in the file.
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

// import.meta.dir = .../VN-Market-Intelligence-MCP/apps/mcp-server/src/__tests__
// 4 x ".." reaches the monorepo root
const COMPOSE_PATH = resolve(import.meta.dir, "../../../../docker-compose.yml");
const content = readFileSync(COMPOSE_PATH, "utf-8");

describe("Task 1336 — Host bind-mount for SQLite data directory (post 5ba622eca revert)", () => {
  it("has no market_data named volume declared anywhere", () => {
    expect(content).not.toContain("market_data:");
    expect(content).not.toContain("- market_data:/app/data");
  });

  it("bind-mounts ./data/live host directory into every data-touching service", () => {
    // 9 services mount the live data dir: mcp-server, pdf-extractor, rag-service,
    // technical-analysis, macro-indicators, stock-price, kinh-dich-service,
    // alert-engine (all rw), + news-fetch (:ro — read-only consumer).
    const bindMountRefs = content.match(/- \.\/data\/live:\/app\/data(:ro)?/g);
    expect(bindMountRefs).not.toBeNull();
    expect(bindMountRefs!.length).toBe(9);
  });

  it("top-level volumes: block declares only non-data named volumes", () => {
    // Only model-cache and page-image caches remain as named volumes;
    // market data itself lives on host disk, not inside a Docker volume.
    const namedVolumeBlock = content.slice(content.indexOf("\nvolumes:\n"));
    expect(namedVolumeBlock).toContain("pek_model_cache:");
    expect(namedVolumeBlock).toContain("bctc-page-images:");
    expect(namedVolumeBlock).not.toContain("market_data");
  });
});
