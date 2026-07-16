# scripts/devteam-backlog-promote-bounded1.jq
#
# SYSREMAKE-P2-DEVTEAM-BACKLOG-PICKUP-BOUNDED1 — generalized backlog->ready
# promotion for the dev-team autonomous idle-capacity pickup step.
#
# Root cause (docs/agents/dev-team/flow/main.md head-idle fall-through,
# ~L492): with ready[]=0 and in_progress[]=0 and head.status=="idle", nothing
# in the flow ever promotes a plain BACKLOG/TODO row — the 305-row backlog
# pile is inert to automation. The only two scripts that move work
# (po-s108-idle-wip-promote-groom-terminal-backlog.jq,
# router-d1-claim.jq) are hand-run one-offs with HARDCODED task IDs.
#
# This script generalizes the po-s108 promote half with NO hardcoded IDs.
#
# BOUNDED-1 GATE (user-gated 2026-07-04, SYSREMAKE-P2-DEVTEAM-BACKLOG-
# PICKUP-BOUNDED1): proceed ONLY if WIP < 1 (i.e. WIP==0). WIP is defined as
# len(.task_board.ready) + len(.task_board.in_progress). This lane is
# INTENTIONALLY capped at 1 task in flight — do NOT raise this to wip_max=2
# (that is the existing, separate router/PO WIP budget for supervised/manual
# dispatch; this auto-pickup lane is bounded independently and more
# conservatively). If WIP >= 1 this script is a NO-OP (outputs the input
# document unchanged) — safe to re-run every tick without side effects.
#
# Selection (mirrors po-s108's promote intent, generalized):
#   - candidate lane: .task_board.backlog[]
#   - status in {BACKLOG, TODO} (both statuses are observed co-resident in
#     the backlog[] lane today — pre-existing SHG lane-coherence migration
#     drift; the coherence check treats this as a non-blocking WARNING, see
#     scripts/orch-apply.sh header)
#   - effective_supervised != true (FIX-DEVTEAM-BOUNDED1-SUPERVISED-FLAG-GATE,
#     2026-07-09) — see "SUPERVISED GATE" section below. The Phase-1
#     supervised set (held for router-adjudicated dispatch, see .head.note
#     in the live doc) is NEVER auto-promoted by this script, regardless of
#     which of the two possible locations carries the flag.
#   - not an epic wrapper (FIX-DEVTEAM-BOUNDED1-EPIC-WRAPPER-GATE, 2026-07-10)
#     — see "EPIC-WRAPPER GATE" section below. Rows carrying a non-empty
#     children[] array (inline or detail-authoritative) are decomposition
#     containers, not directly-dispatchable atomic tasks, and are NEVER
#     auto-promoted by this script.
#   - depends_on eligibility (FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE, 2026-07-08)
#     — see "DEPENDS-ON GATE" section below. Applied DURING candidate
#     selection so a blocked top-ranked row can never starve a lower-ranked
#     but eligible row out of the same tick's pick.
#   - not detail-authoritative DEFERRED (FIX-DEVTEAM-BOUNDED1-DETAIL-
#     DISPOSITION-GATE, 2026-07-12) — see "DETAIL-DEFERRED GATE" section
#     below. A row whose backlog-detail.json status starts with "DEFERRED"
#     (case-insensitive; covers DEFERRED, DEFERRED-INFRA, etc.) is held for
#     deliberate human/router grooming, never auto-promoted here.
#   - not a non-dev-owner + null-next_agent row (FIX-DEVTEAM-BOUNDED1-
#     DETAIL-DISPOSITION-GATE, 2026-07-12) — see "NON-DEV-OWNER GATE"
#     section below. A row whose detail-authoritative owner names a
#     deliberate-launch, non-dev agent (po/ops/architect/etc.) AND whose
#     board row carries no `next_agent` would otherwise be mis-routed to the
#     generic `developer` zone-detect placeholder; held for router-adjudicated
#     dispatch instead.
#   - not an effective plan_only row (board-OR-detail) (FIX-DEVTEAM-BOUNDED1-
#     PLAN-ONLY-GATE, 2026-07-12; generalized to board-OR-detail by
#     FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE,
#     2026-07-16) — see "EFFECTIVE-DISPOSITION GATE" section below. A row
#     whose INLINE board `.plan_only` OR its backlog-detail.json entry carries
#     `plan_only:true` is a plan-first / architect-recon ask, not an
#     autonomous code-fix, and is never auto-promoted here regardless of
#     which location carries the flag.
#   - not a non-dev EFFECTIVE next_agent row (board-OR-detail, detail-first)
#     (FIX-DEVTEAM-BOUNDED1-DETAIL-NEXTAGENT-NONDEV-GATE, 2026-07-12;
#     generalized to detail-first/board-fallback by
#     FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE,
#     2026-07-16, which also SUBSUMES FIX-DEVTEAM-BOUNDED1-MAINTLANE-
#     NEXTAGENT-GATE) — see "EFFECTIVE-DISPOSITION GATE" section below. A row
#     whose EFFECTIVE `next_agent` (backlog-detail.json entry if present-
#     non-empty, ELSE the board row's own inline `next_agent`) names a
#     deliberate non-dev specialist or maintenance-lane agent (architect/ba/
#     pm/ops*/po/qa/agent-father/agents-architect/system-auditor/
#     code-janitor/...) — i.e. does not match the dev-role pattern
#     `^dev(-|$)|^developer$` — is never auto-promoted here; held for
#     router-adjudicated dispatch instead. Sibling of the NON-DEV-OWNER gate
#     above but keys off `next_agent` instead of `owner`.
#   - ordered by priority_rank ascending (0=highest: P0/critical,
#     1: P1/high, 2: P2/medium/normal, 3: P3/low, 9: missing/unrecognized —
#     priority values in the wild are a messy mix of "P0".."P3" and
#     "high"/"medium"/"low"/"normal"/"critical"/"NONE", case-insensitive),
#     tiebreak by original backlog[] array index (best-available FIFO proxy —
#     only ~18% of backlog rows carry a created_at timestamp, too sparse to
#     use as the primary sort key)
#   - exactly ONE row promoted per invocation (BOUNDED-1)
#
# DEPENDS-ON & BLOCKED-BY GATE (FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE 2026-07-08 +
# FIX-DEVTEAM-BOUNDED1-BLOCKED-BY-GATE 2026-07-10):
# root cause (DEPENDS-ON) — on 2026-07-08 this script auto-promoted+claimed
# FACTORY-TECHANALYSIS-delete-orphaned-ts-service (a legitimate P1 row) while
# its own declared depends_on ([FACTORY-TECHANALYSIS-go-livepath-tests,
# FACTORY-TECHANALYSIS-reconcile-ta-contract]) were both still plain BACKLOG —
# there was NO depends_on eligibility check at all. dev-team caught it
# pre-dispatch and reverted by hand (see the row's revert_note in the live
# doc).
# root cause (BLOCKED-BY) — on 2026-07-10 this script auto-promoted+claimed
# F1-CLOUD-TRIGGER-DECOMMISSION even though it carried blocked_by:
# [F1-LAUNCHD-COWORK-BACKSTOP] (in backlog-detail.json, not inline on the board
# row) while F1-LAUNCHD-COWORK-BACKSTOP was still plain BACKLOG. The script's
# effective_depends_on() function only read .depends_on and .depends fields,
# missing .blocked_by entirely (a third field name with identical gating
# semantics). dev-team caught it pre-dispatch and reverted by hand, identical
# to the depends_on near-miss two days prior.
# This unified gate prevents both classes structurally:
#   - depends_on/depends/blocked_by all live in TWO possible places per
#     candidate row:
#     1. inline (`.depends_on`, `.depends`, `.blocked_by`) directly on the
#        board row (used when non-null and non-empty; all three fields are
#        unioned), OR
#     2. for detail_ref'd rows (`.detail_ref` non-null, inline fields null/
#        empty) — the REAL arrays live in docs/data/orch/archive/
#        backlog-detail.json `.items[<id>].depends_on`, `.items[<id>].depends`,
#        or `.items[<id>].blocked_by` (71 detail rows use legacy `.depends`
#        name; same semantics, just pre-schema-rename — all three unioned here).
#        This file MUST be threaded in via `--slurpfile detail` (see Usage).
#     3. `[]` if neither location yields a usable array for ANY of the three
#        field names.
#   - A dependency counts SATISFIED only when it resolves to
#     status == "DONE_VERIFIED" in ANY task_board lane — scanned across ALL
#     lanes (done_verified, done, review, qa, in_progress, ready, backlog),
#     not just backlog[]. Plain DONE is NOT sufficient (matches existing repo
#     convention — see the revert_note precedent above).
#   - A dep id that resolves in NO lane at all is treated as UNSATISFIED
#     (conservative-skip: leave the candidate in backlog for human grooming
#     rather than risk auto-dispatching against an unknown/mistyped dep).
#   - The filter runs at candidate-selection time (before ranking/picking the
#     top row), not as a post-hoc check on the already-chosen pick.
#
# EPIC-WRAPPER GATE (FIX-DEVTEAM-BOUNDED1-EPIC-WRAPPER-GATE, 2026-07-10):
# root cause — on 2026-07-09T23:17Z this script auto-claimed the P1 epic
# AUDIT-FETCH-COMPLETE (mode=audit-epic, children=[4 ids], no own
# next_agent/probe) for direct dispatch. dev-team reverted + point-fixed
# supervised:true onto that ONE row. A structurally identical second row,
# FACTORY-GUARD-CI-REGRESSION-SPIKE (children=[7 ids]), remained exposed:
# its board row's `supervised` is null and no supervised:true was ever
# stamped anywhere for it, so the supervised gate above does NOT catch it —
# only a dedicated children[]-based gate protects it (and any future epic
# row that is never hand-stamped supervised). This gate prevents that class
# structurally, independent of whether anyone remembers to stamp supervised:
#   - children lives in TWO possible places per candidate row (mirrors the
#     effective_supervised precedence exactly, including its "no detail_ref
#     precondition" property):
#     1. inline `.children` directly on the board row, OR
#     2. docs/data/orch/archive/backlog-detail.json `.items[<id>].children`
#        (detail-authoritative; lookup is keyed purely by `.id`, same
#        $detail_items already threaded in for the depends_on/supervised
#        gates above — no new call-site flag needed).
#   - A row counts as an EPIC WRAPPER (not a directly-dispatchable atomic
#     task) if EITHER location yields a non-empty children array — never
#     require both.
#   - Conservative default: absent/null/empty children in BOTH places = NOT
#     an epic wrapper (promotable) — preserves baseline behavior for the
#     common non-epic case.
#
# SUPERVISED GATE (FIX-DEVTEAM-BOUNDED1-SUPERVISED-FLAG-GATE, 2026-07-09):
# root cause — on 2026-07-09T15:48Z this script auto-promoted+claimed
# FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD (a P0 row explicitly marked
# "NOT a BOUNDED-1 auto-pickup target" and supervised since 2026-07-04) into
# in_progress. The old filter (`select((.value.supervised // false) != true)`)
# read `supervised` ONLY off the thin task_board.backlog[] row, but
# `supervised:true` is authoritatively written to
# docs/data/orch/archive/backlog-detail.json `.items[<id>].supervised` for
# detail_ref'd rows — so the check silently evaluated false for every
# detail_ref'd supervised row (all 8 in the Phase-1 set). dev-team caught it
# pre-dispatch and reverted by hand (router mitigation: reverted the claim +
# hand-stamped supervised:true onto every Phase-1 board row — a data-hygiene
# patch, not the fix). This gate prevents that class structurally:
#   - supervised lives in TWO possible places per candidate row:
#     1. inline `.supervised` directly on the board row, OR
#     2. docs/data/orch/archive/backlog-detail.json `.items[<id>].supervised`
#        (detail-authoritative; requires no `.detail_ref` precondition — the
#        lookup is keyed purely by `.id`, mirroring `$detail_items` ingest
#        above). This same file is already threaded in as `$detail` for the
#        depends_on gate (see Usage) — no new call-site flag needed.
#   - A row counts supervised if EITHER location says `true` — never require
#     both (fail toward safety: a single true stamp anywhere blocks
#     auto-promotion).
#   - Conservative default: absent/null supervised in BOTH places = NOT
#     supervised (promotable) — preserves baseline behavior for the common
#     unsupervised case.
#
# DETAIL-DEFERRED GATE (FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE,
# 2026-07-12):
# root cause — BCTC-HIST-VPS-BACKFILL (detail status "DEFERRED-INFRA") was
# re-picked by this script at 09:37Z and again at 10:07Z despite being
# deferred at the detail layer; dev-team caught it pre-dispatch and
# BLOCKED it by hand both times. The board layer never mirrors a detail
# DEFERRED* disposition back onto the thin backlog[] row's `status` field
# (it stays plain BACKLOG/TODO there), so the existing status filter
# (`status ∈ {BACKLOG, TODO}`) cannot see it — only a dedicated read of
# backlog-detail.json's own status field closes this class:
#   - looked up purely by `.id` in `$detail_items[.id].status` (no
#     `.detail_ref` precondition, mirrors the supervised/children precedent).
#   - a row is gated if that detail status is a non-null string whose
#     ascii-downcased value STARTS WITH "deferred" (covers DEFERRED,
#     DEFERRED-INFRA, and any future DEFERRED-<reason> variant — 11 rows
#     carry a detail-DEFERRED* status live today).
#   - Conservative default: absent/null detail status = NOT deferred
#     (promotable) — preserves baseline behavior for the common case.
#
# NON-DEV-OWNER GATE (FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE,
# 2026-07-12):
# root cause — the two rows queued immediately behind BCTC-HIST-VPS-BACKFILL
# for the next BOUNDED-1 picks, FIX-COWORK-SPAWN-IDENTITY-PREAMBLE-OFFFLOW
# and IND-ROADMAP-LEDGER, both carry detail `owner:"po"` (a deliberate-launch
# owner, not a dev-* implementer) and a board row with `next_agent` null —
# exactly the gap already documented in the "NON-CODE / DESIGN row
# `next_agent` gap" note (docs/agents/dev-team/flow/main.md, 2026-07-09):
# with no `next_agent`, zone-detect's Tier-3 fallback would route the claimed
# row to the generic `developer` placeholder instead of the real owner. This
# gate closes the class at promotion time instead of relying on a post-claim
# hand-correction:
#   - a row is gated ONLY if BOTH hold:
#     1. `$detail_items[.id].owner` is a non-empty string that does NOT match
#        the dev-role pattern `^dev(-|$)|^developer$` (case-insensitive) —
#        i.e. it names po/ops/architect/agents-architect/ba/pm/qa/
#        agent-father/system-auditor/... a deliberate-launch owner, AND
#     2. the BOARD row's `.next_agent` is null/absent/empty (a dev-owned or
#        already-next_agent-stamped row is NOT gated by this rule).
#   - Scoped to THIS unattended BOUNDED-1 idle-pickup lane only — it does not
#     ban owner-scoped rows globally; they still launch normally via the
#     router-adjudicated path (Step 1 PO triage / manual dispatch), this gate
#     only removes them from idle auto-pickup eligibility.
#   - Conservative default: absent/empty detail owner, OR a dev-role owner,
#     OR a non-empty board `next_agent` = NOT gated (promotable) — preserves
#     baseline behavior for the common case.
#
# PLAN-ONLY GATE (FIX-DEVTEAM-BOUNDED1-PLAN-ONLY-GATE, 2026-07-12):
# root cause — FIX-MCP-MEMORY-CODE-LEAK carries a board row shaped exactly
# like an ordinary auto-pickup candidate (`status:BACKLOG`, `next_agent:null`,
# no supervised/children/depends_on) but its backlog-detail.json entry is
# `plan_only:true` (+ `next_agent:"architect"`, `owner:"dev"`, `status:"TODO"`)
# — a plan-first / architect-recon ask, not a directly-dispatchable code fix.
# `owner:"dev"` defeats the NON-DEV-OWNER gate above and `status:"TODO"`
# defeats the DETAIL-DEFERRED gate, so this script auto-picked it and routed
# it to a dev specialist as an autonomous code-fix — diverging from its
# plan-first intent. `plan_only:true` is a 38-row class in
# backlog-detail.json (grep-confirmed), well above the >1-row bar for a
# durable code gate. This gate prevents that class structurally:
#   - looked up purely by `.id` in `$detail_items[.id].plan_only` (no
#     `.detail_ref` precondition, mirrors the DETAIL-DEFERRED/NON-DEV-OWNER
#     precedent).
#   - a row is gated iff that detail `plan_only` value is exactly `true`.
#   - Conservative default: absent/null detail `plan_only` (or any candidate
#     with no matching detail entry at all) = NOT plan-only (promotable) —
#     preserves baseline behavior for the common case, same fail-open-toward-
#     promotable default as `is_detail_deferred`.
#   - Fail-toward-safety invariant: this gate only REMOVES rows from idle
#     auto-pickup eligibility; deliberate router/architect/PO dispatch of a
#     plan_only row is entirely unaffected — it still launches normally via
#     the router-adjudicated path (Step 1 PO triage / manual dispatch).
#
# NON-DEV-NEXT_AGENT GATE (FIX-DEVTEAM-BOUNDED1-DETAIL-NEXTAGENT-NONDEV-GATE,
# 2026-07-12):
# root cause — FEAT-SEVERITY-OVERRIDE-SURFACING (board `status:BACKLOG`, only
# a `detail_ref`, no inline `next_agent`/`owner`) carries a backlog-detail.json
# entry with `next_agent:"architect"` but NO `owner` field at all — the
# NON-DEV-OWNER gate above reads `$detail_items[.id].owner`, which is
# absent/empty here, so it evaluates NOT gated and this multi-zone
# architect-led FEATURE would fall straight into `ready[]`, where zone-detect's
# Tier-3 fallback mis-routes it to a single generic `developer` (see the
# "NON-CODE / DESIGN row `next_agent` gap" note below), skipping the required
# ba->architect->pm SPRINT-M relay entirely. dev-team caught it pre-dispatch
# (runtime-withheld 2 ticks, 12:37Z + 13:07Z). This gate closes the class
# structurally, independent of whether `owner` happens to be populated:
#   - a row is gated ONLY if BOTH hold:
#     1. `$detail_items[.id].next_agent` is a non-empty string that does NOT
#        match the dev-role pattern `^dev(-|$)|^developer$` (case-insensitive)
#        — i.e. it names architect/ba/pm/ops*/po/qa/agent-father/
#        agents-architect/system-auditor/... a deliberate non-dev handler, AND
#     2. the BOARD row's `.next_agent` is null/absent/empty (a row that
#        already carries its own board-level `next_agent` is NOT gated by
#        this rule — the dispatcher will honor it directly).
#   - Composed as an INDEPENDENT `select()` AFTER the existing NON-DEV-OWNER
#     select in the candidate filter chain (fail-toward-safety: it can only
#     REMOVE rows from idle auto-pickup; deliberate router/PO/architect
#     dispatch of a gated row is entirely unaffected).
#   - Looked up purely by `.id` (no `.detail_ref` precondition), same
#     precedence pattern as every sibling gate above.
#   - Conservative default: absent/null/empty detail `next_agent`, OR a
#     dev-role detail `next_agent`, OR a non-empty board `next_agent` = NOT
#     gated (promotable) — preserves baseline behavior for the common case.
#   [PRE-2026-07-16 semantics; SUPERSEDED — see EFFECTIVE-DISPOSITION GATE
#    below, which drops condition 2 and reads next_agent detail-first/
#    board-fallback instead of detail-only.]
#
# EFFECTIVE-DISPOSITION GATE (FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-
# BOARD-FALLBACK-GATE, 2026-07-16):
# root cause — the PLAN-ONLY and NON-DEV-NEXT_AGENT gates above (is_plan_only
# / is_non_dev_next_agent_unrouted) read ONLY `$detail_items[.id]`
# (backlog-detail.json), whereas effective_owner() (used by the NON-DEV-OWNER
# gate) was ALREADY generalized on 2026-07-13
# (FIX-DEVTEAM-BOUNDED1-NONDEV-OWNER-BOARD-FALLBACK-GATE) to read the
# EFFECTIVE value (detail-authoritative, board-fallback). A board row
# carrying `plan_only:true` or a non-dev `next_agent` INLINE but with NO
# backlog-detail.json entry at all therefore slipped both gates. Confirmed by
# RAW dry-run: 28 promotable backlog rows leaked (4 P1:
# GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC next_agent=architect;
# FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS /
# FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE /
# FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING next_agent=ba; 17 P2, 7 P3 incl.
# all UC-*-UNVERIFIED-BATCH ba rows). This gate closes both classes:
#   - `effective_plan_only($detail_items)` — mirrors effective_supervised's
#     OR-based precedence (no `.detail_ref` precondition): a row is
#     effectively plan_only if EITHER the inline board `.plan_only` OR
#     `$detail_items[.id].plan_only` is exactly `true`. `is_plan_only()` now
#     delegates to this function (previously read
#     `$detail_items[.id].plan_only` only, ignoring an inline board flag with
#     no matching detail entry).
#   - `effective_next_agent($detail_items)` — mirrors effective_owner's
#     detail-FIRST / board-FALLBACK precedence: `$detail_items[.id].next_agent`
#     if present-and-non-empty (detail-authoritative), ELSE the board-level
#     `.next_agent` (fallback), ELSE `""` (conservative default).
#     `is_non_dev_next_agent_unrouted()` now gates whenever this EFFECTIVE
#     value is present-and-non-empty AND does NOT match the dev-role pattern
#     `^dev(-|$)|^developer$` (case-insensitive) — i.e. not zone-detect-
#     routable. The prior version's extra "AND board next_agent is empty"
#     clause is REMOVED: that clause is exactly why an inline board
#     `next_agent` naming a non-dev agent, with no detail entry at all (e.g.
#     GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC, next_agent=architect),
#     previously slipped through.
#   - A single dev-role-pattern check subsumes BOTH the architect/ba/pm/
#     agents-architect class AND the on-demand maintenance roster
#     (agent-father/system-auditor/code-janitor/claude-manager-helper/
#     cowork-refactory-expert/idea-forge/...) — this SUBSUMES the in-flight
#     FIX-DEVTEAM-BOUNDED1-MAINTLANE-NEXTAGENT-GATE (held supervised:true,
#     status_note SUPERSEDED-BY this gate; do NOT dispatch it separately).
#   - Fail-toward-safety invariant unchanged: these gates only REMOVE rows
#     from idle auto-pickup eligibility; deliberate router/PO/architect
#     dispatch of a gated row is entirely unaffected; a genuinely dev-routable
#     row (effective next_agent matching the dev-role pattern) stays
#     promotable.
#
# Mutation (single row only):
#   backlog[] -> ready[] ; status BACKLOG/TODO -> READY ; stamp promoted_at /
#   promoted_by / promotion_note. Also stamps
#   .task_board.last_triaged_at / .task_board.last_triaged_by.
#
# NO hardcoded task-id literals anywhere in this file (grep-verified).
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" \
#     --slurpfile detail docs/data/orch/archive/backlog-detail.json \
#     -f scripts/devteam-backlog-promote-bounded1.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Pointer: docs/agents/dev-team/flow/main.md § Idle-capacity backlog pickup
# (BOUNDED-1), inserted at the head-idle fall-through before Step 1 PO triage.

