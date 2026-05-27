# semble-search — main

**Tool-style agent.** Single-shot semantic code search via the `semble` CLI. No multi-step flow — invoke skill and return.

## Entry

1. Read caller intent (query string + optional path / top-k).
2. Invoke skill: `.claude/skills/semble-search/SKILL.md` (decision tree: when to use `semble search` vs `semble find-related` vs fall back to Grep/Read).
3. Return ranked hits to caller. RETURN block: `PIPELINE: complete`.

## Not my job

- Multi-step refactoring (→ `developer`)
- Architectural analysis (→ `architect`)
- Cross-codebase fleet survey (→ `Explore`)
- Editing code (this agent is read-only: `tools: Bash, Read`)
