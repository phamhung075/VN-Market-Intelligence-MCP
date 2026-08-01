Architecture Brief — Review-Lane Drain: PRIMARY Throughput Cap + SECONDARY Owner-Triage Sweep

Date: 2026-08-01T01:4xZ
Task: FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN (P1, supervised, owner architect, age 19d)
Mode: PLAN-ONLY — no code changed, brief only.
Author: architect

---

## 0. Do not re-derive — prior art read first

This row's own `status_note`/`po_triage_20260722`/`po_triage_20260728`/`po_triage_20260801`
already contain the full history: original root cause (2026-07-12), the shipped PRIMARY
drain (architect, 2026-07-22 — `docs/agents/dev-team/flow/main.md` § Review-Lane QA-Drain
+ `scripts/devteam-review-claim-qa-drain.jq`), and PO's 2026-07-28 finding that it works but
cannot keep pace, with two candidate remedy shapes left for architect to choose between.

**Separately, and not referenced by this row's own text: a second, independent investigation
already exists and is further along than a first read of this row suggests.**
`SPIKE-DEVTEAM-QADRAIN-HEAD-SLOT-DECOUPLE` (agents-architect, 2026-07-29,
`docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md`, PO-ratified) diagnosed
a *different but related* defect — QA-Drain's own dedicated `qa[]<1` budget sits inside the
same `head.status==idle`-gated fall-through as BOUNDED-1/SLS/RLC/DRS, so it is **never even
evaluated on a busy tick** — and split the fix into 3 rows:

| Row | Scope | Status (verified live 2026-08-01T01:2xZ) |
|---|---|---|
| `FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL` (Part 1) | make the `.head` write in the claim script conditional (never clobber a genuinely busy `.head`) | **DONE_VERIFIED**, `qa_verified_at: 2026-08-01T01:06:46Z` — landed literally the same tick this dispatch fired |
| `FIX-DEVTEAM-QADRAIN-INVOCATION-HEAD-DECOUPLED` (Part 2) | new head-decoupled QA-Drain invocation site between Session Gate and Step 1, reachable on busy ticks | BACKLOG, `depends_on: [Part 1 (now satisfied), FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION]` — **still blocked**, see §3 |
| `FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP` (Part 3) | 1-row/tick is insufficient against the eligible set even once reachable; batch/cadence/parallel-budget lever, independent of Parts 1/2 | BACKLOG, **no depends_on**, owner `agents-architect`, `supervised:true`/`plan_only:true` — **unplanned, no design written yet** |

Part 3 is exactly this row's remedy-(a) candidate ("raise the PRIMARY drain's per-tick cap").
§1 below supplies the concrete design Part 3 still owes, at BOUNDED-1-level precision, so it
does not need a second planning pass. §2 covers remedy (b) (SECONDARY sweep), which no
existing row or brief addresses at all — genuinely new scope, confirmed by grep (`QADRAIN|
THROUGHPUT|QA-STALE|SECONDARY` across `docs/data/orch/orch-state.json` task_board and
`docs/architecture-briefs/`).

**Live re-verification this tick** (`bash scripts/audits/devteam-review-lane-drain-report.sh`,
2026-08-01T01:39:19Z): PRIMARY (status==REVIEW && next_agent=='qa') = **198** rows, SECONDARY
= **44** rows across 14 distinct non-null `next_agent` values + 9 null. `qa[]` = 0. `.head` =
`{status:"in_progress", active_task_id:"FIX-AGENTSIGNALS-EXPIRED-GC-CRON", next_agent:
"developer"}` (BOUNDED-1 claimed this idle slot before Review-Lane QA-Drain was reached this
tick — the live demonstration cited in the dispatch). Growth since the 2026-07-28 baseline
(83 PRIMARY): +115 in ~3.4 days ≈ **34/day net inflow**, accelerating from the prior
2026-07-21→07-28 rate (~8.5/day) — the throughput gap is worsening, not stabilizing.

---

## 1. Remedy (a) — PRIMARY throughput cap (fulfills `FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP` AC-1)

**Decision: ship this first.** It is a script + 1 named-constant flow-doc change, zero
`depends_on`, zero risk of colliding with the stalled P0 `main.md` rewrite (§3), and the SPIKE
brief's own §5b already recommended exactly this lever ("batch-claiming N-oldest-eligible per
invocation instead of exactly one").

### 1a. File/section changes

