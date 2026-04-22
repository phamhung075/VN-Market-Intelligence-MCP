# VN Market Intelligence MCP — Claude Project Context

> **How to use:** Read pointer lines relevant to your task. Open linked doc ONLY when task touches that area. Do not preload. Full dependency graph → `.claude/knowledge/tree-map.md`

### Active Skills (always loaded)
- **Caveman** (communication compression) → `.claude/skills/caveman/SKILL.md`
  - **ultra**: agent-to-agent, internal thinking, subagent prompts
  - **lite**: user-facing replies

### Agent Memory (`docs/agent-memory/` = lazy-load shared workbook)
- **INDEX.md** (quick lookup, always load first, ~300 tokens) → `docs/agent-memory/INDEX.md`
- **issues/** (load only when debugging relevant bug)
- **patterns/** (load when writing code that touches that pattern)
- **modules/** (load when analyzing/refactoring a module)
- **sessions/** (load when checking recent agent work, avoid duplicates)

### Knowledge (`.claude/knowledge/*.md` = logic/rules, stable)
- **Tree map** (canonical file DAG, write ownership, dependency rules) → `.claude/knowledge/tree-map.md`
- MCP tool logic, per-agent mapping, signal types → `.claude/knowledge/mcp-tools.md`
- Cron scheduling logic, intelligence cycle → `.claude/knowledge/cron-jobs.md`
- Telegram bot commands, /ask /why routing → `.claude/knowledge/telegram-commands.md`
- Alert firing rules, Commander exclusivity, cooldowns → `.claude/knowledge/alert-policy.md`
- Agent roster, cooperation flow, two-team design → `.claude/knowledge/agent-roster.md`
- Portfolio: position ledger rules, stop-loss formula, TP ladder → `.claude/knowledge/portfolio-schema.md`
- Kinh Dich default layer, hexagram integration → `.claude/knowledge/kinh-dich-layer.md`
- /ask FIFO queue, QA Responder protocol → `.claude/knowledge/ask-queue-protocol.md`
- Fail-loud knowledge-load failure protocol (5 steps) → `.claude/knowledge/fail-loud-protocol.md`
- Server restart policy (launchctl only, banned mechanisms) → `.claude/knowledge/restart-policy.md`
- DDD layer rules, coding standards, test template, commit format → `.claude/knowledge/dev-standards.md`
- Code janitor scan checklist, canonical sources, output contract → `.claude/knowledge/janitor-procedures.md`
- Market analysis: cascade framework, trade maps, macro matrix, BCTC checklist → `.claude/knowledge/market-analysis.md`
- QA review checklist: TDD/DDD/TS/security, task report template → `.claude/knowledge/qa-checklist.md`

### Volatile Data (`docs/data/*.json` = counts/lists, agents update during work)
- Tool registry (tool list + count) → `docs/data/tool-registry.json`
- Cron registry (job list + count) → `docs/data/cron-registry.json`
- Stock classification (tickers, sectors, trade exposure, peers) → `docs/data/stock-classification.json`
- Project stats (sprint number, counts) → `docs/data/project-stats.json`

### Docs (reference, rarely changes)
- Architecture, folder tree, data flow → `docs/ARCHITECTURE.md`
- Sprint-by-sprint implementation history → `docs/IMPLEMENTATION_STATUS.md`
- Two-team AI architecture design → `docs/AI_TEAM_DESIGN.md`
- Dev workflow + branch hygiene → `.claude/WORKFLOW.md`
- Vietnamese financial terms → `docs/GLOSSARY_VI.md`
- Historical / Done tasks → `docs/TASKS_ARCHIVE.md`

---

## What this project is

MCP server (TypeScript, Bun) giving Claude real-time VN stock market intelligence (HOSE/HNX/UPCOM):
- Fetch + analyze Vietnamese/global news via causal chain (global → country → sector → stock)
- Extract + analyze BCTC financial reports from congbothongtin.ssc.gov.vn
- RAG memory via local embeddings (multilingual-MiniLM)
- Watchlist management + multi-signal alerts
- Daily scheduled briefings at market open/close

**Current sprint + stats** → `docs/data/project-stats.json`

---

## Fail-Loud Lazy-Load Protocol (mandatory for all agents)

If a knowledge file Read fails: `send_telegram(channel="work")` + `submit_feedback`, STOP cycle, DO NOT fallback or guess. Full 5 steps → `.claude/knowledge/fail-loud-protocol.md`

---

## Critical Rules & Invariants

### Architecture
- **DDD layering**: `domain/` never imports `infrastructure/`. Violations break the test suite.
- Layer order: `domain` ← `application` ← `interface` ← `scheduler`. Cross-layer imports inward only.
- **TDD**: every task starts with a failing test in `src/__tests__/NNN-*.test.ts`.

### Telegram — three channels
- **MARKET** (`TELEGRAM_INFO_MARKET_GROUP_ID`): user alerts, briefings, digests, /ask answers. Alert Commander is ONLY regular sender. Digest Writer (06) + QA Responder (07) also send here.
- **WORK** (`TELEGRAM_INFO_WORK_CHANNEL_ID`): dev status, fix-shipped, sprint summaries. Dev team + unified-agent only.
- **BUG** (`TELEGRAM_REPORT_BUG_CHANNEL_ID`): actionable problem reports. Dev team claims, processes, deletes.
- **NO LEGACY ALIASES**: `TELEGRAM_CHAT_ID` / `TELEGRAM_REPORT_ID` deleted. `channel:"chat"|"report"` → `"market"|"work"|"bug"`. No shims.
- **Alert Commander exclusivity**: only `05-alert-commander.md` calls `send_telegram(channel="market")` for alerts.

### Production footguns
- **SQLite WAL checkpoint**: run daily + on SIGTERM (`src/infrastructure/db/checkpoint.ts`). Skip → unbounded WAL growth → disk fill.
- **SQL parameter binding**: all SQLite queries use parameterized bindings. Never string-interpolate user input into SQL.
- **Circuit breaker**: wrap every external HTTP fetch (`src/infrastructure/circuitBreakerRegistry.ts`).
- **Rate limiter**: every fetcher calls per-host rate limiter (`src/domain/services/rateLimiter.ts`) before requests.
- **`--no-verify` forbidden**: never skip git hooks.
- **WIP limit**: max 2 tasks In Progress in TASKS.md.
- **Branch hygiene**: every task ends with `git checkout main`, merged branch deleted (local+remote), worktrees under `.claude/worktrees/` removed, stashes dropped. Full checklist → `.claude/WORKFLOW.md#branch-hygiene-checklist`.
- **Server restart — launchctl ONLY**: `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp`. NEVER `./start.sh`, `bun --hot`, `bun --watch`, `nodemon`, `pm2`, `forever`, or any hot-reload tool. Non-negotiable — deterministic state reset, no half-loaded modules, no zombie watchers. Full guide → `.claude/knowledge/restart-policy.md`.
- **VPS proxies (five services)**: VN stock APIs, SSC BCTC portal, news sources, SBV FX rates, and foreign flow data are geo-blocked from France. Vinahost VPS Vietnam (`$VINAHOST_IP`) runs five systemd services: `vn-price-fetch.service` (prices, 60s), `vn-bctc-fetch.service` (BCTC PDFs, 6h), `vn-news-fetch.service` (10 news sources, 226 items/15min), `vn-sbv-fetch.service` (SBV FX rates, 30min), `vn-foreign-flow.service` (foreign buy/sell, 60s). Deploy: `./deploy-vinahost.sh`. Health check: `ssh root@$VINAHOST_IP /root/vps-status.sh`. Bot-guarded sources: `vps-scripts/fetch-browser.py` (Playwright/Chromium). Never add SSH logic to Bun schedulers. `vpsProxyWatchdogJob.ts` observe-only. Full design → `docs/ARCHITECTURE.md#vps-proxy-geo-block-workaround`.

### Methodology
- **Kanban**: `TASKS.md` = active work only (Backlog/Todo/In Progress/Review). Done tasks → `docs/TASKS_ARCHIVE.md`. Never re-add archived tasks to TASKS.md.
- **Auto-merge**: Dev team auto-merges to main, commits separately for rollback.
- **No hot reload**: `bun --hot` / `bun --watch` FORBIDDEN. Always full launchctl kickstart.
- **Reports**: `reports/TASK_REPORT_NNN.md` by QA after every review.

---

## Development

```bash
bun install && bun test && bun tsc --noEmit
launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp  # only restart method
curl http://localhost:3000/health                        # verify
```

Endpoints: `GET /sse` | `POST /messages?sessionId=<id>` | `GET /health`

Start feature: `Use @po agent: "I want to add [feature]. Investment goal: [why]."`

Artifacts: `docs/REQ_NNN.md` (BA) | `docs/TECH_NNN.md` (Architect) | `reports/TASK_REPORT_NNN.md` (QA) | `SPRINT_GOAL.md` (PO)

Claude Desktop: `{ "mcpServers": { "vn-market": { "url": "http://localhost:3000/sse" } } }`

## graphify

This project has a **persistent graphify knowledge graph** at `graphify-out/` (4515 nodes, 7174 edges, built 2026-04-20).

**For queries:** Graph is ready. Use `/graphify query "..."` to explore—no rebuild needed.

**For updates:** After code changes, run `/graphify update .` to refresh (AST-only, no install cost). Do NOT install graphify unless explicitly needed—the skill handles it intelligently.

Rules:
- Before answering architecture questions, read `graphify-out/GRAPH_REPORT.md` (god nodes + communities)
- For god node definitions, check lines 274-284 of GRAPH_REPORT.md
- Surprising connections are at line 286 (cross-cutting patterns the graph found)
- Do NOT ask to install graphify if graph.json already exists
