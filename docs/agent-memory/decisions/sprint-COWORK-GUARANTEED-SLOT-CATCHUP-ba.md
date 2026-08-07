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

### STEP ba-S4 · ba · 2026-07-31T01:20:34Z
**task-id:** FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE
**what-done:** Wrote FR/NFR/DDD spec (`docs/handoffs/FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE-ba-spec.md`) with `next_agent: architect`; reverted an earlier direct-implementation draft (Step 2.5 tombstone check across `cowork-tick-preflight.sh`/`.test.sh`, `leader-lock.md`, `main.md`, `telemetry.md` — 40/40 tests green) via `git checkout --` (files were clean before, confirmed via `git status --porcelain`; zero residue).
**what-considered:**
- Implement the fix directly (dispatching prompt explicitly offered this) vs write a spec and hand off to architect.
- Fold the rollout/cron-re-arm risk (`CronCreate` prompt text is static, idempotency guard no-ops on re-run) into a formal PO blocker vs an architect-facing NFR/edge-case note.
**why-decision:** `init.md` `forbidden_outputs` ("NEVER write production code", "NEVER modify agent files, flow files, or knowledge files") are absolute identity constraints, not permissions the dispatching prompt's "use your own judgment" can waive — the dispatching prompt is not consent to override my own agent boundaries. The cron-re-arm risk is a technical/deployment-completeness matter (not feature-priority/VN-term/data-source/historical-vs-realtime), so it does not meet the "PO-only question" bar — carried as NFR-5 instead.
**why-change:** Course-corrected mid-cycle after starting implementation; net output changed from code to spec, task-id and scope unchanged. Board row status stays `IN_PROGRESS` in `in_progress[]` (next_agent updated in place, not a terminal/review-token flip, so `CANONICAL:SSOT-STATUSFLIP-LANEMOVE` does not apply); `.head` verified live (`active_task_id:null`) — no head-sync needed.

### STEP ba-S5 · ba · 2026-08-06T07:46:15Z
**task-id:** FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE
**what-done:** Wrote spec (`docs/handoffs/FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE-BA-spec.md`) after a live upstream probe (CI-FRESH-01: vnIndexRefresh confirmed alive during actual VN market hours) and code-level re-derivation of the -526.13 root cause.
**what-considered:**
- Implement dispatch's Part-1 literally ("delta against `prevFetchedAt:null` must not be emitted") vs verify it first against the row's own `detail_ref`.
- Trust `market_context (tier-2)` as written vs resolve which of 3 same-named candidates in live code it actually points to.
**why-decision:** `detail_ref` §8.2 already self-retracted Part 1 ("the delta is fine... acting on §6.4 would delete a correct field") — a stale premise had survived forward into the dispatch. I re-derived the same conclusion independently from `usecases.go` (`computeDelta` already null-guards; `prevFetchedAt` is the oil/gold/usdVnd anchor, not vnIndex's) before trusting the retraction. For `market_context`: code-read showed `get_market_context()` doesn't surface VNINDEX at all and chef's synthesis field of the same name shares the tier-4 pipeline (comparing against either is a no-op) — recommended `market_prices.VNINDEX` instead, the one genuinely independent plane.
**why-change:** Narrowed Part 1 to a small FR-3 companion (baseline-provenance field, cosmetic) and kept Part 2 (cross-plane gate) as the sole durable AC — flagged for PO ratification, not a blocker. Row moved `in_progress[]`→`backlog[]`, `next_agent`=architect (via `orch-apply.sh`, conservation 800↔800).

### STEP ba-S6 · ba · 2026-08-06T18:53:00Z
**task-id:** TE-T05
**what-done:** Wrote FR/NFR/DDD spec (`docs/handoffs/TE-T05-BA-spec.md`); re-measured the 6 skill files live (511L, not the brief's 385L — notebook-write 94→198L, decision-journal 77→99L via 3 intervening hardened-fix commits) instead of trusting the stamp's numbers.
**what-considered:**
- Proceed straight to architect per the dispatch prompt's framing ("sequential relay: ba → architect → pm").
- Check the row's own `next_agent`/`owner` + sibling-row precedent before relaying.
**why-decision:** Live `owner`/`next_agent` = `agent-father` on TE-T05, matching PO's 2026-07-21 artifact-class ruling (`.claude/skills/**/SKILL.md` → agent-father) and **26/26** sibling `TOKEN-ECONOMY-AUDIT` rows sharing `owner=agent-father` (zero use a ba→architect→pm relay despite several, incl. TE-T05, tagged `type:SPRINT-M`). This is a router-level dispatch mismatch, not a call BA should paper over — held per BA's own "blockers must be resolved before returning" rule.
**why-change:** Did NOT hand off to architect and did NOT mutate the live board row (no `next_agent`/`ba_spec_complete` write) — flagged as Blocker B1 to PO instead. Also flagged B2 (bundle-vs-split the unrelated `cowork-boundary`/`cowork-error-boundary` dedup riding in the same row) and B3 (queued append-session-record note-amendment not yet applied).

### STEP ba-S7 · ba · 2026-08-07T20:34:58Z
**task-id:** FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET
**what-done:** Wrote spec (`docs/handoffs/FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET-BA-spec.md`) — product decision (not in `financial_reports`, replacement = new `bctc_news_fallback_hints` table), all 3 PO-named alternatives + 1 extra evaluated, 7 tests found for rewrite (6 named + 1 live-found, `FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP.test.ts:428`).
**what-considered:**
- PO's option 2 (nullable sentinel row in `financial_reports`, guard-excluded) vs option 1 (separate table) vs option 3 (delete write path, pure hint producer).
- Fold `bctcInspectHandler.ts`'s admin-visibility consumer need into this row's scope vs recommend as separate follow-up.
**why-decision:** AC-2's own wording ("no row... ever CREATED in financial_reports") forecloses option 2 on its face, independent of blast-radius reasoning; option 1 additionally preserves a real, live, deliberately-architected consumer (`bctcInspectHandler.ts` / `TASK_PDF-INSPECT.md`) that option 3 would silently regress with zero replacement. Grepped every `tryNewsChainFallback(` call site (not just the 6 named tests) and found a 7th — `NGAYNOP-FLIP.test.ts:428` — asserting the identical defect-as-intended contract; its own comment is this ticket's origin, not a bystander.
**why-change:** No change from PO's steer on the core decision; scoped the admin-inspector companion (FR-7) as a non-blocking recommendation rather than a PO blocker (I gave a decisive default — defer — so it doesn't meet the "genuinely needs PO" bar). Row moved `in_progress[]`→`ready[]`, `next_agent`=architect, via `orch-apply.sh` (conservation 774↔774).
