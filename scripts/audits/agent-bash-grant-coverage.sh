#!/usr/bin/env bash
# scripts/audits/agent-bash-grant-coverage.sh — FIX-AGENT-BASH-GRANT-COVERAGE-GATE-FLOW-DEMANDS-VS-FRONTMATTER
#
# Root-cause gate for a recurring bug class: an agent's docs/agents/<id>/**/*.md
# flow corpus mandates a Bash-only step (git add/commit/push for a commit-mutex
# notebook persist, or a `bash scripts/*.sh` invocation) while that agent's OWN
# .claude/agents/<id>.md `tools:` frontmatter line does not grant Bash — the
# agent cannot execute its own documented flow. Verified live and root-caused
# on digest-predict (docs/agents/digest-predict/flow/daily-predict.md:126-131 +
# monday.md:82-87) and, with real production impact (irreversible loss of a
# full-overwrite notebook cycle, c129 on tran-ngoc-bau, rescued only by manual
# PO commit 935da25e3), on tran-ngoc-bau. 4 prior point-fix rows patched one
# agent each (alert-commander, market-watcher, news-scout, digest-predict) with
# NO mechanism stopping the 5th/6th/7th recurrence — this script is that
# mechanism, wired into CI so the class cannot regress silently again.
#
# ---------------------------------------------------------------------------
# CHECK 1 — Bash-grant vs Bash-demand (AC-1/AC-2)
# ---------------------------------------------------------------------------
# For every agent id (every `.claude/agents/<id>.md`), derive whether its flow
# corpus (docs/agents/<id>/**/*.md, plus any .claude/skills/<name>/SKILL.md it
# references) contains a Bash-only step — textual match on:
#   `bash scripts/` | `git add` | `git commit` | `git push` | `commit-mutex`
#   | `commit-boundary`
# — and assert the agent's `tools:` line grants Bash IFF that match exists.
#
# OPT-IN, NEVER OPT-OUT (AC-2): the predicate is DERIVED per-agent from that
# agent's own corpus text — never a hardcoded "these agents need Bash" list.
# This is why e.g. idea-forge/market-analyst/qa-responder (thought likely
# Bash-free-by-design when this row was triaged) turned out to genuinely
# reference `git add`/`git commit` under commit-mutex in their own flow docs
# and were granted Bash accordingly — the gate's mechanical derivation
# overrides any prior hand-wave, in either direction.
#
# Scope note — MISSING-grant direction only, not a general OVER-grant audit:
# this script does NOT flag every already-Bash-granted agent whose corpus
# lacks a literal match (e.g. architect/ba/dev-rag-service/dev-stock-price and
# ~10 other developer-class agents hold Bash for build/test/deploy tooling
# that is real but not textually expressed as `git add`/`commit-mutex` in
# their thin per-agent docs). Auditing whether every already-granted Bash use
# is independently justified is a distinct, unscoped concern with no evidence
# base in this task; building it here would flood the gate with false
# positives across ~20 legitimate developer agents. AC-2's "must not be
# blanket-granted" concern is satisfied structurally: no agent gets Bash
# unless ITS OWN corpus demonstrates the need.
#
# ---------------------------------------------------------------------------
# CHECK 2 — description vs tools self-consistency (AC-8, po_scope_addendum_20260806T0752)
# ---------------------------------------------------------------------------
# Independent axis, same script: the frontmatter `description:` prose must not
# contradict the frontmatter `tools:` line of the SAME file. Concretely: a
# description asserting "No other filesystem writes permitted" is falsified
# the moment `tools:` grants Bash (Bash is not filesystem-write-scoped — it
# can write anywhere). Mechanical derivation, not an allowlist of named
# agents: the addendum's own live positive control named 3 agents
# (alert-commander/market-watcher/news-scout); this script's derivation found
# 2 more (fb-market-poster, orch-sentinel) that manual review missed — all 5
# fixed in the same task that shipped this gate, plus the 3 new Bash grants
# from CHECK 1 that would otherwise have introduced the identical
# contradiction on day one (digest-predict/qa-responder/unified-agent).
#
# ---------------------------------------------------------------------------
# Baseline/ratchet (grandfather), NOT an opt-out allowlist
# ---------------------------------------------------------------------------
# Mirrors scripts/audits/task-claim-owner-session-lint.sh /
# scripts/audits/size-lint-justification.sh: a full fleet sweep can surface a
# mismatch that is ALREADY diagnosed and owned by a DIFFERENT, distinct row
# (bctc-analyst: FIX-BCTC-ANALYST-STAGELOG-NOTIFY-NO-BASH, BACKLOG as of this
# gate's authoring — that row's own resolution is a flow-doc rewrite removing
# the Bash step, NOT a grant, so this gate must not pre-empt it). Such a
# finding is recorded EXPLICITLY and NARROWLY in the baseline file (visible,
# auditable, keyed on agent+check — never silently swallowed) so --check still
# exits 0, while any OTHER/NEW agent hitting the same predicate still FAILS
# loud. This is unrelated to AC-2's "not an allowlist" rule, which governs the
# DERIVATION of which agents need Bash (mechanical, per-corpus) — not the
# bookkeeping of already-triaged, separately-owned debt.
#
# Usage:
#   bash scripts/audits/agent-bash-grant-coverage.sh --check    # CI mode: exit 0 pass / 1 fail
#   bash scripts/audits/agent-bash-grant-coverage.sh --update   # regenerate the baseline from live repo state
#
# Env overrides (test-only; unset in normal/CI use):
#   AGENT_BASH_GATE_AGENTS_DIR_OVERRIDE   default: $PROJECT_ROOT/.claude/agents
#   AGENT_BASH_GATE_FLOW_ROOT_OVERRIDE    default: $PROJECT_ROOT/docs/agents
#   AGENT_BASH_GATE_SKILLS_ROOT_OVERRIDE  default: $PROJECT_ROOT/.claude/skills
#   AGENT_BASH_GATE_BASELINE_OVERRIDE     default: $PROJECT_ROOT/docs/data/agent-bash-grant-coverage-baseline.json
#
# Owning flow: docs/policies/dev-standards.md § Script Persistence
# Detail ref: task FIX-AGENT-BASH-GRANT-COVERAGE-GATE-FLOW-DEMANDS-VS-FRONTMATTER
set -u

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "[bash-grant-gate] ERROR cannot resolve PROJECT_ROOT"; exit 2; }
cd "$PROJECT_ROOT" || exit 2

