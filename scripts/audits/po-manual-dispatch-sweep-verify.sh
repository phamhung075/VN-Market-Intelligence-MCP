#!/usr/bin/env bash
# scripts/audits/po-manual-dispatch-sweep-verify.sh
#
# Regression verifier for FIX-PO-NO-PRODUCER-FOR-MANUAL-DISPATCH-ESCAPE-HATCH
# and its follow-up FIX-PO-MANUAL-DISPATCH-SWEEP-FLAG-WITHOUT-DISPATCH-STRANDS-ROW.
#
# PROBLEM (as filed): `docs/agents/dev-team/flow/main.md`'s Lane × Gate
# Coverage Matrix and `scripts/audits/bounded1-supervised-lane-report.sh`'s
# DRS/READY-XOR sections both describe two live classes of task_board row as
# "reachable only by manual/PO dispatch" — but no PO flow step ever swept
# `backlog[]`/`ready[]` by priority for this class (grep-verified twice,
# independently, by po and dev-team). 4th instance of the "documented
# consumer, no documented producer" defect class.
#
# FOLLOW-UP PROBLEM (FIX-PO-MANUAL-DISPATCH-SWEEP-FLAG-WITHOUT-DISPATCH-
# STRANDS-ROW, 2026-07-31): the original Step 1 exclusion
# `(.po_manual_dispatch_flagged_at // "") == ""` was PERMANENT — stamp (Step
# 2) and dispatch (BATCH actually reaching dev-team under its own WIP cap)
# are not atomic, so a row stamped on a tick whose BATCH then got deferred
# became invisible to every later sweep forever (live-proved by `TE-T12`,
# flagged 2026-07-31T06:56:27Z, still BACKLOG ~8h later). Cured by bounding
# the exclusion to a staleness window (`flag_reentrant`, `$stale_seconds`) —
# a fresh-flagged row stays excluded, a stale-flagged row is re-admitted.
#
# This script proves FOUR things, none provable by reading prose alone:
#   DOC CHECK      — docs/agents/po/flow/manual-dispatch-sweep.md (the new
#                    PO-side producer) exists and is routed from main.md.
#   SHARED-LIB      — scripts/lib/po-manual-dispatch-eligibility.jq exists
#                    and its three predicates (`is_drs_stranded_off_allowlist`,
#                    `is_backlog_xor_gap`, `is_ready_xor_gap`) resolve every named branch of
#                    main.md's own Lane × Gate Coverage Matrix correctly on a
#                    synthetic fixture — positive AND negative controls, so a
#                    future hand-edit that silently narrows/widens either
#                    predicate is caught here, not live. Replays the
#                    predicates BYTE-IDENTICAL via `include`, never
#                    reimplemented — this script does not hand-derive
#                    effective_supervised/effective_plan_only/
#                    is_design_router_allowed/is_epic_wrapper/deps_satisfied
#                    logic anywhere; every check below composes ONLY the
#                    shared `scripts/lib/devteam-eligibility.jq` +
#                    `scripts/lib/po-manual-dispatch-eligibility.jq` defs.
#   IDEMPOTENCY     — a row already carrying a FRESH `po_manual_dispatch_
#                    flagged_at` (younger than `$stale_seconds`) is excluded
#                    by the sub-flow's own Step 1 selection (never
#                    re-surfaced/re-BATCHed while its BATCH still has a
#                    realistic chance to actually dispatch it).
#   RE-ADMISSION    — a row carrying a STALE `po_manual_dispatch_flagged_at`
#                    (older than `$stale_seconds`) and still sitting in
#                    `backlog[]` IS re-surfaced as a candidate — the positive
#                    control for the bounded re-admission fix above. Replays
#                    Step 1's own inline `flag_reentrant` def BYTE-IDENTICAL,
#                    never reimplemented.
#
# Touches NO live file — synthetic fixtures only, no docs/data/orch/
# orch-state.json I/O, no orch-apply.sh call.
#
# Usage: bash scripts/audits/po-manual-dispatch-sweep-verify.sh

set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

# NOTE: keep in lockstep with docs/agents/po/flow/manual-dispatch-sweep.md
# Step 1 and docs/policies/dev-standards.md:517/521's mirror — same
# $stale_seconds value, same flag_reentrant() body.
NOW_EPOCH=$(date -u +%s)
STALE_SECONDS=14400   # 4h

