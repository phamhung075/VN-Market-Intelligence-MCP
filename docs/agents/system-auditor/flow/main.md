<!-- size-justification: 175L — three-tier dispatcher with distinct scope gates per tier; Tier-1/2/3 checklists are tightly coupled to check IDs from the brief and cannot be split without losing traceability. -->
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
1. Emit a typed signal row via `post_agent_signal` (type: microservice_degraded / data_stale / db_integrity_breach / system_health_report — per existing schema).
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
- `project.microservices[]` → service ids, external_ports, zones
- `project.data_sources[]` → source ids, expected_cadence_hours, stale_threshold_hours, geo_blocked
- `project.infrastructure.databases[]` → DB ids, paths
- `project.zones[]` → zone id → specialist (zone_owner)

---

## Tier Dispatch

Read `AUDIT_TIER` (default 3 if not set).

- **TIER=1** → run §Tier-1 Runtime Ping only → skip all other steps → notebook → RETURN
- **TIER=2** → run §Tier-2 Freshness Sweep only → skip all other steps → notebook → RETURN
- **TIER=3** → run §Tier-1 + §Existing Doc/Memory Audit (steps 1–6) + §Tier-3 DB Integrity → notebook → RETURN

---

## Tier-1 — Runtime Ping

**Wall time target: < 120s. Scope: container liveness + health endpoint + restart count + memory.**

### Container Status (A-01 through A-11)
For each service in system-map.json microservices:
```bash
docker ps --filter name=<service-id> --format "{{.Status}}"
```
- Contains `Up` → PASS
- Missing / Exited → FAIL: severity per brief (CRITICAL for mcp-server/api-gateway/stock-price/alert-engine; WARN for pdf-extractor/rag-service/news-fetch; INFO for frontend)

### Health Endpoints (A-12 through A-20)
For each service with external_port:
```bash
curl -sf --max-time 3 http://localhost:<external_port>/health
```
- HTTP 200 → PASS; else → FAIL at severity per brief

### Restart Count (A-21)
```bash
docker inspect mcp-server --format "{{.RestartCount}}"
```
- ≤ 2 → PASS; > 2 → WARN

### Memory Pressure (A-30)
```bash
docker stats --no-stream mcp-server --format "{{.MemPerc}}"
```
- < 85% → PASS; ≥ 85% → WARN

### MCP System Status
```
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_system_status", arguments: {}})
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_cron_health", arguments: {}})
```
- Any service reported DOWN by MCP → cross-reference with docker ps result

### Emit per failure
```json
{
  "type": "microservice_degraded",
  "ts": "<UTC ISO-8601>",
  "service_id": "<id>",
  "zone": "<zone from system-map>",
  "zone_owner": "<specialist from zones>",
  "check_id": "<A-xx>",
  "detail": "<what failed>",
  "severity": "CRITICAL|WARN|INFO",
  "channel": "bug",
  "dedup_key": "microservice_degraded:<service_id>:<check_id>"
}
```
Routing: severity ≥ WARN AND dedup_key not seen last 7d → `send_telegram(channel="bug")`. Always append row to DASHBOARD.md for WARN/CRITICAL.

---

## Tier-2 — Freshness Sweep

**Wall time target: < 300s. Scope: cron fire gaps, per-source fetch freshness, VPS routes, news/signals freshness.**

### Cron Fire Check (A-29)
```
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_cron_health", arguments: {}})
```
For each cron in system-map.json microservices[0].crons:
- Compute expected last-fire from schedule expression
- Compare to actual `last_run_ts` from get_cron_health response
- Flag if gap > 2× cadence
- Special case `bctcBatchSweep` (schedule: `0 9 25 1,4,7,10 *`): only check within 72h of expected fire date to avoid false alerts

### Per-Source Fetch Freshness (B-01 through B-07, B-11, B-12)
```
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_pipeline_health", arguments: {}})
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_vps_proxy_health", arguments: {}})
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_vps_service_health", arguments: {}})
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_rate_limit_status", arguments: {}})
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_macro_snapshot", arguments: {}})
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_sla_status", arguments: {}})
```
For each source in system-map.json data_sources:
- Read `expected_cadence_hours` and `stale_threshold_hours` from system-map.json (never hardcode)
- Compare `last_fetch_ts` from get_pipeline_health to `stale_threshold_hours`
- Skip foreign-flow check outside VN market hours (09:00–15:30 VN = 02:00–08:30 UTC M-F)
- VPS proxy: all 7 routes must return `status: ok` (B-06, B-07)
- Rate limits: no source at 100% (B-12)
- BCTC staleness: 7-day threshold outside earnings windows; 24h during Q1/Q2/Q3/Q4 +14d windows

