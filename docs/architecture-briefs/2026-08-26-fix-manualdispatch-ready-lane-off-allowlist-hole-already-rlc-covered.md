# FIX-MANUALDISPATCH-BLIND-TO-READY-ROWS-OFF-ALLOWLIST-WITHOUT-XOR-FLAG — architect finding

**Zone:** cross-service/ (scripts/lib/, docs/agents/po/flow/, docs/agents/dev-team/flow/)
**Disposition:** OUTCOME 2/3 (per dispatch prompt) — recomputation shows the claimed hole does not
exist as a coverage gap; the prescribed AC-2 fix shape (a 4th manual-dispatch predicate) would be
actively harmful (introduces a double-dispatch race). No predicate added. Row archived DONE. One
follow-up row minted for the real, differently-shaped residual problem.

## AC-1 — corrected measurement (shared predicates, not PO's hand enumeration)

Recomputed directly against live `docs/data/orch/orch-state.json` (2026-08-26T13:5xZ) using
`scripts/lib/devteam-eligibility.jq`'s own atomic defs — `is_non_dev_next_agent_unrouted`,
`effective_supervised`/`effective_plan_only` (both false), `is_epic_wrapper`, `deps_satisfied`,
`is_detail_deferred`, `has_unbacked_sequencing_prose`, `is_design_router_allowed` — never a second
hand-maintained list:

- **Raw** (off-allowlist + neither-flag, no epic/deps/deferred/prose gates): **25** `ready[]` rows.
- **Final** (all gates applied, matching every OTHER gate `is_design_router_candidate` already
  applies): **15** rows. The 10-row delta is `deps_satisfied` correctly conservative-skipping rows
  with unmet `depends_on` — i.e. PO's 24 counted rows that are not actually dispatch-ready yet,
  which is exactly the risk AC-1's own "recompute through the shared predicates" instruction was
  written to catch.
- **By priority:** 0 P0/critical, 11 P1 + 1 `high` (=rank 1) = 12, 2 P2, 1 P3.
- **By next_agent:** 10 `agent-father`, 2 `claude-manager-helper`, 2 `ops`, 1 `qa`.
- **Confirmed disjoint from `is_ready_xor_gap`** (0 overlap; that predicate's own live set is 3
  rows) — by construction, since the new class requires NEITHER flag and `is_ready_xor_gap`
  requires XOR.
- The 3 P0s the row named (`FIX-PO-TRIAGE-INBOX-CLEAR-ECHO-PIPE-MANGLES-JSON-UNDER-ZSH-SILENT-NOOP`,
  `TASK-COWORK-CATCHUP-10`, `TASK-CRON-SKILLMD-PROBE-WIRING`) have all left the set, confirmed by
  the router's own pre-dispatch correction and independently reconfirmed here (0 P0 in the
  recomputed set).

## THE CENTRAL FINDING — this is not a coverage gap

`docs/agents/dev-team/flow/main.md`'s own **Lane × Gate Coverage Matrix**, row `ready[] F F F`
(line 803), already documents the resolution for exactly this cell:

> **RLC** (Ready-Lane Consumer), if a resolved `next_agent`/`owner` exists; a row with neither is a
> documented defensive-only edge case ... no live instances.

`scripts/devteam-backlog-claim-ready-lane-consumer.jq` (RLC's claim script) confirms this in its
own eligibility chain: `effective_supervised != true AND effective_plan_only != true AND NOT
epic_wrapper AND deps_satisfied AND NOT detail_deferred AND a resolved next_agent/owner` — **there
is no `next_agent` dev-role check and no allowlist check anywhere in this script.** Its own header
comment states the design explicitly: *"this consumer bypasses zone-detect entirely... Routing a
non-dev-owned row (e.g. next_agent=agent-father/qa) back through zone-detect's dev-only Tier-3
fallback would silently reroute it to 'developer' and discard the resolution this script just
did."* RLC's target set was **designed to include** off-allowlist non-dev `next_agent` values —
`agent-father`/`qa`/`ops` are its intended examples, not an oversight.

**Every one of the 15 recomputed rows already satisfies every one of RLC's gates** (verified
field-by-field: status ∈ {READY, TODO} ✓ for all 15; `effective_supervised`/`effective_plan_only`
both false/null ✓; not epic wrapper ✓; `deps_satisfied` ✓ by construction of the filter above; not
detail-deferred ✓; resolved `next_agent` present ✓). They are not reachable by zero pickers — they
are RLC's precise designed target class, today, unconditionally.

**Corroborating evidence, independent of this recomputation:** one of PO's own three named
examples, `CHORE-PRUNE-SPRINT-COWORK-GUARANTEED-SLOT-CATCHUP-DECISION-JOURNAL`, carries a PO note
from **2026-08-06** (`po_promote_note_20260806T2331`, same row, still live on the board) that reads:

> "Re-ran the real RLC predicates (`scripts/lib/devteam-eligibility.jq`, consumed by
> `scripts/devteam-backlog-claim-ready-lane-consumer.jq`) on a scratch copy carrying this row in
> `ready[]`: supervised=false, plan_only=false, epic=false, deps=true, deferred=false,
> resolved_dispatch_lane=claude-manager-helper — identical on every field to the positive control
> already living in `ready[]`."

