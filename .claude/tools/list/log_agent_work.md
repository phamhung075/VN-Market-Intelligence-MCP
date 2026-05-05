---
tool: log_agent_work
category: system
agents: [all-agents]
---

# `log_agent_work`

**Category:** system | **Used by:** All agents
**Description:** Log an agent work session lifecycle event. Use status='running' at session start; use status='completed' or status='error' at session end.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| agent_name | string (≥1 char) | ✅ | — | Name of the agent logging this session (e.g. 'unified-agent') |
| session_id | string | ❌ | — | Optional caller-supplied session identifier (e.g. cron run id) |
| id | number (positive integer) | ❌ | — | Row id returned by prior status='running' call. Required when status is 'completed' or 'error'. |
| summary | string | ❌ | — | Short one-line description of what the session did |
| findings | string | ❌ | — | Free-form notes on what was found (signals, alerts, issues) |
| actions | array or object | ❌ | — | Actions taken during the session (serialized to JSON) |
| status | enum (running, completed, error) | ✅ | — | Session status. 'running' = session start. 'completed'/'error' = session end. |

## Returns

When status='running':
```json
{
  "id": 123
}
```

When status='completed' or 'error':
```json
{
  "ok": true,
  "id": 123
}
```

## Usage

```json
{
  "tool_name": "log_agent_work",
  "input": {
    "agent_name": "market-watcher",
    "status": "running"
  }
}
```

Then at session end:

```json
{
  "tool_name": "log_agent_work",
  "input": {
    "agent_name": "market-watcher",
    "id": 123,
    "status": "completed",
    "summary": "Scanned 150 stocks for price anomalies",
    "findings": "5 stocks > 2sigma, 2 > 3sigma",
    "actions": ["alert VCB price_surge", "alert HPG volume_spike"]
  }
}
```

## Notes

- Session start (status='running') returns an id to use in subsequent end call
- Session end (status='completed' or 'error') requires the id from start call
- findings and actions help track agent output and decision-making
