# PO Notebook

**Cycle:** c284 cycle-70 (SCALE pre-step — fresh-service charters + status SSOTs; kinh-dich Go pivot REJECTED on ground-truth)
**Last update:** 2026-05-24T06:47:02Z
**Status:** Planning groundwork laid for the 6 NOT-yet-scaled services. Reconciled to the established fleet SSOT. Doc-only. Committed.

---

## This cycle (cycle-70) — SCALE rollout pre-step (main-terminal invoked)

CONTEXT prompt assumed all 10 services were fresh scale targets. **Ground truth differs** — checked disk + git before writing:
- DONE (verdict=scale): TA (pilot), macro-indicators, stock-price, kinh-dich (in **TS**).
- ACTIVE: alert-engine (pilot-5 Phase 2, factory model).
- Fresh PENDING: api-gateway, pdf-extractor, rag-service, frontend, news-fetch, mcp-server.
- Established SSOT already exists: `docs/data/pilot-status-schema.json` (agent-father v1.0) + `pilot-status-<svc>.json` per service + per-service factory charter dirs.

### What I delivered (reconciled to reality, not the prompt's stale assumptions)
1. **6 thin scale charters** for the FRESH services only — `scale/{api-gateway,pdf-extractor,rag-service,frontend,news-fetch,mcp-server}-charter.md` + `scale/README.md`. Each POINTS to pilot-charter.md G1–G12 (canonical, not duplicated); delta-only (lang/state/primitives/risks/boundary/owner). mcp-server = RUN-SOLO/LAST. Did NOT write charters for DONE/ACTIVE services (they have richer factory dirs).
2. **6 status SSOTs from the canonical schema** — generated `pilot-status-{6 fresh}.json` via jq from `pilot-status-schema.json`, status=PENDING, 12 goals=TBD. Used the ESTABLISHED `pilot-status-<svc>.json` convention — did NOT fork a parallel `refactor-status-*` SSOT (deleted my first-pass attempt; it would have duplicated the SSOT).

### Deliverable 3 (kinh-dich Go pivot) — REJECTED
- `pilot-status-kinh-dich.json` (committed 4b48f3b0) shows kinh-dich is ALREADY a **closed pilot, verdict=scale, in TypeScript** (`language_locked: true`, "no rewrite step").
- Pivoting a DONE/scaled service to Go for consistency alone = discard a completed pilot + reboot working code. Not a sound PO trade. **No pivot decision doc, no agent-father language-flip signal emitted.** kinh-dich stays TS. Rejection recorded in scale/README.md.

---

## Carry-over (next cycle)
- **Architect:** when a fresh service kicks off, instantiate a factory charter dir (mirror alert-engine pilot-5) + open Phase 0 on its `pilot-status-<svc>.json` (currently PENDING/pre-0). Thin scale charters carry interim deltas/risks/primitive candidates to fold in.
- **macro FIRST-target note is now historical** — macro is DONE; the pattern is proven 4×. Fresh services can go in parallel waves; mcp-server SOLO/LAST.
- **No kinh-dich pivot.** If anyone re-raises Go-consistency for kinh-dich, point them at scale/README.md §REJECTED + pilot-status-kinh-dich.json verdict=scale.
- **alert-engine:** Phase 2 ACTIVE (pilot-5). Its SSOT is live — do not touch from scale groundwork.
- **system-map:** technical-analysis + macro still read "ts" in system-map despite Go pivots (kinh-dich entry returned empty on jq match) — flag to architect/agent-father for a reconciliation pass (NOT my edit).
