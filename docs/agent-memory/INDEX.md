# Agent Memory Index — Catalog Only

> **Agents:** Call `get_memory_files(agent_name, task_type)` MCP tool — do NOT read this file or manifests. See AGENT_STARTUP.md.
>
> **Humans:** This catalog documents all available memory files. Use for exploration/discovery only.
> **Do NOT load everything at once.**

---

## 📋 Issues (Load if: fixing a bug, analyzing infrastructure)

- **[BCTC Quality](issues/BCTC-QUALITY.md)** — PDF extraction errors, VNM/VEA anomalies
- **[BCTC Portal Discovery](issues/bctc-portal-discovery.md)** — React SPA blocker (resolved via Playwright)
- **[Foreign Flow Circuit](issues/foreign-flow-circuit.md)** — Circuit breaker recurring HALF-OPEN
- **[Foreign Flow Parse Cascade](issues/foreign-flow-parse-cascade.md)** — 3,739 silent filter errors
- **[Alert Quality](issues/ALERT-QUALITY.md)** — Missing 4-AND verification fields in payloads
- **[Corruption Stepping Error](issues/CORRUPTION-STEPPING-ERROR.md)** — B-tree stepping error (distinct from prior PRAGMA failure)
- **[Signal Schema Urgent News](issues/signal-schema-urgent-news-error.md)** — `root` field missing in urgent_news
- **[Source Quality](issues/source-quality.md)** — Reuters/Trading Economics RSS outages
- **[Memory Stale](issues/MEMORY-STALE.md)** — Agent memory files out of sync

## 🔴 Error Patterns (Load if: writing infrastructure, SQL, scheduler, or domain code)

- **[DDD Layer Violations](patterns/DDD-violations.md)** — domain/ imports infrastructure/ (recur=7x)
- **[Missing Circuit Breaker](patterns/circuit-breaker.md)** — HTTP fetches without isolation (recur=2x)
- **[Telegram Channel Routing](patterns/telegram-channel-routing.md)** — Wrong channel routing bugs
- **[Signal Payload Quality](patterns/signal-payload-quality.md)** — Missing fields in signal payloads
- **[Python DDD Absolute Imports](patterns/python-ddd-absolute-imports.md)** — Use absolute not relative imports

## 📊 Module Analyses (Load if: analyzing, refactoring, or extending a module)

- **[Scheduler](modules/scheduler.md)** — Signal handlers, WAL checkpoint, cron jobs state
- **[Chain Synthesizer](modules/chainSynthesizer.md)** — Cascade chain construction logic
- **[Signal Builders](modules/signalBuilders.md)** — ChainCatalyst, PriceConfirmation, UrgentNews, CrossValidate
- **[Tool Loading](modules/tool-loading.md)** — MCP tool registry, bootstrap sequence

## 📋 PO Procedures (Load if: PO analyzing tasks/sprints)

- **[PO: Branch Hygiene Protocol](po-branch-hygiene.md)** — Check stale branches + TASKS.md sync on every sprint analysis (PO required)

## 🔗 Sessions (Load if: checking what agent just did, avoiding duplicate work)

- **[LATEST](sessions/LATEST.md)** — Most recent session (always load this first)
- **[2026-04-26 Developer](sessions/2026-04-26-developer.md)** — Task 1339b PriceConfirmation fields
- **[2026-04-26 QA](sessions/2026-04-26-qa.md)** — Task 1300b QA review
- **[2026-04-26 Ops](sessions/2026-04-26-ops.md)** — Latest ops health check
- **[2026-04-23 BA Sprint 1296](sessions/2026-04-23-ba-sprint-1296.md)** — IMF sentiment planning

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

**Agents: Use `get_memory_files()` MCP tool, not this file or manifests. See `docs/agent-memory/AGENT_STARTUP.md`.**
