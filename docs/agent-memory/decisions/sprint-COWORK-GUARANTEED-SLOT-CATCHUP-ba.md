# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · ba

**Sprint goal:** Make cowork `guaranteed:true` an honored contract — bounded catch-up/look-back for slots whose window elapsed during host standby / session-down, or correct the label.
**Agent:** ba
**Started:** 2026-07-22T22:05:00Z

---

### STEP ba-S1 · ba · 2026-07-22T22:05:00Z
**task-id:** BA-COWORK-GUARANTEED-SLOT-CATCHUP
**what-done:** Wrote requirement spec (`docs/handoffs/BA-COWORK-GUARANTEED-SLOT-CATCHUP.md`, 10 FRs + 7 NFRs + 5-row consolidation table) grounded in live code-read + live log data, not the PO's prose alone.
**what-considered:**
- Trust the sprint's prose description of the defects as-given vs re-verify each claim against live code/logs.
- Propose numeric freshness-window bounds myself (per-dish-type) vs leave them fully open for architect.
- Treat `last_fired` as the catch-up detection source vs require the `published:` marker via `task_list_held`.
**why-decision:** Re-verification surfaced 2 concrete code-level findings not stated in the sprint prose: (1) `snapToCronBoundary` has no snap branch for any of the 8 guaranteed slots' `"MM H * * *"` cron shape (MM≠0) — their schedule-level boundary dedup is provably always-false, so the `published:` marker is not just "the recommended arbiter," it is empirically the ONLY one working today (live-reproduced via the `chef-evening` 19:55:09Z/19:59:49Z dual-fire in the firer log); (2) zero `last_fired` write call-sites exist in any of the 4 guaranteed-slot-owning flows — confirms the decouple-from-delivery gap by absence, not inference. Proposed concrete per-dish-type freshness defaults (keyed on the already-live `dish_type` field) rather than leaving them fully open, since PO's own task note asked BA to specify them and this is calibration, not a priority call. `task_list_held(kind:"cowork-slot")` chosen as the delivery-evidence source because it's the only read-only, race-free enumeration tool available (no `task_status`/`get_task` peek tool exists).
**why-change:** No change from the PO-minted scope; this cycle adds code-verified grounding + concrete numeric defaults + FR/NFR/DDD structure on top of the already-correct sprint vision.

### STEP ba-S2 · ba · 2026-07-22T22:05:00Z
**task-id:** BA-COWORK-GUARANTEED-SLOT-CATCHUP
**what-done:** Zero PO blockers — routed the Track-B pmset/caffeinate keep-awake decision to architect (per router's explicit framing, not a BA-owned call) and left FR-8's fanout-timeout resolution as an explicit architect ruling rather than prescribing one option.
**what-considered:** Whether the freshness-window numbers or the FR-8 timeout choice constitute PO-only blockers.
**why-decision:** Neither is a product-priority question — both are technical/calibration judgments already delegated (Track B explicitly by the router; FR-8 is an engineering tradeoff between raising a timeout, fixing flow duration, or accepting risk, none of which changes scope or priority).
**why-change:** No change from plan.

### STEP ba-S3 · ba · 2026-07-23T09:28:22Z
**task-id:** FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS
**what-done:** Wrote decomposition spec (`docs/handoffs/FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS-BA-spec.md`, 7 FRs + 6 edge cases + DDD mapping) — confirmed the 4 literal `task_id` formats across the two dispatch paths by reading the code/flow docs directly, not taking PO's board-note prose on faith.
**what-considered:**
- Mint separate child backlog rows for the decomposition vs one spec doc referenced via `ba_handoff` on the same parent row.
- Present Candidate A (read-probe) and Candidate B (shared-namespace) as a BA ruling vs leave the choice explicitly to architect.
- Whether cowork's `cowork-slot:<slot_id>` per-slot lock alone is sufficient coverage for either candidate.
**why-decision:** Followed `ba/flow/main.md` Step 5's own explicit anti-pattern warning (a prior cycle minting a duplicate `.task_board.backlog[]` row left the real row un-transitioned) — updated the SAME parent row in place rather than minting children, matching the `FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD` / `BA-ANALYSIS-QUALITY-CONVERGENCE` precedent shape. Left A-vs-B as an explicit architect ruling (BA charter is FR/DDD/blockers, not HOW) but narrowed the choice with a live-evidence finding: occurrence-3's raw timestamps show cowork held `published:tnb-audit:<period>` (not `cowork-slot:tnb-audit`, already released by then) at collision time — so `cowork-slot:<slot_id>` alone (TTL 180s, released seconds after spawn per its own design comment) cannot be the fix's anchor; both candidates must ultimately gate on the `published:` key to cover the actual work window.
**why-change:** No change from the dispatching instruction's PLAN-ONLY mandate; zero PO blockers this cycle — PO's own note pre-resolved priority/scope/candidate framing.
