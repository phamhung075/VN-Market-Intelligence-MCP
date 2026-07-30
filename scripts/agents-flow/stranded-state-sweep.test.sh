#!/usr/bin/env bash
# scripts/agents-flow/stranded-state-sweep.test.sh — Regression test for stranded-state-sweep.sh
#
# Sandboxes the sweep against a throwaway git repo (SSS_REPO_ROOT / SSS_ORCH_STATE env
# overrides) so it never touches the live repo's git status or orch-state.json. Covers all
# 3 buckets (AUTO-COMMIT / OWNED-ELSEWHERE / UNKNOWN), the 24h age gate + deletion exemption
# (now shared by AUTO-COMMIT AND UNKNOWN — FIX-STRANDED-SWEEP-CLASSIFY-AGENT-MODEL-SWITCH AC3),
# the `.md`-only sessions gate, the execution cap, the dedup probe, NUL-safe space-path
# parsing, bad-usage exit code, the routine-agent-output OWNED-ELSEWHERE classes (AC4), and the
# content-gated .claude/agent-models.json / .claude/agents/*.md model-switch-only diff check
# (AC1 — positive: diff touches ONLY current_mode/model; negative: an unrelated edit alongside
# it must still land in unknown_paths[]).

set -u

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "FAIL: cannot determine PROJECT_ROOT"; exit 1; }

SCRIPT="$PROJECT_ROOT/scripts/agents-flow/stranded-state-sweep.sh"
SANDBOX="$(mktemp -d 2>/dev/null)"
[ -z "$SANDBOX" ] && { echo "FAIL: mktemp -d failed"; exit 1; }

cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