### DB Freshness Spot Checks (C-06, C-07)
```bash
docker exec mcp-server sqlite3 /app/data/market.db "SELECT count(*) FROM news_articles WHERE created_at > datetime('now','-3h')"
docker exec mcp-server sqlite3 /app/data/market.db "SELECT count(*) FROM agent_signals WHERE created_at > datetime('now','-24h')"
```

### BCTC URL Shape (B-09)
```bash
docker exec mcp-server sqlite3 /app/data/market.db "SELECT count(*) FROM bctc_queue WHERE url LIKE '%ssc.gov.vn%' AND status != 'skipped'"
```
- 0 → PASS; > 0 → CRITICAL (B-09)

### Stale Pending BCTC (B-13)
```bash
docker exec mcp-server sqlite3 /app/data/market.db "SELECT count(*) FROM bctc_queue WHERE status='pending' AND created_at < datetime('now','-72h')"
```

### Emit per stale source
```json
{
  "type": "data_stale",
  "ts": "<UTC ISO-8601>",
  "source_id": "<id>",
  "category": "<category>",
  "last_fetch_ts": "<ISO-8601>",
  "expected_cadence_hours": <from system-map>,
  "elapsed_hours": <computed>,
  "zone_owner": "dev-mcp-server",
  "check_id": "<B-xx>",
  "severity": "CRITICAL|WARN|INFO",
  "channel": "bug",
  "dedup_key": "data_stale:<source_id>:<check_id>"
}
```

---

### BCTC Eval Sweep (D-BCTC-EVAL) — Tier-2 add-on

Call `GET /api/bctc-eval` (list endpoint). Compare each report's `overall_status` and per-stage `stage_statuses` against the previous snapshot stored in `docs/agent-memory/notebooks/system-auditor.md` (look for `BCTC-EVAL-SNAPSHOT:` block from last run).

For each report where ANY stage status changed since last snapshot, post delta to WORK Telegram:
```
[BCTC-EVAL] {ticker} {period}: stage N {stage_name} {old_status}→{new_status} ({metric}: {actual_value})
```
Example: `[BCTC-EVAL] FPT Q4-2025: stage 3 green→yellow (vn_diacritic_ratio dropped to 0.28)`

Status semantics: red = hard fail, yellow = soft warning, green = pass.

Also update `docs/signals/DASHBOARD.md` per signal-dashboard skill for any report showing `overall_status = "red"` or any new `"yellow"`.

After sweep, overwrite the `BCTC-EVAL-SNAPSHOT:` block in the notebook with the current list response (compact: `{report_id, ticker, period, overall_status, stage_statuses, computed_at}` per entry). If endpoint returns non-200 → log `[D-BCTC-EVAL] endpoint unavailable — skipping sweep` and continue (non-fatal).

---

### Improvement Proposal Emit (D-IMPROVE) — Tier-2 add-on

> Three-lane rule + proposal schema SSOT: `docs/architecture-briefs/2026-05-27-gated-self-improvement-loop.md` §1 and §3.
> C-5 invariant: this entire block MUST fail-loud-SKIP on any bad candidate and NEVER abort the Tier-2 freshness sweep above. A throw mid-write must release the commit-mutex and leave no half-written proposal doc.

**D-IMPROVE-4 (cooldown guard — check FIRST):**
Before any write, list `docs/improvement-proposals/` for existing proposals whose `status` is `DRAFT` or `ARCHITECT-REVIEWED` and whose `weakness_id` matches the candidate's `check_id` or `signal_type`. If found and not yet resolved → log `"[D-IMPROVE] skip duplicate: {existing-id}"` and skip that candidate. Continue to next.

**D-IMPROVE-1 — Collect candidates:**
Query `improve_check_log` (inside mcp-server container) for entries with `dispatch_status IN ('shadow','worsened')` and `checked_at` within the last 24h. These are the signal-accuracy candidates.
Also inspect the Tier-2 stale-source findings emitted above: any source with `severity=CRITICAL` and no open FIX task in `docs/TASKS.md` is a doc-level candidate.

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

  c. Acquire commit-mutex (skill: `.claude/skills/commit-mutex/SKILL.md`).
     Write `docs/improvement-proposals/IMP-{YYYYMMDD}-{slug}.md` (path-explicit).
     Append DASHBOARD.md row under `## po` section:
     ```
     | {id} | {ts} | system-auditor | improvement_proposal | {summary ≤40 chars} | NEW | {proposal-path} |
     ```
     Commit: `git add docs/improvement-proposals/{id}.md docs/signals/DASHBOARD.md` (explicit paths only — never -A).
     git commit -m `"chore(improve): D-IMPROVE emit {id}"`.
     Release commit-mutex regardless of commit outcome.

