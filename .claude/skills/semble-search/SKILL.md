---
name: semble-search
description: >
  Semantic code search via the semble CLI. Use when exploring unfamiliar code,
  finding implementations by intent or symbol, or discovering related patterns.
  Prefer over Grep/Glob/Read for any exploratory or semantic question.
---

## When to use semble vs alternatives

| Task | Tool |
|------|------|
| Find how a function / class / API works | `semble search` |
| Locate callers, usages, implementations | `semble search` |
| Discover related code after a known result | `semble find-related` |
| Understand a library via GitHub URL | `semble search` with GitHub URL |
| Exhaustive literal / regex match | `Grep` |
| Read a specific known file path | `Read` |
| Find files by name pattern | `Glob` |

**Rule:** Never grep blindly for semantic questions. Semble answers them in one call with ~98% fewer tokens.

---

## Step 1 — Search by intent or symbol

```bash
semble search "authentication flow" ./my-project
semble search "save_pretrained" ./my-project
semble search "foreign flow calculation" . --top-k 10
semble search "MCP tool handler" https://github.com/org/repo
```

- `path` defaults to current directory when omitted
- Git/GitHub URLs accepted as `path`
- If `semble` not on `$PATH`: `uvx --from "semble[mcp]" semble search "..." .`

## Step 2 — Read full file only when chunk is insufficient

Load with `Read` only when the returned chunk lacks enough context for the edit. Do not load files preemptively.

## Step 3 — Discover related code (optional)

Pass `file_path` and `line` from a prior result:

```bash
semble find-related src/domain/services/alertService.ts 42 .
```

## Step 4 — Fall back to Grep for exhaustive literal match

Use `Grep` only when you need every occurrence of an exact string across the codebase (e.g. confirming no duplicate constants exist).

---

## Decision tree

```
Exploring / understanding code?
  └─ semble search  →  chunk enough? done
                    →  need full file? Read (specific path)
                    →  need related? semble find-related

Exact string, all occurrences?
  └─ Grep

Known file path?
  └─ Read
```
