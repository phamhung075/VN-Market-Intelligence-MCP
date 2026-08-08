<!-- lazy-loaded by main.md §Tier-1. cap: 120L (flow-file). size-justification: ~217L — FIX-AUDITOR-A20-MULTIPROBE 2026-06-08 adds A-20 multi-probe discriminator section (~28L); TOKEN-ECONOMY-TICK-PREFLIGHT WU-3 2026-07-02 adds this SSOT header note (~10L); FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE 2026-07-23 adds the A-30 multi-probe reclamation override section (~28L, closes the false-CRITICAL root cause: a bare cross-cycle MemPerc delta with no OOMKilled/VmHWM check) + re-models A-21 as a windowed crash-only inline query (~30L, replaces the cumulative-RestartCount rule that could only ever grow); exceeds 120L cap by design. FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED 2026-07-29: both emit sites (A-20 override + general A-xx) now also call `scripts/emit-dashboard-row.sh` (new actuator, replaces prose-only DASHBOARD.md append) and log to `$MARKERS_FILE` (+4L). FIX-AUDITOR-A12-PROBE-TIMEOUT-EXITCODE-DEBOUNCE 2026-07-30 (+3L here): Health Endpoints bullets now name the 5 classified transport-failure reasons (replacing the old bare `CURL_ERR` bullet) + an "Emit per failure" wording reminder; the N-consecutive debounce mechanism itself (the bulk of this task's new content, ~55L) is the FIRST addition to actually trigger this file's own previously-documented ~220L extraction fallback — it now lives in the new child `docs/agents/system-auditor/flow/tier1-overrides.md`, lazy-loaded only on a transport-classified A-12 FAIL, not duplicated here. FIX-AUDIT-OUTPUT-CONTRACT-SIGNALQUEUE-ROWS-WRITTEN-SELFREPORT-MISMATCH 2026-08-05 (+2L): both `emit-audit-signal.sh` call sites (A-20 override + general A-xx) now pass `--cycle-tag "$FIRE_TASK_ID"` — see `main.md`'s own size-justification note for the full rationale. FIX-AUDITOR-A30-DISCRIMINATOR-CRASH-CLIFF-SCORED-AS-RECLAMATION-DIP 2026-08-08 (+~5L net): A-30 override clause 3's parsed-field list widened to the script's new before/after state + vm fields, dropped the stale "FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE commit 2/2" citation (that id was never minted — folded into this task instead) and corrected the "not consumed by any verdict/severity mapping" claim (VmHWM-pinned-at-cap IS now a verdict signal, just never compared against VmRSS); clause 4's reason-substring table widened from 3 to 6 mapped phrases (the 3 new escalate paths: state-changed, death-signature, discontinuity, vmhwm-pinned all map CRITICAL) and the >93%-floor case's matched substring corrected from the now-inaccurate "no reclamation dip" to "loss of reclamation" (a dip can legitimately be present now, fix (b)). FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE (po_redispatch_ruling_20260808T1445Z) 2026-08-08 (+~33L): PLANE B port — `probe.sh`'s A-30 investigate-gate is now evaluated PER CONTAINER (was mcp-server-only, demonstrated false-negative via the c51/c53 matched pair: mcp-server crossing its own 85% gate alone decided whether rag-service was sampled at all). Added a new "PER-CONTAINER GATE" preamble paragraph (~9L) plus widened clauses 1/2/3/4/5/6 (~24L net) to read/parse/emit against however many SKIP lines and JSON blocks appear per cycle (zero, one, or many) instead of assuming exactly one; clause 3 also documents the new `vmhwm_kb_before`/`_after` "UNAVAILABLE" cause (Amendment B host-side headroom pre-check skip, not a tool failure) and clause 6 now mandates the container name inside `dedup_key` so distinct containers never collide in the shared dedup ledger. -->
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
     --detail-json '{"title":"A-20 FAIL: pdf-extractor event-loop stall","detail":"pdf-extractor multi-probe failed: {pass_count}/3 probes passed — event-loop stall suspected","service_id":"pdf-extractor","dedup_key":"microservice_degraded:pdf-extractor:A-20"}' \
     --cycle-tag "$FIRE_TASK_ID"
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

**PER-CONTAINER GATE (FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE,
po_redispatch_ruling_20260808T1445Z):** `probe.sh`'s `≥85% investigate-gate` is evaluated
independently for EVERY running, memory-capped container (`_a30_run_investigate_gate()` in
`probe.sh`), never once against mcp-server alone. This closes a demonstrated same-day
matched-pair false-negative: mcp-server crossing its own 85% gate previously decided,
fleet-wide, whether rag-service's condition was even sampled (c51 mcp-server 89.69%→gate
ENGAGED→rag-service 96.91% BELOW-FLOOR named, DEGRADED; c53 29min later mcp-server
84.75%→gate SKIPPED→rag-service line ABSENT entirely despite sitting at 92.81-98.78% the
whole time, ALL_GREEN). Consequence for this section: `PROBE_OUT`'s
`--- memory pressure multi-probe reclamation (A-30) ---` block may now contain MULTIPLE
lines/JSON blocks in one cycle — zero, one, or many, one triplet (SKIP line, or ENGAGE line
+ its own JSON) PER capped container. Read every line in that block; never assume exactly
zero or one.

