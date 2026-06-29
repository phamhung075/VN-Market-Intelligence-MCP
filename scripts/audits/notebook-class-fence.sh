#!/usr/bin/env bash
# notebook-class-fence.sh — Guard fence for agent notebook-write class registration
#
# FENCE-A: Any agent with a notebook-write flow NOT in SKILL.md AC-6 → exit 1
# FENCE-B: SKILL.md APPEND+OVERWRITE set must equal file-size-caps.json agent list → exit 1 on divergence
# FENCE-C: settings.local.json must contain the notebook-auto-prune.sh hook → exit 1 if absent
#
# --self-test: injects a ghost agent and asserts FENCE-A catches it. Prints PASS/FAIL.
#
# Usage:
#   bash scripts/audits/notebook-class-fence.sh              # full scan
#   bash scripts/audits/notebook-class-fence.sh --self-test  # verify fence soundness
#
# Pointer: docs/architecture-briefs/2026-06-29-harden-notebook-write-gate-ac5.md § Part 4
#          docs/policies/dev-standards.md § Script Persistence
set -u

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "[fence] ERROR: cannot determine project root"; exit 1; }

SKILL_FILE="$PROJECT_ROOT/.claude/skills/notebook-write/SKILL.md"
CAPS_FILE="$PROJECT_ROOT/docs/data/file-size-caps.json"
SETTINGS_FILE="$PROJECT_ROOT/.claude/settings.local.json"
AGENTS_FLOW_DIR="$PROJECT_ROOT/docs/agents"

SELF_TEST=0
if [ "${1:-}" = "--self-test" ]; then
  SELF_TEST=1
fi

FAIL=0

# ─── STEP 1: SCAN — find all agents with notebook-writing flows ───────────────
# Agents that reference cowork-end-cycle or notebook-write in their flow files
SCAN_SET="$(grep -rl "cowork-end-cycle\|notebook-write" "$AGENTS_FLOW_DIR"/*/flow/ 2>/dev/null \
  | sed "s|$AGENTS_FLOW_DIR/||; s|/flow/.*||" \
  | sort -u)"

# ─── STEP 2: READ SKILL.md lists ─────────────────────────────────────────────
# Parse APPEND row: extract second pipe-column, split on comma
APPEND_ROW="$(grep "^| APPEND |" "$SKILL_FILE" 2>/dev/null | head -1)"
APPEND_AGENTS_RAW="$(echo "$APPEND_ROW" | sed 's/^| APPEND | //; s/ | .*$//' | tr ',' '\n' | tr -d ' ' | sort -u)"

# Parse OVERWRITE row: extract second pipe-column (format: po (≤50L), market-watcher (≤80L))
OVERWRITE_ROW="$(grep "^| OVERWRITE |" "$SKILL_FILE" 2>/dev/null | head -1)"
OVERWRITE_AGENTS_RAW="$(echo "$OVERWRITE_ROW" | sed 's/^| OVERWRITE | //; s/ | .*$//' | tr ',' '\n' | sed 's/ (.*)//' | tr -d ' ' | sort -u)"

# Merged registered set (APPEND ∪ OVERWRITE)
SKILL_REGISTERED="$(printf '%s\n%s\n' "$APPEND_AGENTS_RAW" "$OVERWRITE_AGENTS_RAW" | grep -v '^$' | sort -u)"

# ─── STEP 3: READ file-size-caps.json APPEND list ────────────────────────────
# Extract the _note for class=agent-notebook, then parse agent names from APPEND parenthetical
CAPS_NOTE="$(jq -r '.caps[] | select(.class=="agent-notebook") | ._note' "$CAPS_FILE" 2>/dev/null || true)"
# Extract the APPEND parenthetical: APPEND class (agent1, agent2, ...)
# Use python3 for portable regex extraction (macOS grep lacks -P/PCRE)
CAPS_APPEND_RAW="$(python3 -c "
import re, sys
note = sys.stdin.read()
m = re.search(r'APPEND class \(([^)]+)\)', note)
if m:
    for a in m.group(1).split(','):
        print(a.strip())
" <<< "$CAPS_NOTE" | sort -u)"
# Also extract OVERWRITE entries from caps note for parity check (names only, strip size hints)
CAPS_OVERWRITE_RAW="$(python3 -c "
import re, sys
note = sys.stdin.read()
m = re.search(r'OVERWRITE class \(([^)]+)\)', note)
if m:
    for a in m.group(1).split(','):
        # strip size suffix like '≤50L'
        name = re.sub(r'\s*[≤<][^,)]+', '', a).strip()
        if name:
            print(name)