PASS_COUNT=0
FAIL_COUNT=0
ok()  { echo "PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
bad() { echo "FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

old_ts() { date -v-"$1"d +%Y%m%d%H%M 2>/dev/null || date -d "$1 days ago" +%Y%m%d%H%M; }

git -C "$SANDBOX" init -q
git -C "$SANDBOX" config user.email "test@example.com"
git -C "$SANDBOX" config user.name "test"

mkdir -p "$SANDBOX/docs/agent-memory/notebooks" "$SANDBOX/docs/agent-memory/decisions" \
  "$SANDBOX/docs/agent-memory/sessions" "$SANDBOX/docs/agent-memory/modules" \
  "$SANDBOX/docs/data" "$SANDBOX/docs/signals" "$SANDBOX/scripts/agents-flow" \
  "$SANDBOX/docs/social" "$SANDBOX/docs/raw-input/expert-discussion" "$SANDBOX/.claude/agents"

# --- Baseline content for the content-gated model-switch fixtures (AC1) — committed to HEAD
# BEFORE the working-tree-only edits below so `git diff HEAD` has something to compare against.
cat > "$SANDBOX/.claude/agent-models.json" <<'EOF'
{
  "modes": {
    "normal": {}
  },
  "current_mode": "normal"
}
EOF
cat > "$SANDBOX/.claude/agents/model-switch-clean.md" <<'EOF'
---
name: model-switch-clean
model: haiku
---
body
EOF
cat > "$SANDBOX/.claude/agents/model-switch-dirty.md" <<'EOF'
---
name: model-switch-dirty
model: haiku
tools: Read
---
body
EOF

# git collapses a FULLY-untracked directory to one porcelain line ("?? dir/") — seed one
# tracked placeholder per dir so every fixture below is reported as an individual file,
# matching the live repo (docs/ subtrees are already long-tracked there).
for d in docs/agent-memory/notebooks docs/agent-memory/decisions docs/agent-memory/sessions \
  docs/agent-memory/modules docs/data docs/signals scripts/agents-flow docs/social \
  docs/raw-input/expert-discussion; do
  echo "placeholder" > "$SANDBOX/$d/.tracked-placeholder"
done
git -C "$SANDBOX" add -A >/dev/null
git -C "$SANDBOX" commit -q -m "seed tracked placeholders" >/dev/null

# --- Fixtures: OWNED-ELSEWHERE (untracked; must never appear in auto_commit/unknown) ---
echo '{}' > "$SANDBOX/docs/data/cowork-schedule.json"
echo '{}' > "$SANDBOX/docs/data/coverage-state.json"
echo '{}' > "$SANDBOX/docs/agent-memory/modules/tool-usage-stats.json"
echo '{}' > "$SANDBOX/docs/data/auditor-tier1-last-healthy.json"
echo '{}' > "$SANDBOX/docs/signals/some-signal.json"

# --- Fixtures: OWNED-ELSEWHERE, AC4 routine-agent-output classes (untracked) ---
echo '{}' > "$SANDBOX/docs/data/auditor-dedup-ledger.json"
echo "# dashboard" > "$SANDBOX/docs/data/DASHBOARD.md"
echo '{}' > "$SANDBOX/docs/data/unified-agent-synthesis-2026-07-16-morning.json"
echo "post" > "$SANDBOX/docs/social/fb-post-2026-07-17.md"

# --- Fixtures: OWNED-ELSEWHERE, AC1 content-gated model-switch-ONLY diffs (tracked, baseline
# committed above; working tree now edits ONLY the current_mode / model value line) ---
sed -i.bak 's/"current_mode": "normal"/"current_mode": "performance"/' "$SANDBOX/.claude/agent-models.json" && rm -f "$SANDBOX/.claude/agent-models.json.bak"
sed -i.bak 's/^model: haiku$/model: sonnet/' "$SANDBOX/.claude/agents/model-switch-clean.md" && rm -f "$SANDBOX/.claude/agents/model-switch-clean.md.bak"

# --- Fixture: UNKNOWN, AC1 negative case — same model: line changes, PLUS an unrelated line
# changes alongside it -> must still be flagged unknown, not owned-elsewhere ---
sed -i.bak -e 's/^model: haiku$/model: sonnet/' -e 's/^tools: Read$/tools: Read, Edit/' "$SANDBOX/.claude/agents/model-switch-dirty.md" && rm -f "$SANDBOX/.claude/agents/model-switch-dirty.md.bak"
# aged past the UNKNOWN bucket's own AC3 gate so this fixture proves the CLASSIFICATION
# (not the age gate) is what puts it in unknown_paths — see AC3 fixtures below for the gate itself.
touch -t "$(old_ts 2)" "$SANDBOX/.claude/agents/model-switch-dirty.md"

# --- Fixtures: AUTO-COMMIT memory, old (>24h) — eligible ---
echo "old notebook" > "$SANDBOX/docs/agent-memory/notebooks/agent-a.md"
touch -t "$(old_ts 2)" "$SANDBOX/docs/agent-memory/notebooks/agent-a.md"

# --- Fixtures: AUTO-COMMIT memory, young (<24h) — must be excluded (young-skip) ---
echo "young decision" > "$SANDBOX/docs/agent-memory/decisions/sprint-fresh.md"
touch -t "$(old_ts 0)" "$SANDBOX/docs/agent-memory/decisions/sprint-fresh.md"

# --- Fixtures: AUTO-COMMIT sessions, old .md — eligible; sibling .log must fall to UNKNOWN ---
echo "old session" > "$SANDBOX/docs/agent-memory/sessions/foo.md"
touch -t "$(old_ts 2)" "$SANDBOX/docs/agent-memory/sessions/foo.md"
echo "old log" > "$SANDBOX/docs/agent-memory/sessions/foo.log"
touch -t "$(old_ts 2)" "$SANDBOX/docs/agent-memory/sessions/foo.log"

# --- Fixtures: AUTO-COMMIT scripts, old — eligible + triggers scripts-pointer signal ---
echo "#!/usr/bin/env bash" > "$SANDBOX/scripts/agents-flow/helper.sh"
touch -t "$(old_ts 2)" "$SANDBOX/scripts/agents-flow/helper.sh"

# --- Fixture: UNKNOWN, plain untracked doc + space-containing path (live-repo edge case) ---
# NOTE: placed directly under the already-tracked expert-discussion/ dir (not a new nested
# subdir) so git reports it as an individual file, not a collapsed "dir/" entry.
# NOTE: name deliberately does NOT match the fb-post-*.md OWNED-ELSEWHERE glob (AC4) — this
# fixture proves the generic UNKNOWN fallthrough still works for an unmatched doc name.
# Both are aged past the gate (old_ts 2) so the AC3 UNKNOWN young-skip gate below doesn't
# swallow them — that gate is exercised separately by the random-note-young.md fixture.
echo "random" > "$SANDBOX/docs/social/random-note-2026-07-01.md"
touch -t "$(old_ts 2)" "$SANDBOX/docs/social/random-note-2026-07-01.md"
echo "x" > "$SANDBOX/docs/raw-input/expert-discussion/space file note.md"
touch -t "$(old_ts 2)" "$SANDBOX/docs/raw-input/expert-discussion/space file note.md"

# --- Fixture: UNKNOWN, AC3 age gate — touched "now" (young) must NOT appear in unknown_paths
# under the default 24h gate (Run 1 below); the SAME file re-probed with SSS_AGE_HOURS=0
# (Run 4) must then appear, proving the gate — not the classifier — was withholding it. ---
echo "young unknown note" > "$SANDBOX/docs/social/random-note-young.md"

# --- Fixture: deletion exemption — tracked decisions file, deleted, no mtime possible ---
echo "will be deleted" > "$SANDBOX/docs/agent-memory/decisions/to-delete.md"
git -C "$SANDBOX" add docs/agent-memory/decisions/to-delete.md >/dev/null
git -C "$SANDBOX" commit -q -m "seed" >/dev/null
rm -f "$SANDBOX/docs/agent-memory/decisions/to-delete.md"

# --- Run 1: default cap (20) ---
OUT1="$(SSS_REPO_ROOT="$SANDBOX" SSS_ORCH_STATE="$SANDBOX/nonexistent-orch-state.json" bash "$SCRIPT" --plan 2>"$SANDBOX/stderr1.log")"
RC1=$?
echo "$OUT1" > "$SANDBOX/plan1.json"

[ "$RC1" -eq 0 ] && ok "plan-exit-0" || bad "plan-exit-0 (rc=$RC1)"
echo "$OUT1" | jq -e . >/dev/null 2>&1 && ok "plan-is-valid-json" || bad "plan-is-valid-json"

MEM_PATHS="$(jq -r '.auto_commit[] | select(.category=="memory") | .paths[]' "$SANDBOX/plan1.json" 2>/dev/null)"
echo "$MEM_PATHS" | grep -q "notebooks/agent-a.md" && ok "memory-old-notebook-included" || bad "memory-old-notebook-included"
echo "$MEM_PATHS" | grep -q "to-delete.md" && ok "memory-deletion-exempt-from-age-gate" || bad "memory-deletion-exempt-from-age-gate"
echo "$MEM_PATHS" | grep -q "sprint-fresh.md" && bad "memory-young-decision-excluded" || ok "memory-young-decision-excluded"

SESS_PATHS="$(jq -r '.auto_commit[] | select(.category=="sessions") | .paths[]' "$SANDBOX/plan1.json" 2>/dev/null)"
echo "$SESS_PATHS" | grep -q "sessions/foo.md" && ok "sessions-old-md-included" || bad "sessions-old-md-included"
echo "$SESS_PATHS" | grep -q "foo.log" && bad "sessions-log-excluded-md-only-gate" || ok "sessions-log-excluded-md-only-gate"

SCR_PATHS="$(jq -r '.auto_commit[] | select(.category=="scripts") | .paths[]' "$SANDBOX/plan1.json" 2>/dev/null)"
echo "$SCR_PATHS" | grep -q "helper.sh" && ok "scripts-old-included" || bad "scripts-old-included"

UNK="$(jq -r '.unknown_paths[]' "$SANDBOX/plan1.json" 2>/dev/null)"
echo "$UNK" | grep -q "random-note-2026-07-01.md" && ok "unknown-plain-doc-captured" || bad "unknown-plain-doc-captured"
echo "$UNK" | grep -q "foo.log" && ok "unknown-sessions-log-fallthrough" || bad "unknown-sessions-log-fallthrough"
echo "$UNK" | grep -q "space file note.md" && ok "unknown-space-path-parsed-intact" || bad "unknown-space-path-parsed-intact"

# --- AC1: content-gated model-switch-only diff -> OWNED-ELSEWHERE; unrelated-edit-alongside -> UNKNOWN ---
echo "$UNK" | grep -q "agent-models.json" && bad "model-switch-agent-models-json-owned-elsewhere" || ok "model-switch-agent-models-json-owned-elsewhere"
echo "$UNK" | grep -q "model-switch-clean.md" && bad "model-switch-clean-md-owned-elsewhere" || ok "model-switch-clean-md-owned-elsewhere"
echo "$UNK" | grep -q "model-switch-dirty.md" && ok "model-switch-dirty-md-unrelated-edit-still-unknown" || bad "model-switch-dirty-md-unrelated-edit-still-unknown"

# --- AC4: routine-agent-output classes -> OWNED-ELSEWHERE (never auto_commit/unknown) ---
jq -r '.auto_commit[].paths[], .unknown_paths[]' "$SANDBOX/plan1.json" 2>/dev/null | grep -qE "auditor-dedup-ledger|DASHBOARD.md|unified-agent-synthesis|fb-post-2026-07-17" \
  && bad "ac4-routine-agent-output-never-in-plan" || ok "ac4-routine-agent-output-never-in-plan"

# --- AC3: young (touched "now") UNKNOWN path must NOT be reported this tick ---
echo "$UNK" | grep -q "random-note-young.md" && bad "unknown-young-path-excluded-by-age-gate" || ok "unknown-young-path-excluded-by-age-gate"

OE_COUNT="$(jq -r '.owned_elsewhere_count' "$SANDBOX/plan1.json")"
[ "$OE_COUNT" = "11" ] && ok "owned-elsewhere-count-11" || bad "owned-elsewhere-count-11 (got=$OE_COUNT)"
jq -r '.auto_commit[].paths[], .unknown_paths[]' "$SANDBOX/plan1.json" 2>/dev/null | grep -qE "cowork-schedule|coverage-state|tool-usage-stats|auditor-tier1-last-healthy|signals/some-signal" \
  && bad "owned-elsewhere-never-in-plan" || ok "owned-elsewhere-never-in-plan"

SIG_SUMMARIES="$(jq -r '.signals[].summary' "$SANDBOX/plan1.json" 2>/dev/null)"
echo "$SIG_SUMMARIES" | grep -q "unknown paths need owner" && ok "unknown-signal-emitted" || bad "unknown-signal-emitted"
echo "$SIG_SUMMARIES" | grep -q "Script Persistence pointer" && ok "scripts-pointer-signal-emitted" || bad "scripts-pointer-signal-emitted"
UNK_DEDUP="$(jq -r '.signals[] | select(.dedup_key=="stranded-state-sweep-unknown") | .dedup_skip' "$SANDBOX/plan1.json")"
[ "$UNK_DEDUP" = "false" ] && ok "unknown-signal-dedup-skip-false-no-prior-row" || bad "unknown-signal-dedup-skip-false-no-prior-row (got=$UNK_DEDUP)"

# --- Run 2: dedup — orch-state.json has an OPEN row with the stable (count-free) prefix ---
ORCH="$SANDBOX/orch-state.json"
jq -n '{signal_queue:{rows:[{from:"dev-team", to:"po", status:"NEW", summary:"stranded-state sweep: unknown paths need owner (3)"}]}}' > "$ORCH"
OUT2="$(SSS_REPO_ROOT="$SANDBOX" SSS_ORCH_STATE="$ORCH" bash "$SCRIPT" --plan 2>/dev/null)"
UNK_DEDUP2="$(echo "$OUT2" | jq -r '.signals[] | select(.dedup_key=="stranded-state-sweep-unknown") | .dedup_skip')"
[ "$UNK_DEDUP2" = "true" ] && ok "unknown-signal-dedup-skip-true-count-independent" || bad "unknown-signal-dedup-skip-true-count-independent (got=$UNK_DEDUP2)"

# --- Run 3: execution cap — SSS_CAP=2, only 2 of (2 memory + 2 sessions/scripts + 3 unknown) acted on ---
OUT3="$(SSS_REPO_ROOT="$SANDBOX" SSS_ORCH_STATE="$SANDBOX/nonexistent-orch-state.json" SSS_CAP=2 bash "$SCRIPT" --plan 2>/dev/null)"
CONSIDERED3="$(echo "$OUT3" | jq -r '.considered')"
[ "$CONSIDERED3" = "2" ] && ok "cap-enforced-considered-eq-cap" || bad "cap-enforced-considered-eq-cap (got=$CONSIDERED3)"

# --- Run 4 (AC3): SAME random-note-young.md fixture, SSS_AGE_HOURS=0 -> gate flips from
# "under gate" (Run 1, excluded) to "at/past gate" (age 0 -lt 0 is false) -> now reported.
# Proves the age GATE (not the classifier) was withholding it in Run 1.
OUT4="$(SSS_REPO_ROOT="$SANDBOX" SSS_ORCH_STATE="$SANDBOX/nonexistent-orch-state.json" SSS_AGE_HOURS=0 bash "$SCRIPT" --plan 2>/dev/null)"
UNK4="$(echo "$OUT4" | jq -r '.unknown_paths[]' 2>/dev/null)"
echo "$UNK4" | grep -q "random-note-young.md" && ok "unknown-young-path-included-once-aged-past-gate" || bad "unknown-young-path-included-once-aged-past-gate"

# --- Bad usage ---
bash "$SCRIPT" >/dev/null 2>&1
RC_BAD=$?
[ "$RC_BAD" -eq 2 ] && ok "bad-usage-exit-2" || bad "bad-usage-exit-2 (rc=$RC_BAD)"

echo "========================================"
echo "Test Results: PASS=$PASS_COUNT FAIL=$FAIL_COUNT"
echo "========================================"

[ "$FAIL_COUNT" -gt 0 ] && exit 1
exit 0
