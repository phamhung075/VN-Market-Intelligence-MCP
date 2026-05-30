# PO Notebook

## Cycle 2026-05-30 — GREENLIT Sprint DYN-WF-FOUNDATION (Phase 0 + Phase 2)

Phase-prioritized the dynamic-workflow architecture brief (`docs/architecture-briefs/2026-05-29-dynamic-workflow-architecture.md` + agents-architect Review 2026-05-30 CONDITIONAL ADOPT). Constraints were pre-settled (do NOT relitigate): phase cut 0+2 / defer 3/4/5, ordering 0→2→1, deterministic-router-only.

**DECISION: greenlight Phase 0 + Phase 2 ONLY** as one self-contained, reversible, never-worse-than-today sprint. Phase 1 (adaptive cadence) registered as `DWF-PHASE1` BLOCKED on Phase-2-cutover QA sign-off (Phase 1 without Phase 2 is strictly worse — raises market-hours fire rate → more collision windows). 3/4/5 deferred.

- **Phase 0** = instrument + SSOT, zero behavior change: prune dead slots · `routing-policy.json` read-only (consumed by nothing) · NEW `is_trading_day` tool (OQ-5: does NOT exist; `get_macro_calendar` = macro-events only) · per-tick `pressure-state.json` instrument-only (single JSON, NOT new SQLite table).
- **Phase 2** = leader lock (`cowork-leader`, ttl≈2×heartbeat) + per-work-item idempotent token (`cowork-slot:<slot_id>`) + `published:<work-id>` belt. Reuses already-implemented `task_claim`/`task_heartbeat`/`task_release`, kind `cowork-slot`, NO new enum.

**Three review corrections folded as BLOCKING/documented ACs:** R3 = key MUST be suffix-free (`cowork-slot:<slot_id>`, NO nominal-tick suffix — suffix recreates the bug). R1 = explicit short TTL ~180s, NEVER the 3600s default (false-green starvation). R2 = force-recreate of mcp-server resets `pid-`-based SERVER_SESSION_ID → leader-lock dark window = leader TTL (~30min); document in Phase 2 ops runbook, do NOT shorten by guessing.

Wrote `docs/SPRINT_GOAL.md` § DYN-WF-FOUNDATION (prepended) + registered sprint in `docs/TASKS.md` with full dispatch chain (DWF-BA→ARCH→PM→DEV→QA, DWF-PHASE1 locked). Claimed umbrella lock `task:DYN-WF-FOUNDATION` (sprint-task, claimed:true).

**NEXT: ba** — write `docs/REQ_DYN-WF-FOUNDATION.md`. Zone is `multi`; architect (DWF-ARCH) owns the apps/mcp-server vs cross-service split after BA spec approved.

## Carry-over
- Settled constraints from this brief — never reopen: 0+2 cut, 0→2→1 order, deterministic-router (OQ-6), single-JSON pressure-state (OQ-3), opportunistic-leader not daemon (OQ-2), no `*/15`→`*/5` until post-Phase-2.
- `task_claim` infra is fully real (coordinationStore.ts + coordinationTools.ts); `migrateCoordinationTable()` resolved commit-mutex enum drift — kinds live: cowork-slot|sprint-task|dashboard-row|commit-mutex. No new kind needed.
- SERVER_SESSION_ID is process-level (`pid-<pid>-ts-<startupMs>`), NOT CC-session-level — leader lock works at the single-Docker-mcp-server-process level (adequate).
- TASKS.md scoped `git add <file>` ONLY — tree has MANY unrelated files; NEVER `-A`. main only, no branches.
- Other open sprints (paused/parallel): BCTC-TRUST-RED (HIGHEST, in-flight), FF-DEAD (HIGH, vps uncontended), BCTC-LAYOUT-FIRST, SELF-IMPROVE X-1, CHEF-ATTN, FU-MON.
- Every new lock/policy MUST ship deliberate-violation proof, NOT "exit 0" (feedback_fence_false_green).
