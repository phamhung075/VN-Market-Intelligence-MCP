#!/usr/bin/env bash
# scripts/audits/po-mint-orchapply-actuator-verify.test.sh
# Smoke test for scripts/audits/po-mint-orchapply-actuator-verify.sh
# (FIX-PO-MINT-ACTUATOR-REGRESSION-VERIFIER-SCRIPT).
#
# All synthetic fixtures live under a disposable mktemp dir and are passed to
# the checker via absolute paths through PO_MINT_ACTUATOR_VERIFY_INCLUDE_OVERRIDE
# — the checker never depends on git tracking, so fixtures need not sit inside
# the repo tree at all (unlike the git-ls-files-scoped siblings). Removed on
# exit (trap).
#
# Covers:
#   DoD-1  the 4 files FIX-PO-BATCH-MINT-NO-WRITE-ACTUATOR (commit 3ce726a6e)
#          actually fixed (sprint-kickoff.md, channel-audit.md,
#          market-group.md, telegram-reports.md) pass --check TOGETHER —
#          the exact scope QA's CHANGES_REQUESTED verify asked this script to
#          confirm.
#   DoD-2  synthetic classic-bug shape (prose anchor + JSON-literal fenced
#          example, no jq, no orch-apply.sh) fails via CHECK2.
#   DoD-3  synthetic code-block regression (jq `.task_board.backlog +=`
#          mutation shipped with no orch-apply.sh pipe in the same block)
#          fails via CHECK1.
#   DoD-4  synthetic correct shape (anchor + jq block piped through
#          orch-apply.sh) passes.
#   DoD-5  synthetic cross-reference shape (mirrors sprint-signoff.md's
#          Approve-then-Reject-references-Approve pattern, one shared `##`
#          section) passes — proves Check2's section-scoping does not
#          false-positive on a legitimate "same actuator as above" doc
#          idiom.
#   DoD-6  synthetic markdown-table-cell shape (mirrors the CURRENT live gap
#          in triage-signals.md/triage-signals-longtail.md structurally,
#          without asserting on that mutable live content) fails via CHECK2
#          — proves the checker generalizes beyond the 4 files it was
#          authored against, per feedback_fleetwide_gate_validated_on_one_file_optout_allowlist.
#   DoD-7  full live-corpus smoke run never crashes (exit 0 or 1 only).
#
# Usage: bash scripts/audits/po-mint-orchapply-actuator-verify.test.sh

set -u
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "FAIL: cannot determine PROJECT_ROOT"; exit 1; }
cd "$PROJECT_ROOT" || { echo "FAIL: cannot cd to PROJECT_ROOT"; exit 1; }

SCRIPT="$PROJECT_ROOT/scripts/audits/po-mint-orchapply-actuator-verify.sh"
FIXTURE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/po-mint-actuator-verify-test.XXXXXX")

# shellcheck disable=SC2329 # invoked indirectly via `trap ... EXIT` below
cleanup() { rm -rf "$FIXTURE_DIR"; }
trap cleanup EXIT

