#!/usr/bin/env bash
# scripts/audits/guard-signal-type-coverage.sh
#
# Regression verifier for docs/agents/po/flow/triage-signals.md § Regression
# verifier — signal-type coverage guard (`guard_signal_type_coverage`).
#
# ROOT CAUSE THIS SCRIPT ORIGINALLY FIXED (FIX-SIGNAL-ROUTING-ROWS-COVERAGE-
# GAP-DEEPDIVE, 2026-08-22): the guard existed ONLY as a bash function
# embedded inline in the flow-doc's markdown — wired into NO CI job and NO
# cron, so nothing ever executed it. Its last recorded PASS was 2026-08-01;
# by 2026-08-22 the live `to==po` type namespace had fully rotated
# underneath it (5 new detector types — auditor_cycle_loss,
# auditor_cycle_missing, cron_fire_gap, db_freshness, narrative_contradiction
# — none in the old hardcoded array, 10/10 hot rows unrouted) and nobody
# noticed for 3 weeks because the check was pure prose, never actually run.
# This script IS the same check, extracted to an executable file and wired
# into .github/workflows/ci.yml (`signal-type-coverage-guard` job) so it
# runs on every push/PR that touches the tracked files below.
#
# EXTENDED (TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY, 2026-08-23 — architect brief
# docs/architecture-briefs/2026-08-23-signal-type-registry-open-namespace-
# vs-closed-allowlist.md, decision (b): registry-derived routing +
# self-filing fallback; direction (a), a closed z.enum() on
# SignalRowSchema.type/.severity, was measured and rejected — see the
# brief §2). apps/mcp-server/src/infrastructure/orchStateSchema.ts is
# DELIBERATELY UNTOUCHED by this task. Three structural gaps closed:
#
#   1. DUAL-PIPELINE PARSING (previously Pipeline B only — Pipeline A had
#      ZERO machine coverage). This script now ALSO parses Pipeline-A's
#      routing table in docs/agents/po/flow/triage-signals.md ("For each
#      signal in `pendingSignals[]` (Pipeline A):" section) and checks it
#      against the live `.dev_team_idle_chain.pending_triage_inbox[]` array.
#      CORRECTION to this script's original SCOPE note (removed below):
#      Pipeline A's live source is NOT a gitignored `docs/signals/
#      signals.db` — that was a stale assumption about a superseded drain
#      mechanism. `pending_triage_inbox[]` lives inside
#      docs/data/orch/orch-state.json, the SAME git-tracked file Pipeline B
#      already reads, and is fully verifiable in CI.
#
#   2. PIPELINE TAGGING / CROSS-PIPELINE CHECK. Every parsed routing rule is
#      tagged by its source pipeline (A or B). A live signal is considered
#      "routed" ONLY against its OWN pipeline's tagged rule set — a type
#      with a rule ONLY in the Pipeline-A table can no longer false-pass as
#      "covered" for a Pipeline-B occurrence, or vice versa. This is the
#      exact defect class behind the 2026-08-23 CI red: `audit-handoff` had
#      a Pipeline-A rule (keyed `from=tran-ngoc-bau`) but, at the time, no
#      Pipeline-B rule; the tripping row (`tra-20260822T203234`) arrived on
#      Pipeline B and fell through unrouted despite Pipeline-A's rule
#      "existing" in the same document — the two rule sets were never
#      actually cross-checked against the pipeline the inbound signal
#      arrived on. (The tactical Pipeline-B `audit-handoff` bridge row has
#      since landed in triage-signals.md as a separate, related fix.)
#
#   3. SELF-FILING FALLBACK. On ANY unrouted type (either pipeline), in
#      ADDITION to the pre-existing `exit 1` forcing function (kept — CI red
#      has correctly driven every prior fix for this class), the guard now
#      mints (or, on a repeat occurrence, skips as already-tracked — dedup)
#      a `.task_board.backlog[]` row via the SAME `scripts/orch-apply.sh`
#      gate every other writer uses. Dedup-keyed on the type string so a
#      persistently-unrouted type produces ONE assignable work item, not a
#      duplicate per run. Uses the existing `routing-gap` type-vocabulary
#      slot (already a live signal type meaning exactly this class of
#      finding — see docs/agents/po/flow/triage-signals-longtail.md) rather
#      than inventing a new closed token — the same open-namespace
#      principle the whole brief argues for. See mint_routing_gap_row()
#      below. Mint failure (schema/conservation/prose-ceiling rejection) is
#      logged but never escalated into a second, separate hard failure —
#      the `exit 1` below is ALREADY the forcing function.
#
# NO HAND-MAINTAINED $ROUTED ARRAY: this script does not hardcode a
# duplicate allowlist for either pipeline. It PARSES the `type` column
# directly out of docs/agents/po/flow/triage-signals.md's Pipeline-A AND
# Pipeline-B sections, AND its lazy-load sibling triage-signals-longtail.md
# (Pipeline-B only). Adding a table row to either doc is now sufficient BY
# ITSELF to extend guard coverage on the corresponding pipeline; there is no
# second array to remember to edit.
#
# Usage:
#   bash scripts/audits/guard-signal-type-coverage.sh --check [orch-state-path]
#   bash scripts/audits/guard-signal-type-coverage.sh          [orch-state-path]  # same behaviour, --check optional
# Exit: 0 = pass (every live Pipeline-A + Pipeline-B type is routed on its
#       own pipeline), 1 = fail (unrouted type(s) found on either pipeline,
#       or one of the source docs could not be parsed).
#
# Env overrides (test-only; unset in normal/CI use — mirrors
# size-lint-justification.sh's SIZE_LINT_*_OVERRIDE convention, lets the
# paired .test.sh point at disposable fixture docs instead of the real,
# ever-changing production tables):
#   GUARD_SIGNAL_TRIAGE_DOC_OVERRIDE     default: docs/agents/po/flow/triage-signals.md
#   GUARD_SIGNAL_LONGTAIL_DOC_OVERRIDE   default: docs/agents/po/flow/triage-signals-longtail.md

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TRIAGE_DOC="${GUARD_SIGNAL_TRIAGE_DOC_OVERRIDE:-$REPO_ROOT/docs/agents/po/flow/triage-signals.md}"
LONGTAIL_DOC="${GUARD_SIGNAL_LONGTAIL_DOC_OVERRIDE:-$REPO_ROOT/docs/agents/po/flow/triage-signals-longtail.md}"

