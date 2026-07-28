# Agent Model Switching Script

Control model usage across both agent teams (Dev + Cowork) to optimize for token economy or performance.

## Quick Start

```bash
cd .claude
./switch-agent-models.sh [eco|normal|performance]      # apply a full preset to every agent in agent-models.json
./switch-agent-models.sh <agent-name> <model>          # override ONE agent's model directly (ad hoc; not persisted to agent-models.json)
```

## Modes

### `eco` mode (token economy)
- **Dev Team**: All dev-team agents (see `docs/data/project-stats.json#devAgentCount`) → **Haiku** (fast, cheap)
- **Cowork Team**: Manual change needed (set to Haiku in workspace)
- **Use case**: Cost optimization, long-running analysis sessions

### `normal` mode (default)
- **Dev Team**: Original mixed settings
  - Agent count: see `docs/data/project-stats.json#devAgentCount` (dev specialists) + `#microserviceAgentCount` (microservice owners)
- **Cowork Team**: No action needed (runs on Sonnet by default)
- **Use case**: Production mode, balanced cost/quality

### `performance` mode (maximum quality)
- **Dev Team**: All dev-team agents (see `docs/data/project-stats.json#devAgentCount`) → **Sonnet** (best analysis)
- **Cowork Team**: Manual change needed (set to Sonnet 4.6 in workspace)
- **Use case**: Critical tasks, complex analysis, feature work

## Config File

Settings stored in `.claude/agent-models.json` — actual shape (not the illustrative snippet this doc used to show):

```json
{
  "modes": {
    "eco":         { "description": "...", "agents": { "<agent-key>": "haiku", ... } },
    "normal":      { "description": "...", "agents": { "<agent-key>": "sonnet|haiku|claude-opus-4-5|...", ... } },
    "performance": { "description": "...", "agents": { "<agent-key>": "sonnet", ... } }
  },
  "current_mode": "normal"
}
```

Each `<agent-key>` maps 1:1 to `.claude/agents/<agent-key>.md` (script looks the file up by that exact name), EXCEPT `financial-analyst` and `report-analyzer` which are Cowork-cloud-only keys kept here for cross-team reference — the script skips them with a warning since no local `.md` exists (see Two-Team Architecture below).

The `normal` mode restores each agent's original/default model automatically. Roster completeness (does every `.claude/agents/*.md` file have a key here) is enforced by verification, not by hand-copying a second list anywhere — query directly:
```bash
jq -r '.modes.normal.agents | keys[]' .claude/agent-models.json | sort
```

## Two-Team Architecture

### Dev Team (.claude/agents/)
✅ Automatic — the script derives its agent list from `agent-models.json` keys, not a hardcoded list in this doc or in the script itself. Every `.claude/agents/*.md` file is expected to have a matching key. List the live roster with:
```bash
ls .claude/agents/*.md | xargs -n1 basename | sed 's/\.md$//' | sort
```

### Cowork Team (cowork-workspace-team-claude-desktop/)
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

Override a single agent's model without touching the rest of the fleet:
```bash
./switch-agent-models.sh developer sonnet
./switch-agent-models.sh dev-mcp-server claude-opus-4-5
```
This is ad hoc — it patches only that agent's `.md` frontmatter and does NOT persist into `agent-models.json`. A later `./switch-agent-models.sh <mode>` will reset that agent back to the preset's recorded value.

## Verification

The script fails loud on missing config/agents-dir (exit 1) and warns-and-skips per-agent if a key has no matching `.claude/agents/<key>.md` file (e.g. the two Cowork-only keys) — it does not run a build/type-check step; frontmatter is plain YAML, not code. Since this is a config file change, verify with `git diff` after any switch and revert (`git checkout -- .claude/agents/`) if a switch was unintended.

## Notes

- **Cowork agents** run in Claude's cloud — their models are workspace settings, not in the code
- **Dev agents** run locally via Claude Code CLI — models are in `.md` frontmatter
- Both teams can run in different modes simultaneously
- Token usage report appears in your Claude dashboard for each session
