---
tool: update_memory_file
category: system
agents: [architect, ba, developer]
---

# `update_memory_file`

**Category:** system | **Used by:** Architect, BA, Developer
**Description:** Create or update an issue, pattern, or module memory file with YAML front-matter (agents, trigger tags).

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| record_type | enum (issue, pattern, module) | ✅ | — | Type of memory file: issue, pattern, or module |
| action | enum (create, append, update) | ✅ | — | Action: create (new file), append (add to file), or update (replace content) |
| filename | string (≥1 char) | ✅ | — | Filename without .md extension |
| title | string (≥1 char) | ✅ | — | Heading/title for the content |
| content | string (≥1 char) | ✅ | — | Markdown content to write or append |
| agents | array of strings | ❌ | — | List of agents who use this file (for front-matter) |
| trigger | array of strings | ❌ | — | List of trigger tags (for front-matter) |

## Returns

```
✅ Memory file created: issues/signal-validation-gap.md
Path: docs/agent-memory/issues/signal-validation-gap.md
```

## Usage

```json
{
  "tool_name": "update_memory_file",
  "input": {
    "record_type": "issue",
    "action": "create",
    "filename": "signal-validation-gap",
    "title": "Signal Validation Gap",
    "content": "News Scout sometimes submits signals with missing event_type...",
    "agents": ["news-scout", "ba"],
    "trigger": ["signal-validation"]
  }
}
```

## Notes

- Creates or updates files in docs/agent-memory/{issues,patterns,modules}/
- Sanitizes filenames: removes special chars, converts spaces to hyphens
- Prevents directory traversal (rejects .. or / in filenames)
- action='append' treats missing file as create
- Preserves existing front-matter when action='update'
