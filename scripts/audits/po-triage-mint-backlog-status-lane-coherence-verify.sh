#!/usr/bin/env bash
# scripts/audits/po-triage-mint-backlog-status-lane-coherence-verify.sh
#
# Regression verifier for FIX-PO-TRIAGE-SIGNALS-CIRED-TEMPLATE-STATUS-TODO-REJECTED-BY-VALIDATOR.
#
# PROBLEM (as filed): docs/agents/po/flow/triage-signals.md's `ci_red` mint
# template instructed appending to `.task_board.backlog[]` with
# `status: "TODO"`. apps/mcp-server/src/infrastructure/orchStateSchema.ts's
# LANE_ALLOWED_STATUSES only permits {BACKLOG, BLOCKED} in backlog[] (Stage 1b
# lane-coherence is a HARD FAIL — scripts/orch-validate.mjs). Every ci_red mint
# therefore aborted at scripts/orch-apply.sh on first attempt (live file
# untouched) — reproduced live 2026-07-31T14:5xZ minting
# FIX-CI-IMF-INTEGRATION-TEST-NONHERMETIC-LIVE-API, wasting a round-trip and
# inviting a bad "relabel to a different lane" mis-fix (the validator's own
# error message offers that alternative).
#
# CLASS, not a one-token typo: the same `status: "TODO"` → backlog[] append
# drift was independently found in 4 MORE templates while auditing the rest of
# docs/agents/po/flow/*.md:
#   - triage-signals.md  `zone_missing_tier3` row
#   - triage-signals.md  `repair_task_request` row
#   - channel-audit.md   generic bug/correction task template (line ~96)
#   - sprint-kickoff.md  BA task template (line ~34)
# All 5 are fixed in the SAME commit this script verifies.
#
# This script proves, per template, BOTH halves — not just that the doc text
# now says "BACKLOG":
#   BEFORE — replaying the ORIGINAL (drifted) template shape against
#            scripts/orch-apply.sh reproduces the live abort (exit != 0,
#            fixture untouched) — proves the bug was real, not assumed.
#   AFTER  — replaying the FIXED template shape (status: "BACKLOG") passes
#            Stage 1b and the row lands (exit 0, fixture updated) — proves the
#            fix actually satisfies the validator, not just that the doc
#            paragraph was edited.
# Plus a static DOC CHECK that none of the 3 fixed files still contain the
# literal drifted token in a backlog-mint context.
#
# SAFETY: every apply uses ORCH_APPLY_LIVE_FILE_OVERRIDE pointing at a
# throwaway fixture under mktemp (same idiom as
# scripts/test/orch-apply-wrapper-tests.sh). The REAL
# docs/data/orch/orch-state.json is NEVER touched — hashed before/after every
# check to prove it.
#
# Usage: bash scripts/audits/po-triage-mint-backlog-status-lane-coherence-verify.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APPLY_SH="$REPO_ROOT/scripts/orch-apply.sh"
REAL_LIVE="$REPO_ROOT/docs/data/orch/orch-state.json"

TRIAGE_DOC="$REPO_ROOT/docs/agents/po/flow/triage-signals.md"
CHANNEL_DOC="$REPO_ROOT/docs/agents/po/flow/channel-audit.md"
KICKOFF_DOC="$REPO_ROOT/docs/agents/po/flow/sprint-kickoff.md"

[ -f "$APPLY_SH" ]   || { echo "FATAL: $APPLY_SH not found"; exit 1; }
[ -f "$REAL_LIVE" ]  || { echo "FATAL: $REAL_LIVE not found"; exit 1; }
[ -f "$TRIAGE_DOC" ] || { echo "FATAL: $TRIAGE_DOC not found"; exit 1; }
[ -f "$CHANNEL_DOC" ]|| { echo "FATAL: $CHANNEL_DOC not found"; exit 1; }
[ -f "$KICKOFF_DOC" ]|| { echo "FATAL: $KICKOFF_DOC not found"; exit 1; }
command -v bun >/dev/null 2>&1 || { echo "FATAL: bun not found in PATH"; exit 1; }

file_hash() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

