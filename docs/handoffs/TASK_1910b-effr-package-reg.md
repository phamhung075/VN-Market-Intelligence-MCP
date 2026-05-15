---
sprint: 1910
branch: task/1910b-effr-package-registration
size: S
zone: apps/mcp-server/src/interface/mcp/bootstrap/ + docs/
depends_on: [1910a-ism-tool]
blocks: []
---

## TLDR

Zero-build task: add already-shipped `get_fed_liquidity_spread` tool to three agent packages (financial_analyst, news_scout, unified_coordinator) + agentBootstrap.ts manifest arrays + package doc mirrors. Completes D-step compliance. Triggered by 3-cycle auto-cure threshold (FA 2026-05-11/12/13, UA 2026-05-14, NS 2026-05-13).

---

## [PM] Planning Context

**Zone:** `.claude/tools/package/` (3 files) + `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` + `docs/SKILL_MANIFEST.md`

**Acceptance Criteria:**
- [ ] `get_fed_liquidity_spread` added to `financial_analyst` array in `agentBootstrap.ts` line 46
- [ ] `get_fed_liquidity_spread` added to `news_scout` array in `agentBootstrap.ts` line 30
- [ ] `get_fed_liquidity_spread` added to `unified_coordinator` array in `agentBootstrap.ts` line 224
- [ ] `.claude/tools/package/financial-analyst.md` — +1 row in Macro Intelligence section
- [ ] `.claude/tools/package/news-scout.md` — +1 row in US monetary chain section
- [ ] `.claude/tools/package/unified-agent.md` — +1 row in Pillar 2 / COC section
- [ ] `docs/SKILL_MANIFEST.md` — +1 row for `get_fed_liquidity_spread` (with 3 agent links)
- [ ] Verified that agent .md identity fields match agentBootstrap.ts keys (`news_scout`, `financial_analyst`, `unified_coordinator`)
- [ ] No code changes; only config + docs edits

**Files to read first:**
- `docs/handoffs/REQ_1910.md` § 3.1-3.6 (D-step carry evidence, file list, ACs)
- `docs/handoffs/ARCH_REVIEW_1910.md` § 1910b auto-cure gate (3-cycle threshold confirmed)
- `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` lines 30/46/224 (array locations)
- `.claude/tools/package/{financial-analyst,news-scout,unified-agent}.md` (existing package doc format)
- `docs/SKILL_MANIFEST.md` (mirror format for agentBootstrap entries)

**Files to create:**
- None (tool already shipped in 1879b; this is registration-only)

**Files to modify:**
- `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` (3 array inserts)
- `.claude/tools/package/financial-analyst.md` — +1 row
- `.claude/tools/package/news-scout.md` — +1 row
- `.claude/tools/package/unified-agent.md` — +1 row
- `docs/SKILL_MANIFEST.md` — +1 row

**Dependencies:**
- `get_fed_liquidity_spread` tool (SHIPPED 1890a) — already registered in tool-registry.ts + agentBootstrap.ts (unified_coordinator only; 1910b adds to financial_analyst + news_scout)
- 1910a-ism-tool (DONE 2026-05-15) — unblocks 1910b (shared agentBootstrap.ts file; merge 1910a first to avoid conflicts)

**Knowledge needed:**
- Existing package doc format (review financial-analyst.md as model)
- SKILL_MANIFEST.md row format (3-agent entry)
- Agent identity fields: `financial_analyst`, `news_scout`, `unified_coordinator` (match agentBootstrap keys)

---

## D-step auto-cure evidence (3-cycle threshold — CONFIRMED)

Per REQ_1910.md §3.2 + ARCH_REVIEW_1910.md §1910b auto-cure gate:

| Agent | Cycle | Evidence | Tool absent impact |
|-------|-------|----------|-------------------|
| financial-analyst | 2026-05-11 | `get_macro_snapshot not in package — data gap logged`; regime defaulted NEUTRAL | D-step COC gap |
| financial-analyst | 2026-05-12 | `get_macro_snapshot not in package`; EFFR-IORB spread not referenced | D-step COC incomplete |
| financial-analyst | 2026-05-13 | `REGIME: TIGHTENING (inferred from news)`; no EFFR-IORB spread call; Layer 2 D-step partially skipped | D-step COC partially skipped |
| unified-agent | 2026-05-14 06:00 UTC | `COC✓(carry -33bp, US10Y RISK-OFF)` — carry computed WITHOUT tool (not in package) | D-step incomplete |
| news-scout | 2026-05-13 18:18 UTC | `get_macro_snapshot not in bootstrap`; US monetary chain analysis uses headline rate only | D-step COC incomplete |

**Trigger:** ≥3 consecutive cycles with tool absent = auto-cure activated. Task ships unconditionally.

---

