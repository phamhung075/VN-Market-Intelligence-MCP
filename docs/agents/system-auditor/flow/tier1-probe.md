<!-- lazy-loaded by main.md §Tier-1. cap: 120L (flow-file). size-justification: ~155L — FIX-AUDITOR-A20-MULTIPROBE 2026-06-08 adds A-20 multi-probe discriminator section (~28L); TOKEN-ECONOMY-TICK-PREFLIGHT WU-3 2026-07-02 adds this SSOT header note (~10L); FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE 2026-07-23 adds the A-30 multi-probe reclamation override section (~28L, closes the false-CRITICAL root cause: a bare cross-cycle MemPerc delta with no OOMKilled/VmHWM check) + re-models A-21 as a windowed crash-only inline query (~30L, replaces the cumulative-RestartCount rule that could only ever grow); exceeds 120L cap by design; extraction to separate file (`docs/agents/system-auditor/flow/tier1-overrides.md`) remains the documented fallback if a future addition pushes this past ~220L — not yet crossed. FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED 2026-07-29: both emit sites (A-20 override + general A-xx) now also call `scripts/emit-dashboard-row.sh` (new actuator, replaces prose-only DASHBOARD.md append) and log to `$MARKERS_FILE` (+4L). -->
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
   `vm.{vmhwm_kb,vmrss_kb}`.
4. Verdict/reason mapping — CRITICAL branches are evaluated FIRST and are UNCONDITIONAL;
   no downstream clause may veto or downgrade them
   (FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE, commit 1/2 — re-sequences the
   clause below, still named ADDITIONAL VETO, which previously ran BEFORE this mapping and
   pre-empted both CRITICAL branches; see that row for the full defect history):
   - `verdict=="FOLD"` → PASS, no emit.
   - `verdict=="ESCALATE"`, reason contains `"OOMKilled=true"` → CRITICAL. Unvetoable.
   - `verdict=="ESCALATE"`, reason contains `"peak >97%"` → CRITICAL. Unvetoable.
   - `verdict=="ESCALATE"`, reason contains `"no reclamation dip"` (>93% baseline case) →
     apply the **ADDITIONAL VETO** (closes a gap in the unmodified script — it collects
     `vm.vmhwm_kb`/`vmrss_kb` but does not itself gate on them): if `vmhwm_kb` and
     `vmrss_kb` are both numeric (not `"UNAVAILABLE"`) AND `vmhwm_kb > vmrss_kb` →
     downgrade to PASS, no emit (peak-before-window reclamation already proven, even if
     this window's 6 samples sit on a plateau that never crosses the intra-window dip
     detector). Otherwise → WARN.
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
