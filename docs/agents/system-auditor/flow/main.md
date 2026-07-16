<!-- size-justification: ~787L — three-tier dispatcher; Tier-1 detail extracted to tier1-probe.md; Tier-2/Tier-3 bodies remain inline (extraction sprint deferred per PO, see backlog T-06); full change history in git log. -->
# System Auditor — Main Flow

## PLAN-ONLY INVARIANT — NO DESTRUCTIVE OPS (AUD-ND-1)

This agent is a DETECTOR. It MUST NEVER perform infrastructure remediation.

### Forbidden operations (absolute, no exceptions)
- docker stop / docker kill / docker rm / docker restart (any service, any argument)
- docker compose down / docker compose up (any flags)
- kill / pkill / killall (any PID or process name)
- rm -rf of ANY live data directory (/app/data/, /root/, any DB path, any volume mount)
- Any shell command that terminates, removes, or restarts a running container or process

### Positive contract — the ONLY permitted response to any CRITICAL/WARN finding
1. Emit a typed signal row via `post_agent_signal` (signal_type: signal_feedback — live enum contract; carry check_id + severity + dedup_key in payload).
2. Append a DASHBOARD.md row per signal-dashboard skill (status=OPEN, severity, zone_owner, check_id).
3. Send a BUG channel Telegram alert (dedup 7d per dedup_key, severity ≥ WARN).
4. EXIT the cycle.

Detection is the job. Remediation is ops/developer's job, triggered via DASHBOARD/BUG.

### Incident anchor (do not remove)
AUD-ND-1 regression history:
- 2026-05-31 21:08Z: false ENOSPC → docker stop mcp-server → 9 min outage (commit 9c381ed3)
- 2026-06-01 09:00–15:19 UTC: false-positive docker stop during VN trading hours → Monday intraday price data PERMANENTLY DESTROYED (irreversible — live-only pipeline, no backfill)

---

**Tools:** `docs/agents/tools/package/system-auditor.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

## Input
- `AUDIT_TIER` variable: `1` | `2` | `3` (default: `3` if not set)
- Live system state (docker daemon, DB files, MCP server)

## Output
- Typed signals via `post_agent_signal`
- BUG channel alerts (severity ≥ WARN, dedup 7d per dedup_key)
- DASHBOARD.md rows for all WARN/CRITICAL findings
- Notebook section-append + prune (skill: notebook-write, ≤200L hard cap)

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `system-auditor`)

**Step 0c — Load system-map.json** — lazy-load trigger: `runtime_or_fetch_or_db_audit`. Read `docs/data/system-map.json` and extract:
- `project.microservices[]` → service ids, external_ports, zones (full catalog — for health endpoint ports and zone_owner lookup)
- `project.infrastructure.docker.host_runtime_set.services[]` → **INTENDED runtime set** — the only set used for container-UP checks in Tier-1. Services NOT in this list are not deployed by design and MUST be reported INFO/grey, never CRITICAL/WARN.
- `project.infrastructure.docker.host_runtime_set.not_deployed_by_design[]` → cross-check list for INFO labelling
- `project.data_sources[]` → source ids, expected_cadence_hours, stale_threshold_hours, geo_blocked
- `project.infrastructure.databases[]` → DB ids, paths
- `project.zones[]` → zone id → specialist (zone_owner)

---

## Tier Dispatch

**AUDIT_TIER extraction (mandatory — run before any other step):**
Scan the spawn prompt verbatim for the token `AUDIT_TIER=<value>`. Extract the integer value.
- Found `AUDIT_TIER=1` → set AUDIT_TIER=1
- Found `AUDIT_TIER=2` → set AUDIT_TIER=2
- Found `AUDIT_TIER=3` → set AUDIT_TIER=3
- Not found or unrecognized value → **default AUDIT_TIER=3** (log: `"[TIER-DISPATCH] AUDIT_TIER not set — defaulting to 3"`)

The extracted tier value MUST propagate to:
1. The tier-dispatch branch below (determines which checks run)
2. The notebook cycle entry heading (the `Tier-N` label in `### Audit Run Tier-N` MUST match this value, not an assumed value)
3. The RETURN line (`tier-N` token)

- **TIER=1** → run §Tier-1 Runtime Ping only → skip all other steps → notebook (label: Tier-1, gated — see §Notebook Append Gate) → RETURN
- **TIER=2** → run §Tier-2 Freshness Sweep only → skip all other steps → notebook (label: Tier-2, gated — see §Notebook Append Gate) → RETURN
- **TIER=3** → run §Tier-1 + §Existing Doc/Memory Audit (steps 1–6) + §Tier-3 DB Integrity → notebook (label: Tier-3, gated — see §Notebook Append Gate) → RETURN

---

## Step 0d — Fire-Time Election (P3 — TASK_1994)

<!-- P3-FIRE-ELECTION: runs AFTER AUDIT_TIER extraction, BEFORE any tier-specific work.
     Each tier has its own cron expression → its own TICK boundary → its own cron task_id.
     task_kind="sprint-task" (consistent with SF-1 and existing sprint-task enum).
     TTL=600s; no heartbeat. Explicit release at end of each tier's work body.
     On election LOSS: EXIT cleanly (another session already leads this tick for this tier).
     Spec: addendum §A.5 (tier flow-slugs), §C (P3-AF-1-c), §D (TTL + no heartbeat). -->

```
# Compute FIRE_TICK and audit_task_id based on AUDIT_TIER:

if AUDIT_TIER == 1:
  # cron expression: */30 * * * * (boundary minutes: :00, :30)
  CURRENT_MIN_SA=$(date -u +%M)
  BOUNDARY_MIN_SA=$(( (CURRENT_MIN_SA / 30) * 30 ))
  FIRE_TICK=$(date -u +"%Y-%m-%dT%H:$(printf '%02d' $BOUNDARY_MIN_SA)Z")
  FIRE_TASK_ID = "cron:auditor-t1:" + FIRE_TICK

elif AUDIT_TIER == 2:
  # cron expression: 0 */4 * * * (boundary hours: 00, 04, 08, 12, 16, 20)
  CURRENT_HR_SA=$(date -u +%H)
  BOUNDARY_HR_SA=$(( (CURRENT_HR_SA / 4) * 4 ))
  FIRE_TICK=$(date -u +"%Y-%m-%dT$(printf '%02d' $BOUNDARY_HR_SA):00Z")
  FIRE_TASK_ID = "cron:auditor-t2:" + FIRE_TICK

elif AUDIT_TIER == 3:
  # cron expression: 0 2 * * * (fixed: 02:00 UTC daily)
  FIRE_TICK=$(date -u +"%Y-%m-%dT02:00Z")
  FIRE_TASK_ID = "cron:auditor-t3:" + FIRE_TICK

fire_result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              FIRE_TASK_ID,
  task_kind:            "sprint-task",
  owner_agent:          "system-auditor",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds:          600,
  payload:              {"site": "fire-election", "tier": AUDIT_TIER, "tick": FIRE_TICK}
})

if fire_result.claimed == false:
  fire_peer = fire_result.current_holder.owner_client_session
  if fire_peer == $CLAUDE_CODE_SESSION_ID:
    # Re-entrant (restart within same session mid-tick) — renew + proceed
    log "[system-auditor] fire-election RE-ENTRANT tier=" + AUDIT_TIER + " tick=" + FIRE_TICK
    call_tool(server="vn-market", tool="task_heartbeat", arguments={
      task_id: FIRE_TASK_ID, owner_client_session: $CLAUDE_CODE_SESSION_ID
    })
    # proceed with tier work
  else:
    log "[system-auditor] fire-election SKIP tier=" + AUDIT_TIER + " tick=" + FIRE_TICK + " — peer=" + fire_peer
    call_tool(server="vn-market", tool="send_telegram", arguments={
      channel: "work",
      message: "[system-auditor] Tier-" + AUDIT_TIER + " fire-election SKIP tick=" + FIRE_TICK + " (peer session leads)"
    })
    EXIT   # clean exit — no audit work; no orphan signals
# else: claimed=true → won the election → proceed with tier work
# Release FIRE_TASK_ID at end of tier's notebook-write + commit step (see each tier's end-of-cycle).
```

