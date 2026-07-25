# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · po

**Sprint goal:** Make cowork `guaranteed:true` an honored contract — bounded catch-up/look-back for slots whose window elapsed during host standby / session-down, or correct the label.
**Agent:** po
**Started:** 2026-07-22T21:32:09Z

---

### STEP po-S1 · po · 2026-07-22T21:33:00Z
**task-id:** BA-COWORK-GUARANTEED-SLOT-CATCHUP
**what-done:** Root-caused the 07-22 guaranteed-slot misses on two planes, minted umbrella sprint + BA task, claimed sprint lock; did NOT mint a duplicate into the existing 6-row cluster.
**what-considered:**
- Mint a fresh FIX row for "no catch-up" (would be the 7th parallel row in a 440-deep starving backlog — churn, not convergence).
- Route Track B (durable persistence) to ops as new infra (but launchd firer is ALREADY installed + working — launchctl loaded, last-exit 0).
- Converge: one umbrella sprint that consolidates the cluster + drives Track A catch-up as the primary, missing piece.
**why-decision:** Track B is already shipped; the real gap is that BOTH firing planes only match the current ±2min tick with zero look-back. Firer log proves it: 11.5h silence 05:58→17:34Z with chef-eod/fb-daily never logged (they would have been, last_fired=07-21 does not suppress) ⇒ launchd StartInterval did not run during host standby (uptime 11d, job still loaded), and on resume the elapsed windows were never re-offered. Convergence over a 7th mint per feedback_file_prior_art_check + the prior PO tick's own "cluster needs a promotion slot, not another mint."
**why-change:** Corrects SPIKE-DEAD-WINDOW's "machine sleep ruled out" — it read absent pmset Sleep/Wake lines as no-sleep; the firer-log-absence + caffeinate ClientDied at gap-start are the stronger, direct evidence of standby.

### STEP po-S2 · po · 2026-07-22T22:42:47Z
**task-id:** sys-20260722T223302-4f8b (auditor data_stale CRITICAL "sbv-vps stale 43h (check B-06)")
**what-done:** RAW-probed both freshness planes, found the 43h true but sbv-misattributed, DEDUP'd into the existing VPS push-plane cluster with 0 mint; folded the one new fact (measurable data loss) into FIX-VPS-SYSTEMD-STARTLIMIT-HARDENING acceptance.
**what-considered:**
- Close as auditor FP (the recurring market-hours-blind / frozen-value class).
- Mint a fresh CRITICAL row for a live 43h 3-service push outage.
- DEDUP into the 3 rows minted 6h earlier from recon.md, updating acceptance only.
**why-decision:** Neither pure FP nor mintable. vps_push_log sbv MAX=2026-07-21 03:05:21 makes 43h literally true, so not FP; but prices (03:08:05) + foreign-flow (03:08:59) died in the same 3.5-min window and sbv is the least-damaged source (sbv_rates moved 26130→26140→26120, last write 21:45Z) because sbvRatesJob's is_estimate=1 VCB fallback masks it — the exact mechanism FIX-VPS-SBV-HEALTH-SHARED-TABLE-IS-ESTIMATE already names. Root cause (systemd StartLimitBurst lockout) is already diagnosed and blocked_by user-escalation-vps-restart, so a 4th row adds zero throughput against a user-gated blocker (feedback_file_prior_art_check).
**why-change:** Deviates from "mint if real" in the spawn brief — real ≠ unminted; the row existed 6h before the signal fired.

