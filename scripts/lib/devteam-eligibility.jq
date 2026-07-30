# scripts/lib/devteam-eligibility.jq
#
# UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (architect, 2026-07-22).
#
# Shared eligibility/detail-resolution contract for every dev-team backlog/
# ready/review lane picker (BOUNDED-1, Supervised-Lane Sweep, Ready-Lane
# Consumer, Review-Lane QA-Drain, and their acceptance/report instruments).
#
# WHY THIS FILE EXISTS (design principle adopted from
# SPIKE-BOUNDED1-ELIGIBILITY-CONTRACT-REVIEW, 2026-07-09/07-12, folded into
# this UNBLOCK per PO ruling 2026-07-21T22:00Z): every one of these
# predicates (effective_supervised, effective_plan_only, effective_owner,
# effective_next_agent, effective_depends_on, is_epic_wrapper,
# is_detail_deferred, priority_rank...) was previously hand-copied into THREE
# separate files (scripts/devteam-backlog-promote-bounded1.jq,
# scripts/devteam-backlog-promote-supervised-lane-sweep.jq,
# scripts/audits/bounded1-supervised-lane-report.sh) — the exact
# "hole-by-hole" pattern that produced 4+ near-miss defects in ~5 days
# (07-04 stale-already-done, 07-08 no depends_on check, 07-09 detail .items
# array-shape crash, 07-09 supervised board-only read, 07-10 epic-wrapper
# gap, 07-12 detail-deferred/non-dev-owner/plan-only/non-dev-next_agent
# gaps, 07-16 board-fallback generalization). Every caller below now
# `include`s this ONE file instead of maintaining its own copy — the Nth new
# picker (this task adds two: Ready-Lane Consumer + Review QA-Drain) can no
# longer silently diverge from the others' semantics.
#
# jq module resolution: jq's `include "path";` resolves the path RELATIVE TO
# THE CALLER'S CURRENT WORKING DIRECTORY (verified empirically 2026-07-22,
# jq 1.8.1 — NOT relative to the including script's own file location). Every
# caller in this repo is already invoked from the project root (see each
# script's own "Usage" header — `jq ... -f scripts/... docs/data/orch/
# orch-state.json` run from repo root), so `include "scripts/lib/
# devteam-eligibility";` resolves correctly with zero extra `-L` flag.
#
# `.` in every def below is the CANDIDATE ROW OBJECT (a task_board lane
# entry), not the whole orch-state document, unless noted otherwise.
# `$detail_items` is the id-keyed (object, NOT array) form of
# docs/data/orch/archive/backlog-detail.json `.items` — build it once per
# invocation via `detail_items_from($detail)` below and thread it through.