PASS_COUNT=0
FAIL_COUNT=0
ok()  { echo "PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
bad() { echo "FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

# ---------------------------------------------------------------------------
# DoD-1: the 4 files the original fix actually touched pass, scoped together.
# ---------------------------------------------------------------------------
FIXED_FILES="docs/agents/po/flow/sprint-kickoff.md docs/agents/po/flow/channel-audit.md docs/agents/po/flow/market-group.md docs/agents/po/flow/telegram-reports.md"
OUT1=$(PO_MINT_ACTUATOR_VERIFY_INCLUDE_OVERRIDE="$FIXED_FILES" bash "$SCRIPT" 2>&1)
RC1=$?
if [ "$RC1" -eq 0 ] && echo "$OUT1" | grep -q "^PASS:"; then
  ok "DoD-1-the-4-fixed-subflows-pass-together (rc=${RC1})"
else
  bad "DoD-1-the-4-fixed-subflows-pass-together (rc=${RC1})"
  echo "$OUT1"
fi

# ---------------------------------------------------------------------------
# DoD-2: classic pre-fix shape — prose anchor + JSON-literal fenced example,
# no jq, no orch-apply.sh anywhere. Mirrors market-group.md's actual
# pre-3ce726a6e text verbatim in shape.
# ---------------------------------------------------------------------------
F2="$FIXTURE_DIR/dod2-classic-prose-only.md"
cat > "$F2" <<'EOF'
# PO — Synthetic Flow (DoD-2)

### 3b. System Bug
- Same alert fired twice?
→ Append to `.task_board.backlog[]` (atomic write):
```json
{"id": "TASK-NNN", "summary": "[BUG] synthetic — market-group", "priority": "high"}
```
EOF
OUT2=$(PO_MINT_ACTUATOR_VERIFY_INCLUDE_OVERRIDE="$F2" bash "$SCRIPT" 2>&1)
RC2=$?
if [ "$RC2" -eq 1 ] && echo "$OUT2" | grep -q "CHECK2"; then
  ok "DoD-2-classic-prose-only-json-literal-fails-via-CHECK2 (rc=${RC2})"
else
  bad "DoD-2-classic-prose-only-json-literal-fails-via-CHECK2 (rc=${RC2})"
  echo "$OUT2"
fi

# ---------------------------------------------------------------------------
# DoD-3: code-block regression — a literal jq `.task_board.backlog +=`
# mutation shipped with NO orch-apply.sh pipe anywhere in the block.
# ---------------------------------------------------------------------------
F3="$FIXTURE_DIR/dod3-unpiped-mutation-block.md"
cat > "$F3" <<'EOF'
# PO — Synthetic Flow (DoD-3)

**If 1+ issues found**: create bug/correction tasks — write actuator, never a raw write:
```bash
jq --arg id "TASK-NNN" --arg title "synthetic" \
  '.task_board.backlog += [{id:$id, title:$title, status:"BACKLOG"}]' \
  "$PROJECT_ROOT/docs/data/orch/orch-state.json" > /tmp/synthetic-raw-overwrite.json
```
EOF
OUT3=$(PO_MINT_ACTUATOR_VERIFY_INCLUDE_OVERRIDE="$F3" bash "$SCRIPT" 2>&1)
RC3=$?
if [ "$RC3" -eq 1 ] && echo "$OUT3" | grep -q "CHECK1"; then
  ok "DoD-3-unpiped-mutation-block-fails-via-CHECK1 (rc=${RC3})"
else
  bad "DoD-3-unpiped-mutation-block-fails-via-CHECK1 (rc=${RC3})"
  echo "$OUT3"
fi

# ---------------------------------------------------------------------------
# DoD-4: positive control — the correct, already-shipped idiom (anchor + jq
# piped through orch-apply.sh in the same block) passes clean.
# ---------------------------------------------------------------------------
F4="$FIXTURE_DIR/dod4-correct-shape.md"
cat > "$F4" <<'EOF'
# PO — Synthetic Flow (DoD-4)

**If 1+ issues found**: create bug/correction tasks in `docs/data/orch/orch-state.json` `.task_board.backlog[]` — write actuator, never a raw read→modify→write, ALWAYS route via `scripts/orch-apply.sh`:
```bash
jq --arg id "TASK-NNN" --arg title "synthetic" \
  '.task_board.backlog += [{id:$id, title:$title, status:"BACKLOG"}]' \
  "$PROJECT_ROOT/docs/data/orch/orch-state.json" | bash "$PROJECT_ROOT/scripts/orch-apply.sh"
```
EOF
OUT4=$(PO_MINT_ACTUATOR_VERIFY_INCLUDE_OVERRIDE="$F4" bash "$SCRIPT" 2>&1)
RC4=$?
if [ "$RC4" -eq 0 ]; then
  ok "DoD-4-correct-shape-passes (rc=${RC4})"
else
  bad "DoD-4-correct-shape-passes (rc=${RC4})"
  echo "$OUT4"
fi

# ---------------------------------------------------------------------------
# DoD-5: cross-reference shape — mirrors sprint-signoff.md's real Approve/
# Reject pattern (one shared `##` section; Reject references Approve's
# actuator instead of repeating the jq literally). Proves Check2's
# section-scoping does not false-positive on this legitimate doc idiom.
# ---------------------------------------------------------------------------
F5="$FIXTURE_DIR/dod5-cross-reference-shape.md"
cat > "$F5" <<'EOF'
# PO — Synthetic Flow (DoD-5)

## When Something Happens

- **Approve** → update `docs/data/orch/orch-state.json` `.task_board` tasks to DONE (atomic write — route through orch-apply.sh):
  ```bash
  jq '...' "$PROJECT_ROOT/docs/data/orch/orch-state.json" | bash "$PROJECT_ROOT/scripts/orch-apply.sh"
  ```

- **Reject** → open Backlog tasks for remaining issues in `docs/data/orch/orch-state.json` `.task_board.backlog[]` (same pattern as Approve path) → return.

## After RETURN
Commit notebook.
EOF
OUT5=$(PO_MINT_ACTUATOR_VERIFY_INCLUDE_OVERRIDE="$F5" bash "$SCRIPT" 2>&1)
RC5=$?
if [ "$RC5" -eq 0 ]; then
  ok "DoD-5-cross-reference-shape-passes-no-false-positive (rc=${RC5})"
else
  bad "DoD-5-cross-reference-shape-passes-no-false-positive (rc=${RC5})"
  echo "$OUT5"
fi

# ---------------------------------------------------------------------------
# DoD-6: markdown-table-cell shape — mirrors the STRUCTURAL shape of the
# CURRENT live gap in triage-signals.md/triage-signals-longtail.md (a table
# row minting into .task_board.backlog[] in prose, single H1 heading, zero
# fenced code, zero orch-apply.sh anywhere) WITHOUT asserting on that mutable
# live content — proves the checker generalizes to this doc shape rather than
# having been tuned to only the 4 files it was authored against.
# ---------------------------------------------------------------------------
F6="$FIXTURE_DIR/dod6-table-cell-shape.md"
cat > "$F6" <<'EOF'
# PO — Synthetic Signal Table (DoD-6)

| `type` | Action |
|---|---|
| `zone_missing_synthetic` | Open a CHORE task. If new: append to `.task_board.backlog[]` — canonical shape `{id, title, status: "BACKLOG"}`, mark signal processed. |
EOF
OUT6=$(PO_MINT_ACTUATOR_VERIFY_INCLUDE_OVERRIDE="$F6" bash "$SCRIPT" 2>&1)
RC6=$?
if [ "$RC6" -eq 1 ] && echo "$OUT6" | grep -q "CHECK2"; then
  ok "DoD-6-table-cell-shape-fails-via-CHECK2-generalizes-beyond-authored-files (rc=${RC6})"
else
  bad "DoD-6-table-cell-shape-fails-via-CHECK2-generalizes-beyond-authored-files (rc=${RC6})"
  echo "$OUT6"
fi

# ---------------------------------------------------------------------------
# DoD-7: full live-corpus smoke run never crashes (exit 0 or 1 only, never 2).
# Deliberately does NOT assert PASS/FAIL — the live corpus is mutable and, at
# authoring time, genuinely contains 2 not-yet-fixed files (see script header
# LIVE RESULT note); this is a crash/usage-error smoke check only.
# ---------------------------------------------------------------------------
bash "$SCRIPT" > "$FIXTURE_DIR/live-run.txt" 2>&1
RC7=$?
if [ "$RC7" -eq 0 ] || [ "$RC7" -eq 1 ]; then
  ok "DoD-7-full-live-corpus-smoke-run-no-crash (rc=${RC7})"
else
  bad "DoD-7-full-live-corpus-smoke-run-no-crash (rc=${RC7}, expected 0 or 1)"
  cat "$FIXTURE_DIR/live-run.txt"
fi

echo "========================================"
echo "Test Results: PASS=${PASS_COUNT} FAIL=${FAIL_COUNT}"
echo "========================================"

[ "$FAIL_COUNT" -gt 0 ] && exit 1
exit 0
