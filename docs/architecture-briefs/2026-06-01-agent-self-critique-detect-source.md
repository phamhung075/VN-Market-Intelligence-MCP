# Architecture Brief — Agent Self-Critique as Decentralized DETECT Source

**Sprint:** SELF-CRITIQUE-DETECT
**Date:** 2026-06-01
**Author:** agents-architect
**Status:** DESIGN ONLY — zero code, zero `.md` edits (this brief only)
**Implements:** operator intent "agent self review his work and his result for auto propose new upgrade / auto repair / power up"

---

## 0. Context and Gap Statement

The existing SELF-IMPROVE-GATE pipeline
(`docs/architecture-briefs/2026-05-27-gated-self-improvement-loop.md`) establishes a
three-lane PO-gated detect → propose → deliberate → implement loop. Its sole DETECT
source today is `system-auditor`, which runs external, centralized checks: signal-accuracy
degradation, infrastructure anomalies, and doc freshness.

`doc-self-heal` (`.claude/skills/doc-self-heal/SKILL.md`) runs at every cowork end-of-cycle
and reviews the MAP — the documentation the agent followed. It fixes outdated paths,
unclear instructions, and missing steps in the agent's flow/knowledge/skill docs.

**The gap:** nobody reviews the TERRITORY — the agent's own result quality, capability gaps,
and improvised workarounds, as seen from inside the agent at the moment the cycle ends. No
existing DETECT source captures:

- a tool call that returned 501/empty/degraded-source-tier this cycle;
- a flow step the agent was forced to skip or improvise because a capability was missing;
- a low-confidence or partial result accepted rather than escalated;
- the agent recognizing it used the same workaround as in the last cycle (notebook diff —
  the workaround is now a pattern, not a one-off);
- a budget overrun (step count or elapsed time materially exceeding the flow's intent).

`system-auditor` cannot see inside a single agent's execution narrative. The agent itself,
at its own cycle's end, is the only observer with that view. This brief adds a new
**decentralized DETECT source** — an end-of-cycle self-critique step — that is a sibling of
`doc-self-heal` and feeds the existing SELF-IMPROVE-GATE pipeline unchanged.

**Critical safety note:** the agent is the weakest reviewer of its own work. This design
mitigates that structurally: the step is PLAN-ONLY (emits a DRAFT proposal, zero
mutation), feeds an independent PO gate the author cannot bypass, and is throttled to
prevent noise flooding the pipeline.

---

## 1. Relationship to the Existing Pipeline

This brief adds ONE new node to the pipeline diagram in §2 of the 2026-05-27 brief:

```
DETECT ─── system-auditor (Tier-2/Tier-3 cron ticks)       [existing]
       ─── agent self-critique (end-of-cycle, per agent)    [NEW — this brief]
             │
             │  both write: docs/improvement-proposals/IMP-*.md (DRAFT)
             │  AND: DASHBOARD.md ## po row (type=improvement_proposal)
             ▼
PROPOSE ──── agents-architect                                [existing, unchanged]
             ▼
DELIBERATE── po (triage-signals.md)                         [existing, unchanged]
             ▼
IMPLEMENT ── lane-a: agent-father                           [existing, unchanged]
             lane-b: dev-team chain                         [existing, unchanged]
             lane-c: WORK Telegram → human                  [existing, unchanged]
```

Nothing downstream changes. The new step is purely an additional mouth at the DETECT end.
The proposal artifact format (§3 of the 2026-05-27 brief), the DASHBOARD row format,
the architect review handler, the PO gate, and the lane taxonomy are all reused verbatim.

---

## 2. Trigger Taxonomy — Machine-Anchored Only

The self-critique step fires ONLY when at least one of the following concrete, machine-
anchored conditions is true for this cycle. Subjective or aesthetic conditions are
explicitly excluded (see §3).

### T1 — Tool failure / degraded source

A tool call during this cycle returned one of:
- HTTP 5xx / network timeout / connection refused
- Empty payload where a non-empty result was structurally expected (e.g. `[]` from
  `get_market_snapshot` during open hours, `null` body from a BCTC tool)
- `source_tier` downgraded below the agent's configured minimum (e.g. fell back from
  VPS-proxy to cached data, or from primary to secondary source)

Evidence required in proposal: tool name, call timestamp, error code or source_tier value,
cycle context (slot_id, agent_id).

### T2 — Flow step skipped or improvised (capability gap)

A step defined in the agent's own flow file was skipped for a reason that is NOT covered
by `doc-self-heal` (i.e. not a doc error but a missing capability):
- The agent lacked a tool to perform the step and substituted a manual approximation
- A required upstream result was unavailable (not a transient tool failure — a structural
  gap, e.g. "no sentiment data exists for this ticker")
