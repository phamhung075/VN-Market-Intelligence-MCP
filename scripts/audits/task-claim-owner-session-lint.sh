#!/usr/bin/env bash
# scripts/audits/task-claim-owner-session-lint.sh — FIX-TASKCLAIM-OWNER-CLIENT-SESSION-MISSING-FLEET-FLOW-DOCS
#
# CI-time guard against the root-cause defect closed by this task:
# apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts:104-110
# declares `owner_client_session: z.string()` with NO `.optional()` on
# task_claim (:82-127), task_heartbeat (:160-172), and task_release (:194-206)
# — REQUIRED, no default, sole ownership discriminator (P1-FINAL/TASK_1980).
# A flow/skill doc that documents a call to one of these 3 tools without
# `owner_client_session` anywhere in the call teaches every future reader of
# that doc to issue a call the live server rejects — the mutex/lock silently
# never engages. Two live incidents from this exact defect class (BLOCKED
# claim, and a CRITICAL signal published with no double-publish tombstone)
# are the reason this gate exists; see the owning task's decision journal.
#
# Baseline/ratchet design (NOT zero-tolerance — see docs/data/
# task-claim-owner-session-baseline.json): a full fleet-wide sweep at the time
# this gate shipped found MANY more non-compliant call sites (9 files, 23
# call sites — dev-team/ba/developer/pm/po/qa/unified-agent flows) than the
# 7 files this task was scoped to fix. Hand-fixing all of them was out of
# scope for the dispatched task (size S, 7 named files) and each carries real
# blast-radius risk if changed without deep per-flow verification. Grandfather
# them explicitly (visible, auditable, MUST shrink over time) rather than
# either (a) silently laundering them as fixed, or (b) breaking CI on ~20
# files nobody asked this task to touch. A baseline entry is keyed on the
# EXACT (file, line, snippet) triple — if the line moves or its content
# changes at all, the ratchet forces re-triage (mirrors size-lint-
# justification.sh's "touched grandfathered file got worse -> FAIL" rule).
#
# Scanned set: docs/agents/**/flow/*.md, docs/agents/**/init.md,
# .claude/skills/**/SKILL.md — the LIVE PROTOCOL universe agents actually
# execute from. Deliberately EXCLUDES docs/architecture-briefs/ (historical
# design record, not re-executed), docs/agent-memory/ (notebooks/health logs,
# point-in-time), docs/handoffs/ (point-in-time specs), and
# docs/agents/tools/{list,package}/*.md (reference tables, separate concern)
# — including those would flood the gate with non-actionable historical
# false positives (verified live: dozens of pre-P1-FINAL architecture-brief
# mentions predate the owner_client_session rebind entirely).
#
# Detection: any line starting a call to task_claim/task_release/
# task_heartbeat (either `call_tool(server=..., tool="task_X", ...)` or bare
# `task_X(...)` shorthand) opens a capture window running to the next
# call-start match (exclusive) or 20 lines, whichever is first. FAIL if
# `owner_client_session` does not appear anywhere in that window.
#
# Escape hatch (mirrors size-justification:/hardcode-scan-allow: convention):
# a `task-claim-lint-allow: <reason>` comment on the matched line or the line
# immediately preceding it suppresses that one match — for a genuine
# non-call-site prose mention that happens to lexically match (e.g. a tool
# name referenced without an argument list).
#
# Usage:
#   bash scripts/audits/task-claim-owner-session-lint.sh --check    # CI mode: exit 0 pass / 1 fail
#   bash scripts/audits/task-claim-owner-session-lint.sh --update   # regenerate the baseline from live repo state
#
# Env overrides (test-only; unset in normal/CI use):
#   TASKCLAIM_LINT_BASELINE_OVERRIDE   default: $PROJECT_ROOT/docs/data/task-claim-owner-session-baseline.json
#   TASKCLAIM_LINT_INCLUDE_OVERRIDE    space-separated git pathspecs — lets tests scope the scan to a
#                                       disposable untracked fixture file instead of the whole repo
#
# Owning flow: docs/policies/dev-standards.md § Script Persistence
# Detail ref: task FIX-TASKCLAIM-OWNER-CLIENT-SESSION-MISSING-FLEET-FLOW-DOCS
set -u

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "[task-claim-lint] ERROR cannot resolve PROJECT_ROOT"; exit 2; }
cd "$PROJECT_ROOT" || exit 2

command -v jq >/dev/null 2>&1 || { echo "[task-claim-lint] ERROR jq not found on PATH"; exit 2; }

BASELINE_FILE="${TASKCLAIM_LINT_BASELINE_OVERRIDE:-$PROJECT_ROOT/docs/data/task-claim-owner-session-baseline.json}"
WINDOW=20
CALL_START_ERE='(^|[^A-Za-z0-9_])task_claim\(|(^|[^A-Za-z0-9_])task_release\(|(^|[^A-Za-z0-9_])task_heartbeat\(|tool[=:][[:space:]]*"task_claim"|tool[=:][[:space:]]*"task_release"|tool[=:][[:space:]]*"task_heartbeat"'

if [ -n "${TASKCLAIM_LINT_INCLUDE_OVERRIDE:-}" ]; then
  # shellcheck disable=SC2206
  INCLUDE_PATHSPECS=($TASKCLAIM_LINT_INCLUDE_OVERRIDE)
else
  INCLUDE_PATHSPECS=('docs/agents/*/flow/*.md' 'docs/agents/*/init.md' '.claude/skills/*/SKILL.md')
fi

usage() {
  echo "Usage: $0 --check | --update"
}

list_files() {
  git ls-files --cached --others --exclude-standard -- "${INCLUDE_PATHSPECS[@]}" 2>/dev/null || true
}

