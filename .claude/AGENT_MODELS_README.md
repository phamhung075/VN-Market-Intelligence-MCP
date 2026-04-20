# Agent Model Switching Script

Control model usage across both agent teams (Dev + Cowork) to optimize for token economy or performance.

## Quick Start

```bash
cd .claude
./switch-agent-models.sh [eco|normal|performance]
```

## Modes

### `eco` mode (token economy)
- **Dev Team**: All 13 agents → **Haiku** (fast, cheap)
- **Cowork Team**: Manual change needed (set to Haiku in workspace)
- **Use case**: Cost optimization, long-running analysis sessions

### `normal` mode (default)
- **Dev Team**: Original mixed settings
  - 11 agents on **Sonnet** (architect, ba, developer, pm, etc.)
  - 1 agent on **Haiku** (code-janitor)
  - 1 agent on **Opus** (cowork-refactory-expert)
- **Cowork Team**: No action needed (runs on Sonnet by default)
- **Use case**: Production mode, balanced cost/quality

### `performance` mode (maximum quality)
- **Dev Team**: All 13 agents → **Sonnet** (best analysis)
- **Cowork Team**: Manual change needed (set to Sonnet 4.6 in workspace)
- **Use case**: Critical tasks, complex analysis, feature work

## Config File

Original settings stored in `.claude/agent-models.json`:

```json
{
  "original": {
    "architect.md": "sonnet",
    "ba.md": "sonnet",
    "code-janitor.md": "haiku",
    "cowork-refactory-expert.md": "opus",
    "developer.md": "sonnet",
    ...
  }
}
```

The `normal` mode restores these original settings automatically.

## Two-Team Architecture

### Dev Team (.claude/agents/)
✅ Automatic — script handles all 13 agents

```
architect.md
ba.md
claude-manager-helper.md
code-janitor.md
cowork-refactory-expert.md
developer.md
fixer.md
idea-forge.md
market-analyst.md
pm.md
po.md
qa.md
system-auditor.md
```

### Cowork Team (cowork-analysis-vnmarket-team/)
⚠️ Manual — models stored in Claude.ai workspace, not in .md files

```
01-news-scout.md
02-financial-analyst.md
03-bctc-collector.md  (merged into 02 in Sprint 226)
04-market-watcher.md
05-alert-commander.md
06-digest-predict.md  (merged in Sprint 226)
07-qa-responder.md
unified-agent.md
```

**To switch Cowork agents:**
1. Open https://claude.ai/cowork
2. Edit each agent
3. Change "Model" dropdown to Haiku / Sonnet 4.6

## Examples

Switch to eco mode (cost optimization):
```bash
./switch-agent-models.sh eco
```

Restore to production defaults:
```bash
./switch-agent-models.sh normal
```

Use Sonnet for heavy-duty sprint:
```bash
./switch-agent-models.sh performance
```

## Verification

Script automatically verifies with `bun tsc --noEmit` after each switch. If there are type errors, models are NOT changed.

## Notes

- **Cowork agents** run in Claude's cloud — their models are workspace settings, not in the code
- **Dev agents** run locally via Claude Code CLI — models are in `.md` frontmatter
- Both teams can run in different modes simultaneously
- Token usage report appears in your Claude dashboard for each session
