---
name: dispatch
description: >
  Full routing constitution for all agents. Defines: which agent handles which intent,
  dev team handoff chain, cowork signal bus, Telegram channel rules, non-negotiables,
  and file placement. Load this skill when you need to know who to send to next or
  what rules govern the system.
---

## Dispatch Table — User Intent → Agent

| Intent | Agent | Flow |
|--------|-------|------|
| add / build / improve [feature] | `po` | `main` |
| bug / broken (infra) | `ops` | `main` |
| bug / broken (code) | `developer` | `main` |
| analyze stock / news | `market-analyst` | `main` |
| brainstorm / explore idea | `idea-forge` | `main` |
| sprint status / in progress | `pm` | `main` |
| system health / audit | `system-auditor` | `main` |
| DRY violations / hardcoded values | `code-janitor` | `main` |
| update cowork agents | `cowork-refactory-expert` | `main` |
| organize / clean files / knowledge | `claude-manager-helper` | `main` |
| create / edit / review / maintain agent | `agent-father` | `create` / `edit` / `review` / `keep` |

Agent files → `.claude/agents/*.md` | Flows → `.claude/flows/{agent}/{flow}.md`

---

## Dev Team Handoff Chain

| From | To | Mechanism | Action |
|------|----|-----------|--------|
| PO | BA | caveman | writes `docs/SPRINT_GOAL.md`, creates BA task in `docs/TASKS.md` |
| BA | Architect | caveman | req spec in `docs/TASKS.md`, creates Architect task |
| Architect | PM | caveman | `[Architect]` section in `docs/handoffs/TASK_NNN.md` |
| PM | Developer | caveman | creates `docs/handoffs/TASK_NNN.md`, docs/TASKS.md → Todo |
| Developer | QA | caveman | `[Developer]` section in handoff, docs/TASKS.md → Review |
| QA | Developer/Fixer | caveman | `[QA] Review Record` in handoff, docs/TASKS.md → In Progress |
| QA | PM | caveman | docs/TASKS.md → Done, branch merged |
| Fixer | QA | caveman | `[Fixer] Fix Record` in handoff, docs/TASKS.md → Review |

**Ops — Infra Lane** (parallel to dev chain, triggered by any agent or user)

| From | To | Mechanism | Action |
|------|----|-----------|--------|
| any agent / user | ops | bug channel / dispatch | infra anomaly, VPS failure, Docker issue |
| ops | pm | caveman | infra fix requires new dev task → create docs/TASKS.md entry |
| ops | developer | caveman | fix needs code change → hand off with context |
| ops | work channel | send_telegram | fix applied, service restored |

Caveman spec → `.claude/skills/caveman/SKILL.md` (ultra: agent-to-agent | lite: user-facing)

---

## Cowork Signal Bus

| From | Signal | To |
|------|--------|----|
| news-scout | `news_impact`, `crisis_velocity` | alert-commander |
| financial-analyst | `bctc_signal`, `valuation_flag` | alert-commander |
| report-analyzer | `fundamental_validation` | alert-commander |
| market-watcher | `price_anomaly`, `volume_spike` | alert-commander |
| alert-commander | `suppress`, `verified_decision` | all cowork agents |

API: `post_agent_signal(type, payload)` → `get_agent_signals()` — full spec → `.claude/knowledge/mcp-tools.md`

---

## Telegram Output Bus

| Channel | Senders | Content |
|---------|---------|---------|
| `market` | alert-commander + digest-predict + qa-responder | User alerts, briefings, /ask answers |
| `work` | dev team + unified-agent | Fix-shipped, sprint status, cycle summaries |
| `bug` | ALL agents on error | Incidents, anomalies, bootstrap failures |

Fail-loud: any knowledge Read failure → `send_telegram(channel="bug")` + STOP
Full protocol → `.claude/knowledge/fail-loud-protocol.md`

---

## Non-Negotiables

| Rule | Pointer |
|------|---------|
| DDD: `domain/` never imports `infrastructure/` | `.claude/knowledge/dev-standards.md` |
| Restart: `docker-compose down && docker-compose up -d` ONLY | `.claude/knowledge/restart-policy.md` |
| Never ask user to run code — spawn subagent | |
| WIP: max 2 tasks In Progress in `docs/TASKS.md` | |
| SQL: parameterized bindings only | |
| VN sources: always via Vinahost VPS proxy | `docs/ARCHITECTURE.md` |

---

## File Placement

| Content | Location |
|---------|----------|
| Logic / rules / policy | `.claude/knowledge/*.md` |
| Volatile counts / lists | `docs/data/*.json` |
| Core architecture | `docs/*.md` (6 files max) |
| Agent memory / sessions | `docs/agent-memory/` |
| Task reports / archive | `docs/archive/` |

Full DAG → `.claude/knowledge/tree-map.md`