## Implementation checklist

1. **agentBootstrap.ts edits (3 locations):**
   - Line 30 (`news_scout` array): add `"get_fed_liquidity_spread"`
   - Line 46 (`financial_analyst` array): add `"get_fed_liquidity_spread"`
   - Line 224 (`unified_coordinator` array): add `"get_fed_liquidity_spread"`

2. **Package doc edits (3 files):**
   - `.claude/tools/package/financial-analyst.md` — Macro Intelligence section (after get_macro_snapshot row)
   - `.claude/tools/package/news-scout.md` — US monetary chain section (new section or after rate data rows)
   - `.claude/tools/package/unified-agent.md` — Pillar 2 / COC section (after get_macro_snapshot row)

3. **SKILL_MANIFEST mirror:**
   - `docs/SKILL_MANIFEST.md` — add 1 row: `get_fed_liquidity_spread | Compute EFFR-IORB spread (carry cost proxy) | financial-analyst, news-scout, unified-coordinator | source_tier: 1`

4. **Verification:**
   - Confirm agent .md files reference `news_scout`, `financial_analyst`, `unified_coordinator` keys (not alt names)
   - After merge: `/graphify docs --update --no-viz` to sync knowledge graph

---

## Package doc format (reference)

**Row format in financial-analyst.md (Macro Intelligence section):**
```
| get_fed_liquidity_spread | Compute EFFR-IORB spread (carry cost proxy) | numeric: spread (bps) | [risk-off context] |
```

**SKILL_MANIFEST.md row format:**
```
| get_fed_liquidity_spread | Compute EFFR-IORB spread (carry cost proxy) | financial-analyst, news-scout, unified-coordinator | source_tier: 1 |
```

---

## Risk flags

- **R1 (low):** Confirm agent .md identity fields match agentBootstrap keys. If mismatch, doc-drift audit required (separate ticket).
- **R2 (low):** SKILL_MANIFEST.md must list all 3 agents in same row (not separate rows).

---

## [Developer] Implementation Notes

**Date:** 2026-05-15
**Agent:** dev-mcp-server
**Status:** COMPLETE — zero changes required

### Verification findings

All 5 acceptance criteria files were already in the correct state before any edits:

| File | Status | Evidence |
|------|--------|---------|
| `agentBootstrap.ts` — `news_scout` array | ALREADY PRESENT | `"get_fed_liquidity_spread"` at line 45, `"get_ism_subcomponents"` at line 46 |
| `agentBootstrap.ts` — `financial_analyst` array | ALREADY PRESENT | `"get_fed_liquidity_spread"` at line 78, `"get_ism_subcomponents"` at line 79 |
| `agentBootstrap.ts` — `unified_coordinator` array | ALREADY PRESENT | `"get_fed_liquidity_spread"` at line 273, `"get_ism_subcomponents"` at line 274 |
| `.claude/tools/package/financial-analyst.md` | ALREADY PRESENT | Row in "Macro Intelligence" section: `get_fed_liquidity_spread \| Compute EFFR-IORB spread (carry cost proxy) \| —` |
| `.claude/tools/package/news-scout.md` | ALREADY PRESENT | Row in "US Monetary Chain" section (dedicated section created) |
| `.claude/tools/package/unified-agent.md` | ALREADY PRESENT | Row in "Macro Intelligence (COC)" section |
| `docs/SKILL_MANIFEST.md` | ALREADY PRESENT | All 3 agent JSON arrays contain `"get_fed_liquidity_spread"` + table row in "Recently registered tools" with `financial-analyst, news-scout, unified-coordinator` |

### Conclusion

The task was completed by `agent-md-editor` at c96 2026-05-14 (see Done entry `1910b-effr-package-reg-SHIPPED-c96` in `docs/TASKS.md`). The Todo entry for `1910b-effr-package-reg` was a stale backlog row that was not cleaned up at that time.

### Verification results

- `bun tsc --noEmit`: 0 errors
- `bun test --cwd apps/mcp-server`: 9430 tests pass across 848 files (exit code 0)
- No code changes made; docs/TASKS.md updated (Todo row removed, Review row added)

---

## Sequencing note

1910b has NO functional code dependency on 1910a. However, both tasks modify the same agentBootstrap.ts + SKILL_MANIFEST.md files. PM sequenced: execute 1910a first → merge + deploy → then 1910b starts. This avoids merge conflict on shared files.

1910a adds `get_ism_subcomponents` to all 3 agent arrays (lines 30/46/224). 1910b adds `get_fed_liquidity_spread` to the same arrays. Both can merge independently or via single PR after 1910a ships (no functional interaction).

No new container build required unless agentBootstrap.ts edit triggers rebuild. Otherwise, changes are manifest-only + docs-only (no deploy needed until next ops cycle).
