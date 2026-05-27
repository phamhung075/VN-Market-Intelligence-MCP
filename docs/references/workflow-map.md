# Workflow Map — Full Vector Chart

<!-- size-justification: 167L — chart view of all 35 agents in one table (9 dev-* enumerated explicitly so zone routing is auditable from this file alone); row-per-agent must stay co-located so the reader can scan "who does what" without paging. W1-W19 detailed flows already split to workflow-map-cycles.md. -->


**Load when:** understanding the end-to-end picture of who does what, what each agent takes, what main terminal does, how cron and demand flows differ.

**SSOT for the dispatch table:** `.claude/skills/dispatch/SKILL.md`. This file is the **chart view** — it visualises the relationships between agents, signals, and channels. Routes themselves live in the dispatch skill.

---

## Top-Level — Main Terminal as Permanent Switch

```
                    ┌─────────────────────────────────────────────┐
                    │                MAIN TERMINAL                │
                    │  router | reads dispatch table | spawns agent│
                    │  reads RETURN.NEXT → spawns next | NEVER     │
                    │  writes domain files (TASKS, handoffs, etc.) │
                    └────────┬────────────────────────────────────┘
                             │ run docs/agents/<agent>/flow/main.md
                             ▼
                       agent's main.md
                             │
                             ▼
                       sub-flow (cycle / eod / kickoff / etc.)
                             │
                             ▼
                       RETURN { DONE, NEXT, PIPELINE, HANDOFF }
                             │
                  ┌──────────┼──────────┐
                  ▼          ▼          ▼
              complete    continue   blocked
              → idle    → main spawns NEXT  → idle + WORK alert
```

---

## Workflow Categories

| Workflow | Desc | Read from |
|----------|------|-----------|
| **W1-W4** | Synchronous user demands (Q, feature, bug, infra) | → see below |
| **W5-W19** | Cron-driven cowork (W5-W9), dev cycle (W10), maintenance (W11-W16), demand-driven (W17-W19) | → see [workflow-map-cycles.md](./workflow-map-cycles.md) |
| **W20** | BUG channel feedback loop | → see below |

---

## W1-W4: Synchronous User Demands

```
W1  USER question
    USER → MAIN → market-analyst → MCP(get_macro_snapshot, get_bctc_full, …)
                                 → notebook → RETURN(PIPELINE:complete) → MAIN → USER

W2  USER feature demand
    USER → MAIN → po → ba → architect → pm → developer(±dev-* zone agent) → qa
                                                                 ├→ fixer (if CHANGES_REQUESTED)
                                                                 └→ pm (merge, branch del) → MAIN → USER

W3  USER bug report (tracked)
    USER → MAIN → po (Step 0 channel audit + cross-check) → opens FIX task → BATCH
                ↳ MAIN → dev-team Step 3 → developer → qa → pm → MAIN → USER

W3' USER bug (explicit one-shot patch, no tracking)
    USER → MAIN → developer (single file, no PM handoff) → MAIN → USER

W4  USER infra incident
    USER → MAIN → ops → SSH/Docker/VPS triggers → BUG(if can't recover) → MAIN → USER
```

---

## W20: BUG Channel Feedback Loop

```
W20 BUG channel feedback loop
    any agent → BUG channel (Telegram) → next dev-team cycle Step 0 audit reads BUG
              → po opens fix task → dev-team chain → fix → process_telegram_report(delete)
```

---

## Who Does What / Takes What