**Release convention:** call `task_release(task_id=FIRE_TASK_ID, owner_client_session=$CLAUDE_CODE_SESSION_ID)` at the very end of the tier's cycle (after notebook write + commit step). This is the final step before RETURN. TTL=600s is the crash-safety backstop; explicit release is the normal exit path.

---

## Tier-1 — Runtime Ping

→ **lazy-load:** `docs/agents/system-auditor/flow/tier1-probe.md` (full probe protocol: probe.sh execution, RAW-PROBE fence, A-01..A-32 verdict rules, emit schema).

**Evidence-collection mandate (FIX-AUDITOR-EVIDENCE-INTEGRITY):**
Run `bash docs/agents/system-auditor/probe.sh` ONCE. Paste verbatim stdout into the notebook under `### RAW-PROBE:` fenced block. ALL container/health verdict lines MUST reference this block. Anti-carry: NEVER copy container/health lines from a previous notebook section — they must come from the current-cycle RAW-PROBE block only.

---

## Tier-2 — Freshness Sweep

**Wall time target: < 300s. Scope: cron fire gaps, per-source fetch freshness, VPS routes, news/signals freshness.**

### Cron Fire Check (A-29)
```
call_tool(server="vn-market", tool="get_cron_health", arguments={})
```
For each cron in system-map.json microservices[0].crons:
- Compute expected last-fire from schedule expression
- Compare to actual `last_run_ts` from get_cron_health response
- Flag if gap > 2× cadence
- Special case `bctcBatchSweep` (schedule: `0 9 25 1,4,7,10 *`): only check within 72h of expected fire date to avoid false alerts

### Per-Source Fetch Freshness (B-01 through B-07, B-11, B-12)
```
call_tool(server="vn-market", tool="get_pipeline_health", arguments={})
call_tool(server="vn-market", tool="get_vps_proxy_health", arguments={})
call_tool(server="vn-market", tool="get_vps_service_health", arguments={})
call_tool(server="vn-market", tool="get_rate_limit_status", arguments={})
call_tool(server="vn-market", tool="get_macro_snapshot", arguments={})
call_tool(server="vn-market", tool="get_sla_status", arguments={})
```
For each source in system-map.json data_sources:
- Read `expected_cadence_hours` from system-map.json (never hardcode)
- Resolve the effective `stale_threshold_hours` for this source using the **SLA resolver** below (never hardcode)
- Compare `last_fetch_ts` from get_pipeline_health to the resolved effective threshold
- Skip foreign-flow check outside VN market hours (09:00–15:30 VN = 02:00–08:30 UTC M-F)
- VPS proxy: all 7 routes must return `status: ok` (B-06, B-07)
- Rate limits: no source at 100% (B-12)

#### SLA Resolver — per-source effective threshold (SSOT: system-map.json .project.data_sources[].sla)

For every source, resolve the effective stale threshold as follows (read ALL values from system-map.json — never hardcode):

1. If the source has NO `sla` block → use `stale_threshold_hours` directly. Done.
2. If `sla.mode == "earnings-window-dependent"`:
   a. Read `sla.earnings_window.trigger_months[]` and `sla.earnings_window.window_days_after_quarter_end` from system-map.json.
   b. Compute today's UTC month (M) and day (D).
   c. **In-window test:** `M ∈ trigger_months AND D ≤ window_days_after_quarter_end` → use `sla.earnings_window.stale_threshold_hours`.
   d. **Out-of-window:** compute `hours_since_last_earnings_window_end + 0.5h grace` (dynamic, NOT the flat `sla.default_stale_threshold_hours`).
      - `last_earnings_window_end` = end-of-day (23:59 UTC) of `window_days_after_quarter_end` of the most recent prior trigger month.
      - Example: today=2026-06-25 → last window end = 2026-04-14 23:59 UTC → hours_since ≈ 1714h → threshold ≈ 1714.5h.
      - This prevents false-CRITICAL during the 10-week inter-quarter quiet period (FIX-BCTC-SLA-THRESHOLD-360).
   e. This replaces the flat `stale_threshold_hours` value for this source in this cycle.
3. Any other `sla.mode` value not listed above → use `stale_threshold_hours` (safe fallback) and emit a WARN log: `"[SLA-RESOLVER] unknown sla.mode '<value>' for source <id> — falling back to stale_threshold_hours"`.

Example evaluation for `bctc-discover` on 2026-04-10 (M=4, D=10, trigger_months=[1,4,7,10], window_days=14):
- M=4 ∈ [1,4,7,10] AND D=10 ≤ 14 → IN window → effective threshold = 24h (earnings-window active).

Example evaluation for `bctc-discover` on 2026-05-20 (M=5, D=20):
- M=5 ∉ [1,4,7,10] → OUT of window → last window end = 2026-04-14 23:59 UTC → hours_since ≈ 876h → threshold ≈ 876.5h.

Example evaluation for `bctc-discover` on 2026-06-25 (B-05/B-06 RAW scenario):
- M=6 ∉ [1,4,7,10] → OUT of window → last window end = 2026-04-14 23:59 UTC → hours_since ≈ 1714h → threshold ≈ 1714.5h.
- push-age=199.7h << 1714.5h → **PASS** (pipeline healthy idle). Never a CRITICAL.

**No prose-only BCTC staleness rule exists. This resolver IS the rule.**

