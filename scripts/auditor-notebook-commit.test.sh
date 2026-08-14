#!/usr/bin/env bash
# scripts/auditor-notebook-commit.test.sh
#
# Regression + synthetic-replay test for scripts/auditor-notebook-commit.sh
# §2b (FIX-AUDITOR-NOTEBOOK-COMMIT-PLANE-CROSSCHECK-GATE) and the new pure
# helpers it uses in scripts/lib/output-contract-invariant.sh.
#
# Root cause this closes: docs/architecture-briefs/2026-08-14-auditor-write-
# plane-divergence-root-cause.md — the pre-existing §2a AC-4 backstop scans
# the staged notebook diff for a literal `[OUTPUT-CONTRACT]` line the current
# flow doc never actually writes into the notebook (only into the RETURN
# block, computed by a DIFFERENT script call that now runs AFTER the
# notebook is already committed) — structurally unreachable since 2026-08-06.
#
# Test strategy:
#   U1-U10  Pure unit tests of the 3 new scripts/lib/output-contract-
#           invariant.sh functions — no git, no network.
#   I1-I8   Integration tests: the REAL script run as a REAL subprocess
#           (`bash scripts/auditor-notebook-commit.sh ...`) against an
#           isolated tmp git repo, with ONLY the external network transport
#           (curl, used by mcp-call.sh for the commit-mutex task_claim/
#           task_release) intercepted via a PATH-shadowing fake `curl`
#           binary (same technique as scripts/agents-flow/auditor-tier1-
#           probe.test.sh's own CLI-level T22/T23) — ZERO real network calls,
#           ZERO real commit-mutex:main contention with the live fleet.
#
#   I1/I2 are the AC-4 "synthetic replay" pair the owning task explicitly
#   requires (not just presence-of-code — see memory
#   feedback_fence_false_green): I1 replays the EXACT unmodified 2-arg call
#   contract every existing caller (including system-auditor's OWN call site
#   until its follow-up 2-arg edit lands) still uses today — proving the
#   vulnerable "declared>0/markers=0 still commits" shape is real and
#   reachable RIGHT NOW. I2 replays the identical mismatch shape but with the
#   new --markers-file flag supplied (the shape the flow-doc call-site edit
#   will produce once it lands) — proving the SAME script instance now
#   ABORTS instead. This is durable as a regression test forever (it does
#   not depend on diffing stale git history) because it exercises the two
#   CURRENTLY-SUPPORTED call shapes (flag omitted vs supplied) of the ONE
#   already-fixed script, not an old script blob.
#
# Run:
#   bash scripts/auditor-notebook-commit.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: FIX-AUDITOR-NOTEBOOK-COMMIT-PLANE-CROSSCHECK-GATE
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMMIT_SH="$SCRIPT_DIR/auditor-notebook-commit.sh"
LIB_SH="$SCRIPT_DIR/lib/output-contract-invariant.sh"

if [ ! -f "$COMMIT_SH" ]; then
  echo "ERROR: auditor-notebook-commit.sh not found at $COMMIT_SH" >&2
  exit 1
fi
if [ ! -f "$LIB_SH" ]; then
  echo "ERROR: output-contract-invariant.sh not found at $LIB_SH" >&2
  exit 1
fi

PASS=0
FAIL=0

check() {
  local label="$1" cond="$2"
  if [ "$cond" = "true" ]; then
    echo "PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label"
    FAIL=$((FAIL + 1))
  fi
}