1. For each container: `[A-30] SKIP deep-probe — <container> baseline X% < 85%
   investigate-gate` present → that container is PASS, no emit (baseline was below the gate
   — nothing to interpret for it). A cycle can have some containers SKIP and others ENGAGE
   simultaneously — evaluate each independently.
2. For each ENGAGEd container: `[A-30] <container>: deep-probe subprocess FAILED` present →
   that container is PASS-equivalent, log `[A-30] <container> TOOL-UNAVAILABLE — skip` (NOT
   an infra finding — the probe script itself failed to complete for that one container, per
   its own header contract that a non-zero exit means the probe failed, not that memory is
   unhealthy).
3. Otherwise parse EVERY verbatim JSON block emitted by `verify-a30-mcp-memory-
   reclamation.sh` this cycle (one per ENGAGEd container — its own `container` field
   self-identifies which): `verdict`, `reason`,
   `analysis.{min_pct,max_pct,median_pct,reclamation_dips,discontinuities}`,
   `state.{oom_killed_before,oom_killed_after,restart_count_before,restart_count_after,
   state_changed_during_window}`, `vm.{vmhwm_kb_before,vmhwm_kb_after,
   vmhwm_advancing_in_window,vmhwm_pinned_at_cap}`. `vm.*` IS now consumed by the script's
   own `verdict` (FIX-AUDITOR-A30-DISCRIMINATOR-CRASH-CLIFF-SCORED-AS-RECLAMATION-DIP,
   2026-08-08, absorbed the never-minted FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE):
   the OLD vmhwm-vs-vmrss comparison was a tautology (VmHWM is a monotone high-water mark,
   so `vmhwm_kb >= vmrss_kb` is true by definition at all times, proving nothing) and was
   correctly never wired into the verdict — but `vmhwm_pinned_at_cap && vmhwm_advancing_in_window`
   (a NEW peak set near the cgroup memory limit during THIS window) is a real, distinct
   signal the script's own if-chain now escalates on directly; clause 4 below never needs
   to independently re-derive it from the raw kB fields. `vmhwm_kb_before`/`_after` may read
   `"UNAVAILABLE"` for a reason that is NOT a tool failure: `verify-a30-mcp-memory-
   reclamation.sh` Amendment B (same task) gates its two `docker exec` calls behind a
   host-side headroom pre-check and skips the exec entirely below `MEM_FLOOR_MIB=40` — this
   is a deliberate safety skip, not a probe defect, and costs zero detection: with VmHWM
   absent the verdict falls through cleanly to the exec-free `min_pct>93`/`median_pct>97`
   branches in clause 4 below.
