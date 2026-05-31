#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# tmux-agent.sh — Tmux layout manager for VN Market Intelligence MCP
# Usage: bash scripts/agents-flow/tmux-agent.sh <command> [args...]
#
# Compatible with bash 3.2+ (macOS default) — no associative arrays.
# ──────────────────────────────────────────────────────────────
set -euo pipefail

SESSION="vn-market"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# ── Agent color/label lookups (bash 3.2 compatible) ──────────

agent_color() {
  case "$1" in
    po)              echo "colour205" ;;  # pink
    ba)              echo "colour141" ;;  # purple
    architect)       echo "colour75"  ;;  # blue
    pm)              echo "colour220" ;;  # yellow
    developer|dev)   echo "colour82"  ;;  # green
    qa)              echo "colour196" ;;  # red
    fixer)           echo "colour208" ;;  # orange
    market-analyst)  echo "colour51"  ;;  # cyan
    logs)            echo "colour245" ;;  # grey
    main)            echo "colour136" ;;  # gold
    *)               echo "colour245" ;;  # default grey
  esac
}

agent_label() {
  case "$1" in
    po)              echo "PO (Product Owner)" ;;
    ba)              echo "BA (Business Analyst)" ;;
    architect)       echo "Architect" ;;
    pm)              echo "PM (Project Manager)" ;;
    developer|dev)   echo "Developer" ;;
    qa)              echo "QA / CI-CD" ;;
    fixer)           echo "Fixer" ;;
    market-analyst)  echo "Market Analyst" ;;
    logs)            echo "Logs & Monitoring" ;;
    main)            echo "Claude Code" ;;
    *)               echo "$1" ;;
  esac
}

# ── Helpers ──────────────────────────────────────────────────

session_exists() {
  tmux has-session -t "$SESSION" 2>/dev/null
}

window_exists() {
  tmux list-windows -t "$SESSION" -F '#{window_name}' 2>/dev/null | grep -qx "$1"
}

apply_style() {
  tmux set-option -t "$SESSION" pane-border-status top 2>/dev/null || true
  tmux set-option -t "$SESSION" pane-border-format \
    " #{pane_index}: #{pane_title} " 2>/dev/null || true
  tmux set-option -t "$SESSION" status-style \
    "bg=colour235,fg=colour136" 2>/dev/null || true
  tmux set-option -t "$SESSION" status-left \
    "#[fg=colour235,bg=colour136,bold] VN-MKT #[default] " 2>/dev/null || true
  tmux set-option -t "$SESSION" status-right \
    "#[fg=colour245] %H:%M #[fg=colour136]| Sprint " 2>/dev/null || true
  tmux set-option -t "$SESSION" window-status-format \
    " #I:#W " 2>/dev/null || true
  tmux set-option -t "$SESSION" window-status-current-format \
    "#[fg=colour235,bg=colour136,bold] #I:#W " 2>/dev/null || true
}

create_window() {
  local name="$1"
  local cmd="${2:-}"
  local color
  color="$(agent_color "$name")"
  local label
  label="$(agent_label "$name")"

  if window_exists "$name"; then
    echo "[tmux-agent] Window '$name' already exists, skipping."
    return 0
  fi

  if [ -n "$cmd" ]; then
    tmux new-window -t "$SESSION" -n "$name" -c "$PROJECT_DIR" "$cmd"
  else
    tmux new-window -t "$SESSION" -n "$name" -c "$PROJECT_DIR"
  fi

  tmux select-pane -t "$SESSION:$name" -T "$label"
  tmux set-option -t "$SESSION:$name" pane-active-border-style \
    "fg=$color" 2>/dev/null || true
  tmux set-option -t "$SESSION:$name" pane-border-style \
    "fg=$color" 2>/dev/null || true
}

split_window() {
  local window="$1"
  local direction="$2"  # h or v
  local title="$3"
  local cmd="${4:-}"
  local color="${5:-colour245}"

  local split_flag="-h"
  [ "$direction" = "v" ] && split_flag="-v"

  if [ -n "$cmd" ]; then
    tmux split-window $split_flag -t "$SESSION:$window" -c "$PROJECT_DIR" "$cmd"
  else
    tmux split-window $split_flag -t "$SESSION:$window" -c "$PROJECT_DIR"
  fi

  tmux select-pane -T "$title"
  tmux set-option -p pane-active-border-style "fg=$color" 2>/dev/null || true
}

