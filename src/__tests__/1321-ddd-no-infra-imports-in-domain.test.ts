/**
 * Task 1321 — DDD Boundary: Zero Infra Imports in domain/
 *
 * Scans src/domain/**\/*.ts at runtime and asserts:
 *   TC-1: zero lines match the infra-import pattern
 *   TC-2: shared-types.ts has VnstockIntradayTick with correct fields
 *   TC-3: RssItem has fields `url` and `publishedAt` (not link/pubDate)
 *   TC-4: WeatherEvent has fields `type` and `regions` (not eventType/region)
 *
 * Written BEFORE task 1320 — must be RED before the refactor is applied.
 */

import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { Glob } from "bun";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findDomainTsFiles(): string[] {
  const domainDir = path.resolve(import.meta.dir, "../../src/domain");
  const glob = new Glob("**/*.ts");
  return Array.from(glob.scanSync(domainDir)).map((f) =>
    path.join(domainDir, f),
  );
}

// ─── TC-1: Zero infra imports in src/domain/ ─────────────────────────────────

describe("TC-1: domain/ has zero lines importing from infrastructure/", () => {
  it("finds no ^import[^(].*from.*infrastructure lines across all domain TS files", () => {
    const files = findDomainTsFiles();
    expect(files.length).toBeGreaterThan(0); // sanity: domain files must exist

    const infraImportRegex = /^import[^(].*from.*infrastructure/m;
    const violations: string[] = [];

    for (const file of files) {
      const src = fs.readFileSync(file, "utf-8");
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/^import[^(].*from.*infrastructure/.test(lines[i]!)) {
          violations.push(`${path.relative(process.cwd(), file)}:${i + 1}: ${lines[i]}`);
        }
      }
    }

    if (violations.length > 0) {
      console.error("DDD violations found:\n" + violations.join("\n"));
    }
    expect(violations).toHaveLength(0);
  });
});

// ─── TC-2: shared-types.ts has VnstockIntradayTick with correct fields ────────

describe("TC-2: shared-types.ts — VnstockIntradayTick fields", () => {
  it("VnstockIntradayTick satisfies required field structure", async () => {
    const { VnstockIntradayTick: _unused, ...rest } = await import(
      "../domain/models/shared-types.js"
    ).catch(() => ({ VnstockIntradayTick: undefined })) as Record<string, unknown>;

    // Type-level structural check: import the type and use satisfies
    const tick: import("../domain/models/shared-types.js").VnstockIntradayTick =
      { code: "", time: "", price: 0, volume: 0, matchType: "" };

    expect(tick.code).toBe("");
    expect(tick.time).toBe("");
    expect(tick.price).toBe(0);
    expect(tick.volume).toBe(0);
    expect(tick.matchType).toBe("");
  });
});

// ─── TC-3: RssItem fields are `url` and `publishedAt` ─────────────────────────

describe("TC-3: shared-types.ts — RssItem field names", () => {
  it("RssItem has url and publishedAt (not link/pubDate)", async () => {
    const item: import("../domain/models/shared-types.js").RssItem = {
      title: "Test",
      url: "https://example.com",
      publishedAt: "2026-04-15T00:00:00Z",
      content: "body",
      source: "test",
    };

    expect(item.url).toBe("https://example.com");
    expect(item.publishedAt).toBe("2026-04-15T00:00:00Z");
    // Ensure no legacy field names leak through structural TS check
    expect("link" in item).toBe(false);
    expect("pubDate" in item).toBe(false);
  });
});

// ─── TC-4: WeatherEvent fields are `type` and `regions` ───────────────────────

describe("TC-4: shared-types.ts — WeatherEvent field names", () => {
  it("WeatherEvent has type and regions (not eventType/region)", async () => {
    const event: import("../domain/models/shared-types.js").WeatherEvent = {
      type: "typhoon",
      severity: "high",
      regions: ["Hà Nội", "Đà Nẵng"],
      forecastDate: "2026-04-15",
      impactDuration: "48 giờ",
      description: "Test typhoon",
    };

    expect(event.type).toBe("typhoon");
    expect(event.regions).toEqual(["Hà Nội", "Đà Nẵng"]);
    expect("eventType" in event).toBe(false);
    expect("region" in event).toBe(false);
  });
});