**D-IMPROVE-3 — Log outcome:**
After processing all candidates, log `"[D-IMPROVE] emitted {N} proposals, skipped {M} (duplicates), skipped {K} (bad candidates)"`.
Append summary to this Tier-2 run's notebook entry.

→ skill: `.claude/skills/anomaly-task-bridge/SKILL.md`
  inputs: `AUDIT_TIER = 2`, `PROJECT_ROOT` already set

---

## Existing Doc/Memory Audit (Tier-3 only — skip in Tier-1 and Tier-2)

### Early Exit Check
```bash
git log --since="24h" --oneline  # 0 commits → skip doc sync pass
```
Last audit < 12h AND no new commits → skip steps 1–6 (not the new DB checks below).

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
- `docs/TASKS.md` > 80 lines → archive Done to `docs/archive/`
- `docs/SPRINT_GOAL.md` > 30 lines → delete old goals

### 5. DB health (legacy WAL check — now complemented by Tier-3 full checks)
```bash
docker exec mcp-server ls -lh /app/data/*.db-wal 2>/dev/null  # WAL < 10MB ok, >50MB flag
docker exec mcp-server sqlite3 /app/data/market.db "PRAGMA integrity_check;"  # must = "ok"
```

### 6. Stats drift — `docs/data/project-stats.json` → update sprint/tool/scheduler counts

---

## Tier-3 — DB Integrity

**Wall time target: < 600s. Scope: container tooling + inter-service + full DB checks C-01 through C-16 + EPIPE.**

### Container Tooling — mcp-server (A-22 through A-24)
```bash
docker exec mcp-server which pdftoppm
docker exec mcp-server which tesseract
docker exec mcp-server tesseract --list-langs 2>&1 | grep vie
```
- All must succeed (exit 0 / `vie` present) → CRITICAL if any missing

### Inter-Service Connectivity (A-25 through A-28)
```bash
docker exec mcp-server curl -sf http://stock-price:5000/health
docker exec mcp-server curl -sf http://technical-analysis:5003/health
docker exec mcp-server curl -sf http://alert-engine:5006/health
docker exec mcp-server curl -sf http://pdf-extractor:5001/health
```
- Each must return HTTP 200

### EPIPE Crash Check (A-31)
```bash
docker logs --since=30m mcp-server 2>&1 | grep -c "EPIPE\|ECONNRESET"
```
- 0 or ≤ 2 → PASS (transient ok); > 2 → WARN

### BCTC PDF Landing (B-08)
```bash
docker exec mcp-server ls /app/data/pdfs/ | wc -l
```
- > 0 → PASS; 0 → WARN

### DB Write Integrity Checks (C-01 through C-16)
Read DB paths from system-map.json infrastructure.databases. Run each query via `docker exec mcp-server sqlite3 <path> "<query>"`:

| check_id | DB | Query | Pass |
|---|---|---|---|
| C-01 | stock_price.db | `SELECT count(DISTINCT ticker) FROM stock_prices WHERE created_at > datetime('now','-24h')` | ≥ 25 |
| C-02 | stock_price.db | `SELECT count(*) FROM stock_prices WHERE created_at > datetime('now','-24h')` | > 0 |
| C-03 | market.db | `SELECT count(DISTINCT ticker) FROM financial_reports WHERE period LIKE '%Q1%2026%'` | ≥ 26 (in Q1 window Apr–May) |
| C-04 | market.db | `SELECT count(*) FROM financial_reports WHERE updated_at > datetime('now','-7d') AND confidence < 0.2` | ≤ 5 |
| C-05 | market.db | `SELECT count(*) FROM bctc_queue WHERE url LIKE '%ssc.gov.vn%' AND status != 'skipped'` | 0 |
| C-06 | market.db | `SELECT count(*) FROM news_articles WHERE created_at > datetime('now','-3h')` | > 0 |
| C-07 | market.db | `SELECT count(*) FROM agent_signals WHERE created_at > datetime('now','-24h')` | > 0 |
| C-08 | alert_engine.db + market.db | `SELECT count(*) FROM alerts a LEFT JOIN agent_signals s ON a.signal_id = s.id WHERE s.id IS NULL AND a.created_at > datetime('now','-24h')` | 0 |
| C-09 | market.db | `SELECT count(DISTINCT indicator_key) FROM macro_indicators WHERE updated_at > datetime('now','-26h')` | ≥ 8 |
| C-10 | pdf_extractor.db | `SELECT count(*) FROM pdf_extractions WHERE status = 'failed' AND created_at > datetime('now','-24h')` | ≤ 2 |
| C-11 | pdf_extractor.db | `SELECT count(*) FROM pdf_extractions WHERE status = 'completed' AND created_at > datetime('now','-48h')` | > 0 (earnings window) |
| C-12 | all 6 DBs | `PRAGMA integrity_check` | `ok` |
| C-13 | all 6 DBs | `ls -lh /app/data/*.db-wal` | < 50MB each |
| C-14 | stock_price.db | top-3 tickers row share < 60% of last-24h rows | top-3 < 60% |
| C-15 | market.db | `PRAGMA table_info(financial_reports)` — check ticker, period, revenue, confidence columns | all 4 present |
| C-16 | market.db | `SELECT count(*) FROM bctc_queue WHERE status='pending' AND created_at < datetime('now','-72h')` | 0 |

