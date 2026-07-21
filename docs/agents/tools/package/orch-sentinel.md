# Tool Package — Orch Sentinel

**Location:** `docs/agents/tools/package/orch-sentinel.md`
**Load when:** agent starts

## How to Invoke Tools

Invoke via gateway: `call_tool(server="vn-market", tool="<name>", arguments={...})` — grammar SSOT: project CLAUDE.md § MCP Tools. Wrong: tool_name/input/vnmarket-mcp.

## File System Tools

| Tool | Purpose |
|------|---------|
| Read | Read cross-fleet doc/data-plane: all agent notebooks/flow docs/init.md, system-map.json, tool-registry.json, tool-usage-stats.json, orch-state.json `.task_board`/`.signal_queue`, prior scorecard |
| Write | Write ONLY: `docs/agent-memory/notebooks/orch-sentinel.md` (OVERWRITE, ≤80L) and `docs/data/orch-sentinel-scorecard.md` (full regenerate). `orch-state.json .signal_queue` writes go through `scripts/orch-apply.sh` (Bash), never a raw Write call. |
| Edit | Not used for the notebook (Write full-overwrite per AC-6 OVERWRITE class) — reserved for minor scorecard touch-ups only, in-cycle. |
| Glob | `docs/agents/*/init.md`, `docs/agent-memory/notebooks/*.md`, `docs/agents/tools/package/*.md`, `docs/agents/tools/list/*.md`, `docs/signals/*.json` (count only) |
| Grep | Parse `probe.sh` + flow-doc endpoint/check-table references (OH-3.1), belief-axis scope declarations (OH-2.1), `drain-signals.md`/`signal-dashboard/SKILL.md` live threshold lines (OH-1.4/OH-1.5) |
| Bash | READ-ONLY jq/grep passes over local JSON/doc files + `scripts/orch-apply.sh` (the ONLY write path to orch-state.json) + `scripts/auditor-notebook-commit.sh` (commit, `AUDITOR_COMMIT_OWNER_AGENT=orch-sentinel`). No docker/infra commands — orch-sentinel never probes runtime infra (that is system-auditor's job). |

## MCP Tools

All called via `call_tool(server="vn-market", tool="<name>", arguments={...})`.

| Tool | Dimension | Purpose |
|------|-----------|---------|
| get_cron_health | OH-1 | Cron fire-gap corroboration input where relevant to signal plumbing |
| get_pipeline_health | OH-3 | Freshness read used only as OH-3 context, never re-probed as an infra check |
| get_vps_proxy_health | OH-3.2 | Live VPS route count — one of the 3 planes in the 3-way compare |
| get_alerts | OH-1/OH-4 | Cross-reference for signal-plane sanity checks |
| task_claim | fire-election | Elect single leader per cron tick (`cron:orch-sentinel-full:<tick>` / `cron:orch-sentinel-lite:<tick>`) |
| task_heartbeat | fire-election | Re-entrant renewal within same session mid-tick |
| task_release | fire-election | Release at end-of-cycle, after notebook/scorecard/signal_queue writes complete |
| task_list_held | (not used) | Reserved — orch-sentinel does not audit task-lock state; that is system-auditor D4/D-N's job |
| send_telegram | all | BUG channel: fail-loud source-read failure, SIGNAL-ROW-ASSERT failure. WORK channel: fire-election skip notice only. |

**`post_agent_signal` is NOT used** — findings write directly to `docs/data/orch/orch-state.json .signal_queue.rows[]` via `scripts/orch-apply.sh` (Bash), per the write contract below. This is a deliberate divergence from system-auditor's `emit-audit-signal.sh` pipeline (that script is system-auditor's own dedup-ledger-bound path).

### MCP Call Grammar

```
# Fire-election claim
call_tool(server="vn-market", tool="task_claim", arguments={task_id: "cron:orch-sentinel-full:<tick>", task_kind: "sprint-task", owner_agent: "orch-sentinel", owner_client_session: $CLAUDE_CODE_SESSION_ID, ttl_seconds: 600, payload: {"site":"fire-election","mode":"FULL","tick":"<tick>"}})

# Fire-election release
call_tool(server="vn-market", tool="task_release", arguments={task_id: "cron:orch-sentinel-full:<tick>", owner_client_session: $CLAUDE_CODE_SESSION_ID})

# VPS route health (OH-3.2 plane)
call_tool(server="vn-market", tool="get_vps_proxy_health", arguments={})

# BUG channel alert
call_tool(server="vn-market", tool="send_telegram", arguments={channel: "bug", message: "[orch-sentinel] <one-line error>"})

# WORK channel — fire-election skip notice
call_tool(server="vn-market", tool="send_telegram", arguments={channel: "work", message: "[orch-sentinel] MODE fire-election SKIP tick=<tick> (peer session leads)"})
```

**Anti-discovery constraint:** NEVER use `list_servers`, `search_tools`, or `list_server_tools` at runtime. All tools above are pre-catalogued and must be called directly.

## Bash Check Grammar

```bash
# Signal-queue write — the ONLY write path to orch-state.json
jq '.signal_queue.rows += [{...}]' docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

# Notebook + scorecard commit (mutex-paired, explicit pathspec)
AUDITOR_COMMIT_OWNER_AGENT=orch-sentinel bash scripts/auditor-notebook-commit.sh \
  "chore(memory/orch-sentinel): cycle <MODE> YYYY-MM-DD" \
  docs/agent-memory/notebooks/orch-sentinel.md docs/data/orch-sentinel-scorecard.md

# OH-1.4 file-plane count
ls docs/signals/*.json | wc -l

# OH-1.5 / OH-1.6 / OH-1.1 queue-plane jq passes
jq '.signal_queue.rows | length' docs/data/orch/orch-state.json

# OH-3.1 probe-coverage grep
grep -n "http://\|/health" docs/agents/system-auditor/probe.sh

# OH-3.3 self-promotion guard
grep -rn "AUDIT_TIER=4" .claude/commands/crons/*.md
```

## Constraints & Permissions

- **Observe-only:** never fixes, never modifies another agent's file, flow doc, or cron config.
- **No self-resolve:** never flips status on ANY signal_queue row, including its own.
- **Write boundary:** `docs/agent-memory/notebooks/orch-sentinel.md` (OVERWRITE, ≤80L) + `docs/data/orch-sentinel-scorecard.md` (full regenerate) + `docs/data/orch/orch-state.json .signal_queue.rows[]` (via `scripts/orch-apply.sh` ONLY). No other filesystem writes.
- **Corroboration gate:** only OH-3.3 may emit CRITICAL directly; everything else requires 2 independent planes to escalate past HIGH.
- **Anti-flood dedup:** skip any candidate row whose `check_id` already has a `status=NEW` row from `orch-sentinel` in `.signal_queue.rows[]`.
- **No hardcoded stats:** every threshold read live from its owning source each cycle (§2 of the architecture brief).
- **Market channel:** write=false, never.

## Channel Permissions

| Channel | Access | Rules |
|---------|--------|-------|
| bug | write | Fail-loud source-read failure only; SIGNAL-ROW-ASSERT failure |
| work | write | Fire-election skip notice only |
| market | read | never write |
