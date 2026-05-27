---
tool: get_agent_work_log
category: system
agents: [unified-agent, pm, qa]
---

# `get_agent_work_log`

**Category:** system | **Used by:** Unified Coordinator, PM, QA
**Description:** Query agent work history. Returns entries ordered by started_at DESC (most recent first). All parameters are optional.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| agent_name | string | ❌ | — | Filter to a specific agent (e.g. 'unified-agent'). Omit for all agents. |
| days | number (1-90, positive integer) | ❌ | 7 | Return only rows started within the last N days (default: 7) |
| limit | number (1-200, positive integer) | ❌ | 20 | Maximum number of rows to return (default: 20, max: 200) |

## Returns

JSON array of work log entries, each containing:
- `agent_name` — Agent identifier
- `started_at` — ISO 8601 timestamp
- `ended_at` — ISO 8601 timestamp (or null if still running)
- `status` — running, completed, error
- `summary` — One-line description
- `findings` — Free-form notes
- `actions` — Serialized action list

Ordered by started_at DESC (most recent first).

## Usage

```json
{
  "tool_name": "get_agent_work_log",
  "input": {
    "agent_name": "market-watcher",
    "days": 7,
    "limit": 10
  }
}
```

## Notes

- Returns most recent entries first (DESC by started_at)
- Defaults to 7-day lookback and 20 entries max
- Useful for audit trail and agent performance tracking
