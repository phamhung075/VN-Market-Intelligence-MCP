// apps/mcp-server/src/__tests__/1796f-sector-peers-machinery.test.ts
// Task 1796f — Add machinery sector to sectorPeers.ts for DAG
import { describe, it, expect } from "bun:test";
import { getSectorPeers, SECTOR_NAME_VI } from "../domain/services/sectorPeers.js";

describe("Task 1796f — machinery sector", () => {
  it("SECTOR_PEERS.machinery contains DAG on HOSE", () => {
    const peers = getSectorPeers("machinery");
    const dag = peers.find((p) => p.code === "DAG");
    expect(dag).toBeDefined();
    expect(dag?.exchange).toBe("HOSE");
  });

  it("SECTOR_NAME_VI.machinery is defined with Vietnamese label", () => {
    expect(SECTOR_NAME_VI.machinery).toBeDefined();
    expect(SECTOR_NAME_VI.machinery).toBe("Máy móc / Công nghiệp");
  });

  it("getSectorPeers machinery excludes DAG when in exclude set", () => {
    const peers = getSectorPeers("machinery", new Set(["DAG"]));
    expect(peers.find((p) => p.code === "DAG")).toBeUndefined();
  });
});
