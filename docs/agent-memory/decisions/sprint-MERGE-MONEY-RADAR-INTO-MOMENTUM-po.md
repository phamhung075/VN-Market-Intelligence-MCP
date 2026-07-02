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

### STEP po-S3 · po · 2026-07-02T04:54:49Z
**task-id:** FIX-BCTC-BANK-BS-SECTION-CLASSIFIER
**what-done:** Routed REVIEW→qa (next_agent/route_to=qa) for CODE sign-off; kept status=REVIEW; stamped a done_verified-WITHHELD note (LIVE DoD gated on the user-approval mcp-server rebuild).
**what-considered:**
- Hold in review (no next_agent) vs route to qa now → chose route: code is complete (2c7fb5b0+ff1bac44) and router independently re-ran 13/13 GREEN, so QA can APPROVE-CODE without the rebuild.
- Flip to done_verified vs WITHHOLD → WITHHOLD: live behavioral gate (bank-form BS section-classifier on rebuilt image) needs the same blocked deploy; flipping now = false-green (code-complete ≠ done_verified, po-s76/po-s100 lesson).
**why-decision:** Move the ball on the deploy-independent half (code QA) while honestly gating the deploy-dependent half behind the operator rebuild.
**why-change:** no change from plan (router handed QA routing to PO this tick).

### STEP po-S4 · po · 2026-07-02T04:54:49Z
**task-id:** (ambient — signal A-30 sau-2026-07-02T04:45Z)
**what-done:** Dispositioned the CRITICAL memory row (85.51% hard-cap crossed), kept status=READ, sent ONE CRITICAL WORK escalation for the state transition; minted NO dup task.
**what-considered:**
- RESOLVED vs READ → READ: A-30 is live+unresolved, RESOLVED would be false-green; READ stays cold-evictable (not TRIAGED = non-evictable).
- New ops/dev task vs fold → fold: the single user-gated rebuild is already carried by FIX-BCTC-ENRICHER-STUCK-BACKLOG (A-30 FOLD 00:36Z); a second task = duplicate.
- Silent vs escalate → escalate ONCE: 85% hard-cap crossing is a distinct state transition from the 82.66% climbing-warning I already sent (not spam).
**why-decision:** Deploy is USER-APPROVAL-GATED and MUST NOT be worked around; PO's only in-boundary lever is the escalation + honest board disposition.
**why-change:** no change from plan (carry-over said "if next tick ≥85% → re-escalate").
