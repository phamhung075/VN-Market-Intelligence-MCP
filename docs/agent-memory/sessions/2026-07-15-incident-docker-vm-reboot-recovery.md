# Incident — Docker VM wedge → host reboot recovery (2026-07-15)

**Authorized by user:** Reboot the Mac (Recommended). Prior authorized Docker Desktop restart FAILED — VM virtualization layer (`com.docker.virtualization`) never re-initialized; `docker.sock` missing; all 13 containers down; MCP endpoint returns HTTP 502.

**Root symptom:** mcp-server (Bun) went D-state (uninterruptible) → `docker restart/stop/kill` + `compose down/rm` all failed "did not receive an exit event" → daemon restart attempted → VM layer would not boot. Suspected durable cause: Bun mem-leak/JIT wedge (mcp-server ~67% of 3GiB cap before outage) — NOT confirmed post-recovery (VM never came back to capture mem).

**Data safety:** Named volumes (live SQLite DB) are PRESERVED by a plain reboot. NEVER use Docker "Reset to factory defaults" / clean-purge — it destroys the volumes/DB.

---

## POST-REBOOT RECOVERY CHECKLIST (run in order)

1. **Wait** ~1–2 min after login for Docker Desktop to auto-start the VM + containers.
2. **Daemon up?** `docker ps` → must list containers (no "connection refused").
3. **All 13 healthy?** `docker ps --format '{{.Names}}\t{{.Status}}'` → every row `Up`/`(healthy)`. Name any that aren't.
4. **MCP transport?** RAW probe (expect JSON, not 502/curl-28):
   ```
   curl -sS --max-time 15 -X POST https://zenmidi.com/vn-market/mcp \
     -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
     --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' -w "\nHTTP:%{http_code}\n"
   ```
5. **Stale SSE?** If containers are healthy but MCP still errors, the gateway may hold stale SSE to the restarted downstream → `docker restart <gateway> <proxy>` (memory: gateway-stale-sse-after-downstream-restart), re-probe step 4.
6. **Relaunch Claude Code** in this project.
7. **Re-arm crons** (durable crons die on session end): `/cron-cowork-team` + `/cron-detect-loop`. Verify with `CronList`.
8. **Route durable fix** once MCP healthy: spawn `po` to mint a root-cause task for the mcp-server Bun mem-leak/wedge (restart clears the symptom, not the cause — "fix root cause not recurrent symptom"). Capture mcp-server steady-state memory to confirm/deny the leak hypothesis.

## Reboot command
Apple menu → Restart, OR in your terminal: `sudo shutdown -r now`
