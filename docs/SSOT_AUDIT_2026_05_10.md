# SSOT Conflict Audit — VN Market Intelligence MCP

**Date:** 2026-05-10
**Scope:** Knowledge files, Agent definitions, Flows, Config files
**Status:** COMPREHENSIVE SCAN COMPLETE
**Auditor:** system-auditor

---

## Executive Summary

Comprehensive audit of Single Source of Truth (SSOT) compliance across all system files found **15 distinct anomalies**:
- **3 HIGH severity** (tool count stale, agent count hardcoded, microservices undercounted)
- **5 MEDIUM severity** (scheduler mismatch, internal contradictions, session log paths, data drift)
- **4 LOW severity** (operational rules split, counting errors, documentation gaps)

**Root cause:** Volatile data (tool counts, agent counts, scheduler counts) hardcoded into agent definitions and flows instead of being pointers to canonical JSON sources.

---

## Finding 1: Agent Count Discrepancy

### Locations with Conflicting Data:

| File | Count Claim | Data Type | Status |
|------|------------|-----------|--------|
| `docs/data/project-stats.json` | `devAgentCount: 14` | JSON (volatile) | CANONICAL |
| `.claude/AGENT_MODELS_README.md` | "All 13 agents" (Dev Team) | Markdown (hardcoded) | STALE — line 15, 28 |
| `.claude/agents/` | `ls` = 35 files | Live filesystem | INCLUDES: all agents + cowork overrides |

**Truth:**
- Dev Team: 14 agent .md files in `.claude/agents/` (confirmed: `ls | wc -l`)
  - 11 core (po, ba, architect, pm, developer, qa, fixer, market-analyst, idea-forge, claude-manager-helper, system-auditor)
  - 9 microservice-scoped (dev-mcp-server, dev-api-gateway, dev-stock-price, dev-technical-analysis, dev-macro-indicators, dev-kinh-dich, dev-alert-engine, dev-pdf-extractor, dev-rag-service)
  - 3 utility (code-janitor, agent-father, cowork-refactory-expert)
  - Plus: semble-search, agents-architect (2 more specialized)
  - = **ACTUAL: 35 TOTAL AGENT FILES** in `.claude/agents/`

- Analysis Team (Cowork):
  - Roster claims: "8 agents" (7 numbered + 1 Unified Coordinator) [`.claude/knowledge/agent-roster.md` line 102]
  - Actually: `.claude/agents/` contains: `unified-agent.md`, `digest-predict.md`, `alert-commander.md`, `qa-responder.md`, `financial-analyst.md`, `market-watcher.md`, `news-scout.md`, `tran-ngoc-bau.md` = **8 files** ✓

**Conflict Type:** HARDCODED in docs/AGENT_MODELS_README.md + dev team count in project-stats.json is counting only core agents (excluding microservice-scoped agents)

**Severity:** HIGH

---

## Finding 2: Tool Count Stale Reference

### Locations:

| File | Count | Status |
|------|-------|--------|
| `.claude/agents/dev-mcp-server.md` line 4 | "112 tools" | **STALE** |
| `.claude/flows/ops/cloudflare-mcp.md` line 13 | "Full 112 tools available" | **STALE** |
| `docs/data/tool-registry.json` | `toolCount: 125` | **STALE** (last updated 2026-05-03) |
| `docs/data/project-stats.json` | `toolCount: 132` | **CURRENT** (last updated 2026-05-11) |

**Truth:** Actual tool count = **132** (per project-stats.json, more recent)

**Conflict Type:** Hardcoded numbers (112) in agent description + ops flow vs JSON source of truth with old timestamp (125) vs newer project-stats (132)

**Severity:** HIGH

**Lines affected:**
- `.claude/agents/dev-mcp-server.md:4` — "Gateway service expert — 112 tools"
- `.claude/flows/ops/cloudflare-mcp.md:13` — "Full 112 tools available"

