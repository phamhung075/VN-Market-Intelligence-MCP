Architecture Brief — dev-team `.head` Pin: In-Progress-Resident `next_agent` Write-Coherence (WF-2b)

Date: 2026-08-14T07:56:51Z
Task: FIX-DEVTEAM-HEAD-NEXTAGENT-RESYNC-ON-REASSIGN (P1, BACKLOG, size M, owner agents-architect,
DESIGN ONLY — implementation routes to agent-father)
Mode: DESIGN — `docs/agents/dev-team/flow/main.md` prose/bash edit spec (ready-to-apply patch text
below), plus two flagged companion rows. Zero production code changed here.
Author: agents-architect

---

## 0. Dedup check + prior art

Grepped `docs/architecture-briefs/` for `next_agent.*coheren|nextagent.*resync|write-coherence` —
no prior brief covers this exact mechanism. Read the full triage rationale
(`docs/agent-memory/decisions/sprint-TRIAGE-STALE-HEAD-FAMILY-20260814-po.md`), the 2026-08-07
sibling blueprint that first recommended this task id
(`docs/architecture-briefs/2026-08-07-devteam-head-pin-stale-threshold-resume-bound.md` §6), and
all three source memories (router lane-move, pm mid-sprint decomposition ×2, architect handoff).
This brief is the design PO explicitly deferred: **which field is authoritative when
`.head.next_agent` disagrees with an `in_progress[]`-resident row's own `next_agent`, and how does
the fix interact with WF-3/WF-4 (landed same day, same file, hours before this cycle)?**

## 1. Live re-verification (this cycle — the file is being concurrently edited)

`docs/agents/dev-team/flow/main.md` is **1276 lines**, and `git status` shows it **currently
modified in the working tree, uncommitted** (`git diff --stat`: +52/-9) — a concurrent agent-father
session is mid-flight implementing the sibling row `FIX-DEVTEAM-WF1D-REVIEW-QA-LANE-HEAD-PIN-BLIND`
right now (WF-1d REVIEW-LANE check already present in the live file at the time of this read,
board row still shows `status:BACKLOG` — a board-sync lag, not contradicted). **All line numbers
below are a snapshot of this moment and will drift** — anchor by content (heading text / block
boundaries), never by number, same discipline this file already imposes on itself everywhere.
Current anchors at read time: WF-2 SUPERVISED-HOLD `L395-440`, WF-3 RESUME-ATTEMPT-BOUND
`L441-468`, WF-4 STALE-AGE `L469-504`, S2 fall-through summary `L505-507`, S2 dispatcher-wrap
`L508+`.

Confirmed live, not assumed:
- `.task_board` rows use `.id` as primary key, `.task_id` as a secondary/legacy alias — every
  existing lookup in this file does `select(.id == $tid or (.task_id // null) == $tid)`; this
  brief's patch reuses that exact idiom.
- `active_sprints[].tasks[]` rows carry their own `next_agent` field (e.g. live row
  `VMT-3a-MACRO-INDICATORS-PMI`, `next_agent:"dev-macro-indicators"`, `status:"BLOCKED"`) — the
  same reassignment-coherence question applies there, not just to flat `in_progress[]` rows. The
  2026-08-11 pm mid-sprint-decomposition occurrence (`UC-RDL-P4`, `SPRINT-M`) was very plausibly an
  `active_sprints[]`-resident parent, not a flat `in_progress[]` row — the fix below scans both.
- `HeadSchema` (`apps/mcp-server/src/infrastructure/orchStateSchema.ts:287-300`) is
  `.passthrough()` — this brief reads/writes only existing fields (`next_agent`, `next_action`,
  `resume_attempts`, `last_resume_at`, `updated_at`, `updated_by`). **Zero schema change needed.**
- INV-GATEWAY-1 (`docs/architecture-briefs/2026-06-07-wf3-dev-gateway-binding-ruling.md:126-139`)
  is a restriction on **MCP tool calls** (`task_claim`/`task_release`/`task_heartbeat`/
  `commit-mutex`) for `dev-*/qa/ba/pm/architect` — it says nothing about `.head` JSON writes.
  `fail-loud-protocol.md:170-171` confirms `.head` writes via `jq` + `orch-apply.sh` are executable
  by every agent regardless of MCP binding. This closes AC-5's premise cleanly (§7 below) —
  the question is a cost/benefit one, not a structural-blocker one.
