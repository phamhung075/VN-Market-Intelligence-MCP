> Parent: [./SKILL.md](./SKILL.md)

# Token Economy — Part 1: Writing Optimization

## When to apply

Writing or editing: docs, changelogs, task descriptions, progress notes, reports, `orch-state.json .task_board` task entries.

## 15 Techniques

| # | Technique | When |
|---|-----------|------|
| 1 | Tables over prose | Comparisons, params, config |
| 2 | Bullets with pipes | Multi-part items: `Part1 | Part2 | Part3` |
| 3 | Numbered steps | Workflows, sequences |
| 4 | One example only | Code samples — keep best, drop rest |
| 5 | Pattern statements | Repetition → `**Pattern**: All X do Y` |
| 6 | Add "Why" | Decisions → `**Why**: [reason]` |
| 7 | Concrete errors | `**Error**: \`exact message\`` + `**Fix**: [solution]` |
| 8 | No fluff | Remove ASCII art, emojis, decorations |
| 9 | Scannable | Headers, bullets, tables — no walls of text |
| 10 | Consolidate | Merge duplicate sections |
| 11 | Compact code | 3-5 key lines only |
| 12 | Quick lists | Command/param tables |
| 13 | Inverted pyramid | Critical → Details → Context |
| 14 | Conditional verbosity | Complex: detailed. Routine: one line |
| 15 | No teaching | State facts, skip explanations of basics |

## Quick workflow

1. **Identify**: Prose → table? Multiple examples → one? ASCII → numbered? Teaching → facts?
2. **Apply**: Convert, consolidate, compact
3. **Check**: Essential info preserved? Scannable? No fluff?

## MCP task template

```
Requirements: [WHAT] | Files: [PATH:LINES] (action) | Acceptance: [CRITERIA] | Why: [CONTEXT]
```

`progress_notes`: `[ACTION] [WHAT]. [NEXT].`

`completion_summary`: `[DONE]. [TECH]. Files: [PATHS]. [IMPACT].`

## Common fixes

| Issue | Fix |
|-------|-----|
| Multiple examples | Keep 1 (#4) |
| Prose comparison | Table (#1) |
| Teaching tone | Facts only (#15) |
| ASCII art | Numbered steps (#3) |
| No "why" | Add context (#6) |