fail=0

# --- DOC CHECK ---
DOC="docs/agents/po/flow/manual-dispatch-sweep.md"
if [ ! -f "$DOC" ]; then
  echo "FAIL: $DOC does not exist — no documented PO-side manual-dispatch producer." >&2
  fail=1
else
  echo "[OK] $DOC exists."
fi

if ! grep -qE 'manual-dispatch-sweep\.md' docs/agents/po/flow/main.md; then
  echo "FAIL: docs/agents/po/flow/main.md has no pointer to manual-dispatch-sweep.md — producer step unreachable from PO's dispatch table." >&2
  fail=1
else
  echo "[OK] docs/agents/po/flow/main.md routes to manual-dispatch-sweep.md."
fi

LIB="scripts/lib/po-manual-dispatch-eligibility.jq"
if [ ! -f "$LIB" ]; then
  echo "FAIL: $LIB does not exist." >&2
  fail=1
else
  echo "[OK] $LIB exists."
fi

# --- SHARED-LIB: synthetic fixture covering every named Matrix branch ---
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

cat > "$WORK/detail.json" <<'JSON'
{"items": []}
JSON

# EMPTY file (zero JSON values), matching scripts/lib/archive-glob-cat.sh's
# own zero-match output shape ("Never errors/hangs on zero matches — outputs
# nothing, so the resulting $archive is []") — NOT a JSON `[]` literal, which
# --slurpfile would instead wrap as a ONE-element array containing an empty
# array, breaking archive_status_map's `(.done_tasks // [])[]` indexing.
: > "$WORK/archive.json"

# FRESH/STALE po_manual_dispatch_flagged_at timestamps computed relative to
# $NOW_EPOCH via jq's own todateiso8601 (portable — no BSD-vs-GNU `date -d`/
# `date -v` divergence, see feedback_bsd_date_3n_literal_corrupts_iso8601):
#   FRESH_FLAG_ISO — 5 minutes ago, well inside $STALE_SECONDS -> must stay
#                    EXCLUDED (G-ALREADY-FLAGGED negative control).
#   STALE_FLAG_ISO — $STALE_SECONDS + 1h ago, past the window -> must be
#                    RE-ADMITTED (M-STALE-FLAGGED-REENTRANT positive control).
FRESH_FLAG_ISO=$(jq -rn --argjson e "$((NOW_EPOCH - 300))" '$e | todateiso8601')
STALE_FLAG_ISO=$(jq -rn --argjson e "$((NOW_EPOCH - STALE_SECONDS - 3600))" '$e | todateiso8601')

