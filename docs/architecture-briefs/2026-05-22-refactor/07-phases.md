# Multi-Phase Plan — Maturity Progression

**Parent:** `../2026-05-22-deep-module-ddd-with-dashboards.md`
**Date:** 2026-05-22  **Author:** Architect

---

## Phase Dependency Overview

```
Phase 0 (Baseline Audit)
    │
    ▼
Phase 1 (Pilot — kinh-dich full L4)
    │
    ├─── Phase 2 Track A: Extract all primitives to L2
    ├─── Phase 3 Track B: Rebuild modules at L2          (starts after Phase 2 ≥50%)
    └─── Phase 4 Track C: Rewire apps at L2              (starts after Phase 3 ≥50%)
              │
              ▼
         Phase 5 (Coverage push → L3 across all tiers)
              │
              ▼
         Phase 6 (Excellence → L4 automation + lint enforcement)
```

Tracks A/B/C partially parallelize once Phase 1 validates the primitive extraction and sandbox patterns.

---

## Phase 0 — Baseline Audit (Lock the Starting Point)

**Goal:** Measure current L-level for every metric. Lock the inventory. No code changes.

**Entry criteria:** This brief is approved by PO.

**Exit criteria:**
- Every module has a severity flag (GREEN/YELLOW/RED) — already complete (see `01-current-state.md`).
- Every metric in `03-metrics-primitive.md`, `04-metrics-module.md`, `05-metrics-microservice.md`, `06-metrics-cross-cutting.md` has a current baseline score (L0/L1).
- All 10 open bugs (X-1 baseline) confirmed and assigned to phases.
- All 7 tech debt items (X-2 baseline) confirmed with owners.
- `docs/data/project-stats.json` snapshot taken as test baseline (must not decrease).

**Deliverables:**
- Baseline L-level table (all 24 metrics with current score)
- Confirmation that test count has not decreased from baseline
- Phase 0 anomaly clean-up: resolve DEBT-001 (WARN-1..5 auto-fixable)

**Estimated duration:** 1 sprint (~2 days agent time, mostly reading + measuring)

**Dependencies:** None — this is the start.

**Risk callout:** Measuring L-levels requires reading 84 domain service files + all tool handler imports. Risk: measurement itself takes longer than expected. Mitigation: focus on L0 vs L1 distinction only; full L2+ scoring happens during each extraction phase.

---

## Phase 1 — Pilot (kinh-dich from L0 to L4)

**Goal:** Take the `kinh-dich` bounded context — one primitive, one module, one microservice — all the way to L4 to validate the full pipeline before scaling.

**Why kinh-dich:** It is the only GREEN module (1 export), has a clean domain subfolder (`domain/services/kinhDich/` with 8 files), an existing clean microservice (`apps/kinh-dich-service` with 11 files), and zero cross-module dependencies.

**Entry criteria:** Phase 0 complete; baseline L-levels locked.

**Exit criteria:**
- `packages/primitives/kinh-dich-hexagram-resolver/` extracted and at L4 (all 7 P-metrics)
- `packages/modules/kinh-dich/` rebuilt at L4 (all 7 M-metrics)
- `apps/kinh-dich-service/` rewired at L4 (all 6 S-metrics)
- sandbox-kit (`packages/primitives/sandbox-kit/`) validated and stable
- `apps/mcp-server/dashboard/kinhdich.html` renders and PO approves
- All existing kinh-dich tests still pass (no regression)

**Deliverables:**
- 7 primitive packages in `packages/primitives/kinh-dich-*/`
- `packages/modules/kinh-dich/` with contract.md + scenarios/
- `packages/primitives/sandbox-kit/` (narrator + renderer)
- `apps/mcp-server/dashboard/kinhdich.html`
- `apps/mcp-server/dashboard/index.html` (master, kinh-dich card only at this stage)
- Decision gate report for PO (Section 7 of original brief)

**Estimated duration:** 2-3 sprints

**Dependencies:** Phase 0 complete.

**Risk callouts:**
- sandbox-kit design may need iteration before it's stable enough to scale. Do not parallelize Tracks A/B/C until PO + Architect approve the pilot dashboard.
- `apps/kinh-dich-service` uses a different port/setup than mcp-server. Ensure sandbox-kit works for both service types.
- DEBT-003: `backtesting` duplicate registrar — discovered during Phase 1 CONTRACT write; resolve before Phase 3 backtesting work.

---

## Phase 2 — Track A: Extract All Primitives (to L2)

