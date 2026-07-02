# Decision Journal — Sprint MERGE-MONEY-RADAR-INTO-MOMENTUM · po

**Sprint goal:** One unified /dashboard/momentum surface carrying BOTH money-flow radar and momentum indicators — without homogenizing the two card contracts.
**Agent:** po
**Started:** 2026-07-02T04:35:00Z

---

### STEP po-S1 · po · 2026-07-02T04:36:00Z
**task-id:** BA-MERGE-MONEY-RADAR-INTO-MOMENTUM
**what-done:** Minted a BA-spec cascade-kickoff to ready[] (next_agent=ba, zone=apps/frontend/, SPRINT-S, user_prioritized) + appended the sprint_goal vision, from USER verbatim "need merge money-radar to momentum" (po-s138).
**what-considered:**
- Route fate of dashboard.money-radar.tsx: DELETE vs REDIRECT vs keep-both → chose REDIRECT→/dashboard/momentum (delete would 404 bookmarks; page is LIVE HTTP 200 with real data).
- Chain: direct FIX vs BA spec → chose BA spec (real product decisions + do-NOT-homogenize design constraint + standing freshness/source-link SLAs to protect). Single zone apps/frontend/ → NO architect split.
- Loader: separate pages vs one loader with Promise.allSettled → chose merged loader, per-section isolation (one dead feed never blanks the other).
**why-decision:** Both feeder APIs (/api/momentum-indicators + /api/money-radar) already serve 200 → PURE frontend, no backend; a BA spec locks the redirect/nav/section decisions before code.
**why-change:** no change from plan.

### STEP po-S2 · po · 2026-07-02T04:36:30Z
**task-id:** FIX-FE-HEADER-NAV-MONEY-RADAR
**what-done:** Superseded the already-READY nav task: relocated ready[]→done[] (status=DONE, done_verified:false, resolution=superseded-by-merge, superseded_by=BA-MERGE-MONEY-RADAR-INTO-MOMENTUM).
**what-considered:**
- Leave it in ready[] (dev-team loop could adopt it) vs fold into merge → chose fold. It would add a SEPARATE "Radar Dòng Tiền → /dashboard/money-radar" nav entry, but that route is becoming a redirect → a doomed double-entry.
- Disposition lane: CANCELLED vs DONE → chose DONE-in-done[] (no cancelled lane exists; LANE_ALLOWED_STATUSES.done = {DONE, DONE_VERIFIED}); resolution field carries the honest "not implemented, folded" semantics.
**why-decision:** The user's original need ("reach radar from the header") is fully honored by the unified nav entry the merge delivers; a second entry is waste + confusing.
**why-change:** Router flagged this row as "possibly related backlog (deferred ready)"; PO resolved it as SUPERSEDED rather than parallel-shipped.
