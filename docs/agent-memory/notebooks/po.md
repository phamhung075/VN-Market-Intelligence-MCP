# PO Notebook

**Cycle:** dev-team triage — residual non-PDF backlog — 2026-05-26T19:43Z.
**Last update:** 2026-05-26T19:43Z
**Status:** Returned BATCH of 2 dispatched + 4 queued/parked. BCTC-LAYOUT-FIRST untouched (parallel session owns it). Files UNSTAGED — main terminal commits.

---

## 2026-05-26T19:43Z — dev-team triage (Step 1), parallel-session-safe

**Spawn context:** dev-team Step-1 triage. A PARALLEL session owns active sprint BCTC-LAYOUT-FIRST (LF-FIX done @signal 19-36-19Z → next LF-DEPLOY→LF-QA→LF-EXIT). HARD EXCLUSIONS: no `apps/pdf-extractor/`, no `LF-*`, no task needing a Docker rebuild NOW (concurrent rebuild w/ their LF-DEPLOY risks 16GB host panic).

**Verified before batching (not from context blindly):**
- system-map.json mcp-server tools array = 125 (jq) vs live 146 → SSOT-REFRESH real.
- project-stats cronJobCount = 68 = live `grep -c cron.schedule startScheduler.ts` → NOT stale; context claim outdated. Only system-map needs refresh.
- Risk-flag targets exist: `clients.ts` (R-MED), macro Go handlers (R-HIGH), `docs/ARCHITECTURE.md` (R-LOW). All code/test/doc — no rebuild to author.
- Stale branch `task/1972` = 1 unmerged commit `0d918f08` (carries ohlcvBackfill.ts + 159L test) → CLEAN→qa (don't auto-discard).
- pipeline-state: LF-DEPLOY rebuilds pdf-extractor ONLY; mcp-server unchanged → CLIENTS-TYPE has no rebuild collision.

**BATCH returned (priority reliability→coverage→UX→arch, WIP≤2):**
1. DRIFT-3 (architect-design, cross-service) — recurring-bug-escalation guard, deploy-drift class=2 instances, no rebuild to design. SLOT 1.
2. MACRO-CONTRACT (dev-macro-indicators) — R-HIGH body-contract test for /macro/snapshot keyed-object (the contract that 500'd live at frontend close). SLOT 2. rebuild DEFERRED.
- QUEUED: CLIENTS-TYPE (dev-mcp-server, R-MED), SSOT-REFRESH (cross-service, 125→146), CLEAN-1972 (qa). PARKED: ARCH-DOC-DRIFT (R-LOW), MACRO-VNINDEX-DATA-GAP (defer-under-load), NEWS-INGEST-2c (cosmetic), DRIFT-2 residual (kinh-dich pilot).

**Recommended dispatch order:** DRIFT-3 (architect lane, no dev-WIP) ‖ MACRO-CONTRACT (dev lane) in parallel; then CLIENTS-TYPE → SSOT-REFRESH → CLEAN-1972 as slots free. Every MAINT task `baseline_pass` + rebuild deferred to a later serialized ops hop.

**Wrote:** docs/TASKS.md — DRIFT-3 row DISPATCHED + new `## MAINT` board (5 rows + parked list). UNSTAGED. Did NOT touch pipeline-state, pilot-status-*, or any LF-* field.

---

## Carry-over
- BCTC-LAYOUT-FIRST owned by parallel session — do NOT re-triage or touch its state.
- MAINT batch awaits main-terminal dispatch + commit. If MACRO-CONTRACT or CLIENTS-TYPE lands, a SINGLE serialized ops rebuild (NOT concurrent w/ LF-DEPLOY) is required before close.
- DRIFT-3 closes on its own architect+QA deliberate-drift proof (DRIFT-CLOSE note).
