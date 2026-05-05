---
name: Tool Documentation Phase 1 & Priority 1 Enrichment Complete
date: 2026-05-04
phase: 1-3 (of 5)
status: Ready for Agent Wiring (Tasks #4, #5)
---

# Tool Documentation & Package Organization — Phase 1-3 Complete

## ✅ Completed Work

### Phase 1: Tool Boilerplate Generation ✅
- **125 tool documentation files** created in `.claude/tools/`
- Each with auto-extracted descriptions, parameter specs, boilerplate structure
- All marked `[TODO]` for hand-enrichment

### Phase 2: Package Folder Organization ✅
- **11 package directories** created in `.claude/tools-package/`
  - `bootstrap/` (1), `market-analysis/` (18), `financial-analysis/` (18), `news-analysis/` (12), `report-analysis/` (12), `alert-control/` (16), `digest-synthesis/` (47), `unified-coordination/` (38), `qa-responder/` (16), `ops-infrastructure/` (22), `market-analyst-research/` (29)
- Each package has `index.md` + per-tool stubs

### Phase 3: Priority 1 Tools Hand-Enriched ✅
**5 core tools fully documented with examples, constraints, error handling:**

1. **`send_telegram`** — CRITICAL
   - All 3 channels documented (market, work, bug)
   - Market channel exclusivity policy explained
   - 4 real examples (alert, briefing, fix-shipped, bug-report)
   - Error handling table + constraints

2. **`post_agent_signal`** — CRITICAL
   - Signal bus architecture documented
   - All 10 signal types with examples
   - Chain synthesis flow explained
   - News → Financial → Alert Commander examples

3. **`get_cycle_bootstrap`** — CRITICAL
   - Mandatory pattern (every agent startup)
   - Return fields explained (agent_signals, market_context, system_status)
   - Fail-loud protocol integration
   - Multi-agent examples (Alert Commander, Market Watcher, Unified Agent)

4. **`log_agent_work`** — MANDATORY
   - Status codes (completed, failed, skipped)
   - Persistence layer explained (notebooks, SQLite, session logs)
   - Examples for all agent types (Alert Commander, News Scout)

5. **`submit_feedback`** — MANDATORY
   - Categories with routing (bug → @dev, enhancement → @po, data_error → @ops)
   - Dev Team auto-fix loop integration
   - 5 real examples (BCTC extraction, alert quality, cascade rules, performance, docs)

---

## 📊 Readiness Matrix

| Component | Status | Ready for Wiring |
|-----------|--------|-----------------|
| Tool boilerplate (125 tools) | ✅ Complete | YES |
| Package organization (11 packages) | ✅ Complete | YES |
| Priority 1 tools enriched (5 tools) | ✅ Complete | YES |
| Priority 2 tools enriched (13 tools) | 🟡 Boilerplate only | DEFER |
| Priority 3 tools enriched (7 tools) | 🟡 Boilerplate only | DEFER |
| Agent .md file updates | ⏳ PENDING | Task #4 |
| Flow refactoring (call_tool) | ⏳ PENDING | Task #5 |

---

## 🎯 Next Steps: Tasks #4 & #5

### Task #4: Update Agent .md Files to Reference Tool Packages

**Scope:**
- Cowork agents (9): Update `.claude/agents/*.md` files
  - Add `tools_packages: [bootstrap, market-analysis, ...]` to permissions
  - Update frontmatter `tools:` field from long list to package reference
  - Add lazy-load sections for tool knowledge (load on demand, not at startup)

- Dev Team agents (13): Update `.claude/agents/*.md` files similarly
  - Add tools_packages directives
  - Lazy-load tool knowledge

**Effort:** ~1-2 hours (quick YAML edits, no code changes)

**Files to update:** 22 agent `.md` files total

### Task #5: Update Flows to Use `call_tool()` Gateway Pattern

**Scope:**
- Refactor all flow files (`.claude/flows/*/main.md`) to use MCP gateway pattern
- Replace direct tool invocations with `call_tool("vn-market", "<tool>", <args>)`
- Example:
  ```
  OLD: mcp__vn-market__send_telegram(channel="market", message="...")
  NEW: call_tool("vn-market", "send_telegram", { channel: "market", message: "..." })
  ```

**Effort:** ~2-3 hours (systematic replace-all across all flow files)

**Files to update:** ~20 flow `.md` files in `.claude/flows/` tree

---

## 🚀 Recommended Sequence

Given your "parallel" choice, here's the optimal path:

```
NOW (Sequential baseline):
├─ Task #4: Update agents (1-2h)
│  ├─ Scan all 22 agent .md files
│  ├─ Add tools_packages: [] directives
│  ├─ Update frontmatter tools fields
│  └─ Add lazy-load knowledge sections
│
├─ Task #5: Update flows (2-3h)
│  ├─ Scan .claude/flows/ tree
│  ├─ Replace tool invocations with call_tool()
│  ├─ Test flow syntax
│  └─ Validate cross-references
│
└─ [LATER] Priority 2-3 Tool Enrichment (2-3h per batch)
   ├─ Tools 6-15 (high-use multi-package tools)
   ├─ Tools 16-35 (single-package, analysis-critical tools)
   └─ Optional: fill in remaining 90 tools as needed
```

**Total critical path:** ~4-5 hours → agents operational with tool packages + MCP gateway patterns

**Validation after completion:**
- All 22 agent files reference valid packages
- All flow files use call_tool() syntax (no direct imports)
- Documentation links work (no broken cross-refs)
- Agents can load tool knowledge on-demand without startup bloat

---

## 📁 File Structure (Final State)

```
.claude/
├── tools/                          # 125 boilerplate docs
│   ├── send_telegram.md            # ✅ Enriched (Priority 1)
│   ├── post_agent_signal.md        # ✅ Enriched (Priority 1)
│   ├── get_cycle_bootstrap.md      # ✅ Enriched (Priority 1)
│   ├── log_agent_work.md           # ✅ Enriched (Priority 1)
│   ├── submit_feedback.md          # ✅ Enriched (Priority 1)
│   ├── get_watchlist.md            # 🟡 Boilerplate (Priority 2)
│   ├── ... (120 more)
│   └── sequential_market_analysis.md
│
├── tools-package/                  # 11 packages
│   ├── bootstrap/
│   │   ├── index.md                # Package overview
│   │   └── get_cycle_bootstrap.md  # Stub
│   ├── alert-control/              # 16 tools
│   ├── digest-synthesis/           # 47 tools
│   ├── ... (8 more)
│
├── agents/
│   ├── alert-commander.md          # [TODO] Add tools_packages: [bootstrap, alert-control, ...]
│   ├── news-scout.md               # [TODO] Wire to packages
│   ├── ... (20 more)
│
└── flows/
    ├── alert-commander/
    │   └── main.md                 # [TODO] Replace tools with call_tool()
    ├── developer/
    └── ... (20+ flow files)
```

---

## 💾 Validation Checklist Before Proceeding

- [ ] All 125 tools have boilerplate docs in `.claude/tools/`
- [ ] All 11 packages have `index.md` + stubs in `.claude/tools-package/`
- [ ] Priority 1 tools enriched (send_telegram, signals, bootstrap, log, feedback)
- [ ] Ready to wire agents (Task #4)
- [ ] Ready to refactor flows (Task #5)

---

## 🎯 What You Have Ready Right Now

- ✅ Complete tool documentation structure (boilerplate + Priority 1 enriched)
- ✅ Package organization (11 folders, ready for agent reference)
- ✅ MCP tool catalog (all 125 tools documented with signatures)
- ✅ Decision guide (priority list for manual enrichment)

## What's Next

**Proceed with Task #4 & #5 now?** Or would you like to:
1. Enrich more Priority 2 tools first (high-use analysis tools)?
2. Jump straight to agent wiring (keep enrichment parallel)?
3. Review any specific tool documentation before proceeding?

