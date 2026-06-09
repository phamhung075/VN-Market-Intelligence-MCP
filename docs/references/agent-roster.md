# Agent Roster

<!-- size-justification: 131L — canonical team structure SSOT: agent names, files, roles, schedules, + Dev team rosters. Single source of truth for agent coordination and spawn decisions; splitting into role/schedule/team groups loses the cross-reference benefit. -->

**Load when:** agent coordination, rewriting agent files, understanding team structure.

## Analysis Team (Claude Cowork)

Count → `docs/data/project-stats.json#analysisAgentCount`. Files live in `.claude/agents/`.

| Agent | File | Role | Cycle |
|-------|------|------|-------|
| Unified Coordinator | `unified-agent.md` | Coordinate + quality review + last-mile check | On-demand + Daily 22:00 VN + Sunday 20:00 VN |
| News Scout | `news-scout.md` | News, sentiment, impact chains, legal/crisis detection | 15 min (market) / 60 min (off) |
| BCTC Analyst | `bctc-analyst.md` | BCTC analysis (routine EY spread/valuation + earnings release QoQ/YoY); multi-pass trick detection; off-market only | 4x daily off-market (22:00/01:00/04:00/07:00 VN) — cron 0 15,18,21,0 UTC |
| Market Watcher | `market-watcher.md` | Prices, anomalies, supply chain, climate/energy | 5 min (market) / 2h (off) |
| Alert Commander | `alert-commander.md` | ONLY agent → MARKET channel | 10 min (market) / 30 min (off) |
| Digest & Predict | `digest-predict.md` | Daily/weekly digests + Monday prediction synthesis | Daily 22:30 VN / Monday 07:30 VN / Weekly Sunday / Monthly 1st |
| QA Responder | `qa-responder.md` | Answer /ask queue FIFO → MARKET | Every 12 min via askQueueCheck |
| Tran Ngoc Bau | `tran-ngoc-bau.md` | Strategy supervisor, quality audit, auto-cure | Daily 20:00 VN |
| FB Market Poster | `fb-market-poster.md` | Synthesize day's market intelligence → one plain-Vietnamese Facebook-ready post → docs/social/fb-post-YYYY-MM-DD.md | Daily 20:07 VN M-F (13:07 UTC) |

## Dev Team (Claude Code CLI — local cron)

| Agent | File | Role | Model |
|-------|------|------|-------|
| PO | `po.md` | Vision, approves specs, final sign-off | Opus |
| BA | `ba.md` | Requirements, edge cases, blockers | Sonnet |
| Architect | `architect.md` | Brownfield analysis, technical design, risk | Sonnet |
| PM | `pm.md` | Sprint planning, task breakdown, `orch-state.json .task_board` | Sonnet |
| Developer | `developer.md` | TDD implementation, DDD compliance | Sonnet |
| QA / CI-CD | `qa.md` | Test pipeline, merge gate, sprint report | Sonnet |
| Fixer | `fixer.md` | Minimum fixes on changes-requested tasks | Sonnet |
| **Ops** | **`ops.md`** | **VPS health, server restarts, incident response** | **Haiku** |
| Market Analyst | `market-analyst.md` | Investment analysis via MCP tools | Sonnet |
| Idea Forge | `idea-forge.md` | Brainstorm, refine, expand ideas | Sonnet |
| Cowork Refactory Expert | `cowork-refactory-expert.md` | Rewrite/update Cowork agent .md files | Sonnet |
| System Auditor | `system-auditor.md` | Health audit: memory, DB, docs sync, anomaly detection | Sonnet |
| Claude Manager Helper | `claude-manager-helper.md` | Context janitor: CLAUDE.md slim, docs sync, memory hygiene | Sonnet |
| Code Janitor | `code-janitor.md` | DRY auditor cron (every 3h): duplicate ticker maps, hard-coded arrays, magic numbers, schema duplication | Haiku |
| **Code Simplifier** | **plugin-provided** (`code-simplifier@claude-plugins-official`) | On-demand clarity/consistency/maintainability pass on recently-modified code; quality-only, no bug hunting; complements code-janitor (DRY) and /code-review (bugs); invoke post-QA-green or on user request | Sonnet |
| Agent Father | `agent-father.md` | Creates, edits, reviews, maintains all agents per AGENT_CREATION_GUIDE.md | Sonnet |
| Agents Architect | `agents-architect.md` | Design inter-agent comms, system context, architecture briefs → signals agent-father | Sonnet |
| Semble Search | `.claude/skills/semble-search/SKILL.md` | Code search decision guide: when to use Semble vs Grep/Glob/Read | N/A (skill, not agent) |

