import { describe, it, expect } from "bun:test";
import { discoverHosePdfUrls } from "../domain/services/bctcDiscovery.js";

describe("bctcDiscovery DDD guard", () => {
  it("throws when no fetch functions supplied", async () => {
    await expect(discoverHosePdfUrls("VCB", {})).rejects.toThrow("[bctcDiscovery]");
  });
});