**`scripts/devteam-review-claim-qa-drain.jq`** (existing file, PRIMARY selection logic
UNCHANGED — same `status=="REVIEW" && effective_next_agent(...)=="qa"`, same age-ordered sort,
same BLOCKED exclusion, same conditional `.head` guard from Part 1):

- New jq input `--argjson take_budget <int>` (caller-computed remaining `qa[]` headroom).
- Replace the single-pick `($candidates[0]) as $picked` branch with a batch pick:
  `([$take_budget, ($candidates|length)] | min) as $take` → `($candidates[0:$take]) as
  $picked_batch`. No-op (`$take <= 0`) unchanged shape.
- Append **every** row in `$picked_batch` to `.task_board.qa` (same per-row stamp:
  `status:"QA"`, `claimed_at:$now`, `claimed_by:"dev-team (review-lane qa-drain)"` — identical
  values across the whole batch, by design: this is what makes the batch correlatable, see
  below) and remove all their `.key` indices from `.task_board.review` in the same filter pass.
- `.head` write: **unchanged shape**, but narrates only `$picked_batch[0].row.id` (the oldest
  of the batch) — same conditional `$head_free` guard Part 1 already shipped. This is
  deliberately cosmetic/non-load-bearing, per Part 1's own design note (`.head.next_action` was
  never load-bearing for qa's actual verify logic) — extended here to "narrates one of N,
  narration is cosmetic for all N."

**`docs/agents/dev-team/flow/main.md` § Review-Lane QA-Drain** (lines 783-838 as of this
session):

```bash
QA_CAP=10   # named constant, single source — was hardcoded <1 (2026-07-22 SUGGESTED REMEDY:
            # "WIP<=1 for this lane"); raised per PO's 2026-07-29 AC-3 finding
            # ("reachability necessary but not sufficient") and this row's own
            # 2026-07-28/08-01 measured-non-drain evidence. Retune via this ONE line if the
            # 5-tick DoD trend (§4) under/over-shoots.
QA_WIP=$(jq '.task_board.qa|length' docs/data/orch/orch-state.json)
if [ "$QA_WIP" -lt "$QA_CAP" ]; then
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  TAKE_BUDGET=$((QA_CAP - QA_WIP))
  jq --arg now "$NOW" --argjson take_budget "$TAKE_BUDGET" \
    --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
    -f "$PROJECT_ROOT/scripts/devteam-review-claim-qa-drain.jq" \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  qadrain_head_status=$(jq -r '.head.status' docs/data/orch/orch-state.json)
fi
```

Dispatch block: replace the single `Agent("qa", ...)` call with a loop over the whole batch,
correlated by the SAME `claimed_at`/`claimed_by` idiom the SPIKE brief already designed (§3,
"Design decision requested by PO") for a different call site — reused verbatim, not forked:

```bash
picked_batch=$(jq -c --arg t "$NOW" --arg by "dev-team (review-lane qa-drain)" \
  '[.task_board.qa[] | select(.claimed_at == $t and .claimed_by == $by)]' \
  docs/data/orch/orch-state.json)
# For EACH row in $picked_batch (BGFAN-1 fan-out — independent verify-committed sessions,
# no shared mutable state beyond orch-apply.sh's own CAS guard, which already serializes
# conflicting writes):
for row in $picked_batch:
  resume_key = "task:" + row.id
  outer_claim = call_tool(task_claim, task_id: resume_key, task_kind: "sprint-task",
                           owner_agent: "dev-team", owner_client_session: $CLAUDE_CODE_SESSION_ID,
                           ttl_seconds: 3600, payload: {"site":"QA-DRAIN","spawning":"qa"})
  if not outer_claim.claimed:
    log "[dev-team] QA-DRAIN SKIP " + row.id + " — held by peer session"
    continue   # do NOT abort the whole batch over one peer-held row
  else:
    Agent("qa", context... + row.id + " mode=verify-committed", run_in_background=true)
JUMP TO end
```

### 1b. Why `QA_CAP=10`, and an honest limit of what this alone fixes

