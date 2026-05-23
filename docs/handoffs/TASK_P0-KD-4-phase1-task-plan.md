---
task_id: "P0-KD-4"
pilot: "kinh-dich"
phase: "0"
title: "Phase 1 task plan for kinh-dich (architect)"
estimate: "2.5h"
owner: "architect"
status: "READY"
date: "2026-05-24"
---

# TASK P0-KD-4 — Phase 1 Task Plan (kinh-dich TS)

## Summary

Architect generates the atomic Phase 1 task plan for the kinh-dich TypeScript service, mirroring the stock-price Go Phase 1 pattern. Phase 1 delivers: sandbox runner, first 3-5 primitives extracted, module stub, dashboard stub, and sandbox-green baseline. The R-FENCE gate is baked into the first G4 task (Phase 2), but the Phase 1 plan calls out the fence-boundary discovery that Phase 1 should complete.

**Key difference from Go pilot:** kinh-dich is TypeScript/Bun (no CGO risk). The R-FENCE gate (ESLint boundaries on actual `.js` import style) is the TS equivalent of Go's R-CGO (no sandbox build under CGO_ENABLED=0 risk). Phase 1 scope is the same: scaffold + first primitives, with fence discovered but not enforced until Phase 2 G4.

## Acceptance Criteria

### AC-1: Phase 1 scope document created
- [ ] Create `docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-1-task-plan-ts.md`
- [ ] Mirror structure from stock-price `phase-1-task-plan-go.md` (format + sections)
- [ ] Section 1: "Phase 1 Overview" — clarify TS/Bun nature, no language rewrite needed, hexagram-domain-pure, sandbox green baseline goal
- [ ] Section 2: "Phase 1 Scope vs Prior Pilots" — table showing TS vs prior Go pilots (what's new: none; what's same: sandbox/primitive/module/dashboard scaffold)

### AC-2: Pre-revert tags identified (Phase 1 scope)
- [ ] Document that Phase 1 only scaffolds new directories (no deletion, no CI activation yet)
- [ ] List Phase 2 pre-revert tags (table: tag name, phase, who creates, purpose)
  - `kinh-dich-pre-ci` — Phase 2 before eslint activation (G4 fence freeze)
  - `kinh-dich-pre-delete` — Phase 2 before `git mv` of superseded domain logic (G5a)
  - `kinh-dich-pre-inject` — Phase 2 before bug-injection (G10)
- [ ] Note: PM must reference tags in Phase 2 handoff specs

### AC-3: Task ledger created (7-9 tasks)
- [ ] Create table with columns: ID, Title, Owner, Goals advanced, Blocks, Blocked by, Est, AC count
- [ ] Define tasks mirroring stock-price pattern:
  - **P1-A:** `src/sandbox/` runner (Bun) — accepts tier/module/scenario flags, zero creds
  - **P1-B1:** First primitive extracted (e.g., `hexagram-resolver`) + test + 3 scenarios + **R-FENCE discovery gate** (see AC-4)
  - **P1-B2:** Second primitive (e.g., `hao-encoder`) + test + 3 scenarios
  - **P1-B3:** Third primitive (e.g., `ngu-hanh-classifier`) + test + 3 scenarios
  - **P1-C:** Module stub (e.g., `reading_composer`) — port + composition function (imports primitives via MarkovPort)
  - **P1-D:** Dashboard stub — 3 panels, NOT-RUN state
  - **P1-E:** Edit-rerun handler + env audit (zero DB creds in sandbox)
  - **P1-F (optional):** Flex/catchup (e.g., `reading-scorer` optional 4th primitive)
  - **P1-G:** Phase 1 close-gate (QA) — sandbox all-green, dashboard ≥90%, G12 streak confirmed
- [ ] Estimate totals: ~10-12 dev-hours, single agent, WIP=1

### AC-4: R-FENCE gate discovery in P1-B1 (Phase 1 discovery, Phase 2 enforcement)
- [ ] **P1-B1 AC note (new to kinh-dich):** during first primitive extraction, dev-kinh-dich discovers exact import style in the service:
  - Does the service use `.js`-suffixed relative imports? (e.g., `import type { ReadingRequest } from '../../application/dtos.js'`)
  - Record findings in P1-B1 handoff: "Import style confirmed: [example imports found]"
  - This **discovery** is Phase 1; the actual **AC-4b deliberate-violation proof** is Phase 2 (separate G4 task)
- [ ] Call out in the plan: "Phase 2 G4 task will use P1-B1 discovery to calibrate the deliberate-violation proof (import style confirmed in Phase 1)"

### AC-5: Per-task acceptance criteria (sample 2-3 tasks detailed)
- [ ] **P1-A AC example:** Sandbox accepts three flags; zero creds; `bun build` under sandbox build succeeds (no infrastructure imports)
- [ ] **P1-B1 AC example:** First primitive extracted with ≥5 test cases (golden/edge/failure); all scenarios pass; `bun run sandbox --tier=primitive --module=kinh-dich --scenario=all` exits 0
- [ ] **P1-C AC example:** Module stub imports primitives + MarkovPort; zero infrastructure imports in module; ≥1 multi-primitive scenario (full reading story)
- [ ] Remaining tasks: inherit similar pattern (test + scenario-driven + no infra leakage)

### AC-6: Phase 1 close-gate criteria (P1-G task)
- [ ] Document the P1-G close-gate: sandbox all-green, dashboard ≥90% cards rendered, G12 streak rule confirmed
- [ ] Note: this gate is QA-verified before Phase 2 tasks (dev-kinh-dich) proceed

### AC-7: Total effort + WIP
- [ ] Confirm: ~10-12 dev-hours estimated (per task detailed breakdown)
- [ ] Confirm: WIP=1 sequential (no parallel tasks within Phase 1 per charter)
- [ ] Duration estimate: 2-3 sprints

## Implementation Guidance

1. **Reference template:** `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md` (Go pilot; adapt runtime/language/port)
2. **Brownfield output:** Use brownfield inventory (P0-KD-1 deliverable) to confirm exact primitive names + module name
3. **R-FENCE note:** Unlike stock-price R-CGO (whole-build constraint), R-FENCE is proof-of-catch gate (Phase 2). Phase 1 discovers the import style; Phase 2 proves the fence catches it
4. **Forbidden:** do NOT include Phase 2 or Phase 3 tasks in this plan; Phase 1 only

## Constraints

- **L84 explicit-file staging:** handoff file only (markdown)
- **No source changes:** planning document only
- **No git push:** local-only commit
- **Frozen at creation:** once Phase 1 plan lands, no mid-pilot task reordering without architect + PM + PO consensus

## Hard Gates

- [ ] **PLAN COMPLETE:** all 7-9 Phase 1 tasks defined with estimate + AC count
- [ ] **EFFORT REASONABLE:** ~10-12 dev-hours total, 2-3 sprints
- [ ] **R-FENCE GATE NOTED:** P1-B1 discovery + Phase 2 G4 enforcement flow clear

## RETURN Block

**Signal to emit:** docs/signals/pm-p0-kd4-phase1-task-plan-complete-<UTC>.json
- Status: DONE | BLOCKED
- File: phase-1-task-plan-ts.md path
- Task count: <int> (P1-A through P1-G/F)
- Total AC count: <int>
- Estimated effort: "~10-12 dev-hours, 2-3 sprints"
- R-FENCE gate discovery callout: INCLUDED
- Next task: PM waits for brownfield inventory (P0-KD-1) to confirm primitive names before dispatching Phase 1

**Expected timeline:** 2026-05-24 (same-day delivery, architect; may wait for P0-KD-1 brownfield to finalize primitive names)
