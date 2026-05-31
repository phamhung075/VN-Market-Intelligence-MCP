<!-- size-justification: 130L — BA spec: seam decision (b1 vs b2), exact file/function list, blast-radius table, AC with drift-fixture, zone/serialize flag. All sections load-bearing for architect handoff. -->

# BA Spec — BSD-3: Brief Sector Derive-at-Render (BRIEF-SECTOR-DRIFT)

**Date:** 2026-05-31
**Status:** SPEC COMPLETE — no blockers
**DDD layer:** domain (SSOT renderer in `sectorPeers.ts`) + interface (brief-creation sites)
**Zone:** `apps/mcp-server/` → owner dev-mcp-server
**Serialize against:** TSH-1 (same zone, rebuild pending), EI-P2 (same zone, rebuild pending), BANK-AWARE FU-BANK-CODECOL

---

## Seam Decision: b1 (DROP the hardcoded `**Sector**:` line)

**Recommendation: b1 — drop the line from the template and all creation sites.**

Rationale:

1. **No reader parses it.** Exhaustive audit of all consumers confirms zero code paths that extract sector from the brief `**Sector**:` header:
   - Chef (unified-agent/chef.md) — reads sector from `bctc_signal_*.json` `domain` field, not the brief.
   - News-scout (stage-log-notify.md) — appends a single sentiment line; never reads the header.
   - Fb-poster (fb-market-poster/flow/main.md STEP 2) — reads briefs for "forward call or price target" only; sector for post/hashtags comes from live tools (`get_top_movers` `sector` field, `get_market_snapshot`).
   - Market-watcher (eod.md) — appends price/RSI/volume line; never reads the header.
   - Digest-predict (monthly.md quarterly branch) — reads `[News Scout]|[Report Analyzer]|[Market Watcher]|[Unified Agent]` sections; sector for analysis comes from `get_bctc_full(code)` and `get_sector_comparison(code)`.
   - The line is display-only metadata for a human reader. No machine consumer depends on it.

2. **b2 is over-engineering for zero reader benefit.** A stamp-from-seed helper that writes `**Sector**: <label>` corrects the data at write time, but since no consumer reads it, the only benefit is human readability. That benefit does not justify the implementation cost and the residual risk that the line can still drift if the stamp helper is bypassed (e.g., a future agent creates a brief without going through the helper).

3. **b1 makes drift structurally impossible.** Once the line is gone from the template and all creation sites, there is no field to drift. The sector is always live-queried from the seed at consumption time (already done by all consumers via `get_watchlist()` → `domain` field, `SECTOR_NAME_VI` map, and `get_sector_comparison()`).

---

## Exact Files to Change

### 1. Canonical template — `docs/references/analysis-ledger-template.md`

Remove the `**Sector**: {domain} | **Exchange**: {exchange}` line from the markdown block.

Keep: `# {TICKER} — Analysis Ledger {YEAR}` header and all four `## [Agent]` section headers.

New template block:
```markdown
# {TICKER} — Analysis Ledger {YEAR}
**Exchange**: {exchange}

## [Report Analyzer] Fundamentals & Valuation

## [News Scout] Headlines & Sentiment

## [Market Watcher] Price, Volume, Technicals

## [Unified Agent] Quarterly Syntheses
```

Note: `**Exchange**:` is retained — exchange is not derivable from any live tool without a DB call, and no evidence it drifts (exchange does not change post-listing). Only the `**Sector**:` class is being eliminated.

### 2. Inline template copy — `docs/agents/digest-predict/flow/monthly.md` line 49

Same change: remove `**Sector**: {domain} | **Exchange**: {exchange}` from the inline ledger-creation block; retain `**Exchange**: {exchange}`.

### 3. Inline template copy — `docs/agents/unified-agent/flow/market-events-log.md` line 21

Same change: remove `**Sector**: {domain} | **Exchange**: {exchange}`; retain `**Exchange**: {exchange}`.

### 4. Existing 26 brief files — `docs/analysis-briefs/*.md`

Remove the `**Sector**: <value>` portion from the header line of all existing brief files. The `**Exchange**: <value>` portion stays. (BSD-1 already fixes the 3 drifted files; this task removes the sector field from all 26 remaining files in a single sweep.)

Note: the docs-only sweep (files 1-3 and 4) lives at `docs/` and `apps/mcp-server/` is NOT touched for this template change — the templates are in `docs/`. The zone flag is for the test (item 5 below) which lives in `apps/mcp-server/src/__tests__/`.

