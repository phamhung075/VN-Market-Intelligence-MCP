import { describe, it, expect } from "bun:test";
import { discoverHosePdfUrls } from "../domain/services/bctcDiscovery.js";

describe("bctcDiscovery DDD guard", () => {
  it("returns empty result when no fetch functions supplied (graceful empty, not throw)", async () => {
    // Prod (task 1915-fix-part2) changed from throw to silent empty return
    // when no fetch functions are supplied. The caller handles absence gracefully.
    const result = await discoverHosePdfUrls("VCB", {});
    // Should not throw — should return an empty/null-source result
    expect(result).toBeDefined();
    // URLs array must be empty (no fetch fn → no discovery)
    const urls = (result as { urls?: unknown[] }).urls ?? [];
    expect(Array.isArray(urls)).toBe(true);
    expect(urls.length).toBe(0);
  });
});