cat > "$WORK/fixture.json" <<JSON
{
  "task_board": {
    "backlog": [
      { "id": "A-OFFLIST-POSITIVE",   "status": "BACKLOG", "next_agent": "agent-father" },
      { "id": "B-ALLOWLISTED",        "status": "BACKLOG", "next_agent": "architect" },
      { "id": "C-DEV-ROLE",           "status": "BACKLOG", "next_agent": "developer" },
      { "id": "D-SLS-TERRITORY",      "status": "BACKLOG", "next_agent": "ops", "supervised": true, "plan_only": true },
      { "id": "E-EPIC-WRAPPER",       "status": "BACKLOG", "next_agent": "ops", "children": ["E-CHILD-1"] },
      { "id": "F-DEPS-UNSATISFIED",   "status": "BACKLOG", "next_agent": "ops", "depends_on": ["MISSING-DEP-NEVER-DONE"] },
      { "id": "G-ALREADY-FLAGGED",    "status": "BACKLOG", "next_agent": "agent-father", "po_manual_dispatch_flagged_at": "$FRESH_FLAG_ISO" },
      { "id": "M-STALE-FLAGGED-REENTRANT", "status": "BACKLOG", "next_agent": "agent-father", "po_manual_dispatch_flagged_at": "$STALE_FLAG_ISO" },
      { "id": "N-BACKLOG-XOR-DEVROLE", "status": "BACKLOG", "next_agent": "developer", "supervised": true, "plan_only": false },
      { "id": "O-BACKLOG-XOR-NO-NEXTAGENT", "status": "BACKLOG", "owner": "po", "supervised": false, "plan_only": true },
      { "id": "P-BACKLOG-XOR-NONDEV-ALLOWLISTED", "status": "BACKLOG", "next_agent": "architect", "supervised": true, "plan_only": false },
      { "id": "Q-BACKLOG-XOR-NONDEV-OFFALLOWLIST", "status": "BACKLOG", "next_agent": "agent-father", "supervised": false, "plan_only": true },
      { "id": "R-BACKLOG-XOR-WRAPPER", "status": "BACKLOG", "next_agent": "developer", "supervised": true, "plan_only": false, "children": ["R-CHILD-1"] },
      { "id": "S-BACKLOG-XOR-DEPS-UNSATISFIED", "status": "BACKLOG", "next_agent": "developer", "supervised": true, "plan_only": false, "depends_on": ["MISSING-DEP-NEVER-DONE"] },
      { "id": "T-BACKLOG-BOTH-FLAGS-DEVROLE", "status": "BACKLOG", "next_agent": "developer", "supervised": true, "plan_only": true }
    ],
    "ready": [
      { "id": "H-SUP-ONLY",           "supervised": true,  "plan_only": false },
      { "id": "I-PLANONLY-ONLY",      "supervised": false, "plan_only": true },
      { "id": "J-SLS-CLAIM-TERRITORY","supervised": true,  "plan_only": true },
      { "id": "K-RLC-TERRITORY",      "supervised": false, "plan_only": false },
      { "id": "L-READY-WRAPPER",      "supervised": true,  "plan_only": false, "children": ["L-CHILD-1"] }
    ]
  }
}
JSON

ALLOWLIST='["architect","ba","pm","po","agents-architect"]'

