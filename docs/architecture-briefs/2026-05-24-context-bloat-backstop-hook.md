# Architecture Brief: Deterministic Context-Bloat Backstop Hook

**Date:** 2026-05-24
**Slug:** `context-bloat-backstop-hook`
**Author:** agents-architect
**Status:** FINAL — signal emitted to agent-father
**Implements:** PostToolUse hook, non-blocking, harness-enforced size cap detection

---

## 1. Problem Statement

Agent notebooks and governed context files grow past their line caps when model-tier downgrade (haiku) causes agents to skip advisory prune steps baked into skills and flows. The result is deterministic token waste: every cycle that loads an oversize notebook pays the full token cost.

**Observed breaches (motivating evidence):**
- `docs/agent-memory/notebooks/pm.md` reached 1679 L against a 200 L cap — 8.4× overage
- `docs/TASKS.md` reached 238 L against an 80 L cap — 3× overage
- Combined load overhead estimated at ~50k extra tokens per cycle

**Existing first line of defence:** agent-father added an in-skill `wc -l` self-heal gate in skills/flows. That gate is model-skippable (haiku omits advisory steps). This brief specifies the DETERMINISTIC backstop: a PostToolUse hook the Claude Code harness runs after every Write/Edit, regardless of model.

**Design is pre-decided. This brief encodes, locates SSOT, and defines the signal contract. It does not re-litigate decisions.**

---

## 2. SSOT Location Decision

**Decision: dedicated `docs/data/file-size-caps.json`**

Rationale for NOT folding into `docs/data/system-map.json`:

| Criterion | system-map.json | file-size-caps.json |
|---|---|---|
| Maintained by | PM / system-auditor (service topology) | agents-architect → agent-father (governance) |
| Change trigger | service add/remove, agent roster, watchlist | cap policy revision, new file class |
| Read by | all agents via jq | hook script only + janitor flow |
| Coupling risk | adding size-cap keys to a 500+ L topology SSOT = noise | isolated, purpose-clear |
| jq surface | already queried for services/agents/zones | clean single-purpose query |

The hook reads caps with a single `jq` expression from `docs/data/file-size-caps.json`. The system-map.json remains untouched.

**SSOT file path:** `docs/data/file-size-caps.json`

**Required structure (agent-father to create):**

```json
{
  "_ssot": "docs/data/file-size-caps.json",
  "_note": "Line caps for governed context-surface files. Read by .claude/scripts/context-bloat-backstop.sh. Maintained by agents-architect policy. Code and data JSON are explicitly NOT governed.",
  "_maintained_by": "agents-architect (policy) / agent-father (implementation)",
  "caps": [
    {
      "pattern": "docs/agent-memory/notebooks/*.md",
      "cap": 200,
      "class": "agent-notebook"
    },
    {
      "pattern": "docs/TASKS.md",
      "cap": 80,
      "class": "sprint-task-index"
    },
    {
      "pattern": ".claude/flows/**/*.md",
      "cap": 120,
      "class": "flow-file"
    },
    {
      "pattern": ".claude/skills/**/*.md",
      "cap": 120,
      "class": "skill-file"
    },
    {
      "pattern": ".claude/agents/*.md",
      "cap": 120,
      "class": "agent-definition"
    }
  ]
}
```

**Explicitly NOT governed (hook exits immediately):**
- `apps/**` — production code
- `docs/data/*.json` — volatile data
- `docs/signals/**` — signal bus files
- `docs/architecture-briefs/**` — output artifacts
- Anything not matching a `caps[].pattern` entry

---

## 3. Hook Specification

### 3.1 Hook Entry — `.claude/settings.local.json`

Agent-father adds a `PostToolUse` key alongside the existing `PreToolUse` and `Stop` keys:

```json
"PostToolUse": [
  {
    "matcher": "Write|Edit|NotebookEdit",
    "hooks": [
      {
        "type": "command",
        "command": "bash \"$(git rev-parse --show-toplevel 2>/dev/null || pwd)/.claude/scripts/context-bloat-backstop.sh\" 2>/dev/null || true"
      }
    ]
  }
]
```

Notes:
- `|| true` matches existing project hook style — non-blocking under all failure modes
- `git rev-parse --show-toplevel` resolves absolute project root, matching `branch-hygiene-stop.sh` pattern
- `matcher: "Write|Edit|NotebookEdit"` targets all file-write surfaces; `Read` and `Bash` excluded (read-only, no state change)
- No `CLAUDE_TOOL_INPUT` or `CLAUDE_TOOL_OUTPUT` env var parsing required — the script inspects the written file by resolving the path itself (see §3.2)

### 3.2 Script Specification — `.claude/scripts/context-bloat-backstop.sh`

**Hard performance requirement:** For non-governed paths, the script must classify and exit within a single glob match + early return. The hot path (non-governed file) is: one `case` match → `exit 0`. No `wc -l` is called for non-governed files.

