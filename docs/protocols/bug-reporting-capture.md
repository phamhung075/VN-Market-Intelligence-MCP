> Parent: [./bug-reporting-via-mcp.md](./bug-reporting-via-mcp.md)

# Bug Reporting — Capture Phase

How agents detect and report errors via MCP.

## Step 1: Agent Detects Error

During cowork agent cycle, agent encounters error:

```
ERROR: SQLite database locked (market_price.db.shm)
Impact: Cannot write EOD summaries
Status: Blocking, retrying every 10s
```

## Step 2: Agent Calls MCP Tool

Agent calls built-in MCP tool to report:

```
send_telegram(
  channel="bug",
  message="[Market Watcher] ⚠️ HIGH\n  Issue: SQLite database locked\n  Impact: EOD writes blocked\n  Status: Retrying every 10s"
)
```

## For Cowork Agents: Simple Pattern

```markdown
### ERROR HANDLING

If error occurs during cycle:

1. Report to dev team:
   send_telegram(channel="bug", message="[Agent] ⚠️ SEVERITY\n  Issue: {...}\n  Impact: {...}\n  Status: {...}")

2. That's it — MCP server handles dedup, storage, and dev team access
```

### Example: Market Watcher Error

If Batch 4 fails to write to ledger:

```
send_telegram(
  channel="bug",
  message="[Market Watcher] ⚠️ HIGH\n  Issue: SQLite database locked\n  Impact: EOD summaries not written\n  Status: Blocking, will retry Batch 4 at 17:00 UTC"
)
```

---

## Three Report Priorities

`telegramReportStore.ts` supports:
```
type ReportPriority = "critical" | "high" | "normal" | "monitor"
```

Agents can specify priority when reporting if MCP tool is extended (currently default is implicit).