command -v jq >/dev/null 2>&1 || { echo "[bash-grant-gate] ERROR jq not found on PATH"; exit 2; }
command -v perl >/dev/null 2>&1 || { echo "[bash-grant-gate] ERROR perl not found on PATH (required for negation-aware demand detection)"; exit 2; }

AGENTS_DIR="${AGENT_BASH_GATE_AGENTS_DIR_OVERRIDE:-$PROJECT_ROOT/.claude/agents}"
FLOW_ROOT="${AGENT_BASH_GATE_FLOW_ROOT_OVERRIDE:-$PROJECT_ROOT/docs/agents}"
SKILLS_ROOT="${AGENT_BASH_GATE_SKILLS_ROOT_OVERRIDE:-$PROJECT_ROOT/.claude/skills}"
BASELINE_FILE="${AGENT_BASH_GATE_BASELINE_OVERRIDE:-$PROJECT_ROOT/docs/data/agent-bash-grant-coverage-baseline.json}"

DEMAND_ERE='bash scripts/|git add|git commit|git push|commit-mutex|commit-boundary'
DESC_CLAIM_ERE='No other filesystem writes permitted'

# NEGATION GUARD (FIX-BASHGRANT-GATE-NEGATED-GIT-COMMIT-PHRASE-FALSE-POSITIVE)
# ---------------------------------------------------------------------------
# DEMAND_ERE is a bare substring match — it fires identically whether a line
# DEMANDS an action ("git commit -m ...") or explicitly asserts its ABSENCE
# ("no per-line git commit"). Root-caused on refine_bctc_md: the fleet-wide
# debug-logger-protocol boilerplate (commit baa91292c) landed the phrase
# "no per-line git commit" in every agent's init.md, and it was refine_bctc_md's
# ONLY corpus hit — a pure false positive (the agent genuinely demands no
# Bash; every other agent's identical phrase is masked by a real, separate
# Bash grant so it never surfaced as a mismatch there).
# demand_is_negated() below is a GENERAL guard for the whole class, not a
# one-off exclusion for this exact string: it strips any DEMAND_ERE
# occurrence that is immediately preceded (within up to 2 short filler
# tokens — enough for "no per-line git commit" or "No commit-mutex", not
# enough for e.g. "not only the two files this step's own `git add`") by a
# negation trigger (no/not/never/without/none). A line with even ONE
# un-negated occurrence still counts as real demand evidence — e.g. "RULE 1:
# git add <named files only> — NEVER git add -A or git add ." still demands
# git add via its first, un-negated clause.

