---
sprint: TOOL-SURFACE-UPGRADE
branch: task/TSU-U2-registry-generator
size: L
zone: apps/mcp-server/src/__tests__/ + scripts/
depends_on: []
blocks: ["TSU-DEV-U2-PARITY"]
---

# U2: Registry Generator + Parity Test

## TLDR

Create a static-grep generator (`scripts/gen-tool-registry.ts`) that extracts tool names from both `server.tool()` and `server.registerTool()` patterns, groups them by category folder, and writes `docs/data/tool-registry.json`. Add a parity test (`apps/mcp-server/src/__tests__/tool-registry-parity.test.ts`) that verifies registry totalCount matches source extraction. Expected output: totalCount=162 (161 server.tool + 1 sequential-market-analysis via server.registerTool). Sync `project-stats.json` toolCount field to match generator output.

---

## [PM] Planning Context

**Sprint:** TOOL-SURFACE-UPGRADE  
**Unit:** U2 — Registry generation from source + parity assertion  
**Zone:** `apps/mcp-server/src/__tests__/` + `scripts/`  
**Priority:** P1  
**Type:** Infrastructure (generator + test)  
**Effort:** ~3h

### Acceptance Criteria

- [x] AC-U2-1: New script `scripts/gen-tool-registry.ts` scans `apps/mcp-server/src/interface/mcp/tools/**/*.ts`
- [x] AC-U2-2: Extracts tool names from BOTH patterns: `server.tool("name",` and `server.registerTool("name",`
- [x] AC-U2-3: Groups tools by source folder category (parent directory name, e.g. market-data, sector, system)
- [x] AC-U2-4: Writes `docs/data/tool-registry.json` with fields: `_maintained_by: "generator (do not hand-edit)"`, `lastUpdated`, `totalCount`, `groups[]`
- [x] AC-U2-5: Generator totalCount output = 162 (161 server.tool + 1 server.registerTool in sequential-market-analysis.ts)
- [x] AC-U2-6: New test `apps/mcp-server/src/__tests__/tool-registry-parity.test.ts` reads registry JSON, runs same static grep, asserts totalCount match + all registry tools exist in source
- [x] AC-U2-7: Parity test includes deliberate-violation proof: inject fake `"__test_fake_tool__"` into registry, verify test goes RED, revert, verify GREEN (anti-false-green gate)
- [x] AC-U2-8: Update `scripts/gen-project-stats.ts` to import registry totalCount (or run same extraction) and sync `project-stats.json` toolCount field to match generator output
- [x] AC-U2-9: Registry header comment or _maintained_by field warns against hand-editing

### Files to Read First

- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — SSOT tool registration (130 registryFns, centralised registration array)
- `apps/mcp-server/src/interface/mcp/tools/analysis/sequential-market-analysis.ts` line 241 — `server.registerTool()` pattern (the non-standard registration)
- `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` lines 303–344 — buildToolNameMap probe (handles both APIs, runtime count)
- `docs/data/tool-registry.json` — current stale version (125 tools, hand-edited)
- `docs/data/project-stats.json` — current toolCount field (161, to be synced to 162 post-gen)

### Files to Create

- `scripts/gen-tool-registry.ts` — ~150L generator script (file scan, regex extract, grouping, JSON write)
- `apps/mcp-server/src/__tests__/tool-registry-parity.test.ts` — ~120L test file (parity assertions + deliberate-violation proof)

### Files to Modify

- `docs/data/tool-registry.json` — generated output (overwritten, no hand-edit after)
- `docs/data/project-stats.json` — toolCount field sync (1 line change)
- `scripts/gen-project-stats.ts` — import registry count or share extraction logic (5–10 lines)

### Dependencies

None (standalone generation, no upstream sprint dependencies).

### Knowledge Needed

- `docs/policies/dev-standards.md` — commit convention
- `docs/standards/mcp-tools.md` — tool registration schema
- `docs/ARCHITECTURE.md` — MCP tool discovery and bootstrap

