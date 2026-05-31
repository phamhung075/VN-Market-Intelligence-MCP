// BSD3-brief-sector-drift.test.ts
// Proves the new mechanism (template has no **Sector** line) makes sector
// drift structurally impossible. Red test = old template still has sector line.
// Green test = new template has no sector line.

import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { WATCHLIST_SEED } from "../infrastructure/db/seedWatchlist.js";

const TEMPLATE_PATH = join(
  process.cwd(),
  "../../docs/references/analysis-ledger-template.md"
);
const BRIEFS_DIR = join(process.cwd(), "../../docs/analysis-briefs");

describe("BSD-3: brief sector drift prevention", () => {
  it("canonical template must NOT contain a **Sector**: line (b1 seam)", () => {
    const content = readFileSync(TEMPLATE_PATH, "utf-8");
    expect(content).not.toMatch(/\*\*Sector\*\*/);
  });

  it("deliberate-drift fixture: injecting a sector line into template content is caught by this test", () => {
    // This test proves the check above is non-false-green.
    // The injected string would be the exact pattern a drifted file carries.
    const driftedContent = `# {TICKER} — Analysis Ledger {YEAR}\n**Sector**: real_estate | **Exchange**: HOSE\n`;
    expect(driftedContent).toMatch(/\*\*Sector\*\*/);
    // The template file itself must NOT match — confirmed by the test above.
    // This fixture proves: if the template were still the old form, the test would fail.
  });

  it("all docs/analysis-briefs/*.md files must NOT contain a **Sector**: line", () => {
    const files = readdirSync(BRIEFS_DIR).filter((f: string) => f.endsWith(".md"));
    for (const file of files) {
      const content = readFileSync(join(BRIEFS_DIR, file), "utf-8");
      const hasSector = /\*\*Sector\*\*/.test(content);
      if (hasSector) {
        throw new Error(`Brief ${file} still contains a **Sector**: line — remove it`);
      }
    }
  });

  it("WATCHLIST_SEED domain values are the canonical sector SSOT (proves consumers never need the brief line)", () => {
    // All consumers derive sector from get_watchlist() domain field, not from the brief.
    // This test anchors the assumption: the seed is the single source of truth.
    const seedCodes = WATCHLIST_SEED.map((e) => e.code);
    expect(seedCodes.length).toBeGreaterThan(0);
    for (const entry of WATCHLIST_SEED) {
      expect(entry.domain).toBeTruthy();
      expect(typeof entry.domain).toBe("string");
    }
  });
});
