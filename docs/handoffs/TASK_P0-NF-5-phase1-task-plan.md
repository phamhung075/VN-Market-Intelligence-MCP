---
task_id: "P0-NF-5"
pilot: "news-fetch"
phase: "0"
title: "Phase-1 task plan authoring — explicit phase expansion (charter §Deltas pt3)"
estimate: "2h"
owner: "architect"
status: "READY"
date: "2026-05-24"
---

# TASK P0-NF-5 — Phase 1 Task Plan (Explicit Expansion)

## Summary

Architect authors the Phase 1 task plan that decomposes the news-fetch refactor into developer-executable tasks. Because owner = generic `developer` (no specialist embedding context — charter §Deltas point 3), this plan MUST be MORE explicit than specialist-owned pilots: spell out exact primitive files, scenario JSON structure, module wiring, composition-root target, and the G12 streak tasks.

## Acceptance Criteria

### AC-1: Task plan doc
- [ ] Write `docs/architecture-briefs/2026-05-22-refactor/scale/news-fetch-phase-1-task-plan.md`
- [ ] Derive tasks from the P0-NF-1 brownfield inventory (primitive set + news-ingest module + composition root) — NOT from the stale "flat src/" charter text

### AC-2: Phase 1 task buckets (explicit)
- [ ] Bucket A/B — primitive extraction: one task per primitive (3–5 primitives), each with ≥3 scenario JSON files (golden + edge + failure) per G1
- [ ] Module task: `news-ingest` composes primitives via ports/DI, ≥1 multi-primitive scenario per G2
- [ ] Composition-root task: wire module + adapters, HTTP interface contract (OpenAPI or equivalent), port 5008, per G3
- [ ] Dashboard task: three-level dashboard (primitive/module/service) renders from JSON traces, file:// zero-network, per G6/G7/G8
- [ ] G5 rewire/delete tasks: HTTP-rewire mcp-server callers to 5008, move old code to _deprecated/, zero TODO.*migrat

### AC-3: G12 streak tasks identified
- [ ] Explicitly name the 3 streak tasks (first-primitive + module-stub + dashboard-stub pattern) that prove the G12 DoD gate over 3 consecutive completions
- [ ] Streak rule effective only after P0-NF-3 flow commit (record dependency)

### AC-4: WIP + sequencing
- [ ] WIP=1 default for Phase 1 (per pilot-status `phase1.wip_limit`)
- [ ] Specify ordering: primitives → module → composition-root → dashboard → rewire/delete; AI-fix (G10) + regression (G11) after dashboard is honest-green

### AC-5: SSOT update
- [ ] Update `docs/data/pilot-status-news-fetch.json`: `phase0.deliverables.phase_1_task_plan` → DONE; populate `phase1.skeleton_in` + `phase1.task_plan` paths

## Boundary
- Planning doc + SSOT only. No service code (Phase 0 = `no_code_in_service_pkg_yet: true`).
- `apps/news-fetch/` scope only.

## Blocked by
P0-NF-1, P0-NF-2 (brownfield + bug-inventory inputs).

## References
- Brownfield (P0-NF-1 output): `docs/architecture-briefs/2026-05-22-refactor/scale/news-fetch-brownfield.md`
- Phase template: `docs/architecture-briefs/2026-05-22-refactor/07-phases.md`
- Canonical G1–G12: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md`

---

## [Architect] Brownfield Findings

- **Zone:** `apps/news-fetch/`
- **Status:** DONE 2026-05-24

**AC-1 (task plan doc):**
`docs/architecture-briefs/2026-05-22-refactor/scale/news-fetch-phase-1-task-plan.md` written. Derived from P0-NF-1 brownfield inventory primitive set (NOT from stale "flat src/" charter text). All file paths explicit. All scenario JSON bodies explicit (developer carries no embedded context).

**AC-2 (task buckets):**
- Sandbox harness: P1-A (1 task, `src/sandbox/runner.ts`)
- Primitive extractions: P1-B1–B4 (4 tasks, one per primitive)
  - P1-B1: `published-at-parser` (extracts + dedups `normalizeRfcDate`)
  - P1-B2: `headline-normalizer` (new)
  - P1-B3: `source-dedup-key` (new)
  - P1-B4: `article-relevance-filter` (new)
  - Each has ≥3 scenario JSONs (golden + edge + failure) with exact JSON bodies in plan
- Module task: P1-C (`news_ingest` module stub, ports + composition + multi-primitive scenario, fallback-chain moved from handlers.ts)
- Dashboard task: P1-D (3-level dashboard: primitives/module/microservice, NOT-RUN state, file:// zero-network)
- Edit-rerun + env audit: P1-E
- G5 rewire/delete + composition-root + OpenAPI: P1-G5 (split composition root from index.ts, HTTP-rewire analysis.ts, deprecate legacy reuters.ts, add api/openapi.yaml)
- QA close-gate: P1-QA

**AC-3 (G12 streak tasks):**
3 streak tasks explicitly named in plan §"G12 Streak Tasks (3-Task Streak Definition)":
1. P1-B1 (first primitive: published-at-parser) — streak #1
2. P1-C (module stub: news_ingest) — streak #2
3. P1-D (dashboard stub) — streak #3
Streak rule effective only after P0-NF-3 flow commit. Dependency recorded in plan §Hard Constraints.

**AC-4 (WIP + sequencing):**
WIP=1 declared in plan frontmatter and §Hard Constraints. Sequencing: P1-A → P1-B1 → P1-B2 → P1-B3 → P1-B4 → P1-C → P1-D → P1-E → P1-G5 → P1-QA. G10/G11 (bug injection + regression proof) deferred to Phase 2 per goals roadmap.

**AC-5 (SSOT update):**
`docs/data/pilot-status-news-fetch.json`:
- `phase0.deliverables.phase_1_task_plan` → DONE
- `phase1.skeleton_in` → `docs/architecture-briefs/2026-05-22-refactor/07-phases.md §Phase 1`
- `phase1.task_plan` → `docs/architecture-briefs/2026-05-22-refactor/scale/news-fetch-phase-1-task-plan.md`

**Totals:** 10 tasks, 68 ACs