Batching increases throughput only on ticks the lane actually fires — it does **not** fix
reachability (Part 2's job, still blocked, §3). At 34/day observed net inflow and an unknown
(today: zero) reachable-tick rate under the current head-idle-only gate, `QA_CAP=10` gives
meaningful headroom per firing tick without materially stressing the fleet's own subagent-cap
ceiling (10 concurrent `qa` sessions is a small fraction of known headroom). **If the 5-tick DoD
trend (§4) fails to show a decrease purely because the lane still isn't being reached most
ticks — not because 10 is too small — the correct escalation is expediting Part 2's blocker
(§3), not raising `QA_CAP` further.** Flagging this now so a future retune attempt does not
misdiagnose a reachability failure as a throughput-cap sizing failure.

---

## 2. Remedy (b) — SECONDARY-Drain (new mechanism, no prior row)

**Decision: ship as a follow-on, but does NOT need to wait on §1 or on Part 2's blocker** — it
touches a disjoint file region and, by design (below), never writes `.head` at all, so it
inherits none of Part 1/2's coordination constraints.

### 2a. Why not "route to next_agent's own normal triage surface" literally

Grepped `docs/agents/po/flow/main.md` for `review\[\]`/`task_board.review` — **zero hits**. Same
grep against every `docs/agents/dev-team/flow/*.md` step other than the PRIMARY QA-Drain block
itself — zero hits. Confirmed: **no agent's own flow has a surface that scans `review[]`** —
not PO's, not architect's, not pm's. "Route to next_agent's own normal triage surface" would
therefore be routing to a surface that does not exist, for every one of the 14 distinct
non-null `next_agent` values live today. The only existing precedent for "an agent gets pointed
at a specific stranded `review[]` row" is manual/PO ad-hoc dispatch (visible throughout this
row's own history, e.g. `claimed_by: "dev-team (deliberate P0 dispatch)"` on other rows) — SLS/
RLC/DRS's own shape (age-ordered pick → dispatcher-wrap claim → spawn the resolved agent
directly with the row's own context) is the existing, proven mechanism for exactly this
"resolved next_agent, currently un-swept lane" problem, just never applied to `review[]` for
anything but `next_agent=="qa"`. SECONDARY-Drain generalizes that same shape — it does not
invent a new one.

### 2b. Mechanism

**New file `scripts/devteam-review-claim-secondary-drain.jq`:**

- Selection: `.task_board.review[]` where `status=="REVIEW"` (excludes BLOCKED — same negative
  control as PRIMARY, PO AC(4)) AND `effective_next_agent($detail_items) != "qa"` (this single
  predicate covers null/absent AND every other non-qa value — identical partition the
  visibility report script already uses for its SECONDARY table, reused not forked).
- Age key: same `age_epoch` def as `devteam-review-claim-qa-drain.jq` (copy or factor into
  `scripts/lib/devteam-eligibility.jq` if a 3rd caller ever needs it — 2 is not yet worth
  forcing a shared-lib extraction, mirrors this codebase's own stated threshold elsewhere).
- **Exactly ONE row per invocation** (MVP — the DoD bar for this lane is "exists + drained >=1
  row," not the 5-tick trend PRIMARY carries; batching can follow later if the single-row rate
  proves insufficient, same "measure, then batch" sequencing §1 itself followed for PRIMARY).
- `dispatch_target` = `effective_next_agent($detail_items)` if present-non-empty, **else
  `"po"`** — reasoned default, not `"architect"`: of the 44 live SECONDARY rows, 10 already
  resolve to `next_agent=="architect"` (own-queue risk — routing null rows to architect too
  would concentrate load on the one agent already carrying the largest single non-null share);
  PO is this system's designated triage/decision role for exactly this "no resolvable owner"
  case (mirrors the report script's own comment, "PO/architect triage queue"). PO can
  re-route any individual row via its own normal triage note, same as always.
- **Mutation — deliberately does NOT move the row to a new board lane.** `TaskBoardSchema` in
  `apps/mcp-server/src/infrastructure/orchStateSchema.ts` is `.strict()` with exactly the
  9 enumerated lanes (`backlog/ready/in_progress/review/qa/...`) — adding a 10th (e.g.
  `triage[]`) is a real schema change (TypeScript + validator + coherence-map updates), not a
  jq-only change, and the task's own explicit constraint is "do NOT let (b) piggyback on
  qa[]." Individual `TaskSchema` rows use `.passthrough()` (grep-verified,
  `orchStateSchema.ts:128`) — arbitrary new fields on a row are schema-safe. So: stamp
  `secondary_claimed_at`/`secondary_claimed_by`/`secondary_dispatch_target` on the row **in
  place inside `.task_board.review[]`** — no lane move, no schema change.
- **Never writes `.head`.** This is the load-bearing design choice: because SECONDARY-Drain
  never touches the single-slot resume pointer, it carries none of the risk that forced
  PRIMARY's own Part 1/2 retrofit (`FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL` /
  `-INVOCATION-HEAD-DECOUPLED`) — it can ship head-decoupled from day one.

**`docs/agents/dev-team/flow/main.md`** — new section
`### Review-Lane SECONDARY-Drain (owner-triage sweep)`, inserted at the **same anchor point**
the SPIKE brief already identified as the correct head-decoupled insertion site for QA-Drain's
own Part 2 (`docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md` §4a/§4b):
immediately after the `<!-- jump:session-gate -->` Session Gate paragraph (current lines
840-843) and before the `## Step 1 — PO Triage` header (845-846). **Runs unconditionally on
every tick that reaches this point** — no `head.status` gate at all (there is nothing to gate:
no `.head` write exists in this mechanism). Per the SPIKE brief's own traced control-flow
analysis (§4a), that boundary is reached on: idle ticks where nothing above claimed anything,
AND — the materially more common case while backlog/head activity is ongoing — busy ticks
where Step 0b's S2 resume-claim fails (`resume_key` still peer-held, TTL not lapsed; this is
the *steady-state* shape for any multi-cycle-long dev task under the hourly cron + 3600s TTL,
per the SPIKE brief §5b's own cadence citation). This gives SECONDARY-Drain materially better
reachability out of the gate than PRIMARY has today, without needing Part 2 at all.

```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
jq --arg now "$NOW" \
  --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
  -f "$PROJECT_ROOT/scripts/devteam-review-claim-secondary-drain.jq" \
  docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
picked=$(jq -c --arg t "$NOW" --arg by "dev-team (review-lane secondary-drain)" \
  '[.task_board.review[] | select(.secondary_claimed_at == $t and .secondary_claimed_by == $by)] | first // empty' \
  docs/data/orch/orch-state.json)
if [ -n "$picked" ]; then
  resume_key = "task:" + picked.id
  outer_claim = call_tool(task_claim, task_id: resume_key, task_kind: "sprint-task",
                           owner_agent: "dev-team", owner_client_session: $CLAUDE_CODE_SESSION_ID,
                           ttl_seconds: 3600,
                           payload: {"site":"SECONDARY-DRAIN","spawning": picked.secondary_dispatch_target})
  if not outer_claim.claimed:
    log "[dev-team] SECONDARY-DRAIN SKIP " + picked.id + " — held by peer session"
  else:
    Agent(picked.secondary_dispatch_target,
          context... "task_id=" + picked.id + " is a stale review[]-lane row (status=REVIEW, "
          + "branch:null — direct-commit, no task branch/handoff, same precondition as the "
          + "PRIMARY qa-drain lane) awaiting your own sign-off/triage. Read its status_note/"
          + "review_note fields directly and take next action per your own flow's normal "
          + "judgment: DONE_VERIFIED sign-off, request rework, reassign next_agent, or "
          + "escalate BLOCKED.",
          run_in_background=true)
fi
# Falls through to Step 1 regardless — never JUMPs to end (does not consume the tick the
# way PRIMARY/BOUNDED-1/SLS/RLC/DRS do; this lane's own single-row cap is the throttle).
```

Concurrency: no numeric cap needed for this MVP shape (one row claimed per tick, gated only by
"an eligible SECONDARY candidate exists" + the standard per-row `task_claim` peer-collision
guard). **Known, accepted, flagged residual (not hidden):** two SECONDARY rows resolving to the
*same* `dispatch_target` on adjacent ticks could spawn two concurrent sessions of that same
non-dev-core agent before the first resolves. Not mitigated here — same "measure before adding
a 2nd mutex layer" posture this whole file already applies elsewhere (e.g. the on-demand
mutex-wrap at lines 21-40 exists only for the maintenance/cowork lane, added after that
collision was observed live, not pre-emptively for every agent type). If observed live, the
fix is a one-line reuse of that exact existing `task:on-demand:<agent>:<date>` pattern — flagged
here as the known fast-follow, not built now.