def priority_rank:
  ((.priority // "") | ascii_downcase) as $p
  | if   ($p | test("^p0$|^critical$"))              then 0
    elif ($p | test("^p1$|^high$"))                  then 1
    elif ($p | test("^p2$|^med(ium)?$|^normal$"))    then 2
    elif ($p | test("^p3$|^low$"))                   then 3
    else 9
    end;

def wip: ((.task_board.ready // []) | length) + ((.task_board.in_progress // []) | length);

# Normalize a raw depends_on value to an array: null -> [], a bare string
# (7/321 rows in backlog-detail.json carry a single id as a STRING, not a
# 1-element array — real-data drift, grep-verified) -> [string], array -> as-is.
def as_dep_array:
  if . == null then []
  elif (type == "string") then [.]
  elif (type == "array") then .
  else [] end;

# Effective depends_on for a candidate row (`.` = the backlog row object).
# See "DEPENDS-ON & BLOCKED-BY GATE" header comment for the precedence rule.
# Unions .depends_on, .depends, and .blocked_by fields at each location.
def effective_depends_on($detail_items):
  ((.depends_on | as_dep_array) + (.depends | as_dep_array) + (.blocked_by | as_dep_array)) as $inline
  | if ($inline | length) > 0 then
      $inline
    elif (.detail_ref != null) then
      (($detail_items[.id].depends_on | as_dep_array) + ($detail_items[.id].depends | as_dep_array) + ($detail_items[.id].blocked_by | as_dep_array))
    else
      []
    end;

# Global dep-id -> status map, scanned across EVERY task_board lane (not just
# backlog[]) so a dependency satisfied by a done_verified/done/review/qa/
# in_progress/ready row still resolves correctly. Lane order is oldest-stage
# first, done_verified LAST — so if the same id ever appears in two lanes
# (migration drift), the more-advanced status wins the merge (conservative
# toward "satisfied", never toward silently losing a legit DONE_VERIFIED).
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

# `.` = candidate row object; true if every effective depends_on entry
# resolves to DONE_VERIFIED in $status_map. Missing entirely = UNSATISFIED
# (conservative-skip).
def deps_satisfied($detail_items; $status_map):
  effective_depends_on($detail_items) as $deps
  | ($deps | length) == 0
    or ( [ $deps[] | ($status_map[.] // "MISSING") ] | all(. == "DONE_VERIFIED") );

# Effective supervised flag for a candidate row (`.` = the backlog row
# object). FIX-DEVTEAM-BOUNDED1-SUPERVISED-FLAG-GATE, 2026-07-09 — mirrors
# the effective_depends_on precedence pattern above. `supervised:true` is
# authoritatively written to docs/data/orch/archive/backlog-detail.json
# `.items[<id>].supervised` for detail_ref'd rows (e.g. the router's
# hand-stamp mitigation), but the thin task_board.backlog[] row itself may
# never carry the flag inline. A row counts supervised if EITHER location
# says true — never require both. Conservative default: absent/null in BOTH
# places = NOT supervised (promotable), preserving baseline behavior.
def effective_supervised($detail_items):
  (.supervised == true)
    or ( (.id != null) and ($detail_items[.id].supervised // false) == true );

# Effective children[] for a candidate row (`.` = the backlog row object).
# FIX-DEVTEAM-BOUNDED1-EPIC-WRAPPER-GATE, 2026-07-10 — mirrors the
# effective_supervised precedence exactly (including its "no detail_ref
# precondition" property): a row counts as an epic wrapper if EITHER the
# inline `.children` on the board row OR
# $detail_items[.id].children (docs/data/orch/archive/backlog-detail.json
# `.items[<id>].children`) is a non-empty array. Reuses as_dep_array to
# normalize null/string/array shapes defensively, same as depends_on.
def effective_children($detail_items):
  (.children | as_dep_array) as $inline
  | if ($inline | length) > 0 then
      $inline
    elif (.id != null) then
      ($detail_items[.id].children | as_dep_array)
    else
      []
    end;

def is_epic_wrapper($detail_items):
  (effective_children($detail_items) | length) > 0;

# Detail-authoritative DEFERRED* disposition for a candidate row (`.` = the
# backlog row object). FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE,
# 2026-07-12 — see "DETAIL-DEFERRED GATE" header comment above. Looked up
# purely by `.id` (no `.detail_ref` precondition), same precedence pattern as
# effective_supervised/effective_children. Conservative default: absent/null
# detail status = NOT deferred (promotable).
def is_detail_deferred($detail_items):
  if (.id == null) then false
  else
    ($detail_items[.id].status) as $ds
    | if ($ds == null) or (($ds | type) != "string") then false
      else ($ds | ascii_downcase | startswith("deferred"))
      end
  end;

# Effective owner for a candidate row (`.` = the backlog row object).
# FIX-DEVTEAM-BOUNDED1-NONDEV-OWNER-BOARD-FALLBACK-GATE, 2026-07-13 — mirrors
# the effective_supervised/effective_children precedence idiom (keyed purely
# by `.id`, no `.detail_ref` precondition), but with a detail-FIRST /
# board-FALLBACK order (the reverse of effective_depends_on's inline-first
# order) because detail is the AUTHORITATIVE owner source when it exists —
# see "NON-DEV-OWNER GATE" header comment above for the root cause this
# closes: a board row with NO backlog-detail.json entry at all (detail owner
# absent/empty) previously fell through with no owner signal even though its
# own board-level `.owner` already names a non-dev deliberate-launch agent.
#   1. `$detail_items[.id].owner` if it is a present-and-non-empty string
#      (detail-authoritative — regression guard: unchanged from prior
#      behavior for any row that DOES carry a detail entry), ELSE
#   2. the board-level `.owner` (fallback — new: only reached when detail is
#      silent/absent), ELSE
#   3. "" (conservative default — absent/empty owner in BOTH places).
def effective_owner($detail_items):
  (if (.id != null) then $detail_items[.id].owner else null end) as $detail_owner
  | if ($detail_owner != null) and (($detail_owner | type) == "string") and ($detail_owner != "") then
      $detail_owner
    else
      (.owner // "")
    end;

# Non-dev effective owner (detail-authoritative, board-fallback) + null board
# next_agent for a candidate row (`.` = the backlog row object).
# FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE, 2026-07-12 — extended by
# FIX-DEVTEAM-BOUNDED1-NONDEV-OWNER-BOARD-FALLBACK-GATE, 2026-07-13 to read
# effective_owner() instead of the detail-only owner — see "NON-DEV-OWNER
# GATE" header comment above. Gated ONLY when BOTH conditions hold;
# conservative default (absent/empty owner in BOTH places, dev-role owner in
# either place, or a non-empty board next_agent) = NOT gated (promotable).
def is_non_dev_owner_unrouted($detail_items):
  (effective_owner($detail_items)) as $owner
  | ( (($owner | type) == "string") and ($owner != "") ) as $owner_present
  | if ($owner_present | not) then false
    else
      ($owner | test("^dev(-|$)|^developer$"; "i")) as $is_dev_owner
      | if $is_dev_owner then false
        else ((.next_agent // "") == "")
        end
    end;

# Effective plan_only flag for a candidate row (`.` = the backlog row
# object). FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE,
# 2026-07-16 — see "EFFECTIVE-DISPOSITION GATE" header comment above. Mirrors
# effective_supervised's OR-based precedence (no `.detail_ref` precondition):
# a row is effectively plan_only if EITHER the inline board `.plan_only` OR
# `$detail_items[.id].plan_only` is exactly `true` — never require both.
# Conservative default: absent/null plan_only in BOTH places = NOT plan-only
# (promotable).
def effective_plan_only($detail_items):
  (.plan_only == true)
    or ( (.id != null) and (($detail_items[.id].plan_only // false) == true) );

# Effective plan_only disposition gate for a candidate row (`.` = the
# backlog row object). FIX-DEVTEAM-BOUNDED1-PLAN-ONLY-GATE, 2026-07-12 —
# EXTENDED by FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE,
# 2026-07-16 to delegate to effective_plan_only() (board-OR-detail) instead
# of reading `$detail_items[.id].plan_only` alone — see
# "EFFECTIVE-DISPOSITION GATE" header comment above.
def is_plan_only($detail_items):
  effective_plan_only($detail_items);

# Effective next_agent for a candidate row (`.` = the backlog row object).
# FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE, 2026-07-16
# — see "EFFECTIVE-DISPOSITION GATE" header comment above. Mirrors
# effective_owner's detail-FIRST / board-FALLBACK precedence (no
# `.detail_ref` precondition):
#   1. `$detail_items[.id].next_agent` if present-and-non-empty
#      (detail-authoritative), ELSE
#   2. the board-level `.next_agent` (fallback — only reached when detail is
#      silent/absent), ELSE
#   3. `""` (conservative default — absent/empty in BOTH places).
def effective_next_agent($detail_items):
  (if (.id != null) then $detail_items[.id].next_agent else null end) as $detail_na
  | if ($detail_na != null) and (($detail_na | type) == "string") and ($detail_na != "") then
      $detail_na
    else
      (.next_agent // "")
    end;

# Non-dev EFFECTIVE next_agent (detail-authoritative, board-fallback) for a
# candidate row (`.` = the backlog row object).
# FIX-DEVTEAM-BOUNDED1-DETAIL-NEXTAGENT-NONDEV-GATE, 2026-07-12 — EXTENDED /
# GENERALIZED by FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-
# GATE, 2026-07-16 (see "EFFECTIVE-DISPOSITION GATE" header comment above,
# which also SUBSUMES FIX-DEVTEAM-BOUNDED1-MAINTLANE-NEXTAGENT-GATE). The
# prior version additionally required the BOARD row's `.next_agent` to be
# null/empty before gating — that extra clause is REMOVED here: a row is now
# gated whenever effective_next_agent() (detail-first, board-fallback) is
# present-and-non-empty AND does NOT match the dev-role pattern
# `^dev(-|$)|^developer$` (case-insensitive) — i.e. it is not zone-detect-
# routable. Sibling of is_non_dev_owner_unrouted but keys off `next_agent`
# instead of `owner`. Conservative default: absent/empty effective
# next_agent, OR a dev-role effective next_agent = NOT gated (promotable).
def is_non_dev_next_agent_unrouted($detail_items):
  (effective_next_agent($detail_items)) as $na
  | ( (($na | type) == "string") and ($na != "") ) as $na_present
  | if ($na_present | not) then false
    else
      ($na | test("^dev(-|$)|^developer$"; "i")) as $is_dev_next_agent
      | (if $is_dev_next_agent then false else true end)
    end;

if (wip >= 1) then
  .   # BOUNDED-1 GATE: WIP>=1 — refuse to promote (no-op, idempotent re-run-safe)
else
  # Shape-defensive ingest (FIX-DEVTEAM-BOUNDED1-DETAIL-ITEMS-ARRAY-INDEX,
  # 2026-07-09): live docs/data/orch/archive/backlog-detail.json `.items` is
  # a plain ARRAY of 437 id-bearing objects, not an object keyed by task id.
  # effective_depends_on does object-indexing ($detail_items[.id]) below, so
  # id-key the array here at ingest time — object input passes through
  # unchanged (defensive against a future/fixture object shape too).
  (($detail[0].items // []) as $raw_items
    | if ($raw_items | type) == "object" then $raw_items
      else ($raw_items | map(select(.id != null) | {key: .id, value: .}) | from_entries)
      end
  ) as $detail_items
  | dep_status_map as $status_map
  | ( [ .task_board.backlog
      | to_entries[]
      | select(.value.status == "BACKLOG" or .value.status == "TODO")
      | select((.value | effective_supervised($detail_items)) != true)
      | select((.value | is_epic_wrapper($detail_items)) != true)
      | select(.value | deps_satisfied($detail_items; $status_map))
      | select((.value | is_detail_deferred($detail_items)) != true)
      | select((.value | is_non_dev_owner_unrouted($detail_items)) != true)
      | select((.value | is_plan_only($detail_items)) != true)
      | select((.value | is_non_dev_next_agent_unrouted($detail_items)) != true)
      | { idx: .key, row: .value, rank: (.value | priority_rank) }
    ] | sort_by([.rank, .idx])
  ) as $candidates
  | if ($candidates | length) == 0 then
      .   # nothing eligible to promote — no-op
    else
      ($candidates[0]) as $picked
      | ($picked.row.id) as $picked_id
      | ($picked.row + {
            status: "READY",
            promoted_at: $now,
            promoted_by: "dev-team (bounded-1 auto-pickup)",
            promotion_note: ("BOUNDED-1 idle-capacity backlog pickup — WIP was 0; promoted top-priority "
              + "unsupervised depends_on-eligible BACKLOG/TODO row (priority_rank=" + ($picked.rank | tostring) + ")")
          }) as $ready_entry
      | .task_board.ready = ((.task_board.ready // []) + [$ready_entry])
      | .task_board.backlog = [ .task_board.backlog | to_entries[]
          | select(.key != $picked.idx) | .value ]
      | .task_board.last_triaged_at = $now
      | .task_board.last_triaged_by = "dev-team (bounded-1 auto-pickup)"
    end
end
