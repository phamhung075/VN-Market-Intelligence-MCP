# Agent Memory Startup Protocol

> **Every agent loads this on startup.** Takes ~5 min, saves tokens later.

---

## 🚀 Your Task: Load Only What You Need

### Step 1: Load Your Agent Manifest (REQUIRED, ~70 tokens)

**Dev Team agents** (po, developer, qa, architect, ops, ba, system-auditor):
```
Read: docs/agent-memory/manifests/YOURNAME.md
Takes: 1 min
Why: Tells you exactly what files to load for your task
```

**Analysis Team agents** (News Scout, Financial Analyst, Market Watcher, Alert Commander, Digest, QA Responder, Unified):
- Skip this step. Use `get_cycle_bootstrap()` MCP call instead (built-in, zero file reads).

### Step 2: Load Only Files Listed in Your Manifest (+200-400 tokens)

**If you're a DEV TEAM agent (po, ba, architect, pm, developer, qa, fixer, ops, market-analyst, code-janitor, system-auditor, claude-manager-helper):**

1. Load `docs/agent-memory/manifests/YOURNAME.md` (your agent-specific routing)
2. Look up your current task type in the manifest's table
3. Load only the files listed for that task type
4. No other files needed

**Example (Developer fixing a bug):**
- Load: `manifests/developer.md`
- Look up: "fixing-bug" row
- Load files: `issues/WAL-checkpoint.md` + `modules/scheduler.md`
- Done. No INDEX, no exploration, no wasted tokens.

**If you're an ANALYSIS TEAM agent (News Scout, Financial Analyst, Market Watcher, Alert Commander, Digest, QA Responder, Unified Coordinator):**

**Do NOT load files.** Instead:
1. Start your cycle with `get_cycle_bootstrap(agent_name="your-name")`
2. This MCP call returns `agent_signals` + `market_context` + `system_status` in one call
3. Use that for all your context needs
4. Agent-memory files are for dev team only

**If you're Ops, Code Janitor, or System Auditor:**
- Load your manifest first: `manifests/ops.md` or `manifests/system-auditor.md`
- Follow the table in your manifest for your task type
- No other routing needed

---

## 📋 Agent Loading Flow (Manifest-Based)

```
START
  ↓
What's your agent type?
  ├─ Analysis Team?
  │  └─ Call get_cycle_bootstrap() [MCP, zero file reads]
  │
  └─ Dev Team?
     └─ Load manifests/YOURNAME.md (~70 tokens)
        ↓
        What's your task?
        └─ Look it up in manifest table
           └─ Load listed files only (~200-400 tokens)

        DONE. No INDEX, no exploration.
```

**Total per agent startup: ~270-470 tokens** (vs. ~1,700-2,700 before manifests)

---

## 🔄 Update Protocol (When You Finish Work)

### Found a bug?
1. Check if `issues/BUGNAME.md` exists
2. If yes → Update it (status, commit hash, new prevention tips)
3. If no → Create new `issues/NEW-BUG.md` with:
   - What broke
   - Symptom
   - Root cause
   - Solution
   - Prevention checklist

### Found a pattern?
1. Check if `patterns/PATTERNNAME.md` exists
2. If yes → Add example, increment recurrence count
3. If no → Create new `patterns/PATTERN.md` with:
   - What breaks
   - Where it happens
   - Example (bad + good)
   - Prevention
   - How to fix

### Analyzed a module?
1. Update `modules/MODULE.md` with:
   - What you verified (✅/⚠️/❌)
   - Files you checked
   - Known issues
   - Next tasks

### Finished a work session?
1. Create or append to `sessions/YYYY-MM-DD-YOURNAME.md`:
   ```markdown
   ### Task: [Task name] (HH:MM–HH:MM VN)
   - **Finding**: [What you discovered]
   - **Fix**: [What you did]
   - **Status**: [Ready for merge / Testing / Pending]
   - **Updated memory**: [Which files changed]
   ```

---

## ⚡ Examples by Agent Type

### Dev Team — Developer Starting New Scheduler Job
```
1. Load: manifests/developer.md (~70 tokens)
2. Task: "writing-scheduler" → Load patterns/date-handling.md + modules/scheduler.md
3. Code + test
4. Append to: sessions/2026-04-23-developer.md
   - Task: "Add daily cache job"
   - Finding: "Timezone handling needs UTC-explicit flags"
   - Status: "Ready for QA"
Total context: ~370 tokens (vs. 900+ before manifests)
```

### Analysis Team — Market Watcher Starting Daily Cycle
```
1. Call: get_cycle_bootstrap(agent_name="market-watcher")
2. Returns: agent_signals + market_context + system_status in one MCP call
3. Fetch prices, check for anomalies using context
4. Post to signal bus: post_agent_signal(...)
5. Done. Zero file reads.
Total context: ~500 tokens from MCP (vs. 1,700+ with file reads)
```

### Dev Team — Ops Restarting Server
```
1. Load: manifests/ops.md (~70 tokens)
2. Task: "server-restart" → Load issues/WAL-checkpoint.md + modules/scheduler.md
3. Run: launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp
4. Verify: WAL checkpoint ran (check logs)
5. Append: sessions/2026-04-23-ops.md "Server restart OK, WAL clean"
Total context: ~320 tokens (vs. 1,200+ before manifests)
```

---

## 🚫 What NOT to Do

❌ Load all issues at once
❌ Load all patterns at once
❌ Load all modules at once
❌ Load all sessions at once
❌ Update monolithic files (they don't exist)
❌ Ignore the INDEX — always read it first

---

## 🎯 Token Math (Manifest vs Old Approach)

| Approach | Tokens | Savings |
|----------|--------|---------|
| **Old approach** | | |
| INDEX.md | 300 | — |
| + 2 task-specific files | +300 | — |
| **Total old** | ~600 tokens | baseline |
| | | |
| **New approach (manifest)** | | |
| Manifest (developer.md) | 70 | -230 |
| + 2 task-specific files | +300 | — |
| **Total new** | ~370 tokens | **-38% per task** |
| | | |
| **Per-cycle savings (5 agents)** | | |
| Old: 5 × 600 = 3,000 | 3,000 | — |
| New: 5 × 370 = 1,850 | 1,850 | **-1,150 tokens/cycle** |

**Result: 35–50% savings per agent startup cycle across the team.**

---

## 🔗 Remember

- **INDEX.md is your table of contents** — start here every time
- **Load only what you need** — task-focused, token-efficient
- **Update small focused files** — not giant notebooks
- **Append to sessions** — log what you learned so next agent doesn't redo work

**This protocol = less wasted tokens + more learned patterns = faster future work**

---

**Updated**: 2026-04-22 | **Version**: 1.0