TMPDIR_TEST=$(mktemp -d /private/tmp/auditor-notebook-commit-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

# =============================================================================
# U1-U10 — pure unit tests of the new lib functions (no git, no network)
# =============================================================================
# shellcheck source=./lib/output-contract-invariant.sh
source "$LIB_SH"

U1=$(printf '+- Anomalies: 3 new (0 critical, 1 warn, 2 info) | 0 dedup-skipped\n' | oc_extract_declared_anomaly_count_from_diff)
check "U1 extracts declared_n=3 from a diff-ADDED Anomalies line" "$([ "$U1" = "3" ] && echo true || echo false)"

U2=$(printf ' - Anomalies: 7 new (unchanged context line, no leading +)\n' | oc_extract_declared_anomaly_count_from_diff)
check "U2 unchanged-context line (no leading single +) does not contribute" "$([ "$U2" = "0" ] && echo true || echo false)"

U3=$(printf -- '-- Anomalies: 9 new (file-header ++, not a real add)\n' | oc_extract_declared_anomaly_count_from_diff)
check "U3 diff file-header (++) does not false-match" "$([ "$U3" = "0" ] && echo true || echo false)"

U4=$(printf '+- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 2 dedup-skipped\n' | oc_extract_declared_anomaly_count_from_diff)
check "U4 declared_n=0 line extracts 0 (genuine ALL_GREEN shape)" "$([ "$U4" = "0" ] && echo true || echo false)"

U5=$(printf '' | oc_extract_declared_anomaly_count_from_diff)
check "U5 empty diff text -> 0" "$([ "$U5" = "0" ] && echo true || echo false)"

M_OK="$TMPDIR_TEST/markers-ok.txt"
printf '[fire-election] tier=1\n[emit-signal] OK id=1 check_id=A-01\n[emit-signal] SKIP-dedup id=2 check_id=A-02\n' > "$M_OK"
U6=$(oc_count_real_emit_signals "$M_OK")
check "U6 counts real OK + SKIP-dedup emit-signal lines (=2)" "$([ "$U6" = "2" ] && echo true || echo false)"

M_EMPTY="$TMPDIR_TEST/markers-empty.txt"
: > "$M_EMPTY"
U7=$(oc_count_real_emit_signals "$M_EMPTY")
check "U7 empty markers file -> 0" "$([ "$U7" = "0" ] && echo true || echo false)"

U8=$(oc_count_real_emit_signals "$TMPDIR_TEST/does-not-exist.txt")
check "U8 missing markers file -> 0, not an error" "$([ "$U8" = "0" ] && echo true || echo false)"

oc_check_emit_vs_claim_plane 3 0
RC_U9=$?
check "U9 declared=3 real=0 -> violation (rc=1)" "$([ "$RC_U9" -eq 1 ] && echo true || echo false)"

oc_check_emit_vs_claim_plane 3 2
RC_U10=$?
check "U10 declared=3 real=2 -> sound (rc=0)" "$([ "$RC_U10" -eq 0 ] && echo true || echo false)"

oc_check_emit_vs_claim_plane 0 0
RC_U11=$?
check "U11 declared=0 real=0 -> sound (rc=0), ALL_GREEN never engages" "$([ "$RC_U11" -eq 0 ] && echo true || echo false)"

# =============================================================================
# I1-I8 — integration tests: REAL subprocess against a REAL tmp git repo,
# only curl (network transport) stubbed via PATH-shadowing.
# =============================================================================
BIN_DIR="$TMPDIR_TEST/bin"
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/curl" <<'STUBEOF'
#!/usr/bin/env bash
# Fake curl — intercepts mcp-call.sh's POST to task_claim/task_release and
# returns a canned SSE-framed JSON-RPC success response. ZERO real network
# calls anywhere in this suite (no live commit-mutex:main contention).
body=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "-d" ]; then
    body="$arg"
  fi
  prev="$arg"
done
tool=$(printf '%s' "$body" | jq -r '.params.name // empty' 2>/dev/null)
case "$tool" in
  task_claim)   text='{"claimed":true}' ;;
  task_release) text='{"released":true}' ;;
  *)            text='{}' ;;
esac
payload=$(jq -cn --arg t "$text" '{jsonrpc:"2.0",id:1,result:{content:[{type:"text",text:$t}]}}')
if [ -n "${MOCK_CALL_LOG:-}" ]; then
  printf 'CALL: %s\n' "$tool" >> "$MOCK_CALL_LOG"
fi
printf 'event: message\ndata: %s\n\n200' "$payload"
STUBEOF
chmod +x "$BIN_DIR/curl"

export CLAUDE_CODE_SESSION_ID="test-session-fake-0000"
export MOCK_CALL_LOG="$TMPDIR_TEST/mcp-calls.log"

