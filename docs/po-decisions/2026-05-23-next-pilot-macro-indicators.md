---
title: "Next-Pilot Decision — macro-indicators selected as Factory v2 target"
date: "2026-05-23"
author: "po"
status: "FINAL"
cycle: "c282 cycle-29"
parent_pilot_close: "docs/data/pilot-status.json (status=DONE, verdict=scale, closedAt 2026-05-23T09:19:10Z)"
parent_pilot_closure_signal: "docs/signals/po-brief-closed-20260523T091910Z.json"
parent_charter: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (v1.0 CLOSED)"
new_charter: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md (v2.0 ACTIVE)"
new_pilot_status: "docs/data/pilot-status-macro-indicators.json"
authority: "po autonomous (per feedback_po_autonomy.md — PO self-initiates next pilot when scale verdict confirmed)"
---

# Next-Pilot Decision — macro-indicators (Factory v2)

**Decision is FINAL. Multi-option debate is CLOSED.**

---

## Verdict

**Next pilot = `macro-indicators`. Factory v2 kicks off 2026-05-23 cycle-29. Hard deadline 2026-07-04 (6 sprints).**

---

## Why this pilot (and not another)

The technical-analysis pilot closed 2026-05-23T09:19:10Z with verdict `scale` (12/12 G-goals YES, decisionMatrix Speed=YES Trust=YES Scale=YES). The parent charter §Decision Matrix outcome explicitly names the next target:

> "3 YES → scale to next microservice. Recommended target: `macro-indicators` (clean domain, macro-core primitive candidates already identified in `02-target-state.md`)."

I evaluated three alternatives before confirming macro-indicators:

| Candidate | Pro | Con | Verdict |
|---|---|---|---|
| **macro-indicators** | Already named by parent charter. Clean DDD (TS, ~830 LOC, 8 source files + 8 scrapers + tests). Primitive candidates pre-identified in `02-target-state.md` (macro-investment-clock, macro-fed-liquidity-spread, macro-carry-trade, macro-yield-spread, macro-ism-regime, macro-pyramid-tier — 6 candidates listed). Language already locked Go by user verdict 2026-05-22 §Q2 (no pivot risk). | TS-to-Go rewrite required (mirrors TA pilot — but L1 lesson means we expect it Day 0, not as mid-flight surprise). | **SELECTED** |
| news-fetch | Cleaner Go service (already in Go per `apps/news-fetch/`). Would avoid TS→Go rewrite cost. | Not named by parent charter as scale target. Parent charter §Anti-Scope-Creep clause forbade scope changes during TA pilot — extending that discipline forward, deviating from the parent charter's stated scale target without strong cause weakens the factory pattern's predictability. | NOT SELECTED |
| stock-price | Also Go-native. Could prove factory on a fundamentally different domain (real-time price data vs derived signals). | Same issue as news-fetch: not parent charter's named scale target. Plus stock-price is in heavy production use (alert pipeline depends on it) — pilot disruption risk is higher. | NOT SELECTED |
| Retrospective cycle instead | Could pause and write a multi-pilot rollout plan first | Premature optimization. Factory pattern is proven ONCE (TA). Proving it a SECOND time on macro tests whether the pattern scales without modification. Then we can write a multi-pilot rollout plan with two data points instead of one. | NOT SELECTED |

**macro-indicators wins on three grounds:**

1. **Charter compliance** — parent charter §Decision Matrix outcome explicitly names it.
2. **Language pre-locked** — user verdict 2026-05-22 §Q2 already generalizes Go to macro-indicators. Zero pivot risk (L1 lesson neutralized at Day 0).
3. **Highest-leverage second proof point** — macro is structurally similar to TA at TA's start (clean DDD in TS with primitives embedded in `domain/services.ts`). Putting macro through the SAME 12-G-goal factory tests whether the factory pattern works without per-service modification. If it does, the pattern is ready for batch rollout to the remaining 8 microservices.

---

## What I did this cycle (cycle-29)

Atomic kickoff commit produces these artefacts:

1. **`docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md`** — Charter v2.0 ACTIVE
   - Inherits 12-G-goal factory pattern verbatim from parent
   - 7 TA lessons baked into v1 (no Amendment-1 retrofit expected)
   - Language locked Go Day 0 (cite parent decision)
   - Hard deadline 2026-07-04 (kickoff + 6 sprints)
   - All §Constraints binding from Day 0 (L84, no force/no push, anchor discipline, §4.5 matrix-authorship)

2. **`docs/architecture-briefs/2026-05-23-macro-indicators-factory/01-lessons-from-ta-pilot.md`** — explicit lessons doc
   - L1: Language locked Day 0 (no pivot possible)
   - L2: G4 offline depguard primary evidence (not whole-CI)
   - L3: Status enum strict ACTIVE/DONE/FAILED
   - L4: decisionMatrix PO-only authorship + atomic-with-12/12-terminal
   - L5: Pre-revert tags Day 0 (`macro-pre-delete`, `macro-pre-ci`, `macro-pre-inject`)
   - L6: G9 PO Playwright short-circuit Day 0 default
   - L7: SSOT + L84 + anchor discipline binding Day 0