## Microservice Dev Agents (Claude Code CLI — zone-scoped)

All share flow: `docs/agents/developer/flow/microservice-main.md`
All share tool package: `docs/agents/tools/package/developer.md`

**Naming convention drift:** `apps/kinh-dich-service/` carries a `-service` suffix while all other microservices use bare names (`apps/alert-engine/`, `apps/stock-price/`, …). Architecture doc folder is `docs/architecture/microservice/kinh-dich/` (bare name). Recommend renaming `apps/kinh-dich-service/` → `apps/kinh-dich/` in a future developer task (touches Docker compose + imports).

**Doc ownership rule:** Each dev-* specialist is the sole committer of its zone doc folder. Architect writes only to `docs/architecture-briefs/`. Any architect brief that proposes doc edits under a microservice path MUST produce a signal routing the doc-write subtask to the relevant dev-* agent.

| Agent | File | Zone | Model | doc_owner |
|-------|------|------|-------|-----------|
| Dev MCP Server | `dev-mcp-server.md` | `apps/mcp-server/` | Sonnet | `docs/architecture/microservice/mcp-server/` |
| Dev API Gateway | `dev-api-gateway.md` | `apps/api-gateway/` | Sonnet | `docs/architecture/microservice/api-gateway/` |
| Dev Stock Price | `dev-stock-price.md` | `apps/stock-price/` | Sonnet | `docs/architecture/microservice/stock-price/` |
| Dev Technical Analysis | `dev-technical-analysis.md` | `apps/technical-analysis/` | Sonnet | `docs/architecture/microservice/technical-analysis/` |
| Dev Macro Indicators | `dev-macro-indicators.md` | `apps/macro-indicators/` | Sonnet | `docs/architecture/microservice/macro-indicators/` |
| Dev Kinh Dich | `dev-kinh-dich.md` | `apps/kinh-dich-service/` | Sonnet | `docs/architecture/microservice/kinh-dich/` |
| Dev Alert Engine | `dev-alert-engine.md` | `apps/alert-engine/` | Sonnet | `docs/architecture/microservice/alert-engine/` |
| Dev PDF Extractor | `dev-pdf-extractor.md` | `apps/pdf-extractor/` | Sonnet | `docs/architecture/microservice/pdf-extractor/` |
| Dev RAG Service | `dev-rag-service.md` | `apps/rag-service/` | Sonnet | `docs/architecture/microservice/rag-service/` |
| Dev Frontend | `dev-frontend.md` | `apps/frontend/` | Sonnet | `docs/architecture/microservice/frontend/` |

## Crawl Pipeline Agents (Claude Code CLI — source recon + scraper implementation)

Ops agents run HTTP recon and produce structured docs; Dev agents implement scrapers from those docs.

| Agent | File | Role | Zone |
|-------|------|------|------|
| Ops VPS Fetch | `ops-vps-fetch.md` | SSH recon on Vinahost VPS for geo-blocked VN sources | `docs/vps-sources/` |
| Ops Mainserver Fetch | `ops-mainserver-fetch.md` | Direct HTTP recon from main server for international sources | `docs/mainserver-sources/` |
| Dev VPS Crawls | `dev-vps-crawls.md` | Implement lightweight scrapers on VPS (no headless browser) | `docs/vps-crawl-techniques/` |
| Dev Mainserver Crawls | `dev-mainserver-crawls.md` | Implement scrapers on main server (headless browser permitted) | `docs/mainserver-crawl-techniques/` |