- WF-4's own in-file comment (`L496-501` at read time) **already names this exact task id** as the
  deferred write-coherence class and already assumes something upstream will have corrected
  `.head` by the time WF-4's `commit_found`-non-empty branch declines to reset — confirming WF-4's
  own author expected this brief's fix to sit **before** WF-4 in the chain, not after.

## 2. AC-2 — Authority, tie-break rule, and the failure mode of choosing wrong

**The `in_progress[]`/`active_sprints[].tasks[]`-resident row's own `next_agent` field is
authoritative over `.head.next_agent`, once the row has passed WF-1/WF-1b/WF-1c/WF-1d/WF-2
unmatched (i.e. it is genuinely still in flight, not BLOCKED/terminal/ready/review/qa/
supervised-held).**

Reasoning:
- `.head` is documented, by this file's own established precedent language (quoted verbatim in
  `feedback_pm_midsprint_decomposition_leaves_head_stale_not_closeout`), as **"dispatcher
  coordination state"** — a single-reader mirror dev-team itself maintains for its own resume
  convenience, not the pipeline's source of truth. The row is the SSOT: it is what BOUNDED-1/
  SLS/RLC/DRS/QA-Drain/every completing specialist actually reads and writes as the record of
  pipeline state.
- The row's `next_agent` was written by the specialist that just made the actual handoff decision
  with full context (architect's ratification note, pm's decomposition, router's own DRS
  lane-move) — a domain-informed write. `.head.next_agent`, by construction of this defect class,
  is stale bookkeeping nobody has touched since the *previous* stage's dispatch.
- No consumer other than dev-team's own Step 0b reads `.head` (confirmed by design: it exists
  purely to let a `head.status=="in_progress"` tick resume without re-deriving state) — so
  correcting it to match the row costs nothing else in the system.