PASS=0; FAIL=0
pass() { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL+1)); printf 'FAIL  %s\n' "$1"; }

REAL_HASH_BEFORE=$(file_hash "$REAL_LIVE")
assert_real_live_unchanged() {
  local label="$1" now
  now=$(file_hash "$REAL_LIVE")
  if [ "$REAL_HASH_BEFORE" = "$now" ]; then
    pass "$label — REAL live orch-state.json UNCHANGED"
  else
    fail "$label — REAL live orch-state.json CHANGED (CRITICAL)"
  fi
}

FIXTURE_DIR=$(mktemp -d "/tmp/po-triage-mint-status-verify-XXXXXX")
trap 'rm -rf "$FIXTURE_DIR"' EXIT
FIXTURE="$FIXTURE_DIR/orch-state.json"

# Minimal valid orch-state fixture (same shape used by
# scripts/test/orch-apply-wrapper-tests.sh) — one pre-existing backlog row so
# the fixture is non-trivially populated before each mint attempt.
BASE_FIXTURE='{"_meta":{"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture"},"head":{"status":"idle","active_task_id":null,"next_agent":null},"task_board":{"backlog":[{"id":"FIXTURE-SEED","status":"BACKLOG"}],"active_sprints":[]},"signal_queue":{"_updated_at":"2026-06-01T00:00:00Z","_updated_by":"fixture","rows":[]}}'

reset_fixture() { printf '%s' "$BASE_FIXTURE" > "$FIXTURE"; }

# run_case NAME STATUS_TOKEN EXPECT(before|after)
# Builds a candidate that appends {id:"SYNTH-<NAME>", status:"<STATUS_TOKEN>",
# ...other benign fields...} to .task_board.backlog[] — the exact shape every
# fixed template mints (id/title/owner/status/zone/created_at) — and applies
# it through the REAL scripts/orch-apply.sh against the throwaway fixture.
run_case() {
  local name="$1" status_token="$2" expect="$3"
  reset_fixture
  local hash_before
  hash_before=$(file_hash "$FIXTURE")

  local candidate
  candidate=$(jq -c --arg id "SYNTH-$name" --arg status "$status_token" \
    '.task_board.backlog += [{id: $id, title: "synthetic mint replay", owner: "po", status: $status, zone: "cross-service/", created_at: "2026-07-31T00:00:00Z"}]' \
    "$FIXTURE")

  local exit_code=0
  printf '%s' "$candidate" \
    | ORCH_APPLY_LIVE_FILE_OVERRIDE="$FIXTURE" bash "$APPLY_SH" >/dev/null 2>"$FIXTURE_DIR/${name}.stderr" \
    || exit_code=$?

  if [ "$expect" = "before" ]; then
    # Reproduces the live bug: Stage 1b lane-coherence rejects "TODO" in
    # backlog[] -> orch-apply.sh translates any validator non-zero exit to 1.
    if [ "$exit_code" -eq 1 ]; then
      pass "$name — BEFORE (status:\"$status_token\") reproduces the live abort — exit 1"
    else
      fail "$name — BEFORE expected exit 1 (Stage 1b abort), got $exit_code"
    fi
    if grep -q 'Stage 1b' "$FIXTURE_DIR/${name}.stderr"; then
      pass "$name — BEFORE abort is specifically Stage 1b lane-coherence (not some other stage)"
    else
      fail "$name — BEFORE abort did not mention Stage 1b — see $FIXTURE_DIR/${name}.stderr"
    fi
    local hash_after
    hash_after=$(file_hash "$FIXTURE")
    if [ "$hash_before" = "$hash_after" ]; then
      pass "$name — BEFORE fixture UNCHANGED (write correctly aborted)"
    else
      fail "$name — BEFORE fixture CHANGED (write should have aborted)"
    fi
  else
    # expect = after: the FIXED template shape must pass Stage 1b cleanly.
    if [ "$exit_code" -eq 0 ]; then
      pass "$name — AFTER (status:\"$status_token\") passes Stage 1b — exit 0"
    else
      fail "$name — AFTER expected exit 0, got $exit_code — see $FIXTURE_DIR/${name}.stderr"
    fi
    local landed
    landed=$(jq -r --arg id "SYNTH-$name" '.task_board.backlog[] | select(.id==$id) | .status' "$FIXTURE" 2>/dev/null || echo "?")
    if [ "$landed" = "$status_token" ]; then
      pass "$name — AFTER row landed in backlog[] with status=$status_token"
    else
      fail "$name — AFTER row did not land as expected (got status='$landed')"
    fi
  fi

  assert_real_live_unchanged "$name"
}