**Semble tools:** `developer`, `architect`, `ba`, `fixer`, `code-janitor`, `system-auditor` all carry `mcp__semble__search` + `mcp__semble__find_related` in their tool lists.

Dev team cron workflow:
- **Hourly cycle** (7 min UTC): po → ba → architect → pm → developer → qa → fixer → **ops** (baseline health check, ~30s)
- **Ops invocation:** After QA merge, baseline health check only (observes, does not take action unless escalated)
- **Early exit:** If all systems green + no VPS alerts for 7 days, skip diagnostics (check watchdog log only)

## Stock Classification

Full table → `docs/standards/portfolio-schema.md`

## Agent Cooperation Flow

| Signal | From → To |
|--------|-----------|
| `urgent_news` | News Scout → Market Watcher |
| `chain_catalyst` | News Scout → BCTC Analyst + Market Watcher |
| `fundamental_validation` | BCTC Analyst → Alert Commander |
| `price_confirmation` / `price_anomaly` | Market Watcher → Alert Commander |
| `verified_chain` | Server synthesizes 2+ confirmations → Alert Commander |
| `send_telegram(market)` | Alert Commander (05) / Digest & Predict (06) / QA Responder (07) → User |
| `submit_feedback` | All agents → BUG channel → Dev Team |
| `send_telegram(work)` | All agents → WORK channel → Dev Team |

## Handoff Protocol (Task Context Files)

Every task has a progressive context file at `docs/handoffs/TASK_NNN.md`. Agents append their section as the task flows through the chain.

| Agent | Action | Section written |
|-------|--------|----------------|
| PM | Creates file when task moves to Todo | `[PM] Planning Context` — file paths, layer, deps, acceptance criteria |
| Architect | Appends after brownfield scan (skip if section exists) | `[Architect] Brownfield Findings` — verified paths, decisions, scan clean flag |
| Developer | Appends before notifying QA | `[Developer] Implementation Record` — files modified, tests written, tsc/suite status |
| QA | Appends after review | `[QA] Review Record` — verdict, blocking issues with file+line, confirmed clean files |
| Fixer | Appends after fix | `[Fixer] Fix Record` — fixes applied with file+line, tests added |

**Rule**: Every agent reads `docs/handoffs/TASK_NNN.md` FIRST on startup. Do not re-discover file paths already listed in the handoff.

**Lifecycle**: File deleted when task is archived to `docs/TASKS_ARCHIVE.md`.

## Two-Team Architecture

```
ANALYSIS TEAM (Claude Cowork — cloud)
  Serves user with investment intelligence
  → MARKET channel = user-facing alerts/answers
  → WORK channel   = team status
  → BUG channel    = problem reports
        ↓ WORK + BUG
DEV TEAM (Claude Code CLI — local cron, every 1h)
  Reads BUG → auto-fixes → pushes to main
  → WORK: fix-shipped notices, sprint summaries
  → Restart: docker-compose (no hot reload, deterministic lockstep restart)
```

Channel env vars → `jq '.project.channels[] | {id, env_var, purpose}' docs/data/system-map.json`
Agent counts → `docs/data/project-stats.json`

**Analysis Team count:** 10 agents — see `docs/data/project-stats.json#analysisAgentCount`.

## Three-Channel Rules

Channel env vars and allowed senders → `jq '.project.channels[]' docs/data/system-map.json`
Query patterns → `.claude/skills/system-map-query/SKILL.md`

| Channel | Who Writes | Never Write |
|---------|------------|-------------|
| MARKET | Alert Commander (alerts), Digest & Predict (digests), QA Responder (/ask answers) | Internal dev reports, agent feedback |
| WORK | Dev Team, Unified Coordinator, all agents (status) | User-facing analysis |
| BUG | All analysis agents via `submit_feedback` | Anything not a bug |

Dev Team claims BUG reports, processes, deletes (keeps channel clean).

## Agent Routing Intent

→ Intent → Agent table SSOT: `.claude/skills/dispatch/SKILL.md`. Routing principles: `docs/references/agent-routing.md`.