# ── Commands ─────────────────────────────────────────────────

cmd_setup() {
  local preset="${1:-sprint}"

  echo "[tmux-agent] Setting up layout: $preset"

  if ! session_exists; then
    tmux new-session -d -s "$SESSION" -n "main" -c "$PROJECT_DIR"
    tmux select-pane -t "$SESSION:main" -T "Claude Code"
  fi

  apply_style

  case "$preset" in
    sprint)
      # Window 1: PO + BA
      if ! window_exists "po-ba"; then
        create_window "po-ba"
        tmux select-pane -t "$SESSION:po-ba" -T "PO (Product Owner)"
        split_window "po-ba" "h" "BA (Business Analyst)" "" "$(agent_color ba)"
      fi

      # Window 2: Architect + PM
      if ! window_exists "arch-pm"; then
        create_window "arch-pm"
        tmux select-pane -t "$SESSION:arch-pm" -T "Architect"
        split_window "arch-pm" "h" "PM (Project Manager)" "" "$(agent_color pm)"
      fi

      # Window 3: Developer + test watcher
      if ! window_exists "dev"; then
        create_window "dev"
        tmux select-pane -t "$SESSION:dev" -T "Developer (TDD)"
        split_window "dev" "v" "Test Watcher" \
          "bash -c 'echo \"--- Test watcher ready. Run: bun test --watch ---\"; exec bash'" \
          "$(agent_color developer)"
        tmux resize-pane -t "$SESSION:dev.0" -y "70%"
      fi

      # Window 4: QA + Fixer
      if ! window_exists "qa-fix"; then
        create_window "qa-fix"
        tmux select-pane -t "$SESSION:qa-fix" -T "QA / CI-CD"
        split_window "qa-fix" "h" "Fixer" "" "$(agent_color fixer)"
      fi

      # Window 5: Logs
      if ! window_exists "logs"; then
        create_window "logs"
        tmux select-pane -t "$SESSION:logs" -T "Server"
        split_window "logs" "h" "Git Log" \
          "bash -c 'git -C \"$PROJECT_DIR\" log --oneline --graph -20; exec bash'" \
          "$(agent_color logs)"
      fi

      echo "[tmux-agent] Sprint layout ready (6 windows)"
      ;;

    dev-focus)
      if ! window_exists "dev"; then
        create_window "dev"
        tmux select-pane -t "$SESSION:dev" -T "Developer (TDD)"
        split_window "dev" "v" "Test Watcher" \
          "bash -c 'echo \"--- Run: bun test --watch ---\"; exec bash'" \
          "$(agent_color developer)"
        tmux resize-pane -t "$SESSION:dev.0" -y "70%"
      fi

      if ! window_exists "logs"; then
        create_window "logs"
        tmux select-pane -t "$SESSION:logs" -T "Server"
        split_window "logs" "h" "Git Log" \
          "bash -c 'git -C \"$PROJECT_DIR\" log --oneline --graph -20; exec bash'" \
          "$(agent_color logs)"
      fi

      echo "[tmux-agent] Dev-focus layout ready (3 windows)"
      ;;

    review)
      if ! window_exists "qa-fix"; then
        create_window "qa-fix"
        tmux select-pane -t "$SESSION:qa-fix" -T "QA / CI-CD"
        split_window "qa-fix" "h" "Fixer" "" "$(agent_color fixer)"
      fi

      if ! window_exists "logs"; then
        create_window "logs"
        tmux select-pane -t "$SESSION:logs" -T "Test Output"
        split_window "logs" "h" "Git Diff" \
          "bash -c 'echo \"--- Run: git diff ---\"; exec bash'" \
          "$(agent_color logs)"
      fi

      echo "[tmux-agent] Review layout ready (3 windows)"
      ;;

    *)
      echo "[tmux-agent] Unknown preset: $preset"
      echo "Available: sprint, dev-focus, review"
      exit 1
      ;;
  esac

  tmux select-window -t "$SESSION:main" 2>/dev/null || true

  echo "[tmux-agent] Session: $SESSION"
  echo "[tmux-agent] Attach with: tmux attach -t $SESSION"
}

