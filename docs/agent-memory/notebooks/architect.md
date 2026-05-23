# Architect — Notebook

**Last updated:** 2026-05-23 (fleet-factory-rollout roadmap) | **Sprint:** fleet-factory-rollout program brief

## Fleet-Factory-Rollout cycle (2026-05-23) — program roadmap brief

**Task:** Author fleet-factory-rollout brief (user goal: complete factory for all microservices, each with working dashboard). READ-ONLY brownfield survey + brief authoring only. No apps/** modified.

**Brownfield findings:**
- 11 services total; 3 excluded from factory scope (api-gateway=pure router, mcp-server=orchestrator, frontend=UI)
- 2 GREEN (TA+macro — both pilots DONE 2026-05-23)
- 5 RED (kinh-dich, stock-price, alert-engine, pdf-extractor, rag-service)
- 1 YELLOW (news-fetch — DDD exists, no primitives, no dedicated dev agent)
- Go services (stock-price, alert-engine): depguard fence proven, zero new tooling needed
- TS services (kinh-dich, news-fetch): ESLint fence rule NOT YET DESIGNED — SI-3 spike needed before G4 credible
- Python services (pdf-extractor, rag-service): Python fence tool UNDEFINED — SI-4 spike needed; defer to pilots 7+8
- news-fetch zone specialist = `developer` (generic) — SI-5 agent file creation needed

**Pilot sequence: 3=kinh-dich (TS), 4=stock-price (Go), 5=alert-engine (Go), 6=news-fetch (TS), 7=pdf-extractor (Python), 8=rag-service (Python)**

**Shared infra prework (SI-1..SI-5):**
- SI-1: fleet SSOT schema (agent-father, ~1-2h, do now)
- SI-2: fleet dashboard index (dev-kinh-dich at G6 of pilot 3)
- SI-3: TS ESLint fence design (architect spike, before pilot 3 charter)
- SI-4: Python fence tool decision (architect spike, before pilot 7)
- SI-5: dev-news-fetch agent file (agent-father, before pilot 6)

**Key risk flags:**
- SI-3 HIGH: TS fence rule is the G4 gate for 2 services (kinh-dich + news-fetch). Must be designed before pilot 3 charter locks G4 criteria.
- alert-engine G7: Telegram credentials MUST NEVER appear in sandbox environment. Hard gate.
- Python trace JSON format: Python narrator equivalent must be designed in SI-4 spike.
- WIP=2 max: no more than 2 pilot charters ACTIVE simultaneously.

**Files authored this cycle (4 files — L84):**
1. `docs/architecture-briefs/2026-05-23-fleet-factory-rollout/00-roadmap.md` (NEW)
2. `docs/architecture-briefs/2026-05-23-fleet-factory-rollout/01-service-inventory.md` (NEW)
3. `docs/architecture-briefs/2026-05-23-fleet-factory-rollout/02-phasing.md` (NEW)
4. `docs/architecture-briefs/2026-05-23-fleet-factory-rollout/03-dashboard-standard.md` (NEW)

**Next dispatch:** PO to ratify brief → author pilot 3 (kinh-dich) charter. Architect spike on SI-3 (TS fence) should be scheduled first or in parallel with PO ratification.

---

## Cycle-22 entry (2026-05-23T12:22Z) — macro-indicators Phase 2 task plan

**Task:** Author Phase 2 task plan for macro-indicators pilot (c282-cycle-22), per PO dispatch signal `po-cycle21-dispatch-architect-phase2-spec-20260523T121526Z.json`. Phase 1 gate was GO (4/4 criteria PASS, G12 EARNED-PENDING, 2026-05-23T12:15:26Z).

**Brownfield pre-read (confirms prior Phase 0 findings):**
- 4 MCP tool files read: `macroTools.ts` (668L), `carryTools.ts` (199L), `dinhGiaTools.ts` (162L)
- R-3 confirmed HIGH: `macroTools.ts` imports `fetchYahooFinancePrices`, `fetchSbvRates`, `computeCarryTradeSignal`, `computeYieldSpreadSignal` directly. `carryTools.ts` imports `computeCarryTradeSignal`, `getMacroCalendar` directly. `dinhGiaTools.ts` imports `computeYieldSpreadSignal` directly.
- Go router (`router.go`) has only `/health` + `/snapshot` (501 stub). Needs 3 new routes for P2-B1.
- Existing Go primitive: `macro_investment_clock/` only. Phase 2 adds 5 more.
- `api/openapi.yaml` documents `/health` + `/snapshot` only (needs extension for new routes).
- Anchor `1776df8e` confirmed ancestor via `git log --ancestry-path` check.

**Phase 2 plan decisions:**
- **WIP=1** (no parallel P2-A + P2-B) — R-3 unblock is highest priority; splitting focus before R-3 clears risks errors. P2-A1 follows P2-B1.
- **14 tasks** across 6 logical buckets (B, A, X, G, F, C, D, E).
- **G6/G7 treated as DONE** from Phase 1 (P1-E1/P1-E2 QA-verified GREEN) — no Phase 2 task needed. QA re-confirms at P2-G1.
- **P2-B1 scope clarified:** dev-mcp-server agent (not dev-macro-indicators) — it touches the mcp-server TS zone. Go handler stubs (handlers_carry.go, handlers_yield.go, handlers_calendar.go) are co-delivered in P2-B1 to avoid zombie stub period.
- **Pre-revert tags:** macro-pre-ci (before P2-A2), macro-pre-delete (before P2-B2), macro-pre-inject (before P2-D1) — all explicitly wired into task specs.
- **Critical path:** P2-B1 → P2-A1 → P2-A2 → P2-B2 → P2-B3 → P2-X1 → P2-X2 → P2-X3 → P2-G1 → P2-F1 → P2-C1 → P2-D1 → P2-D2 → P2-E1 → Phase 3.
- **OQ-7..OQ-10** authored for PM (scraper strategy, stub vs real impl, calendar port scope).

**Risk flags surfaced for PM:**
- P2-B1 requires both TS handler rewire AND new Go HTTP endpoints in same task — scope is larger than TA's equivalent P2-B1 (which only rewired TS, Go endpoint was already live). Dev agent must not split these across commits.
- Scraper sidecar (Option A from brownfield §9): TS scrapers stay in place providing data to Go service. P2-X3 snapshot endpoint implementation will need to call scrapers via some mechanism — PM must clarify in OQ-8.
- G6/G7 no-task assumption: if dashboard regresses during P2-X1..X3 (primitive cards added), QA must catch at P2-G1. The assumption is safe but PM should make it explicit in P2-G1 handoff.

**Files authored this cycle (L84 — 3 files):**
1. `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-2-task-plan-go.md` (NEW — 14 tasks, per-task AC, sequencing diagram, goal coverage matrix, WIP decision)
2. `docs/signals/architect-cycle22-phase2-plan-ready-20260523T122207Z.json` (NEW — PM pickup signal)
3. `docs/agent-memory/notebooks/architect.md` (this entry)

**Signal for PM:** `docs/signals/architect-cycle22-phase2-plan-ready-20260523T122207Z.json`

---

## Cycle-29 entry (2026-05-23T10:30Z) — macro-indicators Phase 0 deliverables

**Task:** Execute Phase 0 for macro-indicators factory v2 (5 deliverables per po-macro-pilot-kickoff-20260523T093857Z.json).

**Brownfield findings (D1):**
- Total LOC: 1 936 (934 core src + 1 002 scrapers)
- DDD layers: MOSTLY CLEAN — `domain/` has zero infra imports (golden rule holds)
- Critical finding: `scoreIndicator()` uses `Math.random()` — non-deterministic, must fix in P1-B1
- Critical finding: 4 of 7 MCP tools (get_macro_snapshot, get_carry_trade_signal, get_yield_spread_signal, get_macro_calendar) bypass the macro-indicators HTTP layer entirely — direct domain imports in mcp-server (G5b is more extensive than a simple HTTP swap)
- 8 scrapers: 7 live, 1 WONTFIX null-stub (investing-economic-calendar)
- No `pkg/` directory exists — Phase 0 exit gate confirmed clean

**Primitive selection (D1 §7):** 6 primitives selected:
1. macro-investment-clock (first — pure classifier, no live data)
2. macro-oil-impact-classifier (pure threshold function)
3. macro-gold-direction-classifier (same shape)
4. macro-usdvnd-direction-classifier (same shape)
5. macro-carry-trade-signal (ported from mcp-server domain)
6. macro-yield-spread-signal (ported from mcp-server domain)
Module: macro-signals only (defer macro-core to post-pilot per charter §G2 calibration)

**Bug inventory (D2):** Zero macro-specific bugs in 60-day window. Baseline falls back to system-wide 1.3 cycles. R-1 Math.random() risk documented in macro_indicators_baseline knownRiskPre_pilot.

**Agent + flow (D3/D4):** dev-macro-indicators.md updated to version 2026-05-23 (Go primary mode, G12 DoD Gate constraint, 3 new lazy_load entries). Flow main.md updated with Language Mode table + Smoke Checks + G12 DoD Gate + Security Rule + Fence Rules + Pre-revert tag protocol — verbatim TA pilot flow shape per cc7578f1 pattern.

**Phase 1 task plan (D5):** 11 atomic tasks (P1-A1..A5 + B1 + C1 + D1 + D2 + E1 + E2). First primitive = macro-investment-clock. WIP=1. Phase 1 exit gate: ≤4h to first primitive, sandbox green, dashboard render ≥90%. OQ-4 flagged: no dev-frontend in Phase 1 — dev-macro-indicators owns dashboard stub.

**Key risk flags for PM/PO:**
- R-3 (HIGH): MCP tool G5b rewire is deeper than TA's — 4 tools must shift from direct domain calls to HTTP. Phase 2 P2-B must include mcp-server rewire spec, not just `git mv` on macro-indicators src.
- R-1 (HIGH): Math.random() fix required in P1-B1 before any stable scenario JSON can be authored.
- Scraper strategy: Option A (keep TS scrapers side-car in Phase 1). Phase 2 P2-B decides whether to port or deprecate.

**Files authored this cycle (L84 — 6 files):**
1. `docs/architecture-briefs/2026-05-23-macro-indicators-factory/p0-brownfield-inventory.md` (NEW — D1)
2. `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md` (NEW — D5)
3. `.claude/agents/dev-macro-indicators.md` (MODIFIED — D3 Go pilot update)
4. `.claude/flows/dev-macro-indicators/main.md` (MODIFIED — D4 G12 DoD Gate + Language Mode + Security)
5. `docs/data/bug-inventory.json` (MODIFIED — D2 macro baseline entry)
6. `docs/agent-memory/notebooks/architect.md` (this entry)

**Completion signal:** `docs/signals/architect-macro-phase0-done-<UTC>.json` (to be written after commit)

---

## Cycle-22 amendment entry (2026-05-23T08:30Z) — AC-4c freeze-anchor path-B decision

**Task:** Resolve AC-4c collision: freeze-anchor `9561fee9` vs cycle-20 commit `9d364329` on `.golangci.yml`.

**Decision: Path B — amend AC-4c, accept `9d364329` as new freeze anchor.**

**Evidence reviewed:**
- `git show 9d364329 -- apps/technical-analysis/.golangci.yml`: pure v2→v1 format key rename. All three fence rules (fence-a, fence-b, fence-c) + Main allow-list are semantically identical. No rule added, removed, weakened, or renamed.
- `git log --oneline apps/technical-analysis/.golangci.yml`: exactly two commits — `9561fee9` then `9d364329`. No other drift.
- `.github/workflows/ci.yml` line 70: confirms `golangci-lint-action@v6.1.1` (frozen, out of scope).

**PO's premise verified correct:** `golangci-lint-action@v6.1.1` installs v1.64.8 which exits code 3 on v2-format config. The v2→v1 conversion was a real tooling-compatibility necessity, not arbitrary config drift.

**Path A ruled out:** Reverting `9d364329` to v2 format and finding an alternate fix requires touching `ci.yml` (pin action to v2-compatible version). `ci.yml` is frozen by the same out-of-scope clause as `.golangci.yml`. Path A has no viable exit without a double scope violation.

**Amendment authored:**
- `docs/architecture-briefs/2026-05-22-refactor/g4-acceptance-revision.md` — §Amendment 1 appended (collision evidence + tooling-compat justification + revised AC-4c text + TASK_P2-A4 re-edit requirements).
- `docs/signals/architect-g4-ac4c-amendment-20260523T083000Z.json` — architect signal to PO.
- `docs/agent-memory/notebooks/architect.md` — this entry.

**PO must re-edit TASK_P2-A4.md:** YES — replace freeze anchor `9561fee9` with `9d364329` in AC-4c prose + §Evidence to Record verdict guide + retract the "Known collision" warning note.

**No dev-ta re-dispatch needed:** `9d364329` is already on `main`. dev-ta cycle-22 fix work (lint findings → exit 0) proceeds under AC-1/2/3 unchanged.

**Files authored this amendment (L84 — 3 files):**
1. `docs/architecture-briefs/2026-05-22-refactor/g4-acceptance-revision.md` (appended §Amendment 1)
2. `docs/signals/architect-g4-ac4c-amendment-20260523T083000Z.json` (PO pick-up signal)
3. `docs/agent-memory/notebooks/architect.md` (this entry)

---

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
