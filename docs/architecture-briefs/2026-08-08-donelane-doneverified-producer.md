# Done-Lane DONE_VERIFIED Producer — Architecture Brief

**Task:** FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION (P0, cross-service/)
**Author:** architect, 2026-08-08
**Companion:** FIX-DONELANE-DEVTEAM-FLOWDOC-PROSE-SYNC (agent-father, non-blocking doc sync)

## 0. Diagnosis (RAW-reverified this cycle, not trusted from the 2026-07-30 mint)

`task_board.done[]` has zero consumers; nothing ever produces the `DONE_VERIFIED` token for a row
that lands there. `deps_satisfied()` (`scripts/lib/devteam-eligibility.jq:278`) requires every dep
to resolve to the exact string `DONE_VERIFIED` — plain `DONE` starves the successor forever. This
is the THIRD instance of this repo's "documented consumer, no documented producer" defect class.

Re-ran the live board today (2026-08-08), not the 2026-07-30 snapshot:

- `task_board.done[]` = 11 rows, unchanged since the mint (no eviction has fired — see §4).
  2 of them (`TASK-COWORK-CATCHUP-2`, `FACTORY-APP-split-assembleBriefing`, both `next_agent="qa"`)
  are the task's named demonstration rows.
- Re-ran `is_bounded1_eligible` with `deps_satisfied` isolated as the sole failing gate, dep set
  restricted to "every unmet dep resolves to exactly `DONE`" (the pure token-not-verifier class,
  not "genuinely still in progress"): **6 rows still starved today** —
  `TASK-COWORK-CATCHUP-3/4/5` (P0×3, dep `TASK-COWORK-CATCHUP-2`), `FACTORY-APP-split-
  assembleEveningSummary` (P1, dep `FACTORY-APP-split-assembleBriefing`), `FU-FPT-2025Q4-STAGE4-DUP`
  (P3, dep `FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT`), `FIX-CYCLEJOB-1294-FOLLOWUP-SWEEP-UNMOCKED-LIVE-
  FETCH` (medium, dep `FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH`). Of the original 8: 1
  (`FIX-COMMIT-SWEEP-GUARD-SCRIPT-ACTUATOR-AND-NOTEBOOK-LONGTAIL`) was already resolved by PO's
  one-time hand-flip of `LAYER2`; 1 (`FIX-COMMIT-SWEEP-VICTIM-SELF-DETECT`) has drifted into a
  MIXED cause (now also blocked on a genuinely `MISSING` dep, `...-GUARD-HOOK` — no longer solely
  this defect class, out of scope here).
- **New finding, not in the original mint:** two of the blocking source rows
  (`FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT`, `FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH`) are
  **already cold-evicted** into `docs/data/orch/archive/2026-06.json` / `2026-07.json`
  `.done_tasks[]`, still at status `DONE`. They pre-date the referential-integrity eviction guard
  (`FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING`, 2026-07-28) and are **out of reach of any
  hot-file-scoped drain mechanism**, including the one this brief designs. Named explicitly in §5 as
  a separate, bounded, one-time PO/architect action — not part of this mechanism's ongoing scope.
- The task's own two named demo rows are currently *protected* from cold-eviction by that same
  referential-integrity guard (`TASK-COWORK-CATCHUP-3/4/5` and `FACTORY-APP-split-
  assembleEveningSummary` still name them live in `effective_depends_on`) — confirmed live, so the
  eviction-race risk flagged in §4 is not live today for these two, only for done[] rows with no
  live dependent.

## 1. Decision: candidate (a), implemented as an EXTENSION of the two existing Review-Lane
   mechanisms — not a new dev-team section, not (b) full schema-wide "DONE is lane-illegal"

