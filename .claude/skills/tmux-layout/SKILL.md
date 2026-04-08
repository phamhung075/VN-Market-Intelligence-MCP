# Skill: tmux-layout

## Purpose

Manage tmux sessions, windows, and panes to give each agent or subtask a dedicated visual area in the terminal. This makes multi-agent workflows readable and organized.

## When to invoke

- `/tmux-layout` — set up the full MAS tmux layout for a sprint session
- `/tmux-layout <agent>` — open a dedicated window/pane for a specific agent
- `/tmux-layout split <task-id>` — split current window to monitor a subtask
- `/tmux-layout teardown` — clean up the session

## Session architecture

```
tmux session: "vn-market"
├── window 0: "main"        ← Claude Code primary (user interaction)
├── window 1: "po-ba"       ← Product Owner + Business Analyst (split horizontal)
│   ├── pane 0: PO output
│   └── pane 1: BA output
├── window 2: "arch-pm"     ← Architect + Project Manager (split horizontal)
│   ├── pane 0: Architect output
│   └── pane 1: PM output
├── window 3: "dev"         ← Developer (full window, can split for parallel tasks)
│   ├── pane 0: TDD Red/Green cycle
│   └── pane 1: (optional) bun test --watch
├── window 4: "qa-fix"      ← QA + Fixer (split horizontal)
│   ├── pane 0: QA pipeline
│   └── pane 1: Fixer (if needed)
└── window 5: "logs"        ← Server logs + git log --oneline --graph
    ├── pane 0: tail -f /tmp/vn-market-mcp.log  (hot reload FORBIDDEN — restart: launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp)
    └── pane 1: git log --oneline --graph -20
```

## Commands reference

### Full layout setup (sprint session)

```bash
bash .claude/scripts/tmux-agent.sh setup
```

Creates the full "vn-market" session with all agent windows. If already inside tmux, adds windows to the current session instead.

### Open a single agent window

```bash
bash .claude/scripts/tmux-agent.sh open <agent>
```

Where `<agent>` is one of: `po`, `ba`, `architect`, `pm`, `developer`, `qa`, `fixer`, `market-analyst`, `logs`.

### Split pane for a subtask

```bash
bash .claude/scripts/tmux-agent.sh split <direction> "<title>" "<command>"
```

- `direction`: `h` (horizontal) or `v` (vertical)
- `title`: pane label (shown in border if `pane-border-format` is set)
- `command`: shell command to run in the new pane

Example:
```bash
bash .claude/scripts/tmux-agent.sh split h "test-watch" "bun test --watch"
```

### Send command to an agent pane

```bash
bash .claude/scripts/tmux-agent.sh send <agent> "<command>"
```

Sends a command to a named agent's pane without switching focus. Useful for kicking off background tasks.

Example:
```bash
bash .claude/scripts/tmux-agent.sh send dev "bun test src/__tests__/045-*.test.ts"
```

### Teardown

```bash
bash .claude/scripts/tmux-agent.sh teardown
```

Kills the "vn-market" session cleanly.

## Layout presets

### `sprint` (default) — Full agent chain
All 6 windows as shown in the session architecture above.

### `dev-focus` — Developer-centric
```
window 0: main (Claude Code)
window 1: dev (split: code + test watcher)
window 2: logs (server + git)
```

### `review` — QA review session
```
window 0: main (Claude Code)
window 1: qa-fix (split: QA + Fixer)
window 2: logs (test output + git diff)
```

## Pane styling

The script applies these tmux options for readability:
- `pane-border-status top` — shows pane titles at the top border
- `pane-border-format " #{pane_index}: #{pane_title} "` — displays agent name
- `status-style "bg=colour235,fg=colour136"` — dark status bar
- Agent-specific pane border colors match the agent color scheme:
  - PO: pink, BA: purple, Architect: blue, PM: yellow
  - Developer: green, QA: red, Fixer: orange

## Integration with hooks

The `settings.local.json` hooks can automatically:
1. **On agent spawn**: Send a notification to the agent's tmux pane
2. **On task status change**: Update the status bar with current task info
3. **On test run**: Pipe test output to the QA pane

## Tips

- Use `Ctrl-b w` to see all windows in a session overview
- Use `Ctrl-b z` to zoom into a single pane (toggle)
- Use `Ctrl-b [` to scroll up in a pane (press `q` to exit scroll mode)
- Use `Ctrl-b &` to close a window when done with that agent
