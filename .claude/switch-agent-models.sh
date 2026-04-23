#!/bin/bash
set -e

CONFIG_FILE="$(dirname "$0")/agent-models.json"
AGENTS_DIR="$(dirname "$0")/agents"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "❌ Error: agent-models.json not found at $CONFIG_FILE"
  exit 1
fi

if [[ ! -d "$AGENTS_DIR" ]]; then
  echo "❌ Error: agents directory not found at $AGENTS_DIR"
  exit 1
fi

# Map short names to full model IDs
get_full_model() {
  case "$1" in
    haiku) echo "claude-haiku-4-5-20251001" ;;
    sonnet) echo "claude-sonnet-4-6" ;;
    *) echo "unknown" ;;
  esac
}

show_usage() {
  echo "Usage: $0 <mode>"
  echo ""
  echo "Available modes:"
  jq -r '.modes | keys[] as $key | "  \($key): \(.[$key].description)"' "$CONFIG_FILE"
  echo ""
  echo "Current mode: $(jq -r '.current_mode' "$CONFIG_FILE")"
}

if [[ $# -eq 0 ]]; then
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

# Extract agents and models for the selected mode
AGENTS=$(jq -r ".modes.\"$MODE\".agents | to_entries[] | .key" "$CONFIG_FILE")

for AGENT in $AGENTS; do
  MODEL_SHORT=$(jq -r ".modes.\"$MODE\".agents.\"$AGENT\"" "$CONFIG_FILE")
  MODEL_FULL=$(get_full_model "$MODEL_SHORT")
  AGENT_FILE="$AGENTS_DIR/${AGENT}.md"
  
  if [[ ! -f "$AGENT_FILE" ]]; then
    echo "⚠️  Warning: Agent file not found: $AGENT_FILE (skipping)"
    continue
  fi
  
  # Extract frontmatter and content (works on macOS)
  FRONTMATTER=$(sed -n '/^---$/,/^---$/p' "$AGENT_FILE" | sed '$d')
  BODY=$(sed '1,/^---$/d' "$AGENT_FILE")
  
  # Update model in frontmatter (or add if not present)
  if echo "$FRONTMATTER" | grep -q "^model:"; then
    UPDATED_FRONTMATTER=$(echo "$FRONTMATTER" | sed "s/^model:.*/model: $MODEL_FULL/")
  else
    UPDATED_FRONTMATTER=$(echo "$FRONTMATTER" | sed "/^---$/i\\
model: $MODEL_FULL")
  fi
  
  # Reconstruct file
  echo "$UPDATED_FRONTMATTER" > "$AGENT_FILE"
  echo "---" >> "$AGENT_FILE"
  echo "$BODY" >> "$AGENT_FILE"
  
  echo "✓ $AGENT → $MODEL_SHORT"
done

# Update current_mode in config
jq ".current_mode = \"$MODE\"" "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"

echo "✅ Switched to mode: $MODE"
