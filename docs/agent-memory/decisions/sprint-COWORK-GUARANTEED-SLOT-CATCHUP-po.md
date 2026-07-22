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
