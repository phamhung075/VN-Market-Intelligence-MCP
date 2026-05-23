---
title: "Macro-indicators pilot terminal close (12/12 scale) + 2026-05-22-refactor program-completion adjudication"
date: "2026-05-23"
author: "po (c282-cycle-58)"
status: "DECIDED"
pilot: "macro-indicators"
verdict_pilot: "scale (3 YES)"
verdict_program: "(b) — broader rollout phases remain"
ssot: "docs/data/pilot-status-macro-indicators.json"
closure_signal: "docs/signals/po-macro-terminal-close-12of12-20260523T214247Z.json"
anchor: "1776df8e (HELD, exit 0)"
---

# Part 1 — Macro-indicators Pilot Terminal Close (12/12)

## 1.1 Terminal gate result

All 12 G-goals are terminal **YES** at HEAD. The `macro-indicators` factory v2 pilot is **CLOSED**, status `ACTIVE → DONE`, decisionMatrix `verdict = scale`.

| Goal | Track | Status | Terminal evidence |
|---|---|---|---|
| G1 Primitives ship with scenarios | A | YES | P2-X1 — 6 primitives, 18 scenarios, Fence-A clean, sandbox 20/20 |
| G2 Module composes via ports | A | YES | P2-X2 + P2-G1 — macro-signals wires all 6, Fence-B clean |
| G3 Clean composition root | A | YES | P2-X3 — handlers → BuildMacroSignals, Fence-C clean |
| G4 Architecture fence enforced | A | YES | P2-A1 + P2-A2 — .golangci.yml + CI job + deliberate-violation proof |
| G5 Old TS deprecated + HTTP rewire | A | YES | P2-B1/B2/B3 — TS→_deprecated, 4 MCP tools route HTTP:5004 |
| **G6** Three-level dashboard renders | B | **YES (PO terminal flip)** | **P1-E1 GREEN + P2-C1-rerun PO Playwright (6/6 primitive cards)** |
| **G7** Edit-JSON-and-rerun + zero creds | B | **YES (PO terminal flip)** | **P1-E2 GREEN + env audit 0 matches (incl FRED_API_KEY) + P2-G1 re-verify** |
| G8 Red/green honest | B | YES | P2-F1 — Test A corrupted RED + Test B golden GREEN |
| G9 Dashboard trust contract | B | YES | P2-C1-rerun — PO Playwright Path B PASS (zero console/page/request errors) |
| G10 AI fixes bug ≤2 cycles | C | YES | P2-D1/D2 — fixed in cycle 1 of 2, byte-identical restore |
| G11 Regression alarm works | C | YES | P2-E1/E2 — 2 trials across different primitives, coupling proven |
| **G12** Dev-flow dashboard-green-before-done | C | **YES (PO terminal flip)** | **P1-B1/C1/E1 streak; held pilot-wide; EARNED-PENDING → YES per §4.5** |

The three PO terminal flips (G6, G7, G12) were performed in ONE atomic commit per Charter §4.5 exception to single-goal-atomic-flip. G6/G7 had "No Phase 2 task needed" per the phase-2 task plan; their Phase 1 GREEN verdicts plus Phase 2 re-verification are accepted as terminal evidence — no new dev/qa cycles were dispatched.

## 1.2 Decision matrix — mechanical derivation

Derivation rule source: `07-phases.md` §Phase 3 step 2 + Q6 authorship rule (`2026-05-22-refactor/closure-checklist-audit.md`). Values are derived from goal evidence, not invented; no PO discretion beyond the rubric.

| Lane | Rule | Inputs | Verdict |
|---|---|---|---|
| **Speed** | G10 ≤2 cycles vs baseline AND G11 alarm fired | G10=YES (1 cycle of 2 vs baseline 1.5) + G11=YES (2 trials, alarm fired, forced fix) | **YES** |
| **Trust** | G9 confirmed (Path A or B) AND G8 honest | G9=YES (Path B PO Playwright PASS, equal weight) + G8=YES (no false greens) | **YES** |
| **Scale** | All 12 YES AND tracks A+B delivered within 6 sprints | 12/12 YES + tracks A+B+C delivered + sprintCount=1 ≤ 6 | **YES** |

