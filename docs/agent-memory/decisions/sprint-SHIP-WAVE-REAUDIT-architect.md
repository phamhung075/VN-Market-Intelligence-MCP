# Decision Journal — Sprint SHIP-WAVE-REAUDIT · architect

**Sprint goal:** Re-audit TASK-17 ship wave (19 items) live behavior. Fix DEGRADED/BROKEN. Drive all to GOOD.
**Agent:** architect
**Started:** 2026-06-11T21:30:00Z

---

### STEP architect-S1 · architect · 2026-06-11T21:30:00Z
**task-id:** ARCH-SHIP-WAVE-REAUDIT
**what-done:** Ruled NFR-C-1 stale-flag Option A (handler-level) over Option B (middleware).
**what-considered:**
- Option A: each handler computes staleness inline (threshold varies per endpoint — market data 2d, filings 90d). Explicit, auditable, zero framework coupling.
- Option B: middleware decorator reads `asOf`/`generatedAt` and injects `stale` fields. Avoids per-handler repetition BUT requires a shared config table for thresholds; thresholds differ per endpoint type; middleware adds an indirection layer that breaks the "no SQL in handler" DDD rule if it touches DB.
**why-decision:** Option A wins. Each handler already knows its freshness semantics. Inline compute is 3-4 lines per handler. Option B would centralize threshold config but creates cross-cutting coupling with no clear DDD layer home — middleware sits between interface and infrastructure which violates layer boundaries. Option A is the no-new-primitive path.
**why-change:** no change from plan

### STEP architect-S2 · architect · 2026-06-11T21:30:00Z
**task-id:** ARCH-SHIP-WAVE-REAUDIT
**what-done:** Confirmed reputation trend=stable root cause via live DB probe: `priorDate` is computed as `today - 7 days` (exact ISO date), but `reputation_scores` rows exist at irregular intervals (2026-05-18, 2026-05-22, 2026-05-31, 2026-06-03, 2026-06-06, 2026-06-09) — never 7 days apart. `getReputation(db, code, priorDate)` always returns null → `priorScore = undefined` → trend always "stable".
**what-considered:**
- Fix A: use MAX(date) < today's date instead of exact -7d offset for prior score lookup.
- Fix B: compute delta from the most-recent prior row regardless of gap.
**why-decision:** Fix B (most-recent prior row) is correct semantics. Any available prior row gives a real delta. Fix A (-7d) still misses if no row exists exactly 7 days ago. Fix: `getReputation(db, code)` (no date = latest) queries the most recent row; exclude current `today` date in that query to get the true prior. A single `WHERE date < today ORDER BY date DESC LIMIT 1` lookup replaces the brittle priorDate string match.
**why-change:** no change from plan
