Architecture Brief — QA-Drain / `.head` Slot Decoupling

Date: 2026-07-29T19:46:29Z
Task: SPIKE-DEVTEAM-QADRAIN-HEAD-SLOT-DECOUPLE (P1, supervised, plan_only, timebox 180min, owner agents-architect)
Author: agents-architect
Status: RECOMMENDATION ONLY — no code changed (role boundary; agent-father implements)

---

## 1. Problem (confirmed live, re-verified this session)

`docs/agents/dev-team/flow/main.md` gates its whole idle-capacity fall-through chain —
BOUNDED-1 (§522) → Supervised-Lane Sweep (§554) → Ready-Lane Consumer (§617) →
Review-Lane QA-Drain (§674-726) — on `.head.status` being idle/done/missing (§518).
QA-Drain owns an INDEPENDENT budget (`.task_board.qa|length < 1`, §685-686) that has
nothing to do with the WIP≤2 `in_progress` budget the other three lanes share — yet it
sits inside the same head-idle-only fall-through, so its own budget is never even
evaluated on a busy tick.

Live re-verification 2026-07-29T19:46Z: `review[]`=158, 120 rows
`status=="REVIEW" && next_agent=="qa"`, `qa[]`=0, oldest `updated_at` 6+ days stale.
`.head.active_task_id`="FACTORY-GUARD-CI-METRICMASK-IMPL" (developer, genuinely
running) for this entire session — confirmed via live `jq` read, not assumed. This
SPIKE itself had to be dispatched out-of-band because dev-team's own Supervised-Lane
Sweep pickup mechanism is unreachable while `.head` is busy — the exact symptom class.

## 2. Root cause + why the filed remedy is wrong (do not re-litigate)

dev-team's own filed remedy — "run QA-Drain keyed only on `qa[]<1`, ignore
`.head.status`" — is REJECTED, confirmed by live dry-run, not theory.
`scripts/devteam-review-claim-qa-drain.jq:123-132` performs an **unconditional
whole-object replace** of `.head`:

```jq
| .head = {
    status: "in_progress",
    active_task_id: $picked_id,
    next_agent: "qa",
    ...
  }
```

PO dry-ran this against the live board 2026-07-29T19:2xZ: selection logic was correct
(picked the oldest eligible row), but the output would have silently overwritten
`.head.active_task_id` from `FACTORY-GUARD-CI-METRICMASK-IMPL` (real, running) to the
QA-Drain pick — orphaning Step 0b's resume-tracking for the genuinely in-flight task.
**The head-idle gate at main.md:518 is load-bearing, not over-broad.** This is a
different bug class from `UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK` (a pure
WIP-formula miscount with no invariant behind it) — here a real invariant (`.head` is a
single-slot resume pointer) is what the gate protects; deleting the gate would just move
the collision from "theoretical" to "guaranteed."

In-repo precedent for the correct shape: `scripts/devteam-wrapper-autoclose.jq:122-128`
is NEVER WIP-gated and runs unconditionally at post-cycle Step 4.4 precisely BECAUSE its
`.head` write is conditional — it only syncs `.head` when `.head.active_task_id` already
belongs to a row it just swept, otherwise leaves `.head` completely untouched:

```jq
| .head = (
    (.head.active_task_id // null) as $active
    | if ($active != null) and (($swept_ids | index($active)) != null) then
        { status: "idle", active_task_id: null, next_agent: "router", ... }
      else .head end
  )
```

QA-Drain needs the SAME conditional-guard shape, applied in the opposite direction
(claiming INTO `.head`, not clearing it).

## 3. Part 1 — head-safe claim script (script-only, zero file conflict, ship first)

Change ONLY `scripts/devteam-review-claim-qa-drain.jq`'s `.head` write (lines 123-132).
Selection/lane-move logic (candidates, `$picked`, `task_board.qa`/`task_board.review`
mutation) is UNCHANGED — only the final `.head` assignment becomes conditional:

