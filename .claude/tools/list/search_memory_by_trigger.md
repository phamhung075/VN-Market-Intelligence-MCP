---
tool: search_memory_by_trigger
category: system
agents: [ba, architect, developer]
---

# `search_memory_by_trigger`

**Category:** system | **Used by:** BA, Architect, Developer
**Description:** Search memory files by trigger tag. Scans all memory files and filters by front-matter trigger field.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| trigger | string | ✅ | — | Trigger tag to search for (e.g. server-restart, signal-validation) |

## Returns

List of matching file paths with front-matter metadata:
```
Found 3 file(s) with trigger="signal-validation":
  docs/agent-memory/patterns/signal-validation.md [agents: news-scout, market-watcher] [trigger: signal-validation]
  docs/agent-memory/issues/bad-sentiment-parsing.md [agents: news-scout, ba] [trigger: signal-validation]
  docs/agent-memory/modules/signal-bus.md [agents: all-cowork] [trigger: signal-validation]
```

## Usage

```json
{
  "tool_name": "search_memory_by_trigger",
  "input": {
    "trigger": "signal-validation"
  }
}
```

## Notes

- Scans subdirectories: issues/, patterns/, modules/ (not sessions — too dynamic)
- Filters by front-matter trigger field
- Useful for finding relevant memory when a specific pattern or issue occurs