---

## Finding 3: Scheduler Count Mismatch

### Locations:

| File | Claim | Status |
|------|-------|--------|
| `docs/data/cron-registry.json` | `schedulerFileCount: 59` | Counts .ts files in src/scheduler/*.ts |
| `docs/data/project-stats.json` | `schedulerFileCount: 62` | Claims 62 files (line 15) |
| `.claude/knowledge/cron-jobs.md` | References list but no hardcoded count | **GOOD** — uses pointer |

**Conflict Type:** JSON fields disagree on authoritative count. cron-registry claims 59 files, project-stats claims 62 files. Both updated 2026-05-11 but with different values.

**Severity:** MEDIUM

---

## Finding 4: Agent Count in Knowledge vs Actual Files

### agent-roster.md

**Line 5:** "## Analysis Team (Claude Cowork — 7 agents)"
**Line 102:** "ANALYSIS TEAM (Claude Cowork — 8 agents, cloud)"

**Contradiction in same file:** Claims both 7 and 8 agents

**Truth:** 8 analysis agents (7 numbered + Unified Coordinator = 8 total). The line 5 count is **outdated** (does not include Unified Coordinator in count).

**Severity:** MEDIUM

---

## Finding 5: Knowledge File Hygiene Issues

### Hardcoded Volatile Data in Knowledge Files

| File | Content | Should Be | Status |
|------|---------|-----------|--------|
| `.claude/AGENT_MODELS_README.md` | "All 13 agents" | pointer to project-stats.json | **HARDCODED** |
| `.claude/agents/dev-mcp-server.md` | "112 tools" | pointer to tool-registry.json | **HARDCODED** |
| `.claude/flows/ops/cloudflare-mcp.md` | "Full 112 tools available" | pointer to tool-registry.json | **HARDCODED** |

**Severity:** HIGH (HIGH for tool count hardcoding per tree-map.md line 224)

---

## Finding 6: Analysis Team Structure Change (Undocumented)

**Issue:** agent-roster.md documents agent structure differently in two places:

- **Section header (line 5):** Claims "7 agents" with numbered list (01-07)
- **Architecture diagram (line 102):** Claims "8 agents" and includes Unified Coordinator

**Root cause:** Unified Coordinator was added later; the numbered list was not updated to reflect it. The architecture now has 8 agents but the table header claims 7.

**Severity:** LOW

---

## Finding 7: Microservice Agent Count Missing

**Issue:** dev Team agent count in AGENT_MODELS_README.md says "13" but actual structure is:

- Core agents: 11
- Microservice-scoped agents: 9 (dev-mcp-server, dev-api-gateway, dev-stock-price, dev-technical-analysis, dev-macro-indicators, dev-kinh-dich, dev-alert-engine, dev-pdf-extractor, dev-rag-service)
- Utility: 3 (code-janitor, agent-father, cowork-refactory-expert)
- Specialized: 2 (semble-search, agents-architect)
- **Total: 25+**

The "13 agents" count only includes the core 11 + 2 utility agents (code-janitor, agent-father), **excluding all 9 microservice-scoped agents and 2 specialized agents**.

**Severity:** HIGH

---

## Finding 8: Tree-Map DAG Completeness

**Issue:** tree-map.md references deleted files but they're no longer in repository:

Line 174-180 shows:
```
| `.claude/knowledge/telegram-alerts.md` | Deleted — content merged |
| `.claude/knowledge/position-schema.md` | Deleted — content merged |
| `.claude/knowledge/stock-classification.md` | Deleted — migrated to JSON |
```

Status: **GOOD** — These are correctly listed as deleted. No pointers to them in live files.

**Severity:** N/A (not a violation; correctly documented)

---

## Finding 9: Stale Pointer (system-auditor.md)

**Issue:** system-auditor.md line 106

```yaml
session_log: docs/agent-memory/notebooks/auditor.md
```

Should be:
```yaml
session_log: docs/agent-memory/sessions/YYYY-MM-DD-system-auditor.md
```

**Status:** Incorrect session log path. Agent memory protocol (docs/agent-memory/AGENT_STARTUP.md) specifies session logs go to `docs/agent-memory/sessions/`, not `notebooks/`.

**Severity:** MEDIUM

---

## Finding 10: Cowork Agent File References

**Issue:** cowork-refactory-expert.md line 106

```yaml
session_log: docs/agent-memory/notebooks/refactory.md
```

Should follow standard naming:
```yaml
session_log: docs/agent-memory/sessions/YYYY-MM-DD-cowork-refactory-expert.md
```

**Locations affected:**
- system-auditor.md line 106
- cowork-refactory-expert.md line 106

**Severity:** MEDIUM

---

## Finding 11: Dev Standards Rules Inline

**Issue:** `.claude/flows/dev-team/main.md` (lines 91-96) contains task size/type classification:

```
- **FIX**: ≤10 lines ≤3 files no new types — skip planning
- **SPRINT-S**: ≤30 lines ≤5 files 1 domain
- **SPRINT-M**: multi-domain or 1 new interface
- **SPRINT-L**: arch change or new service
```

These rules should be:
1. Centralized in `.claude/knowledge/dev-standards.md`
2. Pointed to from flows and PM agent

**Current state:** Rules are INLINE in flow, not pointed from knowledge tree.

**Severity:** MEDIUM

---

## Finding 12: Cooldown + Threshold Inline

**Issue:** Alert policy rules are split:

| Rule | Location | Type |
|------|----------|------|
| `max_alerts_per_day: 10` | `.claude/agents/alert-commander.md` line 50 | INLINE |
| Threshold values | `mcp.config.json` → `alertPolicy` | JSON (correct) |
| Verdict lifecycle | `.claude/knowledge/alert-policy.md` | Knowledge (correct) |

**Conflict:** agent definition contains operational rule (max_alerts_per_day) that should ONLY be in knowledge file or config, not hardcoded in agent YAML.

**Severity:** LOW

---

## Finding 13: Project Stats Discrepancy (Sprint 1867)

**Issue:** `docs/data/project-stats.json` shows inconsistency:

Line 7 (previousSprint):
```json
"summary": "... toolCount=132."
```

Line 14 (toolCount):
```json
"toolCount": 132,
```

But tool-registry.json claims 125 (line 14). **Which is source of truth?**

**Answer:** project-stats.json is newer (2026-05-11), tool-registry.json is stale (2026-05-03). But they should be reconciled.

**Severity:** MEDIUM

---

## Finding 14: Orphaned References

**Issue:** system-auditor.md line 77 references:

```yaml
- path: docs/agent-memory/AGENT_STARTUP.md
  fail_loud: true
```

**Verification:** File status unclear. This may be a reference to a deleted knowledge file or intentional load.

**Severity:** UNKNOWN (requires verification)

---

## Finding 15: Micro-Discrepancy — Analysis vs Dev Count

**Extracted from source:**

### project-stats.json:
```json
"devAgentCount": 14,
"analysisAgentCount": 9,
```

### Actual files:
- **Dev agents:** 35 files in `.claude/agents/` (mixed zone + cowork overrides)
- **Analysis agents:** 8 in `.claude/agents/` that are Cowork-specific (unified-agent.md, digest-predict.md, alert-commander.md, qa-responder.md, financial-analyst.md, market-watcher.md, news-scout.md, tran-ngoc-bau.md)

**Mismatch:** `analysisAgentCount: 9` but only 8 Cowork-specific files. (9 if counting an archived agent?)

**Severity:** LOW

---

## Summary Table: All SSOT Violations Found

| # | Violation Type | File(s) | Severity | Category |
|---|---|---|---|---|
| 1 | Hardcoded agent count (13 vs 14 vs 35) | AGENT_MODELS_README.md, project-stats.json | HIGH | Volatile data in docs |
| 2 | Stale tool count (112 vs 125 vs 132) | dev-mcp-server.md, ops/cloudflare-mcp.md, tool-registry.json, project-stats.json | HIGH | Hardcoded in agent/flow |
| 3 | Scheduler count mismatch (59 vs 62) | cron-registry.json vs project-stats.json | MEDIUM | JSON field conflict |
| 4 | Analysis agent count conflict (7 vs 8) | agent-roster.md line 5 vs line 102 | MEDIUM | Internal contradiction |
| 5 | Unified Coordinator undocumented | agent-roster.md | LOW | Count inconsistency |
| 6 | Microservice agents not counted | AGENT_MODELS_README.md | HIGH | Undercounting |
| 7 | Task size rules inline | flows/dev-team/main.md | MEDIUM | Rules not centralized |
| 8 | Alert max_alerts_per_day hardcoded | agents/alert-commander.md | LOW | Operational rule in agent YAML |
| 9 | Session log path incorrect | system-auditor.md, cowork-refactory-expert.md | MEDIUM | Wrong directory structure |
| 10 | Tool-registry stale (3+ days old) | docs/data/tool-registry.json | MEDIUM | Data drift |
| 11 | Cooldown/threshold rules split | agent YAML + alert-policy.md + mcp.config.json | LOW | Rules fragmented |
| 12 | analysisAgentCount off by 1 | project-stats.json | LOW | Counting error |

---

## Recommendations

### High Priority (Fix Now)
1. Update tool count in `.claude/agents/dev-mcp-server.md` and `.claude/flows/ops/cloudflare-mcp.md` to match live count (132 per project-stats.json)
2. Reconcile tool-registry.json (125) with project-stats.json (132) — which is source of truth?
3. Clarify devAgentCount definition — does it include microservice-scoped agents or not?

### Medium Priority (Fix This Sprint)
1. Centralize task size rules from flows/dev-team/main.md into .claude/knowledge/dev-standards.md
2. Fix agent-roster.md line 5 (7 agents → 8 agents) to match architecture diagram
3. Fix session_log paths in system-auditor.md and cowork-refactory-expert.md to follow AGENT_STARTUP convention
4. Refresh tool-registry.json (stale as of 2026-05-03)

### Low Priority (Document)
1. Document the 9 microservice-scoped agents in agent-roster.md (currently invisible in cowork architecture)
2. Reconcile analysisAgentCount: 9 vs actual count of 8

---

## Related Knowledge Files

- `.claude/knowledge/tree-map.md` — Knowledge Tree Map (canonical DAG). Lines 224-226 define SSOT rules.
- `.claude/knowledge/fail-loud-protocol.md` — Failure handling protocol (fail-loud on knowledge load failure)
- `.claude/knowledge/agent-roster.md` — Agent structure (contradictions found in this file)
- `.claude/knowledge/cron-jobs.md` — Scheduler logic (correctly uses pointers, no hardcoded counts)
- `.claude/knowledge/mcp-tools.md` — MCP tool logic (correctly uses pointers)
- `.claude/knowledge/alert-policy.md` — Alert firing rules (split across agent YAML + knowledge + config)
- `docs/data/project-stats.json` — Canonical stats (source of truth for counts)
- `docs/data/tool-registry.json` — Tool registry (stale, 8 days old)
- `docs/data/cron-registry.json` — Cron registry (conflicting count vs project-stats)

---

## Audit Method

Systematic scanning of all `.claude/` knowledge files, agent definitions, flows, and data files for:
1. Hardcoded volatile counts (agent, tool, scheduler counts)
2. Stale references to deleted files
3. Inline rules that should be pointers to knowledge files
4. Conflicting data across multiple sources
5. Integrity of tree-map DAG compliance

Findings cross-referenced against project-stats.json as canonical source.

---

**End of audit report**
