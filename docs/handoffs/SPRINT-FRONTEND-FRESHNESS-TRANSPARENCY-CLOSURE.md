---
sprint: FRONTEND-FRESHNESS-TRANSPARENCY
status: CLOSED
closed_at: 2026-06-27T22:38:36Z
qa_approved_date: 2026-06-27
---

# Sprint Closure: FRONTEND-FRESHNESS-TRANSPARENCY

## Summary

**CLOSED** — All 4 tasks QA-APPROVED DONE and transitioned to terminal/done lane in orch-state.json.

- TASK-FFT-L2: L2 data_asof contract for 5 handlers (dev-mcp-server) — DONE
- TASK-FFT-L3A: Shared FreshnessBadge component + useFreshnessRevalidator hook (dev-frontend) — DONE
- TASK-FFT-L3B: Wire FreshnessBadge into all 34 page routes (dev-frontend) — DONE
- TASK-FFT-L4: Coverage-map-aware SLA monitor extension (dev-mcp-server) — DONE

## DEPLOY FLAG (CRITICAL)

**This sprint changed BOTH:**
- `apps/mcp-server/` (L2 handlers + L4 freshness monitor)
- `apps/frontend/` (FreshnessBadge component + 34-route wiring)

**For the feature to go live on the dashboard, ops MUST:**
1. Rebuild `apps/mcp-server` container from main (contains 5 new data_asof handlers + coverage-map SLA monitor)
2. Rebuild `apps/frontend` container from main (contains FreshnessBadge component wired into all 34 routes)
3. Recreate both services (docker-compose up -d --build mcp-server frontend)

**Without ops rebuild+recreate**, users will NOT see the "Cập nhật lúc" (last-updated) badges on the live dashboard, even though the backend is serving the data_asof fields.

## Recommended NEXT Action

**Route to ops for rebuild+recreate:**
- Service: mcp-server + frontend
- Commit range: includes afbb0c99 (L3A), 24bbecbf (L3B), and L2/L4 work
- Urgency: Deploy to make freshness badges visible on live dashboard

## QA Verification Summary

All 4 tasks passed QA review with explicit acceptance criteria met:
- L2 handlers expose canonical data_asof in 5 response types (marketDigest, alerts, qualityChecklist, priceHistory, vpsProxyHealth)
- L3A shared component created with revalidator hook; no per-page fork pattern
- L3B wired badge into all 34 routes; 32 live routes + 1 static + 1 raw-proxy skip; baked-timestamp defects fixed
- L4 monitor extends SLA coverage; additive (existing 12-signal path unchanged)

## Evidence

- Architect cascade completed per BA-FRONTEND-FRESHNESS-TRANSPARENCY decision journal entry (2026-06-27T19:45:58Z)
- All 4 handoff files present with full acceptance criteria: docs/handoffs/TASK-FFT-L{2,3A,3B,4}.md
- All 4 commits integrated into main branch
- QA-APPROVED status confirmed per orch-state.json closure timestamp

## Files Modified (Summary)

### apps/mcp-server/
- `src/interface/mcp/routes/handlers` — 5 handlers updated with data_asof fields
- `src/scheduler/system/coverageMapFreshnessChecker.ts` — new SLA monitor domain service
- `src/scheduler/jobs/freshnessSlaMonitorJob.ts` — extended to leverage new monitor

### apps/frontend/
- `app/components/FreshnessBadge.tsx` — new reusable component
- `app/lib/hooks/useFreshnessRevalidator.ts` — new hook for data revalidation
- `app/routes/*` — 34 routes wired with badge import + placement

---

**Status:** Sprint closed in orch-state.json (2026-06-27T22:38:36Z)  
**Next:** ops rebuild+recreate for feature visibility