### 2c. Coordination note for whoever implements Part 2 later

Part 2 (`FIX-DEVTEAM-QADRAIN-INVOCATION-HEAD-DECOUPLED`) is speced to insert its own new
section at this exact same Session-Gate/Step-1 boundary (brief §4b). Once SECONDARY-Drain
ships first (this brief), Part 2's implementer inserts its section adjacent to (not overlapping)
SECONDARY-Drain's — a plain sequential addition, not a byte conflict; flagging so it isn't a
surprise mid-implementation.

---

## 3. Why Part 2 is not actioned in this brief

`FIX-DEVTEAM-QADRAIN-INVOCATION-HEAD-DECOUPLED`'s own `depends_on` (machine-readable, per
`FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE`) names `FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-
ROTATION` (P0, rewrites `main.md` §496-686 wholesale) — verified live still `BACKLOG`, itself
`depends_on: ["TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES"]`, which is verified live still
`REVIEW` since 2026-07-29 (2+ days stale at time of writing) — i.e. **the P0 rotation this row
transitively waits on is itself parked in the same starved `review[]` lane this whole task
exists to unstick.** Reordering QA-Drain naively ahead of BOUNDED-1/SLS/RLC/DRS instead of
waiting for Part 2's proper head-decoupled design would reintroduce exactly the starvation risk
already named and tracked (`FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION`) — not a free
reorder. Leaving Part 2 blocked-and-tracked as-is is the correct call, not a gap in this brief;
flagging the transitive stall on `TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES` for PO/router
visibility since it is blocking a P0.

