# Decision Journal — Sprint FLOW-PRICE-ALPHA-LOOP · po

**Sprint goal:** FLOW-PRICE-ALPHA-LOOP — flow+price alpha loop; this task = CI-RED-29f92c5b merge-gate unblocker (bidirectional daily_ohlcv_with_flow view, Shape A).
**Agent:** po
**Started:** 2026-07-13T21:51:55Z

---

### STEP po-S1 · po · 2026-07-13T21:51:55Z
**task-id:** FIX-DAILY-FF-VIEW-JOIN-ANCHOR
**what-done:** FINAL merge-gate signoff = APPROVED (sole CI-RED-29f92c5b unblocker); recorded PUSH_READINESS=ready — push is USER-GATED, NOT executed.
**what-considered:**
- APPROVE — supervised cascade complete, every gate RAW-verified GREEN by me
- HOLD — no unresolved blocker; holding would needlessly strand the whole pre-push fleet
**why-decision:** Independently re-ran the merge-gate pair POST qa-commit → 20 pass/0 fail/85 expect (zero drift); the 2 RED-by-design gate assertions in daily-foreign-flow-integration.test.ts pass; qa commit 8e905c31d scope = 3 docs only (no prod/test/orch); dev impl d71f45949 = 1 infra/db file (schema-market-data.ts, DDD PASS) + companion schema test; CI baseline GREEN thru 07-12, 29f92c5be first-red = this same gate freeze. Nothing left to fix.
**why-change:** no change from plan — tick-20:07Z triage predicted "land the view fix → flips the 2 gates GREEN", it did. Board move + chain-mutex lock release + `git push origin main` all DEFERRED: router owns the board/lane move + chain-mutex row lock; push is USER-GATED (record readiness, surface the single user action, never self-push).

### STEP po-S2 · po · 2026-07-15T04:55Z
**task-id:** ALPHA-S2-RAG-FTS-REBUILD-CRON
**what-done:** Triaged RAW-verified qa-BLOCK → parked ALPHA-S2 BLOCKED (in_progress→backlog) behind 2 minted P1 blockers; NOT a code defect (35cc8cd56 clean/on-main), so no fixer round on this row.
**what-considered:**
- Path #2 stream/chunk `_build_fts_index()` = the ONLY corpus-size-independent root fix (corpus 14k→56k in ~5wk and growing) → minted RAG-FTS-BUILD-MEMORY-BOUND (dev-rag-service).
- Path #1 raise 768m mem-limit (ops/user-gated) — REJECTED as standalone: alone it does NOT unblock (250s>90s deadline is memory-independent) + can't be sized until the rebuild footprint is reported → folded into the rootfix DoD as a possible belt-and-suspenders.
- Path #3 deadline retune — provably insufficient alone; folded into ALPHA-S2's own remaining mcp-server tail (retune to reported steady-state + margin).
- Latent landmine: cron code is already on main → next mcp-server redeploy arms a nightly 20:15Z rag OOM → minted ALPHA-S2-RAG-FTS-CRON-SAFETY-GATE (dev-mcp-server, default-off enable flag, RUN-NOW/independent) so "parked BLOCKED" actually enforces non-deployment.
**why-decision:** Deploying as-is = nightly service-wide RAG/search outage, strictly worse than the silent BM25-staleness gap it fixes; the fix must be corpus-size-independent, so root-cause (rag capacity) + a real disarm gate beat any band-aid. Re-scoped the brief's 14k premise → 56k+/growing.
**why-change:** no change from qa's routing intent (architect/ops, not fixer) — refined it into 2 zoned, DAG-ordered backlog rows + a parked dependency instead of one vague hand-off.

### STEP po-S3 · po · 2026-07-15T20:06:07Z
**task-id:** UC-CCA-P3
**what-done:** Escalated signal cow-20260715T195545 HIGH→CRITICAL on CONFIRMED user-visible MARKET double-publish (932+933); promoted UC-CCA-P3 → P0 umbrella, BLOCKED its 2 children onto it, minted 1 router row. No duplicate signal minted.
**what-considered:**
- Mint a new FIX row for the marker release — REJECTED: `FIX-CHEF-PUBLISHED-MARKER-RELEASE` already exists (BACKLOG since ~07-02, its own title records 2x sightings). Not a knowledge gap; 13d prioritisation starvation in a 395-row backlog.
- Ship the S-size point patch (delete the release) as stop-the-bleeding — REJECTED: alone it REGRESSES the 07-03 leak (early Step-0.5 claim ⇒ silent exit leaves a marker asserting a phantom publish, suppressing next dish ≤28h).
- Doc-only "NEVER release" line in chef.md — REJECTED: memory lesson `feedback_chef_leaks_published_marker_on_silent_exit` (auto-injected) says the OPPOSITE; two contradictory instructions ⇒ prose fix is non-deterministic by construction. That lesson, not any flow doc, is the traced release source.
- Block-as-poison per recurring-bug rule — REJECTED per `feedback_recurring_detection_vs_recurring_failed_fix`: discriminator is completion artifacts, and ZERO fixes ever landed ⇒ rule says DISPATCH at P0.
**why-decision:** The pendulum (07-02 dbl → 07-03 fix → 07-03 leak → 07-15 dbl) proves the halves oscillate when shipped apart, so they ship as ONE P0 unit. Deeper root cause than the release: marker claimed at chef.md L32, ~650L before send_telegram — claiming before the publish decision is what forces the conditional-release rule agents keep inverting. Recommended (non-binding) two-phase read-only-probe→late-claim, which removes the conditional entirely, + a code-enforced `^published:` guard at the single `releaseTask()` choke point since prose gates failed 3x.
**why-change:** Task framed it as escalate-existing-row; kept that, but triage found the fix was already minted 3x — so the product problem is starvation/oscillation, not diagnosis. Rescoped UC-CCA-P3's own "release-on-no-publish" clause as insufficient (it encodes only the 07-03 half).

### STEP po-S4 · po · 2026-07-16T11:59Z
**task-id:** UC-ASL-P6
**what-done:** Converged the 3-tick BOUNDED-1 churn by stamping supervised:true on UC-ASL-P6 ONLY; minted FIX-DEVTEAM-BOUNDED1-MAINTLANE-NEXTAGENT-GATE (next_agent=developer, dev-routable) as the durable class fix.
**what-considered:**
- Re-groom next_agent again — REJECTED: my 10:37Z groom (next_agent=agent-father) was necessary-but-insufficient; agent-father is maintenance-lane on-demand-only + zone-detect (cross-service→Tier-3 developer) cannot route to it, and the NON-DEV-NEXT_AGENT promote gate only fires when board next_agent is NULL, so a non-null maintenance next_agent promotes cleanly.
- Bless developer as owner — REJECTED: wrong owner for the auditor-flow-doc+SKILL factory work (the exact harm the original withhold prevented).
- supervised:true on the whole band — REJECTED: the other 4 P1 rows (UC-SDF-P4/UC-GCP-P2/UC-GCP-P4→developer, UC-MDH-P1→dev-mcp-server) ARE zone-detect-reachable and safely auto-launchable; supervising them stalls real progress.
**why-decision:** supervised:true on the ONE maintenance-lane row ends the per-tick churn AND unblocks the rest of the band next BOUNDED-1 tick (stopgap). The durable gate keys off effective board-OR-detail next_agent ∈ maintenance roster so no future maintenance-next_agent row needs a hand-stamped stopgap.
**why-change:** Signal sharpened the 10:07/10:37 finding with two code-grounded mechanisms (on-demand-only + zone-detect-unreachable); supervised + class-gate is the convergence the prior groom lacked.

