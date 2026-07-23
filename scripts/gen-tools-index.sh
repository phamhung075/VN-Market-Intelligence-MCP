#!/usr/bin/env bash
# gen-tools-index.sh — TE-T31 (token-economy-audit)
#
# ROOT-CAUSE FIX: docs/agents/tools/list/INDEX.md was a hand-maintained THIRD
# tool-inventory SSOT that drifted from docs/data/tool-registry.json (the
# confirmed name/count SSOT, see TE-T28) — INDEX self-declared "157 tools /
# canonical tool inventory" while the registry held 184, and its own header
# table disagreed with its own section headings (e.g. "Financial 21" vs
# "FINANCIAL (19 tools)"). This is the recurring "tool-count 3-way drift"
# class (INDEX.md vs tool-registry.json vs project-stats.json#toolCount).
#
# This generator renders INDEX.md straight from tool-registry.json's
# .groups[] ({name, count, tools[]}) — total + every per-category count are
# computed LIVE from the registry, nothing hardcoded. Idempotent: re-running
# against an unchanged registry produces byte-identical output (no embedded
# "generated at" wall-clock timestamp — only the registry's own
# .lastUpdated field is echoed, so a no-op run is provably a no-op).
#
# Owning flow: docs/policies/dev-standards.md § Script Persistence
# Detail ref: docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-31
#
# Usage:
#   bash scripts/gen-tools-index.sh            # regenerate docs/agents/tools/list/INDEX.md
#   bash scripts/gen-tools-index.sh --check     # exit 1 if regeneration would change the file, write nothing
#
# Env overrides (test-only):
#   TOOLS_INDEX_REGISTRY_OVERRIDE   default: $PROJECT_ROOT/docs/data/tool-registry.json
#   TOOLS_INDEX_OUT_OVERRIDE        default: $PROJECT_ROOT/docs/agents/tools/list/INDEX.md
#
# Exit: 0 on successful generation/no-op; 1 on missing registry, jq failure,
# or (--check mode only) a detected drift between the current file and the
# freshly-rendered content.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(git -C "$REPO_ROOT" rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-$REPO_ROOT}")"

REGISTRY="${TOOLS_INDEX_REGISTRY_OVERRIDE:-$PROJECT_ROOT/docs/data/tool-registry.json}"
OUT="${TOOLS_INDEX_OUT_OVERRIDE:-$PROJECT_ROOT/docs/agents/tools/list/INDEX.md}"
CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

echo "[gen-tools-index] START registry=$REGISTRY out=$OUT check_only=$CHECK_ONLY"

command -v jq >/dev/null 2>&1 || { echo "[gen-tools-index] ERROR jq not found on PATH"; exit 1; }
[ -f "$REGISTRY" ] || { echo "[gen-tools-index] ERROR registry missing path=$REGISTRY"; exit 1; }

TOTAL="$(jq -r '.totalCount' "$REGISTRY" 2>/dev/null)"
REGISTRY_UPDATED="$(jq -r '.lastUpdated' "$REGISTRY" 2>/dev/null)"
if [ -z "$TOTAL" ] || [ "$TOTAL" = "null" ]; then
  echo "[gen-tools-index] ERROR could not read .totalCount from registry"
  exit 1
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

{
  echo "# MCP Tools Documentation Index"
  echo
  echo "Complete reference for all $TOTAL MCP tools organized by category."
  echo
  echo "GENERATED from \`docs/data/tool-registry.json\` — do not hand-edit; registry is the SSOT."
  echo "**Registry last updated:** $REGISTRY_UPDATED"
  echo "**Per-tool docs:** Each tool has a \`.md\` file at \`docs/agents/tools/list/<tool_name>.md\`"
  echo
  echo "---"
  echo
  echo "## Quick Navigation"
  echo
  echo "| Category | Count | Docs |"
  echo "|----------|-------|------|"
  jq -r '.groups[] | "| " + (.name|ascii_upcase) + " | " + (.count|tostring) + " | [See below](#" + .name + ") |"' "$REGISTRY"
  echo
  echo "---"
  echo
  jq -r '
    .groups[] |
    "<a id=\"" + .name + "\"></a>\n" +
    "## " + (.name|ascii_upcase) + " (" + (.count|tostring) + " tool" + (if .count == 1 then "" else "s" end) + ")\n\n" +
    ( [ .tools[] | "- **[`" + . + "`](" + . + ".md)**" ] | join("\n") ) +
    "\n"
  ' "$REGISTRY"
  echo "---"
  echo
  echo "## Usage"
  echo
  echo "Each tool is documented in \`docs/agents/tools/list/<tool_name>.md\` with:"
  echo "- **Purpose** — What the tool does (1 line)"
  echo "- **Parameters** — Input schema with types"
  echo "- **Returns** — Output format (1 line)"
  echo "- **Example** — Usage code snippet"
  echo
  echo "## Calling Tools"
  echo
  echo "All tools are invoked via the MCP gateway:"
  echo
  echo '```javascript'
  echo "call_tool("
  echo '  server: "vn-market",'
  echo '  tool: "<tool_name>",'
  echo "  arguments: { ... }"
  echo ")"
  echo '```'
  echo
  echo "See \`docs/standards/mcp-tools.md\` for full gateway documentation."
  echo
  echo "## Agent Tool Packages"
  echo
  echo "Per-agent tool packages are in \`docs/agents/tools/package/<agent>.md\`"
  echo "Each package lists the tools that agent is permitted to use."
  echo
  echo "## Discovery"
  echo
  echo "- **All tools:** this file (INDEX.md)"
  echo "- **Tool details:** \`docs/agents/tools/list/<tool>.md\`"
  echo "- **Per-agent:** \`docs/agents/tools/package/<agent>.md\`"
  echo "- **Removed/renamed:** \`docs/standards/mcp-tools.md\` → \"Renamed/Removed Tools\" section"
  echo
  echo "---"
  echo
  echo "*Generated by \`scripts/gen-tools-index.sh\` from \`docs/data/tool-registry.json\`. Re-run after any registry change — never hand-edit this file.*"
} > "$TMP"

if [ -f "$OUT" ] && diff -q "$TMP" "$OUT" >/dev/null 2>&1; then
  echo "[gen-tools-index] NOOP — INDEX.md already matches the registry (0 drift)"
  exit 0
fi

if [ "$CHECK_ONLY" = "1" ]; then
  echo "[gen-tools-index] DRIFT DETECTED — INDEX.md does not match the registry-generated content (--check, no write)"
  exit 1
fi

cp "$TMP" "$OUT"
echo "[gen-tools-index] WROTE $OUT (total=$TOTAL tools across $(jq -r '.groups | length' "$REGISTRY") groups)"
exit 0