- The agent explicitly annotated a step as "improvised" or "approximated" in its session log

Evidence: step name, flow file and line, what was substituted or skipped.

Distinction from doc-self-heal: `doc-self-heal` fixes the MAP when the doc was wrong.
T2 triggers when the MAP was correct but the TERRITORY lacked the tool to execute it.

### T3 — Low-confidence or partial result

The cycle's primary output carried one or more:
- `confidence < 0.5` on a scored field (where the agent's flow designates a minimum)
- Explicitly partial result: the agent flagged it as incomplete, hedged, or missing
  data for ≥1 watchlist ticker
- A BCTC field accepted with `low_confidence` flag (per `reference_low_confidence_handling`)

Evidence: field name, confidence value, affected tickers/items.

### T4 — Recurring friction (notebook diff)

The agent reads its own notebook at cycle start. At cycle end, it identifies that:
- It performed the same workaround this cycle that it documented in a previous carry-over
  or notebook entry, AND
- That workaround has now recurred ≥2 times (i.e. the notebook already mentioned it once
  before this cycle)

This means the workaround is a pattern, not a one-off. A pattern warrants a proposal to
systematize. The recurrence count is determined by grepping the agent's own notebook for
the same workaround keyword (exact match or near-match in the carry-over section).

Evidence: notebook file, prior entry timestamp and text, current cycle recurrence.

### T5 — Step or time budget overrun

The cycle's elapsed time or step count materially exceeded the agent's documented budget:
- Elapsed time > 2× the flow's documented typical duration (if documented; skip if not)
- Step count > 1.5× the flow's listed step count (only if the agent can count its own steps
  reliably from its session log)
- A single tool call chain exceeded 10 sequential retries to accomplish one documented step

Evidence: elapsed time or step count, expected value, source of the expectation.

### Exclusions (never a trigger)

The following are explicitly NOT triggers, regardless of how strong the agent's subjective
impression:

- "My output could be better / more readable / more insightful" — lane-C forever, per §3.
- "The user might prefer a different format" — lane-C forever.
- Any judgment about the comprehensibility, aesthetics, or tone of Vietnamese-language
  output — lane-C forever (anchor: plain-VN MARKET report fix, 2026-05-27 binding case;
  `2026-05-27-gated-self-improvement-loop.md §7`).
- "I think this flow step could be improved" without a machine-anchored anchor from T1–T5.
- Any proposal that would change the success criteria by which the cycle itself is judged —
  lane-C forever; the author cannot propose to rewrite the terms of its own evaluation.

---

## 3. Lane Classification Pre-check (Author Responsibility)

Before writing the proposal, the agent MUST classify the trigger:

```
IF the proposal touches: comprehensibility / aesthetics / user-facing tone
   OR changes gate logic / audit rules / success criteria
   OR the trigger is "I believe my output quality could improve" with no T1–T5 anchor
   → Lane-C FOREVER. The author writes the proposal with Lane: LANE-C and rationale.
     The author does NOT suppress it — lane-C items still flow to the PO gate,
     which escalates to human per §7 of the 2026-05-27 brief.

ELSE IF the proposed fix has a hard, machine-checkable, ungameable success gate
   → Lane-B candidate. Author labels LANE-B. Agents-architect confirms.

ELSE
   → Lane-A (default for all flow/.md changes).
```

The agent is the weakest judge of whether a gate is truly ungameable. When in doubt,
label LANE-A. Agents-architect corrects the label at the proposal-review step (IP-2).

---

## 4. Proposal Artifact

Reuses the standard format from §3 of `2026-05-27-gated-self-improvement-loop.md` verbatim.

**ID convention:** `IMP-<YYYYMMDD>-<agent-id>-<trigger-code>-<slug>`

Examples:
- `IMP-20260601-news-scout-T1-bctc-501`
- `IMP-20260601-market-watcher-T4-sentiment-workaround`

**Created by field:** `<agent-id>` (not `system-auditor` — this identifies the new DETECT source)

**DASHBOARD row format** (reuses existing format, section `## po`):

```
| IMP-<id> | <ts> | <agent-id> | improvement_proposal | <summary ≤40 chars> | NEW | docs/improvement-proposals/IMP-<id>.md |
```

This is identical to the system-auditor row format — agents-architect's review handler
(handlers.md § Improvement-Proposal Review) processes both sources without distinction.

---

## 5. Safety Invariants (Non-Negotiable)

These are stated explicitly because the fleet's incident history demands it.

### S1 — PLAN-ONLY, zero mutation

