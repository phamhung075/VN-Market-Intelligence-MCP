# scripts/lib/po-manual-dispatch-eligibility.jq
#
# FIX-PO-NO-PRODUCER-FOR-MANUAL-DISPATCH-ESCAPE-HATCH (architect, 2026-07-31).
#
# PROBLEM: `docs/agents/dev-team/flow/main.md`'s own Lane × Gate Coverage
# Matrix (§ Design-Router Sweep / SLS) and `scripts/audits/
# bounded1-supervised-lane-report.sh`'s DRS/READY-XOR section headers both
# describe two live classes of task_board rows as "reachable only by
# manual/PO dispatch" — but grep-verified (po AND independently re-verified
# by dev-team, 2026-07-30/07-31): no PO flow step ever SWEPT the existing
# backlog[]/ready[] lanes by priority looking for this class of row. Every
# `.task_board.backlog`/`.task_board.ready` touch in `docs/agents/po/flow/*.md`
# was an APPEND site (mint a new row) or a one-off id-targeted script — never
# a generic sweep of EXISTING rows. The named destination did not exist.
# 4th instance of this "documented consumer, no documented producer" class in
# this codebase (see `docs/agents/po/flow/supervised-goahead.md` header for
# the immediately-preceding 3rd instance and its own precedent chain).
#
# THIS FILE composes the "manual/PO dispatch" candidate predicate for BOTH
# classes, `include`-ing `scripts/lib/devteam-eligibility.jq` and reusing its
# predicates VERBATIM — zero new predicate logic, only the outer AND-glue
# (the SAME convention every other consumer of that shared file already
# uses: BOUNDED-1/SLS/RLC/DRS/QA-Drain and their own report/verify
# instruments never re-derive a predicate's internal logic, only compose
# which of the shared predicates apply to their own lane). A divergent
# reimplementation of any ONE of these predicates is exactly the defect
# class that shared file's own header names as the reason it exists (4+
# near-miss defects, 07-04..07-16) — this file adds a 4th/5th CONSUMER, not
# a 2nd COPY.
#
# Consumed by (all three MUST cite this ONE file — no hand-copy):
#   - `docs/agents/po/flow/manual-dispatch-sweep.md` § Step 1 (the producer
#     this task ships)
#   - `scripts/audits/po-manual-dispatch-sweep-verify.sh` (regression
#     verifier, synthetic fixture replay)
#   - `scripts/audits/bounded1-supervised-lane-report.sh` (retrofitted
#     2026-07-31 to call `is_design_router_candidate`/`is_ready_xor_gap`
#     from here instead of its own hand-inlined select-chain for the DRS/
#     READY-XOR sections — eliminates what would otherwise have been a 2nd
#     hand-copy of the exact same composition; live-diffed before/after this
#     retrofit to confirm byte-identical row sets, see the script's own
#     header note for the diff command).
#
# `.` in every def below is the CANDIDATE ROW OBJECT (a task_board lane
# entry) — same convention as `scripts/lib/devteam-eligibility.jq`. Status
# filtering (`status ∈ {BACKLOG, TODO}` etc.) is a CALLER concern, exactly
# like every def in that file — none of them read `.status` internally
# either.

include "scripts/lib/devteam-eligibility";

# ---- Design-Router Sweep (DRS) target-set, allowlist-agnostic ----
# `.` = candidate backlog row. True iff the row belongs to the DRS "problem
# class" this predicate answers for — a non-dev-role `next_agent` BOUNDED-1
# would never route, not already SLS's own doubly-gated `supervised &&
# plan_only` territory, not an epic wrapper, deps satisfied, not
# detail-deferred, no unbacked prose sequencing — IDENTICAL to
# `is_design_router_eligible($detail_items; $status_map; $allowlist)` in
# `devteam-eligibility.jq` MINUS its `is_design_router_allowed` clause (the
# allowlist check is deliberately NOT applied here — this predicate answers
# "is this row in DRS's problem space at all", the allowlist split happens
# one level up, in `is_drs_stranded_off_allowlist` below and in the report
# script's own eligible/offlist split).
def is_design_router_candidate($detail_items; $status_map):
  (is_non_dev_next_agent_unrouted($detail_items))
    and ( (effective_supervised($detail_items) and effective_plan_only($detail_items)) | not )
    and (is_epic_wrapper($detail_items) | not)
    and (deps_satisfied($detail_items; $status_map))
    and (is_detail_deferred($detail_items) | not)
    and (has_unbacked_sequencing_prose($detail_items) | not);

# ---- DRS-STRANDED-OFF-ALLOWLIST (the class THIS task's backlog producer targets) ----
# `.` = candidate backlog row. True iff `is_design_router_candidate` AND the
# row's resolved `next_agent` is NOT on DRS's ratified allowlist
# (`is_design_router_allowed`, `devteam-eligibility.jq`) — the exact
# complement of `is_design_router_eligible`: every row that would be
# auto-dispatched by DRS BUT FOR the allowlist gate. This is a POLICY
# exclusion (deliberate, ratified 2026-07-30 — see `devteam-eligibility.jq`
# `is_design_router_allowed`'s own header for the per-agent risk reasoning),
# never a bug to route around — this predicate's job is only to make the
# resulting "manual/PO dispatch" territory VISIBLE and ACTIONABLE, not to
# widen the allowlist (explicitly out of scope, see the owning task's
# `out_of_scope` field).
def is_drs_stranded_off_allowlist($detail_items; $status_map; $allowlist):
  (is_design_router_candidate($detail_items; $status_map))
    and (is_design_router_allowed($detail_items; $allowlist) | not);

