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
# FIX-COWORK-LAYERC-NO-IDENTITY-PREAMBLE: this stub also SIMULATES A GENUINE
# FIRE — it writes the invoked agent's notebook (docs/agent-memory/notebooks/
# <agent>.md, derived from the composed preamble's "You are <agent>,") with a
# FUTURE mtime, so the artifact-delta gate sees PROOF and takes the stamp path.
# A real flow writes its notebook as a settled terminal step (chef Step 8b,
# digest-predict P-6, fb-market-poster STEP 8, tran-ngoc-bau notebook); tests
# that must NOT produce an artifact delta use the NOOP_CLAUDE stub instead.
RECORD_FILE="$TMPDIR_TEST/claude-calls.log"
export RECORD_FILE
FAKE_CLAUDE="$TMPDIR_TEST/fake-claude.sh"
cat > "$FAKE_CLAUDE" <<'STUBEOF'
#!/usr/bin/env bash
echo "CALLED: $*" >> "$RECORD_FILE"
agent=$(printf '%s' "$*" | sed -n 's/.*You are \([^,]*\),.*/\1/p')
if [ -n "$agent" ]; then
  mkdir -p "$NOTEBOOKS_DIR"
  printf 'fixture notebook written by fake claude for %s\n' "$agent" > "$NOTEBOOKS_DIR/$agent.md"
  touch -t 203001010000 "$NOTEBOOKS_DIR/$agent.md"
fi
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

# No-op stub — records the invocation but writes NO notebook. Used by the
# null-fire tests (T27/T28): an exit-0 fire with no artifact delta is exactly
# the measured defect class, and only THIS stub produces it.
NOOP_CLAUDE="$TMPDIR_TEST/noop-claude.sh"
cat > "$NOOP_CLAUDE" <<'STUBEOF'
#!/usr/bin/env bash
echo "CALLED: $*" >> "$RECORD_FILE"
exit 0
STUBEOF
chmod +x "$NOOP_CLAUDE"

# ── Fake CURL_BIN — records every escalation POST, never hits the network ────
# FIX-COWORK-GUARANTEED-SLOT-FIRER-NO-FAILURE-ESCALATION: the escalation path
# posts DIRECTLY to the Telegram API (the script has no gateway/MCP access of
# its own — see its header INVARIANTS). ZERO real network calls in these tests.
CURL_RECORD_FILE="$TMPDIR_TEST/curl-calls.log"
export CURL_RECORD_FILE
: > "$CURL_RECORD_FILE"
FAKE_CURL="$TMPDIR_TEST/fake-curl.sh"
cat > "$FAKE_CURL" <<'STUBEOF'
#!/usr/bin/env bash
echo "CURL: $*" >> "$CURL_RECORD_FILE"
exit 0
STUBEOF
chmod +x "$FAKE_CURL"

# Failing curl stub — proves a send failure is itself logged loudly, never swallowed.
FAILING_CURL="$TMPDIR_TEST/failing-curl.sh"
cat > "$FAILING_CURL" <<'STUBEOF'
#!/usr/bin/env bash
echo "CURL: $*" >> "$CURL_RECORD_FILE"
exit 7
STUBEOF
chmod +x "$FAILING_CURL"

# ── Fake WRITE_LAST_FIRED_CMD — records the writeback call (artifact-delta gate
# seam mirroring SLOT_MATCHER_CMD/CLAUDE_BIN; default in production is
# node scripts/agents-flow/cowork-write-last-fired.js) ────────────────────────
WRITE_RECORD_FILE="$TMPDIR_TEST/write-last-fired-calls.log"
export WRITE_RECORD_FILE
: > "$WRITE_RECORD_FILE"
FAKE_WRITE="$TMPDIR_TEST/fake-write-last-fired.sh"
cat > "$FAKE_WRITE" <<'STUBEOF'
#!/usr/bin/env bash
echo "WRITE-LAST-FIRED: $*" >> "$WRITE_RECORD_FILE"
exit 0
STUBEOF
chmod +x "$FAKE_WRITE"
export WRITE_LAST_FIRED_CMD="$FAKE_WRITE"

# ── Artifact-delta gate fixture: the firer derives the notebook path from
# slot.agent ($ROOT/docs/agent-memory/notebooks/<agent>.md) and resolves the
# shared preamble via $ROOT/scripts/agents-flow/cowork-identity-preamble.sh —
# both must exist inside the fixture root. ────────────────────────────────────
NOTEBOOKS_DIR="$TMPDIR_TEST/docs/agent-memory/notebooks"
export NOTEBOOKS_DIR
mkdir -p "$TMPDIR_TEST/scripts/agents-flow"
cp "$SCRIPT_DIR/cowork-identity-preamble.sh" "$TMPDIR_TEST/scripts/agents-flow/cowork-identity-preamble.sh"
chmod +x "$TMPDIR_TEST/scripts/agents-flow/cowork-identity-preamble.sh"