**Goal:** Extract all ~48 primitive candidates from `domain/services/` into `packages/primitives/`, achieving L2 on all 7 P-metrics.

**Entry criteria:** Phase 1 complete; sandbox-kit stable; pilot dashboard approved.

**Exit criteria:**
- All ~48 primitives in `packages/primitives/<name>/` folders
- Each at P-1 L2 (1 operation), P-2 L2 (100% port-driven), P-5 L2 (shape-compliant)
- Each has contract.md (P-6 L2) and ≥1 scenario JSON (P-4 L1+)
- Domain services megabarrel (`domain/services/index.ts`) reduced to 0 non-primitive files
- All existing tests still pass (test count does not decrease)

**Extraction order (priority):**
1. kinhDich subfolder (7 files) — already structurally primitive-shaped
2. financial-reports subfolder (10 files) — already structurally primitive-shaped
3. macro subfolder (9 files) — already structurally primitive-shaped
4. Alert pipeline (alertCooldown, alertDedup, alertGrouper, alertMuteChecker, alertGenerator, alertPolicyChecker)
5. News/NLP (cascadeEngine, sentimentClassifier, newsNormalizer, vnRelevanceFilter, chainSynthesizer)
6. Portfolio math (portfolioPnlCalculator, portfolioRiskCalculator, rebalancingCalculator, performanceAttribution)
7. TA primitives (RSI, MACD, BB extracted from technicalIndicators.ts)
8. Cross-cutting (signalDetector, convictionScorer, correlationCalculator, foreignFlowAnalyzer, sectorPeers, etc.)

**Infrastructure violations to resolve during this phase:**
- Move `vpsHealthPoller.ts` and `resilientFetcher.ts` from `domain/services/` to `infrastructure/` (DEBT-005)

**Estimated duration:** 4-6 sprints

**Dependencies:** Phase 1 complete. sandbox-kit stable.

**Risk callout:** 48 extractions is a large batch. Apply 120-line split policy to each sprint: max 8 extractions per sprint to keep PRs reviewable. Extractions with type collisions (noted in domain/services/index.ts header) require Architect review before PR.

---

## Phase 3 — Track B: Rebuild Modules (to L2)

**Goal:** Create `packages/modules/<name>/` bounded-context modules by composing Phase 2 primitives via DI. Achieve L2 on all 7 M-metrics.

**Entry criteria:** Phase 2 ≥50% complete (at least the primitives for the target module are extracted).

**Module build order:**
1. `kinh-dich` — already done in Phase 1 pilot
2. `technical-analysis` — after ta-* primitives extracted
3. `financial-reports` — after bctc-* primitives extracted
4. `alerts` — after alert-* primitives extracted
5. `news-analysis` — after news-* primitives extracted
6. `portfolio` — after portfolio-* primitives extracted
7. `macro-core` + `macro-signals` — after macro-* primitives extracted (split from current `macro` barrel)
8. `briefings` — depends on news + signal primitives
9. `sector-analytics` — extract from current `sector` barrel (sectors, rotation, correlation only)
10. `market-context` — extract remaining 8 sub-contexts from `sector` barrel
11. `system-ops` — extract from current `system` barrel

**Anti-corruption translators (from original brief Phase 3):**
This is still required for RED modules with domain-type leaks. Must happen during module rebuild:
- `analysis` module: replace `AnalysisThought`+`AnalysisResult` with `SequentialAnalysisResponseDTO`
- Per module: application-layer `translator.ts` — `toDomainX()` and `fromDomainX()` functions

**Exit criteria:**
- All 11 modules in `packages/modules/<name>/` with contract.md + scenarios
- Each at M-1 L2 (cohesion), M-2 L2 (primitive composition), M-3 L2 (no cross-module imports)
- Anti-corruption translators in place for all RED modules

**Estimated duration:** 4-6 sprints (partially parallel with late Phase 2)

**Risk callout:** `sector` split into 2 modules is the highest-risk item (14 exports, 8 contexts, widest import surface in the codebase). Architect must review the split plan before dev-mcp-server starts this work.

---

## Phase 4 — Track C: Rewire Apps (to L2)

**Goal:** Rewire `apps/mcp-server/` to use modules only. Create composition root. Remove all direct domain imports from interface layer. Achieve L2 on all 6 S-metrics.

**Entry criteria:** Phase 3 ≥50% complete.