# ---- BACKLOG-XOR-GAP (FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER, architect,
# 2026-08-07 — po_residual_measurement_20260728's sub-question 1: "should
# SLS's AND become an OR?") ----
# `.` = candidate backlog[] row. ANSWER: NO for supervised-alone dev-role
# rows — devteam-eligibility.jq's own `is_design_router_eligible` header and
# the DRS ratification (docs/agent-memory/decisions/ruling-20260730T0906Z-
# po-triage-po.md STEP po-4) already decided, for the immediately-adjacent
# DRS predicate, that "auto-dispatching a supervised:true dev-role row to
# developer with zero PO/human gate would defeat the exact reason the
# supervised flag exists" and left that 7-row class explicitly PO-adjudicated
# row-by-row, NOT folded into any auto-firing predicate. Widening SLS's own
# AND to an OR would silently re-open exactly that closed question through a
# different door (SLS's dispatch is the SAME kind of zero-human-gate
# mechanical spawn DRS was deliberately kept away from) — see main.md's Lane
# × Gate Coverage Matrix `backlog[] T F F` / `backlog[] F T F` rows for the
# BOUNDED-1/SLS/DRS non-coverage this predicate closes instead.
#
# THE ACTUAL GAP measured live 2026-08-07: BOUNDED-1 excludes a row on
# EITHER `effective_supervised` OR `effective_plan_only` alone already (see
# `is_bounded1_eligible` above — both are independent AND-clauses, so
# PO's "does the second conjunct buy SLS anything BOUNDED-1 doesn't already
# exclude" question resolves to "no" for the auto-pickup side); the actual
# hole is that NOTHING assigns these rows a destination once BOUNDED-1
# excludes them, unless `next_agent` also happens to be non-dev AND
# allowlisted (DRS/`is_drs_stranded_off_allowlist` above). A row carrying
# exactly one of `sup`/`po` AND a dev-role (or altogether absent) `next_agent`
# has ZERO eligible picker: not BOUNDED-1 (excluded by the lone flag), not
# SLS-promote (requires BOTH true), not DRS/`is_design_router_candidate`
# (requires `is_non_dev_next_agent_unrouted`, which is false for a dev-role OR
# an absent `next_agent` by that predicate's own construction). 39 live rows
# 2026-08-07T21:xxZ (architect brief 2026-08-07-fix-bounded1-supervised-lane-
# no-sweeper-mechanism-and-answer.md).
#
# FIX SHAPE: same as `is_drs_stranded_off_allowlist` above — a HUMAN-GATED
# recovery net, not a new unattended auto-dispatch predicate. This predicate
# feeds `manual-dispatch-sweep.md`'s existing PO-ratify-then-BATCH mechanism
# (Step 2/3, unchanged) as a THIRD candidate class — never `.head`/
# `in_progress[]`, never BOUNDED-1/SLS/RLC/DRS's own WIP≤2 budget. This is
# how the "auto-dispatch would defeat supervision" concern and "the census
# must reach 0 via a MECHANISM, not manual triage" requirement are BOTH
# satisfied simultaneously: PO's own tick mechanically finds+surfaces the
# row (no more relying on incidental notice) but a human (PO) still folds it
# into `BATCH` before anything spawns — exactly the property DRS's ratified
# allowlist already established as this codebase's compensating control for
# a flag-gate that can't safely be loosened.
#
# `is_non_dev_next_agent_unrouted(...) | not` is the clause that keeps this
# predicate DISJOINT from `is_design_router_candidate`/
# `is_drs_stranded_off_allowlist` above (never double-counts a row into two
# manual-dispatch classes in the same tick — verified by the regression
# fixture's own negative controls, `scripts/audits/
# po-manual-dispatch-sweep-verify.sh`). deps_satisfied/is_detail_deferred/
# has_unbacked_sequencing_prose/is_epic_wrapper gates mirror every other
# picker in this codebase (conservative-skip until the row is genuinely
# dispatch-ready) — never forked logic.
def is_backlog_xor_gap($detail_items; $status_map):
  ( (effective_supervised($detail_items)) or (effective_plan_only($detail_items)) )
    and ( (effective_supervised($detail_items) and effective_plan_only($detail_items)) | not )
    and (is_non_dev_next_agent_unrouted($detail_items) | not)
    and (is_epic_wrapper($detail_items) | not)
    and (deps_satisfied($detail_items; $status_map))
    and (is_detail_deferred($detail_items) | not)
    and (has_unbacked_sequencing_prose($detail_items) | not);

# ---- READY-XOR (the class THIS task's ready[] producer targets) ----
# `.` = candidate ready[] row. True iff carrying EXACTLY ONE of
# `effective_supervised`/`effective_plan_only` (not both — that is SLS-claim
# PRIMARY/FALLBACK territory; not neither — that is RLC territory), and not
# an epic wrapper (wrapper rows are the documented NO-PICKER-BY-DESIGN class
# closed by `docs/agents/dev-team/flow/post-cycle.md` § Step 4.4 Epic-Wrapper
# Autoclose Sweep, never one of the 4 dispatch pickers nor this manual-
# dispatch sweep). Neither RLC (excludes ANY row carrying either flag alone)
# nor SLS-claim's FALLBACK (requires BOTH flags true, deliberately not
# widened to XOR — out of that task's scope) ever claims this class — see
# `docs/agents/dev-team/flow/main.md`'s Lane × Gate Coverage Matrix, `ready[]`
# rows T/F and F/T.
def is_ready_xor_gap($detail_items):
  ( (effective_supervised($detail_items)) or (effective_plan_only($detail_items)) )
    and ( (effective_supervised($detail_items) and effective_plan_only($detail_items)) | not )
    and (is_epic_wrapper($detail_items) | not);
