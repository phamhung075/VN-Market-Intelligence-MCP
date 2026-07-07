#!/usr/bin/env bash
# scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh
#
# Regression test for F1-LAUNCHD-COWORK-BACKSTOP — exercises
# cowork-guaranteed-slot-firer.sh via a stubbed SLOT_MATCHER_CMD (canned
# JSON, same env-override idiom already proven in
# cowork-tick-preflight.test.sh) and a fake CLAUDE_BIN executable stub
# (never the real `claude` CLI — ZERO real invocations, per task spec).
# `node` itself is also never really invoked in these tests — the default
# SLOT_MATCHER_CMD is always overridden to `echo '<canned JSON>'`.
#
# Run:
#   bash scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: F1-LAUNCHD-COWORK-BACKSTOP
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FIRER_SH="$SCRIPT_DIR/cowork-guaranteed-slot-firer.sh"

if [ ! -f "$FIRER_SH" ]; then
  echo "ERROR: firer script not found at $FIRER_SH" >&2
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

# ── Isolated tmp fixture root (never the real project data/logs) ─────────────
TMPDIR_TEST=$(mktemp -d /private/tmp/cowork-guaranteed-slot-firer-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

export FIRER_ROOT="$TMPDIR_TEST"
export LOG_FILE_PATH="$TMPDIR_TEST/firer.log"
export LOG_ERR_FILE_PATH="$TMPDIR_TEST/firer-error.log"

# ── Fake CLAUDE_BIN — records every invocation, never spawns the real CLI ────
RECORD_FILE="$TMPDIR_TEST/claude-calls.log"
export RECORD_FILE
FAKE_CLAUDE="$TMPDIR_TEST/fake-claude.sh"
cat > "$FAKE_CLAUDE" <<'STUBEOF'
#!/usr/bin/env bash
echo "CALLED: $*" >> "$RECORD_FILE"
exit 0
STUBEOF
chmod +x "$FAKE_CLAUDE"
export CLAUDE_BIN="$FAKE_CLAUDE"

# Sleeper stub — for the bounded/timeout regression case.
SLEEPER_CLAUDE="$TMPDIR_TEST/sleeper-claude.sh"
cat > "$SLEEPER_CLAUDE" <<'STUBEOF'
#!/usr/bin/env bash
echo "SLEEPER CALLED: $*" >> "$RECORD_FILE"
sleep 300
exit 0
STUBEOF
chmod +x "$SLEEPER_CLAUDE"

# ── Source the script under test (guard prevents auto-exec: $0 != BASH_SOURCE) ──
# shellcheck source=./cowork-guaranteed-slot-firer.sh
source "$FIRER_SH"

reset_case() {
  : > "$RECORD_FILE"
  rm -f "$LOG_FILE_PATH" "$LOG_ERR_FILE_PATH"
  export CLAUDE_BIN="$FAKE_CLAUDE"
  export FIRE_TIMEOUT_SECONDS=30
  unset SLOT_MATCHER_CMD
}

call_count() { wc -l < "$RECORD_FILE" | tr -d ' '; }

# ── T1: no slots matched at all — silent no-op, exit 0, claude never invoked ──
reset_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[],\"drift_min\":1}"'
run_firer false; RC=$?
check "T1 no-match exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T1 no-match claude never invoked" "$([ "$(call_count)" -eq 0 ] && echo true || echo false)"

# ── T2: raw matcher output has ONLY non-guaranteed slots — filtered out, claude never invoked ──
reset_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"news-scout-market\",\"trigger_prompt\":\"run docs/agents/news-scout/flow/main.md  slot=news-scout-market\",\"guaranteed\":false}],\"drift_min\":0}"'
run_firer false; RC=$?
check "T2 non-guaranteed-only exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T2 non-guaranteed filtered out — claude never invoked" "$([ "$(call_count)" -eq 0 ] && echo true || echo false)"

# ── T3: single guaranteed slot matched — claude invoked ONCE with the EXACT
# trigger_prompt read verbatim off the slot object (proves zero-hardcode: this
# slot_id/prompt pair is NOT hardcoded anywhere in cowork-guaranteed-slot-firer.sh) ──
reset_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"chef-morning\",\"trigger_prompt\":\"run docs/agents/unified-agent/flow/chef.md  slot=chef-morning\",\"guaranteed\":true}],\"drift_min\":0}"'
run_firer false; RC=$?
check "T3 single guaranteed slot exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T3 claude invoked exactly once" "$([ "$(call_count)" -eq 1 ] && echo true || echo false)"
check "T3 trigger_prompt passed verbatim" "$(grep -q 'run docs/agents/unified-agent/flow/chef.md  slot=chef-morning' "$RECORD_FILE" && echo true || echo false)"

# ── T3b: a NOVEL slot never seen by this script before (proves the "zero
# script edits for a new guaranteed slot" acceptance criterion structurally,
# not just by inspection) ──
reset_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"brand-new-guaranteed-slot-xyz\",\"trigger_prompt\":\"run docs/agents/some-future-agent/flow/main.md  slot=brand-new-guaranteed-slot-xyz\",\"guaranteed\":true}],\"drift_min\":0}"'
run_firer false; RC=$?
check "T3b novel guaranteed slot fires without any script change" "$(grep -q 'slot=brand-new-guaranteed-slot-xyz' "$RECORD_FILE" && echo true || echo false)"

# ── T4: TWO guaranteed slots matched in the same tick — BOTH invoked, one
# slot's processing never aborts the loop before the other is attempted ─────
reset_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"chef-eod\",\"trigger_prompt\":\"run docs/agents/unified-agent/flow/chef.md  slot=chef-eod\",\"guaranteed\":true},{\"slot_id\":\"digest-daily\",\"trigger_prompt\":\"run docs/agents/digest-predict/flow/main.md  slot=digest-daily\",\"guaranteed\":true}],\"drift_min\":0}"'
run_firer false; RC=$?
check "T4 two guaranteed slots — claude invoked twice" "$([ "$(call_count)" -eq 2 ] && echo true || echo false)"
check "T4 both slot prompts present" "$(grep -q 'slot=chef-eod' "$RECORD_FILE" && grep -q 'slot=digest-daily' "$RECORD_FILE" && echo true || echo false)"

# ── T5: mixed guaranteed + non-guaranteed in the same raw matcher response —
# ONLY the guaranteed one fires ──────────────────────────────────────────────
reset_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"fb-daily\",\"trigger_prompt\":\"run docs/agents/fb-market-poster/flow/main.md  slot=fb-daily\",\"guaranteed\":true},{\"slot_id\":\"alert-commander-market\",\"trigger_prompt\":\"run docs/agents/alert-commander/flow/main.md  slot=alert-commander-market\",\"guaranteed\":false}],\"drift_min\":0}"'
run_firer false; RC=$?
check "T5 mixed batch — claude invoked exactly once" "$([ "$(call_count)" -eq 1 ] && echo true || echo false)"
check "T5 mixed batch — only the guaranteed slot fired" "$(grep -q 'slot=fb-daily' "$RECORD_FILE" && ! grep -q 'alert-commander-market' "$RECORD_FILE" && echo true || echo false)"

# ── T6: --dry-run — logs intent, claude NEVER invoked even for a guaranteed match ──
reset_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"tnb-audit\",\"trigger_prompt\":\"run docs/agents/tran-ngoc-bau/flow/main.md  slot=tnb-audit\",\"guaranteed\":true}],\"drift_min\":0}"'
run_firer true; RC=$?
check "T6 dry-run exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T6 dry-run — claude never invoked" "$([ "$(call_count)" -eq 0 ] && echo true || echo false)"
check "T6 dry-run — log records intent" "$(grep -q 'DRY-RUN' "$LOG_FILE_PATH" 2>/dev/null && echo true || echo false)"

# ── T7: CLAUDE_BIN missing/not executable — logged ERROR, non-zero return,
# does not crash the script ──────────────────────────────────────────────────
reset_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"digest-sunday\",\"trigger_prompt\":\"run docs/agents/digest-predict/flow/main.md  slot=digest-sunday\",\"guaranteed\":true}],\"drift_min\":0}"'
export CLAUDE_BIN="$TMPDIR_TEST/does-not-exist-claude-binary"
run_firer false; RC=$?
check "T7 missing claude binary — non-zero return" "$([ "$RC" -ne 0 ] && echo true || echo false)"
check "T7 missing claude binary — error logged" "$(grep -qi 'ERROR' "$LOG_ERR_FILE_PATH" 2>/dev/null && echo true || echo false)"

# ── T8: slot matcher command itself fails (nonzero exit) — ERROR path, no crash ──
reset_case
export SLOT_MATCHER_CMD='false'
run_firer false; RC=$?
check "T8 matcher command failure — non-zero return" "$([ "$RC" -ne 0 ] && echo true || echo false)"

# ── T9: slot matcher returns malformed non-JSON output — ERROR path ──────────
reset_case
export SLOT_MATCHER_CMD='echo "not valid json at all"'
run_firer false; RC=$?
check "T9 malformed matcher output — non-zero return" "$([ "$RC" -ne 0 ] && echo true || echo false)"

# ── T10: bounded execution — a hung claude process is killed within the
# configured FIRE_TIMEOUT_SECONDS bound (proves the architecture brief §3.7
# hardening — the 2026-07-04 fb-weekend ~4.5h pile-up risk — is closed by
# actual code, not just documentation). FIRE_TIMEOUT_SECONDS set tiny (2s);
# the sleeper stub sleeps 300s; the whole run_firer call must return well
# under that, proving the bound actually fires. ─────────────────────────────
reset_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"chef-evening\",\"trigger_prompt\":\"run docs/agents/unified-agent/flow/chef.md  slot=chef-evening\",\"guaranteed\":true}],\"drift_min\":0}"'
export CLAUDE_BIN="$SLEEPER_CLAUDE"
export FIRE_TIMEOUT_SECONDS=2
START_TS=$(date +%s)
run_firer false
END_TS=$(date +%s)
ELAPSED=$((END_TS - START_TS))
check "T10 bounded exec — hung process killed near the 2s bound (< 15s elapsed, not the full 300s sleep)" "$([ "$ELAPSED" -lt 15 ] && echo true || echo false)"
check "T10 bounded exec — sleeper was actually invoked" "$(grep -q 'SLEEPER CALLED' "$RECORD_FILE" && echo true || echo false)"

# ── T11: CLI-level integration — real subprocess invocation (not sourced),
# proves the standalone `bash cowork-guaranteed-slot-firer.sh [--dry-run]`
# entrypoint contract works end-to-end ───────────────────────────────────────
reset_case
CLI_OUT=$(SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"fb-weekend\",\"trigger_prompt\":\"run docs/agents/fb-market-poster/flow/main.md  slot=fb-weekend\",\"guaranteed\":true}],\"drift_min\":0}"' \
  FIRER_ROOT="$TMPDIR_TEST" LOG_FILE_PATH="$LOG_FILE_PATH" LOG_ERR_FILE_PATH="$LOG_ERR_FILE_PATH" \
  CLAUDE_BIN="$FAKE_CLAUDE" RECORD_FILE="$RECORD_FILE" FIRE_TIMEOUT_SECONDS=30 \
  bash "$FIRER_SH" 2>&1); CLI_RC=$?
check "T11 CLI real-subprocess invocation exit=0" "$([ "$CLI_RC" -eq 0 ] && echo true || echo false)"
check "T11 CLI real-subprocess invocation fired claude" "$(grep -q 'slot=fb-weekend' "$RECORD_FILE" && echo true || echo false)"

# ── T12: CLI-level --dry-run flag parsing on the real entrypoint ─────────────
reset_case
CLI_OUT=$(SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"chef-morning\",\"trigger_prompt\":\"run docs/agents/unified-agent/flow/chef.md  slot=chef-morning\",\"guaranteed\":true}],\"drift_min\":0}"' \
  FIRER_ROOT="$TMPDIR_TEST" LOG_FILE_PATH="$LOG_FILE_PATH" LOG_ERR_FILE_PATH="$LOG_ERR_FILE_PATH" \
  CLAUDE_BIN="$FAKE_CLAUDE" RECORD_FILE="$RECORD_FILE" FIRE_TIMEOUT_SECONDS=30 \
  bash "$FIRER_SH" --dry-run 2>&1); CLI_RC=$?
check "T12 CLI --dry-run exit=0" "$([ "$CLI_RC" -eq 0 ] && echo true || echo false)"
check "T12 CLI --dry-run never invokes claude" "$([ "$(call_count)" -eq 0 ] && echo true || echo false)"

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