**Failure mode of trusting `.head.next_agent` (status quo, wrong):** re-spawns an already-finished
stage — the exact, confirmed-3x defect this row exists to fix. Best case the re-spawned agent
notices its own work is done and no-ops (wasted spawn); worst case (pm's shape) it attempts a
second decomposition/ratification pass against a row whose state has already moved on, producing
duplicate or conflicting artifacts.

**Failure mode of trusting the row's own `next_agent` (this fix) when it is itself wrong:**
narrower and rarer — a genuine mid-write race where a specialist crashed after writing `next_agent`
but before finishing a companion field the next stage needs. Guarded against below (§3) by only
ever trusting a **non-null, non-empty string** value and never inventing one; a null/absent row
`next_agent` is explicitly out of this row's scope (§3, non-goal) and falls through unchanged,
identical to today's behavior.

**No git-log corroboration needed here (unlike WF-4):** the 2026-08-07 blueprint's own §6 already
states this precisely — *"No threshold, attempt-counter, or resume-bound could ever detect or
prevent an already-wrong value written fresh — the write itself is the bug, not its age... assert
`head.next_agent == row.next_agent` immediately after a same-tick reassignment — no elapsed-time
dimension at all."* This is an instantaneous field-diff, not a staleness judgment — corroborating
against `git log` would answer a different question (was there recent activity) than the one this
check asks (do two fields on the SAME live document agree right now).

## 3. AC-3 — Mechanism + WF-3/WF-4 interaction (the false-positive-avoidance requirement)

**New check, named WF-2b (deliberately NOT part of the WF-1/1b/1c/1d/WF-2/WF-3/WF-4 "run Nth"
ordinal-carve-out sequence — see structural note below):**

```bash
row_next_agent=$(jq -r --arg tid "$head_active_task" \
  '( [ (.task_board.in_progress // [])[], (.task_board.active_sprints // [])[].tasks[]? ]
     | map(select(.id == $tid or (.task_id // null) == $tid)) | first.next_agent ) // empty' \
  docs/data/orch/orch-state.json)
if [ -n "$row_next_agent" ] && [ "$row_next_agent" != "$head_next_agent" ]; then
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  jq --arg t "$now" --arg na "$row_next_agent" --arg tid "$head_active_task" \
    '.head.next_agent = $na
     | .head.next_action = ("RESUMED after WF-2b next_agent-coherence resync (head.next_agent was stale) -- read the current fields on task row " + $tid + " directly (architect_review_note / review_note / decomposition notes, whichever the completing stage wrote) to determine the actual handoff instructions; do not trust any prior next_action text.")
     | .head.updated_at = $t
     | .head.updated_by = "dev-team (WF-2b next_agent-coherence)"
     | .head.resume_attempts = 0
     | .head.last_resume_at = null' \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  send_telegram(channel="work", message="[dev-team] HEAD NEXT_AGENT RESYNC task=" + head_active_task + " -- head.next_agent was stale (" + head_next_agent + ") vs the row's current next_agent (" + row_next_agent + "); resynced, resume_attempts reset to 0, dispatching " + row_next_agent + " this tick")
  head_next_agent="$row_next_agent"   # so S2 dispatches the CORRECTED value THIS tick, no extra tick wasted
fi
# Falls through UNCONDITIONALLY to WF-3 below, whether or not a resync fired. Unlike every other
# WF-N check in this chain, WF-2b never JUMPs away -- see structural note below.
```

**Placement:** immediately after WF-2's closing `if should_hold` block (`L440` at read time),
immediately before WF-3's heading (`L441`). This is the exact slot the 2026-08-07 blueprint
originally described for its own insertion ("after WF-2's closing `if should_hold` block, before
S2") — now that WF-3/WF-4 occupy that slot, WF-2b nests specifically between WF-2 and WF-3.

**Structural note (flag for agent-father and future readers):** every other check in this chain
(WF-1/1b/1c/1d/WF-2/WF-3/WF-4) is a **carve-out gate** — it either matches and `JUMP`s away, or
doesn't match and falls through unchanged. WF-2b is a **correction pass** — it always falls
through, whether or not it fired. It therefore does NOT get a "run Nth" ordinal word in its own
heading (that vocabulary means "the Nth possible early-exit", which WF-2b structurally is not).
WF-3's and WF-4's own "run SIXTH"/"run SEVENTH" labels (current, post-WF-1d numbering) should still
be bumped to "run SEVENTH"/"run EIGHTH" for the labels to stay literally true as "the Nth block a
reader encounters in file order" — but do this by re-reading the file fresh at apply time (per the
brownfield-verified convention already established here), not from these numbers, since WF-1d's
own landing is concurrent and may have already changed them by the time this brief is applied.

**Scope guard — why `.task_board.in_progress[]` + `.task_board.active_sprints[].tasks[]` only,
never the wider WF-1 array:** WF-2b's row-lookup is deliberately NARROWER than WF-1's task_status
lookup (which also scans `done[]`/`done_verified[]`/`ready[]`/`review[]`/`qa[]` for LANE-VISIBILITY
purposes). Coherence-checking only makes sense for a row that is genuinely still resident in a
"live work" lane. This has a load-bearing, provable safety property, independent of the sibling
WF-1d row's landing order:
- If WF-1d has already landed (confirmed live, §1): a `review[]`/`qa[]`-resident row never reaches
  WF-2b at all (WF-1d already jumped away).
- If WF-1d had NOT yet landed when this ships: a `review[]`/`qa[]`-resident row reaching WF-2b
  resolves `row_next_agent` empty (the row does not exist in `in_progress[]`/`active_sprints[]`),
  the `[ -n "$row_next_agent" ]` guard is false, WF-2b silently no-ops, and control falls through
  exactly as it does today. **WF-2b can never regress or duplicate WF-1d's fix regardless of which
  of the two rows lands first** — this is a load-bearing correctness property, not incidental.

**WF-3 interaction (the false-positive-avoidance requirement, AC-3's core ask):** `resume_attempts`
increments on EVERY successful S2 respawn regardless of whether the spawned agent was correct — so
if the coherence bug caused N prior wasted respawns of the wrong (already-finished) agent, those N
attempts are already baked into the counter by the time WF-2b gets a chance to fix anything. Without
a reset, the FIRST correctly-targeted dispatch after a fix would push the counter to N+1, and if N
was already 2, that single correct dispatch would immediately and wrongly trip WF-3's
bound-exceeded BLOCKED escalation on a task that just got back on track — a new false-positive
class, exactly what AC-3 asks this brief to rule out. **WF-2b resets `resume_attempts` to 0 (and
clears `last_resume_at`) in the same write that corrects `next_agent`.** This is safe and
self-limiting, not a loophole: the mismatch that triggers WF-2b is corrected in the very same write
that fires it, so the SAME tick's control flow cannot re-fire WF-2b again (head now matches row);
a genuinely-still-crash-looping task (spawn dies before ever claiming `task:<id>`, independent of
which agent is named) still accumulates a fresh count from 0 on every subsequent tick and WF-3
still catches it, just from a later starting point — protecting exactly the failure shape WF-3 was
designed for (repeated blind respawns of a dead spawn on the SAME now-correct target) without
conflating it with the unrelated wrong-agent-respawn population that preceded the fix.

**WF-4 interaction:** WF-4's own in-file comment (§1 above) already anticipates this exact case —
when `commit_found` is non-empty (a commit landed referencing the task since the pin), WF-4
deliberately does NOT reset `.head`, falls through to S2, and relies on S2's `outer_claim` as the
safety net. Because WF-2b runs BEFORE WF-4 in this ordering, by the time WF-4 evaluates, `.head`
has ALREADY been corrected if a mismatch existed — so WF-4's own fall-through now dispatches the
CORRECT agent instead of the stale one. This is precisely the gap WF-4's own comment names and
defers to this row; no change to WF-4's own logic is needed, only WF-2b's placement ahead of it.

**Non-goal, explicitly out of scope:** `row_next_agent` absent/null (a specialist that never wrote
a handoff `next_agent` at all) is NOT this row's shape — it is the class the companion
`FIX-DEVFLOW-MICROSERVICE-SUCCESS-PATH-NO-HEAD-SYNC` row and WF-1d's own lane-widening already
address from the other direction. WF-2b's guard (`-n "$row_next_agent"`) deliberately leaves this
case falling through unchanged, matching today's behavior — not silently expanding scope.

**No new allowlist/validation added on `row_next_agent`'s value:** considered and rejected — S2's
own `Agent(head.next_agent, ...)` call already spawns whatever `head.next_agent` names today with
zero validation; adding a stricter check here than S2 itself enforces would be new, undiscussed
scope and a new place a legitimate reassignment could be silently dropped.

## 4. AC-4 — Ruling on pm's partial `.head` write (commit `95540b50d`)

**WF-2b does NOT subsume this — it structurally cannot.** WF-2b lives entirely inside the
`head.status == "in_progress"` branch of Step 0b. pm's partial-write occurrence (2nd occurrence,
`feedback_pm_midsprint_decomposition_leaves_head_stale_not_closeout`) flips `head.status` to
`"idle"` while leaving `active_task_id`/`next_agent` dangling non-null — a DIFFERENT malformed
state (`head.status=="idle"` with dirty fields) that never enters the `in_progress` branch at all;
control instead falls to the `head.status=="idle"` fall-through (`L548` at read time), whose only
documented contract is a PROSE convention ("established convention:
`active_task_id:null, next_agent:"router"`"), not an enforced guard.

**Ruling: complete pm's own fix, as a separate, narrow, single-file companion.** Name it explicitly
so it is not lost the way this row itself almost was:

> **`FIX-PM-NONCLOSEOUT-HEAD-RESET-INCOMPLETE-NULLOUT`** — size XS, owner/zone `agent-father` /
> `docs/agents/pm/flow/main.md`. Complete pm's non-closeout-decomposition `.head` write
> (commit `95540b50d`'s partial status-flip) to fully null `active_task_id`/`next_agent`, matching
> the SAME full-null idiom every carve-out in `dev-team/main.md` already uses
> (`.head = {status:"idle", updated_at:$t, updated_by:"pm", active_task_id:null, next_agent:null}`),
> instead of flipping `status` alone.

**Recommended, optional, bundled-here addendum (not a new row — cheap enough to ship with WF-2b,
directly motivated by this same analysis, belt-and-braces matching the dev-* class precedent where
neither the source fix nor the gate fix subsumes the other):** at the `head.status=="idle"`
fall-through (`L548` at read time), before Idle-Tick Rotation Selection runs, add a defensive
null-out for any dangling `active_task_id`/`next_agent` found on an already-idle head — this closes
the residual risk for ANY future partial-reset bug (not just pm's), regardless of source, the same
way WF-1d's lane-widening is a defensive backstop independent of which dev-* specialist caused the
staleness:
```bash
if [ "$head_status" = "idle" ] && [ -n "$head_active_task" ] && [ "$head_active_task" != "null" ]; then
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  jq --arg t "$now" \
    '.head.active_task_id = null | .head.next_agent = null | .head.updated_at = $t | .head.updated_by = "dev-team (idle-dangling-fields hygiene)"' \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
fi
```
Agent-father/PO call on whether to bundle this now or spin it into its own row — flagged either
way, not silently dropped.

## 5. AC-5 — Ruling on memory-candidate (a): per-flow-doc handoff sync for pm/architect/router

**Not warranted. WF-2b (this row) supersedes it for this facet.** Reasoning:
1. **Zero latency advantage for (a).** WF-2b corrects `.head` and lets S2 dispatch the corrected
   agent in the SAME tick (§3, `head_next_agent="$row_next_agent"` before falling through) — a
   per-flow-doc source sync would buy no observable improvement, since nothing else reads `.head`
   in the gap (§2).
2. **Maintenance/drift cost asymmetry.** (a) would require editing N flow docs (pm's, architect's,
   router's own DRS write path, and every future agent added to the pipeline) with hand-authored,
   independently-maintained copies of the same sync logic — exactly the failure that already
   happened once: pm's own attempt (commit `95540b50d`) drifted from dev-team's canonical full-null
   idiom (§4). A single centrally-maintained gate cannot drift per-agent the way N independent
   copies can.
3. **AC-6's fleet-gate lesson applies directly here, not just to this row's own implementation.**
   `feedback_fleetwide_gate_validated_on_one_file_optout_allowlist` warns against rolling a new
   mandatory contract across a heterogeneous multi-file corpus without validating the whole corpus
   first. Recommending (a) now would be exactly that: a new per-flow-doc contract proposed for
   3+ files, none of them validated against each other's actual conventions. WF-2b needs no
   per-agent opt-in at all — it is derived purely from board data.
4. **Distinguish from the dev-* class's OWN source-fix row** (`FIX-DEVFLOW-MICROSERVICE-
   SUCCESS-PATH-NO-HEAD-SYNC`), which IS warranted for a different reason: that row closes a
   LANE-VISIBILITY gap (the row leaves `in_progress[]` entirely, `.head` briefly points at a lane
   WF-1/1b/1c/1d must actively rediscover), where a source-side fix genuinely shortens or removes
   an exposure window a gate-side fix alone would otherwise carry until the next tick. WF-2b's
   facet never has that exposure window in the first place — the row NEVER leaves `in_progress[]`,
   so there is no lane-rediscovery step to shorten. The two facets are NOT symmetric, and the
   dev-* class's dual-layer precedent should not be over-applied here.

## 6. AC-6 — Fleet-gate compliance statement

WF-2b is confined to **one file** (`docs/agents/dev-team/flow/main.md`) and proposes **no new
fleet-wide flow-doc contract** — there is nothing to validate against a multi-file corpus, so the
opt-in/validate-the-whole-corpus requirement from
`feedback_fleetwide_gate_validated_on_one_file_optout_allowlist` is satisfied by construction (zero
files beyond this one are asked to adopt a new pattern). The AC-4 companion recommendation (§4) is
ALSO single-file (`docs/agents/pm/flow/main.md`) and reuses an already-established, already-
precedented idiom (WF-1c/WF-3's full-null `.head` reset) verbatim rather than inventing a new one —
it does not trigger the fleet-gate risk class either. The AC-5 ruling (§5) explicitly declines to
propose the one recommendation that WOULD have been multi-file.

## 7. Regression verifier spec (companion `developer`-zone row, not implemented here)

`scripts/` is outside agent-father's `commit_zone.allowed` (same TE-T02/S1-S20 precedent this file
already cites repeatedly) — flag, don't author:

> **`FIX-DEVTEAM-HEAD-NEXTAGENT-COHERENCE-VERIFY`** — size S, owner `developer`,
> `scripts/audits/devteam-head-nextagent-coherence-verify.sh`, SYNTHETIC-fixture-only (mirrors
> `scripts/audits/devteam-pipeline-resume-terminal-lane-verify.sh`'s pattern, zero live
> `orch-state.json` I/O):
> 1. **Positive, flat `in_progress[]`:** row `next_agent="agent-father"`, `head.next_agent=
>    "architect"` (stale) → assert `head.next_agent` becomes `"agent-father"`, `resume_attempts`
>    resets to 0, control falls through to WF-3 the SAME tick (never `JUMP`s away), S2 spawns
>    `"agent-father"`.
> 2. **Negative (no-op):** `row.next_agent == head.next_agent` → assert WF-2b makes no write,
>    `.head` byte-unchanged past this block.
> 3. **`active_sprints[].tasks[]`-resident positive:** same mismatch shape as (1) but the row lives
>    inside `active_sprints[N].tasks[]`, not flat `in_progress[]` → assert identical resync
>    behavior (parity check, §3's scope-widening).
> 4. **Orthogonality control (independent of WF-1d landing order):** a row resident in `review[]`/
>    `qa[]`/`ready[]`/`done[]` (absent from `in_progress[]`/`active_sprints[]`) with `head` still
>    naming it → assert `row_next_agent` resolves empty, WF-2b makes no write, regardless of
>    whether WF-1d's own check is present in the fixture chain or not.
> 5. **WF-3 false-positive-avoidance control:** `resume_attempts=2` pre-existing + a mismatch
>    present → assert post-WF-2b `resume_attempts==0` and WF-3's `>=3` bound does NOT fire this
>    tick.
> 6. **WF-4 interaction control:** `row.claimed_at` = 3h ago (past 2h threshold) + a mismatch
>    present + a stubbed git-log `commit_found` match for the SAME reassignment commit → assert
>    WF-2b resyncs `.head` FIRST, then WF-4 evaluates `commit_found` non-empty and does NOT reset,
>    and S2 dispatches the CORRECTED agent (not the stale one) — directly proves the gap WF-4's own
>    in-file comment named is closed.
> 7. **Non-goal control:** `row.next_agent` null/absent → assert WF-2b's guard skips, `.head`
>    unchanged, behavior identical to pre-fix (declared non-goal, §3).

## 8. Standard Detection + handoff

**BUILD-STANDARD: not-applicable** (bug-fix/design spec, in-zone, no new primitives).

**Zone:** `docs/agents/dev-team/flow/` — per the same `po_routing_ruling_20260721` artifact-class
ruling the 2026-08-07 sibling blueprint already applied to this exact file: agent-instruction prose
under `docs/agents/**` routes to `agent-father`, never `developer`. §3's entire deliverable is
prose+bash inside `main.md` — zero `.ts`/`.py`/`scripts/` edits required for the row's own 6 ACs
(§7's regression verifier is the only code-zone piece, explicitly flagged as a companion, not
implemented here).

**Companion rows flagged for PO to mint (both named explicitly, in the signal payload, so neither
is lost the way this row itself was — §0):**
1. `FIX-PM-NONCLOSEOUT-HEAD-RESET-INCOMPLETE-NULLOUT` (§4) — agent-father, XS.
2. `FIX-DEVTEAM-HEAD-NEXTAGENT-COHERENCE-VERIFY` (§7) — developer, S.

## 9. Risk flags

- **DDD/security/memory:** none — pure orchestration-doc + bash change, no production runtime path
  touched.
- **Concurrent-edit risk (flagged, not a defect in this brief):** `main.md` was mid-flight-edited
  by a concurrent agent-father session at read time (§1). This brief's patch anchors are
  content-based, not line-number-based, specifically to survive that. Agent-father applying this
  patch should re-read the live file immediately before editing, exactly as this file's own
  established convention already requires on every prior change.
- **Regression risk if §3's ordering is skipped:** placing WF-2b AFTER WF-3/WF-4 instead of BEFORE
  would reproduce the false-positive class §3 specifically rules out (a correct dispatch
  immediately tripping a stale resume-attempt count) and would leave WF-4's own already-written
  "commit found, don't reset" branch dispatching the STALE agent instead of the corrected one —
  both are non-negotiable ordering constraints, not stylistic preferences.
- **Field-name collision avoided:** reuses only existing `.head` fields (`next_agent`,
  `next_action`, `resume_attempts`, `last_resume_at`, `updated_at`, `updated_by`) — no new schema
  keys, no collision risk with `blocked_by` (WF-3's own concern, not applicable here since WF-2b
  never touches the row's own board fields, only `.head`).
- **Scan clean:** dedup-checked (§0), brownfield-verified against the live file this cycle, not the
  row's own stale text (§1).

## RETURN
DONE: Technical design complete — `docs/architecture-briefs/2026-08-14-devteam-head-nextagent-write-coherence.md`
ZONE: docs/agents/dev-team/flow/
NEXT: agent-father (main.md WF-2b insertion, §3; optional idle-dangling-fields addendum, §4) | PO (mint 2 flagged companion rows, §8)
PIPELINE: continue