# First positional arg may be "--check" (CI-invocation convention shared with
# size-lint-justification.sh etc.) — accepted and ignored as a no-op flag
# since this script has only one mode. Remaining arg (if any) overrides the
# orch-state.json path (test fixtures).
ORCH_STATE="$REPO_ROOT/docs/data/orch/orch-state.json"
for arg in "$@"; do
  case "$arg" in
    --check) ;;
    *) ORCH_STATE="$arg" ;;
  esac
done

[ -f "$TRIAGE_DOC" ]    || { echo "FATAL: $TRIAGE_DOC not found" >&2; exit 1; }
[ -f "$LONGTAIL_DOC" ]  || { echo "FATAL: $LONGTAIL_DOC not found" >&2; exit 1; }
[ -f "$ORCH_STATE" ]    || { echo "FATAL: $ORCH_STATE not found" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "FATAL: jq not found in PATH" >&2; exit 1; }

# Extract the `type` column from a markdown table read on stdin. For each
# row shaped "| `sometext` ... |", take the FIRST cell (between the leading
# "| " and the next unescaped "|"), then pull out EVERY backtick-quoted
# token inside it. Handles both single-type cells ("| `foo` | ...") AND
# multi-alias cells ("| `foo` / `bar` | ..." — Pipeline-A's `brief_complete`
# / `architecture_brief` and `news_impact` / `price_anomaly` / `bctc_signal`
# / `fundamental_*` rows use the latter form; a naive single-token regex
# silently drops these). Drops the header row's literal "type" token (e.g.
# "| Signal `type` |" / "| `type` |" both reduce to bare "type").
extract_type_column() {
  grep -E '^\|[[:space:]]*`' \
    | sed -E 's/^\|([^|]*)\|.*/\1/' \
    | grep -oE '`[^`]+`' \
    | sed -E 's/`//g' \
    | grep -v '^type$' || true
}

# Pipeline-A table in triage-signals.md lives between the "For each signal
# in `pendingSignals[]` (Pipeline A):" prose line and the "## Live
# `.signal_queue.rows[]` inbox (Pipeline B, ...)" heading immediately below
# it (Pipeline A has no ## heading of its own — it is the doc's lead
# section). Scope the extraction to that range so Pipeline-B's table (same
# file, same backtick-first-column shape, different pipeline) is never
# mixed in.
pipeline_a_section() {
  awk '
    /\(Pipeline A\)/ { flag=1 }
    flag && /^## Live .*\(Pipeline B/ { exit }
    flag { print }
  ' "$TRIAGE_DOC"
}