**Key tasks:**
1. Create `apps/mcp-server/src/bootstrap.ts` as the sole composition root (S-1 L2)
2. Remove all `from.*domain/services/index` imports from `interface/mcp/tools/**/*.ts` (S-5 L2)
3. Shrink all 12 module barrels (`index.ts`) to contract surface only — original brief Phase 4 (S-5 L2 prerequisite)
4. Resolve `sector` and `system` barrel splits (M-1 cohesion L2 prerequisite)
5. Fix BUG-A21, BUG-A21b, BUG-BCTC-1 (S-4 deployment health L2)

**This phase is the riskiest phase** due to TypeScript import rewriting across ~132 registered tools. Mitigation:
- Anti-corruption translators from Phase 3 mean callers are already consuming DTOs, so barrel shrink is non-breaking for callers.
- One module per sprint for RED modules (macro, sector, system, analysis).
- Test count must not decrease. Run `bun test` after every barrel change.

**Exit criteria:**
- All 6 S-metrics at L2 for `apps/mcp-server`
- `apps/kinh-dich-service`, `apps/technical-analysis`, `apps/macro-indicators` already at L2 (they have clean DDD — verify only)
- TypeScript strict mode passes for the full project
- Test baseline (`project-stats.json`) not decreased

**Estimated duration:** 4-5 sprints

**Dependencies:** Phase 3 ≥50% complete.

---

## Phase 5 — Coverage Push (to L3 across all tiers)

**Goal:** Write narrated tests (scenarios) for all primitives and modules. Push all P-4, M-4, S-3 metrics from L1/L2 to L3. All dashboards render with ≥80% coverage (no red banners).

**Entry criteria:** Phases 2, 3, 4 complete at L2.

**Tasks:**
- Write ≥3 scenario JSONs per primitive (including edge cases)
- Write ≥3 scenario JSONs per module use case
- Write E2E scenario per HTTP route in each microservice
- Run `bun run dashboard` and verify no red coverage banners
- User reviews all module dashboards and approves narrative accuracy
- `FIXTURES.md` per module (original brief Phase 2 — user review surface)

**Exit criteria:**
- All dashboards render with ≥80% coverage (no red banners)
- User has reviewed and approved dashboard narratives for at least 5 key modules
- X-4 sandbox uptime at L3

**Estimated duration:** 3-4 sprints

---

## Phase 6 — Excellence (L4 Automation)

**Goal:** Full lint enforcement, auto-generated dependency graphs, CI gates on all metrics. L4 across all tiers.

**Entry criteria:** Phase 5 complete. All metrics at L3.

**Tasks:**
1. ESLint rules: max-1-export-per-primitive (P-1 L4), import-boundary (P-2 L4, M-3 L4, S-5 L4)
2. CI staleness check for contract.md files (P-6 L4, M-6 L4)
3. Dashboard as required CI step (X-4 L4) — broken dashboard blocks PR
4. AST shape validator for barrel index.ts (P-5 L4, M-5 L4)
5. Auto-generated dependency graph from import analysis (updated on each PR)
6. system-auditor reads /health endpoints for all services (S-4 L4)
7. Bug count + debt count auto-computed from git log (X-1 L4, X-2 L4)
8. Edit-and-rerun interaction on master dashboard (S-6 L4, P-7 L4)

**Exit criteria:** All 24 metrics at L4. Zero red banners on master dashboard. CI enforces every metric.

**Estimated duration:** 3-4 sprints

---

## Time Estimate Summary

| Phase | Agent time | Calendar estimate |
|---|---|---|
| Phase 0 | 1 sprint | 1 week |
| Phase 1 | 2-3 sprints | 2-3 weeks |
| Phase 2 | 4-6 sprints | 4-6 weeks |
| Phase 3 | 4-6 sprints (partial parallel with Phase 2) | 4-6 weeks |
| Phase 4 | 4-5 sprints (partial parallel with Phase 3) | 4-5 weeks |
| Phase 5 | 3-4 sprints | 3-4 weeks |
| Phase 6 | 3-4 sprints | 3-4 weeks |
| **Total (sequential)** | **~21-29 sprints** | **~21-29 weeks** |
| **Total (parallel Tracks A/B/C)** | **~14-18 sprints** | **~14-18 weeks** |

**Recommended cadence:** 1 primitive extraction per day; 1 module rebuild per 2-3 days; 1 service rewire per week.

The original brief estimated ~108 engineer-hours for all 12 modules in Phases 0-6. That estimate holds but is now more precisely bounded by the per-metric L2 gates above.
