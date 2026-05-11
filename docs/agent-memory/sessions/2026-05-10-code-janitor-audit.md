# Code Janitor Session — SSOT Conflict Audit (2026-05-10)

**Scope:** Hardcoded volatile counts in meta-configuration files
**Duration:** 00:00–00:15 VN
**Quality:** Full (6 violations identified, 0 shipped directly, 6 backlog tasks created)

---

## Findings

All 6 hardcoded volatile counts found in protected configuration files (agent .md, knowledge .md, flow .md). Cannot edit directly per role constraints. Recommend agent-father handle rewording.

### JANITOR-028 — Dev MCP Server tool count hardcoded

**File:** `.claude/agents/dev-mcp-server.md`
**Lines:** 4, 13
**Pattern:** "112 tools" (outdated; actual = 132 per project-stats.json)
**Impact:** Agent description becomes stale after each tool add/remove
**Fix:** Remove hardcoded count, replace with "orchestrates MCP tools" (generic)
**Ship directly:** No — agent .md files require agent-father approval

---

### JANITOR-029 — Cloudflare MCP flow tool count hardcoded

**File:** `.claude/flows/ops/cloudflare-mcp.md`
**Line:** 13, 29
**Pattern:** "Full 112 tools available" + health check expected `"tools":112`
**Impact:** Documentation becomes incorrect after tool count changes
**Fix:** Remove hardcoded count from line 13; update health check expectation to omit count
**Ship directly:** No — flow files require developer/ops approval

---

### JANITOR-030 — Agent Models README hardcoded dev team count

**File:** `.claude/AGENT_MODELS_README.md`
**Lines:** 15, 28
**Pattern:** "All 13 agents" (count of dev-team agents; actual variable per mode)
**Impact:** Misleading after agent creation/removal
**Fix:** Replace "All 13 agents" with "All dev-team agents" (unquantified)
**Ship directly:** No — meta-config file

---

### JANITOR-031 — Agent Roster analysis team count mismatch

**File:** `.claude/knowledge/agent-roster.md`
**Line:** 5 says "7 agents"; line 102 says "8 agents"
**Pattern:** Conflicting counts for Analysis Team (Cowork)
**Audit:** Line 102 correct (Unified Coordinator + 7 numbered agents = 8). Line 5 stale.
**Fix:** Line 5: "7 agents" → "8 agents"
**Ship directly:** No — knowledge file

---

### JANITOR-032 — Alert Commander max_alerts_per_day duplicates alert-policy.md

**File:** `.claude/agents/alert-commander.md`
**Line:** 50
**Pattern:** `max_alerts_per_day: 10` (also in alert-policy.md as hardcoded threshold)
**Impact:** Two edit points for same business rule
**Fix:** Remove hardcoded value, add comment pointer to alert-policy.md
**Ship directly:** No — agent .md files

---

### JANITOR-033 — Project stats analysis agent count error

**File:** `docs/data/project-stats.json`
**Line:** 19
**Pattern:** `"analysisAgentCount": 9` (audit: actual = 8 agents)
**Analysis:** Count includes Setup (00) as agent; should not. Unified Coordinator + 7 numbered = 8.
**Fix:** Line 19: 9 → 8
**Ship directly:** Yes — single-file, mechanical fix. JSON count-field update covered by project-stats tests.

---

## Actions

### Direct Fixes (Shipped)
- ✅ Fixed `docs/data/project-stats.json` line 19: analysisAgentCount 9 → 8

### Backlog Tasks Created
1. **JANITOR-028** — Dev MCP Server description: remove "112 tools" hardcoding
2. **JANITOR-029** — Cloudflare ops flow: remove hardcoded tool count from health check docs
3. **JANITOR-030** — Agent Models README: replace "All 13 agents" with unquantified wording
4. **JANITOR-031** — Agent Roster: fix line 5 "7 agents" → "8 agents"
5. **JANITOR-032** — Alert Commander: add pointer comment to alert-policy.md for max_alerts_per_day
6. (No new task) JANITOR-033 — project-stats.json fixed directly (see Shipped)

**Quality:** 1 shipped, 5 proposed backlog

---

## Notebook Entry

### Scan 16 (2026-05-10 00:00–00:15 VN) — Hardcoded volatile counts in meta-config

| Check | Result | Notes |
|-------|--------|-------|
| Agent .md files | 3 violations | dev-mcp-server.md (2 lines), alert-commander.md (1 line) + agent-roster.md (1 line) |
| Flow .md files | 1 violation | cloudflare-mcp.md (lines 13, 29) |
| Knowledge .md files | 0 findings | — |
| JSON data files | 1 violation | project-stats.json analysisAgentCount |
| Meta-docs | 1 violation | AGENT_MODELS_README.md (lines 15, 28) |

**Summary:** 6 violations found. 1 shipped (project-stats.json). 5 proposed backlog (require agent-father or flow owner approval).

**Constraint hit:** Agent .md, flow .md, knowledge .md files are protected from direct edits. Role permits JSON data updates only.

**Next:** Agent-father to review backlog tasks and approve rewording.