usage() { echo "Usage: $0 --check | --update"; }

list_agent_ids() {
  [ -d "$AGENTS_DIR" ] || return 0
  for f in "$AGENTS_DIR"/*.md; do
    [ -f "$f" ] || continue
    basename "$f" .md
  done
}

# tools_line <id> — prints the raw `tools:` frontmatter line (empty if absent)
tools_line() {
  local id="$1"
  grep -m1 '^tools:' "$AGENTS_DIR/$id.md" 2>/dev/null
}

# has_bash_grant <id> — 0 (true) iff the tools: line grants Bash as a
# comma-separated token (word-boundary — never matches e.g. a hypothetical
# "Bashful" tool name).
has_bash_grant() {
  local id="$1" line
  line="$(tools_line "$id")"
  [ -z "$line" ] && return 1
  printf '%s\n' "$line" | grep -qE '(^|[^A-Za-z0-9_])Bash([^A-Za-z0-9_]|$)'
}

# frontmatter_block <id> — prints the YAML frontmatter body (between the
# first two `---` lines), so multi-line `description: >` blocks are captured
# whole for CHECK 2's phrase search.
frontmatter_block() {
  local id="$1"
  awk '/^---[[:space:]]*$/{c++; next} c==1' "$AGENTS_DIR/$id.md" 2>/dev/null
}

# desc_has_no_other_writes_claim <id> — 0 (true) iff the frontmatter block
# contains the absolute "No other filesystem writes permitted" claim.
desc_has_no_other_writes_claim() {
  local id="$1"
  frontmatter_block "$id" | grep -qiE "$DESC_CLAIM_ERE"
}

# flow_corpus_files <id> — every *.md under docs/agents/<id>/ (init.md +
# flow/**/*.md), plus every .claude/skills/<name>/SKILL.md referenced inside
# them (AC-1: "flow corpus ... and any .claude/skills/*/SKILL.md it routes
# to"). One path per line, deduplicated.
flow_corpus_files() {
  local id="$1"
  local dir="$FLOW_ROOT/$id" base_files skill_names skill_name
  [ -d "$dir" ] || return 0
  base_files="$(find "$dir" -type f -name '*.md' 2>/dev/null)"
  printf '%s\n' "$base_files"
  skill_names="$(printf '%s\n' "$base_files" | xargs -I{} grep -ohE '\.claude/skills/[A-Za-z0-9_-]+/SKILL\.md' {} 2>/dev/null | sed -E 's|^\.claude/skills/([A-Za-z0-9_-]+)/SKILL\.md$|\1|' | sort -u)"
  [ -z "$skill_names" ] && return 0
  while IFS= read -r skill_name; do
    [ -z "$skill_name" ] && continue
    [ -f "$SKILLS_ROOT/$skill_name/SKILL.md" ] && printf '%s\n' "$SKILLS_ROOT/$skill_name/SKILL.md"
  done <<< "$skill_names"
}

