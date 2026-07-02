<!-- lazy-loaded by main.md §Tier-1. cap: 120L (flow-file). size-justification: ~155L — FIX-AUDITOR-A20-MULTIPROBE 2026-06-08 adds A-20 multi-probe discriminator section (~28L); TOKEN-ECONOMY-TICK-PREFLIGHT WU-3 2026-07-02 adds this SSOT header note (~10L); exceeds 120L cap by design; extraction to separate file would add lazy-load overhead on every T1 cycle where pdf-extractor is in host_runtime_set (i.e. always). -->
<!-- TOKEN-ECONOMY-TICK-PREFLIGHT WU-3 (2026-07-02, R9/R10): this subagent is
     now only spawned by a shell-first pre-gate, scripts/agents-flow/
     auditor-tier1-probe.sh (invoked by cron-detect-loop/SKILL.md Job 2) —
     verdict=ALL_GREEN writes a heartbeat and skips spawning entirely,
     verdict=FAILURE (or a stale heartbeat per Job 2's passive-health-
     masking guard) spawns this subagent to run the FULL walk-through
     below, unchanged. Separately, docs/agents/system-auditor/probe.sh is
     now the SSOT evidence collector for A-20 too (see its own
     "--- pdf-extractor in-container multi-probe (A-20) ---" section) —
     PROBE_OUT already carries the 3 probe results + pass_count by the time
     you reach § A-20 below; the pseudocode there is kept as a fallback
     reference only (e.g. stale cached PROBE_OUT) — do not re-run it if
     PROBE_OUT already has the "[A-20-PROBE-*]" lines. -->
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
   ```
   call_tool(server="vn-market", tool="post_agent_signal", arguments={
     "from_agent": "system-auditor",
     "to_agent": "po",
     "signal_type": "signal_feedback",
     "payload": {
       "title": "A-20 FAIL: pdf-extractor event-loop stall",
       "detail": "pdf-extractor multi-probe failed: {pass_count}/3 probes passed — event-loop stall suspected",
       "check_id": "A-20",
       "service_id": "pdf-extractor",
       "severity": "WARN",
       "dedup_key": "microservice_degraded:pdf-extractor:A-20"
     }
   })
   ```
   Signal row in orch-state.json `.signal_queue.rows[]` (atomic write, `.signal_queue.rows += [$row]` — NEVER `.signal_queue[N]`):
   ```json
   {"id": "sau-{ts}", "ts": "{ISO-UTC}", "from": "system-auditor", "to": "po", "type": "signal_feedback",
    "summary": "pdf-extractor A-20 multi-probe {pass_count}/3 — event-loop stall suspected",
    "severity": "HIGH", "status": "NEW", "payload_ref": null}
   ```
   After write: POST-WRITE READ-BACK per general E-3 pattern above — assert row id in `.signal_queue.rows[]`; FAIL LOUD + BUG telegram if absent.

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
```
call_tool(server="vn-market", tool="post_agent_signal", arguments={
  "from_agent": "system-auditor",
  "to_agent": "po",
  "signal_type": "signal_feedback",
  "payload": {
    "title": "<A-xx> FAIL: <service_id>",
    "detail": "<what failed — cite RAW-PROBE line>",
    "check_id": "<A-xx>",
    "service_id": "<id>",
    "zone": "<zone from system-map>",
    "zone_owner": "<specialist from zones>",
    "severity": "CRITICAL|WARN|INFO",
    "dedup_key": "microservice_degraded:<service_id>:<check_id>"
  }
})
```
Routing: severity ≥ WARN AND dedup_key not seen last 7d → `send_telegram(channel="bug", message="[system-auditor] {severity}: {summary} — see DASHBOARD.md")`. Always append DASHBOARD.md row for WARN/CRITICAL.

**Step E-3 — SIGNAL ROW (mandatory, runs after E-1, no skip path):**
Append row to `docs/data/orch/orch-state.json .signal_queue.rows[]` per signal-dashboard SKILL § WRITE (atomic write, MUST use `.signal_queue.rows += [$row]` — NEVER `.signal_queue[N]`):
```json
{"id": "sau-{ts}", "ts": "{ISO-UTC}", "from": "system-auditor", "to": "po", "type": "signal_feedback", "summary": "{check_id} FAIL: {service_id} — {severity}", "severity": "{CRITICAL|HIGH|MED}", "status": "NEW", "payload_ref": null}
```
**POST-WRITE READ-BACK (mandatory — kills false-green):** After atomic write, assert:
```bash
FOUND=$(jq --arg id "sau-{ts}" '[ .signal_queue.rows[] | select(.id == $id) ] | length' docs/data/orch/orch-state.json 2>/dev/null)
[ "${FOUND:-0}" -lt 1 ] && echo "[SIGNAL-ROW-ASSERT] FAIL: row NOT in .signal_queue.rows[] — orphan key bug" && <emit BUG telegram> && exit 1
echo "[SIGNAL-ROW-ASSERT] OK: row confirmed in .signal_queue.rows[]"
```
If FOUND=0 → FAIL LOUD. NEVER log "row written" without this check passing.
**ANTI-SKIP:** write failure (file locked, jq error) → log `"[SIGNAL-ROW] FAILED: {error}"` + BUG-channel Telegram — do NOT silently continue without the row.