```jq
| .task_board.review = [ .task_board.review | to_entries[] | select(.key != $picked.idx) | .value ]
| ((.head.status // "idle") as $hs
   | (.head.active_task_id // null) as $ha
   | ($hs == "idle" or $hs == "done" or $ha == null)) as $head_free
| .head = (
    if $head_free then
      {
        status: "in_progress",
        active_task_id: $picked_id,
        next_agent: "qa",
        next_action: ("Review-Lane QA-Drain claim of " + $picked_id
          + " — spawn qa in verify-committed mode (branch:null direct-commit row, no task branch/handoff — "
          + "see docs/agents/qa/flow/main.md § Direct-Commit Verify; do NOT use the normal pipeline JUMP-TO, it requires a branch this row does not have)."),
        updated_at: $now,
        updated_by: "dev-team (review-lane qa-drain)"
      }
    else
      .head   # FIX-QADRAIN-HEAD-SLOT-DECOUPLE: a DIFFERENT task is genuinely live in
              # .head (status in_progress, active_task_id set — e.g. a developer session
              # actively running) — never clobber it. Mirrors
              # scripts/devteam-wrapper-autoclose.jq:122-128's own conditional guard,
              # applied to the claim-INTO-head direction instead of clear-FROM-head.
    end
  )
```

**Caller-side impact: NONE for the existing invocation.** The only current caller
(`docs/agents/dev-team/flow/main.md:674-726`) is, by construction, only ever reached
when `.head` is ALREADY idle (every section above it in the same fall-through — BOUNDED-1/
SLS/RLC — guarantees this; each JUMPs away on a successful claim, so if control reaches
QA-Drain, `.head` is still free). So `$head_free` is always true at that one call site
today, and the existing caller code (`qadrain_head_status=$(jq -r '.head.status' ...)`,
`if qadrain_head_status = "in_progress"`) keeps working UNCHANGED, no edits needed there.
Grep-confirmed this script has exactly one caller in the whole repo today.

**Design decision requested by PO — where does the spawned `qa` agent read its dispatch
instruction from, since `.head.next_action` can no longer be assumed to describe this
row once a NEW (Part 2) call site is head-busy-safe?** Answer: it never needed to. QA's
own `verify-committed` entry point (`docs/agents/qa/flow/main.md:156`) already
self-loads its input directly by task_id — `jq --arg id "<task_id>" '.task_board.qa[] |
select(.id==$id)' docs/data/orch/orch-state.json` — completely independent of `.head`.
`.head.next_action` was always cosmetic/human-readable narration for Telegram/session
logs, never load-bearing for QA's actual verify logic. The fix: any NEW call site that
cannot assume `.head` was written correlates the picked row itself, via the same
timestamp-correlation idiom `scripts/devteam-wrapper-autoclose.jq`'s own caller
(post-cycle.md Step 4.4) already uses for its swept rows:

```bash
picked=$(jq -c --arg t "$NOW" \
  '[.task_board.qa[] | select(.claimed_at == $t and .claimed_by == "dev-team (review-lane qa-drain)")] | first // empty' \
  docs/data/orch/orch-state.json)
```

...then builds the `Agent("qa", ...)` spawn context directly from `picked.id` +
`mode=verify-committed`, never from `.head.next_action`.

## 4. Part 2 — reachability on busy ticks (flow-doc, only after Part 1 ships)

### 4a. Placement — verified zero byte overlap with the concurrent P0 rotation rewrite

`FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION` (P0, developer, `depends_on:
["TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES"]`) rewrites main.md §496-686 wholesale;
its own sibling task `TASK-DEVTEAM-IDLE-CHAIN-2-MAIN-FLOW` states the acceptance
criterion explicitly: *"BOUNDED-1/SLS/RLC/QA-Drain blocks byte-unchanged"* — it only
reorders WHICH of the 4 idle-fallthrough consumers wins an IDLE tick (fairness
round-robin), never touches whether any of them is reachable on a BUSY tick.

