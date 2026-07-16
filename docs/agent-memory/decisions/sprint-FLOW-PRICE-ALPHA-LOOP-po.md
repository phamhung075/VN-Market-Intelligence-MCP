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