NB_REL="docs/agent-memory/notebooks/system-auditor.md"

# new_test_repo — isolated tmp git repo, seeded with a baseline committed
# notebook. Prints the repo's absolute path.
new_test_repo() {
  local repo
  repo=$(mktemp -d "$TMPDIR_TEST/repo-XXXXXX")
  mkdir -p "$repo/docs/agent-memory/notebooks"
  (cd "$repo" && git init -q . && git config user.email test@test.local && git config user.name test)
  printf '# system-auditor notebook\n\n## c1 · 2026-08-01T00:00Z\n### Audit Run Tier-1 (00:00-00:30 UTC 2026-08-01)\n- Tier: 1 | Services: 5 checked\n- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped\n- Status: HEALTHY\n' > "$repo/$NB_REL"
  (cd "$repo" && git add "$NB_REL" && git commit -q -m "seed baseline")
  printf '%s' "$repo"
}

run_commit_cli() {
  # $1 = repo path, remaining args passed straight to auditor-notebook-commit.sh
  local repo="$1"
  shift
  (cd "$repo" && PATH="$BIN_DIR:$PATH" bash "$COMMIT_SH" "$@")
}

# ── I1: BEFORE-state replay (AC-4) — exact unmodified 2-arg call contract
# (no --markers-file), a genuine "Anomalies: 3 new" claim with ZERO real
# emit-signal backing (the exact live-confirmed defect shape, brief §3/§6).
# Proves the vulnerable shape is REAL and REACHABLE via today's actual call
# site, not a hypothetical. ────────────────────────────────────────────────
REPO1=$(new_test_repo)
{
  printf '\n## c2 · 2026-08-14T06:15Z\n'
  printf '### Audit Run Tier-1 (06:15-06:16 UTC 2026-08-14)\n'
  printf '%s\n' '- Tier: 1 | Services: 5 checked'
  printf '%s\n' '- Anomalies: 3 new (1 critical, 1 warn, 1 info) | 0 dedup-skipped'
  printf '%s\n' '- Status: CRITICAL'
} >> "$REPO1/$NB_REL"
: > "$MOCK_CALL_LOG"
OUT_I1=$(run_commit_cli "$REPO1" "chore(memory/system-auditor): notebook c2" "$NB_REL")
RC_I1=$?
LOG_LINES_I1=$(cd "$REPO1" && git log --oneline | wc -l | tr -d ' ')
check "I1 BEFORE-state: declared=3/markers=0, --markers-file OMITTED -> commit SUCCEEDS (old vulnerable shape still reachable via unmodified call contract)" \
  "$(printf '%s' "$OUT_I1" | grep -q '^\[auditor-commit\] mutex-paired commit' && [ "$RC_I1" -eq 0 ] && echo true || echo false)"
check "I1 a real second commit landed (2 commits total)" "$([ "$LOG_LINES_I1" = "2" ] && echo true || echo false)"

# ── I2: AFTER-state replay (AC-4/AC-2) — IDENTICAL mismatch shape, but
# --markers-file supplied pointing at an EMPTY markers file (0 real
# emit-signal lines this cycle) -> new §2b gate must ABORT. ────────────────
REPO2=$(new_test_repo)
{
  printf '\n## c2 · 2026-08-14T06:41Z\n'
  printf '### Audit Run Tier-2 (06:41-06:45 UTC 2026-08-14)\n'
  printf '%s\n' '- Tier: 2 | Services: 5 checked'
  printf '%s\n' '- Anomalies: 5 new (2 critical, 2 warn, 1 info) | 0 dedup-skipped'
  printf '%s\n' '- Status: CRITICAL'
} >> "$REPO2/$NB_REL"
MARKERS2="$TMPDIR_TEST/markers-i2-empty.txt"
: > "$MARKERS2"
: > "$MOCK_CALL_LOG"
OUT_I2=$(run_commit_cli "$REPO2" "chore(memory/system-auditor): notebook c2" "$NB_REL" --markers-file "$MARKERS2")
RC_I2=$?
LOG_LINES_I2=$(cd "$REPO2" && git log --oneline | wc -l | tr -d ' ')
STAGED_I2=$(cd "$REPO2" && git diff --cached --name-only)
check "I2 AFTER-state: declared=5/markers=0, --markers-file SUPPLIED -> ABORT contract-plane-mismatch" \
  "$(printf '%s' "$OUT_I2" | grep -q '^\[auditor-commit\] ABORT contract-plane-mismatch declared_anomalies=5 markers_signal_count=0' && echo true || echo false)"
