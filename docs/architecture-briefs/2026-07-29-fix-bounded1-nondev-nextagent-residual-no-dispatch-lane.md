<!-- size-justification: single-lane design brief (one new dev-team idle-fallthrough consumer) sharing one live-data evidence trail (stale-count correction, agent-risk breakdown, sibling-bug precedent) across the 4 explicit reasoning points the task required; splitting per-point loses the cross-cutting WIP-budget/ordering argument that only holds together. -->
# FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE — Architect Design Brief

**Task:** `FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE` (P1, `supervised:true`, `plan_only:true`, zone `cross-service/`, size M)
**Author:** architect · **Date:** 2026-07-29
**Mode:** `plan_only:true` — design only, **zero code/script/flow-doc edits made this cycle**. Implementation is a separate downstream dispatch.
**BUILD-STANDARD:** not-applicable (bug-fix/refactor, in-zone, no new microservice/primitive — extends the existing dev-team flow-doc + shared eligibility library).

---

## 0. Ticket-premise correction (live re-verification — do not trust the stale count)

The row's own `desc` cites **61** rows (1 P0, ~24 P1) from po's 2026-07-29T12:07Z triage tick. Re-ran live against current `orch-state.json` (2026-07-29T21:2xZ, same day, ~9h later):

```
include "scripts/lib/devteam-eligibility";
select(is_non_dev_next_agent_unrouted($detail_items))
  and NOT(effective_supervised($detail_items) AND effective_plan_only($detail_items))
```
scoped to `.task_board.backlog[]` with `status ∈ {BACKLOG, TODO}` (same status filter BOUNDED-1/SLS themselves use) — **live count: 122** (1 P0, 55 P1, 52 P2, 13 P3). Widening the status filter to also include `BLOCKED` backlog rows: **130**. The stale 61 undercounts by 2×+ in under 9 hours — this is the same "known-shape pattern-matched without re-verifying" risk this project has been bitten by before; the task's own instruction to re-verify was correct to insist on. **122 is the number this brief designs against**, scoped identically to how BOUNDED-1/SLS scope their own candidate set (status BACKLOG/TODO; BLOCKED rows are excluded from every existing auto-pickup lane on the same "not yet unblocked" logic and DRS should not special-case that).

The existing `bounded1-supervised-lane-report.sh` **SECONDARY section (83 rows, "supervised XOR plan_only")** is a **different, non-equivalent set** from the one this task describes — flagging explicitly rather than silently treating them as the same instrument. SECONDARY requires at least one of the two flags to be `true`; this task's residual set is defined by `is_non_dev_next_agent_unrouted` (a `next_agent`/routing condition) minus the SLS-caught subset (a flag condition) — of the live 122, **86 carry NEITHER `supervised` nor `plan_only`** (pure mint-time next_agent-only rows), 16 are supervised-only, 20 are plan_only-only. The report script's SECONDARY section is neither a superset nor subset of this task's target — it does not surface most of these 122 rows at all. Recommend (§5) extending the report script with a dedicated section for this exact predicate rather than continuing to conflate it with SECONDARY.

---

## 1. Brownfield verification (this session, live)