Also call:
```
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_alerts", arguments: {limit: 100}})
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "get_bctc_full", arguments: {}})
```
Cross-reference results with C-08 (orphaned alerts) and C-03/C-04 (BCTC coverage).

### Emit per failing check
```json
{
  "type": "db_integrity_breach",
  "ts": "<UTC ISO-8601>",
  "db_id": "<db from system-map>",
  "table": "<table>",
  "check_id": "<C-xx>",
  "detail": "<description>",
  "actual_value": <n>,
  "expected_value": <n>,
  "severity": "CRITICAL|WARN",
  "channel": "bug",
  "zone_owner": "<specialist from zones>",
  "dedup_key": "db_integrity_breach:<table>:<check_id>"
}
```

### Tier-3 Roll-Up Signal
```
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "post_agent_signal", arguments: {
  type: "system_health_report",
  ts: "<UTC>",
  tier: 3,
  summary: { services_up: N, services_down: N, cron_gaps: [...], sources_stale: [...], db_breaches: [...] },
  checks: { A_runtime: {pass, warn, critical}, B_fetch: {pass, warn, critical}, C_db: {pass, warn, critical} },
  overall: "HEALTHY|DEGRADED|CRITICAL",
  new_anomalies: [...],
  dedup_skipped: N
}})
```

→ skill: `.claude/skills/anomaly-task-bridge/SKILL.md`
  inputs: `AUDIT_TIER = 3`, `PROJECT_ROOT` already set

### Tier-3 WORK Notification
```
mcp__claude_ai_gateway__call_tool({server: "vn-market", tool: "send_telegram", arguments: {channel: "work", message: "[system-auditor] Tier-3 complete — N anomalies (C critical, W warn, I info)"}})
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
severity ≥ warn → `send_telegram(channel="bug")` AND append to `docs/signals/DASHBOARD.md`:
```
| check_id | severity | summary | zone_owner | status=OPEN |
```

> Invariant: timestamp = current UTC, never future, never speculative.

### Notebook timestamp guard
- Before writing `docs/agent-memory/notebooks/system-auditor.md`, ALWAYS get current UTC via:
  ```bash
  date -u +"%Y-%m-%dT%H:%M:%SZ"
  ```
- Use the returned value verbatim — NEVER speculate, NEVER round to a future minute
- NEVER write entries for cycles that have not fired yet

**Notebook write** — **APPEND new section, PRUNE oldest** per skill: `.claude/skills/notebook-write/SKILL.md` (AC-1 through AC-5).
<!-- NB-BLOAT-FLOW-OVERWRITE fix: replaced ambiguous "full overwrite" with section-append+prune pattern matching all other agents. NEVER prepend. NEVER full-replace. Follow skill AC-1..AC-5 exactly. -->
- NEVER prepend. NEVER full-replace the file. Append the new section at EOF; prune oldest if ≥3 sections exist.
- Hard cap: ≤200L total (AC-5 gate — run wc -l after write; prune additional sections if still >200L).
- Per-section content ≤60L. Use compact summary format — do NOT dump raw check output line-by-line.
```
## c<NNN> · <YYYY-MM-DDThh:mmZ>
### Audit Run Tier-N (HH:MM–HH:MM UTC YYYY-MM-DD)
- Tier: N | Services checked: N | Sources checked: N | DB checks: N
- Anomalies: N new (C critical, W warn, I info) | M dedup-skipped
- Status: HEALTHY | DEGRADED | CRITICAL
```
Then:
**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/system-auditor.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/system-auditor.md
git commit -m "chore(memory/system-auditor): notebook YYYY-MM-DD tier-N"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

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
```