# has_suppression <file> <lineno> — 0 (true) iff the SAME line or the
# immediately PRECEDING line carries a `task-claim-lint-allow:` comment.
has_suppression() {
  local f="$1" ln="$2" prev
  sed -n "${ln}p" "$f" 2>/dev/null | grep -q 'task-claim-lint-allow:' && return 0
  prev=$((ln - 1))
  if [ "$prev" -ge 1 ]; then
    sed -n "${prev}p" "$f" 2>/dev/null | grep -q 'task-claim-lint-allow:' && return 0
  fi
  return 1
}

# find_violations <file> — prints "lineno<TAB>snippet" for every non-compliant
# call site in $1 (before baseline/suppression filtering).
find_violations() {
  local f="$1" total_lines match_lines ln end window_text next_match
  total_lines="$(wc -l < "$f" 2>/dev/null | tr -d ' ')"
  [ -z "$total_lines" ] && return 0
  match_lines="$(grep -nE "$CALL_START_ERE" "$f" 2>/dev/null | cut -d: -f1)"
  [ -z "$match_lines" ] && return 0

  for ln in $match_lines; do
    has_suppression "$f" "$ln" && continue
    # window runs to the next match (exclusive) or WINDOW lines, whichever first
    next_match="$(printf '%s\n' "$match_lines" | awk -v cur="$ln" '$1>cur{print $1; exit}')"
    end=$((ln + WINDOW - 1))
    if [ -n "$next_match" ]; then
      nm_end=$((next_match - 1))
      [ "$nm_end" -lt "$end" ] && end=$nm_end
    fi
    [ "$end" -gt "$total_lines" ] && end="$total_lines"
    [ "$end" -lt "$ln" ] && end="$ln"
    window_text="$(sed -n "${ln},${end}p" "$f" 2>/dev/null)"
    if ! printf '%s' "$window_text" | grep -q 'owner_client_session'; then
      snippet="$(sed -n "${ln}p" "$f" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
      printf '%s\t%s\n' "$ln" "$snippet"
    fi
  done
}

cmd_check() {
  local total=0 fail_count=0 fail_list="" f ln snippet found
  local baseline_tsv
  baseline_tsv="$(mktemp 2>/dev/null || echo "/tmp/task-claim-lint-baseline-$$.tsv")"
  trap 'rm -f "$baseline_tsv"' RETURN
  if [ -f "$BASELINE_FILE" ]; then
    jq -r '.entries // [] | .[] | "\(.file)\t\(.line)\t\(.snippet)"' "$BASELINE_FILE" > "$baseline_tsv" 2>/dev/null
  else
    : > "$baseline_tsv"
  fi

  while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ -f "$f" ] || continue
    total=$((total + 1))
    while IFS=$'\t' read -r ln snippet; do
      [ -z "$ln" ] && continue
      found="$(awk -F'\t' -v p="$f" -v l="$ln" -v s="$snippet" '$1==p && $2==l && $3==s{print "1"; exit}' "$baseline_tsv" 2>/dev/null || true)"
      if [ "$found" = "1" ]; then
        continue   # grandfathered — exact (file, line, snippet) match
      fi
      fail_count=$((fail_count + 1))
      fail_list="${fail_list}${f}:${ln} — ${snippet}\n"
    done < <(find_violations "$f")
  done < <(list_files)

  if [ "$fail_count" -gt 0 ]; then
    echo "[task-claim-lint] FAIL — ${fail_count} call site(s) missing owner_client_session (scanned ${total} files):"
    printf '%b' "$fail_list"
    echo "[task-claim-lint] Fix: add owner_client_session to the call, OR if pre-existing/known-scoped debt, run --update to grandfather it explicitly (visible in docs/data/task-claim-owner-session-baseline.json)."
    return 1
  fi
  echo "[task-claim-lint] PASS — 0 new offenders (scanned ${total} files; baseline carries $(wc -l < "$baseline_tsv" | tr -d ' ') grandfathered site(s))"
  return 0
}

cmd_update() {
  local f entries="[]" tmp
  tmp="$(mktemp 2>/dev/null || echo "/tmp/task-claim-lint-update-$$.json")"
  echo "[" > "$tmp"
  local first=1
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ -f "$f" ] || continue
    while IFS=$'\t' read -r ln snippet; do
      [ -z "$ln" ] && continue
      [ "$first" -eq 0 ] && echo "," >> "$tmp"
      first=0
      jq -n --arg file "$f" --argjson line "$ln" --arg snippet "$snippet" \
        '{file:$file, line:$line, snippet:$snippet}' >> "$tmp"
    done < <(find_violations "$f")
  done < <(list_files)
  echo "]" >> "$tmp"
  entries="$(jq -s 'add' "$tmp" 2>/dev/null)"
  [ -z "$entries" ] && entries="[]"
  rm -f "$tmp"

  jq -n --argjson entries "$entries" \
    '{_generated_by: "scripts/audits/task-claim-owner-session-lint.sh --update",
      _note: "Per-call-site grandfather baseline for scripts/audits/task-claim-owner-session-lint.sh --check. Keyed on the EXACT (file, line, snippet) triple — any edit to a grandfathered line forces re-triage (ratchet, not silence). Entries drop automatically on the next --update once a call site gains owner_client_session.",
      _ssot: "docs/data/task-claim-owner-session-baseline.json",
      count: ($entries | length),
      entries: $entries}' > "$BASELINE_FILE"
  echo "[task-claim-lint] baseline updated — $(jq '.count' "$BASELINE_FILE") site(s) recorded in $BASELINE_FILE"
}

case "${1:-}" in
  --check) cmd_check; exit $? ;;
  --update) cmd_update; exit $? ;;
  *) usage; exit 2 ;;
esac
