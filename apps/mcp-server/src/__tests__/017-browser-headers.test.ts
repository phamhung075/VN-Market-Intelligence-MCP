import { describe, it, expect } from "bun:test";
import { BROWSER_UA, buildBrowserHeaders } from "../infrastructure/fetchers/browserHeaders.js";

describe("browserHeaders", () => {
  it("BROWSER_UA contains Chrome/131", () => {
    expect(BROWSER_UA).toContain("Chrome/131");
  });

  it("buildBrowserHeaders defaults", () => {
    const h = buildBrowserHeaders();
    expect(h["User-Agent"]).toBe(BROWSER_UA);
    expect(h["Accept"]).toBe("*/*");
    expect(h["Accept-Language"]).toBeDefined();
  });

  it("buildBrowserHeaders custom accept", () => {
    const h = buildBrowserHeaders("application/json");
    expect(h["Accept"]).toBe("application/json");
  });

  it("buildBrowserHeaders extra headers merge", () => {
    const h = buildBrowserHeaders("*/*", { Cookie: "x=1" });
    expect(h["Cookie"]).toBe("x=1");
    expect(h["User-Agent"]).toBe(BROWSER_UA);
  });

  it("extra headers override defaults", () => {
    const h = buildBrowserHeaders("*/*", { "User-Agent": "custom" });
    expect(h["User-Agent"]).toBe("custom");
  });
});