# ---- shape-defensive detail-items ingest ----
# FIX-DEVTEAM-BOUNDED1-DETAIL-ITEMS-ARRAY-INDEX (2026-07-09): live
# backlog-detail.json `.items` is a plain ARRAY of id-bearing objects, not an
# object keyed by task id. Every effective_*() below does object-indexing
# ($detail_items[.id]), so id-key the array once at ingest time. Object input
# (e.g. a test fixture) passes through unchanged.
# Usage: `--slurpfile detail docs/data/orch/archive/backlog-detail.json` then
# `(detail_items_from($detail)) as $detail_items`.
def detail_items_from($detail):
  ($detail[0].items // []) as $raw_items
  | if ($raw_items | type) == "object" then $raw_items
    else ($raw_items | map(select(.id != null) | {key: .id, value: .}) | from_entries)
    end;

# ---- WIP / concurrency ----
# FIX (this task): WIP is a CONCURRENCY budget, measured by in_progress[]
# alone. ready[] is a staging queue (enqueued-but-not-yet-dispatched work),
# not concurrency — counting it let a saturated staging lane permanently
# starve every picker below (instance 9 on the count-threshold-gate class;
# see docs/agent-memory/decisions/sprint-UNBLOCK-DEVTEAM-DISPATCH-GATE-
# DEADLOCK-po.md). Prior versions of this def (still visible in this file's
# git history at each caller) read `(ready|length)+(in_progress|length)`.
def wip_in_progress:
  (.task_board.in_progress // []) | length;

# ---- priority ordering (shared FIFO-proxy tiebreak convention) ----
def priority_rank:
  ((.priority // "") | ascii_downcase) as $p
  | if   ($p | test("^p0$|^critical$"))              then 0
    elif ($p | test("^p1$|^high$"))                  then 1
    elif ($p | test("^p2$|^med(ium)?$|^normal$"))    then 2
    elif ($p | test("^p3$|^low$"))                   then 3
    else 9
    end;

# ---- generic array-shape normalizer ----
# null -> [], bare string (real-data drift, ~7/321 backlog-detail rows) ->
# [string], array -> as-is.
def as_dep_array:
  if . == null then []
  elif (type == "string") then [.]
  elif (type == "array") then .
  else [] end;

# ---- supervised (FIX-DEVTEAM-BOUNDED1-SUPERVISED-FLAG-GATE, 2026-07-09) ----
# EITHER inline board `.supervised` OR $detail_items[.id].supervised is true
# (no `.detail_ref` precondition — lookup keyed purely by `.id`). Conservative
# default: absent/null in both = NOT supervised (promotable/dispatchable).
def effective_supervised($detail_items):
  (.supervised == true)
    or ( (.id != null) and ($detail_items[.id].supervised // false) == true );

# ---- plan_only (FIX-DEVTEAM-BOUNDED1-PLAN-ONLY-GATE 2026-07-12, board-
# fallback generalized by FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-
# FALLBACK-GATE 2026-07-16) ----
# Same OR-precedence as effective_supervised. plan_only:true = deliberate
# architect/PO dispatch class, never an autonomous auto-pick target.
def effective_plan_only($detail_items):
  (.plan_only == true)
    or ( (.id != null) and (($detail_items[.id].plan_only // false) == true) );

# ---- epic wrapper / children (FIX-DEVTEAM-BOUNDED1-EPIC-WRAPPER-GATE,
# 2026-07-10) ----
# Same OR-precedence again: a row is an epic wrapper (decomposition
# container, not a directly-dispatchable atomic task) if EITHER location
# yields a non-empty children array.
def effective_children($detail_items):
  (.children | as_dep_array) as $inline
  | if ($inline | length) > 0 then $inline
    elif (.id != null) then ($detail_items[.id].children | as_dep_array)
    else [] end;

def is_epic_wrapper($detail_items):
  (effective_children($detail_items) | length) > 0;

# ---- detail-authoritative DEFERRED* disposition
# (FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE, 2026-07-12) ----
def is_detail_deferred($detail_items):
  if (.id == null) then false
  else
    ($detail_items[.id].status) as $ds
    | if ($ds == null) or (($ds | type) != "string") then false
      else ($ds | ascii_downcase | startswith("deferred"))
      end
  end;

# ---- depends_on / depends / blocked_by
# (FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE 2026-07-08 +
#  FIX-DEVTEAM-BOUNDED1-BLOCKED-BY-GATE 2026-07-10) ----
# Inline (board row) wins if non-empty; else, for detail_ref'd rows, read the
# same 3 field names from backlog-detail.json. Unions all 3 names at each
# location (legacy `.depends` naming co-resident with `.depends_on`).
def effective_depends_on($detail_items):
  ((.depends_on | as_dep_array) + (.depends | as_dep_array) + (.blocked_by | as_dep_array)) as $inline
  | if ($inline | length) > 0 then
      $inline
    elif (.detail_ref != null) then
      (($detail_items[.id].depends_on | as_dep_array) + ($detail_items[.id].depends | as_dep_array) + ($detail_items[.id].blocked_by | as_dep_array))
    else
      []
    end;

# ---- cold-archive dep status ingest
# (FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING, 2026-07-28) ----
# ROOT CAUSE this closes: dep_status_map (below) used to scan ONLY the HOT
# document's task_board lanes. The moment scripts/orch-cold-evict.sh moves a
# DONE_VERIFIED row out of hot into docs/data/orch/archive/YYYY-MM.json
# (`.done_tasks[]`), every live row that still names it in effective_
# depends_on silently resolved MISSING forever — 34 live rows / 29 of 40
# distinct dep-ids measured live 2026-07-28T13:2xZ, i.e. the blocking work
# was FINISHED and the block was a pure artefact of eviction.
#
# `$archive` = the slurped array of monthly cold-archive documents — one
# element per docs/data/orch/archive/YYYY-MM.json file, ascending
# (chronological) order. Build it via
# `scripts/lib/archive-glob-cat.sh` (Usage: see dep_status_map($archive)
# below) — NOT docs/data/orch/archive/backlog-detail.json, which is a
# different shape already threaded separately as `$detail`/$detail_items.
#
# Status normalization: live archive data mixes "DONE_VERIFIED" /
# "done_verified" / "DONE-VERIFIED" across the pre- and post-
# canonicalization eras (verified empirically across 2026-06.json/
# 2026-07.json). Case/separator-insensitive match against "DONE_VERIFIED"
# ONLY — every other archived status (DONE, CANCELLED, SUPERSEDED,
# IN_PROGRESS, ...) passes through UNNORMALIZED so it can never
# accidentally string-equal "DONE_VERIFIED" in deps_satisfied()'s
# `all(. == "DONE_VERIFIED")` check. Negative control: a dep-id cold-
# archived with a NON-terminal status must still resolve UNSATISFIED — this
# def does not blanket-satisfy anything that isn't actually terminal.
def normalize_archive_status($s):
  ($s // "" | tostring) as $raw
  | ($raw | ascii_upcase | gsub("[- ]"; "_")) as $norm
  | if $norm == "DONE_VERIFIED" then "DONE_VERIFIED" else $raw end;

def archive_status_map($archive):
  [ ($archive // [])[]
    | (.done_tasks // [])[]
    | select(.id != null)
    | { key: .id, value: (.status | normalize_archive_status(.)) }
  ] | from_entries;

# Global dep-id -> status map, scanned across EVERY task_board lane so a
# dependency satisfied by a done_verified/done/review/qa/in_progress/ready
# row still resolves correctly. `.` = the WHOLE orch-state document (NOT a
# candidate row) — call as `$doc | dep_status_map` (hot-only, unchanged
# legacy behavior — a plain proxy for `dep_status_map([])` below, kept for
# every existing 0-arg caller; ZERO behavior change) or
# `$doc | dep_status_map($archive)` (hot + cold-archive fallback — the fix).
# Cold-archive statuses SEED the map; any HOT lane entry for the same id
# OVERWRITES it (hot is authoritative for a still-live id; archive is a
# fallback layer only, for ids evicted out of hot entirely).
#
# Usage (the 3 real callers — BOUNDED-1 promote, Supervised-Lane Sweep
# promote, Ready-Lane Consumer claim — all thread `--slurpfile archive` the
# same way `--slurpfile detail` is already threaded):
#   jq --arg now "$NOW" \
#     --slurpfile detail docs/data/orch/archive/backlog-detail.json \
#     --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) \
#     -f scripts/devteam-backlog-promote-bounded1.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# NOTE ON DEF ORDER: `dep_status_map($archive)` (arity 1) MUST be defined
# BEFORE the `dep_status_map` (arity 0) proxy below — jq resolves a def's
# body against only the defs already in scope at that point in the file, so
# an arity-0 def calling an not-yet-defined arity-1 sibling fails to compile
# ("dep_status_map/1 is not defined"), even though both share the base
# name. Verified empirically 2026-07-28, jq 1.8.1.
def dep_status_map($archive):
  . as $doc
  | ["backlog", "ready", "in_progress", "qa", "review", "done", "done_verified"] as $lanes
  | (archive_status_map($archive)) as $archive_map
  | reduce $lanes[] as $lane
      ( $archive_map
      ; . + ( [ ($doc.task_board[$lane] // [])[]
                | select(.id != null)
                | { key: .id, value: .status }
              ] | from_entries )
      );

def dep_status_map: dep_status_map([]);

# `.` = candidate row object. Satisfied only when EVERY effective depends_on
# entry resolves to DONE_VERIFIED (plain DONE is NOT sufficient). A dep id
# found in NO lane = UNSATISFIED (conservative-skip).
def deps_satisfied($detail_items; $status_map):
  effective_depends_on($detail_items) as $deps
  | ($deps | length) == 0
    or ( [ $deps[] | ($status_map[.] // "MISSING") ] | all(. == "DONE_VERIFIED") );

# ---- effective owner (FIX-DEVTEAM-BOUNDED1-NONDEV-OWNER-BOARD-FALLBACK-GATE,
# 2026-07-13) ----
# Detail-FIRST / board-FALLBACK (reverse of depends_on's inline-first order —
# detail is authoritative for owner when it exists).
def effective_owner($detail_items):
  (if (.id != null) then $detail_items[.id].owner else null end) as $detail_owner
  | if ($detail_owner != null) and (($detail_owner | type) == "string") and ($detail_owner != "") then
      $detail_owner
    else
      (.owner // "")
    end;

# ---- effective next_agent (FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-
# BOARD-FALLBACK-GATE, 2026-07-16) ----
# Detail-FIRST / board-FALLBACK, mirrors effective_owner exactly.
def effective_next_agent($detail_items):
  (if (.id != null) then $detail_items[.id].next_agent else null end) as $detail_na
  | if ($detail_na != null) and (($detail_na | type) == "string") and ($detail_na != "") then
      $detail_na
    else
      (.next_agent // "")
    end;

def is_dev_role($s):
  ($s | test("^dev(-|$)|^developer$"; "i"));

# ---- non-dev-owner unrouted (NON-DEV-OWNER GATE, 2026-07-12/07-13) ----
# Gated ONLY if effective_owner names a non-dev deliberate-launch agent AND
# the BOARD row's own `.next_agent` is null/empty.
def is_non_dev_owner_unrouted($detail_items):
  (effective_owner($detail_items)) as $owner
  | ( (($owner | type) == "string") and ($owner != "") ) as $owner_present
  | if ($owner_present | not) then false
    else
      (is_dev_role($owner)) as $is_dev_owner
      | if $is_dev_owner then false
        else ((.next_agent // "") == "")
        end
    end;

# ---- non-dev EFFECTIVE next_agent unrouted (NON-DEV-NEXT_AGENT GATE,
# 2026-07-12, generalized 2026-07-16) ----
# Gated whenever effective_next_agent is present-and-non-empty AND does NOT
# match the dev-role pattern (i.e. not zone-detect-routable).
def is_non_dev_next_agent_unrouted($detail_items):
  (effective_next_agent($detail_items)) as $na
  | ( (($na | type) == "string") and ($na != "") ) as $na_present
  | if ($na_present | not) then false
    else (is_dev_role($na) | not)
    end;

# ---- resolved dispatch lane (direct-dispatch resolution, no zone-detect) ----
# Shared by Supervised-Lane Sweep and Ready-Lane Consumer: effective
# next_agent if present, else effective owner, else the generic "developer"
# fallback (same Tier-3 fallback zone-detect itself uses — defensive-only,
# every live row resolves to a real specialist).
def resolved_dispatch_lane($detail_items):
  (effective_next_agent($detail_items)) as $na
  | (effective_owner($detail_items)) as $ow
  | if ($na | length) > 0 then $na
    elif ($ow | length) > 0 then $ow
    else "developer" end;

# ---- prose-sequencing-without-machine-encoding guard
# (FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE, 2026-07-23) ----
# ROOT CAUSE: PO-authored sequencing constraints written in prose fields
# (`po_sequencing_YYYYMMDD` keys, e.g. UC-CDC-P5's `po_sequencing_20260722`
# — "must land LAST, after UC-SDF-P6 and the liveness watchdog") are
# INVISIBLE to `effective_depends_on()` above, which only ever reads
# `.depends_on`/`.depends`/`.blocked_by`. 2026-07-22: BOUNDED-1 blind-
# promoted UC-CDC-P5 (ordering constraint lived ONLY in prose) then had to
# be reverted — a mis-promote+revert churn cycle on a P1 row, hand-contained
# by installing `depends_on` on that one row after the fact. This def closes
# the gate for the NEXT prose-only-sequenced row, generically.
#
# A row "has" prose sequencing if EITHER the inline board row OR its
# detail_ref'd counterpart (`docs/data/orch/archive/backlog-detail.json`
# `.items[<id>]`) carries any object key matching `^po_sequencing` — same
# board-OR-detail OR-precedence every other effective_* predicate above
# uses (a PO may leave the note on either side depending on which triage
# pass wrote it). "Unbacked" = the row's `effective_depends_on` (which
# ALREADY reads both locations + all 3 field-name aliases) resolves to an
# empty list — i.e. the ordering constraint has not yet been machine-
# encoded anywhere this gate can see.
#
# DELIBERATELY DOES NOT attempt to parse the prose to extract a predecessor
# task-id (regex-mining English sentences for control flow is brittle and
# is exactly the fragility this shared-library consolidation exists to
# avoid — see file header). This predicate only detects the UNBACKED
# condition and forces the ordering to be encoded as real `depends_on`
# before auto-dispatch proceeds; it never infers what that `depends_on`
# should be.
def has_unbacked_sequencing_prose($detail_items):
  ( ((keys // []) | any(test("^po_sequencing")))
    or ( (.id != null)
         and ($detail_items[.id] != null)
         and (($detail_items[.id] | type) == "object")
         and (($detail_items[.id] | keys) | any(test("^po_sequencing")))
       )
  ) as $has_prose
  | $has_prose and ((effective_depends_on($detail_items) | length) == 0);

# ---- BOUNDED-1's full unattended-auto-pickup eligibility (composed) ----
# `.` = candidate row object. True iff the row is safe for FULLY UNATTENDED
# (no human/router/PO adjudication) auto-dispatch: not supervised, not an
# epic wrapper, deps satisfied, not detail-deferred, not non-dev-owner-
# unrouted, not plan_only, not non-dev-next_agent-unrouted, not carrying
# unbacked prose sequencing.
def is_bounded1_eligible($detail_items; $status_map):
  (effective_supervised($detail_items) != true)
    and (is_epic_wrapper($detail_items) != true)
    and (deps_satisfied($detail_items; $status_map))
    and (is_detail_deferred($detail_items) != true)
    and (is_non_dev_owner_unrouted($detail_items) != true)
    and (effective_plan_only($detail_items) != true)
    and (is_non_dev_next_agent_unrouted($detail_items) != true)
    and (has_unbacked_sequencing_prose($detail_items) != true);

# ---- idle-chain aged round-robin selection
# (FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION, architect brief
# 2026-07-25-devteam-idle-chain-rotation-durable-inbox.md §2.2;
# TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES) ----
#
# Replaces the fixed-priority BOUNDED-1 -> SLS -> RLC -> QA-Drain -> Step1
# sequential fall-through (the starvation root cause: BOUNDED-1 always wins
# when it has anything eligible, so the other 4 consumers can go 0/7 ticks
# while BOUNDED-1 goes 7/7 — measured baseline in the architect brief).
#
# `$doc` = the WHOLE orch-state document (NOT a candidate row, unlike every
# def above this point in the file) — call as `$doc | rotation_selected($doc)`
# or, equivalently, `rotation_selected(.)` when `.` is already the whole doc.
# Reads `.dev_team_idle_chain.rotation.<id>.last_served_tick` for each of the
# 5 idle-path consumers; a missing/null stamp (including the case where
# `.dev_team_idle_chain` itself is entirely absent — the migration/bootstrap
# tick, brief §8 risk flag) defaults to the epoch so every consumer is
# guaranteed a first turn before any repeat. Selects the single
# oldest-stamped id; ties (only possible on the all-null bootstrap tick)
# break on the fixed declared order below.
#
# This function is SELECTION ONLY — it does not read or write orch-state.
# The caller (docs/agents/dev-team/flow/main.md, a separate downstream task
# per the architect brief — NOT touched by this task) is responsible for
# dispatching on the returned id and, after the selected consumer's block
# runs, writing the updated stamp via scripts/devteam-idle-chain-stamp.jq
# (§2.3 of the brief).
def rotation_selected($doc):
  ($doc.dev_team_idle_chain.rotation // {}) as $r
  | ["bounded1", "sls", "rlc", "qa_drain", "step1_triage"]
  | map({id: ., stamp: ($r[.].last_served_tick // "1970-01-01T00:00:00Z")})
  | sort_by(.stamp)
  | .[0].id;

# ---- terminal task-status normalization + membership
# (FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP, 2026-07-29) ----
# SSOT: apps/mcp-server/src/infrastructure/orchStateSchema.ts TERMINAL_SET,
# mirrored verbatim by scripts/orch-cold-evict.sh TERMINAL_TASK_STATUSES /
# TERMINAL_SPRINT_STATUSES ({DONE, DONE_VERIFIED, CANCELLED, DEFERRED,
# SKIPPED}). orch-cold-evict.sh's own comparison is a case-SENSITIVE exact
# `IN($tt_arr[])` match against the live hot-lane `.status` field (always
# canonical-cased there). Cold-archived docs/data/orch/archive/YYYY-MM.json
# `.done_tasks[].status` is NOT reliably canonical-cased (empirically
# confirmed 2026-07-29: 2026-06.json alone carries "done"/"done_verified"
# lowercase and "DONE-VERIFIED" dash-separated, alongside the canonical
# forms) — this def normalizes case + separator (generalizes
# normalize_archive_status above from just DONE_VERIFIED to the full
# 5-value set) so a child task cold-evicted under a pre-canonicalization-era
# status string still resolves terminal instead of a false-negative
# conservative-skip forever.
def normalize_task_status($s):
  ($s // "" | tostring | ascii_upcase | gsub("[- ]"; "_"));

def is_terminal_task_status($s):
  (normalize_task_status($s)) as $n
  | ($n | IN("DONE", "DONE_VERIFIED", "CANCELLED", "DEFERRED", "SKIPPED"));

# ---- hold_reason guard (FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP,
# 2026-07-29) ----
# Same board-OR-detail OR-precedence as every other effective_* predicate.
# A wrapper deliberately held open past children-completion (a future-gate
# hold, e.g. "wait for the next sprint boundary before closing") must never
# be swept out from under whoever set that hold. No live row carries this
# field today (schema-forward guard only) — see
# docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md
# #dev-team-loop-P3 risk note.
def has_hold_reason($detail_items):
  (((.hold_reason // "") | tostring) != "")
    or ( (.id != null) and ((($detail_items[.id].hold_reason) // "" | tostring) != "") );

# ---- Design-Router Sweep (DRS) agent-identity allowlist
# (FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE, architect brief
# 2026-07-29 §2.2, PO-ratified 2026-07-30 —
# docs/agent-memory/decisions/ruling-20260730T0906Z-po-triage-po.md STEP
# po-4) ----
# DRS's compensating control for auto-dispatching non-dev `next_agent` rows
# that carry NO deliberate-dispatch flag at all (unlike SLS, which only ever
# fires on rows a human/PO already double-marked supervised+plan_only at
# mint time — 86/122 of DRS's candidate rows carry neither flag). `.` = the
# candidate row object (same convention as every def above). `$allowlist` =
# the ratified fixed set, threaded by the CALLER via
# `--argjson allowlist '["architect","ba","pm","po","agents-architect"]'` —
# NEVER hardcoded inside this def, so a future PO ruling widening/narrowing
# the set only touches the caller's `--argjson` literal, not this shared
# library file.
# RATIFIED 2026-07-30 default set: `architect`, `ba`, `pm`, `po`,
# `agents-architect`. Explicitly NOT on the default allowlist:
# `agent-father` (fleet-wide blast radius — edits the files that define
# every OTHER agent; its most recent supervised dispatch made a unilateral
# scope deferral whose follow-up was never minted), `ops` /
# `ops-mainserver-fetch` / `ops-vps-fetch` (repeated live-infra-mutation
# incidents, feedback_ops_readonly_diagnostic_wrote_to_live_index /
# feedback_ops_specialist_pushes_backlog_directly /
# feedback_ops_silently_switched_to_destructive_fallback_without_reauth),
# `qa` (wrong mechanism — QA has its own dedicated Review-Lane QA-Drain
# lane), `system-auditor` (0 live rows at ratification time — unfalsifiable
# by construction, per feedback_gate_widening_recommendation_requires_
# actuator_dry_run — add only once a real row appears). Case-sensitive
# exact match against `effective_next_agent` — no normalization, since every
# ratified allowlist entry is already a canonical lower-case agent id
# (`docs/data/system-map.json` `.project.agents[].id`).
def is_design_router_allowed($detail_items; $allowlist):
  (effective_next_agent($detail_items)) as $na
  | ($allowlist // []) as $al
  | ($na | length) > 0 and (($al | index($na)) != null);

# ---- Design-Router Sweep (DRS) full eligibility (composed)
# (FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE) ----
# `.` = candidate row object. True iff the row is safe for DRS auto-dispatch:
# names a non-dev-role `next_agent` that BOUNDED-1 would never route
# (`is_non_dev_next_agent_unrouted`), is NOT already the Supervised-Lane
# Sweep's own doubly-gated territory (`effective_supervised` AND
# `effective_plan_only` BOTH true — an AND, matching the ratified brief §2.1
# exactly, so a row carrying exactly ONE of the two flags is NOT excluded
# here and remains DRS-eligible), resolves to an allowlisted agent
# (`is_design_router_allowed`), is not an epic wrapper, has `depends_on`
# satisfied, is not detail-deferred, and carries no unbacked prose
# sequencing. Deliberately does NOT gate on `effective_supervised` or
# `effective_plan_only` ALONE — see this task's own review_note for the
# residual (out-of-scope, PO-adjudicated) class this leaves uncovered: a
# `supervised:true` row whose `next_agent` names a DEV role (fails
# `is_non_dev_next_agent_unrouted` regardless of the flags, since that
# predicate excludes dev-role next_agent values by construction — BOUNDED-1's
# own scope, but BOUNDED-1 itself excludes `supervised:true`).
def is_design_router_eligible($detail_items; $status_map; $allowlist):
  (is_non_dev_next_agent_unrouted($detail_items))
    and ( (effective_supervised($detail_items) and effective_plan_only($detail_items)) | not )
    and (is_design_router_allowed($detail_items; $allowlist))
    and (is_epic_wrapper($detail_items) | not)
    and (deps_satisfied($detail_items; $status_map))
    and (is_detail_deferred($detail_items) | not)
    and (has_unbacked_sequencing_prose($detail_items) | not);

# ---- all-children-terminal (FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP,
# 2026-07-29) ----
# `.` = candidate wrapper row object. `$status_map` = dep_status_map($archive)
# (hot task_board lanes UNION cold-archive done_tasks[], id -> RAW status) —
# the SAME map already threaded by BOUNDED-1/SLS/RLC for depends_on
# resolution, reused here unchanged (no forked status lookup; the map
# ITSELF is not re-normalized — is_terminal_task_status normalizes at
# lookup time only, so this def stays a pure consumer). A child id absent
# from BOTH hot and cold archive is conservative-skip (row stays open) —
# mirrors deps_satisfied's own "MISSING = unsatisfied" default; never
# assumes a vanished child finished.
def all_children_terminal($detail_items; $status_map):
  effective_children($detail_items) as $children
  | ($children | length) > 0
    and ( [ $children[] | ($status_map[.] // "MISSING") ]
          | all(is_terminal_task_status(.)) );
