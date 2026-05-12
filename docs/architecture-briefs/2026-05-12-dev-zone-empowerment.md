# Architecture Brief — Dev-Zone Empowerment

<!-- size-justification: 118L — 5 independent tracks + ordering table; no per-track split needed below threshold -->

**Date:** 2026-05-12
**Author:** agents-architect
**Status:** DRAFT → agent-father to implement
**Slug:** dev-zone-empowerment
**Signal:** `docs/signals/agents-architect-2026-05-12-dev-zone-empowerment.json`

---

## Problem

9 dev-* specialists are correctly wired in the routing chain but remain queue-starved.
Two structural gaps amplify the starvation: (1) zone-detection logic is duplicated across
`architect/main.md` L42-55 and `execute-tier.md` L17-37 — any zone-map change requires two
edits, risking divergence; (2) specialists are purely reactive — they produce no zone-health
signal that feeds PO's planning loop, so backlogs stay empty until a user-reported bug arrives.

---

## Track A — Zone-Detect Skill (SSOT extraction)

**Problem:** Zone map (9 entries) duplicated in architect flow + execute-tier. A new service
or rename requires two coordinated edits; drift is silent until a mismatch causes mis-routing.

**SSOT change:**
- CREATE `.claude/skills/zone-detect/SKILL.md` (~35L): canonical zone→specialist table +
  2-step inference logic (explicit path → grep files list → Tier-3 fallback).
- EDIT `.claude/flows/architect/main.md` L42-55: replace inline table with `skill: zone-detect`.
- EDIT `.claude/flows/dev-team/execute-tier.md` L17-37: replace inline table with `skill: zone-detect`.

**Touchpoints:** architect, dev-team. No dispatch table change — skill is load-on-demand.

**Risk:** Skill load failure on cold context triggers fail-loud halt. Mitigation: mark
`fail_loud: true` in both consumers.

**Acceptance test:** Rename any one zone path in `SKILL.md` only → re-run a routing trace
through both flows → both route to the updated specialist without editing their own files.

**Sequencing:** Unlocks Track B and C (both consumers then reference one table).

---

## Track B — Zone-Missing Auto-Chore (cure tier-3 starvation)

**Problem:** `zone_missing_tier3` signals are dropped by execute-tier but PO only sees them
if they happen to audit signals. No automatic sprint task is created, so the gap persists.

**SSOT change:**
- EDIT `.claude/flows/po/triage-tnb.md` (+8L): add drain step — for each pending
  `zone_missing_tier3` signal, emit a CHORE task pre-tagged `zone: <suggestedZone>` from
  signal payload, assign to dev-team next cycle, mark signal processed.
- No new files required — reuses existing signal bus + triage flow.

**Touchpoints:** po (triage-tnb.md). execute-tier already emits the signal.

**Risk:** PO creates duplicate CHORE if same taskId fires twice. Mitigation: de-dup on
`taskId` field before inserting — same guard already used in drain-signals.md.

**Acceptance test:** Manually drop a `zone_missing_tier3` signal with `suggestedZone: apps/macro-indicators/` →
run PO triage cycle → TASKS.md gains a CHORE tagged `zone: apps/macro-indicators/`.

**Sequencing:** Depends on Track A (signal payload includes zone from SSOT table). Can ship
independently if Track A is delayed — payload already populated by execute-tier.

---

## Track C — Proactive Zone-Scan Cron (specialist knowledge becomes generative)

**Problem:** Specialists never initiate work. Stale tests, deprecated imports, or doc drift
inside a service zone are invisible until a user bug report arrives.

**SSOT change:**
- EDIT each of 9 `.claude/agents/dev-<service>.md`: add weekly cron entry pointing to new
  sub-flow `zone-scan.md`. (+2L each = 18L total across 9 files)
- CREATE `.claude/flows/developer/zone-scan.md` (~40L): shared sub-flow — grep stale
  imports, count test files vs source files, diff docs/architecture/microservice/<service>/
  vs actual module structure. Emit `docs/signals/zone-scan-<service>-<ts>.json` typed
  `zone_health_report` with `{ zone, findings[], severity }`. Route `to: po`.
