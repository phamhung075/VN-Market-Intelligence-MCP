# Scheduled Task Failure Report — unified-agent

**Run:** 2026-05-05T21:05Z (Tue 21:05 UTC / 2026-05-06 04:05 VN)
**Agent:** unified-agent (Analysis Team Coordinator)
**Cycle slot:** Evening digest / EOD window (between 20:00 UTC daily review and 22:30 VN two-team resume)
**Outcome:** **CYCLE NOT EXECUTED** — backend MCP server unreachable from this Cowork session.

---

## Finding

The scheduled task `vn-unified-agent` cannot run its mandatory cycle because the project's MCP backend is not reachable from the Cowork sandbox that hosts this scheduled task.

### Evidence

1. **Pipeline state** — `docs/pipeline-state.json` is `idle`, `updatedAt: 2026-05-05T06:30:00Z`. No resume-on-crash conditions hit. The cron is supposed to be free to run.
2. **`.mcp.json`** at repo root contains `"mcpServers": {}` — empty. Cowork session has no direct registration of the local docker-compose MCP at `http://localhost:3000`.
3. **MCP proxy `vn-market` server** — call_tool returns:
   `dial vn-market: calling "initialize": sending "initialize": failed to connect (session ID: ): session not found`
   Server name IS registered upstream (different error vs. unknown server) but the session bind is broken.
4. **Direct HTTP** — `https://zenmidi.com/` and `https://zenmidi.com/vn-market/...` both return `ERR_CONNECTION_REFUSED` from sandbox. The host is documented (in `.env`) only as the **Telegram webhook** target, not as an MCP HTTPS endpoint. The actual MCP runs on `http://localhost:3000` per `README.md` and `.claude/settings.local.json`. That port is not reachable from the Cowork sandbox network.

### Consequence

Mandatory cycle steps **cannot be executed**:

- Step 0 (`get_agent_signals`), Step 1 (`get_system_status`, `get_rate_limit_status`), Step 1b (`read_telegram_reports`, `get_recent_fixes`), Steps 2–5 (market / portfolio / domain intelligence), Step 4c (last-mile review), Step 4d (message quality audit), Step 6 reporting.
- Mandatory cycle ending: `submit_feedback` (BUG) OR `send_telegram(channel="work")` (heartbeat) — **both blocked**.
- Even the fail-loud protocol (`.claude/knowledge/fail-loud-protocol.md`) cannot fire, because steps 1–2 of that protocol are themselves `send_telegram` and `submit_feedback`.

The skill instruction "NEVER 'no issues' to BUG" is not at risk (BUG is unreachable). The skill instruction "Every cycle MUST end with submit_feedback OR send_telegram" is **violated by environmental failure, not by the agent**.

---

## Severity

**Critical for this scheduled task; unknown impact on others.**

If other scheduled tasks (Alert Commander, Digest Writer, the 6 analysis agents 01–07) share the same Cowork session and the same broken MCP bind, the entire Analysis Team is silently no-op'ing every scheduled run — meaning:

- No alerts, briefings, or digests are reaching the MARKET channel.
- No bug reports are reaching the BUG channel.
- Dev Team has nothing in its inbox not because the system is healthy, but because the upstream pipeline is silent.

This pattern is exactly the **S3 inferred cron failure** that the unified-agent cycle is supposed to detect — but the detection itself depends on the MCP being up, so it cannot self-report.

I cannot verify the scope from inside the broken environment. Independent confirmation requires checking either (a) the MARKET / WORK / BUG Telegram channels for recent activity, or (b) the docker-compose health endpoint at `http://localhost:3000/health` from the user's local machine.

---

## What was checked

| Check | Result |
|-------|--------|
| `docs/pipeline-state.json` | `idle`, last update 2026-05-05T06:30Z by `dev-team-cron` |
| `.mcp.json` | empty (`"mcpServers": {}`) |
| `.claude/settings.json` / `settings.local.json` | references `127.0.0.1:3000` only |
| MCP proxy `call_tool` server `zenmidi` | `unknown server` |
| MCP proxy `call_tool` server `vn-market` | session-init failure |
| `https://zenmidi.com/` | connection refused |
| `https://zenmidi.com/vn-market/messages` | connection refused |
| `.env` zenmidi mention | only `TELEGRAM_WEBHOOK_URL=https://zenmidi.com/webhook` |
| Knowledge files (`.claude/knowledge/*.md`) | readable from sandbox |

Local repo files are reachable; the runtime backend is not.

---

## Probable root causes (ordered by likelihood)

1. **Cowork session missing MCP server registration.** `.mcp.json` is empty — whichever process launches this scheduled-task agent in Cowork mode never received the `vn-market` MCP config. The `call_tool` proxy has a registry entry but the per-session attach failed (note the "session ID: ) not found" wording — looks like an empty/missing session token).
2. **Local docker-compose MCP not running** on the user's machine, or running on a host the Cowork session can't reach (sandbox network can't see `localhost:3000` of the user's Mac unless tunneled).
3. **No public MCP HTTPS endpoint exists** — the docs reference `https://zenmidi.com/mcp` in the SKILL.md prelude, but `zenmidi.com` only handles the Telegram webhook in `.env`. The HTTPS-to-localhost-3000 reverse-proxy may be down or never configured.

Without the MCP up, all eight scheduled cowork agents (01–07 + unified-agent) are running into the same wall.

---

## Recommended remediation (cannot self-execute — requires environment fix)

Per project CLAUDE.md interdiction I do not direct the user to run commands. The `ops` agent owns this class of failure (Switch table: "system health / audit → system-auditor", "bug / broken (infra) → ops"). However, `ops` is itself a Claude Code agent that runs locally — invoking it from the broken Cowork session is not possible.

The fix path lives outside this scheduled-task run. Once the MCP is reachable, the next scheduled cycle will pick up automatically; pipeline-state remains `idle` and unblocked.

---

## What to verify next time MCP is up

When a future cycle reaches a healthy MCP:

1. `get_system_status` → confirm 9/9 services + 112 tools + 50 jobs healthy.
2. `read_telegram_reports(status="new")` — there is likely a backlog of stale "[ESCALATE]" candidates because the unclaimed-age clock has been advancing while the MCP was down.
3. `get_recent_fixes(days=2)` — confirm whether the Dev Team cron also went silent (S3 detection).
4. `get_alerts(hours_back=48)` — measure how long the silence lasted.
5. File ONE `submit_feedback(category="performance_issue", priority="critical", title="MCP backend unreachable from Cowork scheduled-task session")` with the timestamp range covered by this report, then a `send_telegram(channel="work")` summary.

---

## Output classification

Per scheduled-task wrapper guidance ("When in doubt, producing a report of what you found is the correct output"), this file is the cycle output. No write actions (no `submit_feedback`, no `send_telegram`, no `batch_review_market_messages`) were attempted, because the tools are unreachable and silent retries would only burn budget.