Read in full: `docs/agents/dev-team/flow/main.md` §420-730 (Step 0b resume gates through Review-Lane QA-Drain + Session Gate), `scripts/lib/devteam-eligibility.jq` (432L, the shared predicate contract), `scripts/devteam-backlog-promote-bounded1.jq`, `scripts/devteam-backlog-promote-supervised-lane-sweep.jq` + its claim script, `scripts/devteam-backlog-claim-ready-lane-consumer.jq`, `scripts/devteam-review-claim-qa-drain.jq`, `scripts/devteam-wrapper-autoclose.jq`, `scripts/audits/bounded1-supervised-lane-report.sh`, `docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md` (today's sibling brief — the `.head` clobber precedent this task explicitly requires reasoning about), `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` (the pending fairness-rotation redesign of this same fall-through chain). Confirmed live via `orch-state.json`: `.head.active_task_id` is currently THIS row (dispatched by SLS, `next_agent:"architect"`) — consistent with the task's own framing. Confirmed the idle-chain rotation (`FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION`, P0) has **not shipped yet** — still `BACKLOG`, blocked on `TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES` (currently `REVIEW`) — so the fixed-priority sequential chain (BOUNDED-1→SLS→RLC→QA-Drain→Step 1) this brief targets is still the live mechanism, not a soon-to-be-replaced one; ordering advice below is for that live mechanism, with an explicit forward-compat note (§3.4c) for when rotation lands.

---

## 2. Design — Design-Router Sweep (DRS)

New idle-fallthrough consumer, mirroring SLS's shape (promote-then-claim pair, both through `orch-apply.sh`, `--slurpfile detail`/`--slurpfile archive` threaded identically). Named to distinguish it from SLS (flag-gated quarantine dispatch) — DRS dispatches on **routing** (`next_agent` names a non-dev deliberate-launch agent), not on a supervised/plan_only flag.

### 2.1 Eligibility (candidate: `.task_board.backlog[]`, `status ∈ {BACKLOG, TODO}`)

Reuse `scripts/lib/devteam-eligibility.jq` verbatim — **zero new predicates needed for the base gate**, every one of these already exists and is exactly what the task's own "residual gap" is defined in terms of:

```
select(is_non_dev_next_agent_unrouted($detail_items))                                    # the residual condition itself
select( NOT ( effective_supervised($detail_items) AND effective_plan_only($detail_items) ) )  # excludes SLS's own target set — no double-claim race
select( NOT is_epic_wrapper($detail_items) )
select( deps_satisfied($detail_items; $status_map) )
select( NOT is_detail_deferred($detail_items) )
select( NOT has_unbacked_sequencing_prose($detail_items) )
```
This is a strict AND of predicates SLS/BOUNDED-1 already carry — no forked logic, one more `include` consumer of the existing shared-contract file (continuing the project's own "one shared eligibility contract" design principle — 4+ near-miss defects already came from hand-copied divergence; do not add a 5th copy).

**PLUS one new gate this task does need — the agent-identity allowlist (§2.2 below).** Everything above this line answers "is this row eligible for automated non-dev dispatch at all"; the allowlist answers "which non-dev agents is THIS lane specifically allowed to auto-dispatch to."

### 2.2 Agent-identity allowlist — narrower than SLS, deliberately (answers the task's point 4)

**SLS does not filter by which agent it dispatches to** — and that is correct for SLS, because SLS's target rows are *already* double-vetted: a human/PO explicitly marked them BOTH `supervised:true` AND `plan_only:true` at mint time, which is itself the safety control. DRS has no equivalent input signal — 86 of the 122 live rows carry **neither** flag; they are simply routed rows sitting in `backlog[]`. Without a flag-based safety net, DRS needs a **different** compensating control: restrict WHICH resolved `next_agent` values it is willing to blind-dispatch.

Live breakdown of the 122-row residual set by resolved `next_agent`:

| next_agent | n | supervised/plan_only-flagged | unflagged |
|---|---|---|---|
| ba | 45 | 18 | 27 |
| agent-father | 36 | 5 | 31 |
| architect | 22 | 9 | 13 |
| ops | 5 | 0 | 5 |
| pm | 5 | 1 | 4 |
| po | 3 | 1 | 2 |
| ops-mainserver-fetch | 2 | 0 | 2 |
| qa | 2 | 1 | 1 |
| agents-architect | 1 | 1 | 0 |
| ops-vps-fetch | 1 | 0 | 1 |

The 7 agent types the task prompt names (`architect`, `agents-architect`, `po`, `pm`, `ba`, `agent-father`, `system-auditor`) are **not uniform risk**. `docs/data/system-map.json`'s own `type` field buckets all 7 as `dev-core` (a catch-all for "not a zone-scoped dev-* / not ops / not cowork" agent) — that field does **not** distinguish design-only from implementation-capable agents; per-agent charter + tool grant has to be read individually:

- **architect** (this agent): `boundary_rules.forbidden_outputs` explicitly bans writing production code; tool package is read/design/handoff-only.
- **ba / pm / po**: spec-writing, decomposition, decision-recording — no code-execution tool grants, no direct repo-write path outside their own handoff/board conventions.
- **agents-architect**: agent-lifecycle meta-design (creates/edits agent definitions) — narrow, self-contained blast radius.
- **agent-father**: its own `init.md` states `not_my_job: "Writing production code — that's developer"`, BUT its live frontmatter tool grant is `Read, Edit, Write, Glob, Grep, Bash` — the same broad footprint as a developer, and unlike architect/ba/pm/po it is NOT structurally prevented from touching arbitrary repo files if it drifted off-charter. Spot-checked 8 of its 36 live rows in this set (e.g. `FIX-ALERT-COMMANDER-NO-BASH-GRANT-NOTEBOOK-UNCOMMITTABLE`) — genuinely in-charter (agent frontmatter/tool-grant fixes), so today's live rows look correctly routed; the risk is the **tool grant**, not evidence of current misuse.
- **ops / ops-mainserver-fetch / ops-vps-fetch**: memory record ★ `feedback_ops_readonly_diagnostic_wrote_to_live_index_and_burned_the_headroom.md` and ★ `feedback_ops_specialist_pushes_backlog_directly.md` — ops has a demonstrated history of live-system side effects even on nominally read-only tasks. Not a "design/decision" agent class at all; auto-dispatching an ops row with zero human gate is a materially different risk than dispatching a design brief.
- **qa**: has its own dedicated drain lane already (Review-Lane QA-Drain, `qa[]<1` budget, `review[]`-scoped). A `backlog[]` row naming `qa` as `next_agent` is outside that lane's scope entirely and not something this task's evidence base analyzed.
- **system-auditor**: 0 live rows in the current 122-row set (present in the task prompt's illustrative list, not in the live data) — no evidence either way; do not silently include it in an allowlist on the strength of the prompt's wording alone.

**Recommendation: DRS's default allowlist = `{architect, ba, pm, po, agents-architect}`** — pure design/decision/coordination agents, zero broad production-write tool grants, structurally the closest analogue to what SLS already proves safe (SLS, live right now, dispatched THIS very row to `architect` with no incident). This covers **76 of the 122 live rows** (2 P0, 31 P1, 35 P2, 8 P3) — the clear majority, immediately.

**Explicitly excluded from DRS's default allowlist, flagged for a separate PO ruling rather than silently decided by this brief:** `agent-father` (36 rows, ~30% of the set — material enough that narrowing it out is a real scope call, not a rounding error), `ops`/`ops-mainserver-fetch`/`ops-vps-fetch` (8 rows), `qa` (2 rows, wrong lane for this mechanism regardless). A row whose resolved `next_agent` is not on the allowlist stays exactly where it is today — inert in `backlog[]`, reachable only by deliberate PO/router dispatch — **DRS narrows the gap, it does not claim to close all of it**, and says so rather than silently under-scoping without a flag. This is a policy/risk-tolerance call, not a pure engineering one; PO should ratify (or widen) the allowlist before implementation, same as PO ratified the aged-round-robin design choice for the sibling idle-chain brief.

### 2.3 WIP / concurrency budget — explicit position (answers the task's point 2)

**DRS shares the SAME `WIP<2` (`.task_board.in_progress` length only) budget SLS/RLC already share — a 4th writer of the existing named slot, NOT a new/independent budget**, and NOT QA-Drain's model (dedicated `qa[]<1`). Reasoning:

- QA-Drain's dedicated budget exists **because** it writes into a structurally different lane (`task_board.qa[]`) with a different concurrency meaning (verification sessions, orthogonal to "in-flight work"). DRS's claimed rows move into `task_board.in_progress[]` — the **same** lane, the **same** concurrency meaning ("one dev-team-tracked session actively occupying `.head`/resume-tracking") that BOUNDED-1/SLS/RLC already meter. There is no structural reason for DRS's claim to be exempt from that meter — it is not writing into an orthogonal lane, it is the identical resource.
- BOUNDED-1's own promote-script header already states the WIP≤2 slot's *purpose*: "the existing, separate router/PO WIP budget for supervised/manual dispatch." A design/decision-agent auto-dispatch (DRS) is squarely inside that same purpose category, not a new one.
- Giving DRS its **own** third independent budget on top of the existing WIP<1 (BOUNDED-1) + WIP<2 (SLS/RLC) would silently raise total system in-flight concurrency past the deliberately-chosen 2-slot ceiling with no re-ratification of that ceiling — this project's memory already names this exact class of drift (`UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK`, "instance 9 on the count-threshold-gate class"). Reusing the existing counter avoids reintroducing it a 10th time.

### 2.4 Chain placement — explicit ordering recommendation (answers the task's point 3)

**Insert DRS 4th in the existing fixed sequential fall-through: BOUNDED-1 → SLS → RLC → `DRS` → QA-Drain → Step 1.** (I.e., immediately after RLC's block, immediately before Review-Lane QA-Drain's block, still inside the same head-idle fall-through, still before Step 1 PO triage.)

Reasoning:
- **Trust ordering, preserved.** The existing 3 consumers of the shared WIP≤2/WIP<1 budget are already, implicitly, ordered from most- to least-vetted: BOUNDED-1 (fully unattended autonomous code-fixes — highest trust, narrowest blast radius per dev-role gating), SLS (PO-marked-both-flags deliberate-dispatch quarantine — explicit human intent recorded at mint time), RLC (already-promoted `ready[]` entries from any source, no flag gate beyond not-supervised/not-plan_only, but already resolved and already staged). DRS is, by construction, the **least**-vetted of the four — it fires on rows carrying **zero** deliberate-dispatch signal in 86/122 of live cases, its only compensating control being the new agent-allowlist (§2.2). Placing it last among the WIP-budget competitors means it only spends the shared slot when nothing with a stronger safety justification wanted it that tick — it does not compete ahead of SLS's PO-marked class or RLC's already-staged/dependency-ordered class.
- **Relative to QA-Drain: no resource-contention question, so preserve QA-Drain's existing position unchanged.** QA-Drain's `qa[]<1` budget never overlaps DRS's `in_progress` budget — inserting DRS before or after QA-Drain has zero effect on either one's own gate. The only reason to put DRS *before* QA-Drain rather than after is to avoid perturbing QA-Drain's own section (§674-726 in `main.md`) at all — zero bytes inside that block change, matching this same project's own stated preference (see `FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION`'s own AC: "BOUNDED-1/SLS/RLC/QA-Drain blocks byte-unchanged").
- **Do not insert before SLS or RLC.** Before SLS would let the *least*-vetted class (DRS) compete for the shared slot ahead of the *most*-vetted non-dev class (SLS's PO-marked rows) — inverting the existing trust order for no benefit. Before RLC would let a fresh, previously-untriaged backlog pick compete ahead of already-staged `ready[]` rows that may carry live sibling `depends_on` chains (RLC's own header: "without this gate a naive priority-only picker would dispatch T9 before T1 even exists") — RLC's target set is more time/dependency-sensitive today than DRS's.

**§2.4c — forward-compatibility note (do not let this rot).** `FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION` (P0, still `BACKLOG`, blocked on a `REVIEW`-status schema task) will eventually replace this fixed sequence with an aged round-robin over the same 5 named consumers (`bounded1`, `sls`, `rlc`, `qa_drain`, `step1_triage` — `scripts/lib/devteam-eligibility.jq`'s `rotation_selected()`, already merged, not yet wired into `main.md`). That redesign only changes **which** consumer gets a turn per tick, never what a consumer's own block does. Recommend the downstream implementation task for DRS carry `depends_on` on whichever rotation task lands closest to shipping at implementation time (currently `FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION`, or its schema/main-flow follow-ups if those land first) with the explicit instruction: **add `"drs"` as a 6th rotation participant at the same fairness level as the other 5**, not nested inside/subordinate to any of them. The ordering argument in §2.4 above (4th-in-sequence) is "day-1, fixed-chain" guidance only — it becomes moot, by design, the moment fairness rotation ships, and should not be read as a permanent priority ranking.

### 2.5 `.head` write safety — mandatory conditional-guard shape (answers the task's point 1)

**The DRS claim script MUST use the safe conditional-write shape from day one — never an unconditional `.head = {...}` replace, even though DRS's placement (§2.4, same head-idle fall-through as SLS/RLC) makes an unconditional write *theoretically* safe by the same control-flow argument SLS/RLC's own headers already make ("`.head` is still idle whenever this block runs").** That exact argument was proven fragile *today*, on a sibling lane, in this same codebase: `scripts/devteam-review-claim-qa-drain.jq`'s unconditional `.head` overwrite was safe under the ORIGINAL placement assumption, until dev-team's own filed remedy proposed widening QA-Drain's reachability (running it independent of the head-idle gate) — at which point PO's live dry-run showed it would have silently clobbered a genuinely-running task's resume pointer (`docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md §2`). "Theoretically safe by current placement" is not a durable invariant in this flow-doc — a later, well-intentioned reachability change can silently violate it, and did.

Mandated shape (mirrors `scripts/devteam-wrapper-autoclose.jq:122-128`'s clear-direction guard, applied in the claim/write-INTO-head direction per the qadrain brief's own §3 pattern):

```jq
| ((.head.status // "idle") as $hs
   | (.head.active_task_id // null) as $ha
   | ($hs == "idle" or $hs == "done" or $ha == null)) as $head_free
| .head = (
    if $head_free then
      { status: "in_progress", active_task_id: $picked_id, next_agent: $picked.lane,
        next_action: ("Design-Router Sweep claim of " + $picked_id + " — spawn " + $picked.lane
          + " DIRECTLY (no zone-detect indirection; lane already resolved at promote time)."),
        updated_at: $now, updated_by: "dev-team (design-router sweep)" }
    else
      .head   # a DIFFERENT task is genuinely live in .head — never clobber it
    end
  )
```
Cost of this guard at the CURRENT (day-1, fixed-chain) call site is zero — `$head_free` is always true there, identical to the qadrain brief's own finding for its call site. The payoff: if a future task ever tries to widen DRS's reachability (e.g. a "run DRS on busy ticks too" enhancement, exactly the shape QA-Drain's Part 2 needed), it is safe-by-construction from day one, instead of requiring a second emergency SPIKE the way QA-Drain needed one. No unconditional `.head` replace is proposed or implied anywhere in this design.

### 2.6 Promote + claim shape (mirrors SLS exactly)

- **Promote** (`scripts/devteam-backlog-promote-design-router-sweep.jq`, new): candidate lane `.task_board.backlog[]`, filters per §2.1 + §2.2 (allowlist check on `resolved_dispatch_lane($detail_items)`), ordered by `priority_rank` ascending / backlog-index tiebreak (same FIFO-proxy convention as every sibling), exactly ONE row promoted per invocation. Stamps `promoted_at`/`promoted_by="dev-team (design-router sweep)"`/`promotion_note`/`dispatch_lane` — **never clears `supervised`/`plan_only`** on the 36/122 rows that happen to carry exactly one of the two flags (additive stamp only, identical constraint SLS already honors).
- **Claim** (`scripts/devteam-backlog-claim-design-router-sweep.jq`, new): moves the DRS-stamped `ready[]` row → `in_progress[]`, sets `.head.next_agent` to the row's own already-resolved `dispatch_lane` directly (never a `"developer"` fallback — same as SLS's claim script), using the §2.5 conditional-guard shape. No-op if nothing DRS-stamped is waiting.
- Both writes go through `scripts/orch-apply.sh` ONLY. Caller dispatches the resolved specialist DIRECTLY (never `JUMP TO execute`) — identical rationale to SLS/RLC: zone-detect's Tier-3 fallback only ever resolves `dev-<service>`/`developer` and would silently discard the already-resolved non-dev lane.

---

## 3. Related finding — NOT in scope for this task, flagged rather than silently left

While verifying the §2.5 precedent, checked whether QA-Drain's unconditional-`.head`-overwrite bug is unique to that one script. It is not: **`scripts/devteam-backlog-claim-bounded1.jq:57`, `scripts/devteam-backlog-claim-supervised-lane-sweep.jq:66`, and `scripts/devteam-backlog-claim-ready-lane-consumer.jq:151` all perform the identical unconditional `.head = {...}` whole-object replace** — currently safe only by the same "control-flow proves head is idle at this point in the sequence" argument that was just shown, live, to break the moment someone proposes widening any one of their reachability windows. This is a systemic pattern across the whole idle-fallthrough chain, not a QA-Drain-specific defect. Recommend PO mint a separate, narrowly-scoped hardening row (e.g. `FIX-DEVTEAM-HEADCLAIM-UNCONDITIONAL-OVERWRITE-PATTERN`) to retrofit the same §2.5 conditional-guard shape onto all three existing claim scripts, independent of and not blocking this task — flagging per this project's "detect debt, don't silently accept" standing instruction, not proposing to fix it inside this plan_only design cycle.

---

## 4. Files to create / modify (for the downstream implementation task)

| File | Change | Layer |
|---|---|---|
| NEW `scripts/devteam-backlog-promote-design-router-sweep.jq` | §2.6 promote half | infra/tooling script |
| NEW `scripts/devteam-backlog-claim-design-router-sweep.jq` | §2.6 claim half, §2.5 conditional-guard `.head` write | infra/tooling script |
| `docs/agents/dev-team/flow/main.md` | New `### Design-Router Sweep (DRS)` section, inserted per §2.4 (after Ready-Lane Consumer, before Review-Lane QA-Drain) — mirrors the SLS/RLC section shape exactly | interface (orchestration doc) |
| `scripts/lib/devteam-eligibility.jq` | No new predicates required (§2.1) — if PO ratifies a fixed allowlist (§2.2), add one small `def is_design_router_allowed($allowlist): ... IN($allowlist[])` helper or inline the check; keep it in the shared file, not forked | infra/tooling script |
| `scripts/audits/bounded1-supervised-lane-report.sh` | Add a dedicated report section for this exact predicate (§0) instead of continuing to conflate it with the existing SECONDARY (supervised-XOR-plan_only) section | test/instrument |
| NEW acceptance/regression instrument (pattern: `scripts/audits/devteam-dispatch-gate-satisfiability.sh`'s existing per-lane fixtures) | DRS promote+claim fire on a live-shaped fixture; allowlist correctly excludes `agent-father`/`ops*`/`qa`; `.head` conditional-guard negative control (pre-seed a busy `.head`, assert byte-identical after) | test |
| `docs/policies/dev-standards.md` | CANONICAL pointer entries for the 2 new scripts (Script Persistence rule) | docs |

No `apps/**` touch — dispatcher/orchestration-doc + shared-library work only, zero business-rule surface, no new MCP tool.

---

## 5. Test strategy / DoD (mapped for the downstream implementer)

- **Selection correctness:** synthetic fixture with a mix of (non-dev-next_agent + neither flag), (non-dev-next_agent + supervised-only), (non-dev-next_agent + plan_only-only), (non-dev-next_agent + both flags — must NOT be picked, SLS's territory), (dev-role next_agent — must NOT be picked, BOUNDED-1's territory) — assert DRS picks only the first three categories, restricted to the ratified allowlist.
- **`.head` safety (positive + negative control, mirrors §6 of the qadrain sibling brief):** `.head` idle/missing before invocation → written with the picked row (regression-guards intended behavior). `.head` pre-seeded busy (unrelated `in_progress` task) before invocation → byte-identical after (mechanizes the exact defect class §2.5/§3 discuss).
- **Budget-sharing proof:** with `in_progress|length == 2` already, DRS's gate must read false (no-op) — same `WIP<2` read BOUNDED-1/SLS/RLC already use, not a separate counter.
- **Live satisfiability (not just resolution) — same lesson `bounded1-supervised-lane-report.sh`'s own header already records:** extend `scripts/audits/devteam-dispatch-gate-satisfiability.sh` with a DRS fixture proving the gate actually FIRES and DRAINS a row end-to-end, not merely that the selection predicate resolves a plausible id in isolation.

---

## 6. Open questions for PO ratification (explicitly not decided unilaterally here)

1. Ratify or widen the §2.2 default allowlist `{architect, ba, pm, po, agents-architect}` — in particular, whether `agent-father` (36/122 rows, ~30%) should be included now, included with an extra per-row gate (e.g. only when the row is ALSO `owner`-tagged as an agent-definition task), or deferred to a separate follow-up.
2. Whether `system-auditor` should be pre-added to the allowlist even though it has 0 live rows today (schema-forward decision) or added only if/when it actually appears.
3. Confirm the §3 related-finding (systemic unconditional-`.head`-overwrite pattern across BOUNDED-1/SLS/RLC's own claim scripts) should become its own tracked row now, rather than waiting for another incident to force it.

---

## RETURN
DONE: Design complete — new "Design-Router Sweep (DRS)" idle-fallthrough consumer specified: shares the existing WIP<2 in_progress budget (4th writer, not a new budget); placed 4th in the fixed chain (after RLC, before QA-Drain), with an explicit forward-compat note for the pending idle-chain rotation; mandates the safe conditional-guard `.head` write shape from day one (never an unconditional replace); scopes eligibility to a narrower, explicit agent-identity allowlist than SLS's (flag-based) gate, given 86/122 live rows carry no deliberate-dispatch flag at all — PO ratification requested on the allowlist boundary. Live baseline re-verified and corrected (61 stale → 122 live, BACKLOG/TODO-scoped). One related-but-out-of-scope systemic finding flagged (§3): BOUNDED-1/SLS/RLC's own claim scripts share the exact unconditional-`.head`-overwrite defect class QA-Drain was caught on today.
ZONE: cross-service/
NEXT: pm — decompose into atomic dev tasks per §4's file list once PO ratifies §6; implementation is a SEPARATE downstream dispatch (this row stays `plan_only:true` — do not auto-advance past architect).
HANDOFF: this brief; sibling precedent `docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md`; forward-compat dependency `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md`.
PIPELINE: continue (supervised — do not auto-advance past architect)
