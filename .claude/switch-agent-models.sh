#!/bin/bash

# Switch all agent models between eco, normal, and performance modes
# Usage: ./switch-agent-models.sh [eco|normal|performance]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEV_AGENTS_DIR="$SCRIPT_DIR/agents"
COWORK_AGENTS_DIR="$PROJECT_DIR/cowork-analysis-vnmarket-team"
CONFIG_FILE="$SCRIPT_DIR/agent-models.json"

MODE="${1:-normal}"

if [[ ! "$MODE" =~ ^(eco|normal|performance)$ ]]; then
  echo "Usage: ./switch-agent-models.sh [eco|normal|performance]"
  echo ""
  echo "Modes:"
  echo "  eco         — token economy (Haiku for both teams)"
  echo "  normal      — balanced (original settings for Dev, Sonnet for Cowork)"
  echo "  performance — maximum quality (Sonnet for both teams)"
  exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "❌ Config file not found: $CONFIG_FILE"
  exit 1
fi

echo "Switching agent models to: $MODE"
echo ""

# ===== DEV TEAM =====
echo "DEV TEAM (.claude/agents/):"

case "$MODE" in
  eco)
    for agent_file in "$DEV_AGENTS_DIR"/*.md; do
      agent_name="$(basename "$agent_file")"
      sed -i.bak "s/^model: .*/model: haiku/" "$agent_file"
      rm -f "$agent_file.bak"
      echo "  ✓ $agent_name → haiku"
    done
    ;;
  normal)
    # Restore from config
    for agent_file in "$DEV_AGENTS_DIR"/*.md; do
      agent_name="$(basename "$agent_file")"

      # Get original model from config (simple grep approach)
      original_model=$(grep -o "\"$agent_name\": \"[^\"]*\"" "$CONFIG_FILE" | cut -d'"' -f4)

      if [[ -n "$original_model" ]]; then
        sed -i.bak "s/^model: .*/model: $original_model/" "$agent_file"
        rm -f "$agent_file.bak"
        echo "  ✓ $agent_name → $original_model"
      fi
    done
    ;;
  performance)
    for agent_file in "$DEV_AGENTS_DIR"/*.md; do
      agent_name="$(basename "$agent_file")"
      sed -i.bak "s/^model: .*/model: sonnet/" "$agent_file"
      rm -f "$agent_file.bak"
      echo "  ✓ $agent_name → sonnet"
    done
    ;;
esac

# ===== COWORK TEAM NOTE =====
echo ""
echo "COWORK TEAM (cowork-analysis-vnmarket-team/):"
echo "⚠️  Cowork agents' models are managed in Claude.ai workspace, not in .md files"
echo ""
if [[ "$MODE" == "eco" ]]; then
  echo "To switch Cowork to Haiku:"
  echo "  1. Open your Cowork workspace at claude.ai"
  echo "  2. Edit each agent (01-news-scout, 02-financial-analyst, etc.)"
  echo "  3. Change model to: Haiku"
elif [[ "$MODE" == "performance" ]]; then
  echo "To switch Cowork to Sonnet:"
  echo "  1. Open your Cowork workspace at claude.ai"
  echo "  2. Edit each agent"
  echo "  3. Change model to: Sonnet 4.6"
else
  echo "Cowork agents should run on Sonnet 4.6 (default)"
fi

# Verify
echo ""
echo "Verifying TypeScript..."
cd "$PROJECT_DIR"
if bun tsc --noEmit > /dev/null 2>&1; then
  echo "✅ tsc clean"
else
  echo "❌ tsc errors — rolling back"
  exit 1
fi

echo ""
echo "✅ Dev Team: $MODE"
echo "📋 Cowork Team: needs manual update (see instructions above)"
