# Agent Memory — Lazy-Loaded Workbook

**Token-efficient shared memory for all agents.** Load only what you need.

---

## 📍 Start Here

1. **Always load first**: `INDEX.md` (~300 tokens)
2. **Then load what you need** based on your task:
   - Fixing a bug? → Load relevant issue file
   - Writing code? → Load relevant pattern file(s)
   - Analyzing a module? → Load module analysis file
   - Checking recent work? → Load session file

---

## 📁 Structure

```
.claude/agent-memory/
├── INDEX.md                    # ← START HERE (always load)
├── issues/
│   ├── WAL-checkpoint.md       # Bug: WAL unbounded growth (FIXED)
│   ├── timezone-offsets.md     # Bug: DST test failures (FIXED)
│   └── aggregator-guards.md    # Bug: Null pointer in OHLCV (FIXED)
├── patterns/
│   ├── DDD-violations.md       # domain/ imports infrastructure (7x recur)
│   ├── SQL-injection.md        # String interpolation in queries (0x, strict)
│   ├── circuit-breaker.md      # HTTP fetches without isolation (2x recur)
│   ├── rate-limiter.md         # External calls without throttle (1x recur)
│   └── date-handling.md        # Naive new Date() instead of UTC (3x recur)
├── modules/
│   ├── domain.md               # Layer boundary ✅, DDD scoping ✅, type coverage ⚠️
│   ├── scheduler.md            # Signals ✅, WAL ✅, timezone ⚠️
│   ├── rest.md                 # SSE safety ✅, sessions ✅, rate limit ⚠️
│   └── application.md          # Error handling ✅, RAG perf ⚠️
├── sessions/
│   ├── 2026-04-21-dev-team.md # Fixed aggregator guards
│   ├── 2026-04-20-qa.md        # Fixed timezone in tests
│   └── 2026-04-22-morning.md   # (current work, check for findings)
└── README.md                   # This file
```

---

## 🎯 Quick Task Examples

### Task: Fix a bug in src/infrastructure/scheduler/
1. Load `INDEX.md` → see "Issues" section
2. Load `issues/WAL-checkpoint.md` (if signal handler bug) OR `issues/timezone-offsets.md`
3. Load `modules/scheduler.md` (to understand current state)
4. Load `patterns/date-handling.md` (if it's a date bug)
5. **Total: ~600 tokens** (vs. 2000+ if loading everything)

### Task: Write a new data fetcher (HTTP client)
1. Load `INDEX.md`
2. Load `patterns/circuit-breaker.md`
3. Load `patterns/rate-limiter.md`
4. Load `patterns/SQL-injection.md` (if queries involved)
5. **Total: ~400 tokens**

### Task: Analyze domain/ for refactoring
1. Load `INDEX.md`
2. Load `modules/domain.md`
3. Load `patterns/DDD-violations.md`
4. **Total: ~500 tokens**

### Task: Check what another agent just did
1. Load `INDEX.md`
2. Load latest session file (e.g., `sessions/2026-04-22-morning.md`)
3. **Total: ~300 tokens**

---

## ✍️ How Agents Update This Memory

### When you fix a bug
```
1. Check if issue file exists in issues/
2. If yes: Update status → mark as FIXED + add commit hash
3. If no: Create new issue file with:
   - What broke
   - Symptom
   - Root cause
   - Solution
   - Prevention checklist
   - Related files
```

### When you discover a pattern
```
1. Check if pattern file exists in patterns/
2. If yes: Increment recurrence count, add example
3. If no: Create new pattern file with:
   - What breaks
   - Where it happens
   - Example (bad + good code)
   - Prevention checklist
   - How to fix
```

### When you analyze a module
```
1. Update modules/MODULE.md with:
   - Verification status (what was checked)
   - Files scanned (what you looked at)
   - Known issues (what needs fixing)
   - Patterns discovered (reusable learnings)
   - Next tasks (what should happen next)
```

### When you finish a work session
```
1. Create or append to sessions/YYYY-MM-DD-*.md:
   - Task name + duration
   - Work done
   - Findings (what was surprising)
   - Testing done
   - Updates to agent memory (what files changed)
   - Status (ready for merge? blocking? pending?)
```

---

## 💡 Why Lazy-Load?

- **Startup cost**: INDEX only (~300 tokens) vs. monolithic notebook (~2000)
- **Task cost**: Load only relevant files (+200-400 tokens per task) vs. re-reading everything
- **Update cost**: Agents update small focused files, not massive shared document
- **Search cost**: `grep "pattern-name" patterns/` faster than full text search

**Total savings**: ~60% tokens on first load, ~40-70% on subsequent tasks.

---

## 🔍 Searching Memory

**Find all bugs in a module:**
```bash
grep -r "scheduler" issues/*.md
# ← Returns WAL-checkpoint.md, timezone-offsets.md, etc.
```

**Find pattern examples:**
```bash
grep -l "circuit-breaker" patterns/*
# ← Returns circuit-breaker.md
```

**Find recent session findings:**
```bash
tail -20 sessions/2026-04-22-morning.md
# ← Latest work, check for findings before starting
```

---

## 🚨 Rule: Don't Load Everything

❌ **Wrong:**
```
Load /agent-memory/INDEX.md
Load /agent-memory/issues/*.md  ← All issues at once
Load /agent-memory/patterns/*.md ← All patterns at once
Load /agent-memory/modules/*.md ← All modules at once
Load /agent-memory/sessions/*.md ← All sessions at once
→ Total: 4000+ tokens wasted
```

✅ **Right:**
```
Load /agent-memory/INDEX.md
Load /agent-memory/issues/WAL-checkpoint.md  ← Only this one
Load /agent-memory/modules/scheduler.md      ← Only this one
→ Total: 400 tokens, task-focused
```

---

## 🤝 Ownership

- **All agents**: Can READ and APPEND to sessions
- **Dev Team**: Can CREATE/UPDATE issues/ and modules/
- **Any agent**: Can CREATE/UPDATE patterns/ when discovering recurrence
- **Architect**: Reviews pattern discoveries, prevents false patterns

---

**Last updated**: 2026-04-22 by system (initial)
