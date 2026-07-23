# Socat Bridge Obsolescence Finding — 2026-07-21T18:13:00Z

> Migrated from `docs/agent-memory/notebooks/ops.md` (TE-T17 notebook prune, 2026-07-23) — content unchanged from the original notebook entry.

**Status:** RESOLVED — Bridge definitively obsolete per engineering decision (2026-06-06)

**Finding:** Auditor Tier-1 probe detected `com.vn-market.socat-bridge` as not-loaded, causing false FAILURE verdict. Investigation revealed:

**Root Cause Analysis:**
1. **Official Obsolescence Decision (2026-06-06):** OPERATOR-ALERT-SOCAT-FIX.md documents socat bridge was a TEMPORARY band-aid (2026-06-01) to bridge port :4000 → :3000 when api-gateway container was down
2. **Permanent Fix Deployed:** api-gateway Docker container restored 2026-06-06 11:14Z and now owns port :4000 via Docker Compose publication (`ports: - 4000:4000`)
3. **Plist Kept for Rollback:** `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/launchd/com.vn-market.socat-bridge.plist` retained in repo as reference only — NOT loaded in live system
4. **Regression Window: 2026-07-15 → 2026-07-21 (~6 days)**
   - 2026-07-15 16:52Z: socat process crashed repeatedly with "Connection refused" to localhost:3000 (backend was down or unreachable)
   - 2026-07-15 19:52Z: Process terminated with SIGTERM (signal 15) — likely launchd gave up after repeated failures, or manual unload
   - 2026-07-21 09:13Z: Auditor heartbeat shows last ALL_GREEN (before bridge became checked)
   - 2026-07-21 18:12Z: socat attempted to start (via manual test), failed with "Address already in use" on port 4000 (port occupied by Docker api-gateway)
   - 2026-07-21 18:16Z: Identified via this probe run

**Why It Failed When Reloaded:** Port 4000 binding conflict — Docker api-gateway (legitimate owner since 2026-06-06) already listening on 0.0.0.0:4000. Socat's plist (unchanged since 2026-06-01) specifies `TCP-LISTEN:4000,reuseaddr,fork`, but reuseaddr flag alone cannot override a live bind by another process. With KeepAlive=true in plist, socat would restart repeatedly, accumulating "Address already in use" errors in logs (~7 entries over ~1 minute before manual unload).

**Evidence:**
- `/Users/admin/Library/Logs/socat-bridge-error.log` tail shows:
  - 2026-07-15 16:52-17:16: "TCP:127.0.0.1:3000: Connection refused" (dozens of crashes due to unreachable backend)
  - 2026-07-15 19:52:12: "exiting on signal 15" (SIGTERM unload)
  - 2026-07-21 18:12:37 – 18:13:03: "bind(5, {LEN=16 AF=2 0.0.0.0:4000}): Address already in use" (repeated ~4 times in 26 seconds, then manual unload)
- `docker ps` confirms mcp-server-1 publishes 0.0.0.0:4000 (api-gateway service)
- OPERATOR-ALERT-SOCAT-FIX.md explicitly marks socat as resolved/obsolete

**Action Taken:** Updated auditor-tier1-probe.sh to skip obsolete agents — added `com.vn-market.socat-bridge` to `obsolete_labels` skip list in `_check_launchd_agents()` function. Probe now correctly allows the plist to remain in repo (for rollback reference) without requiring it to be loaded.

**Verification:**
- Probe rerun: `bash scripts/agents-flow/auditor-tier1-probe.sh` → verdict: ALL_GREEN (2026-07-21T18:16:18Z)
- All 6 checks pass (docker_ps, health_3000, health_3001, disk, mem_creep, launchd_agents)
- Socat plist remains in launchd/ directory but is correctly skipped as obsolete

**Can This Recur?** NO — the bridge was a ONE-OFF recovery measure from 2026-06-01 that was superseded on 2026-06-06 when api-gateway came back. The plist was never meant to persist; it's kept only for historical reference. The 6-day gap (07-15 crash → 07-21 detection) was an existing gap in monitoring — now closed by this probe run + skip-list update. No operational risk; api-gateway handles :4000 reliably.

**Related Documentation:**
- docs/OPERATOR-ALERT-SOCAT-FIX.md (official resolution, 2026-06-06)
- docs/protocols/vps-socat-cloudflare-fix-runbook.md (original diagnosis, archived)
- docker-compose.yml (api-gateway ports: - 4000:4000, restart: unless-stopped)

---