Traced the actual control flow (`docs/agents/dev-team/flow/main.md`, line numbers as of
this session): every head-busy exit in Step 0b — WF-1 BLOCKED (line 480: "fall through
to Step 1"), S2 resume-claim-failed-peer-held (line 499), and the shared SLS/RLC failure
comments (lines 597/655, same boilerplate phrase) — all converge, by sequential
top-to-bottom prose reading (confirmed: RLC's own header explicitly states it is
"reached ONLY when SLS did NOT claim+dispatch," i.e. reached AFTER an SLS
outer_claim-failure despite that failure's own comment ALSO saying "fall through to Step
1" — proving that phrase is informal shorthand for "continues toward Step 1," not a
literal skip-everything jump), at the **Session Gate → Step 1 boundary**
(`<!-- jump:session-gate -->` line 730 through `<!-- jump:po-triage -->` line 735).
That boundary is OUTSIDE §496-686 entirely.

**Recommended insertion point: a NEW subsection immediately after the Session Gate
line (730-733) and before the `## Step 1 — PO Triage` header (735-736).** Zero bytes
inside §496-686 change. The existing §674-726 QA-Drain block stays byte-identical, so
the rotation task's own AC is unaffected regardless of which task lands first.

### 4b. New section (illustrative — agent-father finalizes exact prose/line fit)

```markdown
<!-- jump:qa-drain-headdecoupled -->
### Review-Lane QA-Drain — Head-Decoupled Invocation (busy-tick reachability)

FIX-DEVTEAM-QADRAIN-HEAD-SLOT-DECOUPLE. Runs on EVERY tick that reaches this point —
UNLIKE BOUNDED-1/SLS/RLC/the original QA-Drain block above (§674-726), which are
explicitly gated to the head-idle fall-through only. Reached both (a) after the
head-idle fall-through is exhausted — a safe, idempotent no-op there, since the original
QA-Drain block already tried the identical qa[]<1 + oldest-eligible-review-row check
moments earlier in this same tick — and (b), the actual gap this closes, whenever Step
0b's head-busy branches fall through toward Step 1 without ever reaching §496-686 at
all. Requires Part 1 (head-safety-conditional `.head` write) to already be shipped —
otherwise this site would clobber a genuinely busy `.head` exactly as PO's dry-run
demonstrated 2026-07-29.

​```bash
QA_WIP=$(jq '.task_board.qa|length' docs/data/orch/orch-state.json)
if [ "$QA_WIP" -lt 1 ]; then
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  jq --arg now "$NOW" \
    --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
    -f "$PROJECT_ROOT/scripts/devteam-review-claim-qa-drain.jq" \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  picked=$(jq -c --arg t "$NOW" \
    '[.task_board.qa[] | select(.claimed_at == $t and .claimed_by == "dev-team (review-lane qa-drain)")] | first // empty' \
    docs/data/orch/orch-state.json)
fi
# QA_WIP>=1, or nothing eligible -> $picked stays empty -> fall through to Step 1 unchanged
​```

If `$picked` non-empty: dispatcher-wrap `resume_key = "task:" + picked.id` (mirrors
BOUNDED-1/SLS/RLC/original-QA-Drain's own pattern exactly), then spawn `qa` with the
context built DIRECTLY from `picked.id` + `mode=verify-committed` — never from
`.head.next_action`, which may legitimately still describe a different live task this
tick — then `JUMP TO end` (do not also fall through to Step 1/PO triage same tick).
```

### 4c. Sequencing / conflict discipline

Per PO's mandate, the Part-2 board row MUST carry a machine-readable
`depends_on: ["FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION"]` — not prose — per
`FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE` (prose-only ordering notes with
empty `depends_on` are blind-promoted by BOUNDED-1). State plainly: this is a
**coordination safeguard, not a strict technical necessity** — §4a's line-range analysis
shows genuinely zero byte overlap with what the rotation task touches. Keep it anyway:
both tasks edit `main.md` in the same window, and the rotation task may still shift
nearby anchors (`jump:session-gate`/`jump:po-triage`) as a side effect of restructuring
§496-686, which would require re-verifying the exact insertion point regardless of
literal byte-range math today. Part 1 (the `.jq` script) carries no such dependency —
it ships standalone, immediately.

## 5. Part 3 — two questions, both answered explicitly (not silently assumed)

**(a) Is Part 2 still needed once Part 1 ships?** Yes — Part 1 only makes the `.head`
write *safe if reached*; it does not change *where the script is invoked from*. Without
Part 2, main.md still only calls `scripts/devteam-review-claim-qa-drain.jq` from inside
the head-idle-only fall-through (§674-726). On any tick where `.head` is busy — the
entire premise of this SPIKE — the script is simply never invoked, Part-1-safe or not.
Part 1 is a necessary precondition for Part 2, never a substitute for it.

**(b) Is one-row-per-tick throughput against a 120-row eligible backlog (158 total,
oldest 6d+) acceptable?** No — recommend a SEPARATE follow-up row, do not fold into
Parts 1/2. Dev-team's cron fires hourly (`7 * * * *`, 45-min cap per tick —
`docs/standards/cron-jobs.md:314`). `QA_WIP<1` hard-caps the ENTIRE system (both the
original site and the new busy-tick site share the SAME `.task_board.qa|length` budget)
to exactly one `verify-committed` session in flight at a time. Best case (system
permanently idle, zero head contention) that's ~1 row/hour ≈ 24/day against 120 eligible
rows plus continuous new inflow (every developer DONE pushes another row into
`review[]`) — and the CURRENT 6-day-stale oldest row is itself the live proof the
present (zero-throughput) rate already can't keep pace. Reachability (Parts 1+2) is
necessary but not sufficient. Recommend PO mint a separate row (suggested id
`FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP`) to evaluate: raising the `qa[]` concurrency cap
above 1, batch-claiming N-oldest-eligible per invocation instead of exactly one, and/or
moving QA-Drain onto its own more-frequent cadence (mirrors the existing 15-min
cowork-team dispatcher pattern — `docs/references/workflow-map.md:170`). Explicitly
OUT OF SCOPE for Parts 1/2 — do not conflate throughput with reachability.

