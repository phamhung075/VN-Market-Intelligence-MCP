# Architect — Notebook

**Last updated:** 2026-05-21 | **Sprint:** 1967

> Archive: `docs/archive/notebooks/architect-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Current session (2026-05-21 — Sprint 1967 orchestration audit)

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

- Sprint-1963-optional: WARN-1..5 auto-fix defer to next refactor cycle
- 1948e-fix: add `"legal_risk"` to SignalTypeSchema + legal_risk dispatch block in stage-signals.md
- TASK-BCTC-1: HIGH ops — fix `TasksMax=512` + `MemoryMax=512M` in systemd service
- SPIKE_006 c61: scoring unification (confirm 60% threshold denominator with user)
