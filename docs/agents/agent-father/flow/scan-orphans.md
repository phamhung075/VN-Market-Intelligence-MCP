# Agent Father — Scan Orphans + Roster

**Parent flow:** `docs/agents/agent-father/flow/keep.md` (Steps 1-2)

## Step 1 — Orphan Detection

Scan for files that exist without a matching agent definition:

```
# Flow dirs without matching agent
Glob: docs/agents/*/flow/
Compare against: Glob .claude/agents/*.md

# Notebooks without matching agent
Glob: docs/agent-memory/notebooks/*.md
Compare against: Glob .claude/agents/*.md

# Tool packages without matching agent
Glob: docs/agents/tools/package/*.md
Compare against: Glob .claude/agents/*.md
```

Classify findings:
- **ORPHAN_FLOW** — flow directory exists but no `.claude/agents/<name>.md`
- **ORPHAN_NOTEBOOK** — notebook exists but no matching agent
- **ORPHAN_PACKAGE** — tool package exists but no matching agent
- **MISSING_FLOW** — agent exists but flow path does not resolve
- **MISSING_NOTEBOOK** — agent exists but notebook does not exist

## Step 2 — Roster Accuracy

```
# Filesystem agents
Glob: .claude/agents/*.md → extract filenames → set A

# Roster entries
Grep: "\.md" docs/references/agent-roster.md → extract filenames → set B
```

Compare:
- `A - B` = **UNREGISTERED** (in filesystem, not in roster)
- `B - A` = **PHANTOM** (in roster, not in filesystem)

Findings feed Step 3 (sweep-fixes.md) for auto-fix decisions and Step 6 (report) inside keep.md.