# demand_is_negated <line_content> — 0 (true) iff EVERY DEMAND_ERE occurrence
# in <line_content> is negated (see NEGATION GUARD note above). 1 (false) if
# the line has no demand occurrences at all, OR at least one is un-negated.
demand_is_negated() {
  perl -e '
    my $line = shift // "";
    my @demand_res = (
      qr/bash scripts\//i, qr/git add/i, qr/git commit/i,
      qr/git push/i, qr/commit-mutex/i, qr/commit-boundary/i,
    );
    my ($found_any, $found_unnegated) = (0, 0);
    for my $re (@demand_res) {
      while ($line =~ /$re/g) {
        $found_any = 1;
        my $prefix = substr($line, 0, pos($line) - length($&));
        if ($prefix !~ /\b(?:no|not|never|without|none)\b(?:[ \t]+[A-Za-z0-9][A-Za-z0-9-]{0,14}){0,2}[ \t]*$/i) {
          $found_unnegated = 1;
        }
      }
    }
    exit(($found_any && !$found_unnegated) ? 0 : 1);
  ' "$1"
}

# bash_demand_evidence <id> — prints "file:line: snippet" for the FIRST
# UN-NEGATED DEMAND_ERE match across the agent's flow corpus (skipping any
# match line whose only occurrences are negated — see NEGATION GUARD), or
# nothing if none.
bash_demand_evidence() {
  local id="$1" files raw line content
  files="$(flow_corpus_files "$id" | sort -u)"
  [ -z "$files" ] && return 0
  raw="$(printf '%s\n' "$files" | xargs grep -niE "$DEMAND_ERE" 2>/dev/null)"
  [ -z "$raw" ] && return 0
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    content="$(printf '%s' "$line" | cut -d: -f3-)"
    if ! demand_is_negated "$content"; then
      printf '%s\n' "$line" | sed "s|^${PROJECT_ROOT}/||"
      return 0
    fi
  done <<< "$raw"
}

has_bash_demand() {
  [ -n "$(bash_demand_evidence "$1")" ]
}

# baseline_has <agent> <check> — 0 (true) iff the baseline file carries an
# EXACT (agent, check) grandfather entry that also names its owning_task
# (a null/missing owning_task does NOT grandfather — it is a signal that
# --update minted a placeholder nobody has curated yet; see cmd_update).
baseline_has() {
  local agent="$1" check="$2"
  [ -f "$BASELINE_FILE" ] || return 1
  jq -e --arg a "$agent" --arg c "$check" \
    '.entries // [] | any(.agent == $a and .check == $c and (.owning_task // null) != null)' "$BASELINE_FILE" >/dev/null 2>&1
}