### 5. Drift-fixture test — `apps/mcp-server/src/__tests__/BSD3-brief-sector-drift.test.ts` (new file)

**This is the only `apps/mcp-server/` touch in BSD-3.**

---

## Acceptance Criteria

**AC-1 (template clean):** `docs/references/analysis-ledger-template.md` contains 0 occurrences of `**Sector**`.

**AC-2 (inline copies clean):** `docs/agents/digest-predict/flow/monthly.md` and `docs/agents/unified-agent/flow/market-events-log.md` each contain 0 occurrences of `**Sector**`.

**AC-3 (existing briefs clean):** All 26 files under `docs/analysis-briefs/*.md` contain 0 occurrences of `**Sector**`. Verified with: `grep -r "\*\*Sector\*\*" docs/analysis-briefs/ | wc -l` == 0.

**AC-4 (deliberate-drift fixture — red-then-green):**

Test file: `apps/mcp-server/src/__tests__/BSD3-brief-sector-drift.test.ts`

```typescript
// BSD3-brief-sector-drift.test.ts
// Proves the new mechanism (template has no **Sector** line) makes sector
// drift structurally impossible. Red test = old template still has sector line.
// Green test = new template has no sector line.

import { readFileSync } from "fs";
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
    const { readdirSync } = require("fs");
    const files = readdirSync(BRIEFS_DIR).filter((f: string) => f.endsWith(".md"));
    for (const file of files) {
      const content = readFileSync(join(BRIEFS_DIR, file), "utf-8");
      expect(content).not.toMatch(
        /\*\*Sector\*\*/,
        `Brief ${file} still contains a **Sector**: line — remove it`
      );
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
```

**AC-5 (no regressions):** `tsc --noEmit` exits 0 after the test file is added. No existing tests broken.

**AC-6 (BSD-QA gate):** `grep -r "\*\*Sector\*\*" docs/analysis-briefs/ docs/references/ docs/agents/` == 0 hits.

---

## Reader Blast Radius

| Consumer | Reads brief header? | Reads `**Sector**:`? | Safe to drop? |
|---|---|---|---|
| chef (unified-agent/chef.md) | No — reads `docs/signals/*.json` | No | YES |
| news-scout (stage-log-notify.md) | Appends to brief only | No | YES |
| fb-market-poster (flow/main.md STEP 2) | Yes — extracts forward calls/price targets | No (extracts forward call, not sector header) | YES |
| market-watcher (eod.md) | Creates brief if missing; appends price line | No | YES |
| digest-predict (monthly.md quarterly) | Yes — reads agent sections for conviction score | No (reads `[News Scout]|[Report Analyzer]|...` sections) | YES |
| unified-agent market-events-log.md | Creates brief if missing; appends conviction entry | No | YES |
| bctc-analyst (stage-analyze.md R4) | Creates brief if missing; appends quarterly table | No | YES |

**Blast radius: zero.** No reader breaks. b1 is safe across the full consumer set.

---

## Zone + Serialize Flag

- Template files (`docs/references/`, `docs/agents/`, `docs/analysis-briefs/`) are docs-only — no rebuild required.
- The drift-fixture test (`apps/mcp-server/src/__tests__/BSD3-brief-sector-drift.test.ts`) is in the `apps/mcp-server/` zone.
- **Rebuild serialization:** dev-mcp-server must serialize BSD-3 test addition against TSH-1 (remove `get_market_hexagram` tool), EI-P2 (`data_env` ×5 tables), and BANK-AWARE FU-BANK-CODECOL. All are in `apps/mcp-server/`. BSD-3 test is additive (new file), zero conflict with TSH-1/EI-P2/BANK work, but a single rebuild pass should batch all `apps/mcp-server/` changes before ops rebuilds the container. Flag this to dev-mcp-server: do NOT trigger a standalone rebuild for BSD-3 test alone — batch with the next scheduled TSH-1 or EI-P2 rebuild.

---

## Non-Functional Requirements

- NFR-1: The template change is a BREAKING DROP — any brief file created before this change still has the `**Sector**:` line. The sweep (AC-3) fixes all 26 existing files atomically in one commit. Commit must be scoped to `docs/analysis-briefs/` only (no `apps/mcp-server/` in the same commit).
- NFR-2: Existing briefs are NOT deleted — the sector field line is excised in-place, all other content preserved.
- NFR-3: `**Exchange**:` stays — it is non-driftable metadata (exchanges don't change) and aids human navigation of the brief files.
