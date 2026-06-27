# Decision Journal — Sprint FRONTEND-FRESHNESS-TRANSPARENCY · dev-frontend

**Sprint goal:** All frontend data must show last-update timestamp for freshness transparency
**Agent:** dev-frontend
**Started:** 2026-06-27T22:50:00Z

---

### STEP dev-frontend-S1 · dev-frontend · 2026-06-27T22:54:00Z
**task-id:** TASK-FFT-L3A
**what-done:** Created FreshnessBadge.tsx + useFreshnessRevalidator.ts with 46 tests, tsc clean.
**what-considered:**
- only path: two new files (FreshnessBadge + hook); no route wiring yet (L3B scope)
**why-decision:** Spec is atomic: primitives first, wiring second. Directory apps/frontend/app/lib/hooks/ created per RISK-4.
**why-change:** Added `_now?: Date` injectable prop to FreshnessBadge (not in spec) — required for deterministic color-threshold testing without time-dependent side effects.