## 6. DoD / regression coverage recommended for agent-father

- `scripts/audits/devteam-dispatch-gate-satisfiability.sh` (existing t4 QA-Drain
  fixture, lines ~154-159): add a NEGATIVE control — pre-seed `.head` with an unrelated
  `in_progress` task BEFORE invoking `devteam-review-claim-qa-drain.jq`, assert `.head`
  is byte-identical after. This mechanizes the exact defect PO's manual dry-run caught;
  today's fixture never sets `.head` at all, so it cannot currently catch this class.
- Add a companion POSITIVE control: `.head` idle/missing before invocation → `.head`
  IS written with the picked row (regression-guards the original call site's existing
  behavior stays intact after the conditional-guard lands).
- New Part-2 site: extend the same satisfiability script (or a sibling) with a fixture
  where `.head` is busy, confirm the new section's `picked`-correlation query resolves
  the same row the script claimed, and that `.head` is untouched throughout.

## 7. Residual gap flagged, not silently accepted as fine

No staleness/retry detector exists today for a row stuck in `.task_board.qa[]` if its
spawned `qa` session dies mid-verify (grep-confirmed across
`docs/agents/dev-team/flow/*.md` and `docs/agents/po/flow/main.md`). This is
**pre-existing, not introduced or worsened by this fix** — the head-based 24h
stale-crash reset (main.md:517) only ever frees the `.head` SLOT for new dispatch; it
never retried a stuck `qa[]` row even under the current idle-tick-only site. Worth a
future candidate row (e.g. extend `scripts/audits/devteam-review-lane-drain-report.sh`
to also surface `qa[]` rows stuck beyond N hours) — not a blocker for Parts 1/2.

## 8. Actionable sequence for agent-father

1. Ship Part 1 (`scripts/devteam-review-claim-qa-drain.jq` conditional `.head` guard) +
   the two regression controls in §6 — standalone, no `depends_on`, no main.md edit.
2. PO mints the Part-2 board row (flow-doc insertion, §4b) with
   `depends_on: ["FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION"]`; implement only after
   Part 1 is `DONE_VERIFIED`.
3. PO separately mints the throughput follow-up (§5b) — independent of 1/2, can proceed
   in parallel.

## Dedup check

Not a duplicate of `FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION` /
`TASK-DEVTEAM-IDLE-CHAIN-2-MAIN-FLOW` (fairness ordering among idle-tick consumers,
never busy-tick reachability — confirmed by reading their own AC text directly, §4a).
Not a duplicate of `FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION` (opposite direction:
QA-Drain firing too often on idle ticks starving Step 1 — this brief's §4a placement
deliberately preserves idle-tick priority ordering unchanged, so it does not aggravate
that concern). Not a duplicate of `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN` (that row IS the
already-shipped lane this brief decouples).