**Rejected: full (b).** Making `DONE` a lane-illegal terminal state repo-wide would rewire every
existing developer/dev-* completion path (`execute-tier.md`, `CANONICAL:SSOT-STATUSFLIP-LANEMOVE`)
that currently lands work in `done[]` before verification — a huge, unrelated blast radius for a
defect that is precisely "the correct lane has no reader," the identical shape PO's own
`po_scope_calls_NOT_design` already diagnosed one level down for `deps_satisfied()` itself ("the
gate is correct; the PRODUCER is missing"). The same logic applies here: `done[]` is correct: it is
missing a reader, not illegal to land in.

**Chosen: (a), reusing 100% of the existing, already-reachability-proven Review-Lane machinery.**
`docs/agents/dev-team/flow/main.md` already runs two consumers against `review[]`, on two different
reachability guarantees:

- **Review-Lane QA-Drain** (idle-tick rotation slot `qa_drain` + a head-decoupled every-tick call
  site) — `status=="REVIEW" && effective_next_agent=="qa"` rows → moves them into `.task_board.qa[]`
  (status `QA`), where QA's own EXISTING `verify-committed` entry point
  (`docs/agents/qa/flow/main.md` § Direct-Commit Verify) does the real, independent verification and
  is the ONLY thing that ever flips `QA -> DONE_VERIFIED` (moving `qa[] -> done_verified[]`).
- **Review-Lane SECONDARY-Drain** (unconditional, every tick, never gates `.head`) —
  `status=="REVIEW" && effective_next_agent!="qa"` rows (including null/absent, which
  `resolved_secondary_dispatch_target()` already falls back to `"po"`) — stamps the row in place
  and dispatches whoever should triage it. Never moves lanes, never flips status.

`done[]`'s two DONE_VERIFIED-blocking-reason classes are structurally IDENTICAL to `review[]`'s two
classes — a `next_agent=="qa"` subset needing real independent verification, and a
non-qa/null-`next_agent` subset needing owner triage/surfacing. The fix is to **widen the candidate
lane each existing claim script scans from `review[]` alone to `review[] ∪ done[]`** (status
`REVIEW` or `DONE` respectively) and let every downstream mechanism — QA's `verify-committed` flip,
`resolved_secondary_dispatch_target`'s `"po"` fallback — run completely unmodified. This is the
`always_extend_not_duplicate` constraint applied literally, and it inherits the SAME reachability
guarantees already proven for `review[]` (idle-chain rotation + head-decoupled site for the qa
subset; unconditional every-tick for the SECONDARY subset) with **zero new sections, zero new bash
call sites, zero new `.head` coordination risk** — satisfying AC(1) ("wired into a lane that
actually runs") more strongly than a new section would, since a new section would need its own
reachability proof from scratch.

**Hard constraint honored (AC-3):** neither claim script's mutation logic changes at all — they
still only ever STAMP/MOVE into `qa[]` or stamp SECONDARY fields. The only thing that can ever write
`DONE_VERIFIED` is QA's own independent `verify-committed-approved` judgment, or a dispatched
non-qa agent's own explicit sign-off (subject to the same RC-VERIF gate — see §3). The producer
never self-promotes.

## 2. Component-level design

### Component 1 — QA-routed subset: `scripts/devteam-review-claim-qa-drain.jq`

Widen candidate gathering from `.task_board.review` only to the union of `.task_board.review`
(`status=="REVIEW"`) and `.task_board.done` (`status=="DONE"`), each candidate tagged with its
source lane (`{idx, row, rank, age, lane}` instead of `{idx, row, rank, age}`). `sort_by([.rank,
.age])` and `$take_budget`/`QA_CAP` batching are UNCHANGED — the combined pool is ranked exactly
like today's single-lane pool.

Mutation: still appends every picked row into `.task_board.qa[]` with `status:"QA"`,
`claimed_at:$now`. **`claimed_by` MUST stay the literal `"dev-team (review-lane qa-drain)"`
regardless of source lane** — `docs/agents/dev-team/flow/main.md`'s own `picked_batch=$(jq ...
select(.claimed_at==$t and .claimed_by==$by))` dispatch-loop query does an EXACT string match on
that field; a source-tagged `claimed_by` would silently drop done-origin rows from that tick's
BGFAN-1 spawn fan-out. Add a new ADDITIVE, non-load-bearing field instead: `drain_source_lane:
"review"|"done"` — audit trail only, never read by any exact-match query. Lane removal: filter
`.task_board.review` using only review-tagged picked idxs, `.task_board.done` using only
done-tagged picked idxs (two independent index sets — `idx` is only unique within one source
array).

No change needed to `scripts/lib/devteam-eligibility.jq` — `effective_next_agent`, `priority_rank`
already operate generically on "the candidate row object," lane-agnostic.

Both `docs/agents/dev-team/flow/main.md` call sites (idle-tick + head-decoupled) need ZERO bash
changes — same script path, same `--slurpfile detail`, no new flag. **This means the mechanism goes
live the instant the developer lands this one file — not gated on the companion prose-sync row.**

### Component 2 — non-qa/no-next_agent subset: `scripts/devteam-review-claim-secondary-drain.jq`

Same widening: union of `.task_board.review` (`status=="REVIEW"`) and `.task_board.done`
(`status=="DONE"`), same `effective_next_agent($detail_items) != "qa"` filter, same
`resolved_secondary_dispatch_target($detail_items)` resolution (UNCHANGED — its existing null/
absent/`"dev-team"` → `"po"` fallback already satisfies AC(4) for done[] rows with no next_agent,
for free). Mutation stays IN PLACE on whichever source lane the picked row lives in (no lane move,
no status change — identical to today). Selection stays single-row/tick, oldest-first across the
combined pool (unchanged age key: `updated_at // reviewed_at // created_at`).

Live-data note for the dispatch prompt text: `done[]`'s current non-qa/null-next_agent set —
`SPIKE-COWORK-DRAIN-BODY-NOT-EXECUTING-ON-WORK-TICKS` (→developer), `FIX-COMMIT-PATH-PEER-INDEX-
SWEEP-GUARD-SKILLS` (→po, null), `TRACK-CRON-AUDIT-VPS-PLANE`/`-SERVER-PLANE` (→po, null),
`FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE` (→po, null), `UNBLOCK-AGENT-MODELS-SWITCH-COMMIT-
DISPOSITION` (→agent-father), `SPIKE-DASHBOARD-TIER-HEALTH-CURL-ERR-FLAP` (→architect) — all resolve
correctly through the unmodified fallback, no allowlist needed (SECONDARY-Drain never gated on one,
unlike DRS).

### Component 3 — RC-VERIF cross-dependency (MUST READ before implementation — genuinely
   blocking, not introduced by this task)

