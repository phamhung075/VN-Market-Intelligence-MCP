#!/usr/bin/env bash
# commit-convention-audit.sh — Day-7 commit convention audit for Phase B C1/C2 greenlight
# Brief: docs/architecture-briefs/2026-05-17-commit-convention-audit.md
# Usage: bash scripts/audits/commit-convention-audit.sh [SINCE_DATE] [--emit-signal]
# Exit: 0 = PASS, 1 = FAIL
#
# DEPRECATED (2026-07-23, UC-GCP-P1): this was a ONE-TIME Phase-B (2026-05-10..05-17)
# greenlight gate. Its C1-C4 predicates and VOCAB below assert the dead numeric-sprint /
# `Sprint:`-trailer / digit-in-scope convention — they do NOT match the current slug-based
# format documented at docs/policies/commit-convention.md. Confirmed NOT wired into any
# live flow/cron/skill (grep -r 'commit-convention-audit' scripts/ .claude/ docs/agents/ = 0
# hits outside this file). Do not run this as a live validator; kept only as a historical
# Phase-B artifact. SSOT: docs/policies/commit-convention.md.

set -euo pipefail

# Force C locale so awk/printf use '.' as decimal separator regardless of system locale
export LC_ALL=C
export LANG=C

# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------
SINCE_DATE="${1:-2026-05-10T00:00:00Z}"
UNTIL_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Canonical Phase B window constants
PHASE_B_SINCE_CANONICAL="2026-05-10T00:00:00Z"
PHASE_B_UNTIL_DATE_CANONICAL="2026-05-17"   # inclusive end, UTC date only

# Flag parsing — --emit-signal can appear at any position after SINCE_DATE
EMIT_SIGNAL=false
for arg in "$@"; do
  [ "${arg}" = "--emit-signal" ] && EMIT_SIGNAL=true
done
REPORT_DIR="docs/signals/processed"
REPORT_DATE="$(date -u +%Y%m%d)"
REPORT_FILE="${REPORT_DIR}/commit-convention-audit-${REPORT_DATE}.json"
SIGNAL_TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"

# DEPRECATED vocabulary snapshot (historical Phase-B era; not synced to current
# docs/policies/commit-convention.md § Scope Rules, which has no fixed enforced list)
VOCAB="agent-doc agents agents-architect alert-accuracy alerts api-gateway arch architecture audit cleanup commit-convention crons cycle data db deploy-verification dev-team docker flow flows infra janitor knowledge market-watcher mcp mcp-server mcp-tool memory merge microservice notebooks pm qa rag readme registry routing scan-market scheduler sessions signals skill skills ssot state system-auditor ta-alert-notifier tasks telegram tree-map types vps"

mkdir -p "${REPORT_DIR}"

# ---------------------------------------------------------------------------
# Collect commits via git log
# Each record block separated by ---COMMIT_END---
# Fields: SHA SUBJECT | SPRINT_TRAILER | TASK_TRAILER | AC_TRAILER
# ---------------------------------------------------------------------------
# We use a single git log invocation and parse the custom format.
# Format per commit:
#   line 1:  <sha> <subject>
#   line 2:  sprint trailer value (empty if absent)
#   line 3:  task trailer value (empty if absent)
#   line 4:  ac trailer value (empty if absent)
#   line 5:  ---COMMIT_END---

TMPFILE="$(mktemp /tmp/commit-audit-XXXXXX.txt)"
trap 'rm -f "${TMPFILE}"' EXIT

git log \
  --since="${SINCE_DATE}" \
  --until="${UNTIL_DATE}" \
  --pretty=format:"COMMIT_SHA=%H COMMIT_SUBJ=%s%nSPRINT_VAL=%(trailers:key=Sprint,valueonly,separator=%x2C)%nTASK_VAL=%(trailers:key=Task,valueonly,separator=%x2C)%nAC_VAL=%(trailers:key=AC,valueonly,separator=%x2C)%n---COMMIT_END---" \
  > "${TMPFILE}"

# ---------------------------------------------------------------------------
# Parse per-commit records
# ---------------------------------------------------------------------------
total_commits=0
excluded_bare_merges=0

