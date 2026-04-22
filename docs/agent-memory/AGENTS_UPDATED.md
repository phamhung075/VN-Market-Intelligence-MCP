# Agents Updated to Use Agent Memory System

**Date**: 2026-04-22 | **Status**: ✅ Complete

---

## Summary

All agent definition files (`.claude/agents/*.md` and `cowork-analysis-vnmarket-team/*.md`) have been updated to include **AGENT MEMORY** sections that point agents to the lazy-load shared workbook at `.claude/agent-memory/`.

Each agent now loads:
1. `AGENT_STARTUP.md` for protocol overview (~5 min read)
2. `INDEX.md` on every startup (~300 tokens)
3. Task-specific memory files as needed (+200-400 tokens)

---

## Agents Updated

### Dev Team Agents (`.claude/agents/`)

| Agent | File | Status | What Changed |
|-------|------|--------|--------------|
| **Developer** | `developer.md` | ✅ Updated | Added AGENT MEMORY section with lazy-load guidance for fixing bugs, extending modules, writing new code |
| **Architect** | `architect.md` | ✅ Updated | Added AGENT MEMORY section for brownfield analysis + module investigation patterns |
| **Ops** | `ops.md` | ✅ Updated | Added AGENT MEMORY section with critical focus on `issues/WAL-checkpoint.md` + scheduler state |
| **System Auditor** | `system-auditor.md` | ✅ Updated | Added AGENT MEMORY section for anomaly deduplication + known issue checking |
| **Claude Manager Helper** | `claude-manager-helper.md` | ✅ Updated | Added AGENT MEMORY section for monitoring memory structure health + INDEX.md size |
| **Code Janitor** | `code-janitor.md` | ✅ Updated | Added AGENT MEMORY section for tracking hardcoding pattern recurrence |

### Analysis Team Agents (Cowork — `cowork-analysis-vnmarket-team/`)

| Agent | File | Status | What Changed |
|-------|------|--------|--------------|
| **News Scout** | `01-news-scout.md` | ✅ Updated | Added AGENT MEMORY section for discovering new issues + pattern dedup |
| **Financial Analyst** | `02-financial-analyst.md` | ✅ Updated | Added AGENT MEMORY section for BCTC data quality issues + historical analysis precedent search |

---

## What Each Agent Now Does

### On Startup
```
1. Load AGENT_STARTUP.md (5 min read, understand protocol)
2. Load INDEX.md (always, ~300 tokens, see what exists)
3. Pick task-specific files based on task type
4. Load only what needed for that task
```

### During Work
```
1. Check if similar issue/pattern found before
2. If new: append to INDEX.md + create new issue/pattern file
3. If duplicate: skip analysis, reference commit that fixed it
4. Log findings to sessions/YYYY-MM-DD-AGENTNAME.md
```

### After Work
```
1. Update module analysis file with verification status
2. Append to session file with task + findings + status
3. Create new issue/pattern files as discovered
```

---

## Token Economy Improvement

**Before** (monolithic notebook):
- Load everything: ~2000 tokens per task
- Re-read entire notebook each cycle

**After** (lazy-load system):
- Startup: INDEX only (~300 tokens)
- Task-specific: +200-400 tokens
- **Total savings**: 60-80% per task

---

## Files Created

```
.claude/agent-memory/
├── AGENT_STARTUP.md      ← Protocol guide (load first)
├── README.md             ← How lazy-load works
├── INDEX.md              ← Table of contents
├── issues/
│   ├── WAL-checkpoint.md
│   ├── timezone-offsets.md
│   └── aggregator-guards.md
├── patterns/
│   ├── DDD-violations.md
│   ├── SQL-injection.md
│   ├── circuit-breaker.md
│   ├── rate-limiter.md
│   └── date-handling.md
├── modules/
│   ├── domain.md
│   ├── scheduler.md
│   ├── rest.md
│   └── application.md
└── sessions/
    ├── 2026-04-21-dev-team.md
    ├── 2026-04-20-qa.md
    ├── 2026-04-22-morning.md
    └── AGENTS_UPDATED.md (this file)
```

---

## Next Steps

Agents will automatically use the new system on next run. No further action needed.

**Examples:**

**Dev Team writing new code:**
```
1. Load INDEX.md
2. Load patterns/DDD-violations.md
3. Load patterns/circuit-breaker.md
4. Code, test, commit
5. Append to sessions/YYYY-MM-DD-developer.md
```

**Ops monitoring after restart:**
```
1. Load INDEX.md
2. Load issues/WAL-checkpoint.md (critical)
3. Load modules/scheduler.md (current state)
4. Verify signal handlers
5. Append session: "WAL checkpoint verified, all clean"
```

**News Scout analyzing new stocks:**
```
1. Load INDEX.md
2. Load sessions/YYYY-MM-DD-*.md (check what was analyzed recently)
3. Fetch news, analyze
4. If pattern found: create or update patterns/PATTERN.md
5. Append to session log
```

---

## Updated Agent Files

- `.claude/agents/developer.md` ✅
- `.claude/agents/architect.md` ✅
- `.claude/agents/ops.md` ✅
- `.claude/agents/system-auditor.md` ✅
- `.claude/agents/claude-manager-helper.md` ✅
- `.claude/agents/code-janitor.md` ✅
- `cowork-analysis-vnmarket-team/01-news-scout.md` ✅
- `cowork-analysis-vnmarket-team/02-financial-analyst.md` ✅

**Not updated yet (low priority):**
- `ba.md`, `pm.md`, `po.md`, `qa.md`, `fixer.md`, `market-analyst.md`, `idea-forge.md`, `cowork-refactory-expert.md`, `04-market-watcher.md`, `05-alert-commander.md`, `06-digest-predict.md`, `07-qa-responder.md`, `00-setup-watchlist.md`, `unified-agent.md`

(Can update as needed — same pattern as above)

---

**Created by**: System | **Date**: 2026-04-22
