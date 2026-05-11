# SSOT Refactoring Plan — Team Formation & Tools

**Date:** 2026-05-11  
**Status:** Plan (not yet executed)  
**Scope:** Deduplicate TEAM FORMATION and TOOLS across codebase, establish canonical SSOT files, replace duplicates with pointers.

---

## Executive Summary

**Duplication clusters identified:** 3 major + 2 minor  
**Estimated lines saved:** ~180–220 lines (MD + JSON)  
**Risk level:** LOW — pointer-only changes, no logic refactoring  
**Execution dependencies:** tree-map.md DAG already enforced; project-stats.json already SSOT for counts

---

## Duplication Inventory

### CLUSTER 1: Two-Team Architecture (Analysis + Dev)

| Concept | Current Locations | Drift Status | Lines |
|---------|-------------------|--------------|-------|
| **Two-team diagram** | `docs/AI_TEAM_DESIGN.md` § Two-Team Architecture (lines 3–16) | DRIFT | 14 |
| | `.claude/knowledge/agent-roster.md` § Two-Team Architecture (lines 99–111) | DRIFT | 13 |
| | `docs/architecture/global.md` § Two-Team Architecture (lines 84–95) | EXACT DUP | 12 |
| **Analysis Team agent list** | `docs/AI_TEAM_DESIGN.md` § Analysis Team (lines 30–45) | DRIFT | 16 |
| | `.claude/knowledge/agent-roster.md` § Analysis Team (lines 5–19) | EXACT DUP | 15 |
| **Dev Team agent list** | `.claude/knowledge/agent-roster.md` § Dev Team (lines 21–41) | EXACT DUP | 21 |
| | `docs/AI_TEAM_DESIGN.md` § Dev Team (lines 55–69) | EXACT DUP | 15 |
| **Three-channel rules** | `docs/AI_TEAM_DESIGN.md` § Three-Channel Rules (lines 20–28) | UNIQUE | 9 |
| | MISSING from `.claude/knowledge/agent-roster.md` | — | — |

**Drift Examples:**
- `docs/AI_TEAM_DESIGN.md` says "8 agents on Claude Cowork" (line 32); `.claude/knowledge/agent-roster.md` says "7 agents" (line 5, comments say "8 total" but lists 7 numbered).
- Agent count discrepancy: AI_TEAM_DESIGN lists `02-bctc-collector.md` + `03-report-analyzer.md`; agent-roster lists `02-financial-analyst.md` + merged System Improver note.

**Total duplication:** ~95 lines of near-identical content split across 3 files.

---

### CLUSTER 2: Agent Routing Table (Intent → Agent spawn)

| Concept | Current Locations | Drift Status | Lines |
|---------|-------------------|--------------|-------|
| **Agent routing matrix** | `CLAUDE.md` § Agent Routing (lines 15–33) | UNIQUE | 19 |
| | MISSING from all knowledge/architecture files | — | — |

**Issue:** CLAUDE.md hosts the canonical routing table but it's never referenced in agent initialization. No knowledge file pointer, no lazy-load trigger. When routing requirements change (e.g., new agent type), CLAUDE.md is only source — risk of orphaned intent assignments.

**Lines:** 19 (candidate for extraction to knowledge file with CLAUDE.md pointer).

---

### CLUSTER 3: MCP Tools List & Tool-Per-Agent Mapping

| Concept | Current Locations | Drift Status | Lines |
|---------|-------------------|--------------|-------|
| **Tool count reference** | `docs/data/project-stats.json` (SSOT, line 14: toolCount=132) | CANONICAL | 1 |
| | `.claude/knowledge/mcp-tools.md` § Tool Count & List (lines 50–54) | POINTER | 5 |
| | `docs/AI_TEAM_DESIGN.md` (line 75: "Tool count → docs/data/tool-registry.json") | DRIFT | 1 |
| | `docs/architecture/global.md` (line 13, correct pointer) | POINTER | 1 |
| **Tools per agent table** | `.claude/knowledge/mcp-tools.md` § Tools Per Agent (lines 74–86) | UNIQUE | 13 |
| | MISSING from agent .md files (tool lists not inlined, as designed) | — | — |
| **Tool renamed/removed list** | `.claude/knowledge/mcp-tools.md` § Renamed/Removed Tools (lines 56–72) | UNIQUE | 17 |
| | MISSING from all other files | — | — |

**Drift Detail:**
- `docs/AI_TEAM_DESIGN.md` line 75 says "Tool count → docs/data/tool-registry.json" but should say "→ docs/data/project-stats.json" (tool-registry.json has list only, not count).
- `.claude/knowledge/mcp-tools.md` line 54 references `tool-registry.json` for live count; actual count lives in `project-stats.json`.

**Lines to consolidate:** ~5 (pointer alignment only; tool lists are appropriate in knowledge file).

---

### CLUSTER 4 (Minor): Scheduled Jobs & Cron References

