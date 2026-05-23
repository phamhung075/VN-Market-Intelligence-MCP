# Architect — Notebook

**Last updated:** 2026-05-23 07:28 UTC | **Sprint:** Phase 2 — G4 AC revision (cycle-22)

## Cycle-22 entry (2026-05-23T07:28Z) — G4 acceptance revision

**Task:** Re-plan G4 acceptance criteria to remove whole-CI dependency while preserving architecture-fence intent.

**Root cause of revision:** AC-4 in `po-cycle20-dispatch-dev-ta-fix-go-lint-20260523T064034Z.json` required `CI go-lint job exits 0 on rerun`. The `bun test` job is structurally red until G5 deletion chain (P2-B2..B4) completes — so the whole workflow run conclusion is `failure` regardless of `go-lint` exit code. The per-job JSON extraction path (`gh run view --json jobs --jq select(.name=="go-lint")`) is technically possible but fragile (3 independent failure surfaces: job name stability, API shape, agent correctly reading job-level vs run-level conclusion).

**Architectural decision:** Offline deliberate-violation proof is logically equivalent to CI-red proof for grading purposes. The charter's original G4 text says "proven by 1 deliberate violation in PR" — but the proof is the linter catching the violation, not the CI run URL. Local run achieves the same logical proof with zero external dependencies.

**Revised AC structure (7 criteria vs 5 original):**
- AC-1/2/3: unchanged (local golangci-lint + go test + sandbox)
- AC-4a: verify go-lint job wiring in `.github/workflows/ci.yml` by file read (deterministic, no API)
- AC-4b: run deliberate Fence-A violation locally, confirm depguard blocks it, revert, confirm exit 0 — paste linter output to `TASK_P2-A4.md §Evidence to Record`
- AC-4c: confirm `.golangci.yml` frozen post-P2-A1 via `git log --oneline apps/technical-analysis/.golangci.yml`
- AC-5: completion signal with new field `g4_ci_dependency_dropped: true`

**Migration recommendation to PO:** SUPERSEDE (not amend). Clean supersede avoids stale AC-4 text confusing cycle-21 grading agent. PO re-dispatches dev-ta for fix work (AC-1/2/3 unchanged) and re-dispatches QA for P2-A4 with revised AC-4a/4b/4c.

**G5 chain impact:** None — gate rule unchanged. G4=YES unblocks P2-B2 deletion dispatch as before. Fence proven earlier because offline proof has no CI billing dependency.

**Files authored this cycle (L84 — 3 files max):**
1. `docs/architecture-briefs/2026-05-22-refactor/g4-acceptance-revision.md` (revised spec)
2. `docs/signals/architect-g4-revision-20260523T072817Z.json` (PO pick-up signal)
3. `docs/agent-memory/notebooks/architect.md` (this entry)

**Signal for PO:** `docs/signals/architect-g4-revision-20260523T072817Z.json`

---

**Last updated:** 2026-05-23 22:18 UTC | **Sprint:** Phase 2 kickoff (technical-analysis pilot)

