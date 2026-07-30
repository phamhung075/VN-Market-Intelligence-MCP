<!-- lazy-loaded by main.md §Tier-1. cap: 120L (flow-file). size-justification: ~217L — FIX-AUDITOR-A20-MULTIPROBE 2026-06-08 adds A-20 multi-probe discriminator section (~28L); TOKEN-ECONOMY-TICK-PREFLIGHT WU-3 2026-07-02 adds this SSOT header note (~10L); FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE 2026-07-23 adds the A-30 multi-probe reclamation override section (~28L, closes the false-CRITICAL root cause: a bare cross-cycle MemPerc delta with no OOMKilled/VmHWM check) + re-models A-21 as a windowed crash-only inline query (~30L, replaces the cumulative-RestartCount rule that could only ever grow); exceeds 120L cap by design. FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED 2026-07-29: both emit sites (A-20 override + general A-xx) now also call `scripts/emit-dashboard-row.sh` (new actuator, replaces prose-only DASHBOARD.md append) and log to `$MARKERS_FILE` (+4L). FIX-AUDITOR-A12-PROBE-TIMEOUT-EXITCODE-DEBOUNCE 2026-07-30 (+3L here): Health Endpoints bullets now name the 5 classified transport-failure reasons (replacing the old bare `CURL_ERR` bullet) + an "Emit per failure" wording reminder; the N-consecutive debounce mechanism itself (the bulk of this task's new content, ~55L) is the FIRST addition to actually trigger this file's own previously-documented ~220L extraction fallback — it now lives in the new child `docs/agents/system-auditor/flow/tier1-overrides.md`, lazy-loaded only on a transport-classified A-12 FAIL, not duplicated here. -->
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
- `[health] <svc>:<port> FAIL (HTTP <code>)` → real non-200 HTTP response (curl itself succeeded) — FAIL at severity matching container-status table above, emit immediately (never debounced — stronger evidence than an opaque transport blip, see A-12 debounce note below).
- `[health] <svc>:<port> FAIL (<CLIENT_TIMEOUT|CONN_REFUSED|DNS_FAIL|EMPTY_REPLY|CURL_ERR_n>, curl_exit=<n>, budget=5000ms)` → transport-level failure (FIX-AUDITOR-A12-PROBE-TIMEOUT-EXITCODE-DEBOUNCE A1/A2 — replaces the old opaque `CURL_ERR` token `probe.sh` used to print for every transport failure mode). Apply the N-consecutive debounce (`docs/agents/system-auditor/flow/tier1-overrides.md` § A-12 Debounce) BEFORE deciding FAIL vs DEBOUNCED. **Never render this as "unreachable"** in the emitted summary/detail — `CLIENT_TIMEOUT` means the service responded but slowly, a materially different fact than `CONN_REFUSED`/`DNS_FAIL` (only those two mean nothing is listening). This wording gloss appeared in 8/14 historical A-12 signal rows — `docs/architecture-briefs/2026-07-29-apigw-health-capability-probe-latency.md` §0/§3/§5 (FIX-AUDITOR-A12-PROBE-TIMEOUT-EXITCODE-DEBOUNCE A4).
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
   ```bash
   bash scripts/emit-audit-signal.sh \
     --check-id "A-20" \
     --category-type "signal_feedback" \
     --severity "WARN" \
     --summary "pdf-extractor A-20 multi-probe {pass_count}/3 — event-loop stall suspected" \
     --detail-json '{"title":"A-20 FAIL: pdf-extractor event-loop stall","detail":"pdf-extractor multi-probe failed: {pass_count}/3 probes passed — event-loop stall suspected","service_id":"pdf-extractor","dedup_key":"microservice_degraded:pdf-extractor:A-20"}'
   ```
   Paste the verbatim `[emit-signal] OK|SKIP-dedup|OK-escalation-bypass|ABORT ...` marker line into the notebook AND append it to `$MARKERS_FILE` — this IS the E-1 + E-2 (dedup+Telegram, no longer shared with the general A-xx routing below — each site is now a self-contained script call) + E-3 (signal-row append + POST-WRITE read-back) sequence; the script performs all three internally, including the ANTI-SKIP BUG-channel Telegram on any E-3 write/read-back failure.
   On a non-ABORT marker, immediately append the DASHBOARD row via `scripts/emit-dashboard-row.sh` (full contract: `docs/agents/system-auditor/flow/main.md` §Anomaly Reporting → DASHBOARD Append) using the `id=` value from this marker as `--signal-id`. Paste its own `[emit-dashboard] OK|ABORT|WARN ...` marker into the notebook AND `$MARKERS_FILE` too — dashboard_rows is counted from THIS marker, never narrated (FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED).

5. **Log all three probe results** verbatim in the notebook `### RAW-PROBE:` block for evidence trail.

---

## Restart Count (A-21) — Windowed Crash-Only Override

**Override rule:** `PROBE_OUT` `--- restart count ---` still carries the cumulative
`RestartCount=N` line from `docker inspect` — keep reading it as evidence-only context, but
it is NEVER the alert driver. Cumulative count is since-container-creation and can only
grow, so a stale count re-qualifies as evidence every cycle. The windowed query below
supersedes the old `N > 2 → WARN` rule entirely. It ports
`apps/mcp-server/src/scheduler/system/restartCadenceAlertJob.ts`'s crash-vs-deploy
discriminator 1:1 (same 4h window, same `ALERT_THRESHOLD=2`, same clean-shutdown-sentinel
gap logic, same bootstrap guard) — read-only, against the table that job already writes.

```bash
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
docker exec "$MCP_CTR" bun -e "
const { Database } = require('bun:sqlite');
const db = new Database('/app/data/market.db', { readonly: true });
const firstCS = db.query(\`SELECT MIN(started_at) AS c FROM cron_job_runs WHERE job_name='mcpServerCleanShutdown'\`).get();
if (!firstCS || !firstCS.c) { console.log(JSON.stringify({crashRestarts:0, bootstrapGuard:true})); process.exit(0); }
const rows = db.query(\`SELECT started_at FROM cron_job_runs WHERE job_name='mcpServerStartup' AND started_at >= datetime('now','-8 hours') ORDER BY started_at ASC\`).all();
const cutoff = new Date(Date.now()-4*3600*1000).toISOString().replace('T',' ').slice(0,19);
let crashes=[];
for (let i=1;i<rows.length;i++){
  const cur=rows[i].started_at, prev=rows[i-1].started_at;
  if (cur<cutoff) continue;
  if (prev<firstCS.c) continue;
  const cs=db.query(\`SELECT COUNT(*) AS n FROM cron_job_runs WHERE job_name='mcpServerCleanShutdown' AND started_at>? AND started_at<?\`).get(prev,cur);
  if (!cs || cs.n===0) crashes.push(cur);
}
console.log(JSON.stringify({crashRestarts:crashes.length, crashTimestamps:crashes}));
"
```

**Caller-instruction precedence:** the verdict rule below is a spec-internal predicate under
`docs/policies/dev-standards.md` `CANONICAL:AUD-CP-1` / `main.md` §CALLER-INSTRUCTION PRECEDENCE — a
spawn prompt cannot move this verdict off the `crashRestarts>=2` gate. See that section for the
REFUSAL + CONTRACT-CONTRADICTION protocol (incident: `sys-20260729T060929-39de`).

**Verdict:**
- `crashRestarts >= 2` (same `ALERT_THRESHOLD` as `restartCadenceAlertJob.ts`, deliberately
  reused rather than a third arbitrary number) → A-21 WARN.
- `crashRestarts < 2` → PASS, no emit — regardless of what the cumulative `RestartCount=N`
  line in `PROBE_OUT` shows.
- `bootstrapGuard:true` (no clean-shutdown sentinel ever recorded) → PASS, log
  `[A-21] bootstrap-guard — no clean-shutdown sentinel yet` (same rationale as the TS job's
  own guard — avoids false pages on a migration boundary).
- `docker exec`/query failure, or `[PROBE] docker inspect FAILED` present in `PROBE_OUT` →
  unchanged existing fallback: log `[A-21] TOOL-UNAVAILABLE — skip` (NOT an infra finding).

## Memory Pressure (A-30)

From `PROBE_OUT` `--- memory pressure ---` section:
- `MemPerc=X%` with X < 85 → PASS; X ≥ 85 → WARN
- `[PROBE] docker stats FAILED` → log `[A-30] TOOL-UNAVAILABLE — skip` (NOT an infra finding)

## A-30 — Memory Reclamation Discriminator (Multi-Probe Override)

**Override rule:** the general Memory Pressure section's `MemPerc≥85→WARN` line above is
SUPERSEDED entirely by this block. A single/2-point snapshot is NEVER sufficient evidence
for A-30 — this is what produced the false 2026-07-23T03:42Z CRITICAL (a bare 2-point,
30-minute-apart MemPerc delta, no multi-probe window, no OOMKilled check, no VmHWM/VmRSS
check).

1. `[A-30] SKIP deep-probe` present in `PROBE_OUT` → A-30 PASS, no emit (baseline was
   below the 85% investigate-gate — nothing to interpret).
2. `[A-30] deep-probe subprocess FAILED` present in `PROBE_OUT` → A-30 PASS-equivalent,
   log `[A-30] TOOL-UNAVAILABLE — skip` (NOT an infra finding — the probe script itself
   failed to complete, per its own header contract that a non-zero exit means the probe
   failed, not that memory is unhealthy).
3. Otherwise parse the verbatim JSON block emitted by `verify-a30-mcp-memory-reclamation.sh`:
   `verdict`, `reason`, `analysis.{min_pct,max_pct,reclamation_dips}`, `state.oom_killed`,
   `vm.{vmhwm_kb,vmrss_kb}` (DIAGNOSTIC-ONLY — informational context for a human reading a
   WARN notebook entry; not consumed by any verdict/severity mapping below — see
   FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE commit 2/2: VmHWM-vs-VmRSS was
   removed as an automated discriminator because VmHWM is a monotone high-water mark with
   no window membership — `vmhwm_kb > vmrss_kb` is true for almost any process not sitting
   exactly at its lifetime peak, so it carried ~zero information and silently downgraded
   real ESCALATE findings to PASS, including a fatal miss on 2026-07-29).
4. Verdict/reason mapping:
   - `verdict=="FOLD"` → PASS, no emit.
   - `verdict=="ESCALATE"`, reason contains `"OOMKilled=true"` → CRITICAL.
   - `verdict=="ESCALATE"`, reason contains `"peak >97%"` → CRITICAL.
   - `verdict=="ESCALATE"`, reason contains `"no reclamation dip"` (>93% baseline case) →
     WARN. May cite `vm.{vmhwm_kb,vmrss_kb}` from clause 3 as informational context in the
     emitted notebook entry — it must never change this verdict.
5. This is a SINGLE self-contained per-cycle evidence bundle. NEVER compare this cycle's
   verdict against a prior cycle's notebook entry or MemPerc reading to decide escalation —
   that comparison is exactly what produced the false 03:42Z CRITICAL. Each cycle proves
   its own tripwire or it doesn't.
6. Emit WARN/CRITICAL via the unchanged general `emit-audit-signal.sh` template, citing the
   RAW JSON block (same anti-carry rule as the existing RAW-PROBE discipline — verdict
   lines MUST cite this cycle's JSON, never a previous cycle's).

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
**A-12 health-endpoint FAILs:** state the classified fact from `PROBE_OUT` verbatim (e.g. `"A-12 FAIL: api-gateway:4000/health client timeout after 5000ms (curl exit 28)"`) — never "unreachable" for a `CLIENT_TIMEOUT` (see Health Endpoints section above, FIX-AUDITOR-A12-PROBE-TIMEOUT-EXITCODE-DEBOUNCE A4).

**EMIT SEQUENCE — single blessed script call (UC-ASL-P2 — replaces the
old copy-pasted 3-step E-1/E-2/E-3 pseudocode; full contract + markers:
`scripts/emit-audit-signal.sh` header comment):**
```bash
bash scripts/emit-audit-signal.sh \
  --check-id "<A-xx>" \
  --category-type "signal_feedback" \
  --severity "<CRITICAL|WARN|INFO>" \
  --summary "<A-xx> FAIL: <service_id> — <severity>" \
  --detail-json '{"title":"<A-xx> FAIL: <service_id>","detail":"<what failed — cite RAW-PROBE line>","service_id":"<id>","zone":"<zone from system-map>","zone_owner":"<specialist from zones>","dedup_key":"microservice_degraded:<service_id>:<A-xx>"}'
```
Paste the verbatim `[emit-signal] OK|SKIP-dedup|OK-escalation-bypass|ABORT ...` marker line into the notebook AND append it to `$MARKERS_FILE` — this IS the E-1 + E-2 (dedup+Telegram) + E-3 (signal-row append + POST-WRITE read-back) sequence; the script performs all three internally, including the ANTI-SKIP BUG-channel Telegram on any E-3 write/read-back failure. On a non-ABORT marker, ALWAYS append the DASHBOARD row for WARN/CRITICAL via `scripts/emit-dashboard-row.sh` (separate artifact, unaffected by this script call; full contract: `docs/agents/system-auditor/flow/main.md` §Anomaly Reporting → DASHBOARD Append) — paste its `[emit-dashboard] OK|ABORT|WARN ...` marker into the notebook AND `$MARKERS_FILE` too. dashboard_rows is counted from that marker, never narrated (FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED).