check "I2 exit code = 1" "$([ "$RC_I2" -eq 1 ] && echo true || echo false)"
check "I2 NO new commit landed (still 1 commit, the baseline)" "$([ "$LOG_LINES_I2" = "1" ] && echo true || echo false)"
check "I2 notebook path un-staged after abort (git restore --staged, not a working-tree revert)" "$([ -z "$STAGED_I2" ] && echo true || echo false)"
check "I2 working-tree content SURVIVES the abort (not discarded — brief's explicit resume-mitigation rationale)" \
  "$(grep -q 'Anomalies: 5 new' "$REPO2/$NB_REL" && echo true || echo false)"

# ── I3: sound case — declared>0 AND markers DOES have real emit-signal
# lines backing it -> commit succeeds even with --markers-file passed
# (no false positive). ──────────────────────────────────────────────────────
REPO3=$(new_test_repo)
{
  printf '\n## c2 · 2026-08-14T07:00Z\n'
  printf '### Audit Run Tier-2 (07:00-07:05 UTC 2026-08-14)\n'
  printf '%s\n' '- Anomalies: 2 new (0 critical, 2 warn, 0 info) | 0 dedup-skipped'
  printf '%s\n' '- Status: DEGRADED'
} >> "$REPO3/$NB_REL"
MARKERS3="$TMPDIR_TEST/markers-i3-real.txt"
printf '[emit-signal] OK id=10 check_id=B-01\n[emit-signal] OK id=11 check_id=B-02\n' > "$MARKERS3"
OUT_I3=$(run_commit_cli "$REPO3" "chore(memory/system-auditor): notebook c2" "$NB_REL" --markers-file "$MARKERS3")
RC_I3=$?
check "I3 declared=2/markers=2 (sound) -> commit SUCCEEDS, no false positive" \
  "$(printf '%s' "$OUT_I3" | grep -q '^\[auditor-commit\] mutex-paired commit' && [ "$RC_I3" -eq 0 ] && echo true || echo false)"

# ── I4: genuine ALL_GREEN — declared=0, --markers-file supplied pointing at
# an empty file -> gate never engages (matches Notebook Append Gate's own
# -gt 0 guard, brief §9 false-positive-risk note). ──────────────────────────
REPO4=$(new_test_repo)
{
  printf '\n## c2 · 2026-08-14T07:30Z\n'
  printf '### Audit Run Tier-1 (07:30-07:31 UTC 2026-08-14)\n'
  printf '%s\n' '- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped'
  printf '%s\n' '- Status: HEALTHY'
} >> "$REPO4/$NB_REL"
MARKERS4="$TMPDIR_TEST/markers-i4-empty.txt"
: > "$MARKERS4"
OUT_I4=$(run_commit_cli "$REPO4" "chore(memory/system-auditor): notebook c2" "$NB_REL" --markers-file "$MARKERS4")
RC_I4=$?
check "I4 declared=0 (ALL_GREEN) -> gate never engages, commit SUCCEEDS" \
  "$(printf '%s' "$OUT_I4" | grep -q '^\[auditor-commit\] mutex-paired commit' && [ "$RC_I4" -eq 0 ] && echo true || echo false)"

