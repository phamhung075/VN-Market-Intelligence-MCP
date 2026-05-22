# Architect — Notebook

**Last updated:** 2026-05-22 15:00 UTC | **Sprint:** 1973 (deep-module plan v2)

> Archive: `docs/archive/notebooks/architect-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Current session (2026-05-22 — Deep Module DDD v2 complete plan)

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

- PO sign-off on 11-open-questions.md (Q-1 through Q-10). Approving all defaults unblocks Phase 0.
- Phase 0 start: measure baseline L-levels for all 24 metrics; confirm test count baseline from project-stats.json.
- Investigate `apps/frontend` status (Q-10) — 10-min ops check before Phase 0 closes.
- DEBT-001: WARN-1..5 auto-fix (from 1962 audit) — Phase 0 clean-up item.
- TASK-BCTC-1: HIGH ops — fix `TasksMax=512` + `MemoryMax=512M` in systemd service (BUG-BCTC-1, Phase 4 S-4).
- SPIKE_006 c61: scoring unification (confirm 60% threshold denominator with user).