export ALERT_STATE_FILE="$TMPDIR_TEST/alert-state"

# ── Source the script under test (guard prevents auto-exec: $0 != BASH_SOURCE) ──
# shellcheck source=./cowork-guaranteed-slot-firer.sh
source "$FIRER_SH"

reset_case() {
  : > "$RECORD_FILE"
  : > "$CURL_RECORD_FILE"
  : > "$WRITE_RECORD_FILE"
  rm -f "$LOG_FILE_PATH" "$LOG_ERR_FILE_PATH" "$ALERT_STATE_FILE"
  rm -rf "$NOTEBOOKS_DIR"
  rm -f "$TMPDIR_TEST/docs/data/cowork-schedule.json"
  export CLAUDE_BIN="$FAKE_CLAUDE"
  export FIRE_TIMEOUT_SECONDS=30
  export CURL_BIN="$FAKE_CURL"
  export ALERT_COOLDOWN_SECONDS=21600
  export TELEGRAM_BOT_TOKEN="stub-bot-token"
  export TELEGRAM_REPORT_BUG_CHANNEL_ID="-1009999999999"
  export WRITE_LAST_FIRED_CMD="$FAKE_WRITE"
  unset TELEGRAM_BUG_CHAT_ID
  unset SLOT_MATCHER_CMD
}

# NOTE: `grep -c` prints 0 AND exits 1 on no-match, so a `|| echo 0` fallback
# would emit "0\n0" and break every numeric comparison — capture, then default.
curl_call_count() {
  local n
  n=$(grep -c '^CURL:' "$CURL_RECORD_FILE" 2>/dev/null)
  case "$n" in ''|*[!0-9]*) n=0 ;; esac
  printf '%s' "$n"
}

write_call_count() {
  local n
  n=$(grep -c '^WRITE-LAST-FIRED:' "$WRITE_RECORD_FILE" 2>/dev/null)
  case "$n" in ''|*[!0-9]*) n=0 ;; esac
  printf '%s' "$n"
}

# The composed ENTRY_PROMPT carries embedded newlines, so a recorded invocation
# spans multiple physical lines — count `CALLED:` records, never `wc -l`.
call_count() {
  local n
  n=$(grep -c '^CALLED:' "$RECORD_FILE" 2>/dev/null)
  case "$n" in ''|*[!0-9]*) n=0 ;; esac
  printf '%s' "$n"
}

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
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"chef-morning\",\"agent\":\"unified-agent\",\"trigger_prompt\":\"run docs/agents/unified-agent/flow/chef.md  slot=chef-morning\",\"guaranteed\":true}],\"drift_min\":0}"'
run_firer false; RC=$?
check "T3 single guaranteed slot exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T3 claude invoked exactly once" "$([ "$(call_count)" -eq 1 ] && echo true || echo false)"
check "T3 trigger_prompt passed verbatim" "$(grep -q 'run docs/agents/unified-agent/flow/chef.md  slot=chef-morning' "$RECORD_FILE" && echo true || echo false)"

# ── T3b: a NOVEL slot never seen by this script before (proves the "zero
# script edits for a new guaranteed slot" acceptance criterion structurally,
# not just by inspection) ──
reset_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"brand-new-guaranteed-slot-xyz\",\"agent\":\"some-future-agent\",\"trigger_prompt\":\"run docs/agents/some-future-agent/flow/main.md  slot=brand-new-guaranteed-slot-xyz\",\"guaranteed\":true}],\"drift_min\":0}"'
run_firer false; RC=$?
check "T3b novel guaranteed slot fires without any script change" "$(grep -q 'slot=brand-new-guaranteed-slot-xyz' "$RECORD_FILE" && echo true || echo false)"

# ── T4: TWO guaranteed slots matched in the same tick — BOTH invoked, one
# slot's processing never aborts the loop before the other is attempted ─────
reset_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"chef-eod\",\"agent\":\"unified-agent\",\"trigger_prompt\":\"run docs/agents/unified-agent/flow/chef.md  slot=chef-eod\",\"guaranteed\":true},{\"slot_id\":\"digest-daily\",\"agent\":\"digest-predict\",\"trigger_prompt\":\"run docs/agents/digest-predict/flow/main.md  slot=digest-daily\",\"guaranteed\":true}],\"drift_min\":0}"'
run_firer false; RC=$?
check "T4 two guaranteed slots — claude invoked twice" "$([ "$(call_count)" -eq 2 ] && echo true || echo false)"
check "T4 both slot prompts present" "$(grep -q 'slot=chef-eod' "$RECORD_FILE" && grep -q 'slot=digest-daily' "$RECORD_FILE" && echo true || echo false)"

