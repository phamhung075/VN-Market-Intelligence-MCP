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

### STEP po-S101 · po · 2026-07-31T17:52:41Z
**task-id:** FIX-CI-SIZELINT-VPSPROXYSTALENESS-REGRESSION-123L
**what-done:** Isolated the 3-run CI-RED thread to ONE job (`size-lint`) and one file, and minted a P1/S row scoped to restoring the 120L cap by extraction.
**what-considered:**
- Mint one row per named failing job across the 3 signals (Go Lint + bun test + size-lint).
- Fold into the existing FACTORY-XZONE-size-justification-sweep debt row.
- Read the CI job plane first, then mint only what is actually still red.
**why-decision:** `gh run view 30650707550 --json jobs` on the latest origin/main HEAD returns 1 failure / 19 success — Go Lint and bun test are already green on that same SHA, so 2 of the 3 candidate rows would have been minted against resolved transients. The remaining offender is a REGRESSION, not new debt: the file's own docblock says it was split out under FIX-CI-SIZELINT-MCPSERVER-SIX-UNCOVERED-OFFENDERS AC-4 to stay under 120L, and b08045ef0 grew it 111→123L. AC-6 explicitly forbids closing via `--update`, which would grandfather the regression into the baseline and disarm the guard.
**why-change:** Router's brief flagged all three signals; I narrowed to one after reading the job plane rather than the signal payloads.

### STEP po-S102 · po · 2026-07-31T17:52:41Z
**task-id:** FIX-AGENT-BASH-GRANT-COVERAGE-GATE-FLOW-DEMANDS-VS-FRONTMATTER
**what-done:** Ruled the digest-predict "no Bash" report a 4th-occurrence structural class and minted a root-cause opt-IN coverage gate instead of a 4th per-agent grant.
**what-considered:**
- Mint FIX-DIGEST-PREDICT-NO-BASH-GRANT, matching the 3 existing point-fix rows.
- Fold into FIX-COWORK-BASH-GRANT-COVERAGE-STAMP-TRANSPORT (already in review).
- Mint the gate that makes flow-demands-Bash ⇒ frontmatter-grants-Bash checkable.
**why-decision:** Fleet scan of all `tools:` lines found 8 Bash-less agents and 4 of them carry dirty uncommitted notebooks right now — the point-fix cadence is whack-a-mole and the two shipped point fixes are BOTH still stuck in review awaiting a live cycle. Folding into the review row is worse: it is already implemented, so re-scoping it would strand a finished deliverable. AC-2 forces opt-IN derivation because several of the 8 (idea-forge, market-analyst, qa-responder) are probably correct Bash-free and a blanket grant would widen the tool surface for no reason.
**why-change:** Report asked only for digest-predict's grant; I scoped up after the fleet scan showed the class, per the recurring-bug bar.

### STEP po-S103 · po · 2026-07-31T17:52:41Z
**task-id:** TE-T21
**what-done:** Ran the mandatory manual-dispatch sweep, re-verified TE-T21's premise live, stamped it, and folded it into this tick's BATCH.
**what-considered:**
- only: stamp the top-ranked candidate as the sub-flow prescribes.
**why-decision:** TE-T21 ranks first by [priority, idx] among 17+ DRS-stranded candidates and its premise is still true — `.claude/skills/task-lock/SKILL.md` measured 283L this tick, so the row is not silently already-satisfied.
**why-change:** no change from plan.

### STEP po-S104 · po · 2026-07-31T22:57:02Z
**task-id:** FIX-CI-SIZELINT-TECHANALYSIS-ROUTER-NEW-OFFENDER-143L
**what-done:** Minted the ci_red row for router.go (143L>120L) after the mandatory pre-dedup failing-file read + 5-lane file-scoped dedup returned zero matches on the 3rd consecutive tick this defect fired.
**what-considered:**
- Dedup into FACTORY-TECHANALYSIS-fix-discarded-service-and-port (review), whose commit 39fbec098 caused it — rejected.
- Amnesty as "already-triaged, prior ticks saw it" — rejected by the ANTI-AMNESTY FENCE.
- Mint a new file-scoped FIX row — chosen.
**why-decision:** The fence is explicit that pre-existence with no MATCHED row is a fabricated disposition. PRIMARY (dedup_key), SECONDARY (check_id/head_sha) and a broad /technical-analysis|size-lint/ sweep across all 5 non-terminal lanes each returned zero. The causing row is a different deliverable with a different gate; folding a CI-red into it would strand the red behind an unrelated qa verify.
**why-change:** no change from plan.

### STEP po-S105 · po · 2026-07-31T22:57:35Z
**task-id:** FIX-CHEF-EVENING-L5-KINHDICH-SILENT-OMISSION
**what-done:** Adjudicated TNB c121's fold-vs-new-row request by reading the evening synthesis JSON at source; refuted its premise and folded the finding here as an AC refinement.
**what-considered:**
- New HIGH data-integrity row for fabricated hexagram narrative (TNB explanation b) — rejected.
- Fold into FIX-CHEF-L6-TOKEN-PERSISTENCE-RECURRING (TNB explanation a) — rejected.
- Fold here with a corrected premise — chosen.
**why-decision:** TNB asserted the JSON holds ZERO hexagram fields; the file (89L, read in full) carries Kinh Dich content in 4 places, including NVL "Tap Kham reversal -100%" verbatim at :52 — the exact claim called unbacked. Fabrication is refuted, so (b) dies. It is not an L6 token, so (a) is mis-scoped. The true residual is gap-token OVER-SCOPING, which is this row's own subject.
**why-change:** Adjudicated against the artifact rather than the relayed report, per the standing "verify at source, not on a relayed verdict" rule.