| Concept | Current Locations | Drift Status | Lines |
|---------|-------------------|--------------|-------|
| **Cron schedule pointer** | `docs/AI_TEAM_DESIGN.md` (line 76: "Scheduled jobs → .claude/knowledge/cron-jobs.md") | CORRECT POINTER | 1 |
| | `docs/architecture/global.md` (line 95: "Cron schedule: .claude/knowledge/cron-jobs.md") | CORRECT POINTER | 1 |
| | `.claude/knowledge/agent-roster.md` § Dev team cron workflow (lines 61–64) | PARTIAL DETAIL | 4 |

**Status:** Already compliant with tree-map.md. No action needed — these are appropriate pointers to the knowledge file.

---

### CLUSTER 5 (Minor): Handoff Protocol Context

| Concept | Current Locations | Drift Status | Lines |
|---------|-------------------|--------------|-------|
| **Task handoff file structure** | `.claude/knowledge/agent-roster.md` § Handoff Protocol (lines 83–97) | UNIQUE | 15 |
| | MISSING from all other files | — | — |

**Status:** Specific enough to belong in agent-roster.md (agent coordination detail). No duplication. No action needed.

---

## Proposed SSOT Plan

### Canonical Locations (Targets)

#### 1. **Team Formation SSOT: `.claude/knowledge/agent-roster.md`** ← PRIMARY

**Keep/enhance in this file:**
- Full Analysis Team roster (expand to clarify 8 agents if coordinator separate)
- Full Dev Team roster
- Microservice Dev agents (already here, lines 43–57)
- Two-team architecture diagram (consolidate from all sources)
- Three-channel rules (move from AI_TEAM_DESIGN.md)
- Agent cooperation signals flow (already here, lines 70–81)
- Handoff protocol (already here, lines 83–97)

**New sections to add:**
- Agent Routing Intent Table (moved from CLAUDE.md § Agent Routing)
- Clarify Unified Coordinator status (is it 7th or coordinator outside the 8?)

**Final size estimate:** ~150 lines (vs current ~112)

---

#### 2. **Tools SSOT: `.claude/knowledge/mcp-tools.md`** ← ALREADY PRIMARY

**Keep (no changes):**
- Tool count & list (lines 50–54) — pointers to project-stats.json ✓
- Tools per agent table (lines 74–86) ✓
- Renamed/removed tools list (lines 56–72) ✓
- Mandatory agent patterns (lines 94–111) ✓
- Inter-agent signal types (lines 124–137) ✓

**Fix (align pointers):**
- Line 54: change `tool-registry.json` → `project-stats.json` for count

**Final size:** No change (5–7 line edit)

---

#### 3. **Agent Routing SSOT: NEW `.claude/knowledge/agent-routing.md`**

**Extract from:** CLAUDE.md § Agent Routing (lines 15–33)

**Content:**
- Intent → Agent spawn table (canonical, unchanged)
- Procedural prompt handling rule
- Routing principles (never execute steps yourself, spawn the agent)

**Size:** ~18 lines

**Why new file:** Allows lazy-load by agents that need to validate their routing; CLAUDE.md stays slim; decouples routing logic from project context.

---

### File-by-File Changes

#### A. `docs/AI_TEAM_DESIGN.md` (currently 78 lines)

**Remove (move to agent-roster.md):**
- § Two-Team Architecture (lines 3–16) → REPLACE with: "→ see `.claude/knowledge/agent-roster.md` § Two-Team Architecture"
- § Three-Channel Rules (lines 20–28) → REPLACE with: "→ see `.claude/knowledge/agent-roster.md` § Three-Channel Rules"
- § Analysis Team (lines 30–45) → REPLACE with: "→ see `.claude/knowledge/agent-roster.md` § Analysis Team"
- § Dev Team (lines 55–69) → REPLACE with: "→ see `.claude/knowledge/agent-roster.md` § Dev Team"

**Keep (design narrative, not duplication):**
- Problem Reporting Flow (lines 48–53) — TA-specific workflow, belongs here
- MCP Server section header + tool/cron pointers (lines 71–78) — correct; keep

**Result:** ~15 lines remain; mostly pointers and design context. New size: ~25 lines.

**Lines saved:** ~50

---

#### B. `docs/architecture/global.md` (currently 200+ lines)

**Remove (move to agent-roster.md):**
- § Two-Team Architecture (lines 84–95) table → REPLACE with pointer to agent-roster.md

**Keep (unchanged):**
- § MCP Gateway references (lines 99+) — architectural, not duplication
- Service port map, Docker topology, database isolation, microservice designs — all unique

**Result:** 1-line pointer edit. No size change overall.

**Lines saved:** ~10

---

#### C. `CLAUDE.md` (currently 86 lines)

**Remove (extract to agent-routing.md):**
- § Agent Routing (lines 15–33) → REPLACE with pointer: "→ see `.claude/knowledge/agent-routing.md`"

**Keep (unchanged):**
- Init, Main Terminal = Agent Switch, Communication Defaults, Commit Policy, Flows, Interdiction, Lazy Load

**Result:** ~52 lines remain (down from 86).

**Lines saved:** ~18

---

#### D. `.claude/knowledge/agent-roster.md` (currently 112 lines)