The self-critique step MAY ONLY:
- Write `docs/improvement-proposals/IMP-*.md` (DRAFT status)
- Append one row to `docs/signals/DASHBOARD.md`
- Log a one-liner to the agent's own notebook (no separate commit — piggybacked on the
  existing end-of-cycle notebook write)

The self-critique step MUST NOT:
- Auto-repair the issue it detected
- Edit any flow, skill, or agent `.md` file
- Spawn any new agent
- Modify any data file, DB row, or configuration
- Call any destructive tool

Precedent: `auditor-false-positive-destructive outage` (notebook entry
`project_agents_architect.md` 2026-06-01T20:19:21Z, brief
`2026-06-01-detector-plan-only-safety.md`) — a detector that mutated production caused
permanent data loss. Precedent: `anomaly-task-bridge` SKILL.md explicit PLAN-ONLY footer —
the bridge pattern for all detect sources.

### S2 — No self-approve, no self-implement

The agent that writes the proposal MUST NOT:
- Review its own proposal (it is not agents-architect)
- Approve its own proposal (it is not PO)
- Implement its own approved proposal (it is not agent-father)

The author feeds the pipeline at the DETECT end. It exits the loop at that point.
The loop routes the proposal to agents-architect → PO → agent-father or dev-team,
all of whom are independent of the author.

**Rationale stated plainly:** the agent that just ran the cycle is the worst possible
reviewer of that cycle's quality. It has a systematic bias toward validating its own
choices. The independent PO gate and architect review are structural mitigations, not
optional checks. Removing or shortcutting them for "efficiency" is a protocol violation.

### S3 — No shell interpolation of proposal payload

The proposal payload (weakness text, evidence, proposed change) MUST be written as a
file write to `docs/improvement-proposals/IMP-*.md` using the Read/Write tools.

It MUST NOT be interpolated into a shell command or passed as an argument to any tool
that executes system commands. This is a shell-injection guard.

Precedent: `feedback_no_hardcode_stats` + signal-payload shell-injection risk noted in
fleet history.

### S4 — Cheap and throttled

- **Fires ONLY when a trigger from §2 fired.** Silent when no trigger fired, identical
  to `doc-self-heal` discipline ("`skip if nothing was wrong`"). No write, no DASHBOARD
  row, no token consumed on a clean cycle.
- **Hard cap: ≤1 proposal per agent per calendar day (VN date, GMT+7).** Before writing,
  the agent checks `docs/improvement-proposals/` for an existing DRAFT or
  ARCHITECT-REVIEWED proposal with its own `agent-id` prefix from today. If found → skip
  emit, log `"[self-critique] skip: proposal already open for today"`. This reuses the
  D-IMPROVE-4 cooldown guard from the 2026-05-27 brief §9 EDIT-1.
- **No new agent. No new cron.** The step rides the existing end-of-cycle, which fires at
  zero new tick cost.
- **No new Docker service.** All writes are markdown files in `docs/`.

### S5 — Commit safety

The proposal doc commit and DASHBOARD row commit use the existing commit-mutex skill
(`.claude/skills/commit-mutex/SKILL.md`), explicit paths only, never `-A` or `.`.

Cowork agents share the main git index with dev-team. Per `feedback_concurrent_commit_race`
and `feedback_merge_gate_cherrypick_serialize`, the end-of-cycle self-critique commit is
serialized through the same mutex gate that the existing notebook-write commit uses.
The self-critique commit is batched with the notebook write commit (one commit, two files)
to reduce mutex contention.

---

## 6. Host-Load Budget (per §6 of 2026-05-27-gated-self-improvement-loop.md)

```
New cron/agent: NONE
Schedule: NONE (rides existing end-of-cycle, zero new tick)
RAM: 0 MB incremental (no new process; runs inside existing agent session)
Disk per clean cycle: 0 KB (silent when no trigger fires)
Disk per triggered cycle: ~2–4 KB (one IMP-*.md DRAFT + one DASHBOARD row)
Token cost per clean cycle: ~50–100 tokens (trigger-check reads notebook header + session log summary)
Token cost per triggered cycle: ~400–700 tokens (trigger check + proposal template fill)
Max proposals emitted fleet-wide per day: ≤N agents × 1 = bounded by fleet size
  (current cowork agents: ~10; current dev-team cron invocations: ≤3/day)
  → hard ceiling ~13 proposals/day fleet-wide. In practice: 0–2/day expected.
docs/improvement-proposals/ directory: append-only, ~3–5 KB/proposal. APPROVED.
```

Budget verdict: **APPROVED** — zero new infrastructure, bounded writes, silent on clean cycles.