cmd_check() {
  local ids id grant demand evidence desc_claim
  local total=0 mismatch_count=0 contradiction_count=0 grandfathered_count=0
  local mismatch_list="" contradiction_list="" table=""

  ids="$(list_agent_ids | sort)"
  [ -z "$ids" ] && { echo "[bash-grant-gate] ERROR no agents found under $AGENTS_DIR"; exit 2; }

  while IFS= read -r id; do
    [ -z "$id" ] && continue
    total=$((total + 1))

    if has_bash_grant "$id"; then grant="grant"; else grant="no-grant"; fi
    if has_bash_demand "$id"; then demand="demand"; else demand="no-demand"; fi
    evidence="$(bash_demand_evidence "$id")"
    if desc_has_no_other_writes_claim "$id"; then desc_claim="claim"; else desc_claim="no-claim"; fi

    # Only the MISSING-grant direction is checked (see header "Scope note" —
    # the over-grant direction is deliberately out of scope, not implemented).
    status1="OK"
    if [ "$demand" = "demand" ] && [ "$grant" = "no-grant" ]; then
      status1="FAIL"
      if baseline_has "$id" "bash_grant_mismatch"; then
        status1="GRANDFATHERED"
        grandfathered_count=$((grandfathered_count + 1))
      else
        mismatch_count=$((mismatch_count + 1))
        mismatch_list="${mismatch_list}  ${id}: flow demands Bash (${evidence}) but tools: line has no Bash grant — $(tools_line "$id")\n"
      fi
    fi

    status2="OK"
    if [ "$desc_claim" = "claim" ] && [ "$grant" = "grant" ]; then
      if baseline_has "$id" "ac8_description_contradiction"; then
        status2="GRANDFATHERED"
        grandfathered_count=$((grandfathered_count + 1))
      else
        status2="FAIL"
        contradiction_count=$((contradiction_count + 1))
        contradiction_list="${contradiction_list}  ${id}: description claims \"No other filesystem writes permitted\" but tools: line grants Bash — $(tools_line "$id")\n"
      fi
    fi

    table="${table}$(printf '%-18s bash_grant=%-9s bash_demand=%-9s check1=%-13s check2=%s' "$id" "$grant" "$demand" "$status1" "$status2")
"
  done <<< "$ids"

  echo "[bash-grant-gate] Pass/fail table (${total} agents scanned):"
  printf '%s' "$table"
  echo

  local exit_code=0
  if [ "$mismatch_count" -gt 0 ]; then
    echo "[bash-grant-gate] CHECK-1 FAIL — ${mismatch_count} agent(s) with flow-demands-Bash but frontmatter does not grant it:"
    printf '%b' "$mismatch_list"
    exit_code=1
  fi
  if [ "$contradiction_count" -gt 0 ]; then
    echo "[bash-grant-gate] CHECK-2 FAIL — ${contradiction_count} agent(s) with description/tools self-contradiction:"
    printf '%b' "$contradiction_list"
    exit_code=1
  fi

  if [ "$exit_code" -eq 0 ]; then
    echo "[bash-grant-gate] PASS — 0 new offenders across ${total} agents (${grandfathered_count} grandfathered, see $BASELINE_FILE)"
  else
    echo "[bash-grant-gate] Fix: grant Bash (if the flow's Bash step is legitimate) or remove the Bash step from the flow doc (if not); for description contradictions, reword the claim to match the actual tools: line. If a mismatch is already diagnosed and owned by a DIFFERENT row, run --update to grandfather it explicitly (visible in $BASELINE_FILE) — never silently skip it."
  fi
  return "$exit_code"
}