- EDIT `.claude/commands/crons/cron-dev-team.md` (+1L): note weekly zone-scan cadence.

**Touchpoints:** 9 dev-* agents, 1 new shared flow, 1 cron file.

**Risk:** 9 concurrent weekly scans may produce signal flood. Mitigation: stagger by
service (offset by day-of-week hash), PO batches findings into one sprint review per week.

**Acceptance test:** Trigger zone-scan on dev-macro-indicators manually → signal file
appears in `docs/signals/` within cycle → PO's next triage cycle surfaces it in
`pendingSignals[]`.

**Sequencing:** Independent. Can run in parallel with A and B.

---

## Track D — Service-Doc Owner Mandate

**Problem:** `docs/architecture/microservice/<service>/` is currently written by both
architect (proposals) and developer (implementation notes) — no clear owner. Architect
becomes a bottleneck for doc updates that dev-* specialists should self-serve.

**SSOT change:**
- EDIT `docs/references/agent-roster.md` (+9L): add column `doc_owner` — dev-<service>
  is sole committer of `docs/architecture/microservice/<service>/`; architect writes to
  `docs/architecture-briefs/` only.
- EDIT `.claude/skills/dispatch/SKILL.md` (+3L): note doc-ownership rule in specialist row.

**Touchpoints:** agent-roster, dispatch SSOT. No flow edits required — ownership is
declarative, enforced by convention + PR review.

**Risk:** Architect brief may still propose doc edits. Mitigation: brief format mandates
agent-father routes doc-write subtasks to the relevant dev-* agent, not architect.

**Acceptance test:** After mandate is in roster, next architect brief involving
`apps/macro-indicators/` produces a signal instructing dev-macro-indicators to commit the
doc delta, not architect or developer.

**Sequencing:** Independent. Lowest implementation cost — 2 file edits, no new files.

---

## Track E — Notebook Zone-Health Observation (specialist eyes → planning loop)

**Problem:** Dev-* specialists accumulate zone-level observations (coverage drift, fixture
bloat, schema lag) during task execution but discard them at cycle end. PO has no channel
to receive this intelligence without a user prompt.

**SSOT change:**
- EDIT `.claude/flows/developer/microservice-main.md` Step "end-of-cycle notebook write"
  (+5L): mandate one-line "Zone health:" entry per cycle (e.g. `Zone health: test coverage
  78% (-4%), 3 unused fixtures in stock-price module`).
- EDIT `.claude/flows/po/channel-audit.md` (+4L): add notebook scan step — read last
  entry of each active dev-* notebook, surface any "Zone health:" lines into PO's
  `pendingObservations[]` block before sprint planning.

**Touchpoints:** microservice-main.md (1 edit), channel-audit.md (1 edit).

**Risk:** Notebook scan adds ~200 tokens per dev-* agent (9 × ~22 tokens) to PO cycle.
Within token-economy budget — PO already scans notebooks in channel-audit.

**Acceptance test:** dev-stock-price completes a task → notebook contains `Zone health:`
line → PO's next channel-audit cycle shows that line in its context before emitting sprint.

**Sequencing:** Depends on Track C cadence being established first so PO is already reading
zone signals. Can ship independently.

---

## Recommended Ordering for Agent-Father

| Step | Track | Rationale |
|---|---|---|
| 1 | A — Zone-Detect Skill | SSOT foundation; unblocks B routing accuracy |
| 2 | D — Doc Owner Mandate | 2-file edit, zero risk, immediate clarity |
| 3 | B — Zone-Missing Auto-Chore | Closes tier-3 starvation loop; needs A signal table |
| 4 | E — Notebook Zone-Health | Low-risk flow edits; PO channel-audit already open |
| 5 | C — Proactive Zone-Scan | Highest effort (9 agents + new flow); deliver last |

Tracks D and E can be batched in one agent-father sprint (no file conflicts).
Tracks A → B must be sequential. Track C is independent but benefits from D (doc owner
mandate means zone-scan findings have a clear commit target).