# ── T5: mixed guaranteed + non-guaranteed in the same raw matcher response —
# ONLY the guaranteed one fires ──────────────────────────────────────────────
reset_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"fb-daily\",\"agent\":\"fb-market-poster\",\"trigger_prompt\":\"run docs/agents/fb-market-poster/flow/main.md  slot=fb-daily\",\"guaranteed\":true},{\"slot_id\":\"alert-commander-market\",\"trigger_prompt\":\"run docs/agents/alert-commander/flow/main.md  slot=alert-commander-market\",\"guaranteed\":false}],\"drift_min\":0}"'
run_firer false; RC=$?
check "T5 mixed batch — claude invoked exactly once" "$([ "$(call_count)" -eq 1 ] && echo true || echo false)"
check "T5 mixed batch — only the guaranteed slot fired" "$(grep -q 'slot=fb-daily' "$RECORD_FILE" && ! grep -q 'alert-commander-market' "$RECORD_FILE" && echo true || echo false)"

# ── T6: --dry-run — logs intent, claude NEVER invoked even for a guaranteed match ──
reset_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"tnb-audit\",\"agent\":\"tran-ngoc-bau\",\"trigger_prompt\":\"run docs/agents/tran-ngoc-bau/flow/main.md  slot=tnb-audit\",\"guaranteed\":true}],\"drift_min\":0}"'
run_firer true; RC=$?
check "T6 dry-run exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T6 dry-run — claude never invoked" "$([ "$(call_count)" -eq 0 ] && echo true || echo false)"
check "T6 dry-run — log records intent" "$(grep -q 'DRY-RUN' "$LOG_FILE_PATH" 2>/dev/null && echo true || echo false)"