echo "=== MECHANISM: replay each fixed template's mint shape against the real orch-apply.sh ==="
echo ""

# ── triage-signals.md: ci_red row (the originally-filed defect) ─────────────
run_case "CIRED"        "TODO"     "before"
run_case "CIRED"        "BACKLOG"  "after"

# ── triage-signals.md: zone_missing_tier3 row ────────────────────────────────
run_case "ZONEMISSING"  "TODO"     "before"
run_case "ZONEMISSING"  "BACKLOG"  "after"

# ── triage-signals.md: repair_task_request row ───────────────────────────────
run_case "REPAIRREQ"    "TODO"     "before"
run_case "REPAIRREQ"    "BACKLOG"  "after"

# ── channel-audit.md: generic bug/correction task template ──────────────────
run_case "CHANNELAUDIT" "TODO"     "before"
run_case "CHANNELAUDIT" "BACKLOG"  "after"

# ── sprint-kickoff.md: BA task template ──────────────────────────────────────
run_case "SPRINTKICKOFF" "TODO"    "before"
run_case "SPRINTKICKOFF" "BACKLOG" "after"

echo ""
echo "=== DOC CHECK: no fixed file still carries the drifted literal ==="
echo ""

for doc in "$TRIAGE_DOC" "$CHANNEL_DOC" "$KICKOFF_DOC"; do
  rel="${doc#$REPO_ROOT/}"
  if grep -qE '"status": *"TODO"|status: *"TODO"' "$doc"; then
    fail "$rel — still contains a literal status:\"TODO\" token"
  else
    pass "$rel — no literal status:\"TODO\" token remains"
  fi
done

if grep -q 'status: "BACKLOG"' "$TRIAGE_DOC"; then
  pass "triage-signals.md — ci_red/zone_missing_tier3/repair_task_request templates now write status: \"BACKLOG\""
else
  fail "triage-signals.md — expected status: \"BACKLOG\" in the fixed templates, not found"
fi

if grep -q 'status: "BACKLOG"' "$CHANNEL_DOC"; then
  pass "channel-audit.md — canonical shape template now writes status: \"BACKLOG\""
else
  fail "channel-audit.md — expected status: \"BACKLOG\", not found"
fi

if grep -q '"status": "BACKLOG"' "$KICKOFF_DOC"; then
  pass "sprint-kickoff.md — BA task template now writes \"status\": \"BACKLOG\""
else
  fail "sprint-kickoff.md — expected \"status\": \"BACKLOG\", not found"
fi

echo ""
echo "=== OUT-OF-SCOPE GUARD: the validator itself must be untouched ==="
echo ""

VALIDATOR_SRC="$REPO_ROOT/apps/mcp-server/src/infrastructure/orchStateSchema.ts"
if grep -q 'backlog:.*new Set(\["BACKLOG", "BLOCKED"\])' "$VALIDATOR_SRC"; then
  pass "orchStateSchema.ts LANE_ALLOWED_STATUSES.backlog is still {BACKLOG, BLOCKED} — fix landed on the template side only"
else
  fail "orchStateSchema.ts backlog lane allowed-set changed unexpectedly — this task was NOT supposed to touch the validator"
fi

echo ""
TOTAL=$((PASS+FAIL))
printf '─── po-triage-mint-backlog-status-lane-coherence-verify results ───\n'
printf 'PASS: %d / %d\n' "$PASS" "$TOTAL"
if [ "$FAIL" -gt 0 ]; then
  printf 'FAIL: %d / %d\n' "$FAIL" "$TOTAL"
  exit 1
fi
exit 0
