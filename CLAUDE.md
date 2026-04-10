# VN Market Intelligence MCP — Claude Project Context

> **How to use this file:** Read only the pointer lines relevant to your task. Open the linked doc ONLY when your current task touches that area. Do not preload all docs.

- Architecture, folder tree, data flow, data sources, mcp.config.json → `docs/ARCHITECTURE.md`
- Sprint-by-sprint implementation history → `docs/IMPLEMENTATION_STATUS.md`
- Full two-team AI architecture design → `docs/AI_TEAM_DESIGN.md`
- Dev workflow + branch hygiene checklist → `.claude/WORKFLOW.md`
- Vietnamese financial terms glossary → `docs/GLOSSARY_VI.md`
- MCP tool surface, tool-per-agent mapping → `.claude/knowledge/mcp-tools.md`
- Cron jobs, scheduler files, intelligence cycle → `.claude/knowledge/cron-jobs.md`
- Telegram bot commands, /ask queue → `.claude/knowledge/telegram-commands.md`
- Agent roster, cooperation flow, two-team design → `.claude/knowledge/agent-roster.md`
- Position schema, stop-loss, TP ladder → `.claude/knowledge/position-schema.md`
- Alert policy, firing rules, cooldowns → `.claude/knowledge/alert-policy.md`
- Kinh Dich default layer, hexagram integration → `.claude/knowledge/kinh-dich-layer.md`
- /ask FIFO queue, QA Responder protocol → `.claude/knowledge/ask-queue-protocol.md`
- Stock classification (VNM/FPT/VCB/HPG/VEA, trade exposure, sector peers) → `.claude/knowledge/stock-classification.md`
- Fail-loud knowledge-load failure protocol (full 5 steps) → `.claude/knowledge/fail-loud-protocol.md`
- Server restart policy (ban list, only allowed command, QA validation, launchctl failure recovery) → `.claude/knowledge/restart-policy.md`
- Historical / Done tasks (archive) → `docs/TASKS_ARCHIVE.md` (read ONLY when you need past task context)

---

## What this project is

A MCP (Model Context Protocol) server built in TypeScript running on Bun. It gives Claude real-time intelligence on the Vietnamese stock market (HOSE / HNX / UPCOM) by:

- Fetching and analyzing Vietnamese + global news via causal chain (global → country → sector → stock)
- Extracting and analyzing financial reports (BCTC) from congbothongtin.ssc.gov.vn
- Maintaining a RAG memory of past analyses using local embeddings (multilingual-MiniLM)
- Managing a user's stock watchlist and generating multi-signal alerts
- Running a daily scheduled briefing at market open/close

**Current state (Sprint 054 in progress):** 80 MCP tools, 23 scheduler files, 200+ tasks done.

---

## Fail-Loud Lazy-Load Protocol (mandatory for all agents)

If a knowledge file Read fails: alert WORK channel + submit_feedback, STOP cycle immediately, DO NOT fallback or guess. Full 5-step protocol → `.claude/knowledge/fail-loud-protocol.md`

---

## Critical Rules & Invariants

### Architecture
- **DDD layering**: `domain/` never imports `infrastructure/`. Violations break the test suite.
- Layer order: `domain` ← `application` ← `interface` ← `scheduler`. Cross-layer imports only go inward.
- **TDD**: every task starts with a failing test in `src/__tests__/NNN-*.test.ts`.

### Telegram — three channels, critical invariant
- **MARKET** (`TELEGRAM_INFO_MARKET_GROUP_ID`): user-facing alerts, briefings, digests, /ask answers. Alert Commander is the ONLY regular sender. Digest Writer (06) and QA Responder (07) also send here.
- **WORK** (`TELEGRAM_INFO_WORK_CHANNEL_ID`): dev status, fix-shipped, sprint summaries, agent reload requests. Dev team and unified-agent only.
- **BUG** (`TELEGRAM_REPORT_BUG_CHANNEL_ID`): actionable problem reports. Dev team claims, processes, deletes.
- **NO LEGACY ALIASES**: `TELEGRAM_CHAT_ID` / `TELEGRAM_REPORT_ID` are deleted. `channel: "chat"|"report"` replaced by `"market"|"work"|"bug"`. No shims.
- **Alert Commander exclusivity**: only `05-alert-commander.md` calls `send_telegram(channel="market")` for alerts. No other analysis agent writes alerts to MARKET.

