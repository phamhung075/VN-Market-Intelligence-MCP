# Tool Package — System Auditor

**Location:** `docs/agents/tools/package/system-auditor.md`
**Load when:** agent starts

## File System Tools

| Tool | Purpose |
|------|---------|
| Read | Read configuration, logs, system state files |
| Write | Write notebook (docs/agent-memory/notebooks/system-auditor.md) and `docs/data/orch/orch-state.json` `.signal_queue` rows only (atomic write per §2.3) |
| Edit | Update notebook only; use Write for orch-state.json (atomic temp→rename required) |
| Glob | Find config files, logs, state files across directories |
| Grep | Search logs for errors, warnings, anomalies |
| Bash | READ-ONLY health probes ONLY. Permitted: docker ps, docker inspect, docker stats --no-stream, docker logs --since, docker events (read), docker exec mcp-server <sqlite3/curl/ls/which/tesseract>, curl -sf (health endpoints), df -h, free -h. FORBIDDEN: docker stop, docker kill, docker rm, docker restart, docker compose down, docker compose up, kill, pkill, killall, rm -rf <any live dir>. Violation = abort cycle, send_telegram(bug, "PLAN-ONLY violation aborted: <command>"). |

## MCP Tools

All called via `mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "<name>", arguments: {...}})`.

| Tool | Tier | Purpose |
|------|------|---------|
| get_system_status | 1 | MCP-level system status rollup |
| get_cron_health | 1,2 | Last-run timestamp per cron job — compare to expected cadence |
| get_pipeline_health | 2 | Per-source last successful fetch timestamp → Dimension B |
| get_vps_proxy_health | 2 | All 7 geo-blocked route health → Dimension B VPS check |
| get_vps_service_health | 2 | Per-route HTTP status → Dimension B VPS check |
| get_rate_limit_status | 2 | Source rate limit saturation → Dimension B |
| get_macro_snapshot | 2 | Macro indicator freshness check → Dimension B |
| get_sla_status | 2 | Freshness SLA alignment validation |
| get_alerts | 3 | Cross-table consistency — alerts vs agent_signals → C-08 |
| get_bctc_full | 3 | BCTC financial_reports coverage → C-03, C-04 |
| post_agent_signal | all | Emit typed audit signals: system_health_report, microservice_degraded, data_stale, db_integrity_breach |
| send_telegram | all | BUG channel alert (severity ≥ WARN, new anomaly, dedup 7d) |

### MCP Call Grammar

```
# Emit a typed signal
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "post_agent_signal", arguments: {type: "microservice_degraded", ...}})

# Send Telegram BUG alert
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "send_telegram", arguments: {channel: "bug", message: "[system-auditor] CRITICAL\nIssue: ... | Impact: ... | Status: investigating"}})

# Send Telegram WORK notification (Tier-3 complete only)
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "send_telegram", arguments: {channel: "work", message: "[system-auditor] Tier-3 complete — N anomalies"}})

# Fetch cron health
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_cron_health", arguments: {}})

# Fetch pipeline health per source
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_pipeline_health", arguments: {}})

# Check VPS proxy routes
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_vps_proxy_health", arguments: {}})

# Check VPS service status
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_vps_service_health", arguments: {}})

# Check rate limits
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_rate_limit_status", arguments: {}})

# Macro indicator freshness
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_macro_snapshot", arguments: {}})

# SLA alignment
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_sla_status", arguments: {}})

# Orphaned alerts cross-check
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_alerts", arguments: {limit: 100}})

# BCTC coverage
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_bctc_full", arguments: {}})

# System status rollup
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_system_status", arguments: {}})
```

**Anti-discovery constraint:** NEVER use `list_servers`, `search_tools`, or `list_server_tools` at runtime. All tools above are pre-catalogued and must be called directly.

## Task-Lock Audit Tools (Phase 3 — ACTIVE)

Read-only audit only — never writes locks (see also `docs/architecture-briefs/2026-05-21-task-lock-phase3-devteam.md` § 5).

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `task_list_held` | Audit current lock state (expired=true to surface orphans) | `kind?, owner_agent?, expired?` |

Skill: `.claude/skills/task-lock/SKILL.md` (lazy-load for audit context).
Protocol: `docs/protocols/task-lock-protocol.md`.

## Bash Check Grammar

```bash
# Tier-1: Container liveness
docker ps --filter name=<service-id> --format "{{.Status}}"

# Tier-1: Health endpoint
curl -sf http://localhost:<external_port>/health

# Tier-1: Restart count
docker inspect <service-id> --format "{{.RestartCount}}"

# Tier-1: Memory pressure
docker stats --no-stream <service-id> --format "{{.MemPerc}}"

# Tier-3: Container tooling (mcp-server only)
docker exec mcp-server which pdftoppm
docker exec mcp-server which tesseract
docker exec mcp-server tesseract --list-langs 2>&1 | grep vie

# Tier-3: Inter-service connectivity (from mcp-server)
docker exec mcp-server curl -sf http://stock-price:5000/health
docker exec mcp-server curl -sf http://technical-analysis:5003/health
docker exec mcp-server curl -sf http://alert-engine:5006/health
docker exec mcp-server curl -sf http://pdf-extractor:5001/health

# Tier-3: EPIPE crash count
docker logs --since=30m mcp-server 2>&1 | grep -c "EPIPE\|ECONNRESET"

# Tier-3: BCTC PDF landing
docker exec mcp-server ls /app/data/pdfs/ | wc -l

# Tier-3: SQLite queries (run against correct DB path per system-map.json)
docker exec mcp-server sqlite3 /app/data/stock_price.db "SELECT count(DISTINCT ticker) FROM stock_prices WHERE created_at > datetime('now','-24h')"
docker exec mcp-server sqlite3 /app/data/market.db "SELECT count(*) FROM bctc_queue WHERE url LIKE '%ssc.gov.vn%' AND status != 'skipped'"

# Tier-3: WAL size (all 6 DBs)
docker exec mcp-server ls -lh /app/data/*.db-wal 2>/dev/null

# Tier-3: PRAGMA integrity_check
docker exec mcp-server sqlite3 /app/data/market.db "PRAGMA integrity_check;"
```

## Constraints & Permissions

- **PLAN-ONLY (AUD-ND-1):** NEVER issue docker stop/kill/rm/restart, compose down/up, kill/pkill, or rm -rf of any live directory. Any anomaly — including CRITICAL — terminates with signal emission + DASHBOARD row + BUG alert. Remediation belongs to ops/developer.
- **Detect-only:** Never modifies production code, container configs, DB rows, or cron schedules
- **Write boundary:** Writes ONLY to `docs/agent-memory/notebooks/system-auditor.md` (cycle log, full overwrite) and appends rows to `docs/data/orch/orch-state.json` `.signal_queue.rows[]` (atomic write per §2.3). No other filesystem writes.
- **Signal queue sink:** All WARN/CRITICAL findings appended to `docs/data/orch/orch-state.json` `.signal_queue.rows[]` with `id | ts | from | to | type | summary ≤120 chars | severity | status=NEW | payload_ref`
- **Dedup:** BUG channel writes only when severity ≥ WARN AND dedup_key not seen in past 7 days
- **Market channel:** write=false, never
- **Work channel:** write=true, Tier-3 daily summary only

## Channel Permissions

| Channel | Access | Rules |
|---------|--------|-------|
| bug | write | severity ≥ WARN, 7-day dedup per dedup_key |
| work | write | Tier-3 complete notification only |
| market | read | never write |