`apps/mcp-server/src/infrastructure/orchStateSchema.ts` §8A (`checkVerificationGate`, shipped TODAY
2026-08-08 by `SYSREMAKE-P2-T2-SCHEMA-ADDITIONS`) HARD-REJECTS any write setting `status:
"DONE_VERIFIED"` unless the row carries `verification.raw_probe{tool,args,live_value_observed,
observed_at}` OR its id is in the frozen, closed `RC_VERIF_GRANDFATHERED_IDS` allowlist. Neither
`TASK-COWORK-CATCHUP-2` nor `FACTORY-APP-split-assembleBriefing` is grandfathered (list is closed,
cannot grow). `docs/agents/qa/flow/main.md`'s `verify-committed-approved` jump (line 180) does
**not yet** populate `.verification.raw_probe` — its own flow-doc wiring
(`SYSREMAKE-P2-T8-FLOW-DOC-WIRING`, `next_agent=agent-father`, status `READY`, unrelated pre-existing
row) has not landed. **Net effect: as of right now, QA's own `verify-committed-approved` flip would
be REJECTED by `orch-apply.sh`/`orch-validate.mjs` for any non-grandfathered row, independent of
whether this task's Done-Lane widening ships.**

This is not this task's defect and not in its scope to fix — but the verification_gate's required
demonstration ("show a done[] row transitioning to DONE_VERIFIED... with real command output") WILL
hit this wall if not accounted for. Two ways through, either is sufficient, do not block on the
other:
1. Sequence the demo after `SYSREMAKE-P2-T8-FLOW-DOC-WIRING` lands, or
2. (faster — `VerificationSchema` is already schema-valid today, only the flow-doc PROSE reminder is
   missing) have QA construct a compliant `raw_probe` object by hand from evidence it already
   collects during `verify-committed` (e.g. `tool:"bun test"`/`git show --stat <commit>`,
   `live_value_observed:"<pass-count / diff output>"`, `observed_at:<qa_verified_at>`) when it
   processes the two named demo rows.

Flag this prominently to whoever runs the verification_gate — a rejected write here will look like a
Done-Lane Drain defect but is actually this independent, concurrently-landing sibling gate.

### Component 4 — Visibility instrument extension: `scripts/audits/devteam-review-lane-drain-report.sh`

