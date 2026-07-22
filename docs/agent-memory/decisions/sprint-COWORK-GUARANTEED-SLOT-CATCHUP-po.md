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