RESULT=$(jq -c \
  --argjson allowlist "$ALLOWLIST" \
  --slurpfile detail "$WORK/detail.json" \
  --slurpfile archive "$WORK/archive.json" \
  -L scripts/lib \
  'include "devteam-eligibility"; include "po-manual-dispatch-eligibility";
   (detail_items_from($detail)) as $detail_items
   | dep_status_map($archive) as $status_map
   | { backlog: [ .task_board.backlog[] | {id,
         stranded: (. | is_drs_stranded_off_allowlist($detail_items; $status_map; $allowlist)),
         backlog_xor_gap: (. | is_backlog_xor_gap($detail_items; $status_map))} ],
       ready:   [ .task_board.ready[]   | {id, xor_gap:  (. | is_ready_xor_gap($detail_items))} ] }' \
  "$WORK/fixture.json")

check() {
  local label="$1" got="$2" want="$3"
  if [ "$got" != "$want" ]; then
    echo "FAIL: $label — got=$got want=$want" >&2
    fail=1
  else
    echo "[OK] $label -> $got"
  fi
}

check "A-OFFLIST-POSITIVE (off-allowlist non-dev, no other exclusion) is_drs_stranded_off_allowlist" \
  "$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="A-OFFLIST-POSITIVE") | .stranded')" "true"
check "B-ALLOWLISTED (on-allowlist -> DRS's own territory, not stranded)" \
  "$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="B-ALLOWLISTED") | .stranded')" "false"
check "C-DEV-ROLE (BOUNDED-1's territory, not this predicate's)" \
  "$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="C-DEV-ROLE") | .stranded')" "false"
check "D-SLS-TERRITORY (supervised&&plan_only both true, excluded even though off-allowlist)" \
  "$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="D-SLS-TERRITORY") | .stranded')" "false"
check "E-EPIC-WRAPPER (no-picker-by-design class, closed by autoclose sweep)" \
  "$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="E-EPIC-WRAPPER") | .stranded')" "false"
check "F-DEPS-UNSATISFIED (conservative-skip until depends_on clears)" \
  "$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="F-DEPS-UNSATISFIED") | .stranded')" "false"

# --- BACKLOG-XOR-GAP (FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER, 2026-08-07) ---
check "N-BACKLOG-XOR-DEVROLE (sup-only, dev-role next_agent -- zero picker before this fix) is_backlog_xor_gap" \
  "$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="N-BACKLOG-XOR-DEVROLE") | .backlog_xor_gap')" "true"
check "O-BACKLOG-XOR-NO-NEXTAGENT (plan_only-only, next_agent absent, owner non-dev -- zero picker) is_backlog_xor_gap" \
  "$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="O-BACKLOG-XOR-NO-NEXTAGENT") | .backlog_xor_gap')" "true"
check "P-BACKLOG-XOR-NONDEV-ALLOWLISTED (sup-only, non-dev allowlisted next_agent -- already DRS-eligible, must NOT double-count into backlog_xor_gap)" \
  "$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="P-BACKLOG-XOR-NONDEV-ALLOWLISTED") | .backlog_xor_gap')" "false"
check "Q-BACKLOG-XOR-NONDEV-OFFALLOWLIST (plan_only-only, non-dev off-allowlist next_agent -- already DRS-STRANDED-OFF-ALLOWLIST territory, must NOT double-count into backlog_xor_gap)" \
  "$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="Q-BACKLOG-XOR-NONDEV-OFFALLOWLIST") | .backlog_xor_gap')" "false"
check "R-BACKLOG-XOR-WRAPPER (sup-only + dev-role but epic wrapper -- no-picker-by-design, not this predicate's)" \
  "$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="R-BACKLOG-XOR-WRAPPER") | .backlog_xor_gap')" "false"
check "S-BACKLOG-XOR-DEPS-UNSATISFIED (sup-only + dev-role but depends_on unmet -- conservative-skip)" \
  "$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="S-BACKLOG-XOR-DEPS-UNSATISFIED") | .backlog_xor_gap')" "false"
check "T-BACKLOG-BOTH-FLAGS-DEVROLE (both flags true -- SLS-promote's own territory, not the XOR gap)" \
  "$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="T-BACKLOG-BOTH-FLAGS-DEVROLE") | .backlog_xor_gap')" "false"
check "C-DEV-ROLE (no sup/po flags at all -- BOUNDED-1's territory, not the XOR gap)" \
  "$(echo "$RESULT" | jq -r '.backlog[] | select(.id=="C-DEV-ROLE") | .backlog_xor_gap')" "false"

check "H-SUP-ONLY (ready[] sup-only, non-wrapper) is_ready_xor_gap" \
  "$(echo "$RESULT" | jq -r '.ready[] | select(.id=="H-SUP-ONLY") | .xor_gap')" "true"
check "I-PLANONLY-ONLY (ready[] plan_only-only, non-wrapper)" \
  "$(echo "$RESULT" | jq -r '.ready[] | select(.id=="I-PLANONLY-ONLY") | .xor_gap')" "true"
check "J-SLS-CLAIM-TERRITORY (both flags true, SLS-claim PRIMARY/FALLBACK territory)" \
  "$(echo "$RESULT" | jq -r '.ready[] | select(.id=="J-SLS-CLAIM-TERRITORY") | .xor_gap')" "false"
check "K-RLC-TERRITORY (neither flag, RLC's territory)" \
  "$(echo "$RESULT" | jq -r '.ready[] | select(.id=="K-RLC-TERRITORY") | .xor_gap')" "false"
check "L-READY-WRAPPER (XOR flags but epic wrapper -> no-picker-by-design)" \
  "$(echo "$RESULT" | jq -r '.ready[] | select(.id=="L-READY-WRAPPER") | .xor_gap')" "false"

# --- IDEMPOTENCY + RE-ADMISSION: replay the FULL Step 1 selection (predicate
# + flag_reentrant guard, byte-identical to Step 1's own inline def) ---
# G-ALREADY-FLAGGED and M-STALE-FLAGGED-REENTRANT both satisfy
# is_drs_stranded_off_allowlist on their own (same shape as A) — they differ
# ONLY in how old their po_manual_dispatch_flagged_at stamp is. G's is FRESH
# (5min old, inside $STALE_SECONDS) -> MUST stay excluded (negative control,
# unchanged from before the bounded re-admission fix). M's is STALE ($STALE_
# SECONDS + 1h old) -> MUST be re-admitted as a candidate (positive control
# for the fix itself — this is the check that would have failed before it).
manual_dispatch_step1_selected_count() {
  local id="$1"
  jq -r \
    --argjson now_epoch "$NOW_EPOCH" \
    --argjson stale_seconds "$STALE_SECONDS" \
    --argjson allowlist "$ALLOWLIST" \
    --arg id "$id" \
    --slurpfile detail "$WORK/detail.json" \
    --slurpfile archive "$WORK/archive.json" \
    -L scripts/lib \
    'include "devteam-eligibility"; include "po-manual-dispatch-eligibility";
     def flag_reentrant($now_epoch; $stale_seconds):
       (.po_manual_dispatch_flagged_at // "") as $flagged
       | ($flagged == "")
         or (try (($now_epoch - ($flagged | fromdateiso8601)) > $stale_seconds) catch false);
     (detail_items_from($detail)) as $detail_items
     | dep_status_map($archive) as $status_map
     | [ .task_board.backlog[]
         | select(.id == $id)
         | select(.status == "BACKLOG" or .status == "TODO")
         | select(. | is_drs_stranded_off_allowlist($detail_items; $status_map; $allowlist))
         | select(. | flag_reentrant($now_epoch; $stale_seconds))
       ] | length' \
    "$WORK/fixture.json"
}

G_SELECTED=$(manual_dispatch_step1_selected_count "G-ALREADY-FLAGGED")
check "G-ALREADY-FLAGGED (fresh stamp, ${STALE_SECONDS}s window) excluded by Step 1's flag_reentrant guard despite satisfying the raw predicate" \
  "$G_SELECTED" "0"

M_SELECTED=$(manual_dispatch_step1_selected_count "M-STALE-FLAGGED-REENTRANT")
check "M-STALE-FLAGGED-REENTRANT (stamp older than ${STALE_SECONDS}s, still BACKLOG) RE-ADMITTED by Step 1's flag_reentrant guard — the bounded re-admission positive control" \
  "$M_SELECTED" "1"

# Same end-to-end replay for the 2026-08-07 BACKLOG-XOR-GAP class (Step 1's
# 2nd backlog[] branch) — unflagged N-BACKLOG-XOR-DEVROLE must be selected.
manual_dispatch_step1_backlogxor_selected_count() {
  local id="$1"
  jq -r \
    --argjson now_epoch "$NOW_EPOCH" \
    --argjson stale_seconds "$STALE_SECONDS" \
    --arg id "$id" \
    --slurpfile detail "$WORK/detail.json" \
    --slurpfile archive "$WORK/archive.json" \
    -L scripts/lib \
    'include "devteam-eligibility"; include "po-manual-dispatch-eligibility";
     def flag_reentrant($now_epoch; $stale_seconds):
       (.po_manual_dispatch_flagged_at // "") as $flagged
       | ($flagged == "")
         or (try (($now_epoch - ($flagged | fromdateiso8601)) > $stale_seconds) catch false);
     (detail_items_from($detail)) as $detail_items
     | dep_status_map($archive) as $status_map
     | [ .task_board.backlog[]
         | select(.id == $id)
         | select(.status == "BACKLOG" or .status == "TODO")
         | select(. | is_backlog_xor_gap($detail_items; $status_map))
         | select(. | flag_reentrant($now_epoch; $stale_seconds))
       ] | length' \
    "$WORK/fixture.json"
}

N_SELECTED=$(manual_dispatch_step1_backlogxor_selected_count "N-BACKLOG-XOR-DEVROLE")
check "N-BACKLOG-XOR-DEVROLE (unflagged) SELECTED by Step 1's 2nd backlog[] branch (is_backlog_xor_gap + flag_reentrant) end-to-end" \
  "$N_SELECTED" "1"

echo ""
if [ "$fail" -eq 0 ]; then
  echo "PASS: manual-dispatch-sweep producer is documented (routed from main.md), its shared predicates (scripts/lib/po-manual-dispatch-eligibility.jq: is_drs_stranded_off_allowlist, is_backlog_xor_gap, is_ready_xor_gap) resolve every named Lane × Gate Coverage Matrix branch correctly (including the 2026-08-07 BACKLOG-XOR-GAP class and its disjointness from DRS-STRANDED-OFF-ALLOWLIST), its bounded re-admission guard (flag_reentrant) excludes fresh-flagged rows, and re-admits stale-flagged-but-still-undispatched rows."
  exit 0
else
  echo "FAIL: see above."
  exit 1
fi
