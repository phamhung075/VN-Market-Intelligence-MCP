# Decision Journal — Sprint 2026-07-23 · dev-mcp-server

**Sprint goal:** no active sprint_goal entry — fallback to date-keyed journal (BOUNDED-1 direct-execute FIX)
**Agent:** dev-mcp-server
**Started:** 2026-07-23T10:59:55Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-23T10:59:55Z
**task-id:** FIX-MCP-DOCKERFILE-ENTRYPOINT-KNOWNHOSTS-REGRESSION
**what-done:** Restored `COPY apps/mcp-server/entrypoint.sh /entrypoint.sh` + `RUN chmod +x /entrypoint.sh` + `ENTRYPOINT ["/entrypoint.sh"]` to Dockerfile (openssh-client was already present from FIX-VPS-SSH-TRIGGER-FAIL-LOUD 07-22); rewrote entrypoint.sh to degrade non-fatally (no `set -e`, no `exit 1`, WARN-and-continue on empty ssh-keyscan); added regression test locking both the Dockerfile wiring and the non-fatal behavior.
**what-considered:**
- Restore entrypoint.sh verbatim (original `set -e` + `exit 1` on empty keyscan) — REJECTED per mandatory constraint: would crash the container on any VPS outage, turning a VPS-side problem into total loss of 88 crons + full MCP tool surface.
- Hardcode `/root/.ssh/known_hosts` path in entrypoint.sh (matches original) vs. parameterize via `KNOWN_HOSTS_DIR`/`KNOWN_HOSTS_FILE` env overrides — chose parameterized (default unchanged) so the regression test can drive the real script end-to-end without touching `/root` or a Docker daemon.
- Revert sshExec.ts `StrictHostKeyChecking` to `yes` now vs. keep `accept-new` — kept `accept-new`: VPS (125.212.251.27) is unreachable from this sandbox (confirmed `nc -z` timeout), so "seeding is live and proven" (the PO ruling's condition) cannot be verified here; reverting blind would repeat the exact failure this task exists to fix.
**why-decision:** Mandatory constraint + PO ruling both explicitly require non-fatal degrade and gate the `StrictHostKeyChecking=yes` revert on live proof; sandbox has no route to the VPS, so only the code + regression test ship, with the revert left for a QA/ops cycle that can reach the VPS.
**why-change:** No change from board-row scope. Added the `KNOWN_HOSTS_DIR` override as an implementation detail (not in original scope wording) purely to make AC-6/7/8 testable without Docker.