---

## 7. Flow-Edit Map

This is the concrete set of file edits required to implement this brief. Agent-father
executes these in Phase 1. No other files are touched.

---

### EDIT-1: `.claude/skills/cowork-end-cycle/SKILL.md`

**Current state:** 14 lines. Three steps: session-log → notebook-write → doc-self-heal.

**Edit:** Add a 4th step.

```
4. **Self-critique** → skill: `.claude/skills/self-critique/SKILL.md`
```

Position: after Step 3 (doc-self-heal), before end.

**Why this file:** cowork-end-cycle is the composition skill invoked by every cowork agent's
end-of-cycle sequence. Adding the step here propagates it to all cowork agents at zero
per-agent cost, identical to how doc-self-heal reaches all cowork agents.

**Size impact:** +1 line (15L total). Well within 120L skill-file cap.

---

### EDIT-2: `docs/agents/dev-team/flow/post-cycle.md`

**Current state:** 75 lines. Contains Step 4 (Scan), Step 4.5 (Compact Checkpoint with
notebook write + doc-self-heal), and Step 4.9 (Cycle Elapsed Announce).

**Edit:** Add self-critique invocation inside Step 4.5, immediately after the doc-self-heal
pointer and before Step 4.9.

```markdown
**Self-critique** → skill: `.claude/skills/self-critique/SKILL.md`
```

Position: after `**Doc self-heal** → skill: .claude/skills/doc-self-heal/SKILL.md` line,
before `## Step 4.9`.

**Why this file:** post-cycle.md is the dev-team's equivalent of cowork-end-cycle — it is
the single end-of-cycle composition point for the dev-team cron. The doc-self-heal step is
already here; the self-critique step is a sibling.

**Size impact:** +1 line (76L). Well within 120L flow-file cap.

**Note:** dev-team is a session-level orchestrator, not a single-task agent. The trigger
taxonomy (§2) still applies: dev-team self-critique fires only on a T1 tool failure, T2
capability gap, T3 partial result, T4 recurring friction, or T5 budget overrun observed
during THIS cycle's execution — not on behalf of spawned sub-agents. Sub-agents
(developer, qa, etc.) run their own end-of-cycle via their own flow's post-cycle hook
if one exists.

---

### EDIT-3: `.claude/skills/self-critique/SKILL.md` (NEW FILE)

**Purpose:** the implementation of the end-of-cycle self-critique step. This is the only
new file in this design.

**Projected line count:** ~80–100L. Within the 120L skill-file cap.

**Required content:**

```
---
name: self-critique
description: >
  End-of-cycle step: agent reviews its OWN just-completed work product for
  machine-anchored quality signals and emits a DRAFT improvement proposal if
  triggered. PLAN-ONLY. Zero mutation. Feeds the SELF-IMPROVE-GATE pipeline.
---

## Self-Critique (end-of-cycle)

PLAN-ONLY: this step may ONLY write a DRAFT proposal doc + DASHBOARD row.
Zero auto-repair. Zero flow/agent/.md edits. Zero DB mutations.
If no trigger from the taxonomy fires → skip silently. Do NOT write anything.

### Step SC-0 — Throttle gate (daily cap)
Check docs/improvement-proposals/ for an existing file matching
IMP-<YYYYMMDD>-<agent-id>-*.md where YYYYMMDD = today (VN date, GMT+7).
If found → log "[self-critique] skip: open proposal already exists for <agent-id> today" → EXIT.

### Step SC-1 — Check each trigger in taxonomy

For each trigger T1–T5 (§2 of brief 2026-06-01-agent-self-critique-detect-source.md):
- T1: Did any tool call return 5xx / timeout / empty-where-expected / degraded source_tier?
  Source: session log + tool call return values from this cycle.
- T2: Was any flow step skipped or improvised due to missing capability (not doc error)?
  Source: session log annotations.
- T3: Did the primary output carry confidence < 0.5 or explicit partial flag?
  Source: output fields, BCTC confidence values.
- T4: Does the notebook carry-over section contain the same workaround as this cycle,
  appearing ≥2 times across all notebook entries?
  Source: agent's own notebook (already loaded at cycle start).
- T5: Did elapsed time or step count materially exceed documented budget?
  Source: start_epoch (if set) and step counter.

If NONE of T1–T5 fired → EXIT silently. No write, no DASHBOARD row.

### Step SC-2 — Lane pre-classification

Apply the three-lane rule (SSOT: 2026-05-27-gated-self-improvement-loop.md §1):
- Aesthetics / comprehensibility / tone → LANE-C
- Machine-checkable ungameable gate → LANE-B candidate (label; architect confirms)
- Otherwise → LANE-A (default)

### Step SC-3 — Write DRAFT proposal

ID = IMP-<YYYYMMDD(VN)>-<agent-id>-<T-code>-<slug-≤15-chars>
Write docs/improvement-proposals/<ID>.md using the standard schema from §3 of
2026-05-27-gated-self-improvement-loop.md.
Created by: <agent-id>. Status: DRAFT.
Fill: Weakness, Evidence (trigger code + concrete data), Proposed Change (description only —
no implementation), Lane, Lane Rationale, Success Signal, Rollback.

Proposed Change MUST be a description of WHAT to change and WHY, not HOW.
It MUST NOT contain code, shell commands, or implementation steps.

### Step SC-4 — Write DASHBOARD row

Append to docs/signals/DASHBOARD.md ## po section:
| <ID> | <ISO-UTC> | <agent-id> | improvement_proposal | <summary ≤40 chars> | NEW | docs/improvement-proposals/<ID>.md |

### Step SC-5 — Commit (piggybacked on notebook-write commit)

Both the proposal doc and the DASHBOARD row are committed in the SAME commit as the
agent's notebook write (already performed by the notebook-write skill before this step).
If the notebook-write commit has already closed, open a new commit:
→ skill: .claude/skills/commit-mutex/SKILL.md
  own_paths: [docs/improvement-proposals/<ID>.md, docs/signals/DASHBOARD.md]
  intent: "chore(improve): self-critique draft <ID>"

### Step SC-6 — Log to notebook (no extra commit)

Append one line to the carry-over section of the notebook (already open):
[SC] T<code> proposal drafted: <ID> — <one-line summary>
```