3. **`docs/architecture-briefs/2026-05-23-macro-indicators-factory/07-phases.md`** — PO-authored phase skeleton
   - Phase 0: Setup (architect + system-auditor + agent-father, 1 sprint)
   - Phase 1: Pilot Go scaffold + first primitive (dev-macro-indicators, 1-2 sprints)
   - Phase 2: Remaining primitives + module + closure chain (2-3 sprints)
   - Phase 3: PO atomic close (1 cycle)

4. **`docs/data/pilot-status-macro-indicators.json`** — NEW pilot SSOT
   - Parent `pilot-status.json` UNTOUCHED (FROZEN historical record per §Anti-Scope-Creep clause carry-over)
   - All 12 goals = `TBD`, decisionMatrix all `TBD`, status `ACTIVE`
   - Phase 0 deliverables list with 6 PENDING entries (5 dispatched, 1 = this file DONE)

5. **`docs/po-decisions/2026-05-23-next-pilot-macro-indicators.md`** — this file

6. **`docs/signals/po-macro-pilot-kickoff-20260523T093857Z.json`** — dispatch signal to architect for Phase 0 deliverables

7. **`docs/agent-memory/notebooks/po.md`** — overwritten to cycle-29 state

---

## Constraints held this cycle

- L84 explicit-file staging (single atomic commit; all new files explicitly staged)
- No `--force`, no `--no-verify`, no push
- All work on `main` (no branches)
- Parent `pilot-status.json` UNTOUCHED (FROZEN; parent brief CLOSED)
- Parent brief master doc UNTOUCHED (status line already correctly reads `CLOSED 2026-05-23`)
- New pilot status `pilot-status-macro-indicators.json` created with all 12 goals = TBD + decisionMatrix all TBD (per Charter §4.5 carry-over rule — matrix populates ONLY at brief close)
- PO autonomous per `feedback_po_autonomy.md` — no user approval needed for next-pilot kickoff when parent verdict=scale + parent charter explicitly names target
- All 7 lessons from parent pilot carried over verbatim to charter v1 (no Amendment-1-style retrofit on macro)

---

## First dispatch

**Dispatched:** architect (via `docs/signals/po-macro-pilot-kickoff-20260523T093857Z.json`)

**Phase 0 deliverables architect owns (or delegates):**

1. `docs/architecture-briefs/2026-05-23-macro-indicators-factory/p0-brownfield-inventory.md` — brownfield scan of `apps/macro-indicators/` (architect or delegates to system-auditor)
2. `docs/data/bug-inventory.json` macro-specific entry (architect delegates to system-auditor)
3. `.claude/agents/dev-macro-indicators.md` + `.claude/flows/dev-macro-indicators/main.md` (architect delegates to agent-father — clone dev-technical-analysis with G12 DoD Gate baked in Day 0 per L6)
4. `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md` (architect-owned)

**Phase 0 exit gate:** all 4 deliverables landed + `pilot-status-macro-indicators.json` Phase 0 fields populated + no code yet in `apps/macro-indicators/pkg/`.

---

## What this decision does NOT do

- **Does not amend parent charter.** Parent pilot-charter.md (TA v1.0) is CLOSED and frozen. The optional charter §Decision Matrix amendment recording verdict=scale + next-pilot=macro-indicators (per parent phase-2-closure-checklist §3 item 5) is listed as a post-close follow-up and remains optional — this PO-decision doc + the new charter v2 explicit reference satisfy the same audit need.
- **Does not modify parent `docs/data/pilot-status.json`.** That file is FROZEN historical record. The new pilot uses a separate SSOT file `pilot-status-macro-indicators.json`.
- **Does not push to remote.** Local commit only per L7 constraint.
- **Does not assume specific primitive count.** Charter §G1 lists 9 candidates; architect picks 5-7 at Phase 0 brownfield scan.
- **Does not specify whether to port TS scrapers to Go.** That decision belongs to Phase 1 task plan (architect, with brownfield scan input). Risk register in 07-phases.md flags it explicitly.

---

## Next observation targets

After Phase 0 closes (architect + system-auditor + agent-father deliver), PO cycle-30 will:

1. Verify all 5 Phase 0 deliverables landed via signal trail
2. Update `pilot-status-macro-indicators.json.phase0.deliverables.*` from PENDING → DONE with commit refs
3. Flip `phase0.status` OPEN → CLOSED
4. Flip `phase` 0 → 1
5. Verify Phase 0 exit gate (all 5 met) → enable Phase 1 dispatch
6. Dispatch dev-macro-indicators for Phase 1 first task (Go scaffold + first primitive `macro-investment-clock`)

If Phase 0 stalls past 2 cycles, PO R-11 trigger fires → re-dispatch with status-check.

---

## Brief CLOSED — no further work on parent

The parent technical-analysis pilot is CLOSED. All anchors held throughout:
- Architecture brief closure-checklist anchor `62edbf3d`
- `.golangci.yml` freeze anchor `9d364329`
- Tag `p2-b-pre-delete` at `b9d0a82b` (no retag, no force)

These remain valid historical reference points but are not actively maintained.

**Macro-indicators factory v2 is the active pilot from this cycle forward.**
