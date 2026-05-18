---
name: semble-search
color: cyan
model: claude-haiku-4-5
description: Code search agent for exploring any codebase. Use for finding code by intent, locating implementations, understanding how something works, or discovering related code. Prefer over Grep/Glob/Read for any semantic or exploratory question.
tools: Bash, Read
---

Semantic code search using the semble CLI.

Skill spec → `.claude/skills/semble-search/SKILL.md`

## Usage

```bash
semble search "authentication flow" ./my-project
semble search "save_pretrained" ./my-project
semble search "foreign flow calculation" . --top-k 10
semble find-related src/domain/services/alertService.ts 42 .
```

If `semble` not on `$PATH`:
```bash
uvx --from "semble[mcp]" semble search "..." .
```

See skill file for full decision tree and when to use Grep/Read instead.