### STEP po-S3 · po · 2026-07-22T23:58:00Z
**task-id:** UC-CDC-P5
**what-done:** Installed machine-readable depends_on=[UC-SDF-P6, ARCH-SESSION-CRON-PLANE-LIVENESS-WATCHDOG] on UC-CDC-P5, flipped status BLOCKED→BACKLOG, removed inline blocked_by; minted FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE (P1/S) for the systemic gap.
**what-considered:**
- Leave BLOCKED + add depends_on (belt+suspenders, but the promote gate only evaluates BACKLOG/TODO — a BLOCKED row is inert to the gate, so depends_on never fires and the row needs a MANUAL PO flip after predecessors land = not self-healing).
- Flip BACKLOG + depends_on (promote-eligible-but-dep-gated: gate evaluates it every tick, deps_satisfied() holds it, auto-unblocks at predecessors' DONE_VERIFIED).
- Systemic: harden the gate to PARSE po_sequencing_* prose for task-ids (rejected — regex-mining English for control flow is the exact fragility the shared lib exists to kill) vs a conservative-skip predicate that withholds any row with sequencing prose + empty depends_on.
**why-decision:** BACKLOG makes the depends_on gate I'm installing actually load-bearing; verified live against scripts/lib/devteam-eligibility.jq — effective_depends_on resolves to exactly the 2 predecessors, deps_satisfied=false, is_bounded1_eligible=false (held), and it flips true only at DONE_VERIFIED. Removed blocked_by because the lib unions it into effective_depends_on; "dev-team" there = phantom dep that never reaches DONE_VERIFIED = permanent block, defeating auto-unblock. FIX targets the shared lib (all 3 pickers inherit) not prose-parsing.
**why-change:** no change from plan — matches the spawn brief's preferred approach + the one-shared-contract principle from SPIKE-BOUNDED1-ELIGIBILITY-CONTRACT-REVIEW.

### STEP po-S4 · po · 2026-07-23T03:54:20Z
**task-id:** FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE
**what-done:** CONVERGE drain of A-30 mcp-server MemPerc FP: augmented the EXISTING converge row (not a new mint) with the WARN->CRITICAL escalation-gate facet + recurring 3->4 + commission-to-architect; folded 94.98% high-water to FIX-MCP-MEMORY-CODE-LEAK; folded bctc B-05 + VPS data_stale to their FP homes; ACKed 5 signals.
**what-considered:**
- Mint a fresh converge row (directive's literal ask) — REJECTED: prior-art grep found FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE already minted 07-21; a 2nd row into a 447-deep backlog IS the churn the directive fights.
- Note-only fold a 3rd time — REJECTED: that is exactly what the CONVERGE directive forbids.
- Augment existing row + route to architect (chosen).
**why-decision:** The real convergence failure was DORMANCY (row minted 07-21 but sat plan_only+supervised in BACKLOG while the FP re-emitted and worsened to CRITICAL+Telegram), not absence-of-mint. Augmenting scope for the new CRITICAL-escalation facet + commissioning to architect stops the churn WITHOUT a duplicate-mint.
**why-change:** Directive assumed "not yet minted" (memory body still reads 'no mint'); board ground-truth showed the row exists — so I converged by routing, not re-minting.

### STEP po-S5 · po · 2026-07-23T05:07:33Z
**task-id:** FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE
**what-done:** Final independent PO sign-off on the supervised converge row after QA delta re-verify PASS; applied po_signoff_at/by/verdict=APPROVE + status BACKLOG→DONE, moved backlog[]→done[] via one orch-apply write (conservation 623=623 preserved, next_agent settled via del not null).
**what-considered:**
- Trust QA's PASS verdict and lane-move directly (rejected — a supervised row cannot self-close through QA; PO owes an independent source-level re-verify, not a badge read).
- Set next_agent:null to settle (rejected — Zod rejects null; next_agent is optional-not-nullable, so del(.next_agent) is the correct settle).
- Sign off + lane-move in one atomic orch-apply transform (chosen).
**why-decision:** Re-verified at source, not from prose: qa_reverify_20260723=PASS (both QA passes clean); probe.sh:86 carries the `|| { echo ...; BASELINE_PCT="0"; }` guard matching :31/:66/:71/:92; git show 685285a7c = single-file probe.sh 1+/1-; forbidden files (tier1-probe.md logic, verify-a30-mcp-memory-reclamation.sh, emit-audit-signal.sh, app code) clean at HEAD + working-tree. Matched the FIX-COMMIT-PATH supervised-close precedent shape exactly.
**why-change:** no change from plan — the only deviation was del(.next_agent) after Zod rejected the initial null (settle semantics unchanged).

### STEP po-S6 · po · 2026-07-23T05:16:51Z
**task-id:** FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE
**what-done:** Answered coordinator epic-closeout follow-up on the wrapper's named-but-undelivered A-12/A-04/A-13 debounce scope item — confirmed (b) it lives on an existing row, and made the linkage durable with a conservation-neutral cross-ref field on the SPIKE.
**what-considered:**
- (a) delivered in-fix — REJECTED: git show 685285a7c + brief lines 227-229 explicitly deferred A-12/A-04/A-13 'for a future pass; not addressed here'; probe.sh:48 still flags a single CURL_ERR with no N-consecutive debounce.
- (c) mint a new tracking row — REJECTED: prior-art SPIKE-DASHBOARD-TIER-HEALTH-CURL-ERR-FLAP already homes it (title names A-12/A-04/A-13, 11 origin CURL_ERR signals, architect-owned, next_agent set = live auto-revisit); a mint = the duplicate churn the wrapper fought.
- (b) name it + document the linkage (chosen) — coordinator had dismissed the SPIKE as 'unrelated' precisely because the wrapper->SPIKE link was undocumented.
**why-decision:** The scope item is NOT orphaned — it has an owner + next_agent + verification_gate on the SPIKE. Root-cause of the closeout ambiguity was the missing documented linkage, so I added scope_item_home_ref_20260723 on the SPIKE (via orch-apply, uncommitted) so this exact re-raise can't recur. No new row (feedback_epic_wrapper_closeout_gap + prior-art check).
**why-change:** goes one step beyond the read-only 'name it' the coordinator asked for, to definitively retire the recurring epic-closeout-orphan class rather than leave the linkage implicit.

### STEP po-S7 · po · 2026-07-25T07:17:07Z
**task-id:** FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT
**what-done:** Re-derived the "Loại trừ" root cause instead of accepting the router's hand-off, found a different (and live) cause, and minted 4 rows for the user's prediction-claims demand.
**what-considered:**
- Router hypothesis: `intelligenceCycleJob.ts:938` hardcoded `creation_price: null` — REJECTED as the cause. That path writes `agent_id:"chain-synthesizer"`; all 17 live claims are `08-prediction-synthesizer` from `evidenceTools.ts:435`. Real but dormant; folded in as deliverable (f) so it can't become the next source.
- Actual cause (chosen): `evidenceTools.ts:397` gates the entry-price SELECT behind `if (direction != null && expected_move_pct != null)` — both OPTIONAL, and both absent from the tool doc's param table AND from `daily-predict.md:110`'s prescribed call. Agent follows the doc → no price → direction defaults "neutral" → resolver `excludeClaim()`.
- Force `direction` required — REJECTED: `predictionResolutionJob.ts:16` already scores *neutral WITH creation_price* via the neutral band. Ungating price capture alone makes all 10 neutral claims scoreable and breaks zero callers.
**why-decision:** The discriminator is entry-price capture, not age or direction: every non-null-creationPrice claim (ids 2-7) scored; all 11 null ones excluded or heading there. Ids 8→17 are 10 consecutive claims over 6 weeks at a 0% scoreable rate.
**why-change:** Diverges from the dispatch's stated root cause — verified live before minting, per the "hand-off is not evidence" instruction.

### STEP po-S8 · po · 2026-07-25T07:17:07Z
**task-id:** FEAT-PREDCLAIM-UPDATED-AT
**what-done:** Decided new-column over surfacing an existing timestamp, and ruled the hit-rate badge in scope as a P1 honesty fix.
**what-considered:**
- Surface existing `resolvedAt` as the updated-at — REJECTED: it is NULL for all 5 pending rows, i.e. blank for exactly the population the user wants to recheck.
- Surface `createdAt` — REJECTED: answers "when minted", never moves.
- Add a real `updated_at` column stamped inside the store fns (chosen) — the Zod update-path work and the backfill both introduce a genuine third mutation class that no existing timestamp can represent, and a backfilled row would otherwise be indistinguishable from an untouched one.
**why-decision:** Stamping must live in `predictionClaimStore.ts` not at call sites — a call-site convention is precisely what the next new call site skips, which is how this whole defect class arrived. Reuses the existing idempotent `ALTER TABLE ADD COLUMN` pattern at `schema-system.ts:209-212`; no new migration mechanism.
**why-change:** Added the hit-rate honesty row beyond the literal ask — 66.7% computed on 6/17, frozen since 2026-06-21 with no denominator or staleness marker, is the passive-health-masks-dead-data pattern and is why a 6-week outage went unnoticed.

### STEP po-S9 · po · 2026-07-25T08:02:06Z
**task-id:** FE-PG-QUALITY-AUDIT-LASTVERIFIED-RENDER-FIX
**what-done:** Minted ONE backlog row (P1/S, zone apps/frontend/, next_agent dev-frontend) to render per-check `last_verified` + 7d staleness marker on dashboard.quality-audit.tsx.
**what-considered:**
- Widen an existing FE-PG-*-FRESH-FIX row — REJECTED: those target /dashboard, /bctc, /intel, a different page each.
- Fold into FIX-QUALITY-CHECKLIST-GENERATOR-FABRICATED-PASS-EVIDENCE — REJECTED: generator-side (architect, cross-service), this is render-side.
- Bind AC to check FE-PG-QUALITY-AUDIT-FRESH — REJECTED: that check is INFO-by-design (compute-on-read data_asof), rendering last_verified cannot flip it; a bound AC would be unfalsifiable.
**why-decision:** Prior-art scan over all 8 board lanes + archive found ZERO rows on quality-audit render/last_verified; the two nearest checks (FE-PG-QUALITY-AUDIT-FRESH INFO, -CONTENT-REGEN-CORR WARN) both DESCRIBE the masking but neither owns a fix. Self-contained AC bound to observable page state instead.
**why-change:** Router brief said 3 timestamp formats; RAW jq says 4 (microsecond `2026-06-10T09:18:46.945489Z` on FR-FRESH-02). Widened AC(c) to four shapes so the renderer is not built against an incomplete format set.

### STEP po-S10 · po · 2026-07-25T08:57:46Z
**task-id:** FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE
**what-done:** Minted ONE backlog row (P1/S, zone cross-service/, next_agent developer) widening the Tier-1 A-30 memory check from its hardcoded single `mcp-server` subject to every capped container.
**what-considered:**
- Fold into FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE — REJECTED: that row is DONE and shipped threshold/sampling/dedup tuning only; `auditor-tier1-probe.sh:209` still hardcodes one container, so the scope gap is outside what it delivered.
- Fold into RAG-FTS-BUILD-MEMORY-BOUND / FU-RAG-DEPLOY-MEMORY — REJECTED: those fix rag-service's memory; this fixes the detector's blindness to any container's memory. Different surface, different zone, different agent.
- Solve the FP tension with per-container threshold overrides — REJECTED: a static list that lags reality, the exact failure mode already open as FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX; a 99% rag override would also swallow a real rag OOM approach.
- Solve it with the ACK LEDGER (chosen) — the mechanism is already LIVE in this same script (b9484fa7a, `docs/data/auditor-launchd-ack.json`) and carries both needed guarantees: mixed case never suppresses, and entries expire on DONE_VERIFIED.
**why-decision:** Flat WARN_PCT=85 across all capped containers is only safe because rag-service's legitimately-high 98.46% set-point can be acked against an OPEN row rather than threshold-excused — suppression that points at a tracked fix is self-expiring and auditable, a threshold constant is permanent blindness.
**why-change:** Kept an absolute-headroom secondary predicate OUT of scope (11.9MiB free on 768m is thin, and % is not comparable across a 512m and 3g cap) — adding a second predicate in the same change would confound the FP evidence for the first.