**Why a new skill file instead of inlining:** the self-critique logic is invoked from two
different parents (cowork-end-cycle and dev-team post-cycle.md). A shared skill avoids
duplication, is consistent with the fleet's composable-skill pattern, and can be updated
in one place.

---

### EDIT-4: `docs/agents/agents-architect/handlers.md` — no change required

The existing `## Improvement-Proposal Review` handler (Steps IP-1 through IP-8, already
shipped) processes proposals regardless of whether `Created by` is `system-auditor` or an
agent. The handler does not branch on author identity. No edit needed.

---

### EDIT-5: `docs/agents/po/flow/triage-signals.md` — no change required

The existing `improvement_proposal` routing row (EDIT-3 from the 2026-05-27 brief) handles
proposals from any author. The PO gate is author-agnostic. No edit needed.

---

### Summary of edits

| File | Type | Change | Size impact |
|---|---|---|---|
| `.claude/skills/cowork-end-cycle/SKILL.md` | EDIT | Add Step 4 self-critique pointer | +1L (14→15L) |
| `docs/agents/dev-team/flow/post-cycle.md` | EDIT | Add self-critique pointer after doc-self-heal | +1L (75→76L) |
| `.claude/skills/self-critique/SKILL.md` | NEW | Full self-critique skill implementation | ~90L |

No other files are touched in Phase 1.

---

## 8. Shadow Pilot Recommendation

### Rationale

The signal-to-noise ratio of self-critique is unknown. The agent's ability to accurately
detect T1–T5 without false-positives is unproven. Per `feedback_fence_false_green`, the
gate must be proven-red before it is trusted. Per `feedback_spawn_retry_under_lag`, a
system that generates noisy proposals floods the PO gate with low-value work.

A shadow pilot on 1–2 flows first allows measurement before fleet-wide rollout.

### Pilot Flows

**Pilot flow 1: `news-scout` (cowork)**
- Rationale: runs on a predictable daily cron, has clear T1 exposure (VPS-proxy fetches
  frequently return degraded source_tier), and has a rich notebook history (making T4
  notebook-diff checks testable). Expected trigger rate: 1–3 T1/T4 events per week.

**Pilot flow 2: `dev-team post-cycle` (dev-cron)**
- Rationale: the dev-team cron runs complex tool chains with measurable T5 exposure (sprint
  execution overruns are common). T2 (capability gap) is also observable when a sprint step
  requires a tool the agent had to approximate.

### Shadow Mode Protocol

**Implementation note:** the shadow-no-dispatch rule (step 3 below) is implemented as a
SHADOW-PILOT pre-branch in `docs/agents/po/flow/triage-signals.md` `improvement_proposal`
row — the branch fires when `Created by` ∈ {news-scout, dev-team}. Remove that branch at
the Phase-2 promote decision.

During the pilot (recommended: 14 calendar days):