# Pipeline-B table in triage-signals.md lives between the
# "## Live `.signal_queue.rows[]` inbox" heading and the
# "### Regression verifier" heading immediately below it — scope the
# extraction to that range so Pipeline-A's table (same file, backtick-quoted
# first column, different pipeline) is never mixed in. Additionally skips
# the "**CORRECTION ...**" measurement sub-block (a `| \`system_issue\`
# (underscore) | 20 | 86 | 6 | 112 |`-shaped stats table, NOT a routing
# table) between "**CORRECTION" and "**Dedup discipline" — without this
# exclusion its backtick-first-column data rows would be mistaken for
# routing rules and falsely mark `system_issue` (underscore) "routed" when
# no such rule actually exists (only the hyphen form `system-issue` has a
# real routing row) — exactly the false-pass class this whole task exists
# to close, so the guard must not reintroduce a narrower instance of it.
pipeline_b_section() {
  awk '
    /^## Live/ { flag=1 }
    flag && /^### Regression verifier/ { exit }
    flag && /^\*\*CORRECTION/ { skip=1 }
    flag && skip && /^\*\*Dedup discipline/ { skip=0 }
    flag && !skip { print }
  ' "$TRIAGE_DOC"
}

ROUTED_A_RAW=$(pipeline_a_section | extract_type_column)
ROUTED_B_MAIN=$(pipeline_b_section | extract_type_column)
ROUTED_B_LONGTAIL=$(extract_type_column < "$LONGTAIL_DOC")

if [ -z "$ROUTED_A_RAW" ]; then
  echo "FATAL: parsed zero types out of $TRIAGE_DOC § Pipeline-A table (\"For each signal in \`pendingSignals[]\` (Pipeline A):\") — table markup drifted, fix the parser or the table" >&2
  exit 1
fi
if [ -z "$ROUTED_B_MAIN" ]; then
  echo "FATAL: parsed zero types out of $TRIAGE_DOC § Live .signal_queue.rows[] inbox — table markup drifted, fix the parser or the table" >&2
  exit 1
fi

ROUTED_A_JSON=$(printf '%s\n' "$ROUTED_A_RAW" | grep -v '^[[:space:]]*$' | sort -u | jq -R . | jq -s .)
ROUTED_B_JSON=$(printf '%s\n%s\n' "$ROUTED_B_MAIN" "$ROUTED_B_LONGTAIL" | grep -v '^[[:space:]]*$' | sort -u | jq -R . | jq -s .)

