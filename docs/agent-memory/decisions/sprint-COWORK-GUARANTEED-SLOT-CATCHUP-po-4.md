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