1. The self-critique skill writes `IMP-*.md` and DASHBOARD rows as designed (§7 EDIT-3).
2. Agents-architect reviews each proposal per the existing IP handler.
3. PO **logs the proposal and records a verdict** (approve/reject/lane correction) in the
   proposal doc, but **does NOT dispatch to agent-father or dev-team**.
4. After 14 days, PO reviews the batch:
   - How many proposals were filed? (Signal rate)
   - What fraction were LANE-A/B/C? (Lane distribution)
   - What fraction would have been approved if dispatched? (Signal quality)
   - Were there any false-positive triggers? (Noise rate)

### Promote Criteria

Promote pilot to fleet-wide rollout if, after 14 days:
- Signal rate: 0–3 proposals/agent/week (above 0 = system is detecting; below 3 = not
  flooding)
- Signal quality: ≥50% of proposals PO would have approved (not rejected as noise)
- False-positive rate: ≤20% of proposals carry a trigger that, on inspection, did not
  represent a real gap
- No lane-C mis-classification more than once per pilot flow (would indicate the trigger
  taxonomy is too broad)

### Kill Criteria

Kill or redesign if, after 14 days:
- Signal rate > 5 proposals/agent/week (noise flood)
- Signal quality < 30% approval rate (proposals are structurally low-value)
- ≥3 false-positive triggers across both pilot flows (taxonomy is too permissive)
- Any T4 (notebook-diff) trigger consistently fires on every cycle without resolution
  (notebook diff is unreliable for this agent's state)

If killed: remove Step 4 from cowork-end-cycle SKILL.md and the dev-team post-cycle.md
pointer, archive `.claude/skills/self-critique/SKILL.md`. No other rollback needed.

---

## 9. Constraints Summary

| Constraint | Source memory | Status in this design |
|---|---|---|
| PLAN-ONLY detect source | project_agents_architect + 2026-06-01-detector-plan-only-safety brief | Enforced in S1, §5 |
| No self-approve / no self-implement | Weak-reviewer principle | Enforced in S2, §5 |
| No shell payload interpolation | fleet incident history | Enforced in S3, §5 |
| ≤1 proposal/agent/day | D-IMPROVE-4 cooldown guard | SC-0 throttle gate |
| No new agent / no new cron | project_host_memory_panic | Host budget §6 confirmed |
| Silent when no trigger fires | doc-self-heal discipline | SC-1 exit if no trigger |
| Proven-gate before fleet-wide | feedback_fence_false_green | Shadow pilot §8 |
| Comprehensibility = lane-C forever | plain-VN MARKET anchor | Exclusions §2, lane check §3 |
| Commit safety (no -A, mutex) | feedback_concurrent_commit_race | S5, SC-5 |
| No hardcoded counts | feedback_no_hardcode_stats | Budget uses ranges |
| Proposal artifact reuses existing schema | 2026-05-27 brief §3 | §4 confirmed |
| DASHBOARD row reuses existing format | 2026-05-27 brief EDIT-1 D-IMPROVE-2c | §4 confirmed |
| DESIGN ONLY (no code, no .md edits) | this brief is the only output | Confirmed |

---

## 10. Signal to Agent-Father

Signal file: `docs/signals/agent-self-critique-detect-20260601.json`

```json
{
  "from": "agents-architect",
  "to": "agent-father",
  "type": "brief_complete",
  "payload": "docs/architecture-briefs/2026-06-01-agent-self-critique-detect-source.md",
  "priority": "normal",
  "createdAt": "2026-06-01T21:06:42Z",
  "notes": "BLOCKED on PO approval. Agent-father MUST NOT act until PO approves. When approved, implement EDIT-1, EDIT-2, EDIT-3 in §7 (Phase 1 only — 3 files). Then run shadow pilot per §8 (14 days) before fleet-wide. Phase 2 = promote/kill decision after pilot."
}
```

---

## 11. PO Critique + Gate Verdict (filled by PO — MANDATORY)

**Reviewed:** 2026-06-01T21:11:41Z · **PO** · governance: `2026-05-27-gated-self-improvement-loop.md` §4
**Status of this design:** DESIGN-ONLY. Stays BLOCKED for operator greenlight even on approval (operator is actively reviewing).

> Note on field count: the LIVE PO gate (`docs/agents/po/flow/triage-signals.md` line 17) now enforces
> **FIVE** critique fields, not the four the parent brief §4 named. The fifth is the
> **Lane-C-in-disguise check (C-3)**. This brief's §3 and §4 reference only "the 4 fields" and
> the §3 lane pre-check is the right shape but does NOT name C-3 by its live identifier. I apply all
> five below and raise the undercount as condition C4.

### (1) What could break — break-risk
Low. The step is additive and rides two existing end-of-cycle composition points
(`cowork-end-cycle/SKILL.md`, currently 14L → 15L; `dev-team/flow/post-cycle.md` Step 4.5, doc-self-heal
sits at line 58 with Step 4.9 immediately after — the named insertion point is real and clean). No existing
step is moved or removed. Failure mode if the new skill throws: it executes AFTER notebook-write and
doc-self-heal, so a self-critique fault cannot corrupt the notebook or the heal. The one real break vector is
the **shared git index** (cowork + dev-team on `main`): a self-critique commit racing the notebook-write
commit. S5 + SC-5 batch both into ONE mutex-guarded commit with explicit paths — this is the correct, already-
proven mitigation (`feedback_concurrent_commit_race`). Acceptable.

### (2) False-green / silent-swallow risk
Moderate, and structurally the sharpest concern — an agent grading its own work is the weakest reviewer in
the fleet (the design says so itself, S2). The mitigation is sound in shape: the agent is reduced to a
**reporter of machine-observable facts** (T1 error codes, T3 confidence scores, T4 notebook-grep), with the
quality judgment held by the independent architect (IP-2) and PO gate. The author cannot self-approve or
self-implement (S2), and the step is PLAN-ONLY (S1). The residual silent-swallow risk is the **inverse** of
the usual one: not that a bad proposal slips through (the downstream gate catches that), but that a real gap
is silently NOT reported — i.e. T1–T5 under-fire. That is acceptable for a v1 DETECT source: a missed
detection is a non-event (status quo), not a regression. The shadow pilot (§8) is the correct instrument to
measure the false-NEGATIVE and false-positive rates before trust. Adequately neutered for design approval.

### (3) Is the success signal gameable — gameability
This is where I push hardest, per the operator's instruction. Two layers:
- **The triggers themselves (§2)** are genuinely machine-anchored. T1 = HTTP/source_tier (not author opinion),
  T3 = a numeric `confidence < 0.5` threshold, T4 = an exact/near grep of the agent's OWN notebook, T5 = a
  numeric time/step ratio. T2 is the softest — "skipped or improvised because a capability was missing" leans
  on a session-log annotation the agent writes about itself, which is the one subjective backdoor. The §2
  Exclusions block fences off the obvious abuse ("output could be better", aesthetics, tone, and crucially
  *"any proposal that would change the success criteria by which the cycle is judged — lane-C forever"*). That
  last exclusion is the key anti-gaming clause: the agent cannot propose to rewrite the terms of its own
  evaluation. Good.
- **The gate is NOT the trigger — the gate is downstream.** Even a gamed/garbage trigger only produces a DRAFT
  that must clear architect IP-2 (evidence-concrete check, IP-3) AND the five-field PO gate. The success of the
  *system* is not gameable by the author because the author is not in the approval path. This is the load-bearing
  property and it holds.
- **Residual:** T2's self-annotation is gameable in the narrow sense that an agent could over-report
  improvisation to farm proposals — but the ≤1/agent/day cap (S4/SC-0) bounds the blast radius to one DRAFT,
  and architect IP-3 rejects vague evidence. Acceptable with the pilot watching T2 specifically.

### (4) Host-load impact
**Confirmed APPROVED against `project_host_memory_panic`.** That incident was RAM+swap exhaustion → SSD
swap death-spiral → SMC watchdog timeout → forced reset, driven by NEW concurrent processes (13-container fleet
+ host Mongo + parallel cron/agents + builds spiking together on 16GB). This design adds **zero new process,
zero new cron tick, zero new Docker service, zero new agent.** It runs inside an already-resident agent session
at end-of-cycle. RAM delta = 0 MB. Disk = 0 KB on clean cycles (silent), ~2–4 KB only on a triggered cycle.
Token delta ~50–100/clean, ~400–700/triggered, ≤1 proposal/agent/day → fleet ceiling ~13 DRAFTs/day,
0–2 expected. Nothing here touches the swap/RAM failure axis. The §6 "zero new cron/agent" claim is true and
verified.

### (5) Lane-C-in-disguise check (C-3) — the LIVE fifth field
Does the design, regardless of label, edit the gate/audit logic, the loop's own success criteria, an
irreversible action, or user-facing comprehensibility? **No — and it explicitly forbids itself from doing so.**
The §2 final exclusion ("any proposal that would change the success criteria by which the cycle is judged —
lane-C forever") IS the C-3 guard applied at the trigger layer. The design adds a DETECT mouth; it does not
touch the three-lane classification rule, the PO gate, or any success metric. Proposals it emits about
comprehensibility/tone are routed LANE-C-forever by §3. One gap: the per-proposal C-3 judgment still depends on
the live PO gate (triage-signals line 17), which is correct — but the skill spec (SC-2, §7 EDIT-3) only names
the three-lane pre-check and does not echo C-3 by name, so an agent author could mis-label a disguised lane-C
item LANE-A. That is caught downstream (architect IP-2 + PO C-3) but should be named at the author layer too →
condition C4.

---

### VERDICT: **APPROVE-WITH-CONDITIONS**

The design is the right shape: a PLAN-ONLY decentralized DETECT source that reduces a weak self-reviewer to a
reporter of machine facts and routes everything through the independent, already-live architect→PO→implement
gate. S1 (plan-only) + S2 (no self-approve/implement) adequately neuter the agent-grades-own-work risk for a
gated v1. The §2 triggers are machine-anchored (T2 is the softest; pilot must watch it). Host-load is genuinely
zero-new-infra and clears `project_host_memory_panic`. The §8 shadow pilot (news-scout + dev-team post-cycle,
14d, explicit promote/kill numeric criteria) IS a sufficient proven-red gate before fleet-wide — it measures
signal rate, lane distribution, would-approve rate, and false-positive rate, with a hard kill on >5/agent/week
or <30% approval. Approved as a design.

**This APPROVAL does NOT release implementation.** It stays BLOCKED for the operator's final greenlight per the
task instruction (operator is actively reviewing). Agent-father MUST NOT act on this verdict alone.

**Conditions (all must hold at implementation time, after operator greenlight):**
- **C1 — Shadow pilot is mandatory, not optional.** Phase 1 ships EDIT-1/2/3 but in shadow per §8: PO records a
  would-be verdict in each IMP doc and does NOT dispatch to agent-father/dev-team for the full 14 days. Fleet-
  wide rollout is a SEPARATE post-pilot promote decision gated on the §8 promote criteria. No skipping straight
  to fleet-wide.
- **C2 — T2 is the watch item.** T2 (capability-gap self-annotation) is the one non-fully-machine trigger.
  During the pilot, every T2 proposal must be inspected for over-reporting; if T2 produces >50% of a flow's
  false-positives, T2 is tightened or dropped before promote.
- **C3 — Daily-cap collision check.** SC-0 throttles to ≤1 IMP per agent per VN-day by globbing
  `IMP-<YYYYMMDD>-<agent-id>-*`. Verify the ID convention (`IMP-<date>-<agent-id>-<T>-<slug>`, §4) makes that
  glob exact and that two different triggers on the same agent/day collide to ONE proposal deterministically
  (highest-severity wins, or first-fired) — define the tie-break in EDIT-3, do not leave it implicit.
- **C4 — Name the live FIVE-field gate, including C-3.** EDIT-3 (SC-2) and the brief's §3/§4 reference only
  "the 4 fields" / the three-lane pre-check. The LIVE PO gate (triage-signals.md line 17) enforces FIVE,
  including the Lane-C-in-disguise (C-3) check. Update the brief's §3/§4/§9 wording and the self-critique skill's
  lane pre-check to name C-3 explicitly, so author-layer labeling matches the gate it feeds. (Doc-accuracy fix;
  does not change the runtime gate, which already enforces five.)
- **C5 — Commit batching is load-bearing, verify it.** SC-5 batches the IMP doc + DASHBOARD row into the
  notebook-write commit (one commit, two-to-three explicit paths, mutex-guarded). Implementation QA must confirm
  no path falls back to `-A`/`.` and that a self-critique fault cannot leave a half-staged index
  (`feedback_concurrent_commit_race`, `feedback_subagent_force_add_secret_leak`).

Empty-critique auto-reject doctrine satisfied: all five fields above are filled with substantive answers, none "N/A".

---

## Designer Notes (Architect Record)

The three flow edits are the minimal set to bring agent self-critique into the fleet. The
bulk of the work (proposal routing, PO gate, architect review, agent-father implement) is
already live from the SELF-IMPROVE-GATE sprint. This brief is only an additional input
into a system that already knows how to handle it.

The self-critique skill is deliberately conservative: its trigger taxonomy excludes the
most obvious source of noise (subjective quality judgments) by name, and the daily cap
prevents a misbehaving agent from generating proposal storms. The shadow pilot is the
structural proof that the signal is worth the overhead before the fleet commits.

The key architectural insight is that the agent does not need to be a good self-reviewer —
it only needs to be a reliable reporter of machine-observable facts (T1 error codes, T3
confidence scores, T4 notebook diff). The quality judgment remains with agents-architect
and PO, who are independent of the author. The agent's job is narrow: observe, report,
stop.