# ── T7: CLAUDE_BIN missing/not executable — logged ERROR, non-zero return,
# does not crash the script ──────────────────────────────────────────────────
reset_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"digest-sunday\",\"agent\":\"digest-predict\",\"trigger_prompt\":\"run docs/agents/digest-predict/flow/main.md  slot=digest-sunday\",\"guaranteed\":true}],\"drift_min\":0}"'
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
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"chef-evening\",\"agent\":\"unified-agent\",\"trigger_prompt\":\"run docs/agents/unified-agent/flow/chef.md  slot=chef-evening\",\"guaranteed\":true}],\"drift_min\":0}"'
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
CLI_OUT=$(SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"fb-weekend\",\"agent\":\"fb-market-poster\",\"trigger_prompt\":\"run docs/agents/fb-market-poster/flow/main.md  slot=fb-weekend\",\"guaranteed\":true}],\"drift_min\":0}"' \
  FIRER_ROOT="$TMPDIR_TEST" LOG_FILE_PATH="$LOG_FILE_PATH" LOG_ERR_FILE_PATH="$LOG_ERR_FILE_PATH" \
  CLAUDE_BIN="$FAKE_CLAUDE" RECORD_FILE="$RECORD_FILE" FIRE_TIMEOUT_SECONDS=30 \
  WRITE_LAST_FIRED_CMD="$FAKE_WRITE" WRITE_RECORD_FILE="$WRITE_RECORD_FILE" NOTEBOOKS_DIR="$NOTEBOOKS_DIR" \
  CURL_BIN="$FAKE_CURL" CURL_RECORD_FILE="$CURL_RECORD_FILE" ALERT_STATE_FILE="$ALERT_STATE_FILE" \
  TELEGRAM_BOT_TOKEN="stub-bot-token" TELEGRAM_REPORT_BUG_CHANNEL_ID="-1009999999999" \
  bash "$FIRER_SH" 2>&1); CLI_RC=$?
check "T11 CLI real-subprocess invocation exit=0" "$([ "$CLI_RC" -eq 0 ] && echo true || echo false)"
check "T11 CLI real-subprocess invocation fired claude" "$(grep -q 'slot=fb-weekend' "$RECORD_FILE" && echo true || echo false)"

# ── T12: CLI-level --dry-run flag parsing on the real entrypoint ─────────────
reset_case
CLI_OUT=$(SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"chef-morning\",\"agent\":\"unified-agent\",\"trigger_prompt\":\"run docs/agents/unified-agent/flow/chef.md  slot=chef-morning\",\"guaranteed\":true}],\"drift_min\":0}"' \
  FIRER_ROOT="$TMPDIR_TEST" LOG_FILE_PATH="$LOG_FILE_PATH" LOG_ERR_FILE_PATH="$LOG_ERR_FILE_PATH" \
  CLAUDE_BIN="$FAKE_CLAUDE" RECORD_FILE="$RECORD_FILE" FIRE_TIMEOUT_SECONDS=30 \
  WRITE_LAST_FIRED_CMD="$FAKE_WRITE" WRITE_RECORD_FILE="$WRITE_RECORD_FILE" NOTEBOOKS_DIR="$NOTEBOOKS_DIR" \
  CURL_BIN="$FAKE_CURL" CURL_RECORD_FILE="$CURL_RECORD_FILE" ALERT_STATE_FILE="$ALERT_STATE_FILE" \
  TELEGRAM_BOT_TOKEN="stub-bot-token" TELEGRAM_REPORT_BUG_CHANNEL_ID="-1009999999999" \
  bash "$FIRER_SH" --dry-run 2>&1); CLI_RC=$?
check "T12 CLI --dry-run exit=0" "$([ "$CLI_RC" -eq 0 ] && echo true || echo false)"
check "T12 CLI --dry-run never invokes claude" "$([ "$(call_count)" -eq 0 ] && echo true || echo false)"

# ── T13: FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION regression — matcher
# emits a stderr cadence-skip diagnostic (cowork-match-slots.js console.error
# style) ALONGSIDE valid stdout JSON in the same invocation. Before the
# stderr-separation fix (raw=$(eval ... 2>&1)), this diagnostic corrupted the
# jq parse buffer and dropped a DUE guaranteed slot as a false "non-JSON
# output" ERROR. Asserts the guaranteed slot still fires. ───────────────────
reset_case
STUB_MATCHER="$TMPDIR_TEST/stub-matcher-stderr-noise.sh"
cat > "$STUB_MATCHER" <<'STUBEOF'
#!/usr/bin/env bash
echo "cadence skip: some-other-slot (not due yet)" >&2
echo "{\"slots\":[{\"slot_id\":\"chef-eod\",\"agent\":\"unified-agent\",\"trigger_prompt\":\"run docs/agents/unified-agent/flow/chef.md  slot=chef-eod\",\"guaranteed\":true}],\"drift_min\":0}"
STUBEOF
chmod +x "$STUB_MATCHER"
export SLOT_MATCHER_CMD="$STUB_MATCHER"
run_firer false; RC=$?
check "T13 stderr-noise + valid stdout JSON — exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T13 stderr-noise — guaranteed slot still fires (stderr did not corrupt the JSON parse)" "$(grep -q 'slot=chef-eod' "$RECORD_FILE" && echo true || echo false)"
check "T13 stderr-noise — no false 'non-JSON output' ERROR logged" "$(! grep -q 'non-JSON output' "$LOG_FILE_PATH" 2>/dev/null && echo true || echo false)"

# ═══════════════════════════════════════════════════════════════════════════
# FIX-COWORK-GUARANTEED-SLOT-FIRER-NO-FAILURE-ESCALATION (P0)
#
# ROOT CAUSE UNDER TEST: run_firer() correctly returned non-zero for 67h of
# 100% exit_code=1 claude-CLI failures and NOTHING consumed that return code.
# The script has no gateway/MCP access, and the flow-level send_telegram
# escalation never runs because the CLI process dies before Step 0 of any
# flow executes. Net effect: 8 guaranteed slots x 3 days silent, zero BUG
# alerts, zero signals, zero board rows — detected only by a human noticing a
# missing Facebook post, two days late. launchctl reported the job healthy
# throughout (healthy JOB / 100%-failing WORK).
# ═══════════════════════════════════════════════════════════════════════════

# ── T14: all-success guaranteed tick — escalation must NOT fire (no false alarm) ──
reset_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"chef-morning\",\"agent\":\"unified-agent\",\"trigger_prompt\":\"run docs/agents/unified-agent/flow/chef.md  slot=chef-morning\",\"guaranteed\":true}],\"drift_min\":0}"'
run_firer false; RC=$?
check "T14 all-success tick exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T14 all-success tick — NO escalation POST" "$([ "$(curl_call_count)" -eq 0 ] && echo true || echo false)"

# ── T15: no-op tick (the ~90% common case) — escalation must NOT fire ──────────
reset_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[],\"drift_min\":1}"'
run_firer false; RC=$?
check "T15 no-op tick — NO escalation POST" "$([ "$(curl_call_count)" -eq 0 ] && echo true || echo false)"

# ── T16: a guaranteed slot invocation FAILS — escalation fires exactly once,
# to the Telegram sendMessage endpoint, with the failing slot named ──────────
reset_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"fb-daily\",\"agent\":\"fb-market-poster\",\"trigger_prompt\":\"run docs/agents/fb-market-poster/flow/main.md  slot=fb-daily\",\"guaranteed\":true}],\"drift_min\":0}"'
export CLAUDE_BIN="$TMPDIR_TEST/does-not-exist-claude-binary"
run_firer false; RC=$?
check "T16 failing slot — run_firer still returns non-zero" "$([ "$RC" -ne 0 ] && echo true || echo false)"
check "T16 failing slot — exactly ONE escalation POST" "$([ "$(curl_call_count)" -eq 1 ] && echo true || echo false)"
check "T16 escalation targets the Telegram sendMessage endpoint" "$(grep -q 'api.telegram.org/botstub-bot-token/sendMessage' "$CURL_RECORD_FILE" && echo true || echo false)"
check "T16 escalation carries the BUG chat id from .env key TELEGRAM_REPORT_BUG_CHANNEL_ID" "$(grep -q 'chat_id=-1009999999999' "$CURL_RECORD_FILE" && echo true || echo false)"
check "T16 escalation names the failing slot" "$(grep -q 'fb-daily' "$CURL_RECORD_FILE" && echo true || echo false)"

# ── T17: cooldown — the SAME failure on the next tick does NOT re-alert.
# This is the 900s-tick spam guard: a 67h outage must produce one alert per
# distinct episode, not 268 alerts. ─────────────────────────────────────────
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"fb-daily\",\"agent\":\"fb-market-poster\",\"trigger_prompt\":\"run docs/agents/fb-market-poster/flow/main.md  slot=fb-daily\",\"guaranteed\":true}],\"drift_min\":0}"'
export CLAUDE_BIN="$TMPDIR_TEST/does-not-exist-claude-binary"
: > "$CURL_RECORD_FILE"
run_firer false >/dev/null 2>&1
check "T17 repeat of the SAME failure inside the cooldown — suppressed" "$([ "$(curl_call_count)" -eq 0 ] && echo true || echo false)"

# ── T18: a DIFFERENT failure signature inside the same cooldown window still
# alerts — a cooldown must not blind the channel to a NEW episode. ──────────
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"chef-evening\",\"agent\":\"unified-agent\",\"trigger_prompt\":\"run docs/agents/unified-agent/flow/chef.md  slot=chef-evening\",\"guaranteed\":true}],\"drift_min\":0}"'
: > "$CURL_RECORD_FILE"
run_firer false >/dev/null 2>&1
check "T18 NEW failure signature inside the cooldown — still alerts" "$([ "$(curl_call_count)" -eq 1 ] && echo true || echo false)"
check "T18 the new alert names the newly failing slot" "$(grep -q 'chef-evening' "$CURL_RECORD_FILE" && echo true || echo false)"

# ── T19: cooldown EXPIRY — same signature, but the state stamp is older than
# the TTL, so the episode re-alerts (an ongoing outage is re-surfaced, not
# silently forgotten forever). ──────────────────────────────────────────────
: > "$CURL_RECORD_FILE"
export ALERT_COOLDOWN_SECONDS=1
sleep 2
run_firer false >/dev/null 2>&1
check "T19 cooldown expired — same signature re-alerts" "$([ "$(curl_call_count)" -eq 1 ] && echo true || echo false)"

# ── T20: token / chat-id unset — must FAIL LOUD into the error log, never
# silently swallow the escalation (that is the exact defect class this row
# exists to close, one level up). ───────────────────────────────────────────
reset_case
unset TELEGRAM_BOT_TOKEN
unset TELEGRAM_REPORT_BUG_CHANNEL_ID
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"tnb-audit\",\"agent\":\"tran-ngoc-bau\",\"trigger_prompt\":\"run docs/agents/tran-ngoc-bau/flow/main.md  slot=tnb-audit\",\"guaranteed\":true}],\"drift_min\":0}"'
export CLAUDE_BIN="$TMPDIR_TEST/does-not-exist-claude-binary"
run_firer false >/dev/null 2>&1
check "T20 missing telegram creds — no POST attempted" "$([ "$(curl_call_count)" -eq 0 ] && echo true || echo false)"
check "T20 missing telegram creds — logged LOUD in the error log" "$(grep -q 'ESCALATION-BLOCKED' "$LOG_ERR_FILE_PATH" 2>/dev/null && echo true || echo false)"

# ── T20b: the send itself failing must also be logged, never swallowed ───────
reset_case
export CURL_BIN="$FAILING_CURL"
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"digest-daily\",\"agent\":\"digest-predict\",\"trigger_prompt\":\"run docs/agents/digest-predict/flow/main.md  slot=digest-daily\",\"guaranteed\":true}],\"drift_min\":0}"'
export CLAUDE_BIN="$TMPDIR_TEST/does-not-exist-claude-binary"
run_firer false >/dev/null 2>&1
check "T20b escalation send failure logged (never swallowed)" "$(grep -q 'ESCALATION-SEND-FAILED' "$LOG_ERR_FILE_PATH" 2>/dev/null && echo true || echo false)"

# ── T21: the matcher itself failing means NO guaranteed slot can fire at all —
# strictly worse than one slot failing, so it must escalate too. ────────────
reset_case
export SLOT_MATCHER_CMD='false'
run_firer false >/dev/null 2>&1
check "T21 matcher command failure — escalation POST fired" "$([ "$(curl_call_count)" -eq 1 ] && echo true || echo false)"

reset_case
export SLOT_MATCHER_CMD='echo "not valid json at all"'
run_firer false >/dev/null 2>&1
check "T21b matcher non-JSON output — escalation POST fired" "$([ "$(curl_call_count)" -eq 1 ] && echo true || echo false)"

# ── T22: --dry-run must never escalate (manual diagnostic, not an incident) ──
reset_case
export SLOT_MATCHER_CMD='false'
run_firer true >/dev/null 2>&1
check "T22 dry-run never escalates" "$([ "$(curl_call_count)" -eq 0 ] && echo true || echo false)"

# ── T23 (AC-4 regression): one slot failing must NOT stop the next slot from
# firing, and the single escalation must name BOTH the failure and the tick. ──
reset_case
BAD_THEN_GOOD="$TMPDIR_TEST/bad-then-good-claude.sh"
cat > "$BAD_THEN_GOOD" <<'STUBEOF'
#!/usr/bin/env bash
echo "CALLED: $*" >> "$RECORD_FILE"
# write the notebook too (artifact-delta PROOF) — the failure signal here is the
# non-zero exit (slots: escalation), not a missing artifact.
agent=$(printf '%s' "$*" | sed -n 's/.*You are \([^,]*\),.*/\1/p')
if [ -n "$agent" ]; then
  mkdir -p "$NOTEBOOKS_DIR"
  printf 'fixture notebook written by bad-then-good claude for %s\n' "$agent" > "$NOTEBOOKS_DIR/$agent.md"
  touch -t 203001010000 "$NOTEBOOKS_DIR/$agent.md"
fi
case "$*" in *chef-eod*) exit 1 ;; esac
exit 0
STUBEOF
chmod +x "$BAD_THEN_GOOD"
export CLAUDE_BIN="$BAD_THEN_GOOD"
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"chef-eod\",\"agent\":\"unified-agent\",\"trigger_prompt\":\"run docs/agents/unified-agent/flow/chef.md  slot=chef-eod\",\"guaranteed\":true},{\"slot_id\":\"digest-daily\",\"agent\":\"digest-predict\",\"trigger_prompt\":\"run docs/agents/digest-predict/flow/main.md  slot=digest-daily\",\"guaranteed\":true}],\"drift_min\":0}"'
run_firer false; RC=$?
check "T23 AC-4 — the healthy sibling slot still fired after the failure" "$(grep -q 'slot=digest-daily' "$RECORD_FILE" && echo true || echo false)"
check "T23 AC-4 — both slots were attempted" "$([ "$(call_count)" -eq 2 ] && echo true || echo false)"
check "T23 exactly ONE escalation for the whole tick (not one per slot)" "$([ "$(curl_call_count)" -eq 1 ] && echo true || echo false)"
check "T23 the escalation names the slot that actually failed" "$(grep -q 'chef-eod' "$CURL_RECORD_FILE" && echo true || echo false)"

# ── T24 (FOLDED log-fidelity item): the invocation log line must print the
# REAL trigger_prompt that was executed, not a synthesised "slot=<id>" string.
# The old line logged `-p 'slot=fb-daily'` while actually executing
# `-p 'run docs/agents/fb-market-poster/flow/main.md  slot=fb-daily'` — it
# reads like the firer dropped the flow path from the prompt, which is a
# plausible and entirely wrong root cause for a triager to chase. The prompt
# now logged is the FULL composed ENTRY_PROMPT (identity preamble + trigger +
# session/scheduled lines) — the trigger_prompt appears as a substring of it. ──
reset_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"fb-daily\",\"agent\":\"fb-market-poster\",\"trigger_prompt\":\"run docs/agents/fb-market-poster/flow/main.md  slot=fb-daily\",\"guaranteed\":true}],\"drift_min\":0}"'
run_firer false >/dev/null 2>&1
check "T24 invocation log prints the REAL trigger_prompt (inside the composed ENTRY_PROMPT)" \
  "$(grep -q "invoking (bounded 30s):" "$LOG_FILE_PATH" && grep -q 'run docs/agents/fb-market-poster/flow/main.md  slot=fb-daily' "$LOG_FILE_PATH" && echo true || echo false)"

# ── T25 (FOLDED item 7a of FIX-GUARANTEED-SLOT-FIRER-FANOUT-TRUNCATION):
# every log line was written TWICE in production — once by log()'s `tee -a
# "$LOG_FILE"`, once by launchd, whose StandardOutPath for this job IS that
# same file (verified in launchd/com.vn-market.cowork-guaranteed-slot-firer.
# plist). log() must therefore not emit to stdout on a non-TTY run. ─────────
reset_case
CLI_OUT=$(SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"fb-weekend\",\"agent\":\"fb-market-poster\",\"trigger_prompt\":\"run docs/agents/fb-market-poster/flow/main.md  slot=fb-weekend\",\"guaranteed\":true}],\"drift_min\":0}"' \
  FIRER_ROOT="$TMPDIR_TEST" LOG_FILE_PATH="$LOG_FILE_PATH" LOG_ERR_FILE_PATH="$LOG_ERR_FILE_PATH" \
  CLAUDE_BIN="$FAKE_CLAUDE" RECORD_FILE="$RECORD_FILE" FIRE_TIMEOUT_SECONDS=30 \
  WRITE_LAST_FIRED_CMD="$FAKE_WRITE" WRITE_RECORD_FILE="$WRITE_RECORD_FILE" NOTEBOOKS_DIR="$NOTEBOOKS_DIR" \
  CURL_BIN="$FAKE_CURL" CURL_RECORD_FILE="$CURL_RECORD_FILE" ALERT_STATE_FILE="$ALERT_STATE_FILE" \
  TELEGRAM_BOT_TOKEN="stub-bot-token" TELEGRAM_REPORT_BUG_CHANNEL_ID="-1009999999999" \
  bash "$FIRER_SH" 2>&1)
check "T25 non-TTY run emits NO log lines on stdout (launchd would duplicate them into the same file)" \
  "$(printf '%s' "$CLI_OUT" | grep -q '^\[20' && echo false || echo true)"
check "T25 the log line is still written exactly once to LOG_FILE" \
  "$([ "$(grep -c 'guaranteed-slot-firer: slot=fb-weekend' "$LOG_FILE_PATH")" -eq 1 ] && echo true || echo false)"

# ═══════════════════════════════════════════════════════════════════════════
# FIX-COWORK-LAYERC-NO-IDENTITY-PREAMBLE (P1)
#
# (a) Layer C composes the SAME ENTRY_PROMPT shape as spawn-fanout.md Step 5.2
#     (shared identity preamble + trigger_prompt + synthetic owner_client_session
#     + scheduled_utc when present) — T29.
# (b) The artifact-delta writeback gate (PO ruling 2): cowork-write-last-fired.js
#     is called ONLY on artifact-delta proof (notebook mtime > fire start), NEVER
#     on exit-0 alone; a no-delta exit-0 with no peer stamp is the measured
#     NULL-FIRE defect class → ONE cooldown-bounded BUG alert, no stamp; a
#     peer-stamped redundant dual-plane fire is silent — T26/T27/T28.
# ═══════════════════════════════════════════════════════════════════════════

# ── T26: artifact-delta PROOF — the fake claude wrote the agent's notebook
# (mtime > fire start) → cowork-write-last-fired.js (WRITE_LAST_FIRED_CMD seam)
# IS invoked with the slot id, and NO nullfire escalation fires. ─────────────
reset_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"chef-morning\",\"agent\":\"unified-agent\",\"trigger_prompt\":\"run docs/agents/unified-agent/flow/chef.md  slot=chef-morning\",\"guaranteed\":true,\"last_fired\":null}],\"drift_min\":0}"'
run_firer false; RC=$?
check "T26 artifact-delta proof — exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T26 writeback invoked exactly once with the slot id" \
  "$([ "$(write_call_count)" -eq 1 ] && grep -q 'chef-morning' "$WRITE_RECORD_FILE" && echo true || echo false)"
check "T26 no nullfire escalation (proof → stamp, not alert)" "$([ "$(curl_call_count)" -eq 0 ] && echo true || echo false)"

# ── T27: exit-0 with NO notebook delta and NO peer stamp — the measured
# NULL-FIRE defect class. Writeback NOT invoked; exactly ONE nullfire
# escalation POST naming the slot; last_fired NOT stamped. ──────────────────
reset_case
export CLAUDE_BIN="$NOOP_CLAUDE"
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"fb-daily\",\"agent\":\"fb-market-poster\",\"trigger_prompt\":\"run docs/agents/fb-market-poster/flow/main.md  slot=fb-daily\",\"guaranteed\":true,\"last_fired\":null}],\"drift_min\":0}"'
mkdir -p "$TMPDIR_TEST/docs/data"
printf '%s\n' '{"slots":[{"slot_id":"fb-daily","last_fired":null}]}' > "$TMPDIR_TEST/docs/data/cowork-schedule.json"
run_firer false; RC=$?
check "T27 null fire (exit-0, no delta, no peer stamp) — exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T27 writeback NOT invoked (never stamp on exit-0 alone)" "$([ "$(write_call_count)" -eq 0 ] && echo true || echo false)"
check "T27 exactly ONE nullfire escalation POST" "$([ "$(curl_call_count)" -eq 1 ] && echo true || echo false)"
check "T27 escalation names the slot" "$(grep -q 'fb-daily' "$CURL_RECORD_FILE" && echo true || echo false)"
check "T27 NULL-FIRE logged to the error log" "$(grep -q 'NULL-FIRE' "$LOG_ERR_FILE_PATH" 2>/dev/null && echo true || echo false)"

# ── T28: exit-0 with NO notebook delta BUT the peer stamped meanwhile (schedule
# re-read shows last_fired advanced past the pre-fire value) — the redundant
# dual-plane fire case. Writeback NOT invoked, NO escalation. ────────────────
reset_case
export CLAUDE_BIN="$NOOP_CLAUDE"
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"fb-daily\",\"agent\":\"fb-market-poster\",\"trigger_prompt\":\"run docs/agents/fb-market-poster/flow/main.md  slot=fb-daily\",\"guaranteed\":true,\"last_fired\":\"2026-08-26T05:15:00Z\"}],\"drift_min\":0}"'
mkdir -p "$TMPDIR_TEST/docs/data"
printf '%s\n' '{"slots":[{"slot_id":"fb-daily","last_fired":"2026-08-26T06:00:00Z"}]}' > "$TMPDIR_TEST/docs/data/cowork-schedule.json"
run_firer false; RC=$?
check "T28 peer-stamped redundant fire — writeback NOT invoked" "$([ "$(write_call_count)" -eq 0 ] && echo true || echo false)"
check "T28 peer-stamped redundant fire — NO escalation (peer's stamp stands)" "$([ "$(curl_call_count)" -eq 0 ] && echo true || echo false)"
check "T28 peer-stamped branch logged" "$(grep -q 'peer-stamped' "$LOG_FILE_PATH" 2>/dev/null && echo true || echo false)"

# ── T29: the recorded claude invocation carries the COMPOSED ENTRY_PROMPT —
# preamble first, then the trigger_prompt, the synthetic namespaced
# owner_client_session line (cowork-layerc:<slot>:<epoch>) and the
# scheduled_utc line (present when the canned slot carries scheduled_utc_time). ──
reset_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"chef-morning\",\"agent\":\"unified-agent\",\"trigger_prompt\":\"run docs/agents/unified-agent/flow/chef.md  slot=chef-morning\",\"guaranteed\":true,\"last_fired\":null,\"scheduled_utc_time\":\"2026-08-29T05:15:00.000Z\"}],\"drift_min\":0}"'
run_firer false; RC=$?
check "T29 invocation STARTS with the shared identity preamble" \
  "$(grep -q 'You are unified-agent, spawned in the background by cowork-team' "$RECORD_FILE" && echo true || echo false)"
check "T29 invocation contains the synthetic owner_client_session line (cowork-layerc:<slot>:<epoch>)" \
  "$(grep -q 'Coordination: owner_client_session=cowork-layerc:chef-morning:' "$RECORD_FILE" && echo true || echo false)"
check "T29 invocation contains scheduled_utc=<slot value> when present" \
  "$(grep -q 'scheduled_utc=2026-08-29T05:15:00.000Z' "$RECORD_FILE" && echo true || echo false)"
check "T29 invocation contains the trigger_prompt verbatim" \
  "$(grep -q 'run docs/agents/unified-agent/flow/chef.md  slot=chef-morning' "$RECORD_FILE" && echo true || echo false)"

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