# Pipeline A: `.dev_team_idle_chain.pending_triage_inbox[]` — PO's own
# durable inbox (docs/agents/po/flow/triage-signals.md's "Two sanctioned
# invocation paths" preamble: PO reads this array fresh on every
# invocation, never a caller-supplied argument). Not filtered by `to` — the
# doc's own Pipeline-A loop ("For each signal in `pendingSignals[]`") is
# unconditional; the table's own catch-all "any unknown `type`" row is a
# process-level (human/agent-judgment) fallback, not a machine-checkable
# rule, and is deliberately NOT extracted as a wildcard by
# extract_type_column above — the guard's job is to force an explicit table
# row (or a deliberate doc update) for real drift, same discipline already
# applied to Pipeline B.
UNROUTED_A=$(jq -c --argjson routed "$ROUTED_A_JSON" '
  [.dev_team_idle_chain.pending_triage_inbox[]? | .type] | map(select(. != null)) | unique
  | map(select(. as $t | ($routed | index($t)) == null))
' "$ORCH_STATE")

UNROUTED_B=$(jq -c --argjson routed "$ROUTED_B_JSON" '
  [.signal_queue.rows[]? | select(.to=="po") | .type] | map(select(. != null)) | unique
  | map(select(. as $t | ($routed | index($t)) == null))
' "$ORCH_STATE")

LIVE_COUNT_A=$(jq '[.dev_team_idle_chain.pending_triage_inbox[]? | .type] | map(select(. != null)) | unique | length' "$ORCH_STATE")
LIVE_COUNT_B=$(jq '[.signal_queue.rows[]? | select(.to=="po") | .type] | map(select(. != null)) | unique | length' "$ORCH_STATE")

# ─── Self-filing fallback (Part 2 of the architect brief) ───────────────────
# On an unrouted type, mint (new) or skip-as-already-tracked (repeat — dedup
# by design, "updates the existing row" in the sense that it stays the SAME
# single row rather than duplicating) a `.task_board.backlog[]` row via the
# same `orch-apply.sh` gate every other writer uses. ORCH_APPLY_LIVE_FILE_
# OVERRIDE is set to `$ORCH_STATE` itself — a no-op in normal/CI use (where
# $ORCH_STATE already IS the default live-file path orch-apply.sh would
# target anyway) and the mechanism that lets the paired .test.sh mint into a
# disposable fixture instead of the real file, matching the read-side
# GUARD_SIGNAL_*_DOC_OVERRIDE convention above.
mint_routing_gap_row() {
  local type="$1" pipeline="$2"
  local dedup_key="signal-type-registry-gap:${type}"

  local already_tracked
  already_tracked=$(jq -r --arg dk "$dedup_key" '
    [.task_board.backlog[]?, .task_board.ready[]?, .task_board.in_progress[]?,
     .task_board.review[]?, .task_board.qa[]?]
    | any(.dedup_key == $dk)
  ' "$ORCH_STATE" 2>/dev/null)

  if [ "$already_tracked" = "true" ]; then
    echo "[guard-signal-type-coverage] backlog row already tracks type=${type} (dedup_key=${dedup_key}) — no duplicate minted" >&2
    return 0
  fi

  local slug id now
  slug=$(printf '%s' "$type" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9' '-' | sed -E 's/-+/-/g; s/^-|-$//g')
  id="FIX-SIGNAL-TYPE-ROUTING-GAP-${slug}"
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  local candidate
  candidate=$(jq \
    --arg id "$id" \
    --arg title "Unrouted signal type '${type}' (Pipeline ${pipeline}) — no table row in docs/agents/po/flow/triage-signals.md" \
    --arg dedup_key "$dedup_key" \
    --arg now "$now" \
    --arg note "AC: bash scripts/audits/guard-signal-type-coverage.sh --check reports type=${type} routed on Pipeline ${pipeline} (a matching table row exists in triage-signals.md's own Pipeline-${pipeline} section, or the longtail sibling for Pipeline B). Auto-filed by scripts/audits/guard-signal-type-coverage.sh — see docs/architecture-briefs/2026-08-23-signal-type-registry-open-namespace-vs-closed-allowlist.md." \
    '.task_board.backlog = ((.task_board.backlog // []) + [{
       id: $id, type: "routing-gap", status: "BACKLOG", priority: "P1",
       owner: "agent-father", next_agent: "agent-father", zone: "cross-service/",
       title: $title, dedup_key: $dedup_key,
       created_at: $now, status_note: $note
     }])' "$ORCH_STATE" 2>/dev/null) || {
    echo "[guard-signal-type-coverage] mint jq-transform FAILED for type=${type} — orch-state.json unreadable/malformed" >&2
    return 1
  }

  local apply_out apply_rc
  apply_out=$(printf '%s' "$candidate" | ORCH_APPLY_LIVE_FILE_OVERRIDE="$ORCH_STATE" bash "$REPO_ROOT/scripts/orch-apply.sh" 2>&1)
  apply_rc=$?
  printf '%s\n' "$apply_out" >&2
  if [ "$apply_rc" -eq 0 ]; then
    echo "[guard-signal-type-coverage] mint OK — ${id} filed (dedup_key=${dedup_key}, Pipeline ${pipeline})" >&2
  else
    echo "[guard-signal-type-coverage] mint FAILED (orch-apply.sh exit ${apply_rc}) for type=${type} — CI-log exit 1 below remains the record of this gap" >&2
  fi
}

FAIL=0

if [ "$UNROUTED_A" != "[]" ]; then
  echo "[guard-signal-type-coverage] FAIL — unrouted Pipeline-A types (dev_team_idle_chain.pending_triage_inbox[]): $UNROUTED_A" >&2
  echo "[guard-signal-type-coverage] add a table row to docs/agents/po/flow/triage-signals.md's Pipeline-A section (\"For each signal in \`pendingSignals[]\` (Pipeline A):\") for each type above." >&2
  FAIL=1
  while IFS= read -r t; do
    [ -n "$t" ] && mint_routing_gap_row "$t" "A"
  done < <(echo "$UNROUTED_A" | jq -r '.[]')
fi

if [ "$UNROUTED_B" != "[]" ]; then
  echo "[guard-signal-type-coverage] FAIL — unrouted Pipeline-B to=po types: $UNROUTED_B" >&2
  echo "[guard-signal-type-coverage] add a table row to docs/agents/po/flow/triage-signals.md (§ Live .signal_queue.rows[] inbox) or its longtail sibling for each type above." >&2
  FAIL=1
  while IFS= read -r t; do
    [ -n "$t" ] && mint_routing_gap_row "$t" "B"
  done < <(echo "$UNROUTED_B" | jq -r '.[]')
fi

if [ "$FAIL" -eq 1 ]; then
  exit 1
fi

echo "[guard-signal-type-coverage] PASS — Pipeline A: $LIVE_COUNT_A live type(s) routed ($(echo "$ROUTED_A_JSON" | jq 'length') known) | Pipeline B: $LIVE_COUNT_B live to=po type(s) routed ($(echo "$ROUTED_B_JSON" | jq 'length') known)"
exit 0