4. Verdict/reason mapping, PER JSON BLOCK (the script's own `verdict` field already resolves
   every signal for that container — this table exists only to pick WARN vs CRITICAL from
   the `reason` text; always cite the block's own `container` field in the emitted
   summary/detail, never assume it is mcp-server):
   - `verdict=="FOLD"` → that container PASS, no emit.
   - `verdict=="ESCALATE"`, reason contains any of `"died/restarted during window"`
     (state_changed, fix a), `"OOMKilled=true"`, `"FinishedAt delta"` (death signature,
     fix d), `"discontinuity"` (crash cliff >40pp, fix c), `"VmHWM advancing"` (fix e), or
     `"peak >97%"` (median-sustained peak, fix b) → CRITICAL (confirmed/severe death or
     crash-cliff evidence).
   - `verdict=="ESCALATE"`, reason contains `"loss of reclamation"` (the >93%-sustained-
     floor case, fix b — no longer vetoed by a lone jitter dip) → WARN.
5. Each JSON block is a SINGLE self-contained per-cycle, per-container evidence bundle.
   NEVER compare one container's verdict this cycle against a DIFFERENT container's prior
   reading, and NEVER compare this cycle's verdict against a prior cycle's notebook entry or
   MemPerc reading to decide escalation — that comparison is exactly what produced the false
   03:42Z CRITICAL. Each container, each cycle, proves its own tripwire or it doesn't.
6. Emit WARN/CRITICAL PER BREACHING CONTAINER via the unchanged general `emit-audit-
   signal.sh` template, citing that container's own RAW JSON block (same anti-carry rule as
   the existing RAW-PROBE discipline — verdict lines MUST cite this cycle's JSON for THAT
   container, never a previous cycle's or a different container's). `dedup_key` MUST include
   the container name (e.g. `"microservice_degraded:<container>:A-30"`, same template the
   general Emit per failure section already uses) so distinct containers never collide in
   the 7-day dedup ledger — a suppressed mcp-server repeat must never also suppress a fresh
   rag-service breach, or vice versa.

## Disk (A-32)

From `PROBE_OUT` `--- disk df -h / ---` section:
- Capacity column < 85% → PASS; ≥ 85% → WARN; ≥ 95% → CRITICAL

## Hook Enforcement Liveness (A-33) — UC-CRITIC-HOOKS-ENFORCEMENT FR-3

**Rationale:** `Bash(*)` allow-all + per-event-only hooks means a hook script can be
deleted, `chmod -x`'d, or have its `.claude/settings*.json` entry removed outright, and
nothing else in the system ever fires to say so — no event depends on the hook having
run. This is an independent, periodic check that the enforcement mechanism itself is
still wired up, separate from any single tool-call outcome.

**Scope:** the 4 CRITICAL/HIGH load-bearing hooks (checks a/b/c below) +
the 3 LOW-tier hooks (check c only — registration-presence, per FR-6; no
file-existence/executable-bit treatment for these, matching their exempt-from-full-
redesign status in the BA risk tiers).

```bash
SETTINGS_LOCAL="$PROJECT_ROOT/.claude/settings.local.json"   # untracked/gitignored — read from disk, not git
SETTINGS_TRACKED="$PROJECT_ROOT/.claude/settings.json"

check_hook_liveness() {
  local script_rel="$1" settings_file="$2" match_substr="$3"
  local script_abs="$PROJECT_ROOT/$script_rel"
  local reasons=()

  if [ -n "$script_rel" ]; then
    [ -f "$script_abs" ] || reasons+=("missing:$script_rel")
    [ -f "$script_abs" ] && [ ! -x "$script_abs" ] && reasons+=("not-executable:$script_rel")
  fi

  if [ -f "$settings_file" ]; then
    jq -e --arg m "$match_substr" \
      '[.hooks[][] | .hooks[]?.command // empty | select(contains($m))] | length > 0' \
      "$settings_file" >/dev/null 2>&1 || reasons+=("not-registered:$match_substr")
  else
    reasons+=("settings-file-missing:$settings_file")
  fi

  echo "${reasons[*]}"
}
```