#### BCTC Healthy-Idle Gate (B-05 — FIX-BCTC-SLA-THRESHOLD-360, sub-root c)

**MANDATORY: apply this gate BEFORE emitting any B-05 signal for `bctc-discover`.**

Event-driven push-age is NOT a crash signal. A large push-age for `bctc-discover` ONLY indicates a problem when the pipeline has PENDING work that is not being processed. When queue=0, the silence is BY DESIGN (off-season idle, not a fault).

Gate logic (execute when evaluating `bctc-discover` staleness):
```bash
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
# Gate 1: count actionable queue rows (pending / url_not_found / enrich_failed)
BCTC_ACTIVE=$(docker exec "$MCP_CTR" bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('/app/data/market.db', {readonly: true});
const r = db.query(\"SELECT COUNT(*) AS c FROM bctc_vps_queue WHERE status IN ('pending','url_not_found','enrich_failed')\").get();
console.log(r.c);
db.close();
" 2>/dev/null || echo "ERROR")

# Gate 2: VPS host liveness (from Tier-1 probe.sh output already in PROBE_OUT)
# Use the vps_uptime_seconds value from get_vps_proxy_health or Tier-1 host status.
```

**Verdict:**
- `BCTC_ACTIVE = ERROR` (DB unreachable) → skip gate, apply normal SLA threshold.
- `BCTC_ACTIVE = 0` (no pending work) AND host Tier-1 = UP → verdict: **HEALTHY IDLE** — log `"[B-05] bctc-discover: queue=0 host-up off-season — healthy idle, NOT stale"`. Do NOT emit any signal. Do NOT flag as stale.
- `BCTC_ACTIVE > 0` (work exists but pipeline silent) → apply normal SLA threshold comparison. If push-age > threshold → **STALE** (emit B-05 signal as normal).
- Host Tier-1 = DOWN (container missing) → skip B-05 entirely (already reported by A-xx CRITICAL).

**Rationale (feedback_bctc_lastpush_age_misread_as_crash):** vn-bctc-fetch is event-driven (quarterly). Push-age grows naturally between earnings seasons. Inferring host-down from push-age alone is wrong and caused recurring false alerts in B-05/B-06. Corroboration gate: queue + host state. Both must fail before CRITICAL.

### DB Freshness Spot Checks (C-06, C-07)
Resolve container name: `MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)` — abort check if empty (container down → CRITICAL via Tier-1 A-xx, do not duplicate here).
Run via bun:sqlite readonly exec — NEVER host-side sqlite3 (stale orphan at apps/mcp-server/data/):
```bash
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
docker exec "$MCP_CTR" bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('/app/data/market.db', {readonly: true});
const r = db.query(\"SELECT count(*) as cnt FROM market_messages WHERE sent_at > datetime('now','-3 hours')\").get();
console.log(r.cnt);
db.close();
"
docker exec "$MCP_CTR" bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('/app/data/market.db', {readonly: true});
const r = db.query(\"SELECT count(*) as cnt FROM agent_signals WHERE created_at > datetime('now','-24 hours')\").get();
console.log(r.cnt);
db.close();
"
```
- C-06 pass: > 0; C-07 pass: > 0

### BCTC URL Shape (B-09)
```bash
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
docker exec "$MCP_CTR" bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('/app/data/market.db', {readonly: true});
const r = db.query(\"SELECT count(*) as cnt FROM bctc_vps_queue WHERE source_url LIKE '%ssc.gov.vn%' AND status != 'skipped'\").get();
console.log(r.cnt);
db.close();
"
```
- 0 → PASS; > 0 → CRITICAL (B-09)

### Stale Pending BCTC (B-13)
```bash
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
docker exec "$MCP_CTR" bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('/app/data/market.db', {readonly: true});
const r = db.query(\"SELECT count(*) as cnt FROM bctc_vps_queue WHERE status='pending' AND created_at < datetime('now','-72 hours')\").get();
console.log(r.cnt);
db.close();
"
```
- 0 → PASS; > 0 → WARN (B-13)
- NOTE: `deferred_infra` (historical HIST-VPS-BACKFILL, sources gone) and `blocked_pdf_extractor` (Q1-2026 gated on A-20 architect fix) are explicitly excluded — these are non-actionable by design.

### Emit per stale source (severity ≥ WARN)
**EMIT SEQUENCE — single blessed script call (UC-ASL-P2 — replaces the
old copy-pasted 3-step E-1/E-2/E-3 pseudocode; full contract + markers:
`scripts/emit-audit-signal.sh` header comment):**
```bash
bash scripts/emit-audit-signal.sh \
  --check-id "<B-xx>" \
  --category-type "data_stale" \
  --severity "<CRITICAL|WARN|INFO>" \
  --summary "<source_id> stale <elapsed_hours>h (check <B-xx>)" \
  --detail-json '{"title":"data_stale: <source_id> (<B-xx>)","detail":"<source_id> stale <elapsed_hours>h (expected cadence <expected_cadence_hours>h, last fetch <last_fetch_ts>)","source_id":"<id>","category":"<category>","last_fetch_ts":"<ISO-8601>","expected_cadence_hours":"<from system-map>","elapsed_hours":"<computed>","zone_owner":"dev-mcp-server","dedup_key":"data_stale:<source_id>:<B-xx>"}'
```
Paste the verbatim `[emit-signal] OK|SKIP-dedup|OK-escalation-bypass|ABORT ...` marker line into the notebook — this IS the E-1 (`post_agent_signal`) + E-2 (`send_telegram`, 7d dedup, severity-rank escalation bypass) + E-3 (signal-row append + POST-WRITE read-back, CAS-retry ×3) sequence; the script performs all three internally, including the ANTI-SKIP BUG-channel Telegram on any E-3 write/read-back failure. `ABORT ...` → do NOT count this source toward `signals_posted` in the OUTPUT-CONTRACT line.

---

### BCTC Eval Sweep (D-BCTC-EVAL) — Tier-2 add-on

Call `GET /api/bctc-eval` (list endpoint). Compare each report's `overall_status` and per-stage `stage_statuses` against the previous snapshot stored in `docs/agent-memory/notebooks/system-auditor.md` (look for `BCTC-EVAL-SNAPSHOT:` block from last run).

For each report where ANY stage status changed since last snapshot, post delta to WORK Telegram:
```
[BCTC-EVAL] {ticker} {period}: stage N {stage_name} {old_status}→{new_status} ({metric}: {actual_value})
```
Example: `[BCTC-EVAL] FPT Q4-2025: stage 3 green→yellow (vn_diacritic_ratio dropped to 0.28)`

Status semantics: red = hard fail, yellow = soft warning, green = pass.

