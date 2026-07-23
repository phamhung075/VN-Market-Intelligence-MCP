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

# Global dep-id -> status map, scanned across EVERY task_board lane so a
# dependency satisfied by a done_verified/done/review/qa/in_progress/ready
# row still resolves correctly. `.` = the WHOLE orch-state document (NOT a
# candidate row) — call as `$doc | dep_status_map`.
def dep_status_map:
  . as $doc
  | ["backlog", "ready", "in_progress", "qa", "review", "done", "done_verified"] as $lanes
  | reduce $lanes[] as $lane
      ( {}
      ; . + ( [ ($doc.task_board[$lane] // [])[]
                | select(.id != null)
                | { key: .id, value: .status }
              ] | from_entries )
      );

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