**4 load-bearing checks (a=exists, b=executable, c=registered):**
```
check_hook_liveness "scripts/agents-flow/orch-state-hook-bash-backstop.sh" "$SETTINGS_LOCAL" "orch-state-hook-bash-backstop.sh"
check_hook_liveness "scripts/agents-flow/context-bloat-backstop.sh"        "$SETTINGS_LOCAL" "context-bloat-backstop.sh"
check_hook_liveness "scripts/agents-flow/notebook-auto-prune.sh"           "$SETTINGS_LOCAL" "notebook-auto-prune.sh"
check_hook_liveness "scripts/agents-flow/branch-hygiene-stop.sh"           "$SETTINGS_LOCAL" "branch-hygiene-stop.sh"
```

**3 LOW-tier checks (c only — pass `""` as script_rel to skip a/b):**
```
check_hook_liveness "" "$SETTINGS_LOCAL"   "tmux-agent.sh status"
check_hook_liveness "" "$SETTINGS_LOCAL"   "tmux set-option"
check_hook_liveness "" "$SETTINGS_TRACKED" "graphify"
```

**Verdict:** any non-empty `reasons` string for a load-bearing (CRITICAL/HIGH) hook →
WARN (this backstop itself may be silently disabled — the exact failure class this
task exists to close). A non-empty reasons string for a LOW-tier hook → INFO only (no
signal — cosmetic-only blast radius per BA risk tiers, FR-6).

**FR-3(d) explicitly descoped:** "evidence it fired in a window its trigger condition
was met" is NOT checked here — no fire-log plumbing exists today and building one would
be new infrastructure (violates FR-4's "reuse existing, don't invent" + NFR-4's "no new
dependency stack"). Checks (a)+(b)+(c) alone already close the two edge cases BA named in
§5 (file deleted/renamed, chmod'd non-executable).

**Emit on WARN** (load-bearing hooks only; dedup scoped per-script per NFR-2):
```bash
bash scripts/emit-audit-signal.sh \
  --check-id "A-33" \
  --category-type "signal_feedback" \
  --severity "WARN" \
  --summary "A-33 hook-liveness: <script-basename> — <reasons>" \
  --detail-json '{"title":"A-33 FAIL: hook enforcement liveness","detail":"<script-basename>: <reasons>","dedup_key":"hook_enforcement_liveness:<script-basename>"}' \
  --cycle-tag "$FIRE_TASK_ID"
```
Paste the verbatim `[emit-signal] OK|SKIP-dedup|OK-escalation-bypass|ABORT ...` marker
into the notebook AND `$MARKERS_FILE` — same E-1/E-2/E-3 contract as every other A-xx
emit in this file (§ Emit per failure below).

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
  --detail-json '{"title":"<A-xx> FAIL: <service_id>","detail":"<what failed — cite RAW-PROBE line>","service_id":"<id>","zone":"<zone from system-map>","zone_owner":"<specialist from zones>","dedup_key":"microservice_degraded:<service_id>:<A-xx>"}' \
  --cycle-tag "$FIRE_TASK_ID"
```
Paste the verbatim `[emit-signal] OK|SKIP-dedup|OK-escalation-bypass|ABORT ...` marker line into the notebook AND append it to `$MARKERS_FILE` — this IS the E-1 + E-2 (dedup+Telegram) + E-3 (signal-row append + POST-WRITE read-back) sequence; the script performs all three internally, including the ANTI-SKIP BUG-channel Telegram on any E-3 write/read-back failure. On a non-ABORT marker, ALWAYS append the DASHBOARD row for WARN/CRITICAL via `scripts/emit-dashboard-row.sh` (separate artifact, unaffected by this script call; full contract: `docs/agents/system-auditor/flow/main.md` §Anomaly Reporting → DASHBOARD Append) — paste its `[emit-dashboard] OK|ABORT|WARN ...` marker into the notebook AND `$MARKERS_FILE` too. dashboard_rows is counted from that marker, never narrated (FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED).
