---
name: dispatch
description: >
  Full routing constitution for all agents. Defines: which agent handles which intent,
  dev team handoff chain, cowork signal bus, Telegram channel rules, non-negotiables,
  and file placement. Load this skill when you need to know who to send to next or
  what rules govern the system.
---

## Auto-Switch Protocol — Universal Entry

**Every agent has `docs/agents/<agent>/flow/main.md` as the single entry point.** `main.md` is a thin dispatcher that picks the right sub-flow (cycle / eod / daily / weekly / create / edit / review / keep / …) based on trigger, time of day, or caller intent.

| Caller | What they invoke | What happens |
|---|---|---|
| User demand (free text) | Main terminal reads dispatch table → spawns matching agent with prompt `run docs/agents/<agent>/flow/main.md` | Agent's `main.md` dispatches to the right sub-flow internally |
| Cron tick | Cron prompt says `run docs/agents/<agent>/flow/main.md` | Same — `main.md` reads the clock and picks the sub-flow |
| Agent handoff | Previous agent returns `NEXT: <agent>` | Main terminal spawns target with `run docs/agents/<agent>/flow/main.md` + prior return as context |

**Cron skill files (`.claude/commands/crons/cron-<agent>.md`) MUST point to `main.md`** — never hardcode a sub-flow path. If the agent has time-of-day branching, encode it inside `main.md`, not in the cron prompt.

**Cooperation loop:**
1. Main terminal spawns agent A → A's `main.md` runs → A writes RETURN block.
2. Main terminal reads RETURN: if `PIPELINE: continue` and `NEXT: <agent>` → spawn next via its `main.md`.
3. Cowork agents drop signals at `docs/signals/*.json` instead of NEXT — dev-team drains at Step 0a (see `docs/protocols/agent-chaining-protocol.md`).
4. Loop until `PIPELINE: complete` or `blocked` → idle.

## Dispatch Table — User Intent → Agent

| Intent | Agent | Sub-flow | Notes |
|--------|-------|------|-------|
| add / build / improve [feature] | `po` | `main` | Vision + sprint kickoff |
| bug / broken (infra) | `ops` | `main` | VPS, Docker, network, MCP server reachability |
| bug / broken (code) — **tracked fix** | `po` | `main` | PO triages → dev-team chain creates TASK_NNN → developer (default for any bug report) |
| bug / broken (code) — **explicit one-shot patch** | `developer` | `main` | Only when user explicitly asks "quick fix, no task tracking" |
| analyze stock / news | `market-analyst` | `main` | Investment Q&A, news impact, sector compare |
| earnings report / quarterly parsing | `report-analyzer` | `main` | Cowork agent; manual spawn ok on demand |
| brainstorm / explore idea | `idea-forge` | `main` | Open-ended exploration before committing to a sprint |
| sprint status / in progress | `pm` | `main` | "What's the team doing?" |
| queue / triage — **what should we work on?** | `po` | `main` | Scoping / prioritization |
| queue / track — **what's planned & where is it?** | `pm` | `main` | Mechanics / status |
| system health / audit (observe, report) | `system-auditor` | `main` | Periodic anomaly detection; produces a report — no fixes |
| service down / latency / pipeline failure (react, fix) | `ops` | `main` | Active incident response |
| DRY violations / hardcoded values | `code-janitor` | `main` | Static dedup sweep |
| update cowork agents | `cowork-refactory-expert` | `main` | Rewrite/refresh cowork .md files |
| organize / clean files / knowledge | `claude-manager-helper` | `main` | MEMORY.md slim, DAG hygiene |
| create / edit / review / maintain agent | `agent-father` | `main` → `create` / `edit` / `review` / `keep` | All agent-file lifecycle |
| schedule / cron — **existing skill** | (invoke the skill directly) | n/a | If `.claude/commands/crons/cron-<agent>.md` exists, run it — do not spawn anyone |
| schedule / cron — **new schedule needed** | `agent-father` | `main` → `create` | Authors a new cron skill file |
| strategy quality audit | `tran-ngoc-bau` | `main` | TNB methodology compliance |
| inter-agent architecture / brief | `agents-architect` | `main` | Outputs `docs/architecture-briefs/*.md` |

Agent files → `.claude/agents/*.md` | Flows → `docs/agents/{agent}/flow/main.md` (dispatcher) → sub-flows.

**Dev-* specialist doc-ownership:** Each dev-* agent is sole committer of `docs/architecture/microservice/<service>/`. Architect writes only to `docs/architecture-briefs/`. Architect briefs that propose microservice doc edits MUST route the doc-write subtask to the matching dev-* agent, not to architect or generic developer. Full table → `docs/references/agent-roster.md` § doc_owner column.

**Cowork cron-driven agents** (`news-scout`, `financial-analyst`, `market-watcher`, `alert-commander`, `digest-predict`, `qa-responder`, `unified-agent`) are **not normally direct-spawned by main terminal**. They run on their own schedule and communicate via `docs/signals/*.json`. User-typed intents that *sound* like them (e.g. "what's the news?") route to `market-analyst` which then queries the right MCP tools. Manual spawn is allowed in exceptional cases (e.g. user explicitly says "run market-watcher now").

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

## Cross-Cutting References (pointer rows)

| Concern | SSOT |
|---|---|
| Cowork signal bus (news→alert-commander, BCTC→alert-commander, price-anomaly→alert-commander, suppress→all cowork) | `docs/standards/mcp-tools.md` § Signal Bus |
| Cowork inbox / read-unread tracking for po, tran-ngoc-bau, unified-agent, alert-commander | `docs/signals/DASHBOARD.md` + skill: `signal-dashboard` |
| Telegram channels — market (alerts), work (dev/cycle), bug (errors, ALL agents) | `docs/policies/alert-policy.md` |
| Fail-loud on any knowledge Read failure → `send_telegram(channel="bug")` + STOP | `docs/protocols/fail-loud-protocol.md` |
| DDD (domain never imports infra), restart policy, WIP=2, parameterized SQL, VPS proxy for VN sources | `docs/policies/dev-standards.md` · `docs/policies/restart-policy.md` · `docs/ARCHITECTURE.md` |
| Main terminal never writes `docs/TASKS.md` / `docs/handoffs/*` / `docs/pipeline-state.json` — spawn po/pm/dev-team | `docs/protocols/agent-chaining-protocol.md` |
| Never ask user to run code — spawn subagent (ops/developer/qa). User is config admin only | `CLAUDE.md § Interdiction` |
| File placement — logic→`docs/{policies,protocols,standards,references}/`; volatile→`docs/data/*.json`; core arch→`docs/*.md` (≤6); agent memory→`docs/agent-memory/`; reports→`docs/archive/` | `docs/references/tree-map.md` |
