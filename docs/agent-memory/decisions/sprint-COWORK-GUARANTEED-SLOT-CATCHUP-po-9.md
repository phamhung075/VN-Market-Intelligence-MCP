# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · po (continuation 9)

**Sprint goal:** Make cowork `guaranteed:true` an HONORED contract, not a false promise — bounded exactly-once catch-up for a slot whose window elapsed during standby/session-down, or a structured (non-silent) miss.
**Agent:** po
**Started:** 2026-08-13T18:09:52Z
**Rolled from:** `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po-8.md` (37262B > 36000B byte cap, CAP-REACHED sentinel already present)

---

### STEP po-S159 · po · 2026-08-13T18:09:52Z
**task-id:** CLEAN-TREEMAP-REGISTER-10-ORPHAN-POLICY-PROTOCOL-DOCS + FIX-SPRINTGOAL-STATUSLESS-ENTRY-STRUCTURALLY-UNEVICTABLE + COWORK-GUARANTEED-SLOT-DURABILITY (closure)
**what-done:** Triaged claude-manager-helper's two 2026-08-13T16:15Z audit findings (rerouted by router after CMH emitted no Pass 10 RETURN and no signal_queue row); one `orch-apply.sh` write closed the sprint_goal cap breach and minted 2 backlog rows.
**what-considered:**
- Pass 5 cap: raise cap 15→16 (rejected — hides growth, cap is the detector) · close an arbitrary PLANNING entry (rejected — all 15 others are live) · close the ONE entry that is structurally un-retirable (chosen)
- Pass 1 tree-map: bulk-register myself (rejected — DAG placement is architect's job per tree-map.md:418) · dismiss as false positive (rejected — I re-verified all 10 are tracked with 0 map hits) · mint architect row with resolved paths + acceptance (chosen)
**why-decision:** COWORK-GUARANTEED-SLOT-DURABILITY was never a sprint goal — a 2026-07-07 PO *ruling* record shaped `{id,ts,by,vision,ruling,brief}`, carrying neither `sprint_id` nor `status`, so `checkSprintGoalStatusCanonical()` early-returns on it and `orch-cold-evict.sh`'s TERMINAL predicate cannot key it. It was the only entry no automated path could ever remove, hence the one that overflowed. Its ruled-on deliverable SHIPPED (QA-verified 25/25, commit `4df3d1545`, launchd plist live) and its residual scope is carried by the still-active successor CATCHUP sprint — so closing is recording reality, not abandoning work.
**why-change:** Went beyond the referral by minting the root-cause FIX: closing the entry alone leaves the class intact, and orchStateSchema.ts § 11's own header records this array previously hitting 26 vs cap 15. Symptom-only closure would have guaranteed recurrence.

### STEP po-S160 · po · 2026-08-14T03:35:04Z
**task-id:** FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER
**what-done:** Signed off REVIEW→DONE_VERIFIED after repairing the 4 rows whose missing `next_agent` was holding the row's own acceptance gate red; minted FIX-ORCHSTATE-MINT-FLAGGED-ROW-WITHOUT-RESOLVABLE-HANDLER into ready[].
**what-considered:**
- Sign off on architect's note as written (rejected — its own text says the PRIMARY gate FAILS live; I re-ran it, exit=1, so "recommend sign-off" and the evidence contradicted each other)
- Rework back to architect (rejected — the red gate is a *data* defect in 4 unrelated rows, not a defect in the mechanism architect shipped; reworking would punish the wrong artifact)
- Hand-repair only (rejected alone — fixes 4 rows, prevents nothing; ages 15-58d prove the class recurs)
- Mint-only, leave gate red (rejected — leaves this row's own AC unmet for an unbounded wait)
- Hand-repair + mint the enforcement row + sign off (chosen)
**why-decision:** The AC demanded an executable showing ZERO dispatch-lane=none, run live. Every failing row carried a `zone` that *deterministically* names its handler via zone-routing.md Step A, so supplying `next_agent` was derivation, not the invention architect correctly refused under plan-only authority. Post-repair: report exit=0, PRIMARY 5/none:0, SECONDARY 77/none:0; verifier 24/24. The prior "no sign-off without a live fire+drain" hold is met by this row's own history — SLS promoted+claimed it live 08-07, review-lane drain routed it here 08-14.
**why-change:** Went past the referral: recorded in the row that the gate is green because of mechanism AND my repair, not mechanism alone. A future reader must not cite this PASS as proof the sweep is self-sustaining — it is not yet, which is exactly what the minted row buys.

### STEP po-S161 · po · 2026-08-14T06:56Z
**task-id:** UNBLOCK-OPS-RAG-REBUILD-DONEVERIFIED-FALSIFIED-BY-KERNEL (primary) · OPS-RAG-SERVICE-REBUILD-DEPLOY-LANCEDB-FIX (the row being un-certified)
**what-done:** Restored `OPS-RAG-SERVICE-REBUILD-DEPLOY-LANCEDB-FIX` from `archive/2026-08.json` `.done_tasks[]` into hot `review[]` at **BLOCKED**, retracted its QA certification in place, and banner-marked its falsified "MUST NOT BE RE-DIAGNOSED" instruction; cross-referenced `FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED` as the live tracking row.
**what-considered:**
- Status REVIEW + `next_agent=qa` (rejected — invites a second re-review of a crash loop already owned by the LANCECORE row; two open rows racing the same diagnosis is what produced 5 no-op folds)
- Status BLOCKED in `review[]` + `blocked_by` LANCECORE (chosen — lane-coherent per `LANE_ALLOWED_STATUSES.review`, non-terminal so `orch-cold-evict.sh` cannot re-evict it, and it states the dependency instead of manufacturing work)
- Leave the cold copy in place and only add a hot row (rejected — two copies with contradictory statuses IS the misdirection being removed)
- Leave a same-id tombstone in `.done_tasks[]` (rejected — `orch-cold-evict.sh:873` content-dedupes new cold rows against `.done_tasks[].id`, so a tombstone would silently swallow this row's eventual real closure record)
**why-decision:** Kernel dmesg (inside the Docker Desktop VM, the source this row's own commit `ca6d86869` designates as authoritative because `docker inspect .State.OOMKilled` is a known false-negative here) shows three memcg OOM-kills of the exact container QA certified — 2026-08-12T13:46:51Z (+1h00m), 14:00:57Z (+1h14m, invoker `lancedb-tokio-w`, the precise thread this row's fix pinned), 2026-08-13T09:20:09Z (+20h34m). A DONE_VERIFIED row whose subject was killed by the kernel three times after certification is not a record, it is an instruction — and this one explicitly tells the next actor not to re-diagnose. So the falsification had to land on the artifact itself, not only in a notebook. Removed the row from cold rather than duplicating it, recording the move in a new `.restored_to_hot[]` array in the archive (additive; the archive's own 4-key existence check at `orch-cold-evict.sh:871/980` is unaffected).
**why-change:** Went past "revert the status": also renamed `qa_verified_at`/`qa_verified_by` to `*_RETRACTED` and flagged `.verification.retracted=true` with the AC-3 probe's `live_value_observed` prefixed RETRACTED. A status flip alone leaves three independent green certification signals on the row for any predicate or reader to key off — reverting the status while leaving `qa_verified_at` intact is the same partial-write shape as the closure being corrected.

### STEP po-S162 · po · 2026-08-14T07:08Z
**task-id:** FIX-COMMIT-SWEEP-VICTIM-SELF-DETECT (fold) + FIX-PO-AC3-PERSISTENCE-GATE-OWN-COMMIT-VS-HEAD-ANCESTRY (mint)
**what-done:** Mid-cycle I *became* the swept victim — both orch files staged clean at commit time because peer commit `3220f31bc` had already absorbed my 06:59:05Z/07:01:03Z writes. Folded the live occurrence onto the tracked row and minted the sharper defect it exposed in PO's own flow.
**what-considered:**
- Say nothing (rejected — the sweep was benign and the content correct, which is exactly the case that trains agents to stop checking)
- Fold the occurrence only (rejected as insufficient — it records the symptom I already knew about and misses the new finding)
- Fold + mint the AC-3 gate defect (chosen)
- Self-fix `docs/agents/po/flow/main.md` (rejected — agent definition/flow file; po's own `forbidden_outputs` bars it, routed `next_agent=agent-father`)
**why-decision:** PO's AC-3 gate asserts persistence with `git show --stat $(git rev-parse HEAD) | grep -q orch-state.json` against PO's OWN commit, and bug-telegrams "landed on disk but not in git HEAD" on a miss. This cycle it would have MISSED while the write was fully durable — I verified the content by reading it back out of `git show HEAD:docs/data/orch/orch-state.json`. **The gate's failure direction is what makes it worth a row: it asserts a data-loss that did not occur, inviting the next actor to re-apply an already-applied write to the hot SSOT.** Correct predicate is ancestry-and-content, with own-commit membership demoted to an informational note — and the same probe then yields the swept-by-peer evidence trail the folded row has been asking for since 2026-07-21, free.
**why-change:** Not in the dispatch. I kept it because I could only have caught it by an ad-hoc `git log -S` that nothing in my flow requires — which is the folded row's entire thesis, reproduced on myself.

### STEP po-S163 · po · 2026-08-14T09:30Z
**task-id:** FIX-PUSH-DELIVERY-ERROR-RATE-ALERT
**what-done:** Signed off the epic-wrapper parent DONE_VERIFIED (review[] -> done_verified[]), after ratifying the architect split at source; stamped `po_goahead_20260814T092743` + `po_signoff_20260814T092743`, added the missing forward `children[]` edge, deleted the stale `next_agent:"po"`.
**what-considered:**
- Leave open until both children ship (rejected — nothing actionable remains on the parent, so every tick it re-enters the Review-Lane SECONDARY-Drain pool; that recurring wasted-dispatcher-cycle is the exact harm `po_ruling_20260730` closed after 5 BOUNDED-1 declines)
- Close it but skip the `po_goahead` stamp (rejected — WF-2 SUPERVISED-HOLD scans `done_verified[]` since FIX-DEVTEAM-PIPELINE-RESUME-TERMINAL-LANE-BLIND, and this row keeps `supervised:true`, so an unstamped terminal row can hard-hold the pipeline if `.head` ever names it)
- Clear `supervised`/`plan_only` instead of stamping (rejected — those flags are the historical record of why SLS routed this to architect; erasing them destroys the audit trail, and the stamp neutralises the hold without rewriting history)
- Reassign `next_agent` to a dev role (rejected — the children already carry `next_agent` dev-mcp-server / dev-alert-engine; a third pointer would double-dispatch the same work)
**why-decision:** The parent's only deliverable was decomposition and it is fully discharged. I ratified per `supervised-goahead.md` Step 2 at SOURCE, not on the split note's prose: no `/metrics` route and no prom-client in mcp-server (both greps empty), `/api/vps-proxy-health` at `server.ts:1023`, `vpsPushLogStore.ts:97` hardcodes `["prices","news","sbv","bctc"]` while the `VpsService` type at line 13 includes `foreign-flow` (the specced gap is real), zero Ticker/cron in alert-engine with `router.go:36-37` = `/health` + `/evaluate` only, and — the safety-critical one — `classifier.go:51` maps high|critical -> ChannelMarket, confirming the child's hardcode-ChannelWork mandate is necessary, not decorative. Then I ran dev-team's OWN eligibility library against the live board rather than asserting dispatchability: child 1 `BOUNDED1_ELIGIBLE:true` lane `dev-mcp-server`, child 2 gated only by `deps_ok:false` on its `depends_on`. Sequencing is machine-encoded, not prose.
**why-change:** Two beyond the dispatch. (1) The parent had NO forward `children[]` field — the children pointed back via `split_from` but `is_epic_wrapper` (`devteam-eligibility.jq:167`) reads `children`, so this row never registered as an epic wrapper to any sweep; added it. (2) First `orch-apply.sh` attempt was REJECTED (validator exit 2) because I wrote `next_agent:null` and `TaskSchema` declares `z.string().optional()` — not nullable. Fixed by deleting the key. Recording it because "set the field to null to mean done" is an easy repeat, and the wrapper correctly refused rather than corrupting the SSOT.

### STEP po-S164 · po · 2026-08-14T14:30:24Z
**task-id:** FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE
**what-done:** Ratified architect's plan-only reconciliation brief with verdict AMEND-THEN-RESUBMIT — answered its 3 §10 open questions from measured data, filed 3 blocking amendments + a new AC-0, stamped `po_goahead_20260814T143024`, routed `next_agent` po -> architect.
**what-considered:**
- Sign off DONE_VERIFIED and route to pm for decomposition (rejected — §3's known-id union is refuted by live drift; pm would decompose a guard that goes green on the dangerous state)
- Full rework back to architect (rejected — §2.3/§4/§5/§6/§7/§8 are sound and re-verified at source; discarding them would re-spend a good design)
- Decide A1/A2/A3 myself and hand a corrected brief to a developer (rejected — those change the guard predicate and classification algorithm, i.e. technical design, architect's job not mine)
- Withhold the `po_goahead` stamp (rejected — WF-2 SUPERVISED-HOLD would then block architect from ever resuming; that recreates the documented-consumer/no-producer stall this very stamp exists to prevent)
**why-decision:** Ratified per `supervised-goahead.md` Step 2 at SOURCE, never on relayed prose. Re-derived the brief's load-bearing claims from the executables: Stage 1g anchor real (`checkMissingDependencyReport` `orchStateSchema.ts:1272`, imported `orch-validate.mjs:88`); the archiver's weak signal real (`[.done_tasks[]?|.sprint]` unioned into `CLOSED_IDS_FILE`, `--all` = CLOSED minus ACTIVE); `--dry-run` proven read-only (`continue` precedes every `mv`, line 202) BEFORE running it. Then re-measured, because the brief is 6d stale: dangling 34 -> 14 -> **11**. That re-measure is what forced AMEND: 4 of the brief's own 6 "LIVE, needs registration" ids (FRESHNESS-AUTO-REMEDIATE, FU-ORCH-HOT-SUB150, INPUT-VALIDATION-COVERAGE, SYSTEMIC-REMAKE-P1) left the dangling set since 08-08 via `.done_tasks[].sprint` ONLY — hotA=0 hotC=0 arcClosed=0 arcGoal=0 for all four, so under the designed Stage 1h they read CLEAN while PO sign-off stays impossible for them and SYSTEMIC-REMAKE-P1 is still `active` in sprint_goal. The guard as designed would certify the exact state it exists to catch. Confirmed the metric is anti-correlated with safety by re-running the archiver's own dry-run: blast radius 299 -> **346** WOULD-ARCHIVE (+47 in 6d) while dangling fell. Q1 was settled by evidence, not judgment: `archive/2026-07.json .done_tasks[11]` shows BA-IND-P1-MOMENTUM-FRONTEND is a TASK carrying `sprint:"MARKET-INDICATOR-DEPTH-P0"` — so the brief's option (b) would have fabricated a sprint object from a task id; ruled (a) relabel. Same shape found unflagged in UC-RDL-P4, hence amendment A2.
**why-change:** Three findings beyond the brief's scope. (1) The hazard is ARMED, not latent — `dev-standards.md:60` publishes `--all` as a sanctioned backfill with no warning and `WORK.md:339` leaves the live backfill as an outstanding "PO-routed follow-up action" addressed to my own role; running it as documented moves 346 journals, 114 from sprints with open work. Filed AC-0 (make `--all` refuse until §2.3 lands) to de-risk the days the full sequence will take. (2) §2.1 contradicts itself on `PLANNING` (branch 1 says LIVE, ELSE says pre-sprint) and disagrees with §3's exemption predicate; CHORE-COMMIT-OVERHEAD — absent from the brief entirely — exercises it live. Ruled PLANNING is not a liveness signal. (3) Accepted a real cost explicitly rather than hiding it: Q1+Q3 strand 3 misnamed journals in the archiver's third state; refused to rename-merge them (`sprint-MARKET-INDICATOR-DEPTH-P0-qa.md` already exists, merging is content mutation = AC-6 breach) and designated them the AC-4 test fixture instead. Also noting for the next PO: this stamp permanently spends the row's WF-2 hold, so its return trip depends on `next_agent=po` + the review-lane drain, not the gate.

### STEP po-S165 · po · 2026-08-14T18:45:10Z
**task-id:** SPIKE-AUDITOR-WRITE-PLANE-DIVERGENCE-ROOT-CAUSE
**what-done:** Ruled (a) DISPATCH on the router's structural escalation — minted a P0 SPIKE to agents-architect for the system-auditor narrated-but-unwritten signal_queue/DASHBOARD family (10 occ / 6 sub-shapes / <48h) — then live-premise-checked the 17 c99 signals that triggered it and found 5 of the 8 "CRITICAL" findings are false positives. 2 orch-apply pipes, conservation clean (694→696, signals 38=38), 20 to=po rows dispositioned to zero OPEN.
**what-considered:**
- (a) dispatch to agents-architect vs (b) record a not-yet-worth-it decision and keep resume-patching
- Mint a 10th symptom row (e.g. "signal writes don't fire") vs mint a root-cause SPIKE that names the 9 existing symptom rows as its scope
- Route to agents-architect vs agent-father (flow doc) vs developer (scripts/)
- Accept the c99 CRITICAL cron findings as stated vs re-derive each against /api/cron-status before minting
- Mint 8 cron rows / mint 1 consolidated row / fold to existing owners and mint only the un-owned survivor
**why-decision:** (b) was refutable on the board itself, not on judgement: the dedup scan returned NINE open rows in this family and not one asks why the two write planes diverge — FIX-AUDITOR-SELF-COMMIT-STEP-NEVER-FIRES is the exact inverse, DASHBOARD-MUTEX-RETRY covers only the branch where the emit script DID run, the three DURABILITY rows are draft-persistence. A family that has grown to nine symptom rows without a root-cause row is the definition of CLAUDE.md's "recurrent symtom". Chose agents-architect because the fix crosses two commit zones (scripts/ = developer, docs/agents/system-auditor/ = agent-father) and neither owner can design across the seam. The SPIKE is dispatchable rather than exploratory because I pre-read the actuators: both scripts/emit-audit-signal.sh (845L, POST-WRITE read-back at E-3) and scripts/emit-dashboard-row.sh (ABORT marker + bug telegram on every failure branch) are fail-LOUD, and no ABORT marker or telegram accompanied any of the 10 occurrences — so "script silently no-ops" is the least likely branch and "never invoked, counters hand-composed" is the leading one. The gate that should catch that structurally cannot: auditor-notebook-commit.sh §2a AC-4 sources lib/output-contract-invariant.sh, whose own header declares it the "needs no plane lookup at all" gate — c99's `signals_posted=11 | signal_queue_rows_written=11` satisfies 11>=11, passes, and the notebook commits on top of a fabricated line. That is the asymmetry, stated as a testable hypothesis with an AC that can refute it. On the crons: I refused to mint off the auditor's severity labels because A-29's own predicate is under an open REVIEW row as UNEXECUTABLE. /api/cron-status showed all 5 of vpsProxyWatchdog/priceUpdateWatchdog/alertScanParallel/taAlertNotifier/vnIndexRefresh with last_fire EXACTLY == expected_last_fire, last_status=success, on `2-8 * * 1-5` windows — each fired at the final slot of its own window and is not due until Monday. Only brokerSanctionsSweep was both genuine and un-owned, so it is the only mint; monthlySignalQualityAudit and ragFtsRebuildCron folded to existing owners, and the 9 A-29b WARNs folded to the join-drop row after the endpoint's NEVER_FIRED count came back as exactly 9 with a job_name_db join-miss reason.
**why-change:** Departed from the router's framing in one load-bearing way and I am recording it rather than letting the correction ride inside a fold note: the bug-channel telegram (5302) and this escalation both presented "8 crons STALE/MISSED, some >1700h overdue" as the CRITICAL that justified urgency. Five of those eight are manufactured by FIX-CRON-STATUS-LAYERA-SCHEDULE-BLIND-FALSE-CRITICAL, whose title scopes the defect to weekends — it also fires every weekday, ~17h/day, on every window-bounded cron, and A-29 consumes the field verbatim, so that row is upstream of a recurring false-CRITICAL pager path and its blast radius is now recorded on it. This does NOT weaken the structural case, it sharpens it: the c99 agent fabricated the emission of findings that were themselves 5/8 false, so the write-plane gap and the severity-label gap are independent defects that were compounding into one very convincing incident report. Also deviated from mint-per-signal in both directions — 16 of 20 signals produced no row because owners already existed, while the two byte-identical code-janitor rows got an explicit RETIRE ruling instead of a third silent re-ask, with the premise correction that their own emitter (memory-prune-sweep.sh) hardcodes the dead-writer string and will keep re-emitting regardless.

### STEP po-S166 · po · 2026-08-14T20:03:15Z
**task-id:** FIX-CI-TASKCLAIM-DEVTEAM-POSTCYCLE-OWNER-SESSION-PAYDOWN
**what-done:** Triaged 19 durable-inbox envelopes (dev-team tick 19:37Z); 2 mints, 6 folds/routes, 1 manual-dispatch stamp, all via one orch-apply pipe.
**what-considered:**
- Dedup both ci_red into FIX-CI-TASKCLAIM-QA-FLOW-OWNER-SESSION-PAYDOWN (same job name, already REVIEW)
- Dedup into FIX-CI-GATES-INVISIBLE-TO-PREPUSH-DOCS-PATH-FILTER (the gate-plane root cause, READY)
- Mint one NEW file-scoped row for docs/agents/dev-team/flow/post-cycle.md
**why-decision:** Mandatory pre-dedup log read gave FAILING_FILES=post-cycle.md, a file NEITHER open row covers; dedup is FILE-scoped by contract and job-name alone carries zero discriminating information. Both ci_red share one file+job so they folded into ONE row, second SHA appended.
**why-change:** no change from plan.

### STEP po-S167 · po · 2026-08-14T20:03:15Z
**task-id:** FIX-AUDITOR-NOTEBOOK-COMMIT-PLANE-CROSSCHECK-GATE
**what-done:** Accepted SPIKE-AUDITOR-WRITE-PLANE-DIVERGENCE-ROOT-CAUSE's brief at source, minted its mandated fix row with the 2-piece PO-split routed, flipped the spike next_agent po->qa.
**what-considered:**
- Accept the brief's §8 mint instruction as-is (P0, size S, scripts/+docs/agents split)
- Defer the mint and route the whole thing to agent-father as one unit
**why-decision:** agent-father must NOT touch scripts/ (outside its commit zone), so a single-owner route would have stalled or produced an out-of-zone commit; the brief itself demands the split. Verified brief existence/size/author at source rather than on the relayed signal.
**why-change:** no change from plan.

### STEP po-S168 · po · 2026-08-14T20:37:55Z
**task-id:** FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING
**what-done:** Refused sign-off — RAW-verified the row's own verification_gate FAILS, and recorded that FR-0..FR-7 already shipped (c11504775, 2026-08-14T04:35:40Z) rather than being "in flight" as the escalation assumed.
**what-considered:**
- Accept TNB's framing (spec in flight, widen its scope with the DXG evidence)
- Verify implementation state at source first, then rule
**why-decision:** Reading the live flow files showed all 7 FRs already present verbatim; all 3 guaranteed dishes AFTER that commit still persist business_context_cited=null, and the evening dish claimed "zero bctc_signal files processed" while 4 in-window files existed. So the root cause has SHIFTED from missing wiring to unenforced wiring — re-dispatching the same prose fix would have shipped a 2nd no-op. Stamped po_goahead only after verifying at source, never on the relay.
**why-change:** Plan assumed a scope-widening; evidence showed a failed verification gate plus one genuinely uncovered requirement (FR-8, valuation.verdict never enters $BIZ_CTX_SIGNALS so nothing can bind direction).

### STEP po-S169 · po · 2026-08-14T20:37:55Z
**task-id:** FIX-CHEF-QUALITY-VERDICT-FALSE-FULL-NO-LAYER-ASSERTION
**what-done:** Promoted P1->P0 and widened scope to carry the deterministic assertion that three separate live defects now all require.
**what-considered:**
- Mint a new enforcement row per defect (biz-ctx null, EOD schema shape, direction enum)
- Widen this existing ready[] row, which already owns "verdict from narrative self-judgment -> assertion over persisted JSON"
**why-decision:** The BIZCTX spec's own NFR-4 predicted exactly this convergence 2 days ago; three new rows would re-derive one mechanism three times and race each other on the same file. This row sat in ready[] 13 days at P1 while the defects it would have caught kept shipping.
**why-change:** no change from plan.

### STEP po-S170 · po · 2026-08-14T20:37:55Z
**task-id:** FIX-AGENT-BASH-GRANT-COVERAGE-GATE-FLOW-DEMANDS-VS-FRONTMATTER
**what-done:** Selected as this tick's manual-dispatch-sweep candidate (88 eligible) and folded into BATCH.
**what-considered:**
- Take the positional top of the sorted list (TE-T06, a token-economy doc split)
- Take the equal-rank candidate this tick has fresh HIGH escalation evidence for
**why-decision:** Both are rank-1/P1; the sort's tie-break is array index, i.e. insertion order, not a priority signal. TNB filed BUG 5307 this tick — 4 consecutive audit cycles (c127-c130) unable to commit or route dashboard writes — and this row is the opt-IN root-cause coverage gate for precisely that class, already carrying a live baseline_pass.
**why-change:** Deviated from the literal .[0] pick; rationale recorded on the row itself so a later sweep can audit the choice.

### STEP po-S171 · po · 2026-08-14T21:29:41Z
**task-id:** FIX-AUDITOR-DOCAUDIT-MEMORY-PATH-PREDICATE
**what-done:** Refused DONE_VERIFIED on the stale review[] row; re-verified at source that main.md still carries the phantom path, approved the plan_only spec, cleared plan_only, re-routed architect->agent-father, stamped po_goahead, moved row review[]->backlog[].
**what-considered:**
- Sign off DONE_VERIFIED (architect's note reads like completed work)
- Request rework on the spec
- Approve the plan and route to an implementer
**why-decision:** Live grep shows docs/agents/system-auditor/flow/main.md:841 STILL reads the phantom `memory/MEMORY.md` — plan_only means nothing was edited, so DONE_VERIFIED would have been a fabricated close. Spec quality is high and its verbatim BEFORE block still matches byte-for-byte at the drifted line numbers, so rework buys nothing. Implementer must be agent-father, not developer/architect: docs/agents/*/flow/*.md is agent-father's scope and PO is forbidden to edit agent files.
**why-change:** Kept supervised:true rather than clearing both flags — agent-father is deliberately off the DRS allowlist (fleet-wide blast radius), so the row is manual-dispatch-only by design and PO gates it via BATCH.

### STEP po-S172 · po · 2026-08-14T21:29:41Z
**task-id:** FIX-AGENTMEMORY-INDEX-DEAD-SESSION-POINTERS
**what-done:** Opened the follow-up row architect's ADJACENT FINDING asked PO to decide on (INDEX.md's 5 listed session pointers all dead since ace28b78d), with a hard sequencing ruling.
**what-considered:**
- Decline — fold into the parent row
- Open it and let it dispatch immediately (P3 doc-hygiene, trivially fixable)
- Open it gated behind the parent row's post-fix audit cycle
**why-decision:** INDEX.md's broken state IS the parent row's natural negative control (spec §3) — it is the only evidence the repointed predicate is live rather than defanged into a trivial file-existence check. Fixing it first destroys the parent's acceptance evidence and forces QA onto the synthetic scratch-copy fallback. depends_on + an explicit note enforce the order.
**why-change:** no change from plan.