cmd_open() {
  local agent="$1"
  local label
  label="$(agent_label "$agent")"

  if ! session_exists; then
    tmux new-session -d -s "$SESSION" -n "main" -c "$PROJECT_DIR"
    apply_style
  fi

  create_window "$agent"
  echo "[tmux-agent] Opened window for: $label"
}

cmd_split() {
  local direction="${1:-h}"
  local title="${2:-subtask}"
  local cmd="${3:-}"

  if ! session_exists; then
    echo "[tmux-agent] No active session. Run 'setup' first."
    exit 1
  fi

  local split_flag="-h"
  [ "$direction" = "v" ] && split_flag="-v"

  if [ -n "$cmd" ]; then
    tmux split-window $split_flag -t "$SESSION" -c "$PROJECT_DIR" "$cmd"
  else
    tmux split-window $split_flag -t "$SESSION" -c "$PROJECT_DIR"
  fi

  tmux select-pane -T "$title"
  echo "[tmux-agent] Split pane created: $title"
}

cmd_send() {
  local target="$1"
  local command="$2"

  if ! session_exists; then
    echo "[tmux-agent] No active session."
    exit 1
  fi

  tmux send-keys -t "$SESSION:$target" "$command" C-m
  echo "[tmux-agent] Sent command to $target"
}

cmd_status() {
  if ! session_exists; then
    echo "[tmux-agent] No active session '$SESSION'"
    exit 0
  fi

  echo "[tmux-agent] Session: $SESSION"
  echo ""
  tmux list-windows -t "$SESSION" -F \
    "  Window ##{window_index}: #{window_name} (#{window_panes} panes) #{?window_active,[active],}"
  echo ""
  echo "Attach with: tmux attach -t $SESSION"
}

cmd_teardown() {
  if session_exists; then
    tmux kill-session -t "$SESSION"
    echo "[tmux-agent] Session '$SESSION' terminated."
  else
    echo "[tmux-agent] No session '$SESSION' to teardown."
  fi
}

# ── Main dispatcher ──────────────────────────────────────────

usage() {
  cat <<'USAGE'
tmux-agent.sh — Tmux layout manager for VN Market Intelligence MCP

Usage:
  bash scripts/agents-flow/tmux-agent.sh <command> [args...]

Commands:
  setup [preset]              Create full layout (sprint|dev-focus|review)
  open <agent>                Open a single agent window
  split <h|v> "title" "cmd"  Split current window for a subtask
  send <window> "command"     Send command to an agent pane
  status                      Show current session info
  teardown                    Kill the session

Presets:
  sprint      Full agent chain (PO, BA, Arch, PM, Dev, QA, Logs)
  dev-focus   Developer + test watcher + logs only
  review      QA + Fixer + logs only

Agents:
  po, ba, architect, pm, developer, qa, fixer, market-analyst, logs

Examples:
  bash scripts/agents-flow/tmux-agent.sh setup sprint
  bash scripts/agents-flow/tmux-agent.sh setup dev-focus
  bash scripts/agents-flow/tmux-agent.sh open developer
  bash scripts/agents-flow/tmux-agent.sh split h "tests" "bun test --watch"
  bash scripts/agents-flow/tmux-agent.sh send dev "bun test"
  bash scripts/agents-flow/tmux-agent.sh teardown
USAGE
}

case "${1:-}" in
  setup)    shift; cmd_setup "${1:-sprint}" ;;
  open)     shift; cmd_open "${1:?Agent name required}" ;;
  split)    shift; cmd_split "${1:-h}" "${2:-subtask}" "${3:-}" ;;
  send)     shift; cmd_send "${1:?Window name required}" "${2:?Command required}" ;;
  status)   cmd_status ;;
  teardown) cmd_teardown ;;
  -h|--help|help|"") usage ;;
  *)        echo "[tmux-agent] Unknown command: $1"; usage; exit 1 ;;
esac
