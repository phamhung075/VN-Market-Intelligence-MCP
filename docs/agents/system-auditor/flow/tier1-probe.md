<!-- lazy-loaded by main.md §Tier-1. cap: 120L (flow-file). size-justification: ~130L — FIX-AUDITOR-A20-MULTIPROBE 2026-06-08 adds A-20 multi-probe discriminator section (~28L); exceeds 120L cap by design; extraction to separate file would add lazy-load overhead on every T1 cycle where pdf-extractor is in host_runtime_set (i.e. always). -->
# Tier-1 — Runtime Ping (detail)

**Wall time target: < 120s. Scope: container liveness + health endpoint + restart count + memory + disk.**

---

## PROBE STEP — Run ONCE, paste verbatim

Execute the evidence collector:
```bash
bash docs/agents/system-auditor/probe.sh
```
Capture the full stdout into memory as `PROBE_OUT`.

**Paste `PROBE_OUT` verbatim** into the notebook section as a fenced block under `### RAW-PROBE:` before writing any verdict. ALL container/health verdict lines MUST cite lines from this block (e.g. `[RAW-PROBE L4]`). Hand-typed container/health status lines that do NOT reference the RAW-PROBE block are FORBIDDEN.

**Anti-carry rule:** container/health lines MUST come from the current-cycle RAW-PROBE block ONLY. NEVER copy container/health lines from a previous notebook section.

---

## Container Status (A-01 through A-11) — SSOT-gated severity

**INTENDED RUNTIME SET (SSOT):** read `project.infrastructure.docker.host_runtime_set.services[]` from system-map.json. Only these services are checked for UP/DOWN severity. Services in `not_deployed_by_design[]` are NOT checked — skip with `"[A-01] <service_id>: not-deployed-by-design — INFO/grey"`.

From `PROBE_OUT` `--- docker ps -a ---` section, for each service in `host_runtime_set.services[]`:
- Line contains `Up` → PASS
- Missing / Exited → FAIL: severity per runtime role:
  - `mcp-server`: CRITICAL (core data pipeline)
  - `api-gateway`: WARN (VPS fetch callbacks)
  - `frontend`: INFO (UI only)
  - `macro-indicators`: WARN (CHEF/news-scout dependency)
  - `mcp-gateway`: WARN (cowork agents use this)
  - `pdf-extractor`: WARN (BCTC PDF extraction)

For each service in `not_deployed_by_design[]`: log INFO/grey, no signal, no DASHBOARD row, no BUG alert.

## Health Endpoints (A-12 through A-20) — SSOT-gated

From `PROBE_OUT` `--- health endpoints ---` section:
- `[health] <svc>:<port> OK` → PASS
- `[health] <svc>:<port> FAIL` → FAIL at severity matching container-status table above
- Services in `not_deployed_by_design[]` → skip entirely

## A-20 — pdf-extractor Multi-Probe Discriminator (FIX-AUDITOR-A20-MULTIPROBE)

**Override rule:** the A-20 verdict from the general Health Endpoints section above MUST be overridden by this block. A single `[health] pdf-extractor:5001/health OK` line in `PROBE_OUT` is NOT sufficient to pass A-20 — a transient 200 between Tesseract runs masked real event-loop stalls (c103 false-green saga).

**Tier placement:** T1 — adds ~15s to wall time, stays within 120s budget.

**Protocol:**
1. Run 3 in-container exec probes with 5s spacing:
   ```bash
   PDF_CTR=$(docker ps --format '{{.Names}}' | grep 'pdf-extractor' | head -1)
   if [ -z "$PDF_CTR" ]; then
     echo "[A-20] SKIP in-container probes — pdf-extractor container not found (A-11 already CRITICAL)"
   else
     for i in 1 2 3; do
       result=$(docker exec "$PDF_CTR" curl -s -o /dev/null -w "%{http_code}" -m 5 http://localhost:5001/health 2>/dev/null || echo "000")
       echo "[A-20-PROBE-${i}] in-container HTTP ${result}"
       [ "$i" -lt 3 ] && sleep 5
     done
   fi
   ```

2. **Majority-vote verdict:**
   - Count probes that returned HTTP 200 (`pass_count`).
   - `pass_count ≥ 2` (majority) → A-20 PASS — override general health section result.
   - `pass_count ≤ 1` (majority fail) → A-20 FAIL — emit signal regardless of what the host-side `PROBE_OUT` shows.

3. **HTTP 000 significance:** in-container HTTP 000 means the event loop is wedged (uvicorn not accepting connections from within the network namespace). This was THE discriminating signal in the A-20 saga — host-side proxies/ports can return 200 while the container event loop is stalled. `000` counts as a fail probe.

4. **Emit on A-20 FAIL:**
   ```json
   {
     "type": "microservice_degraded",
     "service_id": "pdf-extractor",
     "check_id": "A-20",
     "detail": "pdf-extractor multi-probe failed: {pass_count}/3 probes passed — event-loop stall suspected",
     "severity": "WARN",
     "dedup_key": "microservice_degraded:pdf-extractor:A-20"
   }
   ```
   Signal row in orch-state.json `.signal_queue.rows[]`:
   ```json
   {"id": "sau-{ts}", "from": "system-auditor", "to": "po", "type": "microservice_degraded",
    "summary": "pdf-extractor A-20 multi-probe {pass_count}/3 — event-loop stall suspected",
    "severity": "HIGH", "status": "NEW"}
   ```

5. **Log all three probe results** verbatim in the notebook `### RAW-PROBE:` block for evidence trail.

---

## Restart Count (A-21)

From `PROBE_OUT` `--- restart count ---` section:
- `RestartCount=N` with N ≤ 2 → PASS; N > 2 → WARN
- `[PROBE] docker inspect FAILED` → log `[A-21] TOOL-UNAVAILABLE — skip` (NOT an infra finding)

## Memory Pressure (A-30)

From `PROBE_OUT` `--- memory pressure ---` section:
- `MemPerc=X%` with X < 85 → PASS; X ≥ 85 → WARN
- `[PROBE] docker stats FAILED` → log `[A-30] TOOL-UNAVAILABLE — skip` (NOT an infra finding)

## Disk (A-32)

From `PROBE_OUT` `--- disk df -h / ---` section:
- Capacity column < 85% → PASS; ≥ 85% → WARN; ≥ 95% → CRITICAL

## MCP System Status

```
call_tool(server="vn-market", tool="get_system_status", arguments={})
call_tool(server="vn-market", tool="get_cron_health", arguments={})
```
Cross-reference any service reported DOWN with the `--- docker ps -a ---` lines in `PROBE_OUT`.

## Emit per failure
```json
{
  "type": "microservice_degraded",
  "ts": "<UTC ISO-8601>",
  "service_id": "<id>",
  "zone": "<zone from system-map>",
  "zone_owner": "<specialist from zones>",
  "check_id": "<A-xx>",
  "detail": "<what failed — cite RAW-PROBE line>",
  "severity": "CRITICAL|WARN|INFO",
  "channel": "bug",
  "dedup_key": "microservice_degraded:<service_id>:<check_id>"
}
```
Routing: severity ≥ WARN AND dedup_key not seen last 7d → `send_telegram(channel="bug")`. Always append DASHBOARD.md row for WARN/CRITICAL.
