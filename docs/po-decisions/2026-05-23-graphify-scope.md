---
title: "Graphify Scope Decision — Phase 2 Pilot Cycle"
date: "2026-05-23"
author: "po"
status: "DECIDED"
pilot: "technical-analysis"
phase: "2"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
---

# Graphify Scope Decision — Phase 2 Pilot

## Context

Earlier PO run on `/graphify docs` (full rebuild) detected **1556 changed files** with an estimated **~30 min wall-clock** for the full re-index. Phase 2 has 19 dev tasks queued across 6 buckets with a 2026-07-03 deadline (~41 days). Running full graphify every PO cycle or every task closure would burn ≥2.5 hours of agent time per day if hit on every dispatch.

## Three Options

1. **Full run every PO cycle.** Cost: ~30 min × N cycles. Rejected — fatal to deadline burn rate.
2. **Scoped to `docs/architecture-briefs/2026-05-22-refactor/` only.** Cost: ~30 sec per cycle. Risk: misses cross-references from outside the brief folder (e.g. `docs/handoffs/TASK_P2-*.md`, `docs/po-decisions/`, `pilot-status.json`).
3. **Defer full graphify until phase close; rely on incremental `/graphify docs --update --no-viz` per task per existing `flows/developer/main.md` step 3.** Cost: amortized over each dev task commit. Risk: incremental graph could fall out of sync if a task fails to run the step — but developer flow already enforces it.

## Decision

**Option 3 — Defer full graphify until Phase 2 closure.**

- Existing `.claude/flows/developer/main.md` § "Doc update + graphify" already mandates `/graphify docs --update --no-viz` (incremental) on every dev task that touches docs. This is the right granularity for Phase 2.
- PO will trigger a **single full `/graphify docs --no-viz` run at Phase 2 closure** (after P2-F3 verdict is YES, before pilot-review meeting summary).
- No flow change required. No PO interrupt of developer cron.

## Rationale

1. **Deadline burn rate.** 41 days for 19 tasks ≈ ~0.5 tasks/day. Full graphify per cycle would consume ~10% of all available agent-time. Unacceptable.
2. **Incremental already works.** Per developer flow step 94-105, only changed doc nodes re-index. The graph stays usable for Lesson Advisor / semble-style lookups for the 41-day window.
3. **Phase close is the natural full-rebuild gate.** When the pilot transitions PHASE-2 → DONE, the decision matrix needs a coherent doc graph for the pilot review summary. Full graphify at that point gives the cleanest evidence trail.
4. **No risk to G12 dashboard-green DoD.** Graphify status is decoupled from the sandbox dashboard. Dev tasks cannot be blocked by graph staleness.

## Trigger for Full Run

PO triggers full `/graphify docs --no-viz` (no `--update` flag) when:
- `pilot-status.json.phase2.status = "DONE"`, OR
- `pilot-status.json.status = "DONE"` (entire pilot done), OR
- Architect requests a full rebuild for cross-bucket dependency analysis (rare).

## Action Items

- [x] Decision documented (this file).
- [ ] PO mentions in next notebook entry that full graphify is queued for Phase 2 closure.
- [ ] No change to `flows/developer/main.md` — current incremental rule is correct.
- [ ] No change to `flows/po/main.md` — full-rebuild trigger lives in PO's mental model + this doc.

## Reversal Conditions

If 3+ Phase 2 dev tasks land WITHOUT incremental graphify being run (developer flow violation), PO escalates to architect: either tighten flow enforcement (mandatory `/graphify docs --update --no-viz` in dev commit hook) or fall back to weekly scoped runs on `docs/architecture-briefs/2026-05-22-refactor/` only.
