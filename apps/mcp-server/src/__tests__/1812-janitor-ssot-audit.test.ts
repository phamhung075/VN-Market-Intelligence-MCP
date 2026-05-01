import { describe, it, expect } from "bun:test";
import { SignalTypeSchema } from "../infrastructure/db/agentSignalStore.js";
import { SEVERITY_VI } from "../interface/mcp/tools/sector/severityLabels.js";

describe("Sprint 1812 — JANITOR SSOT audit", () => {
  it("JANITOR-013: SignalTypeSchema is exported from agentSignalStore", () => {
    expect(SignalTypeSchema.options).toContain("urgent_news");
    expect(SignalTypeSchema.options).toContain("verified_chain");
  });

  it("JANITOR-009: SEVERITY_VI canonical map has all four severity keys", () => {
    expect(SEVERITY_VI["critical"]).toBe("NGHIÊM TRỌNG");
    expect(SEVERITY_VI["high"]).toBe("QUAN TRỌNG");
    expect(SEVERITY_VI["medium"]).toBe("LƯU Ý");
    expect(SEVERITY_VI["low"]).toBe("THẤP");
  });
});
