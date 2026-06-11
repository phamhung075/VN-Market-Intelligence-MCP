# Decision Journal — Sprint CI-RED-RECONCILE · dev-frontend

**Sprint goal:** Fix CI RED on main — root-cause each failing cluster.
**Agent:** dev-frontend
**Started:** 2026-06-11T14:00:00Z

---

### STEP dev-frontend-S1 · dev-frontend · 2026-06-11T14:00:00Z
**task-id:** TASK-17-PAGE-8
**what-done:** Built market-summaries archive page — proxy route + dual-mode SSR loader + TopNav tab + 62 production-shape tests.
**what-considered:**
- only path: dual-mode single route (?id=detail / no-id=list) — eliminates /dashboard/market-summaries/$id subroute; mirrors prediction-claims precedent; live payload verified STEP 0 before typing.
**why-decision:** Single-route dual-mode keeps URL shape clean (?id= for detail links), avoids extra route file, matches existing pattern in codebase.
**why-change:** no change from plan; DJ-GATE-1 satisfied in this commit.
