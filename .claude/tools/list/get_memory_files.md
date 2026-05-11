---
tool: get_memory_files
category: system
agents: [ba, architect, developer]
---

# `get_memory_files`

**Category:** system | **Used by:** BA, Architect, Developer
**Description:** Get memory files to load for a given agent + task type. Reads agent-specific manifest.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| agent_name | string | ✅ | — | Agent identifier (e.g. ops, developer, qa) |
| task_type | string | ✅ | — | Task type to match (e.g. server-restart, writing-code) |

## Returns

List of file paths with front-matter metadata:
```
Found 2 file(s) for developer/writing-code:
  docs/agent-memory/patterns/code-style.md [agents: developer, code-janitor] [trigger: ddd-violation]
  docs/agent-memory/patterns/testing.md [agents: developer, qa] [trigger: unit-test-failure]
```

## Usage

```json
{
  "tool_name": "get_memory_files",
  "input": {
    "agent_name": "developer",
    "task_type": "writing-code"
  }
}
```

## Notes

- Reads manifest file from docs/agent-memory/manifests/{agent_name}.md
- Parses markdown table to match task_type
- Returns relative paths only, not full content
- Front-matter includes agents and trigger fields for context
