# Agent Memory Startup Protocol

> **Every agent loads this on startup.** Takes ~5 min, saves tokens later.

---

## 🚀 Your Task: Load Only What You Need

### Step 1: Load INDEX (REQUIRED, ~300 tokens)
```
Read: .claude/agent-memory/INDEX.md
Takes: 2 min
Why: Tells you what exists in memory + what to load next
```

### Step 2: Load Your Role's Memory (Task-specific, +200-400 tokens)

**If you're a DEV TEAM agent (po, ba, architect, pm, developer, qa, fixer, ops, market-analyst, code-janitor, system-auditor, claude-manager-helper):**

Load based on your task:
- **Fixing a bug?** → Load relevant `issues/*.md` file (e.g., `issues/WAL-checkpoint.md`)
- **Writing new code?** → Load relevant `patterns/*.md` files (e.g., `patterns/DDD-violations.md`)
- **Analyzing a module?** → Load `modules/MODULE.md` (e.g., `modules/scheduler.md`)
- **Starting fresh?** → Just load INDEX + latest `sessions/YYYY-MM-DD-*.md` to see what was done recently

**If you're an ANALYSIS TEAM agent (News Scout, Financial Analyst, Market Watcher, Alert Commander, Digest, QA Responder):**

Load based on your cycle:
- **Before analyzing stocks?** → Load `modules/scheduler.md` (recent fixes, patterns)
- **Before writing alerts?** → Load `patterns/circuit-breaker.md` + `patterns/rate-limiter.md`
- **Checking recent findings?** → Load latest `sessions/YYYY-MM-DD-*.md`

**If you're Ops, Code Janitor, or System Auditor:**
- Load INDEX + `modules/scheduler.md` (infrastructure concerns)
- Load `issues/WAL-checkpoint.md` (critical to operations)
- Check `patterns/date-handling.md` (common infrastructure bug)

---

## 📋 Memory Map (Pick What You Need)

```
Load INDEX.md first (~300 tokens)
        ↓
What's your task?
        ├─ Fixing a bug?
        │  └─ Load issues/BUGNAME.md (~150-200 tokens)
        │     + modules/MODULENAME.md (~100-150 tokens)
        │
        ├─ Writing new code?
        │  └─ Load patterns/PATTERN.md (~100-150 tokens)
        │     + modules/MODULENAME.md (~100-150 tokens) [if analyzing]
        │
        ├─ Analyzing a module?
        │  └─ Load modules/MODULENAME.md (~150 tokens)
        │
        └─ Checking recent work?
           └─ Load sessions/YYYY-MM-DD-*.md (~150-200 tokens)
```

**Total per task: ~400-600 tokens** (vs. 2000+ for full notebook)

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

### Dev Team (Developer Starting New Feature)
```
1. Load: .claude/agent-memory/INDEX.md
2. Load: .claude/agent-memory/patterns/DDD-violations.md
3. Load: .claude/agent-memory/patterns/circuit-breaker.md
4. Code + test
5. Append to: sessions/2026-04-22-developer.md
   - Task: "Add news source aggregator"
   - Finding: "Discovered retry logic missing in news fetcher"
   - Status: "Ready for QA"
```

### Analysis Team (Market Watcher)
```
1. Load: .claude/agent-memory/INDEX.md
2. Load: .claude/agent-memory/sessions/2026-04-22-morning.md [recent findings]
3. Check: "CafeF had 403 error yesterday, apply retry logic"
4. Fetch prices, check for 403s
5. Append: "No 403s today, resilience fix working"
```

### Ops Agent
```
1. Load: .claude/agent-memory/INDEX.md
2. Load: .claude/agent-memory/issues/WAL-checkpoint.md [critical]
3. Load: .claude/agent-memory/modules/scheduler.md [current state]
4. Check: Signal handlers on restart
5. Health check passes
6. Append to sessions: "All signal handlers verified, WAL clean"
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

## 🎯 Token Math

| Approach | Tokens | Time |
|----------|--------|------|
| Monolithic notebook | ~2000 | 10 min |
| INDEX only | ~300 | 2 min |
| INDEX + 2 task-specific files | ~600-800 | 4-5 min |
| INDEX + session check | ~400 | 3 min |

**Total savings: 60-80% of previous memory cost.**

---

## 🔗 Remember

- **INDEX.md is your table of contents** — start here every time
- **Load only what you need** — task-focused, token-efficient
- **Update small focused files** — not giant notebooks
- **Append to sessions** — log what you learned so next agent doesn't redo work

**This protocol = less wasted tokens + more learned patterns = faster future work**

---

**Updated**: 2026-04-22 | **Version**: 1.0