**Pseudocode (implement exactly this logic):**

```
#!/usr/bin/env bash
set -euo pipefail

# Resolve project root (matches branch-hygiene-stop.sh pattern)
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CAPS_FILE="$PROJECT_ROOT/docs/data/file-size-caps.json"
SIGNALS_DIR="$PROJECT_ROOT/docs/signals"

# Guard: SSOT must exist
[ -f "$CAPS_FILE" ] || exit 0

# Get the file path written by the tool
# Claude Code injects CLAUDE_TOOL_INPUT_PATH for Write/Edit hooks
FILE_PATH="${CLAUDE_TOOL_INPUT_PATH:-}"
[ -z "$FILE_PATH" ] && exit 0

# Normalize to relative path from project root
REL_PATH="${FILE_PATH#$PROJECT_ROOT/}"

# CLASSIFY: check if REL_PATH matches any governed pattern
# Iterate caps array from SSOT; first match wins
MATCHED_CAP=""
MATCHED_CLASS=""

# Patterns are evaluated in order via jq iteration
while IFS=$'\t' read -r pattern cap class; do
  # Use bash glob-style match (fnmatch via case)
  case "$REL_PATH" in
    $pattern)
      MATCHED_CAP="$cap"
      MATCHED_CLASS="$class"
      break
      ;;
  esac
done < <(jq -r '.caps[] | [.pattern, (.cap | tostring), .class] | @tsv' "$CAPS_FILE")

# Non-governed path → instant exit (hot path)
[ -z "$MATCHED_CAP" ] && exit 0

# MEASURE: count lines in the written file
[ -f "$FILE_PATH" ] || exit 0
LINE_COUNT=$(wc -l < "$FILE_PATH" | tr -d ' ')

# Within cap → exit clean
[ "$LINE_COUNT" -le "$MATCHED_CAP" ] && exit 0

# BREACH DETECTED → emit maintenance signal
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SIGNAL_ID="context-bloat-$(echo "$REL_PATH" | tr '/' '-')-${TIMESTAMP//:/}"
SIGNAL_FILE="$SIGNALS_DIR/${SIGNAL_ID}.json"

cat > "$SIGNAL_FILE" <<EOF
{
  "from": "context-bloat-backstop-hook",
  "to": "claude-manager-helper",
  "type": "context_bloat_breach",
  "priority": "high",
  "createdAt": "$TIMESTAMP",
  "payload": {
    "file": "$REL_PATH",
    "line_count": $LINE_COUNT,
    "cap": $MATCHED_CAP,
    "class": "$MATCHED_CLASS",
    "overage": $((LINE_COUNT - MATCHED_CAP)),
    "action_required": "prune_or_split"
  }
}
EOF

exit 0   # Always non-blocking — the write already happened
```

**Key invariants:**
1. The script NEVER blocks the write — it always exits 0
2. `jq` is called at most once (for governed files only)
3. `wc -l` is called at most once (after classification confirms governed)
4. Signal file is written atomically via `cat >` heredoc (no partial writes)
5. If `CAPS_FILE` is missing the hook exits 0 silently (bootstrappable)

---

## 4. Signal Contract — `context_bloat_breach`

**Consumer:** `claude-manager-helper` (Context Janitor)
**Signal bus:** `docs/signals/<id>.json` — the existing JSON file bus (NOT `docs/signals/DASHBOARD.md`, which is the cowork-agent inbox; the file bus is what the janitor already polls)

**Signal schema:**

```json
{
  "from": "context-bloat-backstop-hook",
  "to": "claude-manager-helper",
  "type": "context_bloat_breach",
  "priority": "high",
  "createdAt": "<ISO-8601 UTC>",
  "payload": {
    "file": "<relative path from project root>",
    "line_count": "<integer — actual line count at time of write>",
    "cap": "<integer — configured cap from SSOT>",
    "class": "<string — one of: agent-notebook | sprint-task-index | flow-file | skill-file | agent-definition>",
    "overage": "<integer — line_count minus cap>",
    "action_required": "prune_or_split"
  }
}
```

**Signal ID format:** `context-bloat-<file-path-dashes>-<YYYYMMDDTHHMMSSz>.json`
Example: `context-bloat-docs-agent-memory-notebooks-pm.md-20260524T062302Z.json`

**Janitor consumption protocol** (to be added to `claude-manager-helper/main.md` Pass 5 or as new Pass 5b):

On each cron cycle, after the existing Pass 5 (size-caps via git-diff), the janitor additionally:

1. `ls docs/signals/context-bloat-*.json` — find pending breach signals
2. For each signal: read `payload.file`, `payload.class`, `payload.cap`
3. Apply the appropriate prune action by class:
   - `agent-notebook` → trim to ≤200 L (keep most recent entries, archive older ones to a `## Archive` section or delete)
   - `sprint-task-index` → archive DONE rows to `docs/TASKS_ARCHIVE.md`, target ≤80 L
   - `flow-file` / `skill-file` / `agent-definition` → measure actual current line count; if still over cap, flag to architect via subagent spawn (cannot auto-split safely)
