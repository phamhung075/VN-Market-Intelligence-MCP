#!/bin/bash
set -e

CONFIG_FILE="$(dirname "$0")/agent-models.json"
AGENTS_DIR="$(dirname "$0")/agents"

# Known Cowork-cloud-only keys: legitimate agent-models.json entries with NO
# local .claude/agents/<key>.md file — their model lives in the Claude.ai
# workspace UI, not a local file. SSOT for this list: AGENT_MODELS_README.md
# § Config File ("EXCEPT `financial-analyst` and `report-analyzer` ..."). Keep
# both in sync if the roster of cloud-only agents ever changes.
COWORK_CLOUD_ONLY_AGENTS=("financial-analyst" "report-analyzer")

is_cowork_cloud_only() {
  local AGENT="$1"
  local KNOWN
  for KNOWN in "${COWORK_CLOUD_ONLY_AGENTS[@]}"; do
    [[ "$AGENT" == "$KNOWN" ]] && return 0
  done
  return 1
}

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "❌ Error: agent-models.json not found at $CONFIG_FILE"
  exit 1
fi

if [[ ! -d "$AGENTS_DIR" ]]; then
  echo "❌ Error: agents directory not found at $AGENTS_DIR"
  exit 1
fi

show_usage() {
  echo "Usage:"
  echo "  $0 <mode>                 Apply a full preset (all agents in agent-models.json) to .claude/agents/*.md"
  echo "  $0 <agent-name> <model>   Override ONE agent's model directly (ad hoc, does not touch agent-models.json)"
  echo ""
  echo "Available modes:"
  jq -r '.modes | keys[] as $key | "  \($key): \(.[$key].description)"' "$CONFIG_FILE"
  echo ""
  echo "Current mode: $(jq -r '.current_mode' "$CONFIG_FILE")"
  echo ""
  echo "Agent roster (from agent-models.json, mirrors .claude/agents/*.md): $(jq -r '.modes.normal.agents | keys | length' "$CONFIG_FILE") entries"
  echo "  Note: a running mode switch (\"$0 <mode>\") will reset any ad hoc single-agent"
  echo "  override back to that preset's recorded value for the same agent."
}

# Patch the `model:` frontmatter field of one agent .md file in place.
# Shared by both the full-mode loop and the single-agent override path
# so the frontmatter-rewrite logic is defined exactly once (no duplication).
apply_model() {
  local AGENT="$1"
  local MODEL="$2"
  local AGENT_FILE="$AGENTS_DIR/${AGENT}.md"

  if [[ ! -f "$AGENT_FILE" ]]; then
    if is_cowork_cloud_only "$AGENT"; then
      echo "ℹ️  Skipping $AGENT — Cowork-cloud-only agent, model managed in Claude.ai workspace UI"
    else
      echo "⚠️  Warning: Agent file not found: $AGENT_FILE (skipping)"
    fi
    return 1
  fi

  # Extract frontmatter and content (works on macOS)
  local FRONTMATTER BODY UPDATED_FRONTMATTER
  FRONTMATTER=$(sed -n '/^---$/,/^---$/p' "$AGENT_FILE" | sed '$d')
  BODY=$(sed '1,/^---$/d' "$AGENT_FILE")

  # Update model in frontmatter (or add if not present)
  if echo "$FRONTMATTER" | grep -q "^model:"; then
    UPDATED_FRONTMATTER=$(echo "$FRONTMATTER" | sed "s/^model:.*/model: $MODEL/")
  else
    UPDATED_FRONTMATTER=$(echo "$FRONTMATTER" | sed "/^---$/i\\
model: $MODEL")
  fi

  # Reconstruct file
  echo "$UPDATED_FRONTMATTER" > "$AGENT_FILE"
  echo "---" >> "$AGENT_FILE"
  echo "$BODY" >> "$AGENT_FILE"

  echo "✓ $AGENT → $MODEL"
  return 0
}

if [[ $# -eq 0 ]]; then
  show_usage
  exit 1
fi

if [[ $# -eq 2 ]]; then
  # Single-agent override: $0 <agent-name> <model>
  AGENT="$1"
  MODEL="$2"
  AGENT_FILE="$AGENTS_DIR/${AGENT}.md"

  if [[ ! -f "$AGENT_FILE" ]]; then
    echo "❌ Error: Agent '$AGENT' not found at $AGENT_FILE"
    echo "   (agent-name must match a file in .claude/agents/, e.g. developer, dev-mcp-server, system-auditor)"
    exit 1
  fi

  if [[ -z "$MODEL" ]]; then
    echo "❌ Error: model value required (e.g. haiku, sonnet, opus, claude-opus-4-5)"
    exit 1
  fi

  echo "🔄 Overriding single agent: $AGENT → $MODEL"
  apply_model "$AGENT" "$MODEL"
  echo "✅ $AGENT set to $MODEL (ad hoc override — NOT written to agent-models.json)"
  echo "   Note: running '$0 <mode>' later will reset $AGENT back to that preset's value."
  exit 0
fi

if [[ $# -gt 2 ]]; then
  echo "❌ Error: too many arguments"
  show_usage
  exit 1
fi

MODE="$1"

# Validate mode exists
if ! jq -e ".modes.\"$MODE\"" "$CONFIG_FILE" > /dev/null 2>&1; then
  echo "❌ Error: Mode '$MODE' not found in agent-models.json"
  show_usage
  exit 1
fi

echo "🔄 Switching to mode: $MODE"

# Extract agents and models for the selected mode — driven entirely by
# agent-models.json keys (no separate hardcoded agent list in this script).
AGENTS=$(jq -r ".modes.\"$MODE\".agents | to_entries[] | .key" "$CONFIG_FILE")

while IFS= read -r AGENT; do
  [[ -z "$AGENT" ]] && continue
  MODEL=$(jq -r ".modes.\"$MODE\".agents.\"$AGENT\"" "$CONFIG_FILE")
  apply_model "$AGENT" "$MODEL" || true
done <<< "$AGENTS"

# Update current_mode in config
jq ".current_mode = \"$MODE\"" "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"

echo "✅ Switched to mode: $MODE"