### STEP po-S5 · po · 2026-07-16T11:59Z
**task-id:** FIX-CHEF-MIDFLOW-BAIL-DETERMINISM
**what-done:** Split the chef-eod handoff into 2 root causes: annotated UC-CCA-P3 with the 07-16 ABORT-AFTER-CLAIM marker recurrence (no dup); minted FIX-CHEF-MIDFLOW-BAIL-DETERMINISM (supervised, next_agent=agent-father) for the distinct execution-bail.
**what-considered:**
- Mint a new marker-hygiene FIX row — REJECTED: UC-CCA-P3 (P0, supervised) already fixes the class; its two-phase gate (read-only probe→late claim) makes a mid-flow bail leave NO marker by construction (satisfies AC-2). Annotate as 4th corroboration, do not duplicate.
- Clear the leaked published:chef-eod:2026-07-16 tombstone + force same-day retry — DECLINED: marginal value (near-identical dish id 952 @07:27Z already covered EOD-ish state; ~4h post-close; execution bug unfixed ⇒ re-bail likely), marker gates only the 07-16 key and auto-expires 07-17T12:52Z (tomorrow uses a new key), and clearing a live publish marker is an ops/cowork remediation — not done blind by PO.
- Skip the execution-bail (1st occurrence, could be LLM noise) — REJECTED: chef.md HAS a degraded-floor rule the agent overrode; minting the anchor row now lets a 2nd occurrence escalate per feedback_recurring_bug_escalation.
**why-decision:** Two distinct roots need two distinct owners; the marker root is already P0-owned, the bail root needs a durable first-occurrence anchor. Both are maintenance-lane ⇒ supervised, deliberate-dispatch only.
**why-change:** No change from the handoff's own two-issue split.

### STEP po-S6 · po · 2026-07-17T17:24Z
**task-id:** FIX-OHLCV-DEPTH-ALERT-HONEST-GAP-SUPPRESS
**what-done:** Folded Telegram report 3505 (analysis-agent OHLCV-BACKFILL "no completion report / VPS-crash suspected") as `duplicate` — RAW-verified FALSE alarm, 3rd recurrence of the report-3504 class; already covered by in-REVIEW FIX. No mint, no ops route, head untouched.
**what-considered:**
- Route-to-ops (report says "Manual VPS investigation required") — REJECTED: 3-plane RAW-verify all green — VPS proxy prices ok/0-err/not-stale, `vn-price-fetch` alive (polled 2m ago, idle=market-closed), pipeline backfill queue pending=false + last-completed 2026-07-17T15:50:13, HPG/VCB serving a fresh 07-17 bar, ~766-row depth TA-ready fleet-wide. Nothing to investigate; VPS healthy.
- Mint a new dev FIX — REJECTED: identical mechanism/emitter to report 3504 (08:37Z) which already produced FIX-OHLCV-DEPTH-ALERT-HONEST-GAP-SUPPRESS (REVIEW, owner=dev-mcp-server, next=qa). Emitter still fires because that fix is pre-deploy; the rows=0/low tickers (BDI/JSH/SIS/VDC/DLC) are exactly the honest-gap delisted codes that FIX targets, not crash evidence. Minting would duplicate an owned row.
**why-decision:** Ground truth contradicts the report's prose (poller force-closed the queue row at retry=5 with bars_inserted=NULL; work completed). Correct disposition of a false alarm covered by an in-review fix = fold `duplicate`, keep it out of the unresolved pool so it stops re-triggering triage each tick.
**why-change:** No change from dispatcher's fold-first hypothesis; RAW-verify confirmed it.