4. Move processed signal to `docs/signals/processed/` after action complete
5. Log in Pass 10 report: "Pass 5b context-bloat: N breaches detected | M pruned | K escalated to architect"

**Why file bus, not DASHBOARD.md:** DASHBOARD.md is the cowork-agent inbox (market-hours analysis loop). The janitor's existing signal consumption is via direct `docs/signals/` file reads (system-auditor rows on DASHBOARD are a different reader class). The `context_bloat_breach` signals are maintenance-tier, not market-hours-tier, and must survive across multiple janitor cycles without DASHBOARD pruning wiping them.

---

## 5. Affected Files — Implementation Checklist for agent-father

| # | File | Action | Notes |
|---|---|---|---|
| F1 | `.claude/settings.local.json` | Add `PostToolUse` block | See §3.1 exact JSON |
| F2 | `.claude/scripts/context-bloat-backstop.sh` | CREATE new script | See §3.2 pseudocode; make executable (`chmod +x`) |
| F3 | `docs/data/file-size-caps.json` | CREATE new SSOT file | See §2 exact JSON structure |
| F4 | `.claude/flows/claude-manager-helper/main.md` | ADD Pass 5b | After existing Pass 5; consume `context-bloat-*.json` signals |
| F5 | `.claude/agents/claude-manager-helper.md` | UPDATE `capabilities` + `knowledge.lazy_load` | Add `context_bloat_breach` signal consumption to capabilities; add `docs/data/file-size-caps.json` as lazy_load trigger `pass_5b_bloat` |

**Sequencing:** F3 (SSOT) must land before F2 (script reads it). F2 must land before F1 (hook references it). F4+F5 can land in same commit as F1+F2+F3.

**Single commit target:** `feat(hooks): context-bloat backstop hook + janitor Pass 5b`

---

## 6. Self-Test Recipe

After agent-father ships all 5 files, validate the hook fires correctly:

**Test 1 — hot-path exit (non-governed file):**
```bash
# Write a large code file — should produce NO signal
python3 -c "print('\n'.join(['x=1']*300))" > /tmp/test-no-signal.ts
# Then write via Claude Code Write tool targeting apps/mcp-server/src/test-no-signal.ts
# Verify: ls docs/signals/context-bloat-apps-* → empty (no signal emitted)
```

**Test 2 — governed file breach:**
```bash
# Deliberately write an oversize notebook
python3 -c "print('\n'.join(['## entry']*210))" > docs/agent-memory/notebooks/test-architect-probe.md
# Verify within 2s: ls docs/signals/context-bloat-docs-agent-memory-notebooks-test-architect-probe* → 1 file
# Verify signal JSON: jq '.payload' docs/signals/context-bloat-docs-agent-memory-notebooks-test-architect-probe*.json
# Expected: line_count=210, cap=200, overage=10, class="agent-notebook"
# Cleanup: rm docs/agent-memory/notebooks/test-architect-probe.md docs/signals/context-bloat-*probe*.json
```

**Test 3 — non-blocking proof:**
```bash
# Write a governed file that is oversize
# Verify the Write tool returns success (exit 0) regardless of breach
# Verify the written file content is intact (hook never modifies the file)
```

**Test 4 — SSOT missing graceful exit:**
```bash
mv docs/data/file-size-caps.json /tmp/caps-backup.json
# Write a notebook — should produce NO signal, hook exits 0 silently
mv /tmp/caps-backup.json docs/data/file-size-caps.json
```

---

## 7. Out of Scope (Explicit Boundaries)

- This hook does NOT block writes — never will. The content is legitimate.
- This hook does NOT auto-prune. Auto-pruning is the janitor's job.
- This hook does NOT alert the user via Telegram. Breach signals are maintenance-tier noise.
- The `cap` values in `file-size-caps.json` are policy, not hard filesystem limits. They may be revised by agents-architect via a brief + signal.
- `.claude/flows/**` cap of 120 L is the existing split policy. Files with a `<!-- size-justification: NL -->` comment that explains why they exceed 120 L are NOT considered violations (janitor must check for that comment before flagging flow/skill/agent-definition class files to architect).

---

## 8. Dependencies

- No new MCP tools required
- No Docker rebuild required
- No database schema change required
- Requires `jq` on macOS (already present — used by existing scripts)
- Requires `CLAUDE_TOOL_INPUT_PATH` env var to be injected by Claude Code harness for PostToolUse hooks (agent-father to verify this env var name against Claude Code SDK docs before implementing; if name differs, adjust §3.2 accordingly)

---

**Brief complete. Signal dropped to agent-father. See `docs/signals/` for the implementation signal.**