# C1 counters
c1_denominator=0
c1_pass=0
c1_violations=()

# C2 counters
c2_denominator=0
c2_pass=0
c2_violations=()

# C3 counters
c3_denominator=0
c3_pass=0
c3_violations=()

# C4 counters
c4_denominator=0
c4_pass=0
c4_violations=()

# Header format regex (POSIX ERE)
HEADER_RE='^(feat|fix|chore|test|docs|refactor)\([^)]+\): .+'

# Read the tmpfile block by block
sha=""
subj=""
sprint_val=""
task_val=""
ac_val=""

process_commit() {
  local lsha="$1"
  local lsubj="$2"
  local ltask="$3"
  local lac="$4"

  total_commits=$((total_commits + 1))

  # Filter bare git-generated merge commits
  if echo "${lsubj}" | grep -qE '^Merge branch'; then
    excluded_bare_merges=$((excluded_bare_merges + 1))
    return
  fi

  # -------------------------------------------------------------------------
  # C1 — Header format
  # -------------------------------------------------------------------------
  c1_denominator=$((c1_denominator + 1))
  if echo "${lsubj}" | grep -qE "${HEADER_RE}"; then
    c1_pass=$((c1_pass + 1))
  else
    if [ ${#c1_violations[@]} -lt 20 ]; then
      c1_violations+=("$(printf '{"sha":"%s","subject":%s,"reason":"header does not match required regex"}' \
        "${lsha:0:8}" "$(echo "${lsubj}" | jq -Rs '.')" )")
    fi
  fi

  # -------------------------------------------------------------------------
  # C2 — Task trailer presence for sprint-scoped commits
  # Scope contains a digit AND scope is not memory/*
  # -------------------------------------------------------------------------
  # Extract scope from subject: between ( and )
  local scope=""
  scope="$(echo "${lsubj}" | sed -n 's/^[a-z]*(\([^)]*\)):.*/\1/p')"

  # Check if scope contains a digit (sprint-scoped)
  local is_sprint_scoped=false
  if echo "${scope}" | grep -qE '[0-9]'; then
    is_sprint_scoped=true
  fi

  # Check if notebook commit: scope starts with memory/
  local is_notebook=false
  if echo "${scope}" | grep -qE '^memory/'; then
    is_notebook=true
  fi

  # C2 exempt: scope digit is cycle/PM-cycle reference, not sprint task
  # Or: subject is a sprint-scoped merge-task chore (AC lives on feat/fix)
  local is_c2_exempt=false
  case "${scope}" in
    cycle-[0-9]*)
      is_c2_exempt=true
      ;;
    pm/c[0-9]*)
      is_c2_exempt=true
      ;;
    pm/[0-9][0-9][0-9][0-9]*)
      is_c2_exempt=true
      ;;
  esac
  case "${lsubj}" in
    *"merge task/"*)
      is_c2_exempt=true
      ;;
  esac

  if [ "${is_sprint_scoped}" = "true" ] && [ "${is_notebook}" = "false" ] && [ "${is_c2_exempt}" = "false" ]; then
    c2_denominator=$((c2_denominator + 1))
    if [ -n "${ltask}" ]; then
      c2_pass=$((c2_pass + 1))
    else
      if [ ${#c2_violations[@]} -lt 20 ]; then
        c2_violations+=("$(printf '{"sha":"%s","subject":%s,"reason":"sprint-scoped commit missing Task: trailer"}' \
          "${lsha:0:8}" "$(echo "${lsubj}" | jq -Rs '.')" )")
      fi
    fi
  fi

  # -------------------------------------------------------------------------
  # C3 — AC trailer presence when Task: trailer is present
  # Exemptions (no AC expected by convention):
  #   - scope starts with memory/ (notebook commits)
  #   - type+scope is chore(state*) (pipeline bookkeeping)
  #   - subject contains "merge task/" (merge bundle commits)
  # -------------------------------------------------------------------------
  local is_c3_exempt=false
  if [ "${is_notebook}" = "true" ]; then
    is_c3_exempt=true
  fi
  case "${lsubj}" in
    chore\(state*\):*)
      is_c3_exempt=true
      ;;
  esac
  case "${lsubj}" in
    *merge\ task/*)
      is_c3_exempt=true
      ;;
  esac

  if [ -n "${ltask}" ] && [ "${is_c3_exempt}" = "false" ]; then
    c3_denominator=$((c3_denominator + 1))
    if [ -n "${lac}" ]; then
      c3_pass=$((c3_pass + 1))
    else
      if [ ${#c3_violations[@]} -lt 20 ]; then
        c3_violations+=("$(printf '{"sha":"%s","subject":%s,"reason":"Task trailer present but AC trailer missing"}' \
          "${lsha:0:8}" "$(echo "${lsubj}" | jq -Rs '.')" )")
      fi
    fi
  fi

  # -------------------------------------------------------------------------
  # C4 — Scope vocabulary compliance (non-notebook commits only)
  # -------------------------------------------------------------------------
  if [ "${is_notebook}" = "false" ]; then
    if echo "${lsubj}" | grep -qE "${HEADER_RE}"; then
      c4_denominator=$((c4_denominator + 1))
      # Extract area token: last segment after / in scope, or full scope if no /
      local area_token=""
      if echo "${scope}" | grep -q '/'; then
        area_token="$(echo "${scope}" | sed 's|.*/||')"
      else
        area_token="${scope}"
      fi

      # Sprint/task IDs used as area token are convention-exempt (counted as pass).
      # Pattern: area token starts with 4+ consecutive digits (e.g. 1872a, 1864b-X).
      local first4=""
      first4="$(echo "${area_token}" | cut -c1-4)"
      case "${first4}" in
        [0-9][0-9][0-9][0-9])
          c4_pass=$((c4_pass + 1))
          return
          ;;
      esac

      local vocab_match=false
      for token in ${VOCAB}; do
        if [ "${area_token}" = "${token}" ]; then
          vocab_match=true
          break
        fi
      done

      if [ "${vocab_match}" = "true" ]; then
        c4_pass=$((c4_pass + 1))
      else
        if [ ${#c4_violations[@]} -lt 20 ]; then
          c4_violations+=("$(printf '{"sha":"%s","subject":%s,"reason":"unrecognized area token: %s"}' \
            "${lsha:0:8}" "$(echo "${lsubj}" | jq -Rs '.')" "${area_token}" )")
        fi
      fi
    fi
  fi
}

# ---------------------------------------------------------------------------
# Parse the tmpfile line by line accumulating per-commit fields
# ---------------------------------------------------------------------------
while IFS= read -r line; do
  if [[ "${line}" == ---COMMIT_END--- ]]; then
    # Process accumulated record
    if [ -n "${sha}" ]; then
      process_commit "${sha}" "${subj}" "${task_val}" "${ac_val}"
    fi
    sha=""
    subj=""
    sprint_val=""
    task_val=""
    ac_val=""
  elif [[ "${line}" == COMMIT_SHA=* ]]; then
    # Parse: COMMIT_SHA=<sha> COMMIT_SUBJ=<subject>
    # sha is first token after COMMIT_SHA=, rest after COMMIT_SUBJ= is subject
    rest="${line#COMMIT_SHA=}"
    sha="${rest%% *}"
    rest="${rest#* COMMIT_SUBJ=}"
    subj="${rest}"
  elif [[ "${line}" == SPRINT_VAL=* ]]; then
    sprint_val="${line#SPRINT_VAL=}"
  elif [[ "${line}" == TASK_VAL=* ]]; then
    task_val="${line#TASK_VAL=}"
  elif [[ "${line}" == AC_VAL=* ]]; then
    ac_val="${line#AC_VAL=}"
  fi
done < "${TMPFILE}"

# Handle last record if file doesn't end with ---COMMIT_END---
if [ -n "${sha}" ]; then
  process_commit "${sha}" "${subj}" "${task_val}" "${ac_val}"
fi

# ---------------------------------------------------------------------------
# Compute pass rates
# ---------------------------------------------------------------------------
audited_commits=$(( total_commits - excluded_bare_merges ))

# Helper: compute rate as float using awk
rate() {
  local pass="$1"
  local denom="$2"
  if [ "${denom}" -eq 0 ]; then
    echo "1.0"
  else
    awk "BEGIN { printf \"%.4f\", ${pass}/${denom} }"
  fi
}

c1_actual="$(rate "${c1_pass}" "${c1_denominator}")"
c2_actual="$(rate "${c2_pass}" "${c2_denominator}")"
c3_actual="$(rate "${c3_pass}" "${c3_denominator}")"
c4_actual="$(rate "${c4_pass}" "${c4_denominator}")"

# Pass/fail booleans (compare using awk)
passes_threshold() {
  local actual="$1"
  local threshold="$2"
  awk "BEGIN { exit (${actual} >= ${threshold}) ? 0 : 1 }"
}

c1_pass_bool="false"; passes_threshold "${c1_actual}" 0.90 && c1_pass_bool="true" || true
c2_pass_bool="false"; passes_threshold "${c2_actual}" 0.85 && c2_pass_bool="true" || true
c3_pass_bool="false"; passes_threshold "${c3_actual}" 0.80 && c3_pass_bool="true" || true
c4_pass_bool="false"; passes_threshold "${c4_actual}" 0.95 && c4_pass_bool="true" || true

verdict="PASS"
if [ "${c1_pass_bool}" = "false" ] || [ "${c2_pass_bool}" = "false" ] || \
   [ "${c3_pass_bool}" = "false" ] || [ "${c4_pass_bool}" = "false" ]; then
  verdict="FAIL"
fi

greenlight_action="none"
[ "${verdict}" = "PASS" ] && greenlight_action="C1+C2"

# ---------------------------------------------------------------------------
# Build violations JSON arrays (no nameref — compatible with bash 3)
# ---------------------------------------------------------------------------
join_violations() {
  # Takes violation items passed as individual arguments
  local result="["
  local first=true
  for v in "$@"; do
    [ "${first}" = "true" ] || result+=","
    result+="${v}"
    first=false
  done
  result+="]"
  echo "${result}"
}

c1_viols="$(join_violations "${c1_violations[@]+"${c1_violations[@]}"}")"
c2_viols="$(join_violations "${c2_violations[@]+"${c2_violations[@]}"}")"
c3_viols="$(join_violations "${c3_violations[@]+"${c3_violations[@]}"}")"
c4_viols="$(join_violations "${c4_violations[@]+"${c4_violations[@]}"}")"

# ---------------------------------------------------------------------------
# Emit JSON report
# ---------------------------------------------------------------------------
cat > "${REPORT_FILE}" << EOF
{
  "generated_at": "${UNTIL_DATE}",
  "window": {
    "since": "${SINCE_DATE}",
    "until": "${UNTIL_DATE}"
  },
  "total_commits": ${total_commits},
  "excluded_bare_merges": ${excluded_bare_merges},
  "audited_commits": ${audited_commits},
  "criteria": {
    "C1_header_format": {
      "threshold": 0.90,
      "actual": ${c1_actual},
      "pass": ${c1_pass_bool},
      "violations": ${c1_viols}
    },
    "C2_task_trailer": {
      "threshold": 0.85,
      "actual": ${c2_actual},
      "pass": ${c2_pass_bool},
      "violations": ${c2_viols}
    },
    "C3_ac_trailer": {
      "threshold": 0.80,
      "actual": ${c3_actual},
      "pass": ${c3_pass_bool},
      "violations": ${c3_viols}
    },
    "C4_scope_vocab": {
      "threshold": 0.95,
      "actual": ${c4_actual},
      "pass": ${c4_pass_bool},
      "violations": ${c4_viols}
    }
  },
  "verdict": "${verdict}",
  "greenlight_action": "${greenlight_action}"
}
EOF

echo "Audit report: ${REPORT_FILE}"
echo "Verdict: ${verdict}"
echo "C1 header format:   ${c1_actual} (threshold 0.90) — ${c1_pass_bool}"
echo "C2 task trailer:    ${c2_actual} (threshold 0.85) — ${c2_pass_bool}"
echo "C3 AC trailer:      ${c3_actual} (threshold 0.80) — ${c3_pass_bool}"
echo "C4 scope vocab:     ${c4_actual} (threshold 0.95) — ${c4_pass_bool}"

# ---------------------------------------------------------------------------
# Signal drop — only when --emit-signal flag is present AND window guard passes
# ---------------------------------------------------------------------------
if [ "${EMIT_SIGNAL}" = "true" ]; then
  TODAY_UTC="$(date -u +%Y-%m-%d)"
  window_ok=false
  date_ge_start=false
  date_le_end=false
  if [ "${TODAY_UTC}" = "2026-05-10" ] || [ "${TODAY_UTC}" \> "2026-05-10" ]; then date_ge_start=true; fi
  if [ "${TODAY_UTC}" = "${PHASE_B_UNTIL_DATE_CANONICAL}" ] || [ "${TODAY_UTC}" \< "${PHASE_B_UNTIL_DATE_CANONICAL}" ]; then date_le_end=true; fi
  if [ "${SINCE_DATE}" = "${PHASE_B_SINCE_CANONICAL}" ] && \
     [ "${date_ge_start}" = "true" ] && [ "${date_le_end}" = "true" ]; then
    window_ok=true
  fi

  if [ "${window_ok}" = "false" ]; then
    echo "WARNING: --emit-signal ignored. SINCE_DATE or today (${TODAY_UTC}) outside Phase B window (2026-05-10..2026-05-17). Report written; no signal dropped."
  else
    if [ "${verdict}" = "PASS" ]; then
      SIGNAL_FILE="docs/signals/agents-architect-${SIGNAL_TS}-phase-b-c1-c2.json"
      cat > "${SIGNAL_FILE}" << SIGEOF
{
  "from": "agents-architect",
  "to": "agent-father",
  "type": "phase_b_greenlight",
  "tasks": ["C1", "C2"],
  "audit_report": "${REPORT_FILE}",
  "verdict": "PASS",
  "generated_at": "${UNTIL_DATE}"
}
SIGEOF
      echo "Signal drop (PASS): ${SIGNAL_FILE}"
    else
      # Collect failing criteria list
      failing_criteria="["
      first=true
      [ "${c1_pass_bool}" = "false" ] && { [ "${first}" = "true" ] || failing_criteria+=","; failing_criteria+='"C1"'; first=false; }
      [ "${c2_pass_bool}" = "false" ] && { [ "${first}" = "true" ] || failing_criteria+=","; failing_criteria+='"C2"'; first=false; }
      [ "${c3_pass_bool}" = "false" ] && { [ "${first}" = "true" ] || failing_criteria+=","; failing_criteria+='"C3"'; first=false; }
      [ "${c4_pass_bool}" = "false" ] && { [ "${first}" = "true" ] || failing_criteria+=","; failing_criteria+='"C4"'; first=false; }
      failing_criteria+="]"

      SIGNAL_FILE="docs/signals/agents-architect-${SIGNAL_TS}-phase-b-c1-c2-fail.json"
      cat > "${SIGNAL_FILE}" << SIGEOF
{
  "from": "agents-architect",
  "to": "user",
  "type": "phase_b_fail",
  "tasks": ["C1", "C2"],
  "verdict": "FAIL",
  "failing_criteria": ${failing_criteria},
  "audit_report": "${REPORT_FILE}",
  "remediation": "See violations list in audit report. Extend window by 7 days (re-run 2026-05-24). Fix agent flows that produced violations.",
  "generated_at": "${UNTIL_DATE}"
}
SIGEOF
      echo "Signal drop (FAIL): ${SIGNAL_FILE}"
    fi
  fi
else
  echo "Signal emission skipped (no --emit-signal flag). Report at: ${REPORT_FILE}"
fi

# Exit 0 = PASS, 1 = FAIL
[ "${verdict}" = "PASS" ] && exit 0 || exit 1