### STEP po-S7 · po · 2026-07-18T16:56Z
**task-id:** FIX-CI-GOLANGCI-CONFIG-VERIFY-NETWORK-FLAKE
**what-done:** Minted a PLAN-ONLY P2 backlog FIX (zone cross-service/, next_agent=ba) for the recurring golangci-lint-action v7 `config verify` live-schema-fetch timeout that false-reds CI; NO dispatch (WIP=18 over cap; anomaly→BACKLOG invariant). Head untouched.
**what-considered:**
- WATCH (2 obs, non-blocking now) — REJECTED: not a degenerate single-obs — 2 identical-signature obs + a DETERMINISTIC root RAW-confirmed at source (ci.yml uses action@v7.0.0 on all 6 Go-lint jobs; v7 fetches golangci-lint.run/…v2.0.jsonschema.json live). Recurring-bug 2+→track (feedback_recurring_bug_escalation). Forward risk = false-red a real CODE push → red-prepush-strands-fleet. Not cosmetic ⇒ track, don't WATCH.
- Dispatch a dev now — REJECTED: WIP ready17+in_progress1=18 ≥ cap; anomaly→BACKLOG is PLAN-ONLY by invariant. ba/architect own final HOW.
- Priority P3 — REJECTED: false-red on a code push can strand a real change (above cosmetic). P0/P1 — REJECTED: non-blocking now (obs#2 red was docs-only, stranded nothing), CI-infra not live-serving. P2 fits.
- Zone dev-mcp-server (router hint) — REJECTED: fix lives in repo-root .github/workflows/ci.yml, not apps/mcp-server/ → cross-service/ per CLAUDE.md (routes to generic developer).
**why-decision:** Independent grep (board/handoffs/signals) = 0 prior row; mechanism confirmed at source, forward risk real ⇒ mint a lean plan-only row so a real fix (vendor/pin schema local, or skip verify) is scheduled without stranding a live dev slot.
**why-change:** Adopted router root-cause + candidate approaches; overrode router's zone hint (cross-service/, not dev-mcp-server) after confirming the file is repo-root.

### STEP po-S1 · po · 2026-07-18T19:39:23Z
**task-id:** CWO-T4-P0-TUSTATS-PERAGENT
**what-done:** Triaged agents-architect brief §2c/§8-Phase0 into a SPRINT-XS backlog row (P3, size XS, zone apps/mcp-server/) routed BA→architect→pm→dev-mcp-server→qa.
**what-considered:**
- P0/P1 (jump queue) vs P3 (low) — chose P3: brief §2c explicitly says pilot runs in degraded mode, not a blocker; it is only the §7-G5 graduation gate for a future permanent-cron ask.
- Immediate BATCH spawn vs backlog-append — chose append: non-urgent, must not jump the live P0 rows (UC-CCA-P3, UC-RDL-P1).
- zone apps/mcp-server/ (single) vs multi — chose single: the 2 docs/standards files document this server's own tool-call contract; dev-mcp-server owns the unit.
**why-decision:** Real, verified (grep _callerAgent=0 hits, 3 cited files exist), well-scoped additive/back-compat code work, but explicitly non-blocking — P3 backlog is the correct disposition.
**why-change:** no change from architect's Phase-0 scoping; encoded the mandatory QA gate-proof (wrong-agentId no-misattribution) into the row note.

### STEP po-S9 · po · 2026-07-18T20:56:16Z
**task-id:** FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING (+ 2 co-minted; t4p1-001/002 signal triage)
**what-done:** RAW-verified TNB-c113 findings + 2 signal_queue rows; minted 3 PLAN-ONLY backlog rows (no dispatch, WIP>cap), dedup'd t4p1-002→CWO-T4, folded t4p1-001 + F-L2.
**what-considered:**
- t4p1-002: re-mint vs dedup — dedup: CWO-T4-P0-TUSTATS-PERAGENT already covers identical byAgent scope; stamped origin_signal_id for archive back-flip.
- t4p1-001: mint retrofit vs fold — fold: LOW-sev cosmetic, 45-agent retrofit = churn + HIGH false-green (presence≠plausibility); approved only fwd-looking dev-standards template.
- F-L6: fix-row now vs isolation-first — isolation-first: root cause (persist-step vs narrative-gen) unresolved until c114 probe; minted as investigation, not premature code fix.
- F-BIZCTX: fold vs mint — mint P1: verified NEGATIVE (dish persisted [gap:business_context_absent] despite gathered data), genuine new HIGH, na=ba to trace GATHER→conviction wiring.
**why-decision:** anomaly→BACKLOG PLAN-ONLY (WIP=18≥cap1); mint only genuinely-new+RAW-verified findings, dedup/fold the rest to avoid board churn.
**why-change:** router named 2 mint candidates; added a 3rd (F-L6) on recurring-class escalation (3 cycles, 2 failed auto-cures) but scoped it isolation-first to respect isolation-probe-before-fix.

### STEP po-S10 · po · 2026-07-19T20:31:00Z
**task-id:** GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST (REVIEW→BACKLOG reject; + 2 annotated)
**what-done:** RAW-verified TNB-c114 chef-persist finding, root-caused it to a write-AUTHORIZATION cascade gap (not a write bug), rejected the review row to agent-father; ZERO new rows minted.
**what-considered:**
- Adopt TNB's ask (broaden L6 row to "trace Step 7.6 write reliability") — REJECTED: chases a non-existent bug. Step 7.6 logic is sound + has a post-write verify clause; the write is REFUSED, not failed.
- Mint a new FIX row for the synthesis-JSON class — REJECTED: `GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST` (the row that SHIPPED Step 7.6 on 07-10) is still in review[] gated on live-cycle-verification since 07-11 and was never signed off. Its ACs are demonstrably unmet → reject in place, conservation-neutral (546→546).
- Diagnose as tool-grant gap like tran-ngoc-bau — REFUTED: `.claude/agents/unified-agent.md` L5 DOES grant Write. Defect is L4's "No other filesystem writes permitted" (2026-05-19) contradicting Step 7.6 (2026-07-10) + init.md carrying no docs/data/ allowlist. Absent-tool vs present-but-forbidden = different mechanism, same agent-father owner → fold into live pass, do not duplicate.
- Mint a filename-determinism row — REJECTED: FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING (P1) already names "chef synthesis: date_vn+dish_type"; annotated with the new audit-plane harm instead.
**why-decision:** model:haiku + self-contradictory system prompt ⇒ non-deterministic refusal, which uniquely explains the c111–c114 intermittency that 2 auto-cures failed to converge; agent self-reported in permission language ("tool limitation") while its MCP publish path worked the same cycle.
**why-change:** router asked me to keep grant-mismatch and persistence-bug separate — evidence resolved it to grant-side only, so the persistence-bug branch was closed rather than carried; L6 row set BLOCKED on the cascade fix to stop a false narrative-gen verdict.

### STEP po-S11 · po · 2026-07-20T22:11:26Z
**task-id:** FIX-CMH-OBSOLETE-FILE-CLEANUP (BACKLOG mint + design brief → agent-father)
**what-done:** Scoped user request "add clean obsolete file to system audit cron" to a Pass 0b on claude-manager-helper (cron 77876d96); minted 1 CLEAN backlog row + design-brief handoff; conservation 553→554 OK.
**what-considered:**
- Owner = system-auditor vs claude-manager-helper — chose CMH: it owns Pass 0 relocation and is the mutating janitor; system-auditor is read-only.
- Let the pass delete stale `docs/signals/*.json` (router's evidence listed them) — REJECTED: signal lifecycle is already owned by dev-team drain-signals.md (move→processed/→7d prune). Deleting there races the drain and risks undrained-signal data loss. Made signals DETECT-ONLY (>50 ⇒ DRAIN-BEHIND BUG flag).
- Blind `rm` of untracked garbage — REJECTED for a quarantine-first design (move to gitignored `.trash/<date>/` + manifest, dry-run default, allow-list opt-in per pattern, tracked-file guard).
- Full BA/architect chain — REJECTED: contained hygiene edit (flow + policy + coupled audits script), fully specified in brief → single implementer agent-father.
**why-decision:** deletion is destructive; the only defensible design bounds it by explicit allow-list (unexpanded-var names, aged `*.tmp`, superseded synthesis snapshots) + hard NEVER invariants + quarantine recovery window, and defers all signal retention to the existing drain owner.
**why-change:** router suggested deleting stale signals directly; I narrowed that to detect-only after confirming drain-signals.md is the canonical retention owner (prevents a second, racing lifecycle owner).

### STEP po-S12 · po · 2026-07-21T14:24:48Z
**task-id:** FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE (converge mint) + signal_queue drain (40 rows NEW→triaged)
**what-done:** Drained 40 NEW system-auditor→po rows (po-s147, orch-apply conservation 556→557 OK): folded 26 A-20/A-11/A-15→PDF-AVAIL-02-FIX, 7 A-12→SPIKE-DASHBOARD-TIER-HEALTH-CURL-ERR-FLAP (+7 origin ids), 5 A-30→FIX-MCP-MEMORY-CODE-LEAK as corroboration (NO dup mint); minted 1 converge predicate-tune fix; folded queue-collapse+tally into FIX-SIGNALQUEUE-DUP-ID-GUARD.
**what-considered:**
- Fold the A-cluster an Nth time (no mint) — REJECTED: ~30 cycles this session, past the 3rd-tick convergence bar → churn-without-convergence; router spawned with explicit CONVERGE directive.
- Mint the predicate-tune as an improvement_proposal doc — REJECTED: board already tracks auditor-predicate fixes as backlog FIX rows (FIX-AUDITOR-C11-*, -TASKBOARD-OVERFLOW-*); consistency + concrete verification gate ⇒ backlog FIX, owner=architect.
- Escalate A-30 to ops / recommend restart — REJECTED: 5 samples 94.43→88.81% reclaimed-from-peak, in 85–93% band, no OOM, tripwire untripped; restart destroys trajectory evidence for zero OOM benefit.
- Sweep the 41st NEW row (po→unified-agent methodology-flag) — REJECTED: not system-auditor→po; different flow, left NEW.
- Mint a backlog for the 2 single-occurrence B-02/B-06 data_stale rows — REJECTED: never re-emitted across ~16 cycles → self-resolved transient (single obs ≠ mechanism).
**why-decision:** predicate-tune (A-30 loss-of-reclamation/OOMKilled gate; A-12 debounce; A-21 windowed) + dedup-suppression stops the FP re-emission AT SOURCE while the hard_constraint PRESERVES the E-3 append-always ledger (never skip a genuine anomaly) and genuine_tripwire keeps real OOM firing.
**why-change:** detection-only per constraints — I dispose (drain/fold/mint), I do NOT deploy; pdf-extractor rebuild + mcp-server restart stay user-gated and were NOT recommended as my action.

### STEP po-S148 · po · 2026-07-21T14:51:20Z
**task-id:** FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP
**what-done:** Minted after verifying bctc-analyst's 4-cycle escalation on 4 independent planes (file-bus, Telegram BCTC-1345b, get_bctc_full DGC=corrupt, get_earnings_calendar=16 flipped NGAY NOP).
**what-considered:**
- Fold onto an existing BCTC row (12+ adjacent rows exist)
- Mint new — no row covers the ACTIVE reprocess writing back corrupt data + a falsified filing date
**why-decision:** Adjacent rows are remediation-of-victims or validation-gate gaps; none targets the running writer. Folding would have left the bleed untracked while repairs got re-corrupted.
**why-change:** Escalated beyond the dispatcher's brief, which flagged only the 2 dashboard signals; the file-bus escalations were the larger finding.

### STEP po-S149 · po · 2026-07-21T14:56:33Z
**task-id:** FIX-OHLCV-HISTORY-PLANE-EMPTY-LIVE-PLANE-HEALTHY
**what-done:** Verified digest-predict's Sunday report live on Tuesday mid-session before minting: correlation 0 codes (worse than the reported 2) while get_market_snapshot returned full healthy data.
**what-considered:**
- Skip as weekend artifact (report was Sunday-dated, market closed)
- Mint — live re-test during market hours ruled the artifact out and showed worsening
**why-decision:** The market-hours re-test is what separated a real regression from the known market-hours-blind FP class; without it this was a plausible skip.
**why-change:** no change from plan

### STEP po-S150 · po · 2026-07-21T14:51:20Z
**task-id:** CLEAN-COWORK-DISPATCHER-TELEMETRY-DRAIN-DIR
**what-done:** Escalated in place (low→high) + absorbed 2 duplicate rows to archive as CANCELLED; also repaired a dangling payload_ref that was hard-blocking every orch-state write, and minted FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE.
**what-considered:**
- Mint a new row for the dev-team follow-up as asked
- Escalate the existing row — grep found 4 overlapping rows already
**why-decision:** A 5th row on a class already tracked 4x is the churn-without-convergence pattern; the new information was severity (guard now a dead detector), not a new problem.
**why-change:** Dev-team offered two dispositions; chose both halves as sequenced acceptance criteria, since the guard-side fix alone leaves the floor growing.

### STEP po-S151 · po · 2026-07-21T15:45:15Z
**task-id:** SPIKE-BCTC-Q1-2026-SERVABILITY-CENSUS
**what-done:** Adjudicated the dev-team BCTC scope_escalation — held FIX-BCTC-REPARSE sharp (mode-1 only), rejected ops's self-contradictory SERVABLE column as baseline, minted a serving-path census SPIKE, deferred the epic-vs-fold remediation decision to its output.
**what-considered:**
- Widen the in-flight reparse FIX to cover the full ~40/58 unservable set
- Mint a remediation epic now
- Mint a measurement-first census SPIKE and defer the scope decision
**why-decision:** Ops numbers cannot be trusted (29 servable + ~40 unservable of 58 is impossible; wrong on 3/4 router-sampled), so no remediation could be correctly sized yet; the 3 failure modes already have 3 existing homes, so the ONLY missing artifact was a reliable per-ticker census — measure first, scope after.
**why-change:** Router asked "separate row / epic / widen" — picked "separate SPIKE + defer" because widening dilutes an actively-bleeding fix and an epic on bad numbers is speculative over-mint.

### STEP po-S152 · po · 2026-07-21T15:54:05Z
**task-id:** SPIKE-BCTC-Q1-2026-SERVABILITY-CENSUS
**what-done:** Adjudicated the router scope_correction (devteam-…154949) — narrowed the census SPIKE to only group-3 {NVL,SSI,VCI,HCM}+completeness (groups 1+2 already classified), recorded the 6-day-idle as an instance of the known 4-loop stall (no new mint), and set pdf-extractor recovery as the verification-gate sequencing long pole.
**what-considered:**
- Mint a new row for group-3 + a new row for the 6-day-idle loop defect + an epic
- Fold group-3 into the existing SPIKE, log the idle as corroboration, annotate sequencing — no new mint
**why-decision:** Group-3 is 4 tickers (a row is overkill), the idle defect is already tracked by the 4-loop audit (a 5th mint = churn), and the verification-gate argument only needs a sequencing note — three annotations beat three mints.
**why-change:** Correction narrowed the original open-ended ask into 3 concrete questions; answered each with the minimum durable artifact.

### STEP po-S153 · po · 2026-07-21T16:49:57Z
**task-id:** FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP
**what-done:** Reconciled my own self-contradictory row — replaced acceptance(3)+gate(b) (both demanded remediating the 16, which the row disowns) with a mechanism-only two-arm write-back suppression gate; attributed all 16 tickers to pre-existing rows; set next_agent=ops on the blocking ingest-stall row.
**what-considered:**
- Uphold QA's FAIL and let dev-mcp-server chase a repair it structurally cannot perform
- Widen this row to own the ingest + the remediation of the 16
- Fix the gate to match my 15:37Z narrowing, and unblock the ingest-stall row separately
**why-decision:** 13/16 tickers need an ingest owned by a DIFFERENT row (filed 07-15, next_agent NULL, 6 days idle), so the old gate made row A unsatisfiable by its own owner — a guaranteed churn loop; the mechanism half is fully testable with zero ingest dependency, and gate arm (b2) is a genuinely unfixed defect the shipped guard misses.
**why-change:** Router asked only to reconcile the gate; the cohort probe went further — harm (a) "overwrote good financials" has ZERO confirmed instances across all 16, so I re-pointed the gate at the transition that actually occurred (absent -> manufactured zero-row).

### STEP po-S154 · po · 2026-07-21T17:24:33Z
**task-id:** FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD
**what-done:** Parent -> BLOCKED in backlog (next_agent pm->po, depends=[HOOK,SKILLS]); promoted both children backlog->ready.
**what-considered:**
- Leave parent READY/next_agent=pm — rejected: dispatcher re-spawns pm, duplicate decomposition
- Delete next_agent — rejected: that is the orphan signature that idled the predecessor 6 weeks
- Leave children in backlog — rejected: pm left them BACKLOG in a 409-row lane, they would never dispatch
**why-decision:** Parent must track not dispatch; children carry the work and were fully specced, so promotion is the actual unblock.
**why-change:** Router deferred lane disposition to PO; children promotion was not in the brief but the decomposition stalls without it.

### STEP po-S155 · po · 2026-07-21T17:24:33Z
**task-id:** FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH
**what-done:** Traced the ready-lane asymmetry to root cause and minted a P0 write-path FIX, no backfill.
**what-considered:**
- Backfill from git/mtime — rejected outright, signal's explicit do-not; fabricated ts is worse than null
- Patch the 30+ ad-hoc jq transforms — rejected: same omission recurs on transform #31
- Stamp diff-based in scripts/orch-apply.sh — chosen
**why-decision:** orch-apply.sh is the single mandatory gated write path and has zero updated_at handling; schema has it .optional() so omission validates clean. Fixing the chokepoint makes omission structurally impossible.
**why-change:** Signal asked PO to find WHY; the asymmetry resolved (ready lane populated by coincidence of recently-touched transforms, not by a correct path).

### STEP po-S156 · po · 2026-07-21T17:24:33Z
**task-id:** FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW
**what-done:** Ratified option (b) — exclude FAILED rows with zero unprocessed windows — and minted P0.
**what-considered:**
- (a) exclude all FAILED — rejected: strands transiently-failed reports with real remaining work, converts head-of-line bug into silent data loss
- (c) fix in slot prompts — rejected: pushes a data-layer invariant into N prompt strings, drifts on next slot
- (b) exclude FAILED-with-zero-remaining — chosen
**why-decision:** (b) fixes it once at the query and preserves retry; both refine slots are currently perpetual no-ops reporting successful fires.
**why-change:** no change from plan.

### STEP po-S157 · po · 2026-07-21T17:24:33Z
**what-done:** Minted 2 SPIKEs (cowork drain body; saturated count-threshold gate sweep) rather than fixes.
**what-considered:**
- Fix the cowork drain directly — rejected: 3 candidate causes need 3 different fixes, wrong one looks green and changes nothing
- Fix the two saturated gates in isolation — rejected: 2 instances in 1 tick in unrelated subsystems is a class
**why-decision:** Diagnosis must precede fix where the cause is genuinely undetermined; class sweep where the shape recurs.
**why-change:** no change from plan — router recommended the sweep, PO scoped it to inventory-only so fixes stay independently verifiable.

### STEP po-S158 · po · 2026-07-21T17:24:33Z
**what-done:** Closed news-scout from_agent=null HIGH as NOT-A-DEFECT; minted the real (smaller) fail-open bug instead; annotated prior-art row.
**what-considered:**
- Build the all-producers mode as filed — rejected: mode already ships and was verified live (94 rows)
- Mint nothing — rejected: the non-fatal branch turning transport failure into SIBLING_WINDOW_CACHE=[] is a genuine fail-open
- Mint a new all-producers row — rejected: FIX-AGENTSIGNALS-ALLPRODUCERS-NULLSTRIP already exists, annotated instead
**why-decision:** Prior-art grep before minting; the escalation was wrong-rooted but exposed a different, real defect one layer up.
**why-change:** no change from plan.

### STEP po-S159 · po · 2026-07-21T18:15:48Z
**task-id:** FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH
**what-done:** Waived updated_by from the orch-apply.sh chokepoint and amended acceptance (1) in the same write.
**what-considered:**
- [a] accept narrowed scope + amend text — chosen mechanism
- [b] mint follow-up threading caller identity — rejected: mandatory param on 30+ call sites, a forgotten token hard-aborts the board's ONE write path
- [c] drop as unattainable + record why — chosen substance
**why-decision:** Verified at source that per-row updated_by has ZERO readers (projectTask omits it; the dashboard's "Updated By" is head.updated_by; it is not in TaskSchema, only .passthrough(); all 30+ scripts/ hits are writers). Stamping it would also OVERWRITE 44 rows of rich caller attribution. updated_at is derivable at the chokepoint from clock+diff; updated_by is not — fabricating it is the falsification class the row's own do_not_over_correct bans.
**why-change:** Router declined to waive and escalated; waiving written acceptance is PO authority.

### STEP po-S160 · po · 2026-07-21T18:15:48Z
**task-id:** FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH
**what-done:** Ruled the disclosed lane-agnostic diff residue ACCEPTED, no follow-up.
**what-considered:**
- Accept as correct semantics — chosen
- Mint a follow-up to stamp pure lane moves — rejected: would make an untouched row look freshly worked
**why-decision:** updated_at serves "when did this row's SUBSTANCE last change"; a byte-identical relocation is not a substance change. Stamping it reintroduces in miniature the false-negative this row was minted to kill.
**why-change:** no change from plan.

### STEP po-S161 · po · 2026-07-21T18:15:48Z
**task-id:** FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET
**what-done:** Minted the one recommended row (HIGH, plan_only, next_agent=ba) with the product question answered by a reductio.
**what-considered:**
- Guard arm (b2) like storeReport() — rejected: proven to make the function a total no-op
- Fold into the parent row — rejected: PO scope-hold stands, QA and router both declined for that reason
- Mint plan_only to ba — chosen
**why-decision:** Re-read the file: totalAssets:0 at line 307 is a hardcoded literal and the ONLY assignment. With arm (b1) already blocking good-row overwrites, adding (b2) blocks 100% of writes — a guard that makes its own subject unreachable proves the WRITE TARGET is wrong, not the guard. Code's own comment at 254-259 already concedes it.
**why-change:** Filed HIGH not P0 — enableBctcFallback defaults false, recorded AS the containment.

### STEP po-S162 · po · 2026-07-21T18:15:48Z
**task-id:** DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING
**what-done:** Accepted architect's deviation from my (a)/(b)/(c), folded R3, released to pm with T6-first sequencing.
**what-considered:**
- Accept bounded-async variant of (b) — chosen
- Insist on a literal option — rejected: both brownfield facts verified true at source, they rule the literals out
- Mint a separate R3 row — rejected: already decomposed as T6/T7, would split one root cause across two owners
**why-decision:** Verified last-fired.md:10 (AC-P1-7-1, stamped at spawn not completion) and market-watcher/main.md:10-14 (wall-clock only, discards slot=). T6 sequenced first because it is market-facing DATA LOSS, has no dependency on T1-T5, and T3 is blocked behind the qa full-suite run anyway.
**why-change:** My options_for_architect explicitly did not pre-select; a better option was found.

### STEP po-S163 · po · 2026-07-21T18:15:48Z
**task-id:** SPIKE-COWORK-DRAIN-BODY-NOT-EXECUTING-ON-WORK-TICKS
**what-done:** Closed DONE (acceptance met) and folded remediation onto FIX-COWORK-STEP0A-TOPO-DRAIN-STATUS-CONTRACT.
**what-considered:**
- Dispatch as filed — rejected: pure churn, question already settled
- Mint a fix row — rejected: two existing BACKLOG rows own it, cowork-team requested fold-in
- Close + fold — chosen
**why-decision:** Acceptance was "findings doc names WHICH of (a)/(b)/(c)"; cowork-team answered (a) and router verified it at source (drain-signals.js:6 puts READ-marking out of script scope), not on the accused's self-report. Carried forward the blocking ordering constraint and the po-20260720T052606 live probe so closure drops nothing.
**why-change:** Answer landed at 17:25:44Z, after the batch was formed.

### STEP po-S164 · po · 2026-07-21T18:45:38Z
**task-id:** GUARD-PRICE-ANOMALY-BYPATH-DISH-CONTRACT
**what-done:** Disproved the "price_anomaly reaches nobody" premise at source; CANCELLED the envelope row, carved price_anomaly out of the CLEAN row's sweep/quarantine clauses, minted the contract row.
**what-considered:**
- Envelope + routing row (as signal asked) — REJECTED: drain would then MOVE files to processed/, out of Chef's top-level-only glob (chef.md:116). Would have CREATED the data loss it was meant to prevent.
- Relocate out of docs/signals/ — REJECTED: same regression, Chef reads that exact path.
- Document + protect the existing by-path contract — CHOSEN.
**why-decision:** Writer (market-watcher/flow/eod.md:29) and consumer (unified-agent/flow/chef.md:116) both exist and are wired; the contract is stated in eod.md:15/:61 and market-watcher/init.md:119-121. Prior greps excluded .md, but flow docs ARE the executable source here, so "no writer found" was a search artifact.
**why-change:** Signal asked for a WHERE-does-it-go decision; the answer was already decided and already working, so the row became protect-and-document rather than build.

### STEP po-S165 · po · 2026-07-21T18:44:02Z
**task-id:** DESIGN-COWORK-FANOUT-T2-CYCLE-BOOTSTRAP-EXTRACTION
**what-done:** Ruled the routing class by ARTIFACT CLASS not directory; applied to 21 rows (14 docs/agents/, 4 .claude/skills/, T12+T32 prose-in-multi, T2).
**what-considered:**
- Hand-patch T2 only — REJECTED: leaves 13+ rows to reproduce the same mis-route.
- Directory-based rule — REJECTED: T17/T28/T31 emit .md but are codegen/hook code; directory alone mis-classifies them.
- Artifact-class rule (prose an agent executes -> agent-father) — CHOSEN.
**why-decision:** Root cause is zone-detect resolving ONLY dev-<svc>/developer with no path to agent-father, so any unrouted docs/agents/ row falls to the generic developer placeholder. Precedent existed for SKILL.md->agent-father (dev-team-20260716T102429Z signal).
**why-change:** Intended side effect: agent-father fails the ^dev(-|$)|^developer$ pattern, so BOUNDED-1's NON-DEV-NEXT_AGENT gate now withholds these from idle auto-pickup. That is correct, not a bug to fix.

### STEP po-S166 · po · 2026-07-21T18:46:26Z
**task-id:** SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD
**what-done:** Moved in_progress -> ready/TODO + supervised:true, freeing the board's binding WIP constraint; logged instance 6 on the saturated-gates sweep; encoded head.wip_max=2.
**what-considered:**
- Unblock in place — REJECTED: asserts progress not evidenced in 5 days.
- Reassign — REJECTED: hands a cold SPIKE to a new owner without re-triage.
- Move out of in_progress — CHOSEN.
**why-decision:** Row had NO updated_at at all, so the age-based stale-reset (dev-team/flow/main.md:491) was structurally unreachable for exactly the row that needed it; WIP 2/2 meant nothing could enter. Moving it frees the slot and forces deliberate re-dispatch.
**why-change:** Left head.wip null/computed while storing wip_max, per the standing computed-not-stored conservation rule.

### STEP po-S167 · po · 2026-07-21T19:30:38Z
**task-id:** FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-SKILLS
**what-done:** Approved the supervised row (review→done) and minted its disclosed Layer-2 tail as a separate row.
**what-considered:**
- Reject/hold pending proof that acceptance was written before the file edits
- Approve on substance, treat the ordering claim as immaterial to the ACs
- Approve and silently drop the unverifiable claim
**why-decision:** None of ACs (1)-(6) requires acceptance-written-first, so approval rests only on independently checkable artifacts; the ordering claim is unverifiable-not-disproven because agent-father's commit zone excludes orch-state.json, making the claim unfalsifiable by construction rather than by fault.
**why-change:** Tail minted now rather than deferred to a PM pass — an unminted tail disclosed inside a closing row orphans the moment its parent closes.

### STEP po-S168 · po · 2026-07-21T19:30:38Z
**task-id:** FIX-SLA-SBV-FX-BUSINESS-DAY-AWARE
**what-done:** Ruled the sbv_fx CRITICAL a false positive and minted the root cause instead of a staleness row.
**what-considered:**
- Treat CRITICAL as real and escalate an SBV outage
- Confirm market-hours blindness only, as the dispatcher hypothesised
- Probe the SLA config at source before accepting either
**why-decision:** Source read beat the hypothesis: sbv_fx has a flat 30-min threshold with no business-day awareness while system-map declares 1440min, and the tool's own legend advertises an off-hours window it never applies — the source published normally at 03:05Z.
**why-change:** Broader than the dispatcher's market-hours framing — it is a category error (once-daily source, 30-minute SLA), so the row targets the config, not the calendar.

### STEP po-S169 · po · 2026-07-21T19:30:38Z
**task-id:** FIX-AUDITOR-EVAL-DELTA-RECENCY-BOUND
**what-done:** Split the 3 bctc_eval_delta HIGHs into 1 real / 2 stale re-emissions via a DB join, minted the recency bound.
**what-considered:**
- Accept all 3 as real and route to BCTC extraction work
- Attach all 3 to EVAL-PUSH-DOUBLE-ENCODE as instrumentation artifacts
- Join eval rows to tickers and check each row's age and gate payload
**why-decision:** The artifact prediction held only for FPT (empty metrics, 41d old) and was refuted for the stage-4 rows, which carry genuine populated gate failures — so neither blanket verdict was correct and only a per-row check could tell them apart.
**why-change:** MBB is named as the regression test so the recency fix cannot suppress the one genuine failure.

### STEP po-S170 · po · 2026-07-21T19:30:38Z
**task-id:** FIX-NOTEBOOK-PRUNE-HEADING-LEVEL-MISMATCH
**what-done:** Re-graded the agent-father notebook signal from a size-cap breach to a P1 armed data-loss trap.
**what-considered:**
- Accept as reported: 211L over cap, auto-prune cannot act
- Trace what the prune predicate actually does when it finds zero boundaries
**why-decision:** notebook-write SKILL.md:62-66 routes a zero-'## '-count file to a blank-state full-file Write, so the next write destroys 211 lines and 6 sections — materially worse than a stuck cap.
**why-change:** Swept all notebooks to bound the blast radius; agent-father.md is the only at-risk file, so this stays S-sized and does not become a fleet migration.

### STEP po-S171 · po · 2026-07-21T19:30:38Z
**task-id:** FIX-COWORK-STEP0A-TOPO-DRAIN-STATUS-CONTRACT
**what-done:** Upheld both cowork escalations without minting, graded the pair's ordering, and set the drain-status row to depend on the receiver row.
**what-considered:**
- Mark all 9 rows READ and close the tick
- Leave all 9 NEW to avoid stranding, as the escalation implied
- Mark terminal only where disposition is durably captured elsewhere
**why-decision:** Verified at source that drain-signals.md 0a-D collects only status=NEW, so a blanket mark would sever dev-team's inbox — but leaving triaged rows NEW guarantees infinite re-drain, so the durable-capture test is the only rule that satisfies both.
**why-change:** Found a second failure mode the escalation did not raise: 73 live rows carry an out-of-vocabulary 'triaged' status that the PRUNE predicate can never evict; used the canonical RESOLVED token and widened the row's scope.

### STEP po-S37 · po · 2026-07-21T20:38:23Z
**task-id:** FIX-CADENCE-TNB-AUDIT-WEEKLY-MARKER-BLOCKS-DAILY-CRON
**what-done:** Minted P1 row: re-key tnb-audit published-marker from ISO-week to daily; routed agent-father.
**what-considered:**
- (a) re-key to daily published:tnb-audit:<YYYY-MM-DD> ttl 100800
- (b) confirm weekly intended, fix "daily audit" language in init.md/main.md
- (c) add a release valve for held-marker-without-handoff
**why-decision:** 4 sources say daily (init cron, cowork-schedule.json runtime SSOT dish_type=daily_audit, main.md 3-daily-dish target, daily c113/114/115 series) vs 1 (spawn-fanout weekly list) whose origin is a traceable copy of digest-predict, a Sunday-only cron. Cadence/key mismatch => key is wrong, not the cron. Rejected (c): UC-CCA-P3 proves release valves oscillate; daily key makes release moot.
**why-change:** Router premise "8 days no work product" falsified mid-cycle — c115 handoff landed 20:30Z, so impact is 5 lost daily audits, not a blackout; severity set P1 not P0.

### STEP po-S38 · po · 2026-07-21T20:38:23Z
**task-id:** FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS
**what-done:** Escalated existing row P1->P0, appended 3rd-occurrence evidence, directed deliberate ba dispatch.
**what-considered:**
- mint new P1 root-cause row as router asked
- escalate the existing row that already owns the root cause
**why-decision:** Prior-art check found this row already names the disjoint-namespace root cause AND the cheapest-correct-fix; a new row would duplicate it. P0 corrects a priority inversion (enabler ranked below its own P0 symptom UC-CCA-P3), not damage-this-time — this occurrence caused zero harm.
**why-change:** Operative blocker is dispatch not priority (plan_only+supervised held it 6 days); kept supervised:true and issued a PO dispatch directive instead of clearing the guard.

### STEP po-S1 · po · 2026-07-21T21:07:54Z
**task-id:** FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN
**what-done:** Answered the review-drain ownership question by promoting the 9-day-old row that already owned it, after retracting my own prior "no row owns that".
**what-considered:**
- Mint a new review-drain row (my last cycle implied none existed)
- Declare review-drain deliberately unowned this cycle
- Promote the existing row + fix the reason it was unreachable
**why-decision:** Board grep found FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN with a correct root cause since 07-12; it was not unowned, it was quarantined (supervised+plan_only). Minting would have duplicated; declaring it unowned would have repeated a false claim.
**why-change:** Prior cycle asserted an ownership gap without grepping — corrected in-row.

### STEP po-S2 · po · 2026-07-21T21:07:54Z
**task-id:** FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER
**what-done:** Promoted the quarantine row out of the quarantine it describes; retracted my own 16:01Z choice to leave it "deliberately an instance of its own class".
**what-considered:**
- Keep the self-referential placement as a demonstration
- Mint a fresh row from this tick's 17-row measurement
- Promote + retract, no mint
**why-decision:** The self-reference guaranteed non-execution: 5h zero dispatch, and I re-derived the identical finding from an unrelated entry point and nearly duplicated it. A finding needing rediscovery to get attention is not tracked.
**why-change:** Retains supervised:true — the deliberate path was the missing piece, not the guard; clearing supervised for auto-pickup is explicitly forbidden.

### STEP po-S3 · po · 2026-07-21T21:07:54Z
**task-id:** FIX-COWORK-LASTFIRED-DECOUPLE-FROM-DELIVERY
**what-done:** Refuted TNB's "the last_fired write isn't landing" diagnosis and folded the inverse-direction evidence into the existing row instead of minting.
**what-considered:**
- Mint a scheduler-metadata-write-bug row per TNB's recommendation
- Fold into the existing last_fired row
**why-decision:** There is no failing write — 07-20 was a genuine miss and 07-21 fired via the router path, which never writes last_fired (commit 62cf2eab8). Binding last_fired to delivery proof fixes both directions with one change; a second row would split one fix across two owners.
**why-change:** TNB recommended agent-father/ops investigate a nonexistent write bug — rejected.

### STEP po-S1 · po · 2026-07-22T05:31:04Z
**task-id:** FIX-DRAIN-PERSIST-GUARD-COUNT-DRAINABLE-ONLY
**what-done:** Minted FIX to make MANDATORY PERSIST GUARD count only drainable (from/type-shaped) signals, not raw file count.
**what-considered:**
- Advance/re-lane the existing CLEAN-COWORK...TELEMETRY row (purge residue) — rejected: symptom-purge recurs; peer-file deletion has evidence gate; churn.
- Unpark an in_progress epic to free WIP for the starvation fix — rejected: both mid-pm-decomposition; wastes in-flight work.
- Root-cause the guard so debris never false-trips — chosen.
**why-decision:** The false-trip forces mandatory full-drain every tick (starvation pressure); shape-filtering the guard is the definitive, litter-independent fix and is not captured by either existing row.
**why-change:** Dispatcher asked to advance the CLEAN row / unpark epic; substituted the durable root-cause fix instead (converges recurring symptom per CLAUDE.md).

### STEP po-S2 · po · 2026-07-22T05:31:04Z
**task-id:** FIX-ORCHSTATE-CONSERVATION-GUARD-QA-LANE-BLIND
**what-done:** Routed pendingSignal #1 (dev-team bug) as a FIX — add 'qa' to FLAT_TASK_LANES (orch-conservation-check.mjs:67) + doc formula.
**what-considered:**
- only path: exact root cause supplied by signal; additive array+doc change; shared prewrite-hook logic must not be duplicated.
**why-decision:** Real latent blind spot (qa[] uncounted → catastrophic qa[] drop invisible to floor-ratio guard; qa[] now live via QA-Drain).
**why-change:** no change from signal's suggested_fix.

### STEP po-S3 · po · 2026-07-22T06:43:03Z
**task-id:** FIX-DRAIN-PERSIST-GUARD-COUNT-DRAINABLE-ONLY (+ FIX-ORCHSTATE-CONSERVATION-GUARD-QA-LANE-BLIND persist; 3 VPS signals fold)
**what-done:** Drained 4 accumulated NEW po-bound signal_queue rows (last triage 04:49Z). PERSISTED the po-S1/po-S2 pair to task_board.backlog[] (P1 first / P2, both cross-service/, next_agent=developer, auto-promote) — resolving dev-team-20260722T054244Z-triage-batch-wip-deadlock, whose BATCH could be neither dispatched nor persisted under WIP=2/2. FOLDED the 3 CRITICAL sys data_stale rows into the VPS-bridge cluster (status→triaged, no new mint). orch-apply OK: task_total 594→596, signal_total 97→97.
**what-considered:**
- Re-mint the two FIXes from scratch — REJECTED: po-S1/po-S2 already specced them 05:31Z; dev-team only needed PERSISTENCE, not re-decision. Copied specs verbatim from the journal.
- Dispatch the pair now — REJECTED: WIP=2/2 (two parked epics); direct-FIX path has no WIP gate so dispatching would breach WIP≤2. Backlog mint = the ASK, respects the invariant.
- Mint a fresh FLOW-GAP row for "triaged-but-unpersisted BATCH lost under saturation" — REJECTED: sharper facet of existing FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION; folded as annotation (no dup).
- Mint a FIX-VPS row for the 3 data_stale rows — REJECTED: same root as 04:49Z 774e disposition + Telegram BUG 3866 (user-escalated, restart USER-GATED); VPS infra = no code-fix. Recorded high-water-marks (foreign-flow ~27.4h, bctc-discover ~40.7h/183 pending) + two-layer BCTC caveat (root = FETCH layer, distinct from analysis-layer FIX-AUDITOR-B05).
**why-decision:** dev-team's triage SUCCEEDED but its output could not land under saturation — persisting to backlog is the durable capture; folding the VPS cluster keeps re-emits out of the un-triaged pool without authorizing the user-gated restart.
**why-change:** no change from the dev-team ASK (persist BOTH, P1-first) nor from the standing VPS-cluster disposition; did NOT touch the 2 out-of-scope NEW rows (po→unified-agent methodology-flag, cowork→ops OOM escalation).

### STEP po-S4 · po · 2026-07-22T15:15:55Z
**task-id:** FIX-MCP-MEMORY-CODE-LEAK (escalate) + FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE (mint) + FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN/FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER (activate)
**what-done:** :37 triage under WIP=2/2. Triaged the 4 NEW signal_queue rows (the 2 S3 deferred + 2 post-restart-recovery). Cowork "signals this tick" existed only as a fold into signal_queue row cowork-20260721T232634Z-a30-mcp-oom-escalate (dispatcher was MCP-blind at 14:51Z, folded via local orch-apply) — no docs/signals/ files. ESCALATED FIX-MCP-MEMORY-CODE-LEAK (recurring OOM confirmed, superseded 07-21 "benign" note). MINTED FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE (claimed-minted-but-absent). MOVED the 2 review-lane sweeper FIXes review→backlog + assigned owners to 9 orphaned REVIEW rows.
**what-considered:**
- Mint a NEW mcp-OOM FIX — REJECTED: FIX-MCP-MEMORY-CODE-LEAK already exists; re-mint = churn (feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn). Escalated the existing row instead + superseded its stale benign corroboration.
- Re-mint the 2 prior-tick direct-FIX rows (FIX-DRAIN-PERSIST-GUARD / CONSERVATION-GUARD) — REJECTED: grep-board shows both already persisted at 06:40:43Z (po-S3). No-op.
- Recommend/execute an mcp-server restart per the escalation ASK — REJECTED: restart is user-gated ops-lane, not PO-executable; auditor recorded mcp-restart already occurred 14:53Z (OOM self-resolved this cycle). PO routes the durable code fix only.
- Mint 22 individual follow-ups for the stranded REVIEW rows — REJECTED: churn-without-convergence. Root cause = 2 already-minted sweeper FIXes that were themselves stranded in REVIEW (recursive deadlock). Broke the deadlock by moving them → backlog so BOUNDED-1/RLC promote them; they drain the other 20 by next_agent once built.
- Move all 22 REVIEW rows → backlog — REJECTED: cannot safely determine worked-vs-unworked state per row; would risk re-doing complete work. Assigned owners so the sweeper routes them; left in REVIEW.
**why-decision:** Convergence over churn — one escalation + one real mint + one deadlock-break resolves the whole class; every stranded row now has a named path (PO AC1, no silent drop). All 3 persists via orch-apply.sh (Zod+conservation+CAS OK).
**why-change:** Fold-not-restart on the OOM escalation (user-gated); folded the news-vps/market_messages CRITICALs as A-30-outage-window consequences (self-recovering post-restart) with a re-verify flag on market_messages rather than minting.

### STEP po-S5 · po · 2026-07-22T15:56Z
**task-id:** BCTC-REPORT-ID-LOOKUP-TOOL (enrich+bump) + PERF-PEK-PER-PAGE-LATENCY (mint) + FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT (disposition)
**what-done:** :37 triage, 1 NEW signal_queue row (cowork bctc-esc5-report-id-gap MEDIUM). DEDUP → enriched existing backlog BCTC-REPORT-ID-LOOKUP-TOOL (title names ESC-5 step-5d, priority MED→HIGH, origin_signal_id back-ref) + closed the signal (status→triaged). Minted PERF-PEK-PER-PAGE-LATENCY (orphaned perf escalation from the pdf-extractor review row). Resolved the market_messages RE-VERIFY. All via orch-apply (task 595→596, conservation OK).
**what-considered:**
- Mint a NEW dev-mcp-server FIX for ESC-5 (as the signal requested) — REJECTED: signal's "no prior art" claim was a missing board-grep (feedback grep-board); BCTC-REPORT-ID-LOOKUP-TOOL already covers the identical root cause (no tool surfaces report_id by ticker+period). Enriched+bumped it instead of double-minting.
- WONTFIX the ESC-5 gap as accepted precedent — REJECTED: a fail-safe that never fires = silent disable; recurring-failed-fix >2 + limitation=structural (feedback_agent_reported_limitation_may_be_structural). Bumped MED→HIGH (reliability>coverage) because a dark escalation detector is a reliability gap, not a coverage nicety.
- Escalate market_messages=0 as a genuine ingest gap — REJECTED: market data plane RAW-verified alive+fresh (VN-Index -3.58%, breadth 2026-07-22, turnover 23405bn); the auditor CRITICAL fired at 15:00Z=22:00 ICT OFF-MARKET; already board-tracked as FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE (market-hours-blind FP). Re-verify condition ("still 0 during market hours") NOT met.
- Mint follow-ups for the 20 telegram/271 unresolved reports — REJECTED: all are 07-19 BCTC-1345b low-conf + reconcile-exhausted notifications, already covered by FIX-TELEGRAM-REPORT-ACK-STATUS-STOP-RESURFACE; no new work.
- Force-close FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT (8d in review) — REJECTED: prior "do not close on this report" note stands; instead minted the documented-but-never-boarded perf spin-off (PERF-PEK) + added po_disposition decoupling closure (fix's OWN ACs deployed+qa-approved+async-reroute-verified) → routes done_verified to dev-team/qa.
**why-decision:** Convergence over churn — 1 dedup+bump + 1 legit spin-off resolves the signal AND un-orphans the perf escalation AND unblocks the 8d review row, without adding redundant rows to an already-bloated 422-backlog.
**why-change:** market_messages resolved (off-market FP, not the feared ingest gap) — the S4 carry-over re-verify closed with no mint.

### STEP po-S6 · po · 2026-07-22T16:29Z
**task-id:** TRACK-CRON-AUDIT-VPS-PLANE
**what-done:** VPS-plane recon RETURNED; closed tracking mirror (backlog->done/DONE) + spun findings into 3 rows; triaged 2 signal_queue rows.
**what-considered:**
- ops half (systemd crash-loop lockout): ALREADY self-minted by ops as FIX-VPS-SYSTEMD-STARTLIMIT-HARDENING (dead-code + deploy-dedup folded in) -> dropped my dup mint
- dev-mcp-server half (2 health-measurement false-greens, NOT on board): minted FIX-VPS-HEALTH-OFFHOURS-MASK-FALSE-GREEN (M) + FIX-VPS-SBV-HEALTH-SHARED-TABLE-IS-ESTIMATE (S)
- alert-commander selloff-blind: ruled (a)-hybrid (add distinct selloff-breadth trigger; keep stopLossHit by-design) not (b)/(c) -> minted FIX-ALERTCMD-SELLOFF-BREADTH-SILENT
**why-decision:** recon delivered exact-diff fixes -> capturing at backlog is required disposition (else P1 findings silently lost); WIP 2/2 saturated so all land BACKLOG, zero dispatched.
**why-change:** no change from plan — WIP-saturated triage-only tick.

### STEP po-S7 · po · 2026-07-22T17:56Z
**task-id:** FIX-MCP-TEST-SUITE-INTERVAL-TIMER-LEAK-TEARDOWN
**what-done:** Deduped ci_red (bun-test RED on main HEAD 8a0b079b1, run 29943451339) onto the existing timer-leak row; recorded fingerprint f95c826a; escalated P3->P1 + promoted backlog->ready + plan_only=false; corrected the row's now-FALSIFIED "CI UNAFFECTED (CI completes green)" impact. 0 new mint, conservation 615=615.
**what-considered:**
- Mint a NEW ci_red FIX row — REJECTED: same job (bun test) + same suite; grep-board found the exact-cause row (dedup_key ci_red:8a0b079b1:bun test not previously on board); router conservation directive (hold task_total).
- Mint a batch-regression row for the just-merged cron-audit batch — REJECTED: po 17:25Z already A/B'd this exact batch in an isolated worktree (BASE 42 fail vs HEAD 42 fail = ZERO net-new regressions LOCALLY); any CI red is CI-ENV-specific, not a reproducible local regression → a fresh row would be speculative.
- Leave at P3 in backlog (latent) — REJECTED: premise changed. Actively RED on main breaks the fleet-wide ci_green_on_subsequent_push verification gate for ALL apps/mcp-server work + masks new genuine reds → UNBLOCK-class urgency.
- Conflate with FIX-CI-GOLANGCI-CONFIG-VERIFY (P2) — REJECTED: different job (golangci config-verify), not this bun-test red.
**why-decision:** Convergence over churn — dedup + escalate + record-fingerprint resolves the red without adding a row to an already-bloated 439-backlog; the falsified "CI UNAFFECTED" premise + fleet-gate breakage justify P1/ready; fingerprint recorded so a re-drain of the same red self-suppresses (memory: ci_red close must record fingerprint else re-drain).
**why-change:** Kept router's suggested dedup target; ADDED a disambiguation directive to the row (pull the actual CI log run 29943451339/job 89002842796 FIRST; timer-leak-timeout-on-CI is the leading hypothesis given watchdog-widen b3317f7f3 added intervals + CI historically green on this suite; batch-regression would be CI-env-only since local A/B was clean) — prevents the fix agent re-running a 2x full-suite local A/B the PO already did. Also flagged 8a0b079b1's "CI green confirmed" commit msg as a probable subset false-green (verify raw not badges).