PO independently confirmed RLC-eligibility on this exact row 20 days before citing it as evidence
of "zero pickers, not one" in the row that dispatched this task. The two notes contradict each
other; the earlier one (backed by a live scratch-copy replay against the real predicates) is
correct.

## Why `is_ready_xor_gap` needed a manual-dispatch predicate but "neither flag" does not

RLC's gate is an **AND**: `effective_supervised != true AND effective_plan_only != true`. A row
carrying **exactly one** flag true (XOR) fails that AND and is genuinely, permanently excluded by
RLC — that is the real reason `is_ready_xor_gap` exists and correctly needs the PO manual-dispatch
mechanism (RLC will never touch it, SLS-claim's FALLBACK requires BOTH true, DRS only reads
`backlog[]`). A row carrying **neither** flag (both false) trivially satisfies RLC's AND-gate — it
was never excluded. PO's status_note generalized `is_ready_xor_gap`'s "requires XOR" framing to the
neither-flag case by symmetry, but the exclusion is not symmetric: RLC excludes the XOR case by
construction and does not exclude the neither-flag case at all.

## Why the prescribed AC-2 fix would be actively harmful, not merely redundant

`docs/agents/po/flow/manual-dispatch-sweep.md`'s own design note (§ "Why not the `.head`/WIP-budget
path") states this sub-flow deliberately never writes `.head` or moves lane membership — it only
stamps an audit marker and folds the row into PO's own `BATCH`, which dispatches via a **separate,
uncoordinated path** (direct `Agent()` spawn, no `task_claim`/lane-move handshake with RLC's own
claim script). This is safe for the 3 existing classes only because none of them overlaps a live
automated picker: `is_drs_stranded_off_allowlist`/`is_backlog_xor_gap` scan `backlog[]` only (RLC
never reads `backlog[]`); `is_ready_xor_gap` rows are RLC-excluded by construction (previous
section). A 4th predicate targeting "off-allowlist, neither-flag, `ready[]`" would be the **first**
manual-dispatch class whose target set is identical to a live, currently-firing automated picker's
(RLC's) own target set — PO's `BATCH` could dispatch a row on the same tick RLC's claim script also
claims it, a genuine double-dispatch hazard, not a gap-fill.

## The real, differently-shaped residual problem (evidenced, not fixed here)

Several of the 15 rows are old despite being RLC-eligible the whole time:
`FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE` (P1, created 2026-07-14, 43 days),
`FIX-NOTEBOOK-PRUNE-HEADING-LEVEL-MISMATCH` / `DESIGN-COWORK-FANOUT-T1/T7` (P1, created
2026-07-21, 36 days), `CHORE-PRUNE-SPRINT-COWORK-GUARANTEED-SLOT-CATCHUP-DECISION-JOURNAL` (P3,
2026-08-06, 20 days, per the PO note above). Root cause: RLC shares the **same** `wip_in_progress
< 2` budget with BOUNDED-1/SLS/DRS (four consumers competing for two concurrency slots — currently
2/2 live, one slot occupied by this very architect task, itself DRS-dispatched), claims **exactly
one row per turn**, ordered strictly by `[priority_rank, idx]` with **no anti-starvation aging** —
against a live `ready[]` queue of 113 rows (99 at rank 0/1). A P1/P2/P3 row can legitimately wait
weeks behind a constant stream of P0/P1 arrivals under this shape. This is the SAME "shared budget
starves a slower-turn lane" class the idle-chain rotation fairness fix and the Incident-Lane
Consumer's dedicated non-shared `INCIDENT_CAP` budget were both built to close, one lane over — but
neither of those fixes covers RLC's own competing-with-3-siblings-for-2-slots throughput ceiling.
This is a real defect, but it is a **throughput/concurrency design question** (batch-claim like
ILC's `$take_budget`, a dedicated non-shared RLC budget, or a FIFO-aging tiebreak), not a
routing-coverage gap, and not fixable by adding a predicate to a sweep that must never write
`.head` or move lanes. Filed as its own row below rather than forced into this row's shape.

## Disposition

1. **No code change to `scripts/lib/po-manual-dispatch-eligibility.jq` /
   `docs/agents/po/flow/manual-dispatch-sweep.md` /
   `scripts/audits/bounded1-supervised-lane-report.sh`.** AC-2's constraints (do not widen
   `is_ready_xor_gap`, do not widen the DRS allowlist) are honored by leaving all three untouched —
   the 4th predicate they specify would not close a real gap and would open a new race.
2. Parent row archived `DONE` (findings + corrected measurement are the deliverable; the row's
   underlying question — "is this class of row reachable?" — is answered: yes, by RLC, today).
3. New follow-up row minted: `FIX-RLC-SHARED-WIP-BUDGET-SINGLE-CLAIM-STARVES-AGED-READY-ROWS`
   (P2, `backlog[]`, `next_agent: architect`) — the real, separately-scoped throughput problem.
4. The task's own SECOND, INDEPENDENT WEDGE (Step 2's 12000B prose-ceiling stamp rejection) is
   untouched — confirmed still owned by
   `FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS` (`ready[]`, P1), not
   absorbed here.

## BUILD-STANDARD

BUG-FIX/REFACTOR classification — `not-applicable` (skip). No new service, no new feature; this
cycle produced a corrected measurement + a scope decision, not an implementation.