---

## 4. Definition of Done (RAW-checkable — do not accept a weaker bar)

**PRIMARY (§1):** unchanged from this row's own 2026-07-28 standing bar — `review[]` PRIMARY
count (`scripts/audits/devteam-review-lane-drain-report.sh` PRIMARY table) **trending down, not
just non-increasing, across 5 consecutive dev-team ticks, with the drained row ids named** (the
`.task_board.qa[]` rows' own `claimed_at`/`claimed_by` stamps are the raw evidence — cross-check
against the report script's PRIMARY table before/after each tick).

**SECONDARY (§2):** unchanged from this row's own 2026-07-28 standing bar — the drain step
exists (code merged, script + main.md section live) **and has drained >=1 row with the same
evidence standard** (`secondary_claimed_at`/`secondary_claimed_by`/`secondary_dispatch_target`
stamps on a specific named row id, plus that row's eventual resolution out of `REVIEW` status by
its dispatched agent). Recommend extending `scripts/audits/devteam-review-lane-drain-report.sh`
with a 3rd visibility line (SECONDARY-rows-currently-claimed) reusing its existing structure —
do not build a second report script.

Negative control (both lanes, PO AC(4) carried forward unchanged): a BLOCKED review row must
never appear as a drain candidate in either mechanism — both selection predicates already
filter `status=="REVIEW"` only, excluding BLOCKED by construction.

---

## 5. Implementer + handoff

Recommend **architect direct-implement** for both §1 and §2 (same file family/pattern I
authored for BOUNDED-1/SLS/RLC/DRS/PRIMARY-QA-Drain; avoids a context-transfer tax re-deriving
this same control-flow trace). Acceptable fallback: **dev-team direct-execute** (same "FIX rows
commit straight to `main`" convention already used for every sibling row in this chain,
`branch:null`, no `docs/handoffs/` file needed).

§1's concrete design also **fulfills the plan_only obligation already sitting on
`FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP`** (owner `agents-architect`) — recommend PO/router either
redirect that row's implementation to this brief directly (skip a duplicate planning pass) or
treat this brief as input to agents-architect's own pass; not my call to make unilaterally
(orch-state.json write, see below).

**This is a PLAN-ONLY dispatch — no code changed, no board write made by this session.**
`FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN` is `supervised:true`; leaving the following board actions to
dev-team/router/PO, same pattern as recent TE-T21-adjacent handoffs:
- Mint `FIX-DEVTEAM-REVIEW-LANE-SECONDARY-DRAIN` (P1, zone `docs/agents/dev-team/flow/`, owner/
  next_agent `architect`, `brief_ref` this file, `depends_on: []`) per §2.
- Point `FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP`'s implementation at §1 of this brief (or leave for
  agents-architect to independently design against the same live data — PO's call).
- Surface the `TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES` stall (§3) — it is blocking a P0.
- `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN` itself: recommend leaving status as-is (still open,
  tracking the outstanding gap) until §1/§2 land and the 5-tick/≥1-row evidence in §4 exists —
  do not flip to DONE_VERIFIED on this brief alone.