### Related Documentation

- Architect design: `docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md` § U2: Registry Generator Design (lines 345–363)
- Root cause: tool-registry.json decayed to 125 vs 162 live (hand-maintenance unsustainable)
- Blocker resolutions: ARCH-U2-1/U2-2 (no registrations outside tools/**/*.ts; sequential_market_analysis via registerTool is the delta)

---

## Implementation Guidance

### gen-tool-registry.ts Design

```typescript
// scripts/gen-tool-registry.ts

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, relative, dirname, basename } from 'path';

const TOOLS_DIR = 'apps/mcp-server/src/interface/mcp/tools';
const OUTPUT_FILE = 'docs/data/tool-registry.json';

// Extract tool names using regex
function extractToolNames(tsContent: string): string[] {
  const patterns = [
    /server\.tool\s*\(\s*["']([^"']+)["']/g,
    /server\.registerTool\s*\(\s*["']([^"']+)["']/g
  ];
  const names: Set<string> = new Set();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(tsContent)) !== null) {
      names.add(match[1]);
    }
  }
  return Array.from(names).sort();
}

// Scan directory recursively
function scanDirectory(dir: string): Array<{ file: string; category: string; tools: string[] }> {
  const results: typeof results = [];
  
  function walk(path: string) {
    const entries = readdirSync(path, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(path, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        const content = readFileSync(fullPath, 'utf8');
        const tools = extractToolNames(content);
        if (tools.length > 0) {
          const category = basename(dirname(fullPath));
          results.push({ file: relative('.', fullPath), category, tools });
        }
      }
    }
  }
  
  walk(dir);
  return results;
}

// Generate registry
function generateRegistry() {
  const extracted = scanDirectory(TOOLS_DIR);
  
  // Group by category
  const groups: Record<string, string[]> = {};
  let totalCount = 0;
  
  for (const item of extracted) {
    if (!groups[item.category]) {
      groups[item.category] = [];
    }
    groups[item.category].push(...item.tools);
    totalCount += item.tools.length;
  }
  
  const groupsArray = Object.entries(groups).map(([name, tools]) => ({
    name,
    tools: [...new Set(tools)].sort(),
    count: new Set(tools).size
  }));
  
  const output = {
    _maintained_by: 'generator (do not hand-edit)',
    lastUpdated: new Date().toISOString(),
    totalCount,
    groups: groupsArray
  };
  
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Generated ${OUTPUT_FILE} with ${totalCount} tools`);
}

generateRegistry();
```

**Runtime:** Static grep (no startup dependency, no SSE session required).

### tool-registry-parity.test.ts Design

```typescript
// apps/mcp-server/src/__tests__/tool-registry-parity.test.ts

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import * as path from 'path';

describe('tool-registry-parity', () => {
  it('registry totalCount matches source extraction', () => {
    const registry = JSON.parse(
      readFileSync(path.join(process.cwd(), 'docs/data/tool-registry.json'), 'utf8')
    );
    
    // Run same extraction as generator
    const sourceCount = extractAllToolNames().size;
    
    expect(registry.totalCount).toBe(sourceCount);
  });

  it('every registry tool name exists in source', () => {
    const registry = JSON.parse(
      readFileSync(path.join(process.cwd(), 'docs/data/tool-registry.json'), 'utf8')
    );
    
    const sourceTools = extractAllToolNames();
    const registryTools = new Set(registry.groups.flatMap(g => g.tools));
    
    for (const tool of registryTools) {
      expect(sourceTools.has(tool)).toBe(true);
    }
  });

  it('deliberate-violation: test fails when fake tool injected', () => {
    // This test is skipped or run manually with injected violation
    // PURPOSE: prove the parity test can catch missing tools
    // MANUAL: (1) add "__test_fake_tool__" to registry.json
    //         (2) run this test (should FAIL)
    //         (3) remove injected tool
    //         (4) rerun (should PASS)
    // Skipped by default, documented in handoff.
  });
});

