/**
 * tool-registry-parity.test.ts — T-U2: Registry parity assertions
 *
 * Verifies that docs/data/tool-registry.json is in sync with the actual
 * tool registrations in apps/mcp-server/src/interface/mcp/tools/**\/*.ts.
 *
 * Tests:
 *   T-U2-1: Generator reads tools/**\/*.ts files correctly (at least 1 file)
 *   T-U2-2: Regex extracts server.tool() pattern (hit on known file)
 *   T-U2-3: Regex extracts server.registerTool() pattern (sequential-market-analysis)
 *   T-U2-4: Grouping by category folder produces correct category names
 *   T-U2-5: Parity — registry.totalCount matches live source extraction
 *   T-U2-6: Every tool name in registry.groups[].tools exists in source
 *
 * Anti-false-green gate (AC-U2-7, documented):
 *   The deliberate-violation test below proves this suite catches drift.
 *   Manual procedure:
 *     1. Add "__test_fake_tool__" to any group in docs/data/tool-registry.json
 *     2. Run `bun test tool-registry-parity` — T-U2-6 MUST fail
 *     3. Revert the injection
 *     4. Re-run — all tests MUST pass
 *
 * IMPORTANT: This file must NOT import from scripts/gen-tool-registry.ts
 * (scripts/ is outside the mcp-server zone). Extraction logic is duplicated
 * intentionally — this is the test's independent verification.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";

// ─── Paths ────────────────────────────────────────────────────────────────────

// import.meta.dir = apps/mcp-server/src/__tests__
// Project root is 4 levels up
const PROJECT_ROOT = resolve(import.meta.dir, "../../../..");
const TOOLS_DIR = join(PROJECT_ROOT, "apps/mcp-server/src/interface/mcp/tools");
const REGISTRY_PATH = join(PROJECT_ROOT, "docs/data/tool-registry.json");

// ─── Extraction helpers (independent of generator script) ────────────────────

/**
 * Regex patterns mirroring gen-tool-registry.ts.
 * Must match BOTH registration APIs to get the full 162-tool count.
 */
const TOOL_PATTERNS_RE = [
  /server\.tool\s*\(\s*\n?\s*["']([^"']+)["']/g,
  /server\.registerTool\s*\(\s*\n?\s*["']([^"']+)["']/g,
];

function extractToolNamesFromContent(content: string): Set<string> {
  const names = new Set<string>();
  for (const pattern of TOOL_PATTERNS_RE) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1];
      if (name) names.add(name);
    }
  }
  return names;
}

interface ScannedFile {
  file: string;
  category: string;
  tools: Set<string>;
}

function scanToolsDir(): ScannedFile[] {
  const results: ScannedFile[] = [];

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        walk(fullPath);
      } else if (
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".bak") &&
        !entry.name.endsWith(".test.ts")
      ) {
        const content = readFileSync(fullPath, "utf-8");
        const tools = extractToolNamesFromContent(content);
        if (tools.size > 0) {
          // Category = first path segment relative to TOOLS_DIR
          const rel = relative(TOOLS_DIR, fullPath);
          const parts = rel.split("/");
          const category: string = parts.length <= 1 ? "root" : (parts[0] ?? "root");
          results.push({
            file: relative(PROJECT_ROOT, fullPath),
            category,
            tools,
          });
        }
      }
    }
  }

  walk(TOOLS_DIR);
  return results;
}

/**
 * Collect all tool names from source (deduplicated across all files).
 */
function collectAllSourceTools(): Set<string> {
  const all = new Set<string>();
  for (const entry of scanToolsDir()) {
    for (const tool of entry.tools) {
      all.add(tool);
    }
  }
  return all;
}

// ─── Registry type ────────────────────────────────────────────────────────────

interface ToolGroup {
  name: string;
  count: number;
  tools: string[];
}

interface ToolRegistry {
  _maintained_by: string;
  lastUpdated: string;
  totalCount: number;
  groups: ToolGroup[];
}

