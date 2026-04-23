# Agent Memory Index — Quick Lookup Only

> Load this first (~300 tokens). Then load only `.md` files you need for your task.
> **Do NOT load everything at once.**

---

## 📋 Issues (Load if: fixing a bug, analyzing infrastructure)

- **[WAL Checkpoint](issues/WAL-checkpoint.md)** — Unbounded WAL growth on SIGTERM (FIXED, recur=3x)
- **[Timezone Test Failures](issues/timezone-offsets.md)** — CI tests fail due to DST handling (FIXED, recur=1x)
- **[Null Guards in Aggregator](issues/aggregator-guards.md)** — Array access without null check (FIXED, recur=1x)

## 🔴 Error Patterns (Load if: writing infrastructure, SQL, scheduler, or domain code)

- **[DDD Layer Violations](patterns/DDD-violations.md)** — domain/ imports infrastructure/ (recur=7x)
- **[SQL Injection](patterns/SQL-injection.md)** — String interpolation in queries (recur=0x, strict)
- **[Missing Circuit Breaker](patterns/circuit-breaker.md)** — HTTP fetches without isolation (recur=2x)
- **[Rate Limiter Skipped](patterns/rate-limiter.md)** — External calls without throttle (recur=1x)
- **[Naive Dates](patterns/date-handling.md)** — `new Date()` instead of explicit UTC (recur=3x)

## 📊 Module Analyses (Load if: analyzing, refactoring, or extending a module)

- **[src/domain/](modules/domain.md)** — Layer boundary ✅, DDD scoping ✅, type coverage ⚠️ (8 files need @type)
- **[src/infrastructure/scheduler/](modules/scheduler.md)** — Signals ✅, WAL ✅, timezone ⚠️ (3 crons use naive dates)
- **[src/interface/rest/](modules/rest.md)** — SSE safety ✅, sessions ✅, rate limit ⚠️ (not yet added)
- **[src/application/](modules/application.md)** — Error handling ✅, RAG perf ⚠️ (no caching layer)

## 🔗 Sessions (Load if: checking what agent just did, avoiding duplicate work)

- **[2026-04-23 BA Sprint 1296](sessions/2026-04-23-ba-sprint-1296.md)** — Infrastructure recovery (OPS validation) + IMF sentiment planning (BA research)
- **[2026-04-23 BA Sprint 1295](sessions/2026-04-23-ba-sprint-planning.md)** — Signal builders + IMF backlog analysis
- **[2026-04-21 Dev Team](sessions/2026-04-21-dev-team.md)** — Fixed aggregator guards
- **[2026-04-20 QA](sessions/2026-04-20-qa.md)** — Fixed timezone in tests
- **[2026-04-22 Morning Work](sessions/2026-04-22-morning.md)** — Recent work context

---

## 🎯 Quick Start: Load by Task Type

| Task | Load Files |
|------|-----------|
| **Fixing a bug** | INDEX.md + relevant issue file + related module file |
| **Writing new scheduler code** | INDEX.md + `patterns/DDD-violations.md` + `patterns/date-handling.md` + `modules/scheduler.md` |
| **Adding HTTP fetcher** | INDEX.md + `patterns/circuit-breaker.md` + `patterns/rate-limiter.md` + `patterns/SQL-injection.md` |
| **Refactoring domain/** | INDEX.md + `modules/domain.md` + `patterns/DDD-violations.md` |
| **Checking recent work** | INDEX.md + latest session file (e.g., `2026-04-22-morning.md`) |

---

## 📝 Update Protocol

**When you finish work:**
1. Did you fix a bug? → Update relevant issue file, mark as FIXED
2. Did you find a new pattern? → Create `patterns/NEW-PATTERN.md`
3. Did you analyze a module? → Update `modules/MODULE.md`
4. Did you discover something? → Create/append to session file `sessions/YYYY-MM-DD-*.md`

**Example session append:**
```markdown
### Task: Fix CafeF RSS URL (2026-04-22 14:30 VN)
- **Finding**: External URL changed, regex broke
- **Fix**: Updated `src/interface/rest/newsSourceParser.ts`
- **Prevention**: Monitor external URLs (add to patterns if recurs)
```

---

## 🎓 Examples

**Dev Team starting new scheduler job:**
```
1. Load INDEX.md (this, ~100 tokens)
2. Load patterns/date-handling.md (~80 tokens)
3. Load modules/scheduler.md (~120 tokens)
4. Start coding, check checklist for naive dates
Total: ~300 tokens (not 2000)
```

**News Scout finding external API broke:**
```
1. Load INDEX.md (~100 tokens)
2. Check sessions/2026-04-22-*.md for similar issues (~80 tokens)
3. If new pattern: create patterns/PATTERN-NAME.md
Total: ~180 tokens + new pattern doc
```

---

**Always load INDEX.md first. Then load only what your task needs.**
