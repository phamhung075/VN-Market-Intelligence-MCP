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

### STEP dev-frontend-S2 · dev-frontend · 2026-07-25T07:01:00Z
**task-id:** QUALITY-AUDIT-FRESHNESS-LIVE-PROBE
**what-done:** Upgraded scripts/gen-frontend-page-checks.mjs FRESH-dimension checks from static badge-presence to a LIVE-PROBE engine (fetches each page's real endpoint, grades age vs coverage-map sla_tiers per §FR-6/EC-3/EC-4); regenerated docs/data/quality-checklist.json (tally jq-verified, idempotent across 2 runs).
**what-considered:**
- fully-generic field inference vs an explicit per-page URL table — chose explicit table (endpoint URLs are structural, same pattern already hardcoded for FUNC checks); field NAME resolution stays dynamic (coverage-map row.asof, with `_l2_fix` rows forced to canonical `data_asof`)
- trusting any present recency field vs only the documented one — chose conservative: undocumented fallback fields are shown (real value+age) but capped NEEDS_REVIEW, never a certified PASS, to avoid reintroducing false-green
**why-decision:** Conservative fallback rule directly prevents the exact failure mode BA-FFT was created to fix (a compute-time field masquerading as real recency, e.g. discovered live on bctc-eval + db + services beyond the explicitly-named price-history gap).
**why-change:** Task named only price-history as the required gap check; mechanism organically also surfaced bctc-eval (list+detail) lacking a real top-level asof — reported honestly (NEEDS_REVIEW), not silently absorbed into a false PASS via its `generated_at` field.