### STEP po-S106 · po · 2026-07-31T23:02:12Z
**task-id:** FIX-BCTC-INGEST-PERIOD-IDENTITY-UNVALIDATED-VS-CONTENT
**what-done:** Attached live post-ship evidence (12 quarantines / 23.5 min / 10 tickers / 0 stores) instead of minting a row for the 9+ BCTC Telegram notices.
**what-considered:**
- Treat the notices as the guard working correctly and skip — rejected.
- Mint a new FIX row for the quarantine storm — rejected.
- Annotate this row with the rate + skew data for qa — chosen.
**why-decision:** A 0% pass rate is a suspect validator, not a proven guard, and the supplied period never once wins with margins up to 68:2 — but this row already owns that exact mechanism and is unverified in review, so a second row would fragment one defect. Root-causing the detector is dev/qa work, out of PO scope, so the Q1->Q4 balance-sheet-comparative explanation is recorded as a labelled hypothesis with a cheap decisive test, not a verdict.
**why-change:** no change from plan.

### STEP po-S107 · po · 2026-07-31T22:57:13Z
**task-id:** TE-T14
**what-done:** Ran the mandatory manual-dispatch sweep; re-stamped TE-T14 under the bounded re-admission branch and folded it into this tick's BATCH.
**what-considered:**
- only: stamp the top-ranked candidate as the sub-flow prescribes.
**why-decision:** TE-T14 ranks first by [priority, idx] among 41 candidates; its prior stamp (2026-07-31T16:04:37Z) aged past the 4h staleness window without reaching dispatch, which is exactly the re-admission case flag_reentrant exists to catch.
**why-change:** no change from plan.

### STEP po-S108 · po · 2026-08-01T00:53:56Z
**task-id:** (ambient — dev-team Step 1 triage, tick 2026-08-01T00:37Z)
**what-done:** Ran both mandatory pre-checks; supervised-goahead `should_hold=false` (head `FIX-MACRO-SNAPSHOT-HUMANIZE-TEXT` is not `effective_supervised`) → no-op; manual-dispatch sweep returned 40 candidates, stamped `TE-T21`.
**what-considered:**
- Mechanical top-of-list = `TE-T21` (P1, rank 1, idx 27, `reflag:true`)
- Override to `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN` (P1, rank 1, idx 42) as higher-leverage on a rank tie
**why-decision:** Took `TE-T21`. Its `reflag:true` is the FIRST live exercise of the bounded re-admission branch shipped 07-31 (`FIX-PO-MANUAL-DISPATCH-SWEEP-FLAG-WITHOUT-DISPATCH-STRANDS-ROW`) — prior stamp 2026-07-31T17:52:41Z aged past the 4h window without ever reaching dispatch. Skipping it would re-create the exact permanent-strand bug that fix cured, on that fix's own first test case. Routes to `agent-father` (`.claude/skills/`), so it does not contend for the occupied dev WIP slot.
**why-change:** no change from plan.

### STEP po-S109 · po · 2026-08-01T00:53:56Z
**task-id:** FIX-BCTC-INGEST-PERIOD-IDENTITY-UNVALIDATED-VS-CONTENT
**what-done:** Refuted the prior tick's own leading hypothesis from data already in hand, logged storm growth 12→23 quarantines / 13 tickers, and found an 11-of-13 cohort overlap with `FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP`. Evidence appended to both rows; no mint.
**what-considered:**
- Mint a producer-side row for the wrong-URL/period association
- Attach to the two existing owner rows and cross-link them
**why-decision:** Attached. The opening-balance hypothesis predicts detection of Q4-of-PRIOR-year; five instances (FRT/DXG/DIG/GEX/DBC 2024-Q1) detect Q4-of-SAME-year, so it is falsified without a probe. The real signature — detected period NEVER earlier than supplied — is fetch-side, and is the same residual `po_corroboration_20260728` already recorded as UNVERIFIED on this row. Producer prior art already exists three ways (`BCTC-HIST-VPS-BACKFILL`, `BCTC-ENRICHER-OLD-QUARTERS`, `FU-CTG-DISCOVERY-FILENAME-FILTER`); a 4th row fragments one defect across four.
**why-change:** Prior tick routed the correct/broken decision to qa. That actuator is dead (see po-S110), so I resolved what was resolvable from evidence instead of re-deferring.

### STEP po-S110 · po · 2026-08-01T00:53:56Z
**task-id:** FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL
**what-done:** Escalated review-lane QA-drain starvation from throughput complaint to UNBLOCK, on evidence it is now load-bearing on live data corruption. Single BATCH entry.
**what-considered:**
- Leave out of scope per spawn prompt
- Dispatch the `architect` design row `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN`
- Dispatch qa directly at the already-shipped Part-1 row, bypassing the starved picker
**why-decision:** Third. The starvation is circular: 202 review rows carry `next_agent:qa`, and the remedy is itself inside them — Part 1 (`9fe706fa2`, verified real, script-only, size S, no depends) has sat unverified ~26h. Meanwhile `FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP` ("ACTIVE + SPREADING") has sat 10.3 days while its generator still emitted three `total_assets=0` writes tonight, one aimed at a known-good row. PO BATCH → dev-team Step 3 is the one dispatch path that does not traverse the starved picker; verifying Part 1 is what makes that picker safe to run at all. Designing more (option 2) ships nothing.
**why-change:** Spawn prompt flagged this out of scope "unless you judge it now warrants escalation" — the corruption evidence is new tonight and changes that judgement.