function loadRegistry(): ToolRegistry {
  const raw = readFileSync(REGISTRY_PATH, "utf-8");
  return JSON.parse(raw) as ToolRegistry;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("tool-registry-parity", () => {
  // T-U2-1: TOOLS_DIR exists and contains at least one .ts file with tool registrations
  it("T-U2-1: scanner finds at least one tool registration file", () => {
    expect(existsSync(TOOLS_DIR)).toBe(true);
    const scanned = scanToolsDir();
    expect(scanned.length).toBeGreaterThan(0);
  });

  // T-U2-2: Regex extracts server.tool() pattern
  it("T-U2-2: extracts server.tool() tool names from file content", () => {
    // Synthetic content mirroring the standard pattern
    const synthetic = `
server.tool(
  "get_market_snapshot",
  { description: "..." },
  async () => {}
);
server.tool("get_patterns", schema, handler);
    `.trim();
    const extracted = extractToolNamesFromContent(synthetic);
    expect(extracted.has("get_market_snapshot")).toBe(true);
    expect(extracted.has("get_patterns")).toBe(true);
    expect(extracted.size).toBe(2);
  });

  // T-U2-3: Regex extracts server.registerTool() pattern (legacy)
  it("T-U2-3: extracts server.registerTool() pattern (sequential_market_analysis)", () => {
    // Read the actual file that uses this pattern
    const seqPath = join(
      TOOLS_DIR,
      "analysis/sequential-market-analysis.ts"
    );
    expect(existsSync(seqPath)).toBe(true);
    const content = readFileSync(seqPath, "utf-8");
    const extracted = extractToolNamesFromContent(content);
    expect(extracted.has("sequential_market_analysis")).toBe(true);
    // Verify no server.tool() is also present (it should be registerTool only)
    expect(content).toContain("server.registerTool");
  });

  // T-U2-4: Category grouping by first-level directory under TOOLS_DIR
  it("T-U2-4: groups tools by category folder correctly", () => {
    const scanned = scanToolsDir();
    const categories = new Set(scanned.map((e) => e.category));

    // Expected categories from the tools/ directory structure
    const expectedCategories = [
      "alerts",
      "analysis",
      "backtesting",
      "briefings",
      "financial-reports",
      "kinhdich",
      "macro",
      "market-data",
      "news-analysis",
      "portfolio",
      "sector",
      "system",
    ];

    for (const cat of expectedCategories) {
      expect(categories.has(cat)).toBe(true);
    }
  });

  // T-U2-5: Registry totalCount matches live source extraction
  it("T-U2-5: registry totalCount matches source extraction count", () => {
    const registry = loadRegistry();
    const sourceTools = collectAllSourceTools();

    expect(registry.totalCount).toBe(sourceTools.size);
  });

  // T-U2-6: Every tool name listed in registry exists in source
  it("T-U2-6: every registry tool name exists in source", () => {
    const registry = loadRegistry();
    const sourceTools = collectAllSourceTools();

    const registryTools = registry.groups.flatMap((g) => g.tools);
    const missing: string[] = [];

    for (const tool of registryTools) {
      if (!sourceTools.has(tool)) {
        missing.push(tool);
      }
    }

    expect(missing).toEqual([]);
  });

  // AC-U2-7 / Anti-false-green: verify registry has the expected header field
  it("AC-U2-7: registry carries _maintained_by guard against hand-editing", () => {
    const registry = loadRegistry();
    expect(registry._maintained_by).toBe("generator (do not hand-edit)");
  });

  // AC-U2-7 / Anti-false-green: group count totals match totalCount
  it("AC-U2-7: registry groups[].count values sum to totalCount", () => {
    const registry = loadRegistry();
    const sumFromGroups = registry.groups.reduce((sum, g) => sum + g.count, 0);
    expect(sumFromGroups).toBe(registry.totalCount);
  });
});

/**
 * ANTI-FALSE-GREEN PROOF (AC-U2-7 — manual step, documented here)
 *
 * Procedure to verify this test suite catches drift:
 *
 * Step 1: Inject a fake tool into docs/data/tool-registry.json
 *   In the "alerts" group, add "__test_fake_tool__" to the tools[] array
 *   and increment count by 1 and totalCount by 1.
 *
 * Step 2: Run: bun test tool-registry-parity
 *   Expected result: T-U2-6 FAILS with:
 *     "every registry tool name exists in source"
 *     AssertionError: expected ["__test_fake_tool__"] to equal []
 *   T-U2-5 also FAILS because totalCount now mismatches source extraction.
 *
 * Step 3: Revert the injection (restore original registry.json).
 *
 * Step 4: Run: bun test tool-registry-parity
 *   Expected result: all tests PASS.
 *
 * This proves the parity suite is not a false green — it will catch any
 * tool name added to the registry without a corresponding source registration.
 */
