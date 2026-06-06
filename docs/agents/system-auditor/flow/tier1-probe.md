<!-- lazy-loaded by main.md §Tier-1. cap: 120L (flow-file). -->
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
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_system_status", arguments: {}})
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_cron_health", arguments: {}})
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
