# Agent Memory Index — Catalog Only

> **Agents:** Load `docs/agent-memory/manifests/YOURNAME.md` instead of this file. See AGENT_STARTUP.md.
>
> **Humans:** This catalog documents all available memory files. Use for exploration/discovery only.
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

## 📋 PO Procedures (Load if: PO analyzing tasks/sprints)

- **[PO: Branch Hygiene Protocol](po-branch-hygiene.md)** — Check stale branches + TASKS.md sync on every sprint analysis (PO required)

## 🔗 Sessions (Load if: checking what agent just did, avoiding duplicate work)

- **[2026-04-23 BA Sprint 1296](sessions/2026-04-23-ba-sprint-1296.md)** — Infrastructure recovery (OPS validation) + IMF sentiment planning (BA research)
- **[2026-04-23 BA Sprint 1295](sessions/2026-04-23-ba-sprint-planning.md)** — Signal builders + IMF backlog analysis
- **[2026-04-21 Dev Team](sessions/2026-04-21-dev-team.md)** — Fixed aggregator guards
- **[2026-04-20 QA](sessions/2026-04-20-qa.md)** — Fixed timezone in tests
- **[2026-04-22 Morning Work](sessions/2026-04-22-morning.md)** — Recent work context

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

**Agents: Use manifests, not this file. See `docs/agent-memory/AGENT_STARTUP.md`.**
