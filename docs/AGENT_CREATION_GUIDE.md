# Agent Creation Guide — Generic Pattern Reference

How to create a new agent in this system. All patterns extracted from live agents.

**Design philosophy:** Each agent = an employee in an enterprise. Knows their job, owns their zone, learns from experience, communicates to help the team, takes responsibility for their documentation. Loads minimum context, fetches more only when the job demands it.

---

## Table of Contents

| # | Section | File | Lines |
|---|---------|------|-------|
| 1 | Architecture Overview | (below) | ~12 |
| 2-3 | Two-Zone Folder Design + Per-Agent File Map | [guide-zones.md](guides/guide-zones.md) | ~114 |
| 4 | Lazy-Load Protocol | [guide-lazy-load.md](guides/guide-lazy-load.md) | ~213 |
| 5 | Agent Definition File | [guide-agent-definition.md](guides/guide-agent-definition.md) | ~357 |
| 6 | Flow File Templates | [guide-flows.md](guides/guide-flows.md) | ~192 |
| 7-12 | Notebook, Cross-Team, Reports, Maintenance, Registry, Responsibility | [guide-agent-ops.md](guides/guide-agent-ops.md) | ~233 |
| 13-14 | Error Boundary & Signal Bus | [guide-error-signals.md](guides/guide-error-signals.md) | ~53 |
| 15-16 | Skills Catalog & Registration Checklist | [guide-skills-registration.md](guides/guide-skills-registration.md) | ~53 |
| 17 | Quick-Start Recipes | (below) | ~24 |
| 18 | Autonomous Quality Patterns | [guide-quality.md](guides/guide-quality.md) | ~274 |

---

## 1. Architecture Overview

Two agent families:

| Family | Runtime | Examples |
|--------|---------|---------|
| **Cowork** (Analysis) | Claude Cowork (cloud, cron-scheduled) | market-watcher, news-scout, alert-commander |
| **Dev Team** (CLI) | Claude Code (local, spawned by main terminal) | developer, qa, ops, dev-mcp-server |

Main terminal = permanent agent switch. Sub-agents cannot spawn each other.

---

## 17. Quick-Start Recipes

### New Cowork Agent

1. `.claude/agents/<agent-id>.md` — [Section 5](guides/guide-agent-definition.md) with `document_zone`, `document_registry`, `reads_notebooks`
2. `docs/agents/<agent-id>/flow/cycle.md` — [Section 6.1](guides/guide-flows.md#61-cowork-agent-flow) with lazy-load levels, lesson extraction, registry check
3. `docs/agent-memory/notebooks/<agent-id>.md` — [Section 7.2](guides/guide-agent-ops.md#72-enhanced-notebook-format-recommended) enhanced format
4. Register ([Section 16](guides/guide-skills-registration.md#16-registration-checklist))
5. Cron file if scheduled

### New Dev Team Agent

1. `.claude/agents/<agent-id>.md` — [Section 5](guides/guide-agent-definition.md) with dev tools, `document_zone`, `document_registry`
2. `docs/agents/<agent-id>/flow/main.md` — [Section 6.2](guides/guide-flows.md#62-dev-team-agent-flow) with cross-team context, lesson extraction
3. `docs/agent-memory/notebooks/<agent-id>.md` — [Section 7.2](guides/guide-agent-ops.md#72-enhanced-notebook-format-recommended) enhanced format
4. Register ([Section 16](guides/guide-skills-registration.md#16-registration-checklist))

### New Microservice Dev Agent

1. `.claude/agents/dev-<service>.md` — [Section 5](guides/guide-agent-definition.md) with `zone: apps/<service>/`, full `document_zone`
2. `docs/agents/developer/flow/microservice-main.md` — shared flow (exists)
3. `docs/agent-memory/notebooks/dev-<service>.md` — [Section 7.2](guides/guide-agent-ops.md#72-enhanced-notebook-format-recommended)
4. Register in CLAUDE.md (`build/fix <service>` -> `dev-<service>`)