> Archive: `docs/archive/notebooks/architect-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Current session (2026-05-23 — Phase 2 task plan expansion)

Phase 2 skeleton (PO) expanded into 20 atomic per-task specs across 6 buckets (P2-A through P2-F). Key decisions:

**Fence linter (G4/P2-A):** `golangci-lint + depguard` selected. Config at `apps/technical-analysis/.golangci.yml`. Three rules: Fence-A (primitive must not import module/application/interface), Fence-B (module must not import application/interface), Fence-C (infrastructure only importable from cmd/server/main.go). CI job `go-lint` added as parallel job in `.github/workflows/ci.yml`. Deliberate-violation proof: P2-A4 commits a Fence-A violation, confirms CI red, reverts, confirms CI green.

**P0-1 bug-inventory (G10/P2-D):** `docs/data/bug-inventory.json` EXISTS (created 2026-05-22). 2 TA-specific bugs. `baselineCycleCount = 1.5` (TA-specific measured average — replaces charter's system-wide 4-6 estimate). P2-D0 is a 10-min verification only. No system-auditor preflight needed.

**Brownfield scan (G5/P2-B):** 3 TS files confirmed as targets in mcp-server: `technicalIndicators.ts` (domain service, delete target), `technicalIndicatorTools.ts` (MCP tool handler, rewire to HTTP port 5003), `1302-technical-indicators.test.ts` (quarantine). The HTTP client infrastructure is ALREADY in `clients.ts` (port 5003 entry). P2-B1 rewire is low-risk. Rollback strategy: tag `p2-b-pre-delete` before deletion commits.

**Flow rule (G12/P2-F):** Flow-rule brief authored at `docs/architecture-briefs/2026-05-22-refactor/p2-f-flow-rule-brief.md`. Targets the existing "Pilot Hard Rule" section in `dev-technical-analysis/main.md` — surgical upgrade to a numbered step block with exact sandbox commands. agent-father implements P2-F2. G12 streak: 1/3 complete (QA-P1-closure), tasks #2+#3 come from P2-D3 + P2-E3.

**Sequencing:** P2-F2 (agent-father) is critical path — must land before P2-D2 + P2-E2 dispatch so streak tasks accrue under the rule. P2-A1 + P2-B0 can run in parallel with P2-F2 (independent). P2-E gates on P2-F2 + P2-D3 pattern stabilization.

**Signal to PM:** `docs/signals/architect-20260523T221805Z.json` — first dev tasks: P2-F2 (agent-father) + P2-A1 (dev-technical-analysis) in parallel.

## Previous session (2026-05-22 — TASK_P0-2 pilot-status.json seed)

`docs/data/pilot-status.json` created as SSOT for PO pilot tracker. Valid JSON, 12 goals (G1–G12), all status=TBD. Track A = G1–G5 (Trust Foundation), Track B = G6–G9 (Dashboard Trust), Track C = G10–G12 (AI-Fixability Proof). decisionMatrix seeded with speed/trust/scale (all TBD) plus outcome labels (scale/rescope/stop-MVR). Status=ACTIVE, verdict=TBD. sprintKickoff/sprintDeadline left as "TBD" for PO to fill at kickoff. charterVersion=1.0, charterRef points to pilot-charter.md.

## Previous session (2026-05-22 — technical-analysis pilot charter v1.0)

Pilot charter created at `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md`. Binding contract for the `technical-analysis` microservice refactor pilot. 12 goals across 3 tracks: Track A (trust foundation: G1–G5), Track B (dashboard trust layer: G6–G9), Track C (AI-fixability proof: G10–G12). Decision matrix: 3-YES → scale to macro-indicators, 2-YES → re-scope, 0-1 YES → MVR fallback. Hard deadline: 6 sprints from kickoff. Security clause: sandbox process env audit required at G7 — zero DB creds / zero API keys. `docs/data/bug-inventory.json` flagged as non-existent; creating it is a Phase 0 deliverable. `docs/data/pilot-status.json` nominated as runtime tracking SSOT for PO pilot tracking step. PO flow (`flows/po/main.md`) updated with lazy-load-guarded "Pilot Tracking" section (22 lines): reads pilot-status.json, blocks sprint planning if 4+ goals NO past sprint 3, triggers review prompt when all 12 YES. Master brief index (v2.3) updated: scope column added (PILOT/Scale/Both), pilot-charter.md entry at top, PILOT GATE note added to Phase Summary. Brownfield scan confirmed: `apps/technical-analysis/` already has 9 source files with DDD structure (domain/app/infra/interface layers present but composition-root.ts does not yet exist); `apps/mcp-server/src/domain/services/technicalIndicators.ts` is the canonical G5 deletion target.

## Previous session (2026-05-22 — QA gate checklists v1.0)

QA gate checklists created for all 25 metrics (7P + 7M + 6S + 5X). 100 metric gates + 9 phase exit gates + 4 standing-rule checks. 10 NEEDS SHARPENING flags across P-4 L2 (scenario type field), P-4 L3 (sandbox-kit CLI), P-7 L2/L3 (dashboard render CLI + browser interaction), M-1 L0 (domain label in contract.md), M-2 L1 (business logic definition), M-2 L3 (bun test mock syntax), M-2 L4 (custom inline-logic lint rule), M-3 L3 (standalone module build), M-4 L2/L3 (scenario type field + primitiveTrace), M-5 L0 (naming convention), M-7 L2/L3 (same as P-7), S-1 L3 (port satisfaction test), S-2 L3 (module boundary mock), S-3 L2 (adapterType field), S-3 L3 (3-level zoom browser), S-4 L4 (15-min health polling), S-5 L3 (tsconfig path restriction), S-6 L2/L3/L4 (dashboard CLI + browser), X-1 L1 (bug inventory JSON), X-2 L2 (debt retirement condition field), X-4 L1 (bun run dashboard command), X-4 L3 (coverage badge data-attribute), Phase 5 exit (PO approval artifact), Phase 6 exit (branch protection via gh API), SR-1 (task type tagging), SR-3 (stale grep cross-platform). Master brief bumped to v2.2. `docs/data/metric-ladder.json` nominated as SSOT for artifact levels. 10 flags total requiring metric-definition refinement before those specific QA items can be mechanically verified. Files: qa-gates/ (10 files). Pointer: `docs/architecture-briefs/2026-05-22-refactor/qa-gates/00-index.md`.

## Previous session (2026-05-22 — Deep Module DDD v2.1 — constraints + mitigations amendment)

Pre-PO review surfaced 7 constraints + 4 mitigations. Brief amended in-place across 6 files (no rewrites, surgical additions only). New metric X-5 (Architectural Fence Enforcement) added — total now 25 auditable metrics. P-2 gains trivial-primitive exemption for pure functions (3-question test). `07-phases.md` gains Standing Rules section (70/30 capacity, module-freeze, phase-exit gates), Phase 1→2 go/no-go gate with 4 measurable criteria, and Phase 1 dogfood-first ordering. `10-validation-rituals.md` gains Scenario-Refresh Ritual (monthly per module, quarterly system-auditor scan). `11-open-questions.md` extended with accepted-by-default mitigations M-1–M-4. Master index bumped to v2.1 with new §9 constraints/mitigations table and updated metric counts. `08-sandbox-dashboards.md` gains build-sequence constraint note. All 7 constraints addressed, all 4 mitigations baked in.

## Previous session (2026-05-22 — Deep Module DDD v2 complete plan)

Three-tier refactor plan completed. Master brief at `docs/architecture-briefs/2026-05-22-deep-module-ddd-with-dashboards.md` + 11 sub-documents in `2026-05-22-refactor/`. Key numbers: 24 auditable metrics (7P+7M+6S+4X), 48 proposed primitives, 11 proposed modules, 7 phases, 14-18 sprints total (parallel tracks). 10 bugs mapped with structural kill conditions. 10 open questions for PO — all have recommended defaults; approving defaults unblocks Phase 0+1 immediately. Critical DDD violation: interface layer imports from domain/services/index.ts in 10+ tool handler files — root cause of entire refactor. sandbox-kit placed in `packages/primitives/sandbox-kit/` (eats own dogfood). `sector` split into sector-analytics + market-context recommended. `analysis` module reclassified as application use case.

## Previous session (2026-05-21 — Sprint 1967 orchestration audit)

Brief commissioned by BA/PO. Surface coverage: 7 REQs, evidence-only on surfaces overlapping 1968 (L-1/L-2/L-3). No fix authority in 1967 for those surfaces — defer to 1968.

## Previous session (2026-05-21 — Token/tool-call economy brief)

Brief: `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md`. 9 waste types (W-1..W-9), 9 levers (L-1..L-9) in 3 tiers. Phase 1 (L-1..L-5) = zero-risk, agent-father only. Phase 2 (L-4/L-7) = moderate. Phase 3 (L-6/L-8/L-9) = PM→dev-team.

## Previous session (2026-05-21 — 1962 task_id format audit)

16-site read-only audit. WARN: 0 FAILs, 5 WARNs. Two-tier defense structurally intact.
5 WARNs (auto-fixable): WARN-1 C5 sprint-signoff no explicit release; WARN-2..5 abbreviated task_claim() syntax. WARN-1 highest risk if sprint >3600s.
Brief: `docs/architecture-briefs/2026-05-21-task-id-format-audit.md`

## Previous session (2026-05-20 — Phase 3 task-lock dev-team wiring brief)

Brief: `docs/architecture-briefs/2026-05-21-task-lock-phase3-devteam.md`. Model 2 self-claim chosen. Developer = PRIMARY claimer (2b pre-code). QA inherits lock, releases at git push. 12 tool-package edits only (dev-* inherit developer.md). 9 flow edits with insertion points. Test plan: 7 scenarios T1-T7.

## Patterns noticed

- Reuters fallback split is confirmed working precedent for Bun test split pattern
- hsx.vn Envoy route-block: `x-envoy-upstream-service-time: 2ms` + empty body = edge rejection (no backend contact)
- Backtesting: `Option C equity curve` = direct copy lines 302-307 in backtestEngine.ts

## Carry-over (next session)

- **Pilot Charter is ACTIVE.** Next session = Phase 0 kickoff for technical-analysis pilot: (1) create `docs/data/bug-inventory.json` with TA bug baseline, (2) create `docs/data/pilot-status.json` with all 12 goals TBD, (3) sandbox-kit prereq check (must be at L3+ before pilot work starts).
- G12 requires authoring `flows/dev-technical-analysis/main.md` — if that flow file does not exist, Architect must create it (within pilot scope). Check at pilot Phase 0.
- QA gates: 10 NEEDS SHARPENING flags still open from 1973. PM creates "metric sharpening" sprint task before Phase 2+ scale work.
- `docs/data/metric-ladder.json` must be created in Phase 0 (does not yet exist). SSOT for level transitions.
- PO sign-off on 11-open-questions.md (Q-1 through Q-10 + mitigations M-1–M-4). Unblocks Phase 0.
- DEBT-001: WARN-1..5 auto-fix (from 1962 audit) — Phase 0 clean-up item.
- TASK-BCTC-1: HIGH ops — fix `TasksMax=512` + `MemoryMax=512M` in systemd service (BUG-BCTC-1, Phase 4 S-4).
- SPIKE_006 c61: scoring unification (confirm 60% threshold denominator with user).
- Phase 6 scope addition: implement X-5 Fence-A/B/C ESLint rules.