function extractAllToolNames(): Set<string> {
  // Same logic as generator: scan tools dir, extract both patterns
  // ...implementation mirrors gen-tool-registry.ts...
}
```

**Anti-false-green:** Test must be shown to FAIL when a tool is added without regenerating the registry. Manual step documented.

### gen-project-stats.ts Update

After generator runs, update project-stats.json:

```typescript
// In gen-project-stats.ts, before writing output:

const registry = JSON.parse(readFileSync('docs/data/tool-registry.json', 'utf8'));
const stats = {
  ...existingStats,
  toolCount: registry.totalCount
};
```

---

## Test Plan

### Unit Tests

1. **T-U2-1:** Generator reads tools/**/*.ts files correctly
2. **T-U2-2:** Regex extracts server.tool() pattern
3. **T-U2-3:** Regex extracts server.registerTool() pattern
4. **T-U2-4:** Grouping by category folder works
5. **T-U2-5:** Parity test reads registry.json and source count matches
6. **T-U2-6:** Parity test asserts every registry tool exists in source

### QA Gate

**QA-U2-1:** Run generator (bun scripts/gen-tool-registry.ts). Verify:
- `docs/data/tool-registry.json` is written
- `totalCount` field = 162
- `_maintained_by` header present ("generator (do not hand-edit)")
- Each group has `name`, `tools[]`, `count` fields

**QA-U2-2:** Run parity test (`bun test tool-registry-parity`). Verify:
- All assertions PASS
- Test result summary shows all 6 ACs green

**QA-U2-3:** Verify project-stats.json sync:
- `project-stats.json` toolCount field = 162 (after gen-project-stats runs)

**Anti-False-Green:** Inject fake tool name into registry.json, run parity test, verify FAIL, revert, verify PASS.

---

## Risk & Mitigation

**Risk R-U2-1:** Source count (161 via server.tool) vs runtime count (162 including registerTool). Generator MUST scan BOTH patterns. ARCH-U2-2 confirms both exist, no ghost registrations.

**Mitigation:** Regex patterns include both; expected output 162 confirmed by architect.

**Risk R-U2-2:** Stale registry from previous hand-edit. Generator overwrites completely (no merge).

**Mitigation:** Generator is the SSOT; hand-edit barrier enforced via comment in output.

**Risk R-U2-3:** Project-stats.json toolCount falls out of sync again. Solution: sync script runs alongside generator in CI/build step (future improvement, not blocking).

**Mitigation:** This sprint: sync manually via gen-project-stats update. Document in project-stats.json header.

---

## Rebuild Required

**Yes.** After code change (if any TS tests added), rebuild and re-run test suite:
```bash
bun test tool-registry-parity.test.ts
```

Generator script (scripts/) does not require rebuild (executed standalone).

---

## Commit Checklist

- [ ] New file created: `scripts/gen-tool-registry.ts`
- [ ] New test file created: `apps/mcp-server/src/__tests__/tool-registry-parity.test.ts`
- [ ] Generated file: `docs/data/tool-registry.json` (overwritten)
- [ ] Modified file: `docs/data/project-stats.json` (toolCount sync)
- [ ] Modified file: `scripts/gen-project-stats.ts` (registry count import)
- [ ] All tests pass (tsc exit 0, bun test passes)
- [ ] Deliberate-violation proof documented (manual step, not automated)
- [ ] Commit message: `feat(U2): registry generator + parity test — static grep extraction, 162 tools, SSOT lock`
- [ ] AC trailer appended per commit-convention.md

---

## Related Tasks

- Blocks: TSU-DEV-U2-PARITY (parity test rerun after U3 deregistrations)
- Depends on: TSU-DEV-U1 (baseline for tool count)
- Independent of: TSU-DEV-U3, TSU-DEV-U4, TSU-DEV-U5, TSU-DEV-U6