### Production footguns
- **SQLite WAL checkpoint**: must run daily + on SIGTERM (`src/infrastructure/db/checkpoint.ts`). Skipping causes unbounded WAL growth → disk fill.
- **SQL parameter binding**: all SQLite queries must use parameterized bindings. Never string-interpolate user input into SQL.
- **Circuit breaker**: wrap every external HTTP fetch with the circuit breaker registry (`src/infrastructure/circuitBreakerRegistry.ts`).
- **Rate limiter**: every fetcher must call the per-host rate limiter (`src/domain/services/rateLimiter.ts`) before making requests.
- **`--no-verify` is forbidden**: never skip git hooks.
- **WIP limit**: max 2 tasks In Progress simultaneously in TASKS.md.
- **Branch hygiene**: every task MUST end with `git checkout main`, merged branch deleted (local + remote), worktrees under `.claude/worktrees/` removed, stashes dropped. Full checklist → `.claude/WORKFLOW.md#branch-hygiene-checklist`.
- **Server restart — launchctl ONLY**: production Bun is supervised by `launchd/com.vn-market.mcp.plist`. The ONLY authorized way to restart the server after a code change is `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp`. **DO NOT use `./start.sh`, `bun --hot`, `bun --watch`, `nodemon`, `pm2`, `forever`, or any other fast-restart mechanism.** Hot reload is explicitly forbidden — all code changes require a full launchctl kickstart. This is non-negotiable. Rationale: deterministic state reset, no half-loaded modules, no zombie watchers. Full guide → `README.md#step-3b-install-the-macos-launchd-agent`.
- **VPS price proxy**: VN stock APIs geo-blocked from France. Vultr VPS (Singapore, `vn-price-fetch.service`, systemd `Restart=always`) pushes prices via `POST /api/push-prices`. Never add SSH logic to Bun schedulers. `vpsProxyWatchdogJob.ts` is observe-only. Full design → `docs/ARCHITECTURE.md#vps-price-proxy`.

### Methodology
- **Agile/Kanban**: `TASKS.md` is the Kanban board — contains ONLY active work (Backlog/Todo/In Progress/Review). Done and historical tasks live in `docs/TASKS_ARCHIVE.md` — do NOT re-add them to TASKS.md. When a task is completed, move it verbatim to the archive.
- **Auto-merge**: Dev team auto-merges to main, always commits separately for rollback
- **No hot reload**: hot reload / `bun --hot` / `bun --watch` are FORBIDDEN in this project. Restart is always a full launchctl kickstart (see footgun above).
- **Reports**: `reports/TASK_REPORT_NNN.md` generated by QA after every review

---

## Development

```bash
bun install                                             # install dependencies
bun test                                                # run tests (no server needed)
bun tsc --noEmit                                        # typecheck

# Restart production server after code change (ONLY supported method):
launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp

# Server endpoints
GET  http://localhost:3000/sse               ← Claude connects here
POST http://localhost:3000/messages?sessionId=<id>
GET  http://localhost:3000/health
```

Start a new feature: `Use @po agent: "I want to add [feature]. Investment goal: [why]."`

Output artifacts:
```
docs/REQ_NNN.md              ← BA
docs/TECH_NNN.md             ← Architect
reports/TASK_REPORT_NNN.md   ← QA
reports/SPRINT_REPORT_NNN.md ← QA
SPRINT_GOAL.md               ← PO
```

Claude Desktop config: `{ "mcpServers": { "vn-market": { "url": "http://localhost:3000/sse" } } }`