" <<< "$CAPS_NOTE" | sort -u)"
CAPS_REGISTERED="$(printf '%s\n%s\n' "$CAPS_APPEND_RAW" "$CAPS_OVERWRITE_RAW" | grep -v '^$' | sort -u)"

# ─── --self-test: inject ghost agent ─────────────────────────────────────────
if [ "$SELF_TEST" -eq 1 ]; then
  echo "[fence --self-test] injecting ghost agent 'test-ghost-agent' into SCAN_SET"
  SCAN_SET="$(printf '%s\ntest-ghost-agent\n' "$SCAN_SET" | sort -u)"
fi

# ─── FENCE-A: unregistered writers ───────────────────────────────────────────
FENCE_A_FAIL=0
while IFS= read -r agent_id; do
  [ -z "$agent_id" ] && continue
  # Normalize: unified-agent/CHEF scan as "unified-agent" → match "unified-agent/CHEF"
  # The SKILL.md stores "unified-agent/CHEF"; scan finds "unified-agent" from path
  # Check exact match first, then /CHEF suffix variant
  FOUND=0
  if echo "$SKILL_REGISTERED" | grep -qxF "$agent_id"; then
    FOUND=1
  elif echo "$SKILL_REGISTERED" | grep -qF "${agent_id}/"; then
    FOUND=1
  fi
  if [ "$FOUND" -eq 0 ]; then
    echo "[FENCE-A] FAIL: agent '$agent_id' has a notebook-write flow but is NOT in SKILL.md AC-6"
    FENCE_A_FAIL=1
    FAIL=1
  fi
done <<< "$SCAN_SET"

if [ "$FENCE_A_FAIL" -eq 0 ]; then
  echo "[FENCE-A] PASS: all notebook-writing agents are registered in SKILL.md AC-6"
fi

# ─── --self-test result ───────────────────────────────────────────────────────
if [ "$SELF_TEST" -eq 1 ]; then
  if [ "$FENCE_A_FAIL" -eq 1 ]; then
    echo "[fence --self-test] PASS: FENCE-A caught the injected ghost agent 'test-ghost-agent'"
    exit 0
  else
    echo "[fence --self-test] SELF-TEST FAILED: FENCE-A did NOT catch 'test-ghost-agent' — fence is broken"
    exit 1
  fi
fi

# ─── FENCE-B: SSOT parity ────────────────────────────────────────────────────
# Compare SKILL_REGISTERED vs CAPS_REGISTERED (order-independent, whitespace-normalised)
FENCE_B_FAIL=0

# Check SKILL → CAPS direction
while IFS= read -r agent; do
  [ -z "$agent" ] && continue
  # Normalize unified-agent/CHEF for caps lookup
  AGENT_NORM="$(echo "$agent" | sed 's|/.*||')"
  if ! echo "$CAPS_REGISTERED" | grep -qxF "$agent" && ! echo "$CAPS_REGISTERED" | grep -qxF "$AGENT_NORM"; then
    echo "[FENCE-B] FAIL: SSOT parity violation — SKILL.md has '$agent' not in file-size-caps.json note"
    FENCE_B_FAIL=1
    FAIL=1
  fi
done <<< "$APPEND_AGENTS_RAW"

# Check CAPS → SKILL direction (APPEND only — OVERWRITE is not fully in caps note)
while IFS= read -r agent; do
  [ -z "$agent" ] && continue
  # Skip OVERWRITE entries that appear in CAPS note but have size suffixes stripped
  if ! echo "$SKILL_REGISTERED" | grep -qxF "$agent"; then
    echo "[FENCE-B] FAIL: SSOT parity violation — file-size-caps.json note has '$agent' not in SKILL.md"
    FENCE_B_FAIL=1
    FAIL=1
  fi
done <<< "$CAPS_APPEND_RAW"

if [ "$FENCE_B_FAIL" -eq 0 ]; then
  echo "[FENCE-B] PASS: SKILL.md and file-size-caps.json APPEND sets are in parity"
fi

# ─── FENCE-C: hook wired ────────────────────────────────────────────────────
if grep -q "notebook-auto-prune.sh" "$SETTINGS_FILE" 2>/dev/null; then
  echo "[FENCE-C] PASS: notebook-auto-prune.sh hook is wired in settings.local.json"
else
  echo "[FENCE-C] FAIL: notebook-auto-prune.sh hook is NOT wired in settings.local.json"
  FAIL=1
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
if [ "$FAIL" -eq 0 ]; then
  echo "[fence] ALL FENCES PASS"
  exit 0
else
  echo "[fence] FENCE FAILED — see above"
  exit 1
fi