**3 YES → verdict = `scale`.** Per Charter §Decision Matrix outcome rule, this is the gate-pass to scale to a next microservice.

## 1.3 Constraints held

L84 explicit-file staging; no `--force`/`--no-verify`/`--no-gpg-sign`/`git push`; all on `main`; anchor `1776df8e` HELD (exit 0) pre-commit; `apps/macro-indicators/**` + `apps/technical-analysis/**` source untouched; parent `pilot-status.json` (frozen TA record) untouched.

---

# Part 2 — `2026-05-22-refactor` Program-Completion Adjudication

## 2.1 The question

The standing session goal is **"complete `docs/architecture-briefs/2026-05-22-refactor`"** — the PARENT refactor program. With both pilots now closed 12/12 (TA verdict=scale 2026-05-23T09:19:10Z; macro verdict=scale 2026-05-23T21:42:47Z), is that program (a) COMPLETE, or (b) does broader module/microservice rollout remain?

## 2.2 Verdict: **(b) — broader rollout phases remain. The program is NOT complete.**

The two pilots prove the **factory pattern** (the 12-G-goal three-tier contract + dashboard trust layer + AI-fixability) works, and works twice without modification. That is exactly what the pilots were chartered to prove. But the factory pattern is a *method*; the `2026-05-22-refactor` program is the *application of that method across the whole codebase*, and that scale-out is overwhelmingly unstarted.

### Evidence

1. **The program's own phase plan (`2026-05-22-refactor/07-phases.md`) defines 7 phases (Phase 0–6).** The two pilots correspond only to "Phase 1 (Pilot)" of that plan, applied twice (kinh-dich was the originally-named pilot; TA became the actual first pilot; macro the second). The scale-out phases are:
   - **Phase 2 — Track A: extract ALL ~48 primitives** from `domain/services/` into `packages/primitives/`. UNSTARTED.
   - **Phase 3 — Track B: rebuild ALL 11 modules** in `packages/modules/`. UNSTARTED.
   - **Phase 4 — Track C: rewire `apps/mcp-server`** (remove all domain imports from interface layer, create `bootstrap.ts` composition root, shrink 12 module barrels across ~132 tools). UNSTARTED.
   - **Phase 5 — Coverage push to L3** (≥3 scenarios per primitive/module across the whole codebase, all dashboards ≥80% coverage). UNSTARTED.
   - **Phase 6 — Excellence / L4 automation** (ESLint import-boundary rules, CI dashboard gate, AST shape validator, auto dependency graph). UNSTARTED.

