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

### STEP ba-S8 · ba · 2026-08-08T14:33:29Z
**task-id:** UC-CCA-P3
**what-done:** Wrote FR/DDD/AC spec (`docs/handoffs/UC-CCA-P3-BA-spec.md`) for the marker-lifecycle umbrella (9 confirmed incidents, 4 mechanisms). Confirmed live inventory of all 6 copy-pasted gates by grep (chef.md, alert-commander, bctc-analyst, fb-market-poster, digest-predict, tran-ngoc-bau); read coordinationTools.ts directly to confirm `releaseTask()`/`task_force_release_orphan()` carry no `^published:` guard today (FR-5 genuinely open).
**what-considered:**
- Trust the row's "ALSO IN SCOPE: owner_client_session omitted" claim as-is vs re-verify against live chef.md.
- Set `next_agent`=po (flow default, blockers exist) vs `next_agent`=architect (router's explicit instruction, PO already delegated HOW).
**why-decision:** `git log -S"owner_client_session"` on chef.md showed commit `be3545412` (2026-08-06, AFTER the row's note was written) already added it — the item was stale, would have wasted architect cycles re-fixing a closed defect. Kept `next_agent`=architect per router instruction + row's own "architect/ba own the HOW" framing; the one genuine PO-only item (B1: does the FR-5 code-gate have to land same-wave to close DONE) doesn't block design start, only close-scope, so it's flagged not gating.
**why-change:** Also caught a design-overlap risk not named in the source row: FR-5's proposed unconditional code-refuse vs `FIX-CHEF-PUBLISHED-MARKER-RELEASE`'s already-brief'd Component B (conditional delivery-evidence procedural release gate) — flagged as Q-gate-overlap so architect reconciles rather than ships two contradictory release policies. Row moved fields updated in-place `in_progress[]` (status unchanged), `next_agent`=architect, via `orch-apply.sh` (conservation 762↔762).

### STEP ba-S11 · ba · 2026-08-13T12:28:01Z
**task-id:** FIX-BCTC-Q1-2026-STORED-PDF-INGEST-STALL-15T
**what-done:** Review-lane triage (dispatched next_agent=ba). Did NOT decompose into dev-actionable task(s); escalated as a PO-only scope blocker. Row: `status`→`BLOCKED`, `next_agent`→`po`, `ba_triage_note_20260813T1226Z` added, via `orch-apply.sh` (conservation 748↔748).
**what-considered:**
- Decompose now per router's suggested framing: OCR-defect fix for the 7 CORRUPT tickers + confirm the vps_stale serving-gate row covers the other 8.
- Sign off DONE_VERIFIED (rejected on its face — no commit_sha/files, pure recon note, nothing shipped to verify).
- Escalate BLOCKED to PO pending scope adjudication.
**why-decision:** Read past `updated_at` (which the router flagged as a claim-stamp, not ops's real work time) into `ops_recon_note`'s content and git-blamed it (commit `3a4825aab`, 2026-08-06T18:47Z). Two of its premises are now stale: (1) its cited blocker `FIX-BCTC-SERVING-GATE-VPSSTALE-IGNORES-DEMAND-QUEUE-DEPTH` shipped DONE_VERIFIED 2026-08-08 (archive/2026-08.json), 5 days before this dispatch; (2) a more precise both-plane live census the very next day (`docs/architecture-briefs/2026-08-07-bctc-q1-2026-servability-census.md`, task `SPIKE-BCTC-Q1-2026-SERVABILITY-CENSUS`) reclassifies 6 of ops's 7 "NO_DATA" tickers (DBC/KDC/MSN/SAB/SHB/VND) as refine-backlog stalls owned by `FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP`, not this row; only HUT+PLX are true ingest-stall members, plus 2 newly-surfaced (BID, DAG). That census's own RETURN asked PO to adjudicate narrowing this row to {HUT,PLX,BID,DAG} 6 days ago — never actioned (its own SPIKE row is itself still parked `review[]`/`next_agent=po` since 2026-08-07T20:12:35Z). Decomposing on the stale framing would misroute 6 tickers and risk duplicating the reparse row's remediation territory — a scope call only PO can make.
**why-change:** Router framed the expected menu as ready-to-decompose-or-recon; landed on a third outcome (escalate) once the cited blocker's shipped status and the un-adjudicated census were checked, not assumed from the row's own text.

### STEP ba-S9 · ba · 2026-08-12T09:06:49Z
**task-id:** UC-RDL-P7
**what-done:** Wrote STEP2 spec (`docs/handoffs/UC-RDL-P7-BA-spec.md`) reconciling 21 flow/policy docs to the PO's 2026-07-17 main-only ruling — 13 FRs + 2 NFRs, DDD-mapped (100% interface layer).
**what-considered:**
- Reuse the 07-12 audit's original 5-file P7 target list as-is vs re-verify live (only `developer/main.md` had moved, partial self-heal 2026-08-05; found 2 more copy-paste sites — `dev-frontend/main.md`, `docs/references/bundles/bundle-{developer,qa}.md` — and a 4th competing SSOT, `.claude/WORKFLOW.md`).
- Treat the sibling `FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR` row (READY, architect brief 07-31) as a duplicate vs a mandatory coordination read.
**why-decision:** The sibling brief's own §5 explicitly asked PM to "flag to po/ba" that this row should be accelerated to land same-wave as its `post-checkout` hook (else the hook breaks developer's own VERIFY line) — folded that request directly into this spec's §4 rather than leaving it for PM to re-discover.
**why-change:** No PO blocker (STEP1 already ruled). Row moved `in_progress[]`→`ready[]`, `next_agent`=architect, via `orch-apply.sh` (conservation 754↔754).

### STEP ba-S10 · ba · 2026-08-12T12:10:00Z
**task-id:** FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING
**what-done:** TRACE + spec (`docs/handoffs/FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING-BA-spec.md`): live-read chef.md/chef-dish.md, corrected the row's own "Step 5 = portfolio_conviction merge" hypothesis (Step 5 is Kinh Dich, unrelated to bctc), pinned the real drop to Step 4's missing `$BIZ_CTX_SIGNALS`/`$BIZ_CTX_CITED` wiring, found a corroborating stale-comment-confabulation instance. Wrote 7 exact flow-doc edits (FR-0..FR-7).
**what-considered:**
- Recommend a new deterministic gate script (USDVND-precedent shape) vs. pure prose/variable wiring — chose the latter: BIZ_CTX_OK is already a boolean over a named variable once FR-1/FR-3/FR-6 land, no new engine needed, unlike the USDVND row's genuinely-new numeric-comparator problem.
- Opportunistic-only citation vs. force-widening ticker coverage to satisfy the gate — flagged as Blocker Q1, defaulted to opportunistic-only (avoids a new failure mode: padding conviction_calls[] with non-qualifying tickers).
**why-decision:** Evidence-first: verified live bctc_signal_VCB schema (product/customer/ops/mgmt fields) against the exact gate wording before designing FR-1/FR-7; verified the "14/16 blocked" phrase's ONLY source is 2 stale flow-doc comments (chef.md:140, chef-dish.md:430-431), not any live tracked board row.
**why-change:** No change from the row's own deliverable ask. One structural finding not anticipated by the row: this session had zero MCP tool binding (gateway/vn-market absent), so the router-requested `task_release` on `task:FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING` could not be executed — flagged for the parent/router, `.head` reset to idle via `orch-apply.sh` regardless so the row is not falsely pinned in-flight. Row moved `in_progress[]`→`ready[]`, status→READY, `next_agent`=architect, via `orch-apply.sh` (conservation 754↔754). Notebook auto-prune hook dropped both dated sections (this cycle's + UC-RDL-P7's) on first write — recovered via an Archive pointer line, UC-RDL-P7 full text remains in git history, this cycle's full text lives in the BA spec handoff (never lost).

### STEP ba-S12 · ba · 2026-08-14T07:59:04Z
**task-id:** UC-CDC-P1
**what-done:** Split scope into WP-A (5 FRs: compute calendar_status via vnTradingCalendar, enum-gate, stop preflight-script + telemetry.md recycling, pressure-read.md fail-loud) READY now, and WP-B (decouple stale_warning from cycle-snapshot-promotion) BLOCKED. Spec: `docs/handoffs/UC-CDC-P1-BA-spec.md`. Row `in_progress[]`→`ready[]`, status READY, next_agent=architect, via `orch-apply.sh` (conservation 740↔740).
**what-considered:**
- Hold the whole row until UC-SDF-P2 lands (single-batch) vs. split and ship WP-A now.
- Re-scope FIX-COWORK-CADENCE-DANGLING-POLICY-ID's stale 15/240 instance clause myself vs. flag only (not my dispatched row).
**why-decision:** Verified live (not relayed) UC-SDF-P2 is still BACKLOG/plan_only/uncalimed — the row's own 07-25T12:33Z note says decoupling stale_warning before UC-SDF-P2 lands "decouples a signal that was never being produced" (promoteResult.stale provably always false today, filename-key lookup never hits). Splitting lets WP-A (independently correct, unblocked) ship without waiting on an un-dispatched spike; folding both into one blocked spec would stall a P1 row's entire scope on a dependency neither PO nor PM has yet promoted.
**why-change:** No change from dispatched scope — both WPs were already named in the row's required-scope text; this cycle's addition is verifying current landed-state of the two co-dependencies (UC-SDF-P2, FIX-COWORK-CADENCE-DANGLING-POLICY-ID/CADRAT-1) rather than trusting the router's "may be stale — verify" framing at face value. Session had no MCP tool binding (gateway/vn-market call_tool absent) — task_claim/heartbeat/telegram not executed; `.head` reset to idle regardless via `orch-apply.sh` so the row is not falsely pinned in-flight.

### STEP ba-S13 · ba · 2026-08-14T08:59:00Z
**task-id:** TASK-COWORK-MUTEX-001
**what-done:** Prior-art diff (row carried `po_prior_art_suspect_20260808T1600Z`). Diffed live `CLAUDE.md:14`/`CARD.md:35`/`SKILL.md:194,288,563` against Step 2.4's AC — all 5 are the pre-existing generic `intent:` collision pattern or unrelated presence/roster mechanisms, none touch the `cowork-slot:`/`published:` keyspace. Verdict: NOT shipped, gap = the entire Step 2.4 mechanism. Board: `AC-DIFF` sibling spike row `backlog[]`→`done[]`, this row `in_progress[]`→`ready[]`, `next_agent`=developer, `.head` reset idle, same write (conservation 740↔740).
**what-considered:**
- Write a fresh BA spec + re-dispatch architect/pm (the router's generic default template) vs. recognize the existing chain (BA spec 07-23, architect brief 07-29, PM decomposition 07-30 — this exact row) is complete, current, and re-verifiable with zero drift.
- Trust `docs/spikes/SPIKE-COWORK-MUTEX-001-PRIOR-ART-ADJUDICATE.md` (committed 08-12, same finding) at face value vs. independently re-derive: chose independent re-derivation (full grep + `git log --since=2026-08-12` on all 5 target files, confirmed empty) — the spike's conclusion stands but is not merely relayed.
**why-decision:** PM's own decision journal (STEP pm-S5) already recorded `NEXT: Router/PO explicitly dispatches TASK-COWORK-MUTEX-001 to developer` — re-running ba→architect→pm would re-plan already-planned work and repeat the exact cycle-burning mistake this triage exists to prevent (mirror image of `feedback_file_prior_art_check_before_minting_row`). `supervised:true` left untouched — RLC's own claim predicate excludes supervised rows, so `ready[]` residency does not risk an unauthorized auto-fire; deliberate PO/router dispatch is still required.
**why-change:** Deviates from the router's stated default ("hand off to architect per normal SPRINT-M sequence") — justified because that default assumed no spec/design existed yet; concrete evidence (git log, full BA-spec/brief/handoff reads) showed both already exist, are current, and name developer as the correct next hop. Full rationale in the row's own `ba_prior_art_refuted_20260814` field and `docs/handoffs/TASK-COWORK-MUTEX-001.md` § [BA] Prior-art triage. Also reconciled the orphaned `SPIKE-COWORK-MUTEX-001-PRIOR-ART-AC-DIFF` board row (minted 08-08, never knew the 08-12 spike had already answered it) — closed to `done[]` in the same write. Session had no MCP tool binding (gateway/vn-market absent) — task_claim/telegram not executed, Read/Edit/Write/Bash only.

### STEP ba-S14 · ba · 2026-08-14T11:58:45Z
**task-id:** UC-CCA-P2
**what-done:** Decomposed the DRS RESCOPE dispatch into 6 FRs: absorb DMS-2 escalation ladder (CONFIRMED-BLIND fast-path + 30s backoff + SIBLING_RECENT suppression) into `gateway-availability-gate/SKILL.md`, keep confirmed-down actions unchanged (never `send_telegram`), de-dup market-watcher's double probe (delete `cycle.md`'s redundant Step 0-GW, collapse `main.md`'s inline block to a pointer), extend to alert-commander/unified-agent/digest-predict/bctc-analyst, correct fb-market-poster's audit-stale scope from 1 file to 3 (main.md split into daily/weekly-recap/weekly-prediction since 07-12), map notebook classes. Spec: `docs/handoffs/UC-CCA-P2-BA-spec.md`. Row `in_progress[]`→`ready[]`, next_agent=architect, `.head` resynced same write (conservation 734↔734).
**what-considered:**
- Trust the audit's original 8-file/line-anchor list vs re-verify every anchor against live code: chose re-verify — found fb-market-poster's main.md had already split into 3 independent entry files (TE-T26, 2026-08-06), making the audit's single-file anchor stale; also found alert-commander/cycle.md is now a zero-step thin dispatcher (no anchor exists at all in the audit's implied location).
- Treat the skill's new CONFIRMED-BLIND classification as a fresh definition vs cross-check against `cycle-bootstrap/SKILL.md`'s existing CONFIRMED-BLIND/TRANSIENT gate: found the two probes reuse the identical trigger-text signature ("no such tool"/"tool not found") for the same underlying session-transport-gap phenomenon — added a terminology-parity constraint (FR-1) rather than let a second definition drift independently.
**why-decision:** Live-verifying every anchor (not the audit's 07-12 text) was necessary because the verifier itself flagged drift, and this BA pass found further drift the verifier didn't catch (fb split happened AFTER the audit ran). Shipping the audit's literal file list would leave 2 of 3 fb-market-poster entry points (weekly-recap.md, weekly-prediction.md) permanently uncovered — silently defeating the task's own stated rationale.
**why-change:** No blockers routed to PO — all corrections (fb 3-file scope, alert-commander siting choice, CONFIRMED-BLIND parity) are technical facts verifiable in code, not priority/business calls, so next_agent=architect directly (not po) despite the scope correction. Confirmed sibling P1 (UC-CCA-P1-GWBLIND-DEDUP, REVIEW) never touched `cycle.md` — the audit's "coordinate with P1" note is a non-issue. Session had no MCP tool binding (gateway/vn-market absent) — Read/Edit/Write/Bash only, same known limitation as 2026-08-12/08-14 cycles.

### STEP ba-S15 · ba · 2026-08-14T16:05:00Z
**task-id:** UC-ASL-P3
**what-done:** Decomposed the DRS RESCOPE dispatch into 13 FRs: freeze C-01..C-16 + B-05/B-09/B-13 into `scripts/auditor-db-checks.sh`. Found 4 sibling rows (C-04/C-06/C-11/C-12) already carrying design work — C-04 has a full ready-made script skeleton (REVIEW, plan_only) this task integrates rather than re-derives. Spec: `docs/handoffs/UC-ASL-P3-BA-spec.md`. Row `in_progress[]`→`ready[]`, next_agent=architect, `.head` resynced same write (conservation 718↔718).
**what-considered:**
- Follow the RESCOPE note's literal docker-exec DB-access mandate vs adopt the C-04/C-12 sibling precedent (host-bind + `sqlite-wal-guard.sh`) — adopted the sibling precedent: the RESCOPE note's WAL-blindness objection predates the 2026-08-06 `sqlite-wal-guard.sh` fix that resolved it; 3 independent sources (C-04 spec, C-12 fix_spec, this ticket's own title) converge on host-bind.
- Fold `FIX-AUDITOR-TASKBOARD-OVERFLOW-PREDICATE-WIP-ONLY` (same "architect predicate-drift family" label) into scope vs carve out — carved out: it's a `jq` count over `orch-state.json`, not a DB SQL predicate; the 08-08 epic triage's own text already confirms it only resembles C-11 in the title.
**why-decision:** Re-verifying `main.md`'s live line numbers (not the 08-08 architect note's stale `:572`/`:862` citations) and cross-checking `docker-compose.yml`'s bind mounts (confirmed pdf-extractor shares the same `./data/live:/app/data` mount as mcp-server) made the host-bind supersession decision verifiable rather than a re-guess.
**why-change:** No PO blockers — all open items are technical (7 ARCH-RATIFY notes: DB-access confirm, C-06/C-11 SLA-reuse design, C-12 table-name re-verify, mount-drift-check extension, zone narrowing, C-12 connection shape). Session had no MCP tool binding (gateway/vn-market absent) — Read/Edit/Write/Bash only, same known limitation as prior 2026-08 cycles.
