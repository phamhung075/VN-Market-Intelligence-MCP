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

### STEP po-S5 · po · 2026-07-02T09:57:07Z
**task-id:** FIX-ORCHSTATE-TASKBOARD-HEAD-REINFLATION-GUARD (+ board-hygiene: .task_board.head collapse, BA-PREDICTION-EVIDENCE-REVIVAL disposition)
**what-done:** Collapsed re-inflated `.task_board.head` → non-routing deprecated stub (top-level `.head` untouched); recorded BA-PREDICTION-EVIDENCE-REVIVAL as abandoned/superseded; minted PLAN-ONLY write-gate guard (po-s138); moved orphan rag-churn signal → processed/.
**what-considered:**
- `.task_board.head`: delete key vs collapse to stub → collapse (schema `DeprecatedHeadStubSchema.optional()` allows absence, but po-s66 precedent + G-7 keep a redirect stub so a legacy reader sees `.head` redirect, not a phantom active_task_id).
- BA-PREDICTION-EVIDENCE-REVIVAL: resurrect as backlog row vs abandon → abandon; no real board row ever existed; concrete work already on board (FIX-EVIDENCE-PIPELINE-STARVED real root + FIX-VPS-SSC-INSIDER-502 decoupled dep). Resurrecting = phantom-umbrella theater.
- rag-churn signal: mint new task vs dedup → dedup; FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP already owns it (status_note corroborated 08:07Z) + signal_queue TRIAGED. Only file disposition remained.
- Guard task: skip vs mint → mint PLAN-ONLY; 2nd head re-inflation (po-s66 fixed 1st) = recurring-bug-escalation; `.passthrough()` let routing keys bypass Zod at the write gate — doc-only G-7 is insufficient.
**why-decision:** Single canonical head SSOT = top-level `.head`; a non-routing stub eliminates the dup-key/last-wins misread hazard while the guard task durably stops re-inflation at write time (not just doc).
**why-change:** no change from plan — dev-team triage inputs #2/#3 handled exactly as scoped; RETURN=NOTHING (nothing dispatch-ready; WIP parked user-gated).

### STEP po-S6 · po · 2026-07-03T09:02:14Z
**task-id:** FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD
**what-done:** Drained dev-team 06:37Z tick's 3 to=po signals (NEW→READ) + minted the orphan-adoption guard FIX to backlog + reconciled both W5 review rows to DEPLOY-gated.
**what-considered:**
- A-13 api-gateway FAIL (HIGH): mint a FIX vs mark false-positive — chose false-positive (INFO corroboration sau-…08:41:40Z proves self-recovery: HTTP 200, RestartCount=0, uptime 4d). No task.
- orphan-guard: mint READY (dispatch now) vs BACKLOG plan-only — chose BACKLOG (router mitigated the live instance manually; permanent-fix, not an active incident → normal po→ba→pm→dev chain).
- W5 rows: flip BLOCKED→READY vs annotate+keep BLOCKED — chose keep BLOCKED, rewrite blocked_on to the deploy-gate (sequencing: ops-deploy MUST precede the operational re-ingest; a premature READY would dispatch a dev coding lane with nothing to code).
**why-decision:** COLUMN-ORDER (W5 code blocker) is done_verified (qa 66dfe89a5, RAW-verified) → W5 chain is code-clear; the ONLY remaining gate is deploy + finalize_bctc_refine on live CTG 96e36139, which is ops+operational not code/qa.
**why-change:** no change from router hand-off; added the W5 deploy-gate reconcile as board hygiene (stale blocked_on pointed at a now-done_verified task).

### STEP po-S7 · po · 2026-07-03T23:00:13Z
**task-id:** BCTC-HNX-SSL-HARDEN
**what-done:** Recorded a recovery disposition on the review-lane row + routed next_agent→ops for a live deploy+fetch-with-verification-ON probe (did NOT resolve); minted FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT (backlog, PLAN-ONLY) as the durable B-05 FP fix (po-s140). Router-dispatched B-05 sau-20260703T223423Z decision+dedup.
**what-considered:**
- Ask1 fix-deployed vs self-resolved vs neither: chose NEITHER-CONFIRMED — the analysis-layer recovery (queue 38→0, get_sla_status 33min OK, VPS HEALTHY) came from the B-05-FU-SSC-503-RETRY enricher chain (done_verified), DECOUPLED from this HNX SSL security-debt task; recon already falsified any SSL outage (curl -k kept fetching, leaf valid to 2027-01-03).
- Resolve now vs hold for ops: chose HOLD — this task's OWN AC (fetch OK with verification ON, post-deploy) is unverified; repo scope complete (073fa27f+638fba89) but VPS deploy unconfirmed + 0 fetch/24h ⇒ no hardened-path fetch has run. Per OVERRIDE 07-03 delegate gated deploy/verify to ops (don't wait on user gate).
- Ask2 link-existing vs mint-new: EXCLUDE-TERMINAL is a metric-semantics bug (apps/mcp-server), B-11 is the NEWS sibling, L2-DATAASOF is frontend fields — none covers the bctc auditor-check raw-vs-analysis split ⇒ MINT ONE, modeled on B-11, sibling_of B-11, co-fix in same auditor main.md.
**why-decision:** RESOLVE condition set 03:03Z ("post-deploy freshness verification confirms recovery") is NOT met — recovery is from a different fix chain; the task's own post-deploy AC can only close on a live ops HNX fetch-with-verification-ON probe.
**why-change:** router's B-05→BCTC-HNX-SSL-HARDEN link was the framed root at triage time; corrected the durable FP root to the new auditor-layer-split row (kept the deploy task decoupled). Did not touch the signal (router owns it, already READ).
