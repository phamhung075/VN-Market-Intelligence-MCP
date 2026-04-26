# Agent Memory Startup Protocol

> **Every agent loads this on startup.** Takes ~5 min, saves tokens later.

**CRITICAL: Before creating ANY file or memory record, follow the decision tree in `CLAUDE.md` → "File Organization" section.**

---

## 🚀 Your Task: Load Only What You Need

### Step 1: Query Your Memory Files via MCP (REQUIRED, zero file reads)

All agents use **MCP tools** to discover memory files dynamically. Two options:

**Option A: Task-based lookup** (recommended for most agents)
```typescript
get_memory_files(agent_name="your-name", task_type="your-task")
// Returns: ["issues/WAL-checkpoint.md", "modules/scheduler.md", ...] + front-matter metadata
```

**Option B: Trigger-based search** (when you're investigating a specific topic)
```typescript
search_memory_by_trigger("trigger-tag")
// Returns: all files tagged with that trigger + metadata
```

**Dev Team agents** (po, developer, qa, architect, ops, ba, system-auditor, etc.):
- Use `get_memory_files(agent_name="yourname", task_type="your-task-type")`
- Example: `get_memory_files("developer", "fixing-bug")` → returns exact files needed
- No manifest file reads needed

**Analysis Team agents** (News Scout, Financial Analyst, Market Watcher, Alert Commander, Digest, QA Responder, Unified):
- Use existing `get_cycle_bootstrap(agent_name="your-name")` (already available)
- Use `search_memory_by_trigger("trigger-tag")` if you need to find related patterns during analysis
- Example: `search_memory_by_trigger("signal-validation")` during signal construction

### Step 2: Load Only Files Returned by the MCP Tool (+200-400 tokens)

Once you have the file list from Step 1:

1. Read ONLY the files returned by the MCP tool
2. Each file has front-matter metadata (`agents:` and `trigger:` tags) showing who uses it and when
3. Load in order of relevance to your task
4. No other files needed

**Example (Developer fixing a bug):**
```
1. Call: get_memory_files("developer", "fixing-bug")
2. Returns: ["issues/WAL-checkpoint.md", "modules/scheduler.md"]
3. Load those two files only
4. Done. No manifest reading, no INDEX, no exploration.
```

**Example (Market Watcher during signal validation):**
```
1. Already called: get_cycle_bootstrap(agent_name="market-watcher")
2. During signal construction, also call: search_memory_by_trigger("signal-validation")
3. Returns: ["modules/signalBuilders.md", "patterns/signal-payload-quality.md", ...]
4. Load relevant file to refresh on signal construction patterns
```

---

## 📋 Agent Loading Flow (MCP-Based)

```
START
  ↓
What's your agent type?
  ├─ Analysis Team?
  │  └─ Call get_cycle_bootstrap() [MCP, zero file reads]
  │     └─ During work: call search_memory_by_trigger(trigger) if needed
  │
  └─ Dev Team?
     └─ Call get_memory_files(agent_name, task_type) [MCP, zero file reads]
        ↓
        Returns: ["file1.md", "file2.md", ...] + metadata
        ↓
        Load listed files only (~200-400 tokens)

        DONE. No manifest reads, no INDEX, no exploration.
```

**Total per agent startup: ~200-400 tokens** (vs. ~370-470 with manifest files, vs. ~1,700-2,700 before any optimization)

---

## 🔄 Update Protocol (When You Finish Work) — MCP Tools

**All agents use MCP tools to UPDATE memory** (no Write tool usage):

### Tool 1: `append_session_record`

```
Input:  agent_name, task_name, finding?, fix?, status?, duration?
Output: ✅ confirmation + file path
```

Call at end of session:
```typescript
append_session_record({
  agent_name: "developer",
  task_name: "Task 1300b: Memory Update Tools",
  finding: "Agents previously used Write tool for memory updates",
  fix: "Implemented append_session_record MCP tool for safe, validated updates",
  status: "Ready for QA",
  duration: "14:30–15:45 UTC"
})
```

Creates or appends to: `sessions/YYYY-MM-DD-{agent_name}.md`

### Tool 2: `update_memory_file`

```
Input:  record_type, action, filename, title, content, agents?, trigger?
Output: ✅ confirmation + file path
```

Use to create or update issue/pattern/module files:
```typescript
update_memory_file({
  record_type: "issue",
  action: "create",
  filename: "test-isolation-failure",
  title: "Issue: Test Isolation Failure When Reused DB",
  content: "Root cause: test1 creates table, test2 expects empty schema...",
  agents: ["developer", "qa"],
  trigger: ["testing", "db-isolation"]
})
```

Creates: `issues/test-isolation-failure.md` with front-matter

---

## Legacy Update Protocol (Before MCP Tools)

### Found a bug?
Call `update_memory_file()` with:
```typescript
{
  record_type: "issue",
  action: "create",  // or "update" if exists
  filename: "bugname",
  title: "Issue: [Bug name]",
  content: "What broke:\n\nSymptom:\n\nRoot cause:\n\nSolution:\n\nPrevention:",
  agents: ["your-team"],
  trigger: ["debugging", "bugfix"]
}
```

### Found a pattern?
Call `update_memory_file()` with:
```typescript
{
  record_type: "pattern",
  action: "create",
  filename: "patternname",
  title: "Pattern: [Name]",
  content: "What breaks:\n\nExample (bad):\n\nExample (good):\n\nPrevention:",
  agents: ["developer"],
  trigger: ["pattern", "prevention"]
}
```

### Analyzed a module?
Call `update_memory_file()` with:
```typescript
{
  record_type: "module",
  action: "create",  // or "update"
  filename: "modulename",
  title: "Module: [Name]",
  content: "Status:\n- ✅ [verified]\n\nFiles checked:\n\nKnown issues:\n\nNext tasks:",
  agents: ["architect", "developer"],
  trigger: ["module-analysis"]
}
```

### Finished a work session?
Call `append_session_record()` MCP tool (see above) — don't manually write files.

---

## ⚡ Examples by Agent Type

### Dev Team — Developer Starting New Scheduler Job
```
1. Call: get_memory_files("developer", "writing-scheduler")
   → Returns: ["patterns/date-handling.md", "modules/scheduler.md"]
2. Load those files (~300 tokens)
3. Code + test
4. Append to: sessions/2026-04-23-developer.md
   - Task: "Add daily cache job"
   - Finding: "Timezone handling needs UTC-explicit flags"
   - Status: "Ready for QA"
Total context: ~300 tokens (vs. 370 with manifest file, vs. 900+ before any optimization)
```

### Analysis Team — Market Watcher Starting Daily Cycle
```
1. Call: get_cycle_bootstrap(agent_name="market-watcher")
   → Returns: agent_signals + market_context + system_status in one MCP call
2. During signal construction, if validating a chain:
   - Call: search_memory_by_trigger("signal-validation")
   - Returns: ["modules/signalBuilders.md", "patterns/signal-payload-quality.md"]
   - Load if needed (~200 tokens)
3. Fetch prices, check for anomalies
4. Post to signal bus: post_agent_signal(...)
5. Done. Zero file reads unless validation pattern check needed.
Total context: ~500 tokens from MCP (vs. 1,700+ with file reads)
```

### Dev Team — Ops Restarting Server
```
1. Call: get_memory_files("ops", "server-restart")
   → Returns: ["issues/WAL-checkpoint.md", "modules/scheduler.md"]
2. Load those files (~300 tokens)
3. Run: docker-compose restart mcp-server  # Docker since 2026-04-25 (Sprint 1336)
4. Verify: WAL checkpoint ran (check logs)
5. Append: sessions/2026-04-23-ops.md "Server restart OK, WAL clean"
Total context: ~300 tokens (vs. 320 with manifest file, vs. 1,200+ before any optimization)
```

---

## 🚫 What NOT to Do

❌ Load all issues at once
❌ Load all patterns at once
❌ Load all modules at once
❌ Load all sessions at once
❌ Update monolithic files (they don't exist)
❌ Read manifests manually — use MCP tools instead
❌ Load INDEX.md as startup (now obsolete)

---

## 🎯 Token Math (MCP Tools vs Old Approaches)

| Approach | Tokens | Savings |
|----------|--------|---------|
| **Phase 1: Before any optimization** | | |
| INDEX.md + exploration | 300-400 | — |
| + 2-3 task files | +300-400 | — |
| **Total (Phase 1)** | ~600-800 tokens | baseline |
| | | |
| **Phase 2: Manifest files** | | |
| Manifest (developer.md) | 70 | -230 |
| + 2-3 task files | +300-400 | — |
| **Total (Phase 2)** | ~370-470 tokens | **-38% per agent** |
| | | |
| **Phase 3: MCP Tools (NOW)** | | |
| get_memory_files() call | 0 (MCP) | -70 |
| + 2-3 task files | +300-400 | — |
| **Total (Phase 3)** | ~300-400 tokens | **-50% per agent** |
| | | |
| **Per-cycle savings (5 agents)** | | |
| Phase 1: 5 × 700 = 3,500 | 3,500 | — |
| Phase 3: 5 × 350 = 1,750 | 1,750 | **-1,750 tokens/cycle** |

**Result: 50% savings per agent startup cycle across the team. MCP tools eliminate manifest file reads entirely.**

---

## 🔗 Remember

- **Use MCP tools, not file reads** — `get_memory_files()` and `search_memory_by_trigger()` are your entry point
- **Load only what you need** — task-focused, token-efficient
- **Update small focused files** — not giant notebooks
- **Append to sessions** — log what you learned so next agent doesn't redo work

**This protocol = MCP-based discovery + dynamic file routing + less wasted tokens + more learned patterns = faster future work**

---

## 🔧 MCP Tools Reference

Four tools now available for agent memory (Task 1300a-b):

**Discovery Tools** (read-only):
1. **`get_memory_files(agent_name, task_type)`** — Load files for a task
2. **`search_memory_by_trigger(trigger)`** — Find files by trigger tag

**Update Tools** (write operations):
3. **`append_session_record(agent_name, task_name, ...fields)`** — Log session work
4. **`update_memory_file(record_type, action, filename, ...content)`** — Create/update issue/pattern/module

---

**Updated**: 2026-04-23 | **Version**: 2.0 (MCP-based routing)