| Agent | Trigger | Reads (takes) | Writes / signals |
|---|---|---|---|
| **MAIN TERMINAL** | user input, cron tick, RETURN.NEXT | `.claude/skills/dispatch/SKILL.md`, RETURN block | spawns next agent only — no domain files |
| `market-analyst` | user Q | MCP macro/BCTC/prices/news, top-down framework | notebook, RETURN to user |
| `po` | cron, demand, signals drained | TASKS, handoffs/, telegram channels, project-stats | SPRINT_GOAL, BA-task in TASKS, BATCH return |
| `ba` | po RETURN.NEXT | SPRINT_GOAL, TASKS | REQ_NNN.md, architect-task |
| `architect` | ba/po RETURN.NEXT | REQ_NNN, brownfield scan | handoffs/TASK_NNN [Architect] section |
| `pm` | architect RETURN.NEXT | REQ_NNN, handoff, TASKS | handoffs/TASK_NNN, TASKS.md → Todo, dep map |
| `developer` | pm RETURN.NEXT (zone-routed to dev-*) | handoffs/TASK_NNN, code, tests | code commits, [Developer] section, → qa |
| `qa` | developer RETURN.NEXT | branch diff, tests | [QA] section, merge or → fixer, sprint report |
| `fixer` | qa CHANGES_REQUESTED | [QA] blocking lines | minimum-diff commits, [Fixer] section, → qa |
| `ops` | bug, infra, demand | ssh, docker, get_system_status, vps triggers | BUG/WORK channel, log_fix, escalate |
| `news-scout` | cron 15min/60min | fetch_and_analyze, fetch_news_smart | docs/signals/news_impact*, notebook |
| `market-watcher` | cron 5min/2h | get_market_snapshot, anomaly tools | docs/signals/price_anomaly* only (no MARKET write) |
| `financial-analyst` | cron 2x daily | get_bctc_full, compare_financials | docs/signals/bctc_signal* (with business-context fields: product/customer/ops/mgmt), notebook |
| `report-analyzer` | event/cron | quarterly BCTC parse | docs/signals/fundamental_* (with business-context fields: product/customer/ops/mgmt), ledger update |
| `alert-commander` | event-driven (cron gate) | get_agent_signals, get_alerts | MARKET (position-danger or watchlist-opp ONLY — ≤140 chars; silent exit otherwise) |
| `digest-predict` | weekly Sunday 13:47 UTC | weekly calibration signals | MARKET (Sunday calibration + portfolio thesis only) |
| `qa-responder` | cron 12min | ask_queue (FIFO), MCP, web | MARKET channel (replies) |
| `unified-agent` | cron 05:23 / intraday :13 / 08:37 / 19:37 UTC M-F | all docs/signals/* (last 24h), get_market_hexagram, get_macro_snapshot | MARKET chef dishes 3x/day (Morning/EOD/Evening) + conditional intraday; WORK coordination |
| `tran-ngoc-bau` | daily cron 20:13 UTC | MARKET chef dishes (last 3), unified-agent notebook, gatherer signals, tnb-methodology | WORK audit row (TNB layer-walk completeness score per dish) |
| `system-auditor` | cron daily | memory, sqlite, logs | BUG (new anomalies only) |
| `code-janitor` | cron 3h | code grep, schema files | TASKS or signal → po |
| `claude-manager-helper` | cron | CLAUDE.md, MEMORY.md, docs/ | edits, prunes, commits |
| `cowork-refactory-expert` | demand | live MCP state, agent .md | rewrites .claude/agents/*.md |
| `agent-father` | daily cron + demand | agent-roster, dispatch skill, AGENT_CREATION_GUIDE | create/edit/review/keep agent files + flows |
| `agents-architect` | demand or TNB signal | sessions, notebooks, ARCHITECTURE.md | docs/architecture-briefs/*.md + docs/signals/* |
| `idea-forge` | demand | architecture, related agents | brainstorm doc, optional → po |
| `dev-mcp-server` | dev-team Step 3 — zone `apps/mcp-server/` | handoff, mcp tool surface, scheduler | tool/cron commits, [Developer] in handoff |
| `dev-api-gateway` | dev-team Step 3 — zone `apps/api-gateway/` | handoff, routing/proxy config | gateway commits, health-aggregation tweaks |
| `dev-stock-price` | dev-team Step 3 — zone `apps/stock-price/` | handoff, VPS bridge, price fallback chain | price-aggregator commits, stock_price.db schema |
| `dev-technical-analysis` | dev-team Step 3 — zone `apps/technical-analysis/` | handoff, RSI/MACD/BB compute paths | indicator commits, TA-Lib Python wrapper |
| `dev-macro-indicators` | dev-team Step 3 — zone `apps/macro-indicators/` | handoff, SBV FX, commodity, PMI sources | macro fetcher commits, source-tier tagging |
| `dev-kinh-dich` | dev-team Step 3 — zone `apps/kinh-dich-service/` | handoff, hexagram/hao state machine | I-Ching service commits, layer dispatch |
| `dev-alert-engine` | dev-team Step 3 — zone `apps/alert-engine/` | handoff, dedup/cooldown/verdict resolver | alert-engine commits, signal-filter tweaks |
| `dev-pdf-extractor` | dev-team Step 3 — zone `apps/pdf-extractor/` | handoff, BCTC parser, OCR pipeline | pdf-extractor commits, Vietnamese parse fixes |
| `dev-rag-service` | dev-team Step 3 — zone `apps/rag-service/` | handoff, embeddings, LanceDB | rag-service commits, semantic-search tuning |

---

## Main Terminal: Do's and Never's

```
MAIN TERMINAL (Do)                      ✗ NEVER
─────────────────────────────           ──────────────────────────
✓ Read user prompt / cron prompt        ✗ Write docs/TASKS.md
✓ Look up intent in dispatch table SSOT ✗ Write docs/handoffs/*
✓ Spawn 1 agent via Agent tool +        ✗ Write docs/pipeline-state.json
  prompt = `run docs/agents/<agent>/flow/main.md` ✗ Edit .claude/agents/*
✓ Read agent RETURN block               ✗ Execute MCP tool calls itself
✓ If PIPELINE:continue + NEXT → spawn   ✗ Decide investment / fix code / send alert
✓ If PIPELINE:complete|blocked → idle   ✗ Modify .claude/skills/*
✓ For parallel tier: spawn N agents 1   ✗ Restart Docker (ops only)
✓ Merge worktree branches after tier    ✗ Reply with analysis when agent exists
```

---

## Universal-Entry Invariant

Every agent (count → `jq '.project.agents | length' docs/data/system-map.json`) has `docs/agents/<agent>/flow/main.md` — main terminal's spawn prompt is always `run docs/agents/<agent>/flow/main.md`. Dev-microservice agents (`dev-mcp-server`, `dev-api-gateway`, `dev-stock-price`, `dev-technical-analysis`, `dev-macro-indicators`, `dev-kinh-dich`, `dev-alert-engine`, `dev-pdf-extractor`, `dev-rag-service`) have **pointer** main.md files that redirect to the shared `docs/agents/developer/flow/microservice-main.md` — keeps the dispatcher contract uniform, lets specialists share the same TDD/DDD/zone-restriction recipe.

---

## Legend

- `→` sync handoff via RETURN.NEXT
- `─→` async signal via `docs/signals/*.json` (drained next dev-team cycle Step 0a)
- `↳` continuation after a transition
- `±` optional / conditional spawn
- `MAIN` = main terminal — the only permanent switch

**1 router · 3 Telegram channels (MARKET / WORK / BUG) · 2 signal mechanisms (sync RETURN + async docs/signals/*.json).**
Agent count → `jq '.project.agents | length' docs/data/system-map.json`

---

## Related

- `.claude/skills/dispatch/SKILL.md` — Intent → Agent table SSOT
- `.claude/skills/zone-detect/SKILL.md` — Zone → dev-* specialist table SSOT (used by architect + dev-team execute-tier)
- `docs/protocols/agent-chaining-protocol.md` — return-block grammar, pipeline-state spec
- `docs/references/agent-roster.md` — team rosters + cooperation matrix
- `docs/references/tree-map.md` — full DAG of all docs
- `cowork-team` dispatcher (Sprint 1951) — `.claude/commands/cowork-team.md` → `docs/agents/cowork-team/flow/main.md`. Not an agent (no `.claude/agents/cowork-team.md`); it is a CronCreate command that reads `docs/data/cowork-schedule.json` and parallel-spawns cowork agents every 15 min. Replaces 16 RemoteTrigger slots. See `docs/standards/cron-jobs.md` § Dev-Team + Ops Agent Crons.
