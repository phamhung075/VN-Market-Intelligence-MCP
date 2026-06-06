# Decision Journal — Sprint ORCH-TASK-CANON · dev-frontend

**Sprint goal:** Canonicalize task schema — done[] served, decisions joined, frontend source swap
**Agent:** dev-frontend
**Started:** 2026-06-06T21:27:00Z

---

### STEP dev-frontend-S1 · dev-frontend · 2026-06-06T21:27:00Z
**task-id:** F3-FE
**what-done:** Swapped done-group source from `tasks.filter(t => t.status === "DONE")` to `board.done ?? []` in TaskBoardPanel; updated TaskBoard interface to add `done?: TaskRow[]`; updated TaskStatus to closed 7-value enum; added status_note rendering in both TaskGroup and DoneTaskGroup rows; added Suites 6+7 in orchestration-task-board.test.ts (41 → 121 test additions); rebuilt frontend container; live-verified SSR HTML (318KB, ARCH-ORCH-F1 + agent-father-S1 present, done count = 71).
**what-considered:**
- Keep `board.done ?? tasks.filter(t => t.status === "DONE")` as dual-source fallback
- Use purely `board.done ?? []` with correct degraded state (empty if F2 not deployed)
**why-decision:** Handoff AC-3 explicitly forbids filter fallback; F2 is live-verified (71 rows served); dual-source would hide future serving failures.
**why-change:** no change from plan; source swap is additive as designed.
