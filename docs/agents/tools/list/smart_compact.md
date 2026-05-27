---
tool: smart_compact
category: system
agents: [developer, qa, architect]
---

# `smart_compact`

**Category:** system | **Used by:** Developer, QA, Architect
**Description:** Summarize the latest Claude session JSONL into a compact memory file using the claude CLI. Fire-and-forget.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| session_path | string | ❌ | — | Absolute path to a specific session .jsonl file. Omit to use the most recently modified session for this project. |

## Returns

```json
{
  "success": true,
  "sessionFile": "/path/to/session.jsonl",
  "memoryFile": "/path/to/memory.md"
}
```

Or on error:

```json
{
  "success": false,
  "error": "No session files found"
}
```

## Usage

```json
{
  "tool_name": "smart_compact",
  "input": {
    "session_path": "/Users/admin/Documents/.claude/sessions/2026-05-05-project.jsonl"
  }
}
```

## Notes

- Fire-and-forget: spawns claude CLI process asynchronously
- Finds most recent session automatically if session_path omitted
- Useful at sprint boundaries or before context offload
- Returns success status and file paths
