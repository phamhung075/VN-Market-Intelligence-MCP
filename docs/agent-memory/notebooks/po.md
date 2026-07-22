# PO Notebook

_Last: 2026-07-22T21:33Z (router task=fix-cowork-guaranteed-slot-recovery — WHY proven 2-plane, 1 sprint + 1 BA minted, converge not 7th-mint)_

## Tick 2026-07-22T21:20–21:33Z — cowork `guaranteed:true` is a false promise: WHY proven, catch-up sprint minted

**User demand:** "find problem why missing job ... then fix." 07-22 chef-eod(08:45Z)+refine(09/11/14Z)+fb-daily(09:15Z) all MISSED, nothing recovered overnight.

**Root cause — PROVEN on two planes, not asserted:**
1. **Wake-lock death → standby.** pmset: multiple `caffeinate ClientDied` at ~05:00–05:13Z (07:00–07:13 CEST) — the interactive CLI session holding the */15 CronCreate dispatcher ended, host lost its wake-lock, entered standby.
2. **launchd firer provably did NOT run 05:58→17:34Z (~11.5h).** The firer (`cowork-guaranteed-slot-firer.sh`) only logs when it MATCHES a guaranteed slot; chef-eod/fb-daily had last_fired=07-21 which does NOT suppress them, so had StartInterval fired in-window the log WOULD show them. Total absence ⇒ StartInterval never ran (host not rebooted: uptime 11d; job still loaded: resumed same-day 17:34Z). Both planes dark.
3. **No look-back on resume.** matcher `cowork-match-slots.js` `cronMatches()` only offers slots within ±2min of the CURRENT nominal tick. On 17:34Z wake the 08:45–14:00Z windows were hours gone → NEVER re-offered → permanently dropped. `guaranteed:true` has NO catch-up on either plane.

**Track B is ALREADY shipped, not the gap.** `launchctl`: `com.vn-market.cowork-guaranteed-slot-firer` loaded, last-exit 0, plist symlinked, fired chef-evening 20:19Z. auditor-tier1 Check-6 self-verifies it stays loaded. The 2026-07-07 durability brief + firer + tests all landed. The missing piece is Track A (look-back/catch-up) — which the 07-07 fix never added.

**Triage call — CONVERGE, do not mint a 7th row.** Backlog is 440-deep with a live 6-row guaranteed-slot cluster (2 spikes + 4 fixes) all starving. Minted ONE umbrella `COWORK-GUARANTEED-SLOT-CATCHUP` (active, high, user_prioritized) + ONE `BA-COWORK-GUARANTEED-SLOT-CATCHUP` (BACKLOG) that consolidates the cluster as scope. Avoided bulk-rewriting existing rows (jq-clobber risk on 440-array) — BA/architect mark them subsumed during the sprint. Corrected SPIKE-DEAD-WINDOW's "machine sleep ruled out" (it was wrong).

## Carry-over
- **Minted:** sprint `COWORK-GUARANTEED-SLOT-CATCHUP` + `BA-COWORK-GUARANTEED-SLOT-CATCHUP`. Sprint lock claimed. Conservation 617→618, both orch-apply clean. NEXT=ba (write spec).
- **Consolidates (BA to mark subsumed, NOT re-open):** SPIKE-DEAD-WINDOW-20260722-EIGHT-HOUR-SILENCE, SPIKE-COWORK-GUARANTEED-SLOT-SUPERSEDE-WIRING, FIX-GUARANTEED-SLOT-FIRER-FANOUT-TRUNCATION, FIX-GUARANTEED-SLOT-DUAL-PLANE-DOUBLE-FIRE, FIX-COWORK-LASTFIRED-DECOUPLE-FROM-DELIVERY.
- **Track B residual (architect ruling):** laptop-standby through a full window + VN-day rollover is a real residual Track A catch-up can't cover; pmset/caffeinate keep-awake = optional thin OPS task, NOT a VPS reopen (07-07 brief §3 rejected B on security).
- **3rd recurrence / FAILED-FIX** (06-30, 07-04→07, 07-22): 07-07 launchd fix was necessary but incomplete. QA needs a session-down + standby survival test.
- **Secondary hardening surfaced:** 07-22 chef-morning firer run exit_code=143 (SIGTERM at 1800s bound) — dishes fanning to subagents truncate (already = FIX-GUARANTEED-SLOT-FIRER-FANOUT-TRUNCATION, folded).
- **Still starving from prior tick:** UC-CCA-P3 + FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR (P0, chef marker key), FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW, ci_red row awaiting RLC promotion. WIP 2/2, backlog 440 — promotion starvation is the standing systemic driver.
- Left orch-state + po.md + journal dirty for tick-close commit. NO git push.