Add two new read-only sections mirroring the existing PRIMARY/SECONDARY tables exactly (same
`age_days`/`print_table` shape): **DONE-LANE PRIMARY** (`done[]`, `status=="DONE"`,
`next_agent=="qa"`) and **DONE-LANE SECONDARY** (`done[]`, `status=="DONE"`, `next_agent!="qa"`,
display-resolved via `resolved_secondary_dispatch_target`). Extend the existing staleness FAIL
predicate to also fail if DONE-LANE PRIMARY is non-empty and every row is `>= STALE_DAYS` old — same
"is the drain actually reachable" semantics, now covering both source lanes with one flag. In-place
extension, same file, same name (no rename — the file is already referenced by name in main.md's
Reusable Scripts section and would otherwise need a second edit purely for cosmetics).

### Component 5 — NEW regression instrument (AC-6): `scripts/audits/devteam-deps-satisfied-sole-failure-report.sh`

Mechanizes exactly the "leg 1" evidence PO derived by hand on 2026-07-30 (`scripts/po-triage-
20260730T2148-donelane-doneverified-producer-starvation.jq`'s own header) so this class is
detectable next time without re-deriving the jq from scratch. Read-only, live board:

```bash
jq --slurpfile detail docs/data/orch/archive/backlog-detail.json \
   --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) \
   'include "scripts/lib/devteam-eligibility";
    (detail_items_from($detail)) as $detail_items
    | (dep_status_map($archive)) as $status_map
    | [ (.task_board.backlog + .task_board.ready)[]
        | select(
            (effective_supervised($detail_items) != true)
            and (is_epic_wrapper($detail_items) != true)
            and (is_detail_deferred($detail_items) != true)
            and (is_non_dev_owner_unrouted($detail_items) != true)
            and (effective_plan_only($detail_items) != true)
            and (is_non_dev_next_agent_unrouted($detail_items) != true)
            and (has_unbacked_sequencing_prose($detail_items) != true)
          )
        | select(deps_satisfied($detail_items; $status_map) | not)
        | (effective_depends_on($detail_items)) as $deps
        | { id, priority,
            unmet: [ $deps[] | ($status_map[.] // "MISSING") as $s
                     | select($s != "DONE_VERIFIED") | {dep: ., status: $s} ] }
      ]' \
   docs/data/orch/orch-state.json
```

Reuses `is_bounded1_eligible`'s 7 sub-gates + `deps_satisfied`/`dep_status_map` from the REAL
`scripts/lib/devteam-eligibility.jq` verbatim (no reimplementation — the task's own AC-6 wording
requires this). Prints every currently-starved row with its named unmet-dep(s) and their raw status
(`DONE`, `MISSING`, or any other non-`DONE_VERIFIED` value) — directly satisfies AC(5)'s "any row
still starved must have a named reason." Exit 0 always (pure reporting tool, same informational
posture as `bounded1-supervised-lane-report.sh`'s SECONDARY section — there is no "is the mechanism
reachable" claim to falsify here, this script IS the detector).

### Component 6 — Defense-in-depth: `scripts/orch-cold-evict.sh` done[]-eviction guard

The already-cold-archived-while-DONE casualties found in §0 happened because `orch-cold-evict.sh`'s
`done[]` pass (`KEEP_RECENT_DONE=10` / `DONE_MAX_AGE_DAYS=7`, age+count based) evicts a row purely on
age/rank, with **no distinction between `status=="DONE"` (unverified) and `status=="DONE_VERIFIED"`
(verified)**. The referential-integrity eviction guard (2026-07-28) only protects a `DONE` row that
still has a LIVE dependent naming it — it did not exist before 2026-07-28 and does not protect a
`DONE` row with zero live dependents. Recommend a narrow, additive guard in the `done[]` eviction
predicate (near line 437-470): **exclude any candidate with `.status == "DONE"` from eviction
entirely** — only a `DONE_VERIFIED` row sitting in `done[]` (a legacy/inconsistent lane placement,
already-verified) remains eligible for age/count-based eviction. This is a narrowly-scoped version
of design candidate (b)'s spirit ("a lingering unverified row must never be silently lost") without
touching the schema or any completion path's blast radius — it closes the exact, now-demonstrated
failure mode (`FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT` / `FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-
FETCH`) from ever recurring, independent of whether a dependent happens to exist. Not required for
this task's acceptance gate (the 2 named demo rows are unaffected by eviction either way — see §0)
but flagged as a same-file, low-risk, high-leverage companion hardening; developer's call whether to
fold it into the same PR or track separately.

## 3. Non-goals / explicit exclusions

- No new `docs/agents/dev-team/flow/main.md` section. No new bash call site. No new `.head`
  coordination path.
- No change to `scripts/lib/devteam-eligibility.jq` (fully reused as-is).
- No PO `manual-dispatch-sweep.md` change — `resolved_secondary_dispatch_target`'s existing `"po"`
  fallback already covers AC(4) once Component 2 lands.
- Does NOT retroactively reach the 2 already-cold-archived DONE rows named in §0 — flagged as a
  separate, bounded PO/architect action (§5), not part of this mechanism.
- Does NOT touch QA's own verification judgment or its `verify-committed`/`pipeline`/`approved`
  logic beyond the pre-existing, unmodified fact that `qa[]` is where it already looks.

## 4. Risk register

| Risk | Mitigation / status |
|---|---|
| RC-VERIF `raw_probe` gate rejects the demo flip (§3) | Flagged prominently; 2 workarounds given, neither blocks this task |
| Cold-eviction races a slow-draining done[] row out of hot reach | Referential-integrity guard already protects both named demo rows (verified live, §0); Component 6 closes the general case going forward |
| `done[]`-origin rows may lack top-level `commit`/`files[]` (QA's declared self-contained Input shape) — confirmed live on `FACTORY-APP-split-assembleBriefing` | QA's OWN flow already documents a fallback for this exact shape ("row predates the drain, missing commit/files[]/owner" — derive from `review_note`/`git log`) and has ALREADY successfully done so for this row historically (its `review_note` carries a full, real verification with commit ids embedded in prose). Companion row adds one clarifying sentence widening that fallback's stated applicability to done[]-origin rows; not a new mechanism. |
| Combining done[]'s handful of SECONDARY rows into review[]'s single-row/tick cap could slow review[]'s SECONDARY throughput while done[]'s backlog (~7 rows, all older than most review[] rows) drains | Accepted, self-limiting, bounded (~7 rows, one-time backlog) — same "measure, then batch" posture QA-Drain itself followed before its 2026-08-06 throughput fix; revisit only if measured insufficient |
| Sharing QA-Drain's `QA_CAP=10` budget between review[] and done[] | Accepted — done[]'s qa-routed set is currently 2 rows, priority P0, will rank at/near the top of any batch; negligible budget pressure |

## 5. Residual, out-of-scope, PO-actionable

- `FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT` (blocks `FU-FPT-2025Q4-STAGE4-DUP`, P3) and
  `FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH` (blocks `FIX-CYCLEJOB-1294-FOLLOWUP-SWEEP-
  UNMOCKED-LIVE-FETCH`, medium) are cold-archived, pre-guard casualties (§0) — same disposition as
  `LAYER2` (a one-time, evidence-backed PO/architect hand-verification+flip is the only path that
  reaches them; no ongoing mechanism can, since they are no longer in the hot file at all).
- `FIX-COMMIT-SWEEP-VICTIM-SELF-DETECT` no longer belongs purely to this defect class (now also
  blocked by a genuinely `MISSING` dep, `...-GUARD-HOOK`) — separate issue, not actioned here.

## 6. Implementation split (2 commit zones, developer + agent-father — see board rows)

- **Developer** (`FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION`, this row): Components 1,
  2, 4, 5, and (optional, same-file) 6 — all `scripts/`, outside agent-father's `commit_zone`.
- **Agent-father** (companion `FIX-DONELANE-DEVTEAM-FLOWDOC-PROSE-SYNC`): `docs/agents/dev-team/
  flow/main.md` § Lane × Gate Coverage Matrix (new `done[]` rows), § Review-Lane QA-Drain / §
  Review-Lane SECONDARY-Drain intro clarifying sentences, § Reusable Scripts pointer updates;
  `docs/agents/qa/flow/main.md` § Direct-Commit Verify fallback-note widening + the RC-VERIF
  cross-reference from §3. **Non-blocking** — the mechanism is fully live the moment Components 1-2
  land; this row is documentation/audit-trail currency only.