cmd_update() {
  local ids id grant demand desc_claim entries="[]" tmp prior_file prior_owning prior_reason
  tmp="$(mktemp 2>/dev/null || echo "/tmp/bash-grant-gate-update-$$.json")"
  echo "[" > "$tmp"
  local first=1

  # Preserve any hand-curated owning_task/reason from the CURRENT baseline —
  # --update must never silently blank out prior curation for an entry that
  # still applies (it only ADDS newly-discovered mismatches as placeholders
  # and DROPS entries that no longer reproduce).
  prior_file="$BASELINE_FILE"

  ids="$(list_agent_ids | sort)"
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    if has_bash_grant "$id"; then grant="grant"; else grant="no-grant"; fi
    if has_bash_demand "$id"; then demand="demand"; else demand="no-demand"; fi
    if desc_has_no_other_writes_claim "$id"; then desc_claim="claim"; else desc_claim="no-claim"; fi

    if [ "$demand" = "demand" ] && [ "$grant" = "no-grant" ]; then
      [ "$first" -eq 0 ] && echo "," >> "$tmp"
      first=0
      prior_owning=null; prior_reason=null
      if [ -f "$prior_file" ]; then
        prior_owning="$(jq -c --arg a "$id" --arg c "bash_grant_mismatch" '[.entries // [] | .[] | select(.agent==$a and .check==$c) | .owning_task][0] // null' "$prior_file" 2>/dev/null)"
        prior_reason="$(jq -c --arg a "$id" --arg c "bash_grant_mismatch" '[.entries // [] | .[] | select(.agent==$a and .check==$c) | .reason][0] // null' "$prior_file" 2>/dev/null)"
      fi
      jq -n --arg agent "$id" --arg check "bash_grant_mismatch" \
        --arg evidence "$(bash_demand_evidence "$id")" \
        --argjson owning_task "${prior_owning:-null}" --argjson reason "${prior_reason:-null}" \
        '{agent:$agent, check:$check, evidence:$evidence, owning_task:$owning_task, reason:$reason}' >> "$tmp"
    fi
    if [ "$desc_claim" = "claim" ] && [ "$grant" = "grant" ]; then
      [ "$first" -eq 0 ] && echo "," >> "$tmp"
      first=0
      prior_owning=null; prior_reason=null
      if [ -f "$prior_file" ]; then
        prior_owning="$(jq -c --arg a "$id" --arg c "ac8_description_contradiction" '[.entries // [] | .[] | select(.agent==$a and .check==$c) | .owning_task][0] // null' "$prior_file" 2>/dev/null)"
        prior_reason="$(jq -c --arg a "$id" --arg c "ac8_description_contradiction" '[.entries // [] | .[] | select(.agent==$a and .check==$c) | .reason][0] // null' "$prior_file" 2>/dev/null)"
      fi
      jq -n --arg agent "$id" --arg check "ac8_description_contradiction" \
        --arg evidence "$(tools_line "$id")" \
        --argjson owning_task "${prior_owning:-null}" --argjson reason "${prior_reason:-null}" \
        '{agent:$agent, check:$check, evidence:$evidence, owning_task:$owning_task, reason:$reason}' >> "$tmp"
    fi
  done <<< "$ids"
  echo "]" >> "$tmp"
  entries="$(jq -s 'add' "$tmp" 2>/dev/null)"
  [ -z "$entries" ] && entries="[]"
  rm -f "$tmp"

  jq -n --argjson entries "$entries" \
    '{_generated_by: "scripts/audits/agent-bash-grant-coverage.sh --update",
      _note: "Grandfather baseline for scripts/audits/agent-bash-grant-coverage.sh --check. Every entry MUST carry a non-null `owning_task` (the distinct, already-diagnosed, separately-owned board row that owns this mismatch) + a `reason` before --check will treat it as grandfathered (baseline_has() requires owning_task != null) — a freshly --update-minted entry lands with owning_task/reason=null and STILL FAILS --check until hand-curated. This is deliberate: it is NOT an opt-out allowlist of agents exempted from the Bash-grant-vs-demand predicate (AC-2 forbids that); it is a visible, auditable ledger of debt this gate detected but does not itself own the fix for, and it cannot be used to silently launder a new offender. Entries MUST drop on the next --update once the owning row lands (grant/demand no longer mismatched).",
      _ssot: "docs/data/agent-bash-grant-coverage-baseline.json",
      count: ($entries | length),
      entries: $entries}' > "$BASELINE_FILE"
  echo "[bash-grant-gate] baseline updated — $(jq '.count' "$BASELINE_FILE") entr(y/ies) recorded in $BASELINE_FILE"
  local uncurated
  uncurated="$(jq -r '.entries // [] | .[] | select((.owning_task // null) == null) | .agent + "/" + .check' "$BASELINE_FILE" 2>/dev/null)"
  if [ -n "$uncurated" ]; then
    echo "[bash-grant-gate] WARNING — entries below have owning_task=null and will NOT grandfather (still FAIL --check) until hand-curated:"
    while IFS= read -r u; do
      [ -z "$u" ] && continue
      printf '  %s\n' "$u"
    done <<< "$uncurated"
  fi
}

case "${1:-}" in
  --check) cmd_check; exit $? ;;
  --update) cmd_update; exit $? ;;
  *) usage; exit 2 ;;
esac
