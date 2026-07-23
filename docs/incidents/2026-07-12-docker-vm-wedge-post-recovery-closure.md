# INCIDENT CLOSURE: Docker VM Wedge Post-Recovery (2026-07-12T02:16Z)

> Migrated from `docs/agent-memory/notebooks/ops.md` (TE-T17 notebook prune, 2026-07-23) — content unchanged from the original notebook entry.

**Incident ID:** cowork-team-mcp-endpoint-outage-20260711T1345Z  
**Session UUID:** (closure ops session)  
**Status:** ✓ CLOSED

**Timeline:**
- 2026-07-11T13:44Z: mcp-server-1 Bun process froze in uninterruptible kernel state (bctcPdfPull PDF write trigger suspected)
- 2026-07-11T14:15Z: Graceful restart attempts exhausted; Docker daemon socket failed to initialize
- 2026-07-11T14:24Z: Recovery determined unrecoverable without Mac reboot (host-level VM wedge)
- 2026-07-12T02:13Z: Post-reboot recovery initiated; launchd agents confirmed reloaded
- 2026-07-12T02:16Z: Closure conditions verified

**Closure Verification:**

| Condition | Status | Evidence |
|-----------|--------|----------|
| 1. Fleet health | ✓ PASS | 14/14 containers healthy, mcp-server stable 12h+ post-reboot |
| 2. Image integrity | ✓ PASS | SHA256:1c5845d64406 (QA-approved watchlist-fix) deployed, NOT rolled back |
| 3. Launchd agents | ✓ PASS | BOTH `com.vn-market.cowork-guaranteed-slot-firer` + `com.vn-market.socat-bridge` confirmed live via `launchctl list` |
| 4. Comms-first | ✓ PASS | Telegram status sent to work channel (2026-07-12T02:16Z) |
| 5. DB Integrity gate | ✓ PASS | get_watchlist (33 tickers) + get_market_snapshot (VN-Index 1828.34 plausible) serving confirmed |
| 6. Reconciliation | ✓ DONE | Notebook entries reconciled against commits 47075dafb/ff7df213a/95822aa90 |

**Root Cause:** Bun JIT corruption or event-loop deadlock in mcp-server (15m cadence bctcPdfPull job). Uninterruptible kernel state (D-state) blocked all single-service recovery paths; host-level reboot only solution.

**Precedent:** [[feedback_restart_masks_bun_jit_corruption]]

**Incident Record:** 
- ops notebook (this section)
- incident memory: project_docker_vm_wedge_incident_20260711.md
- po decisions: docs/agent-memory/decisions/po-decisions.md

**Follow-up Actions:**
- ✓ Monitor for re-wedge within 15-min cycle window (bctcPdfPull trigger)
- → If hang reappears: escalate as new BUG signal (Bun event-loop investigation)
- → If stable: normal operations resume

**Closed by:** ops agent | Session: 2026-07-12T02:16Z | Commit: (to be pushed via router)

---
