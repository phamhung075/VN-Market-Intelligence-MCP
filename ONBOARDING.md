# Welcome to VN Market Intelligence — Dev Team & Cowork Analysis Team

## How We Use Claude

Based on report-analyzer's usage over the last 30 days:

Work Type Breakdown:
  Debug Fix         ██████░░░░░░░░░░░░░░  30%
  Build Feature     █████░░░░░░░░░░░░░░░  25%
  Plan Design       ████░░░░░░░░░░░░░░░░  20%
  Improve Quality   ███░░░░░░░░░░░░░░░░░  15%
  Analyze Data      ██░░░░░░░░░░░░░░░░░░  10%

Top Skills & Commands:
  /crons:cron-dev-team               ████████████████████  141x/month
  /goal                              █████░░░░░░░░░░░░░░░   32x/month
  /crons:cron-claude-manager-helper  ████░░░░░░░░░░░░░░░░   30x/month
  /crons:cron-tran-ngoc-bau          ████░░░░░░░░░░░░░░░░   26x/month
  /crons:cron-agent-father           ██░░░░░░░░░░░░░░░░░░   16x/month
  /commit                            ██░░░░░░░░░░░░░░░░░░   15x/month
  /crons:cron-system-auditor         ██░░░░░░░░░░░░░░░░░░   14x/month
  /crons:cron-cowork-team            ██░░░░░░░░░░░░░░░░░░   11x/month
  /crons:cron-code-janitor           █░░░░░░░░░░░░░░░░░░░   10x/month
  /cron-cowork-team                  █░░░░░░░░░░░░░░░░░░░   10x/month

Top MCP Servers:
  claude_ai_gateway          ████████████████████  4298 calls
  vn-market                  ██████░░░░░░░░░░░░░░  1299 calls
  claude_ai_vn-market-mcp    █░░░░░░░░░░░░░░░░░░░   128 calls
  computer-use               ░░░░░░░░░░░░░░░░░░░░    33 calls
  gateway                    ░░░░░░░░░░░░░░░░░░░░    27 calls
  vn-market-mcp              ░░░░░░░░░░░░░░░░░░░░     6 calls
  semble                     ░░░░░░░░░░░░░░░░░░░░     4 calls

## Your Setup Checklist

### Codebases
- [ ] vn-market-intelligence-mcp — https://github.com/phamhung075/vn-market-intelligence-mcp (the main project; contains all agent flows, microservices, dashboards)
- [ ] kinhdich_logic — sibling repo with I-Ching trading logic referenced by the kinh-dich service
- [ ] vn-stock-api-mcp — sibling repo for the VN stock API integration

### MCP Servers to Activate
- [ ] **claude_ai_gateway** — proxy/gateway in front of all downstream MCP servers (call `list_servers` to see what's behind it). This is how most agents talk to backing services.
- [ ] **vn-market** (https://zenmidi.com) — primary VN market intelligence MCP: prices, BCTC, news, FX, foreign-flow. Ask the team lead for the gateway URL & token.
- [ ] **claude_ai_vn-market-mcp** — alternate route to the vn-market server tools via the gateway.
- [ ] **computer-use** — desktop control (screenshots, clicks). Needed for occasional UI inspection / iTerm2 setup.
- [ ] **semble** — semantic code search. Prefer this over Grep/Glob for exploratory questions.

### Skills to Know About
- [ ] `/crons:cron-dev-team` — fires the dev-team master dispatcher (po → ba → architect → pm → developer → qa → fixer chain). This is the workhorse — used ~5x/day.
- [ ] `/crons:cron-cowork-team` and `/cron-cowork-team` — cowork master dispatcher (analysis agents: news-scout, market-watcher, unified-agent, etc.). Must be re-armed after every session restart — see `.claude/skills/cron-cowork-team/SKILL.md`.
- [ ] `/crons:cron-claude-manager-helper` — context janitor; prunes memory and validates DAG integrity.
- [ ] `/crons:cron-tran-ngoc-bau` — strategy supervisor; audits chef narratives in MARKET dishes for 6-layer completeness.
- [ ] `/crons:cron-agent-father` — creates/edits/reviews agents per `.claude/skills/agent-md-factory/SKILL.md`.
- [ ] `/crons:cron-system-auditor` — detects anomalies in memory/DB/logs and reports new problems to BUG channel.
- [ ] `/crons:cron-code-janitor` — finds hardcoded duplication, magic values, schema duplication.
- [ ] `/goal` — declare/track the active goal for the current sprint or pilot.
- [ ] `/commit` — commit per `docs/policies/commit-convention.md`.
- [ ] `/graphify` — turn any input into a knowledge graph (`~/.claude/skills/graphify/SKILL.md`).

## Team Tips

- **Main terminal is a router only — never implement directly.** Read `.claude/skills/dispatch/SKILL.md`, match the intent to the right agent, and spawn that agent. Never spawn `general-purpose` or `claude` for dev intents. If unsure, spawn `po`.
- **No branches — all work stays on `main`.** All agents are backgrounded by default.
- **Dev Team vs Cowork Team:** Dev Team = code work (po → ba → architect → pm → developer → qa → fixer). Cowork Team = market-analysis agents (news-scout, market-watcher, unified-agent, tran-ngoc-bau). They're dispatched by separate cron skills.
- **Re-arm cowork master dispatcher after every session restart** via `/cron-cowork-team` (see `.claude/skills/cron-cowork-team/SKILL.md`).
- **Mock with JSON or test DB — never production credentials in sandbox.** Pilot sandbox processes must have ZERO DB creds and ZERO external API keys.
- **Verbatim beats AC counts.** When a task's acceptance-criteria numeric count conflicts with a verbatim source section, follow the verbatim source and flag the count discrepancy. The plan gets fixed, not the file.
- **After every dev task:** update related docs and run `/graphify docs --update --no-viz`. Encoded in `docs/agents/developer/flow/main.md`.
- **Never hardcode tool/cron/zone counts** — query `docs/data/system-map.json` with `jq`. Patterns in `.claude/skills/system-map-query/SKILL.md`.
- **Don't ask the user — spawn `po` for decisions and continue.** User is config admin, not technical operator.

## Get Started

The active pilot is the **three-tier fractal architecture rebuild** of the `technical-analysis` microservice — the first end-to-end test of the primitives → modules → microservices pattern with a dashboard trust layer.

1. Read the pilot charter: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` (binding 12-goal contract G1-G12 across Trust / Dashboard / AI-fixability tracks).
2. Read the deep-module refactor brief: `docs/architecture-briefs/2026-05-22-deep-module-ddd-with-dashboards.md`.
3. Check live pilot status: `docs/data/pilot-status.json`.
4. Read the Phase 1 task plan: `docs/architecture-briefs/2026-05-22-refactor/phase-1-task-plan.md` to see what's in flight (currently P1-A complete, P1-B primitive extraction up next).
5. When you're ready to pick up work, spawn `po` and ask "what's next on the pilot" — PO will route you to the right next atomic task.

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
