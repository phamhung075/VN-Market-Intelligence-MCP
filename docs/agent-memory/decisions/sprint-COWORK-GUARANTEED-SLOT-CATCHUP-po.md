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