# ── I5: exact-path scoping — a DIFFERENT agent's notebook (not
# system-auditor.md) carrying the identical mismatch shape + --markers-file
# supplied -> §2b does NOT engage (per-brief scoping: system-auditor.md
# only). Mirrors §2a's own "no-op for other callers" precedent. ────────────
REPO5=$(mktemp -d "$TMPDIR_TEST/repo-XXXXXX")
mkdir -p "$REPO5/docs/agent-memory/notebooks"
(cd "$REPO5" && git init -q . && git config user.email test@test.local && git config user.name test)
OTHER_NB_REL="docs/agent-memory/notebooks/orch-sentinel.md"
printf '# orch-sentinel notebook\n\n## c1 · 2026-08-01T00:00Z\n- Anomalies: 0 new | 0 dedup-skipped\n' > "$REPO5/$OTHER_NB_REL"
(cd "$REPO5" && git add "$OTHER_NB_REL" && git commit -q -m "seed")
printf '\n## c2\n- Anomalies: 4 new (own-agent unrelated shape)\n' >> "$REPO5/$OTHER_NB_REL"
MARKERS5="$TMPDIR_TEST/markers-i5-empty.txt"
: > "$MARKERS5"
OUT_I5=$(run_commit_cli "$REPO5" "chore(memory/orch-sentinel): notebook c2" "$OTHER_NB_REL" --markers-file "$MARKERS5")
RC_I5=$?
check "I5 non-system-auditor notebook path -> §2b does not engage, commit SUCCEEDS" \
  "$(printf '%s' "$OUT_I5" | grep -q '^\[auditor-commit\] mutex-paired commit' && [ "$RC_I5" -eq 0 ] && echo true || echo false)"

# ── I6: --cycle-tag supplied ALONE (no --markers-file) -> still a complete
# no-op (reserved/Phase-2, not wired this phase) — mismatch shape still
# commits, matching I1's before-state, not I2's abort. ──────────────────────
REPO6=$(new_test_repo)
{
  printf '\n## c2\n- Anomalies: 9 new (unbacked claim)\n- Status: CRITICAL\n'
} >> "$REPO6/$NB_REL"
OUT_I6=$(run_commit_cli "$REPO6" "chore(memory/system-auditor): notebook c2" "$NB_REL" --cycle-tag "FIRE-TASK-123")
RC_I6=$?
check "I6 --cycle-tag alone (no --markers-file) -> still no-op, commit SUCCEEDS" \
  "$(printf '%s' "$OUT_I6" | grep -q '^\[auditor-commit\] mutex-paired commit' && [ "$RC_I6" -eq 0 ] && echo true || echo false)"

# ── I7: backward-compat sanity — the exact pre-existing 2-arg call form
# (no new flags at all) on a NORMAL (non-mismatched) notebook diff produces
# the ORIGINAL stdout marker/exit-code contract, unchanged (AC-1). ─────────
REPO7=$(new_test_repo)
printf '\n## c2\n- Anomalies: 1 new (0C 1W 0I) | 0 dedup-skipped\n- Status: DEGRADED\n' >> "$REPO7/$NB_REL"
OUT_I7=$(run_commit_cli "$REPO7" "chore(memory/system-auditor): notebook c2" "$NB_REL")
RC_I7=$?
check "I7 legacy 2-arg call (no new flags) -> unchanged mutex-paired-commit contract" \
  "$(printf '%s' "$OUT_I7" | grep -qE '^\[auditor-commit\] mutex-paired commit [0-9a-f]+ paths=1$' && [ "$RC_I7" -eq 0 ] && echo true || echo false)"

# ── I8: SKIP no-staged-changes contract unchanged when --markers-file is
# passed but there is genuinely nothing new to commit (byte-identical repo
# state, no diff at all). ───────────────────────────────────────────────────
REPO8=$(new_test_repo)
MARKERS8="$TMPDIR_TEST/markers-i8-empty.txt"
: > "$MARKERS8"
OUT_I8=$(run_commit_cli "$REPO8" "chore(memory/system-auditor): no-op" "$NB_REL" --markers-file "$MARKERS8")
RC_I8=$?
check "I8 no staged changes -> SKIP no-staged-changes, unchanged by --markers-file" \
  "$(printf '%s' "$OUT_I8" | grep -q '^\[auditor-commit\] SKIP no-staged-changes' && [ "$RC_I8" -eq 0 ] && echo true || echo false)"

# =============================================================================
echo ""
echo "=== $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