Also, for any report showing `overall_status = "red"` or any new `"yellow"`, append a signal row (UC-ASL-P2 — `--e3-only` mode: no E-1/E-2, matches today's behavior exactly; the distinct unconditional WORK-channel delta post above stays untouched, separate from this row-write):
```bash
bash scripts/emit-audit-signal.sh \
  --check-id "BCTC-EVAL-<ticker>-<period>" \
  --category-type "bctc_eval_delta" \
  --severity "<HIGH|MED>" \
  --summary "<ticker> <period>: stage <N> <stage_name> <old_status>→<new_status>" \
  --detail-json '{}' \
  --e3-only
```
Paste the verbatim `[emit-signal] OK e3-only ...` (or `ABORT ...`) marker line into the notebook — this IS the signal-row append + POST-WRITE read-back (same anti-false-green check as all E-3 blocks, now enforced inside the script).

After sweep, **hold the snapshot in memory** (compact: `{report_id, ticker, period, overall_status, stage_statuses, computed_at}` per entry) — it will be written as the `BCTC-EVAL-SNAPSHOT:` block inside the end-of-cycle settled notebook write (AC-3). Do NOT write the notebook here. If endpoint returns non-200 → log `[D-BCTC-EVAL] endpoint unavailable — skipping sweep`, set snapshot=nil, continue (non-fatal).

---

### Improvement Proposal Emit (D-IMPROVE) — Tier-2 add-on

> Three-lane rule + proposal schema SSOT: `docs/architecture-briefs/2026-05-27-gated-self-improvement-loop.md` §1 and §3.
> C-5 invariant: this entire block MUST fail-loud-SKIP on any bad candidate and NEVER abort the Tier-2 freshness sweep above. A throw mid-write must release the commit-mutex and leave no half-written proposal doc.

**D-IMPROVE-4 (cooldown guard — check FIRST):**
Before any write, list `docs/improvement-proposals/` for existing proposals whose `status` is `DRAFT` or `ARCHITECT-REVIEWED` and whose `weakness_id` matches the candidate's `check_id` or `signal_type`. If found and not yet resolved → log `"[D-IMPROVE] skip duplicate: {existing-id}"` and skip that candidate. Continue to next.

**D-IMPROVE-1 — Collect candidates:**
Query `improve_check_log` (inside mcp-server container) for entries with `dispatch_status IN ('shadow','worsened')` and `checked_at` within the last 24h. These are the signal-accuracy candidates.
Also inspect the Tier-2 stale-source findings emitted above: any source with `severity=CRITICAL` and no open FIX task in `docs/data/orch/orch-state.json .task_board` is a doc-level candidate.

**D-IMPROVE-2 — Per candidate (wrapped in try/catch; on any exception: release mutex if held, log "[D-IMPROVE] SKIP candidate {id}: {error}", continue to next candidate — DO NOT re-raise):**

  a. Classify lane per THREE-LANE rule (§1 of brief above). First-match-wins; lane-C tested first.

  b. Build the proposal document with **structured fields** (C-1 requirement — these are machine-readable, not free prose):
     ```markdown
     # Improvement Proposal IMP-{YYYYMMDD}-{slug}

     **Created:** {ISO-8601 UTC}
     **Created by:** system-auditor
     **Status:** DRAFT
     **weakness_id:** {check_id or signal_type}   ← dedup key

     ## target_agent
     {kebab-case agent id — e.g. "dev-mcp-server"}

     ## target_files
     - {absolute doc path 1}
     - {absolute doc path 2 if applicable}

     ## Weakness
     {one paragraph — what is wrong, concrete evidence pointer}

     ## Evidence
     - Source: {check_id / audit dimension}
     - Data: {metric, delta, dates}
     - Reproducibility: {how to reproduce}

     ## Proposed Change
     {description only — no implementation}

     ## Lane
     {LANE-A | LANE-B | LANE-C}

     ### Lane Rationale
     {why this lane}

     ## Success Signal
     {how to know the change worked}

     ## success_verified_by
     (to be filled after DONE — agent id + date)

     ## Rollback
     {how to undo within 7 days}
     ```
     FAIL-LOUD-SKIP if `target_agent` cannot be determined (no kebab-case agent id maps to the weakness) — log `"[D-IMPROVE] SKIP {id}: target_agent unknown"`, continue.
     FAIL-LOUD-SKIP if `target_files` is empty — log `"[D-IMPROVE] SKIP {id}: target_files empty"`, continue.

  c. Write `docs/improvement-proposals/IMP-{YYYYMMDD}-{slug}.md` (path-explicit).
     Signal-row append (UC-ASL-P2 — `--e3-only` mode: no E-1/E-2, matches
     today's behavior exactly; full contract: `scripts/emit-audit-signal.sh`
     header comment):
     ```bash
     bash scripts/emit-audit-signal.sh \
       --check-id "{id}" \
       --category-type "improvement_proposal" \
       --severity "INFO" \
       --summary "{summary ≤120 chars}" \
       --detail-json '{}' \
       --e3-only
     ```
     Paste the verbatim `[emit-signal] OK e3-only ...` (or `ABORT ...`) marker line into the notebook — this IS the signal-row append + POST-WRITE read-back (same anti-false-green check as all E-3 blocks, now enforced inside the script). NOTE: the script's generic row shape sets `payload_ref: null` (proposal traceability lives in the `docs/improvement-proposals/IMP-{id}.md` doc itself, filed at step c above, not in the dashboard row) and auto-derives the row `id` from `--from-agent` — it no longer literally equals `{id}`.
     **Commit (mutex-guarded):** → skill: `.claude/skills/commit-mutex/SKILL.md`
     own_paths: [`docs/improvement-proposals/IMP-{YYYYMMDD}-{slug}.md`, `docs/data/orch/orch-state.json`]
     intent: `"chore(improve): D-IMPROVE emit {id}"`

     Executed protocol:
     1. `call_tool(server="vn-market", tool="task_claim", arguments={task_id:"commit-mutex:main", task_kind:"commit-mutex", owner_agent:"system-auditor", owner_client_session:$CLAUDE_CODE_SESSION_ID, ttl_seconds:60, payload:"{\"paths\":[\"docs/improvement-proposals/IMP-{id}.md\",\"docs/data/orch/orch-state.json\"],\"intent\":\"D-IMPROVE emit {id}\"}"})` — MCP error/db_unavailable → bug-telegram → SKIP commit → EXIT [C-2]; claimed=false, no current_holder → mechanism broken → bug-telegram → SKIP [C-2b]; contended (current_holder present) → backoff 6 retries ~125s → give-up → bug-telegram → SKIP.
     2. `git add -u docs/improvement-proposals/IMP-{YYYYMMDD}-{slug}.md docs/data/orch/orch-state.json` (explicit -u form — avoids gitignore false-warn on tracked files).
     3. `git diff --cached --name-only` → if foreign path present: `git restore --staged <foreign>` (NEVER own paths); if still foreign after restore → release mutex → abort commit → log + bug-telegram.
     4. `git diff --cached --quiet` → if nothing staged: release mutex → skip commit → log.
     5. `git commit -m "chore(improve): D-IMPROVE emit {id}"` (NEVER -a/-am, NEVER add -f).
     6. `call_tool(server="vn-market", tool="task_release", arguments={task_id:"commit-mutex:main", owner_client_session:$CLAUDE_CODE_SESSION_ID})` — ALWAYS, every exit path (success / skip / error).

**D-IMPROVE-3 — Log outcome:**
After processing all candidates, log `"[D-IMPROVE] emitted {N} proposals, skipped {M} (duplicates), skipped {K} (bad candidates)"`.
Append summary to this Tier-2 run's notebook entry.

→ skill: `.claude/skills/anomaly-task-bridge/SKILL.md`
  inputs: `AUDIT_TIER = 2`, `PROJECT_ROOT` already set

---

## Existing Doc/Memory Audit (Tier-3 only — skip in Tier-1 and Tier-2)

### Early Exit Check
```bash
git -C "$PROJECT_ROOT" log --since="24 hours ago" --oneline 2>/tmp/sau_gitlog_err; GITLOG_EXIT=$?
```
- If `GITLOG_EXIT != 0`: read `/tmp/sau_gitlog_err`; fail-loud — log `"[DOC-AUDIT] git log FAILED (exit $GITLOG_EXIT): $(cat /tmp/sau_gitlog_err)"`, emit WARN signal via `post_agent_signal` (signal_type: signal_feedback, payload.check_id: DOC-AUDIT-GIT-ERR), send BUG-channel Telegram, **do NOT early-exit** — continue with doc audit as if commits exist (safe-side).
- If `GITLOG_EXIT == 0` and output is empty: no commits in last 24h → check last-audit timestamp from notebook. Last audit < 12h AND no new commits → skip steps 1–6 (not the new DB checks below).
- If `GITLOG_EXIT == 0` and output is non-empty: commits exist → run steps 1–6 (no early exit).

NOTE — root cause of false "no commits" (FIX-AUDITOR-FLOW-TIER-EARLYEXIT, corrected 2026-06-07): the previous form used `origin/main` as a ref, which lags behind local main due to the repo's NO-branches policy where all commits land directly on local main. Using the stale `origin/main` ref re-triggers the exact false "no commits in 24h" early-exit that this task was opened to kill. The correct form queries local HEAD with `--since="24 hours ago"` (valid git date string, replacing the broken `"24h"`), reflecting the actual current state of the repository.

### 1. Memory integrity — `memory/MEMORY.md`
- Each entry: file exists, content current, not stale
- Broken pointers | index > 200 lines | contradictions → fix or delete

### 2. Knowledge hygiene — `docs/{policies,protocols,standards,references}/*.md`
- Hardcoded volatile values → replace with pointer to `docs/data/*.json`
- Verify JSON counts: `tool-registry.json` vs actual | `cron-registry.json` vs jobs | `stock-classification.json` vs watchlist

### 3. Agent validation — `.claude/agents/*.md`
- Dangling pointers (target missing) | refs follow tree-map | no hardcoded volatile counts

### 4. Size caps
- `CLAUDE.md` > 120 lines → move bloat to knowledge files
- `docs/data/orch/orch-state.json` `.task_board`: `jq '[.task_board.active_sprints[].tasks[]] | length'` > 80 → alert pm to run task-archive sub-flow
- `docs/data/orch/orch-state.json` `.sprint_goal.entries[]`: count > 15 → alert po to close/archive old sprint entries

### 5. DB health (legacy WAL check — now complemented by Tier-3 full checks)
Resolve container name first (same pattern as Tier-3). Run via bun:sqlite readonly exec — NEVER host-side sqlite3:
```bash
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
# WAL size: read from live volume via container fs
docker exec "$MCP_CTR" bun -e "
import { statSync } from 'fs';
for (const f of ['/app/data/market.db-wal', '/app/data/pdf_extractor.db-wal']) {
  try { const s = statSync(f); console.log(f, s.size); } catch { /* no WAL = fine */ }
}
"  # each WAL < 52428800 bytes (50MB)
# Integrity check
docker exec "$MCP_CTR" bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('/app/data/market.db', {readonly: true});
const row = db.query('PRAGMA integrity_check').get();
console.log(row.integrity_check);
db.close();
"  # must = "ok"
```

### 6. Stats drift — `docs/data/project-stats.json` is GENERATED, never hand-edited
```bash
bun scripts/gen-project-stats.ts
```
`toolCount` and `cronJobCount` are derived from source. To update: run the generator and commit the result. Do NOT hand-edit these fields.

---

## Tier-3 — DB Integrity

**Wall time target: < 600s. Scope: container tooling + inter-service + full DB checks C-01 through C-16 + EPIPE.**

### Container Tooling — mcp-server (A-22 through A-24)
Resolve container name: `MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)` — if empty: CRITICAL for all A-22–A-28 (container down).
```bash
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
docker exec "$MCP_CTR" which pdftoppm
docker exec "$MCP_CTR" which tesseract
docker exec "$MCP_CTR" tesseract --list-langs 2>&1 | grep vie
```
- All must succeed (exit 0 / `vie` present) → CRITICAL if any missing

### Inter-Service Connectivity (A-25 through A-28)
```bash
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
docker exec "$MCP_CTR" curl -sf http://stock-price:5000/health
docker exec "$MCP_CTR" curl -sf http://technical-analysis:5003/health
docker exec "$MCP_CTR" curl -sf http://alert-engine:5006/health
docker exec "$MCP_CTR" curl -sf http://pdf-extractor:5001/health
```
- Each must return HTTP 200

### EPIPE Crash Check (A-31)
```bash
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
docker logs --since=30m "$MCP_CTR" 2>&1 | grep -c "EPIPE\|ECONNRESET"
```
- 0 or ≤ 2 → PASS (transient ok); > 2 → WARN

### BCTC PDF Landing (B-08)
```bash
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
docker exec "$MCP_CTR" ls /app/data/pdfs/ | wc -l
```
- > 0 → PASS; 0 → WARN

### DB Write Integrity Checks (C-01 through C-16)
Read DB paths from system-map.json infrastructure.databases. The LIVE DB lives in named volume `vn-market-intelligence-mcp_market_data` mounted at `/app/data` in the container — NOT at `apps/mcp-server/data/` on the host (that path is a stale orphan test-fixture with 0-row tables).
Resolve container name once at the top of this section: `MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)`
Run all queries via bun:sqlite readonly exec — NEVER host-side sqlite3, NEVER open DB in write mode, NEVER stop/start containers:
```bash
# Invocation pattern (bun:sqlite readonly, static SQL only — NEVER interpolate dynamic values into shell line):
MCP_CTR=$(docker ps --format '{{.Names}}' | grep mcp-server | head -1)
docker exec "$MCP_CTR" bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('/app/data/<db>.db', {readonly: true});
const r = db.query('<static SQL query>').get();
console.log(r);
db.close();
"
```

**Weekend/holiday guard for C-01, C-02, C-14 (last-trading-day semantics):**
Before running C-01/C-02/C-14, determine the last VN trading day:
```bash
# Compute day-of-week (0=Sun, 6=Sat) in VN time (UTC+7)
DOW=$(date -u -d "+7 hours" +%u 2>/dev/null || python3 -c "import datetime; print((datetime.datetime.utcnow()+datetime.timedelta(hours=7)).weekday())")
# If Sat (6) or Sun (0/7) → use '-3 day' window (covers last Fri); else use '-1 day' window
```
Use window = `'-3 day'` when DOW is Sat or Sun; use `'-1 day'` on Mon–Fri.
On Mon–Fri the auditor fires AFTER trading session; on weekend, last data was Friday.
If the check fires within 2h after market open (before new data lands), accept the previous trading day's count as passing.

**NULL-guard (FIX-AUDITOR-SQL-MODIFIERS — MANDATORY before any datetime-windowed check):**
Before evaluating a check, verify its modifier parses: `sqlite3 :memory: "SELECT datetime('now','<modifier>') IS NULL"`.
If result = 1 → the modifier is invalid. Do NOT run the check. Do NOT report count=0 as PASS or CRITICAL.
Instead: emit WARN signal via `post_agent_signal` (signal_type: signal_feedback, payload.check_id: `<C-xx>-INVALID-SQL`, payload.detail: "datetime modifier returned NULL"),
send BUG-channel Telegram, mark check as INVALID-SQL in notebook, and continue to next check.
Long-form modifiers are REQUIRED: `'-N hours'` / `'-N days'` — NEVER `'-Nh'` or `'-Nd'` (short form returns NULL in SQLite).

| check_id | DB | Query (run via `docker exec "$MCP_CTR" bun -e ...` — see invocation pattern above) | Pass |
|---|---|---|---|
| C-01 | market.db | `SELECT count(DISTINCT code) FROM daily_ohlcv WHERE date >= date('now',<WINDOW>)` — use `<WINDOW>` = `'-3 day'` on Sat/Sun, `'-1 day'` Mon–Fri | ≥ 25 |
| C-02 | market.db | `SELECT count(*) FROM daily_ohlcv WHERE date >= date('now',<WINDOW>)` — same weekend window as C-01 | > 0 |
| C-03 | market.db | `SELECT count(DISTINCT action_code) FROM financial_reports WHERE period_year=2026 AND period_quarter=1` | ≥ 26 (in Q1 window Apr–May) |
| C-04 | market.db | `SELECT count(*) FROM financial_reports WHERE parsed_at > datetime('now','-7 days') AND extraction_confidence < 0.2` | ≤ 5 |
| C-05 | market.db | `SELECT count(*) FROM bctc_vps_queue WHERE source_url LIKE '%ssc.gov.vn%' AND status != 'skipped'` | 0 |
| C-06 | market.db | `SELECT count(*) FROM market_messages WHERE sent_at > datetime('now','-3 hours')` | > 0 |
| C-07 | market.db | `SELECT count(*) FROM agent_signals WHERE created_at > datetime('now','-24 hours')` | > 0 |
| C-08 | market.db | `SELECT count(*) FROM alerts a LEFT JOIN agent_signals s ON a.id = s.alert_id WHERE s.id IS NULL AND a.triggered_at > datetime('now','-24 hours')` | 0 |
| C-09 | market.db | `SELECT (CASE WHEN cpi IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN gdp_growth IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN interest_rate IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN unemployment_rate IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN inflation_rate IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN trade_balance IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN current_account IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN government_debt IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN budget_deficit IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN manufacturing_pmi IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN consumer_confidence IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN retail_sales IS NOT NULL THEN 1 ELSE 0 END) as indicator_count FROM macro_indicators WHERE country='vietnam' AND fetched_at > datetime('now','-26 hours')` — NOTE: macro_indicators is country-keyed (UNIQUE(country)); ≥8 threshold was from old indicator-row design (a95c514a schema mismatch). Current active fetcher (TradingEconomics VPS, no API key required) writes cpi+gdp_growth+interest_rate. Threshold = 3 until TRADING_ECONOMICS_API_KEY wires all 12 cols. | ≥ 3 |
| C-10 | pdf_extractor.db | `SELECT count(*) FROM pdf_documents WHERE status = 'failed' AND extracted_at > datetime('now','-24 hours')` | ≤ 2 |
| C-11 | pdf_extractor.db | `SELECT count(*) FROM pdf_documents WHERE status = 'done' AND extracted_at > datetime('now','-48 hours')` | > 0 (earnings window) |
| C-12 | all non-empty DBs | `PRAGMA integrity_check` — skip DBs with 0-byte file (alert_engine.db, stock_price.db when empty) | `ok` |
| C-13 | container /app/data | via bun `statSync('/app/data/market.db-wal')` etc inside `docker exec "$MCP_CTR" bun -e ...` — check each WAL size | < 52428800 bytes (50MB) each |
| C-14 | market.db | top-3 `code` row share of `daily_ohlcv` using same `<WINDOW>` as C-01: `WITH t AS (SELECT code,count(*) c FROM daily_ohlcv WHERE date>=date('now',<WINDOW>) GROUP BY code ORDER BY c DESC LIMIT 3) SELECT round(100.0*sum(c)/(SELECT count(*) FROM daily_ohlcv WHERE date>=date('now',<WINDOW>)),1) FROM t` — skip (NULL result) if C-01 returns 0 (no data in window) | < 60% |
| C-15 | market.db | `PRAGMA table_info(financial_reports)` — check action_code, period_year, net_revenue, extraction_confidence present | all 4 present |
| C-16 | market.db | `SELECT count(*) FROM bctc_vps_queue WHERE status='pending' AND created_at < datetime('now','-72 hours')` | 0 — non-actionable rows use explicit statuses `deferred_infra` / `blocked_pdf_extractor` and are excluded by design (FIX-BCTC-VPS-QUEUE-STALE-TRIAGE) |

Also call:
```
call_tool(server="vn-market", tool="get_alerts", arguments={limit: 100})
```
Cross-reference results with C-08 (orphaned alerts). BCTC coverage (C-03/C-04) verified via DB queries above.

### Emit per failing check (severity ≥ WARN)
**EMIT SEQUENCE — single blessed script call (UC-ASL-P2 — replaces the
old copy-pasted 3-step E-1/E-2/E-3 pseudocode; full contract + markers:
`scripts/emit-audit-signal.sh` header comment):**
```bash
bash scripts/emit-audit-signal.sh \
  --check-id "<C-xx>" \
  --category-type "db_integrity_breach" \
  --severity "<CRITICAL|WARN>" \
  --summary "<table> check <C-xx> failed (actual=<actual_value>)" \
  --detail-json '{"title":"db_integrity_breach: <table> (<C-xx>)","detail":"<description> — actual=<n>, expected=<n>","db_id":"<db from system-map>","table":"<table>","actual_value":"<n>","expected_value":"<n>","zone_owner":"<specialist from zones>","dedup_key":"db_integrity_breach:<table>:<C-xx>"}'
```
Paste the verbatim `[emit-signal] OK|SKIP-dedup|OK-escalation-bypass|ABORT ...` marker line into the notebook — this IS the E-1 + E-2 + E-3 sequence; the script performs all three internally, including the ANTI-SKIP BUG-channel Telegram on any E-3 write/read-back failure. `ABORT ...` → do NOT count this check toward `signals_posted` in the OUTPUT-CONTRACT line.

### Tier-3 Roll-Up Signal
```
call_tool(server="vn-market", tool="post_agent_signal", arguments={
  "from_agent": "system-auditor",
  "to_agent": "po",
  "signal_type": "signal_feedback",
  "payload": {
    "title": "Tier-3 audit complete",
    "detail": "system_health_report tier-3: overall=<HEALTHY|DEGRADED|CRITICAL> — <N> anomalies",
    "tier": 3,
    "summary": { "services_up": "N", "services_down": "N", "cron_gaps": [], "sources_stale": [], "db_breaches": [] },
    "checks": { "A_runtime": {"pass": "N", "warn": "N", "critical": "N"}, "B_fetch": {"pass": "N", "warn": "N", "critical": "N"}, "C_db": {"pass": "N", "warn": "N", "critical": "N"} },
    "overall": "HEALTHY|DEGRADED|CRITICAL",
    "new_anomalies": [],
    "dedup_skipped": "N"
  }
})
```

→ skill: `.claude/skills/anomaly-task-bridge/SKILL.md`
  inputs: `AUDIT_TIER = 3`, `PROJECT_ROOT` already set

### Tier-3 WORK Notification
```
call_tool(server="vn-market", tool="send_telegram", arguments={channel: "work", message: "[system-auditor] Tier-3 complete — N anomalies (C critical, W warn, I info)"})
```

---

## Anomaly Reporting (all tiers)

Known (dedup_key seen in past 7 days for BUG channel) → skip BUG write, always append DASHBOARD.md.
New:
```
## Anomaly: [check_id] [Name]
Severity: info | warn | critical | Date: YYYY-MM-DD
Location: [service/table/source] | Details: [wrong] | Impact: [why] | Root cause: [guess]
```
severity ≥ warn → run **Emit Sequence** (E-1 post_agent_signal + E-2 send_telegram + **E-3 signal_queue row**).
The signal_queue row write (Step E-3) is embedded in the per-tier emit blocks above — it is NOT a trailing optional step. This section is a reminder, not the definition. The definition is at each emit block.

> Invariant: timestamp = current UTC, never future, never speculative.

### OUTPUT-CONTRACT (echo in RETURN — MANDATORY)
At the end of every cycle, before writing the RETURN block, the agent MUST verify and echo these counts:
```
[OUTPUT-CONTRACT] signals_posted={N} | telegram_sent={N} | signal_queue_rows_written={N} | dashboard_rows={N}
```
If `signal_queue_rows_written` = 0 AND `signals_posted` > 0 → this is a contract violation. Log `"[OUTPUT-CONTRACT] VIOLATION: signals emitted but no signal_queue rows written"` and send BUG-channel Telegram before exiting. The RETURN block MUST include the OUTPUT-CONTRACT line verbatim.

### RAW-CITE GATE (rtr-confab2-202606060515 — occ#2; c019 invented config value; c026 cited "system-map lists 4001" for mcp-gateway port, value absent, live port 4040)
Any config/file value cited in a finding or return (port, path, threshold, mapping) MUST be backed by a `grep -n` line captured THIS cycle (file + line number + matched text). No raw line captured → DROP the claim, do NOT report it. NEVER cite `orch-state.json .head.next_action` text as evidence — it is router-authored narrative, not a config value.
- **Return summary extension (rtr-confab3-202606060720 — occ#3; c030 fabricated file/line cite in return channel):** The gate above applies equally to the final message returned to the router. A file/line pointer (e.g. "flow line 57") may appear in a return summary ONLY if that exact cite was already written verbatim to the notebook THIS cycle. If no such notebook line exists, OMIT the pointer — the substantive claim (e.g. "frontend classified INFO, no data impact") may remain, but without the fabricated reference.
- **Sandbox-error quarantine (FIX-AUDITOR-EVIDENCE-INTEGRITY — occ#4; c040 conflated `/private/tmp/claude-501 full` with host ENOSPC):** Any bash exit whose stderr/stdout contains text matching `/private/tmp/claude-501|tasks is full|ENOSPC.*claude/` MUST be classified as `TOOL-UNAVAILABLE / NOT-RUN` for that check — log `"[TOOL-UNAVAILABLE] <check_id>: bash sandbox error — skip, NOT an infra signal"` and continue. NEVER escalate a sandbox-internal error as a host infra finding. Infra criticals require probe.sh `--- disk df -h / ---` raw output as evidence.

### Notebook timestamp guard
- Before writing `docs/agent-memory/notebooks/system-auditor.md`, ALWAYS get current UTC via:
  ```bash
  date -u +"%Y-%m-%dT%H:%M:%SZ"
  ```
- Use the returned value verbatim — NEVER speculate, NEVER round to a future minute
- NEVER write entries for cycles that have not fired yet

### Notebook Append Gate (P1-IDLE-AUDITOR-NOTEBOOK-GATE, 2026-07-04 — RC-IDLE-LOOPS)
Decide BEFORE Step 1 whether this cycle writes the notebook at all. Check the three counters already produced this cycle:
- (a) new-finding: the `N` in "Anomalies: N new (C/W/I)" above is > 0 (dedup-skipped known anomalies do NOT count — they are not new).
- (b) new-signal: `signal_queue_rows_written` from the OUTPUT-CONTRACT line above is > 0.
- (c) state-change: this cycle's overall Status (HEALTHY|DEGRADED|CRITICAL) differs from the `Status:` line of the most-recent same-tier entry already loaded in memory at Step 0b.
(a) OR (b) OR (c) true → proceed to Step 1 below exactly as written (happy path, unchanged).
All three false → genuine ALL_GREEN cycle: SKIP Step 1 and Step 2 below only — no `Write()` call, notebook file stays byte-identical to HEAD. Log `"[NOTEBOOK-GATE] SKIP no-new-finding/signal/state-change"`, then fall through unchanged to the **Commit** call below (still runs every cycle): with nothing written to disk, `git add` stages nothing for the notebook path, so the script's own no-staged-changes check (L196-197) is what performs the final no-op (`[auditor-commit] SKIP no-staged-changes`) — zero notebook diff, zero commit.

**Notebook write** — AC-3 settled-write (ONE write) per skill: `.claude/skills/notebook-write/SKILL.md` (AC-1 through AC-5). Runs ONLY when the gate above passed.

Step 1 — Compose in memory (NO file write yet):
a. Read `docs/agent-memory/notebooks/system-auditor.md` fully into memory.
b. Identify preamble (before first `## `) and all `^## ` section boundaries.
c. If ≥3 sections: drop the LAST `## ` block (bottom = oldest) in memory (heading + content to next `## ` or EOF). Ordering convention: sections are NEWEST-FIRST; the bottom section is always the oldest.
d. Build new section (≤60L):
   ```
   ## c<NNN> · <YYYY-MM-DDThh:mmZ>
   ### Audit Run Tier-N (HH:MM–HH:MM UTC YYYY-MM-DD)
   - Tier: N | Services: N checked | Sources: N checked | DB checks: N
   - Anomalies: N new (C critical, W warn, I info) | M dedup-skipped
   - Status: HEALTHY | DEGRADED | CRITICAL
   ```
   If Tier-2 cycle and snapshot ≠ nil: append `BCTC-EVAL-SNAPSHOT:` sub-block (compact JSON array, ≤10L) within this new section, counting toward the 60L section cap.
e. Insert new section at TOP of in-memory body, immediately after preamble (before the first existing `## ` block). Sections are NEWEST-FIRST: newest entry goes to the top, oldest stays at the bottom.
f. Count in-memory lines. If >200L: drop the LAST `## ` block (bottom = oldest), recount; repeat until ≤200L or only preamble+1 section remain. If current-cycle section >60L: trim to 60L first.
g. In-memory body is now the final settled content (≤200L guaranteed).

Step 2 — Single settled write (ONE call, PostToolUse fires exactly once):
```
Write(path="docs/agent-memory/notebooks/system-auditor.md", content=<settled body from Step 1>)
```
AC-5 gate after write: `wc -l < notebook.md` → if >200: fix Step 1 and re-write once.

<!-- NB-AUDITOR-SETTLED-WRITE: replaced two-write pattern (append then trim) with AC-3 single settled write. BCTC-EVAL-SNAPSHOT folded into this write (was a separate early write in D-BCTC-EVAL — now held in memory until here). PostToolUse hook sees ≤200L exactly once. -->
Then:
**Commit (mutex-paired blessed script — FIX-AUDITOR-COMMIT-MUTEX-SKIP, 2026-07-03):** the previous
narrated claim/add/verify/commit/release sequence was non-deterministically SKIPPING the mutex
claim (flow-step drift on prose is unreliable for a hard invariant) and, separately, was folding a
concurrent peer's working-tree edits into the notebook commit (non-explicit pathspec, f05795c3).
Both are now executed bash, not narrated steps — the model calls ONE script and branches on its
marker output:

```bash
bash scripts/auditor-notebook-commit.sh \
  "chore(memory/system-auditor): notebook YYYY-MM-DD tier-N" \
  docs/agent-memory/notebooks/system-auditor.md
```
(`CLAUDE_CODE_SESSION_ID` must already be exported in the shell env; `AUDITOR_COMMIT_OWNER_AGENT`
defaults to `system-auditor`.) The script internally claims/releases `commit-mutex:main`
(task_kind=`commit-mutex`) BEFORE/after the git operation via a bash `trap ... EXIT` — the claim
can never be skipped by construction — and stages/commits ONLY the explicit path given (never
`-A`/`-u`/`.`). Full protocol + marker contract: script header comment.

**Verdict handling (branch on the first stdout line):**
- `[auditor-commit] mutex-paired commit <sha> paths=<n>` → commit succeeded, mutex claimed+released paired. Continue.
- `[auditor-commit] SKIP no-staged-changes ...` → nothing to commit this cycle. Continue (not an error).
- `[auditor-commit] SKIP mutex-claim-failed ...` → per (d): NOT fatal to the audit — skip this cycle's notebook commit, continue the flow, retry next tick. Send bug-telegram only if this reason also fired last cycle (avoid alert-spam on transient contention).
- `[auditor-commit] ABORT ...` (foreign-path-after-restore / git-commit-failed) → bug-telegram (`[system-auditor] auditor-notebook-commit ABORT: <marker line>`) — not a normal skip, investigate.
- `[auditor-commit] ERROR ...` → usage/config bug in the flow wiring itself (e.g. `CLAUDE_CODE_SESSION_ID` unset) → bug-telegram, EXIT.

Convention: `docs/policies/commit-convention.md` § Notebook Commits
Script: `scripts/auditor-notebook-commit.sh` (pointer per `docs/policies/dev-standards.md` § Script Persistence).

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

**P3 Fire-Election Release (TASK_1994 — mandatory, runs here after notebook write + commit):**
```
call_tool(server="vn-market", tool="task_release", arguments={
  task_id:              FIRE_TASK_ID,
  owner_client_session: $CLAUDE_CODE_SESSION_ID
})
# ok=false acceptable (TTL=600s expired on a very long audit cycle — crash-safety backstop).
# FIRE_TASK_ID = "cron:auditor-t<N>:<FIRE_TICK>" set in Step 0d above.
```

## Always Report (never skip)
test data in prod | DB corruption | unbounded WAL | container down | cron not running | prod table 0 rows expected > 0 | pdftoppm/tesseract missing in mcp-server | SSC portal URLs in bctc_queue not skipped

---

## Agent-Specific Error Cases
- DB integrity check returns non-"ok" → report as CRITICAL anomaly → EXIT after Telegram BUG alert.
- docker daemon unreachable → report as CRITICAL for all container checks → EXIT after alert.
- All MCP tool calls fail → report as CRITICAL (mcp-server likely down) → EXIT after alert.

## RETURN

```
DONE: Audit complete tier-N — N anomalies (C critical, W warn, I info) | M dedup-skipped
NEXT: po (via DASHBOARD.md) | user (if clean) | ops (if CRITICAL DB or container anomaly)
PIPELINE: complete
QUALITY: full | partial (if early exit triggered on doc/memory pass)
[OUTPUT-CONTRACT] signals_posted=N | telegram_sent=N | signal_queue_rows_written=N | dashboard_rows=N
```
The `[OUTPUT-CONTRACT]` line is MANDATORY. Omitting it = contract violation (dispatcher will backfill and log recurring-bug pattern).
