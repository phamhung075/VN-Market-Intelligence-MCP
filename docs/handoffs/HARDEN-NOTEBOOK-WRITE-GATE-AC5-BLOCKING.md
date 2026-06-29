# Handoff — HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING

**From:** architect  
**To:** agent-father  
**Date:** 2026-06-29  
**Design brief:** `docs/architecture-briefs/2026-06-29-harden-notebook-write-gate-ac5.md`  
**Cascade:** architect(design DONE) → agent-father(impl) → qa(verify)

---

## [Architect] Brownfield Findings

**Zone:** cross-service/ (agent tooling, no microservice code)

**Verified paths:**
- `.claude/skills/notebook-write/SKILL.md` — AC-6 table at line 83; AC-5 gate at line 73–76
- `docs/data/file-size-caps.json` — `caps[1]` (agent-notebook class); `_note` field at line 17
- `scripts/agents-flow/context-bloat-backstop.sh` — existing PostToolUse hook, lines 56–78 (pattern match loop); signal emit at line 163
- `.claude/settings.local.json` — hooks.PostToolUse array at lines 56–75; current matcher "Write|Edit|NotebookEdit"
- `docs/agent-memory/notebooks/*.md` — 42 notebook files; see audit table in brief

**Reuse patterns:**
- `notebook-auto-prune.sh` should mirror the section-parse pattern from SKILL.md AC-3 Step 1 (preamble + ## section boundaries + drop-oldest)
- File-path parsing in new hook: copy boilerplate from `context-bloat-backstop.sh` lines 38–54 (STDIN JSON parse + REL_PATH normalization)
- Atomic write pattern: write to `$TEMP`, then `mv "$TEMP" "$FILE_PATH"` — same as existing orch-apply.sh pattern
- Signal emit: copy structure from context-bloat-backstop.sh lines 153–180; new type = `notebook_unparseable_breach` or `notebook_single_section_overage_breach`

**Design decisions:**
- Hook BACKSTOPS AC-3 (does not replace). Hook fires AFTER write. If AC-3 correctly implemented, hook sees ≤200L and exits 0 (zero side-effect path).
- Hook is pure bash for consistency with all existing hooks. No bun dependency.
- Section boundary = `^## ` (level-2 heading). Preamble = lines before first `## `.
- Drop-oldest = drop the FIRST (oldest) `## ` block. Retain last 3+ sections.
- Safe-fail: if 0 sections found OR only preamble+1 section remains and still over-cap → emit signal, do NOT modify file.
- notebook-auto-prune MUST appear BEFORE context-bloat-backstop in the PostToolUse hooks array so that (a) prune fires first, (b) backstop sees the already-pruned file.

**Scan clean:** true — no existing code conflicts; new scripts do not touch any microservice.

**BUILD-STANDARD: not-applicable** (cross-service maintenance tooling)

---

## Tasks for agent-father

### Task A — BATCH-REGISTER: update both SSOTs

**Files to edit:**

1. `.claude/skills/notebook-write/SKILL.md`  
   - AC-6 APPEND row: extend the agents list to include 12 new agents (see Part 2 of brief for the full replacement row)
   - AC-5 text: change from advisory ("verification gate, NOT a remediation loop") to BLOCKING ("MUST recompose until ≤200L; the PostToolUse hook backstops")

2. `docs/data/file-size-caps.json`  
   - `caps[1]._note` field: update the APPEND parenthetical list to include all 37 agents (25 existing + 12 new: pm, fixer, tran-ngoc-bau, code-janitor, ba, agent-father, alert-commander, architect, qa-responder, cowork-refactory-expert, market-analyst, idea-forge)

Both files in ONE commit. After editing, run:
```bash
bash scripts/audits/notebook-class-fence.sh --self-test  # fence must exist first (Task C)
```

### Task B — Create headless hook `scripts/agents-flow/notebook-auto-prune.sh`

Full contract: `docs/architecture-briefs/2026-06-29-harden-notebook-write-gate-ac5.md` § Part 3b

Key implementation notes:
- Bash only. Shebang: `#!/usr/bin/env bash`
- Always `exit 0` (never blocks the caller)
- Parse STDIN: `STDIN_JSON="$(cat 2>/dev/null || true)"`; extract `FILE_PATH` via jq same as context-bloat-backstop.sh lines 38–42
- Guard: `[[ "$REL_PATH" == docs/agent-memory/notebooks/*.md ]]` AND NOT `docs/agent-memory/notebooks/archive/*`
- wc -l check: `LINE_COUNT=$(wc -l < "$FILE_PATH" | tr -d ' ')` — if ≤200, exit 0 immediately
- Section parse: use `grep -n "^## " "$FILE_PATH"` to get line numbers of ## boundaries; first = preamble end
- Drop-oldest loop: iterate while LINE_COUNT > 200 AND SECTION_COUNT > 1
- Atomic write: `TEMP=$(mktemp)`, compose pruned content, `mv "$TEMP" "$FILE_PATH"` (no Claude tool invoked)
- Signal emit format: copy from context-bloat-backstop.sh, set `"type": "notebook_unparseable_breach"` or `"notebook_single_section_overage_breach"`, `"to": "claude-manager-helper"`
- Make executable: `chmod +x scripts/agents-flow/notebook-auto-prune.sh`

### Task C — Create fence `scripts/audits/notebook-class-fence.sh`

Full contract: `docs/architecture-briefs/2026-06-29-harden-notebook-write-gate-ac5.md` § Part 4

Key implementation notes:
- SCAN: `grep -rl "cowork-end-cycle\|notebook-write" docs/agents/*/flow/ | sed 's|docs/agents/||; s|/flow/.*||' | sort -u`
- READ SKILL.md APPEND list: `grep "| APPEND |" .claude/skills/notebook-write/SKILL.md | sed 's/.*APPEND | //; s/ |.*//'`
- READ file-size-caps.json list: `jq -r '.caps[] | select(.class=="agent-notebook") | ._note' docs/data/file-size-caps.json`
  Then parse agent names from the APPEND parenthetical in that note.
- FENCE-A, FENCE-B, FENCE-C checks as per brief Part 4.
- `--self-test`: inject "test-ghost-agent" into SCAN_SET and assert FENCE-A catches it. Print PASS/FAIL.
- Make executable: `chmod +x scripts/audits/notebook-class-fence.sh`

### Task D — Wire hook in `.claude/settings.local.json`

In the `PostToolUse` array, find the existing `"Write|Edit|NotebookEdit"` entry (context-bloat-backstop.sh). Add the NEW notebook-auto-prune hook as a SEPARATE entry with matcher `"Write|Edit"` BEFORE the existing entry:

```json
{
  "matcher": "Write|Edit",
  "hooks": [
    {
      "type": "command",
      "command": "bash \"$(git rev-parse --show-toplevel 2>/dev/null || pwd)/scripts/agents-flow/notebook-auto-prune.sh\" 2>/dev/null || true"
    }
  ]
}
```

The existing context-bloat-backstop entry stays unchanged. The new hook is additive, not a replacement.

---

## Acceptance Criteria (from orch-state DoD)

- [ ] `bash scripts/audits/notebook-class-fence.sh --self-test` exits 0
- [ ] `bash scripts/audits/notebook-class-fence.sh` exits 0 (zero unregistered, parity clean, hook wired)
- [ ] SKILL.md AC-6 APPEND list contains all 37 agents
- [ ] AC-5 text says BLOCKING
- [ ] notebook-auto-prune.sh is wired in settings.local.json
- [ ] Next write to pm.md by pm agent auto-prunes to ≤200L
- [ ] QA: `wc -l docs/agent-memory/notebooks/*.md` all ≤200 after one write-cycle (excluding archive/)

---

## Commit convention

```
fix(HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING): headless notebook prune hook + AC-5 blocking + fleet registration

Sprint: CROSS-SESSION-MULTI-TEAM-ORCH
Task: HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING
AC: SKILL.md AC-6 fleet-complete / AC-5 BLOCKING / hook wired / fence green
```