**Add (consolidate):**
- § Two-Team Architecture (expanded from AI_TEAM_DESIGN.md + current version, reconcile agent count)
- § Three-Channel Rules (from AI_TEAM_DESIGN.md)
- § Agent Routing (from CLAUDE.md, reformatted for reference style)

**Keep (unchanged):**
- All current sections (Analysis Team, Dev Team, Microservice agents, Signals, Handoff)

**Result:** ~150–160 lines (up from 112).

**Lines added:** ~38 (but offset by removals from other files)

---

#### E. `.claude/knowledge/mcp-tools.md` (currently ~138 lines)

**Fix only:**
- Line 54: change pointer from `tool-registry.json` → `project-stats.json`

**No size change.**

---

#### F. `.claude/knowledge/agent-routing.md` (NEW)

**Create with:**
- § Agent Routing Intent Table (from CLAUDE.md)
- § Procedural Prompts Rule
- § Routing Principles
- Lazy-load trigger: "When spawning agents or validating routing policy"

**Size:** ~20 lines

**Lines added to codebase:** +20

---

### Pointer Replacement Pattern

All removed sections → short pointer, 1–2 lines:

```markdown
## Two-Team Architecture

→ See `.claude/knowledge/agent-roster.md` § Two-Team Architecture for full team roster, cooperation signals, and handoff protocol.
```

---

## DAG Compliance Check

**Tree-map.md current state:**
```
CLAUDE.md (root)
  ├── .claude/knowledge/agent-roster.md ← Line 49 ✓
  │   └── [No children specified, adds three-channel rules + routing + two-team diagram]
  ├── .claude/knowledge/mcp-tools.md ← Line 28 ✓
  │   └── docs/data/tool-registry.json [pointer to project-stats for counts]
```

**No new parents or cycles introduced.** All new pointers follow parent → child direction.

**tree-map.md update needed:** Line 49 scope expansion:
```
OLD: ├── .claude/knowledge/agent-roster.md (team structure: analysis 8 + dev 13, cooperation flow, signal bus)
NEW: ├── .claude/knowledge/agent-roster.md (team structure: analysis 8 + dev 13, routing intent table, cooperation flow, handoff protocol, three-channel rules)
```

---

## Risk Assessment

| Risk | Mitigation | Severity |
|------|-----------|----------|
| Pointer indirection slows agent lookup | Pointers are 1-line, cached reads; no perf impact | LOW |
| Agent Routing moved out of CLAUDE.md | CLAUDE.md still points; lazy-load trigger in new file; developer uses MCP Search | LOW |
| Drift in agent roster if both files edited | Consolidation eliminates duplicates; tree-map.md enforces single source | LOW |
| AI_TEAM_DESIGN.md becomes mostly pointers | Acceptable; preserves design narrative (Problem Reporting, MCP Server sections) | LOW |

---

## Execution Checklist (for later phase)

1. **Create** `.claude/knowledge/agent-routing.md` (new 20-line file)
2. **Consolidate** agent-roster.md (add two-team, three-channel, routing; ~38 lines added)
3. **Consolidate** docs/architecture/global.md (1-line pointer edit)
4. **Strip** docs/AI_TEAM_DESIGN.md (50 lines removed, 4 pointers added; 15–25 lines remain)
5. **Strip** CLAUDE.md (18 lines removed, 1 pointer added; 52 lines remain)
6. **Fix pointer** mcp-tools.md (1-line edit)
7. **Update** tree-map.md (line 49 scope expansion + line 24 new child: agent-routing.md)
8. **Git commit:** "refactor(ssot): consolidate team-formation & tools — move duplicates to canonical knowledge files"

---

## Compliance Validation

After execution, verify:
```bash
# No hardcoded agent/team lists outside agent-roster.md
grep -r "Analysis.*Team.*agents\|Dev.*Team.*agents" docs/ CLAUDE.md 2>/dev/null | grep -v ".md → " | wc -l
# Should be 0 (only pointers allowed)

# No duplicate tool routing outside mcp-tools.md + project-stats.json
grep -r "toolCount\|132\|tool.*count" docs/architecture/ CLAUDE.md 2>/dev/null | grep -v ".json" | wc -l
# Should be 0–1 (only design narrative allowed)

# All pointers resolve
find . -name "*.md" -exec grep -l "→ see.*knowledge" {} \; | xargs -I {} sh -c 'grep "→ see" {} | cut -d" " -f4 | xargs test -f || echo "BROKEN: {}"'
# Should have no output
```

---

## Summary

**Total lines saved:** ~78 lines (AI_TEAM_DESIGN ~50, CLAUDE ~18, mcp-tools pointer ~5, misc ~5)  
**Total lines added:** ~38 (agent-roster consolidation) + ~20 (new routing file) = ~58  
**Net change:** ~−20 lines (duplication removal offset by new structural clarity)  
**Quality gain:** 3 canonical files (agent-roster, mcp-tools, agent-routing) vs 3 scattered duplicates; tree-map.md DAG tightened; pointer count reduced.

**Execution time:** ~30 min (edit 6 files, run git commit, validate tree)
