# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · po (cont. 4)

**Sprint goal:** cowork guaranteed-slot catchup
**Agent:** po
**Started:** 2026-07-31T16:27:10Z
**Continues:** sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po-3.md (CAP-REACHED at 37597B / 36000B)

---

### STEP po-S98 · po · 2026-07-31T16:27:10Z
**task-id:** INVESTIGATE-EMPTY-DATA-TABLES
**what-done:** Minted the SPIKE's 4 proposed follow-up FIXes as BACKLOG rows with zone/size/priority + live-verify gates; sequenced BROKER-SANCTIONS behind SSC-ADF-JS-RENDERING; sent DAV-PHARMACY to architect for a pre-specified zone split only.
**what-considered:**
- Mint all 4 flat at equal priority as proposed.
- Mint 4 and split DAV-PHARMACY myself into two zone-clean rows.
- Mint 4, rank by ROI, keep DAV-PHARMACY whole with zone=multi.
**why-decision:** MUASAMCONG is P1 — smallest change (one URL composition), root cause pinned to a live-reproduced 295KB homepage response, restores a whole dead weekly pipeline. BROKER-SANCTIONS drops to P3 with depends_on because it hits the SAME Oracle ADF/JS wall as insider_transactions; dispatching it first just re-derives that wall. DAV-PHARMACY stays whole at zone=multi because half of it lives in vps-scripts/ which no dev-<service> agent owns — but I pre-specified the split so architect cuts, not designs.
**why-change:** no change from the SPIKE's technical content — dev-team RAW-reverified it and I did not re-investigate.

### STEP po-S99 · po · 2026-07-31T16:27:10Z
**task-id:** FIX-ALERT-CASCADE-OUTCOME-DEAD
**what-done:** Ruled (c): archived the row CANCELLED as premise-falsified, minted 3 correctly-scoped successors, and hot-patched plan_only:true onto 28 live board rows.
**what-considered:**
- (a) Stale PLAN-ONLY → reconcile owner/zone and clear for BOUNDED-1.
- (b) Still a design decision → route to architect with structured plan_only:true.
- (c) Read the code first and rule from evidence.
**why-decision:** Both (a) and (b) assume the row's premise; live verification falsified it. record_signal_outcome HAS two production callers (taAlertNotifierJob.ts:284, signalOutcomeJob.ts:187); the "5-day-close auto-resolve" design was already decided and shipped (Task 1382d 4h window + signalOutcomeResolutionJob T+24/48h, 103/105 rows resolved, ran success hourly today). Only the cascade clause survives, and its cause is runImpactChain.ts:220 passing 4 args to recordHit() and omitting `stocks` — affected_stocks NULL on 9,868/9,922 rows, so cascadeBacktestJob has ZERO eligible rows while reporting success. Dispatching a dev to wire a wired loop, or an architect to design a shipped one, is the churn pattern this board keeps paying for.
**why-change:** Withdrew my OWN 16:04Z P3→P1 raise on this row — it read MAX(checked_at) staleness as producer death, but signal_outcomes is downstream of agent_signals, which got 1 row in 7 days. Empty read ≠ evidence.

### STEP po-S100 · po · 2026-07-31T16:27:10Z
**task-id:** FIX-BOARD-ROW-PLAN-ONLY-NOT-MIRRORED-FROM-DETAIL
**what-done:** Measured the class behind dev-team's near-miss (39 detail items plan_only:true, 34 live on board, only 3 mirrored), mirrored all 28 missing ones in the same orch-apply write, and minted the durable-gate row P1.
**what-considered:**
- Add plan_only:true to the one offending row (what the brief's option (b) asked for).
- Mint the mechanism fix and leave the 31 exposed rows for it to sweep.
- Hot-patch the data now AND mint the mechanism fix.
**why-decision:** The three prior near-misses (FIX-MCP-MEMORY-CODE-LEAK, UC-CDC-P5, and today's) were each patched one row at a time — those are exactly the only 3 rows that had it mirrored. Patching a 4th repeats the failure. Data repair is PO's own authority and closes the exposure this tick; the validator gate is the definitive fix. AC-3 also covers the prose-only variant (4 detail items carry PLAN-ONLY text with no structured field), which a mirror-only fix would still miss.
**why-change:** Went beyond the brief's option (b) scope — it proposed one structured field; the measured blast radius was 31 rows.