2. **Filesystem confirms the scale-out has not begun:**
   - `packages/modules/` **does not exist** → Phase 3 (Track B) not started.
   - `packages/primitives/` contains only `technical-analysis` (the TA pilot's primitives) → Phase 2 (Track A, ~48 primitives across all bounded contexts) not started. `macro-indicators` primitives live in `apps/macro-indicators/pkg/primitive/` (in-app Go layout), i.e. the pilot built them inside the service, not as shared workspace packages.
   - `apps/mcp-server` megabarrel rewire (Phase 4) — not touched by either pilot (both pilots are scoped to their own `apps/<service>/` per their anti-scope-creep clauses).

3. **The master brief's "CLOSED" status is pilot-scoped, not program-scoped.** `2026-05-22-deep-module-ddd-with-dashboards.md` status line reads *"CLOSED 2026-05-23 — Phase 2 verdict=scale, 12/12 G-goals YES"*. That "Phase 2" is the **TA pilot's internal phase numbering** (pilot Phase 0/1/2/3), and "verdict=scale" is the **decision-matrix gate result** — which by definition means *"worth doing for the next microservice"*, i.e. a GO signal to continue, not a statement that the rollout is done. The scale verdict opens the door to the scale-out; it does not perform it.

4. **`11-open-questions.md` enumerates scale-out decisions that were never executed** (they were sized for the full program, not the pilots): Q-1 create `packages/primitives/` + `packages/modules/` workspace scopes (Phase 2 blocker — modules dir still absent), Q-2 split `sector` into 2 modules (Phase 3), Q-6 `analysis` module → app use case (Phase 3), Q-4 backtesting duplicate registrar (Phase 1 backtesting), Q-10 `frontend` status. These are open program decisions, not pilot decisions.

### Why this is not pedantry

The user's pain (verbatim in the TA charter) is *"AI agents cannot fix bugs complete… I need something I can trust at low level then build to high level… like lego."* The pilots prove the lego method works on two services. The user's actual problem — the megabarrel `apps/mcp-server` with ~132 tools and 11 RED/YELLOW modules — is still unrefactored. Declaring the program complete now would leave the original pain unaddressed across ~9 of the ~11 bounded contexts.

## 2.3 What the two pilots DID complete (closing artifacts owed = none for the pilots)

- TA pilot: CLOSED, 12/12, verdict=scale, decisionMatrix populated, brief master entry CLOSED. No outstanding artifacts.
- Macro pilot: CLOSED this cycle, 12/12, verdict=scale, decisionMatrix populated, closure signal written. No outstanding artifacts.
- Factory pattern: VALIDATED TWICE. The "prove the pattern scales" objective of the macro charter (§Why This Pilot Exists, point 1) is met.

## 2.4 Remaining program phases (the rollout)

| Phase | Track | Scope | Status |
|---|---|---|---|
| Phase 2 | A | Extract ~48 primitives to `packages/primitives/` (all bounded contexts) | UNSTARTED |
| Phase 3 | B | Rebuild 11 modules in `packages/modules/` via DI | UNSTARTED (`packages/modules/` absent) |
| Phase 4 | C | Rewire `apps/mcp-server` — `bootstrap.ts` root, drop domain imports, shrink 12 barrels (~132 tools) | UNSTARTED |
| Phase 5 | — | Coverage push to L3 (scenarios + dashboards ≥80%) | UNSTARTED |
| Phase 6 | — | L4 automation (lint boundaries, CI dashboard gate, AST validator, dep graph) | UNSTARTED |

## 2.5 Recommended next dispatch

**Dispatch `architect`** to author a program-scale-out brief that converts the now-twice-validated factory pattern into a concrete rollout plan for `2026-05-22-refactor` Phases 2–6. The architect brief should:

1. Pick up `11-open-questions.md` Q-1 (create `packages/primitives/*` + `packages/modules/*` workspace scopes) and the recommended defaults for Q-2/Q-4/Q-6/Q-10 — most can be approved-by-default to unblock Phase 2/3.
2. Decide whether the next increment is a **third single-service pilot** (per charter §Decision Matrix outcome — recommended targets `news-fetch` or `stock-price`, architect to pick by bounded-context cleanness) **OR** a direct **batched Phase 2 Track-A primitive extraction** now that the pattern is twice-proven and the per-extraction risk is low.
3. Honor the program's 120-line split policy and "max 2 primitives/sprint in the first 3 Phase-2 sprints" validation gate (Q-8 ramp).

PO recommendation: a third pilot is no longer the highest-leverage step — two scale verdicts is sufficient validation. The architect should scope **Phase 2 Track A batched extraction** (with the 3-sprint ramp gate) as the primary path, keeping a single-service pilot only as a fallback if Track A reveals new pattern gaps. Final pilot-vs-batch call is the architect's to recommend; PO will gate.

This is a NEW program-scope decision and exceeds the scope of the macro pilot charter (anti-scope-creep clause). It is therefore correctly deferred to a fresh architect brief + PO gate, not auto-started here.

---

**Decision owner:** PO. **No user approval required** (full autonomy; user is non-technical and trusts PO to drive product). **Recorded:** c282-cycle-58, 2026-05-23T21:42:47Z.
