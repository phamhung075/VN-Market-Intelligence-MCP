# CHEF MID-FLOW BAIL — DETERMINISM GUARD (PLAN-ONLY SPEC)

**Task ID:** FIX-CHEF-MIDFLOW-BAIL-DETERMINISM (P1, recurring, recurrence_count=2)
**Agent:** agents-architect · **Date:** 2026-08-07
**Status of this document:** PLAN-ONLY. No code/doc changes shipped. This is the spec the row's own
AC asks for ("a plan-only spec first"). Implementation is a FOLLOW-UP task for agent-father (flow-file
authoring is its exclusive lane, confirmed via `.claude/skills/dispatch/SKILL.md`).

---

## 0. Executive Summary

`chef.md`/`chef-dish.md` (unified-agent's TNB 6-layer dish flow) has bailed mid-flow **3 times** across
**2 distinct trigger mechanisms**, always producing the same defect signature: the publish marker is
claimed, real work happens, and then the agent stops and narrates instead of executing — no MARKET
dish, no synthesis JSON, no `[chef] FAILED` telemetry, nothing. The flow's own existing hard rule
("There is no third path between SENT and FAILED", `chef.md` Step 1) has already been violated 3
times, including once by an agent that reached that exact line. **Prose-only enforcement is empirically
insufficient for this defect class** — the fix cannot rely solely on a stronger instruction in the same
medium that already failed 3 times.

This spec proposes two independent layers:

- **Layer 1 (in-flow, best-effort):** widen the *existing* "Degraded-dish floor" rule (`chef.md` Step 1)
  from a source-availability rule into a universal, cheap, checkpoint-driven recovery procedure
  (`chef-telemetry.md § Degraded-Floor Recovery`) reachable from every step boundary in `chef.md` AND
  `chef-dish.md` (Steps 0.5 through 8), not just the one named branch the first two occurrences hit.
- **Layer 2 (out-of-band, code-enforced):** since Layer 1 is still agent-followed prose and the agent has
  already demonstrated it will sometimes not follow *any* documented path (not even emit the
  already-specified `self-abort-no-exception` FAILED telemetry), the actual AC(b) guarantee — "a
  code-enforced explicit abort path that releases any claimed publish marker" — is delivered by a
  periodic reconciliation check run by a **different actor** (system-auditor), which does not depend on
  the bailing agent's cooperation at all.

Both layers call into, and never duplicate, UC-CCA-P3's marker-lifecycle ownership (see §5).

---

## 1. Root-Cause Evidence (read at source, not paraphrase)

Read: `docs/agents/unified-agent/flow/chef.md`, `docs/agents/unified-agent/flow/chef-dish.md`,
`docs/agents/unified-agent/flow/chef-telemetry.md` (full, this cycle).

### 1.1 Occurrence 1 — 2026-07-16, chef-eod
Claimed `published:chef-eod:2026-07-16` at Step 0.5, ran Steps 0-1 (16 tool calls, 107k tok, 116s), then
returned a scope-clarification narrative ("given the complexity of implementing all 8 steps... I need to
clarify the scope"). 3-plane confirmation of non-publish: no MARKET post, no synthesis JSON, self-report
"Steps 2-8 remain".

### 1.2 Occurrence 2 — 2026-07-17, chef-eod
Identical signature. Steps 0-1 (22 tool calls, 144.6k tok, 130s), same class of bail. This is the
`recurrence_count=2` escalation event (`feedback_recurring_bug_escalation`, 2+ → elevate P2→P1, block).

### 1.3 Occurrence 3 — 2026-07-29T07:22Z, chef-intraday (corroboration, same row, NEW trigger)
Different mechanism, same defect class. Sequence: Step 0.5 claimed `published:chef-intraday:2026-07-29:14`
→ Step 0 GATHER completed → Step 1 CLUSTER found **5 qualifying clusters** (the convergence rule fired —
publication was flow-MANDATORY per `chef.md`'s own "Gate-fired contract") → agent self-reported "token
budget reached during Layer analysis phase" (i.e. inside `chef-dish.md` Steps 2-6) and returned without
executing Steps 2-8. Raw-verified no publish via `get_market_message_digest`. **This is the widening
signal**: the bail is not tied to the "scope clarification" logic branch — it is triggered by resource
exhaustion, which can land at *any* step. PO's own note on the board row states this explicitly and
instructs: "an anti-bail/degrade path that only catches logic branches will not catch this."

### 1.4 The empirical finding that drives this spec's Layer 1 vs Layer 2 split
`chef-telemetry.md` **already** defines a named failure mode for exactly this case:
> `self-abort-no-exception` — agent chose to stop mid-flow without an exception... Emit `FAILED` with
> `reason="self-abort-no-exception"`. This is a PO-defined violation; it must be observable on WORK channel.

None of the 3 occurrences emitted this FAILED telemetry either. The agent did not take the wrong branch
of a documented decision — it exited the documented flow entirely, mid-narrative, without touching *any*
of the specified catch machinery. `chef.md` Step 1 also already carries a hard prohibition ("Self-refusal
— any English prose such as 'I cannot complete...' ... is a flow violation") and a pre-existing
"Degraded-dish floor" that has *already* successfully published thin-data dishes before (per the row's
own AC framing). All of this documented machinery existed before occurrences 1 and 2. **The fix is not
"write a clearer rule" — that rule already exists and was already ignored.** This is why Layer 2 (§4) is
not optional decoration; it is the part of this spec that actually satisfies AC(b) as a guarantee rather
than a hope.

---

## 2. Layer 1 — In-Flow Degraded-Floor Recovery (cheap, checkpoint-driven, best-effort)

### 2.1 Design principle
The current bail happens, in the agent's own words, because completing all 8 steps under pressure "feels
like too much work." The fix must make the **compliant path cheaper than bailing**, not just more
mandatory-sounding. A one-line pointer at every step boundary that jumps to a short, already-templated
minimal-publish procedure is cheaper (fewer remaining tool calls, no new reasoning) than composing a
scope-clarification essay — this is the actual lever, not the wording of the prohibition.

### 2.2 Generalize the existing Degraded-dish floor
`chef.md` Step 1 already states:

> **Degraded-dish floor (minimum valid dish):** If ≥1 supplementary source is down... the dish MUST
> still be published with: (1) available signal clusters only; (2) explicit degradation note...

This rule is scoped to *source unavailability* only. Widen its trigger condition (in place, same
paragraph) from:

```
IF ≥1 supplementary source is down
```
to:
```
IF ≥1 supplementary source is down
   OR execution cannot reach Step 8 for any other reason (tool failure, budget exhaustion,
      uncertainty, self-narrated inability to continue)
```

Relocate the *procedure* itself (currently inline prose in `chef.md` Step 1) into a new shared section in
`chef-telemetry.md` — call it **`§ Degraded-Floor Recovery`** — since telemetry.md is already the single
file both `chef.md` and `chef-dish.md` reference for ENTRY/CLOSE/FAILED/SILENT boundary behavior. `chef.md`
Step 1's text becomes a one-line pointer + the source-down trigger condition; no logic is deleted, only
relocated and widened (same pattern already used for the L5/`[gap:...]` "reusable rule" twice in
`chef-dish.md` Steps 5 and 6 — this is a third instance of an already-proven pattern in this exact file
family, not a new philosophy).

### 2.3 `§ Degraded-Floor Recovery` procedure (new content for `chef-telemetry.md`)

**Entry condition (ANY of):**
- `self-abort-no-exception` (existing named failure mode)
- `tool-error` after 1 retry (existing)
- `signal-read-fail` (existing)
- Supplementary source down (existing Step 1 trigger, folded in here)
- NEW: `budget-pressure-self-detected` — the agent's own assessment that it cannot complete remaining
  steps within its remaining budget. Soft/self-reported by construction (an LLM cannot be forced to
  self-assess reliably) — this is exactly why §4 exists; do not treat this entry condition as a
  guarantee.
- Any other uncaught exception reaching the catch boundary (§2.4)

**Procedure (reads directly from the flow's own already-named session-state variables — nothing new
invented):**
1. Read whatever of these already exist this cycle: qualifying clusters (Step 1), `MACRO_HEALTH` (Step
   1.5), any Layer 2/3/4 narrative fragments composed so far, `conviction_calls[]` (Step 4, partial),
   `$L5_GAP_TOKEN` / `$L6_GAP_TOKENS` (Steps 5/6, if reached).
2. For every TNB layer **not yet reached**, append `[gap:<layer>_not_reached_partial_cycle]` — a new
   reason-suffix on the *existing* gap-token vocabulary (Step 7.5 already has `[gap:L2_...]`,
   `[gap:L3_...]`, `[gap:business_context_absent]`, etc. — this adds one more reason, not a new
   mechanism).
3. Force `$QUALITY_VERDICT = degraded` (Step 7.5's gate will already compute this once gap tokens exist —
   no new scoring logic).
4. Compose a **minimal** Block A (2-3 sentences, clusters + whatever narrative exists, omit unreached
   layers cleanly — reuses the exact "omit cleanly" rule Step 1's degraded floor already specifies) and
   Block B (WORK detail, all gap tokens + a `partial_cycle_recovery: true` marker).
5. Enter the existing Step 7 → 7.5 → 7.6 → 8 machinery with this minimal content as input. No new
   publish/persist/log code path — this is the same pipe every dish already uses, just fed a thin
   payload.
6. **Only if step 4/5 itself cannot complete** (e.g. `send_telegram` is erroring, or SESSION_STATE is
   empty because the cycle died before Step 1 ever ran) — this is the genuine, unrecoverable abort case.
   Go to §2.5.

### 2.4 Try/Catch Boundary — widen the start point
`chef-telemetry.md`'s existing Try/Catch Boundary states: *"try block begins at ENTRY Telemetry — wraps
Steps 0 through 7 inclusive."* ENTRY Telemetry fires "immediately after Bootstrap, before any GATHER
reads" — but Step 0.5 (the marker claim) sits between Bootstrap and Step 0 in `chef.md`'s own file order,
and is never explicitly placed relative to ENTRY. **This is an independent gap**: a failure between the
marker claim and wherever ENTRY actually lands is invisible to the catch boundary by construction. Fix:
pin the try block to start **at Step 0.5** (the marker claim itself, the very first state-changing action
of the cycle) and extend it to end at the Degraded-Floor Recovery attempt (§2.3), not at Step 7. This is
the concrete answer to "reachable from ANY partial state, Steps 0-8" — Step 0.5 is literally the earliest
possible step.

### 2.5 True-abort fallback (recovery itself failed)
Emit FAILED telemetry (existing spec, unchanged) AND attempt a release call — but **gated**, never a raw
`task_release`. See §5 for exactly what this calls into and why a raw release is actively dangerous today.

### 2.6 Checkpoint pointers — where they hook into the step sequence
One line, inserted immediately after each of: `chef.md` Step 1 (already has partial coverage — extend
it), and `chef-dish.md` Steps 1.5, 2, 3, 4, 5, 6, 6.5, 6.7 (i.e., every step boundary between the gate-fire
and Step 7):

```
**Checkpoint:** If you cannot continue past this point for any reason (budget, tool failure,
uncertainty), STOP — do not narrate a scope-clarification or self-abort. Jump directly to
`chef-telemetry.md § Degraded-Floor Recovery` using whatever session state exists. This is
cheaper than explaining why you cannot continue.
```

~9 one-line insertions total (~9L added across `chef-dish.md`, ~1L in `chef.md`). This closes AC-2
("reachable from ANY partial state") at the cheapest possible token cost, consistent with this
codebase's own token-economy lazy-load discipline.

---

## 3. Layer 2 — Out-of-Band, Code-Enforced Backstop (the actual AC(b) guarantee)

### 3.1 Why Layer 1 alone does not satisfy "code-enforced"
Layer 1 is still markdown followed by the same agent that has already skipped equivalent, already-shipped
markdown instructions 3 times (§1.4). Per this codebase's own established vocabulary
(`UC-CCA-P3`'s `AC-CODE-GATE` note: *"prose gates have now failed 3x — evaluate a code-enforced backstop"*
— written about the sibling marker-release defect, same root pattern), a guarantee requires a check
performed by an actor that does not depend on the bailing agent's own next action.

### 3.2 Design
A new periodic reconciliation check, run by **system-auditor** (which already owns this exact class of
detector — see `docs/agents/system-auditor/flow/main.md` Step 0b.1's stale
`.auditor-cycle-markers-*.tmp` orphan sweep and its Tier-2/3 missing-cycle staleness checks — this is the
same pattern, one more instance, not a new detector class):

```
For each held marker from task_list_held(task_kind="cowork-slot") matching "published:*":
  age = now - claimed_at
  IF age > (slot's own typical cycle duration + grace period)
     AND no docs/data/unified-agent-synthesis-{key_date}-{slot_base}.json exists for this key
     AND no matching "[chef] SENT ..." WORK-channel message exists for this cycle_id
  THEN: flag "chef-marker-orphan" anomaly — this is a mid-flow bail that leaked a false tombstone.
        Route through the Release Gate (§5), never a raw task_release.
```

This reuses the identical delivery-evidence predicate already speced for UC-CCA-P3's own Release Gate
(§5) — same check, different triggering context (proactive sweep vs. reactive pre-release gate). Nothing
new is invented; the check that already needs to exist for safe manual/automated release is simply also
run periodically, unprompted, by a party other than the agent that might be stuck.

This is explicitly the "future automated dead-agent-recovery flow" the sibling brief
(`docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md` §3, Component B)
already named as one of the three legitimate future releasers but did not design — this spec fills that
placeholder, scoped to this row.

### 3.3 Scope note (deliberately narrow)
This row's AC(b) is about chef's own abort path (§2.5). §3 is offered as a **recommended defense-in-depth
follow-up**, not a hard blocker of this row's minimum AC — it touches system-auditor's flow (a different
agent's zone) and can ship on its own schedule. Flagged as **FOLLOW-UP-2** in §6.

---

## 4. Interaction with the existing degraded/EOD floor rule

No parallel rule is created. §2.2 folds the existing Step 1 floor into the same shared procedure as one
of several trigger reasons. Before this spec: 1 rule, 1 trigger, 1 branch (Step 1 only). After: 1
procedure, N trigger reasons, N entry points (every step boundary). This is strictly a widening, not a
replacement — a dish that hits the existing source-down trigger today behaves identically after this
change.

---

## 5. Interaction with UC-CCA-P3 (marker-release — NOT duplicated here)

Confirmed by direct grep this cycle (`grep -rn task_release docs/agents/unified-agent/flow/*.md
docs/agents/cowork-team/flow/*.md .claude/skills/cowork* docs/protocols/dwf-ops-runbook.md`): **zero code
paths call `task_release` on a `published:*` key today, anywhere.** `chef.md` Step 0.5 only claims; it
never releases (confirmed live in the Step 0.5 body read this cycle). The sibling brief
`docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md` (Component B) is the
owner of the release mechanism: a **Published Marker Release Gate**, to live in
`docs/agents/cowork-team/flow/spawn-fanout.md`, gating every `task_release` call on a `published:*` key
behind a delivery-evidence check (synthesis artifact absent AND no matching MARKET message) before
allowing release.

**This spec's abort path (§2.5, §3.2) calls into that gate — it does not reimplement it.** Concretely:

- Both §2.5 (Layer 1's true-abort fallback) and §3.2 (Layer 2's orphan sweep) MUST invoke the Release
  Gate procedure once it ships, never a raw `task_release`.
- **Interim behavior (Release Gate not yet shipped):** do **not** release at all — leave the marker for
  TTL self-heal. This is not a weaker stopgap invented for this spec; it is *already* the documented safe
  practice in this system today (`UC-CCA-P3`'s 2026-07-29 corroboration note: *"the dispatcher correctly
  did NOT release it (peer double-publish risk, feedback_chef_releases_published_marker_enables_peer_double_publish)"*).
  A raw, ungated release is actively dangerous (proven oscillation: 07-02 release-after-publish →
  double-publish; 07-03 release-on-every-no-post → leaked-marker-suppresses-legit-dish). This spec must
  not reintroduce either failure mode.
- **Sequencing:** this row's release-call branches (§2.5, §3.2) should land coded as a no-op/log-only
  stub until the Release Gate exists, then wire in for real — a single follow-up edit, not a redesign.
  The *publish* half of this spec (§2, the actual fix for AC(a)) does **not** depend on UC-CCA-P3 at all
  and can ship independently: a successfully-recovered degraded dish makes the already-claimed marker a
  legitimate tombstone, no release ever needed.

---

## 6. Recommended Implementation (actionable for agent-father — FOLLOW-UP, not done here)

This brief is plan-only. The following is the FOLLOW-UP task decomposition for whoever implements:

**FOLLOW-UP-1 (this row's minimum AC — P1, agent-father, flow-file authoring, cross-service/):**
1. `docs/agents/unified-agent/flow/chef-telemetry.md`:
   - New `§ Degraded-Floor Recovery` section (§2.3 above).
   - Try/Catch Boundary section: pin start to Step 0.5, extend end to include the recovery attempt
     (§2.4).
2. `docs/agents/unified-agent/flow/chef.md` Step 1: widen the Degraded-dish floor trigger condition
   (§2.2), replace inline procedure with a pointer to `chef-telemetry.md § Degraded-Floor Recovery`,
   add one checkpoint line (§2.6).
3. `docs/agents/unified-agent/flow/chef-dish.md`: one checkpoint line after each of Steps 1.5, 2, 3, 4,
   5, 6, 6.5, 6.7 (§2.6).
4. Release-call branches (§2.5) coded as no-op/log-only stub, cross-referencing UC-CCA-P3's Release Gate
   by name, until that gate ships (§5 sequencing note).

**FOLLOW-UP-2 (defense-in-depth, separate row, P2 suggested, agent-father, system-auditor's zone):**
5. `docs/agents/system-auditor/flow/main.md`: new published-marker orphan sweep (§3.2), same pattern
   family as the existing Step 0b.1 stale-marker sweep.

**Sequencing:** FOLLOW-UP-1 items 1-3 can ship immediately (no dependency). Item 4 and FOLLOW-UP-2 both
assume UC-CCA-P3's Release Gate (§5) — code them as inert stubs first if UC-CCA-P3 has not landed, wire
in once it has. Do not block FOLLOW-UP-1 items 1-3 waiting on UC-CCA-P3.

---

## 7. Verification Gate (for whoever implements — test design)

1. **Checkpoint reachability:** grep confirms a `§ Degraded-Floor Recovery` pointer exists after every
   step in `chef-dish.md` between the gate-fire and Step 7 (Steps 1.5/2/3/4/5/6/6.5/6.7) — 8/8 present.
2. **Widened trigger:** `chef.md` Step 1's Degraded-dish floor condition includes the OR-clause from
   §2.2 verbatim.
3. **Try/catch start point:** `chef-telemetry.md`'s Try/Catch Boundary explicitly names Step 0.5 as the
   start, not "ENTRY Telemetry" alone.
4. **Simulated mid-flow bail (manual/QA harness):** inject a forced tool-error at each of Steps 2, 4, 6
   in a test/dry-run cycle → confirm the recovery procedure produces a `QUALITY: degraded` dish with
   ≥1 `[gap:..._not_reached_partial_cycle]` token, not a silent narrative exit.
5. **Marker discipline:** confirm no release call fires in any of the above simulations until the
   Release Gate (UC-CCA-P3) exists in code — the stub must be provably inert (log-only), not a raw
   `task_release`.
6. **RAW-verify on next real occurrence:** if a 4th real-world bail happens post-implementation, RAW
   cross-check (same 3-plane method PO already uses: MARKET store, synthesis JSON, WORK telemetry) must
   show a degraded dish DID publish, not a repeat of the silent-exit signature.

---

## 8. Files Read / Commands Run This Cycle (citation)

- `docs/agents/unified-agent/flow/chef.md` (full, source, not paraphrase)
- `docs/agents/unified-agent/flow/chef-dish.md` (full, source, not paraphrase)
- `docs/agents/unified-agent/flow/chef-telemetry.md` (full)
- `docs/data/orch/orch-state.json` — task board row `FIX-CHEF-MIDFLOW-BAIL-DETERMINISM` (full note
  history) and `UC-CCA-P3` (full note history)
- `docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md` (full — sibling
  design, confirms zero live release code paths)
- `docs/protocols/dwf-ops-runbook.md` § Published Marker Interaction
- `docs/agents/system-auditor/flow/main.md` (Step 0b.1 stale-marker sweep pattern, grep-scoped)
- `grep -rn task_release docs/agents/unified-agent/flow/*.md docs/agents/cowork-team/flow/*.md
  .claude/skills/cowork* docs/protocols/dwf-ops-runbook.md` → 0 hits (confirms §5's "zero code paths
  release published:* today" claim independently, this cycle, not inherited from the sibling brief's
  own grep alone)

---

## RETURN

```
DONE: Plan-only determinism-guard spec authored for FIX-CHEF-MIDFLOW-BAIL-DETERMINISM
NEXT: agent-father (implement FOLLOW-UP-1) | po (ratify + decompose FOLLOW-UP-2)
HANDOFF: docs/architecture-briefs/2026-08-07-chef-midflow-bail-determinism-guard.md
PIPELINE: continue
```
