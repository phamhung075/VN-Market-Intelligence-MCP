# Architecture Brief — system-auditor Scope Expansion
**Date:** 2026-05-19
**Author:** agents-architect
**Slug:** system-auditor-scope-expansion
**Status:** READY FOR IMPLEMENTATION

---

## Problem Statement

The existing `system-auditor` (version 2026-04-26) operates entirely at the **docs/memory/code layer**: it checks MEMORY.md integrity, knowledge file hygiene, agent file pointers, doc size caps, and SQLite WAL size. It has no awareness of the **9-service Docker microservices stack**, no coverage of **data fetch freshness per source**, and no **DB write integrity** checks (rows landing where expected, in sane distributions).

The 1953 sprint chain (BCTC pipeline fire, April–May 2026) exposed six silent failure classes that the current auditor would never catch:

| Failure | Why current auditor missed it |
|---|---|
| mcp-server container missing `pdftoppm`/`tesseract`/`tesseract-vie` | No container tooling check |
| `bctcBatchSweepJob` never fired 2026-04-25 09:00 UTC (container down) | No cron last-run timestamp check |
| VPS discovery pattern bug (`quý 01` vs `quý 1`) — 0 PDFs fetched for weeks | No per-source fetch delta check |
| `pdfOcrWorker` EPIPE crashes — silently dropped extractions | No service error-rate / crash check |
| 34 BCTC queue rows had SSC portal URLs (LIKE-filter mismatch) | No DB shape / distribution check |
| Cross-source data never converged into synthesis ("data on all source but all is separate") | No cross-table consistency check |

The auditor must grow three new audit dimensions (A/B/C) without becoming a heavyweight cron-killer itself.

---

## Scope of Current Agent (Baseline)

Current `system-auditor` responsibilities (`.claude/agents/system-auditor.md` version 2026-04-26):
- Memory/MEMORY.md integrity
- Knowledge file hygiene (hardcoded volatile values)
- Agent file validation (dangling pointers, tree-map compliance)
- Doc size caps (CLAUDE.md / TASKS.md / SPRINT_GOAL.md)
- SQLite WAL size + `PRAGMA integrity_check`
- Project stats drift

**None** of the above touches runtime, fetch freshness, or DB write distributions.

---

## Section 1 — Three New Audit Dimensions

### Dimension A — Microservice Runtime Health

Source of truth for services: `docs/data/system-map.json § microservices` (11 services in `core_services` + infrastructure).

Per service, check:

| Sub-check | Mechanism | Pass condition |
|---|---|---|
| Container running | `docker ps --filter name=<id> --format "{{.Status}}"` | `Up X` present |
| Health endpoint 200 | `curl -sf http://localhost:<port>/health` (use external_port from system-map) | HTTP 200 within 3s |
| Restart count last 24h | `docker inspect <id> --format "{{.RestartCount}}"` | ≤ 2 |
| Last log line freshness | `docker logs --since=30m <id> 2>&1 | tail -1` | Non-empty within freshness window |
| Container tooling present (mcp-server only) | `docker exec mcp-server which pdftoppm tesseract` | Both found |
| Inter-service connectivity | `docker exec mcp-server curl -sf http://stock-price:5000/health` etc. | HTTP 200 for all peer services |
| Memory/CPU pressure | `docker stats --no-stream --format "{{.MemPerc}} {{.CPUPerc}}" <id>` | Mem < 85%, CPU < 90% |

Cron job fire status (mcp-server only — it owns all crons):
- Tool: `get_cron_health` (MCP) → returns last fire timestamp per job
- For each cron in `system-map.json § microservices[0].crons`: compute expected last-fire from schedule expression → compare to actual last-fire → flag if gap > 2× cadence
- Special case: `bctcBatchSweep` (quarterly) — only check within 72h of expected fire date

### Dimension B — Data Fetch Integrity

Source of truth: `docs/data/system-map.json § data_sources` (27 sources). Expected cadence is NOT yet in system-map — see §7 item 4 for the required addition.

Per source, check:

| Sub-check | Mechanism | Pass condition |
|---|---|---|
| Last successful fetch timestamp | `get_pipeline_health` MCP tool | Within cadence window (see cadence table below) |
| Row count delta last 24h | DB query per source → see check catalogue §2 | > 0 for daily+ sources; quarterly sources exempt outside earnings windows |
| VPS proxy health (7 geo-blocked sources) | `get_vps_proxy_health` MCP tool | All 7 routes status = "ok" |
| VPS service health per route | `get_vps_service_health` MCP tool | All routes HTTP 200 |
| BCTC PDF landing presence | `docker exec mcp-server ls /app/data/pdfs/ | wc -l` | > 0; delta vs previous audit > 0 during earnings windows |
| Source URL shape (BCTC queue) | `SELECT count(*) FROM bctc_queue WHERE url LIKE '%ssc.gov.vn%'` | 0 (SSC portal URLs are invalid BCTC PDF URLs) |

Expected fetch cadence per source category:

| Category | Sources | Expected cadence | Stale threshold |
|---|---|---|---|
| price (intraday) | ssc-iboard, yahoo-finance | 15 min | 30 min |
| price (EOD) | hose, hnx | 1 day | 26h |
| news | news-vps, newsapi, reuters, vneconomy-rss, vnexpress-rss | 1h | 3h |
| macro | fred, fred-effr-iorb, fred-ism-subcomponents, sbv, sbv-vps, sbv-circular, trading-economics, trading-economics-chromium, imf | 6h | 24h |
| flow | foreign-flow | 1 min (market hours) | 30 min (market hours only) |
| bctc | bctc-discover, bctc-push | quarterly + on-demand | 7 days outside earnings; 24h during Q1/Q2/Q3/Q4 +14d windows |
| sentiment | polymarket | 30 min | 2h |
| climate | weather-vn, hydrological | 6h | 24h |
| procurement | muasamcong | 1 day | 72h |
| sector | dav-pharmacy | 1 month | 35 days |
| exchange | hose, hnx | 1 day | 26h |

### Dimension C — Database Write Integrity

Source of truth: `docs/data/system-map.json § infrastructure.databases` (6 DBs). Active watchlist = 33 tickers (`active: true` in system-map watchlist).

Per critical table:

| Table | DB | Check | Pass condition |
|---|---|---|---|
| `stock_prices` | stock_price | `SELECT count(DISTINCT ticker) FROM stock_prices WHERE created_at > datetime('now','-24h')` | ≥ 25 of 33 active tickers |
| `stock_prices` | stock_price | `SELECT count(*) FROM stock_prices WHERE created_at > datetime('now','-24h')` | > 0 (non-zero delta) |
| `financial_reports` | market | `SELECT count(DISTINCT ticker) FROM financial_reports WHERE period LIKE '%Q1%2026%'` | ≥ 26 of 33 (post-Q1 earnings window: April–May 2026) |
| `financial_reports` | market | `SELECT count(*) FROM financial_reports WHERE updated_at > datetime('now','-7d') AND confidence < 0.2` | ≤ 5 (low-confidence row spike = extraction problem) |
| `bctc_queue` | market | `SELECT count(*) FROM bctc_queue WHERE status = 'pending' AND created_at < datetime('now','-72h')` | 0 (stale pending = enricher not running) |
| `bctc_queue` | market | `SELECT count(*) FROM bctc_queue WHERE url LIKE '%ssc.gov.vn%' AND status != 'skipped'` | 0 (SSC portal URL = invalid, must be skipped) |
| `news_articles` | market | `SELECT count(*) FROM news_articles WHERE created_at > datetime('now','-3h')` | > 0 |
| `agent_signals` | market | `SELECT count(*) FROM agent_signals WHERE created_at > datetime('now','-24h')` | > 0 |
| `alerts` | alert_engine | `SELECT count(*) FROM alerts a LEFT JOIN agent_signals s ON a.signal_id = s.id WHERE s.id IS NULL AND a.created_at > datetime('now','-24h')` | 0 (orphaned alerts = cross-table inconsistency) |
| `macro_indicators` | market | `SELECT count(DISTINCT indicator_key) FROM macro_indicators WHERE updated_at > datetime('now','-26h')` | ≥ 8 (core macro set) |
| `pdf_extractions` | pdf_extractor | `SELECT count(*) FROM pdf_extractions WHERE status = 'failed' AND created_at > datetime('now','-24h')` | ≤ 2 (EPIPE crash sentinel) |
| `pdf_extractions` | pdf_extractor | `SELECT count(*) FROM pdf_extractions WHERE status = 'completed' AND created_at > datetime('now','-48h')` | > 0 during earnings windows |
| Schema integrity (all 6 DBs) | all | `PRAGMA table_info(<critical_table>)` for sentinel columns | Expected columns present; no null schema |

---

## Section 2 — Exact Check Catalogue

### Table A — Microservice Runtime Checks

| check_id | command / query | expected result | severity | channel |
|---|---|---|---|---|
| A-01 | `docker ps --filter name=mcp-server --format "{{.Status}}"` | contains `Up` | CRITICAL | BUG |
| A-02 | `docker ps --filter name=api-gateway --format "{{.Status}}"` | contains `Up` | CRITICAL | BUG |
| A-03 | `docker ps --filter name=stock-price --format "{{.Status}}"` | contains `Up` | CRITICAL | BUG |
| A-04 | `docker ps --filter name=technical-analysis --format "{{.Status}}"` | contains `Up` | CRITICAL | BUG |
| A-05 | `docker ps --filter name=macro-indicators --format "{{.Status}}"` | contains `Up` | CRITICAL | BUG |
| A-06 | `docker ps --filter name=kinh-dich-service --format "{{.Status}}"` | contains `Up` | CRITICAL | BUG |
| A-07 | `docker ps --filter name=alert-engine --format "{{.Status}}"` | contains `Up` | CRITICAL | BUG |
| A-08 | `docker ps --filter name=pdf-extractor --format "{{.Status}}"` | contains `Up` | CRITICAL | BUG |
| A-09 | `docker ps --filter name=rag-service --format "{{.Status}}"` | contains `Up` | WARN | BUG |
| A-10 | `docker ps --filter name=news-fetch --format "{{.Status}}"` | contains `Up` | WARN | BUG |
| A-11 | `docker ps --filter name=frontend --format "{{.Status}}"` | contains `Up` | INFO | silent |
| A-12 | `curl -sf http://localhost:3000/health` (mcp-server) | HTTP 200 | CRITICAL | BUG |
| A-13 | `curl -sf http://localhost:4000/health` (api-gateway) | HTTP 200 | CRITICAL | BUG |
| A-14 | `curl -sf http://localhost:5010/health` (stock-price external) | HTTP 200 | CRITICAL | BUG |
| A-15 | `curl -sf http://localhost:5003/health` (technical-analysis) | HTTP 200 | WARN | BUG |
| A-16 | `curl -sf http://localhost:5004/health` (macro-indicators) | HTTP 200 | WARN | BUG |
| A-17 | `curl -sf http://localhost:5005/health` (kinh-dich) | HTTP 200 | INFO | silent |
| A-18 | `curl -sf http://localhost:5006/health` (alert-engine) | HTTP 200 | CRITICAL | BUG |
| A-19 | `curl -sf http://localhost:5001/health` (pdf-extractor) | HTTP 200 | WARN | BUG |
| A-20 | `curl -sf http://localhost:5002/health` (rag-service) | HTTP 200 | INFO | silent |
| A-21 | `docker inspect mcp-server --format "{{.RestartCount}}"` | ≤ 2 | WARN | BUG |
| A-22 | `docker exec mcp-server which pdftoppm` | exit 0 | CRITICAL | BUG |
| A-23 | `docker exec mcp-server which tesseract` | exit 0 | CRITICAL | BUG |
| A-24 | `docker exec mcp-server tesseract --list-langs 2>&1 \| grep vie` | `vie` present | CRITICAL | BUG |
| A-25 | `docker exec mcp-server curl -sf http://stock-price:5000/health` | HTTP 200 | CRITICAL | BUG |
| A-26 | `docker exec mcp-server curl -sf http://technical-analysis:5003/health` | HTTP 200 | WARN | BUG |
| A-27 | `docker exec mcp-server curl -sf http://alert-engine:5006/health` | HTTP 200 | CRITICAL | BUG |
| A-28 | `docker exec mcp-server curl -sf http://pdf-extractor:5001/health` | HTTP 200 | WARN | BUG |
| A-29 | `get_cron_health` → compare last_run vs expected for each cron | gap ≤ 2× cadence | WARN | DASHBOARD + BUG |
| A-30 | `docker stats --no-stream mcp-server --format "{{.MemPerc}}"` | < 85% | WARN | BUG |
| A-31 | `docker logs --since=30m mcp-server 2>&1 \| grep -c "EPIPE\|ECONNRESET"` | 0 (or ≤ 2 transient) | WARN | BUG |

### Table B — Data Fetch Integrity Checks

| check_id | query / tool | expected result | severity | channel |
|---|---|---|---|---|
| B-01 | `get_pipeline_health` → ssc-iboard last_fetch | < 30 min ago | CRITICAL | BUG |
| B-02 | `get_pipeline_health` → news-vps last_fetch | < 3h ago | WARN | BUG |
| B-03 | `get_pipeline_health` → foreign-flow last_fetch (market hours) | < 30 min ago | WARN | BUG |
| B-04 | `get_pipeline_health` → sbv-vps last_fetch | < 24h ago | INFO | silent |
| B-05 | `get_pipeline_health` → bctc-push last_fetch | < 7 days (non-earnings) | WARN | BUG |
| B-06 | `get_vps_proxy_health` → all 7 routes | all `status: ok` | CRITICAL | BUG |
| B-07 | `get_vps_service_health` → all routes | all HTTP 200 | CRITICAL | BUG |
| B-08 | `docker exec mcp-server ls /app/data/pdfs/ \| wc -l` | > 0 | WARN | BUG |
| B-09 | `SELECT count(*) FROM bctc_queue WHERE url LIKE '%ssc.gov.vn%' AND status != 'skipped'` | 0 | CRITICAL | BUG |
| B-10 | `SELECT count(*) FROM news_articles WHERE created_at > datetime('now','-3h')` (market.db) | > 0 | WARN | BUG |
| B-11 | `get_macro_snapshot` → check timestamp field | < 26h ago | WARN | BUG |
| B-12 | `get_rate_limit_status` → all sources | no source at 100% | WARN | BUG |
| B-13 | `SELECT count(*) FROM bctc_queue WHERE status='pending' AND created_at < datetime('now','-72h')` | 0 | WARN | DASHBOARD |

### Table C — Database Write Integrity Checks

| check_id | query | expected result | severity | channel |
|---|---|---|---|---|
| C-01 | `SELECT count(DISTINCT ticker) FROM stock_prices WHERE created_at > datetime('now','-24h')` | ≥ 25 | CRITICAL | BUG |
| C-02 | `SELECT count(*) FROM stock_prices WHERE created_at > datetime('now','-24h')` | > 0 | CRITICAL | BUG |
| C-03 | `SELECT count(DISTINCT ticker) FROM financial_reports WHERE period LIKE '%Q1%2026%'` | ≥ 26 (in Q1 earnings window) | WARN | DASHBOARD |
| C-04 | `SELECT count(*) FROM financial_reports WHERE updated_at > datetime('now','-7d') AND confidence < 0.2` | ≤ 5 | WARN | BUG |
| C-05 | `SELECT count(*) FROM bctc_queue WHERE url LIKE '%ssc.gov.vn%' AND status != 'skipped'` | 0 | CRITICAL | BUG |
| C-06 | `SELECT count(*) FROM news_articles WHERE created_at > datetime('now','-3h')` | > 0 | WARN | BUG |
| C-07 | `SELECT count(*) FROM agent_signals WHERE created_at > datetime('now','-24h')` | > 0 | WARN | BUG |
| C-08 | `SELECT count(*) FROM alerts a LEFT JOIN agent_signals s ON a.signal_id = s.id WHERE s.id IS NULL AND a.created_at > datetime('now','-24h')` | 0 | WARN | BUG |
| C-09 | `SELECT count(DISTINCT indicator_key) FROM macro_indicators WHERE updated_at > datetime('now','-26h')` | ≥ 8 | WARN | BUG |
| C-10 | `SELECT count(*) FROM pdf_extractions WHERE status = 'failed' AND created_at > datetime('now','-24h')` | ≤ 2 | WARN | BUG |
| C-11 | `SELECT count(*) FROM pdf_extractions WHERE status = 'completed' AND created_at > datetime('now','-48h')` | > 0 (earnings window) | WARN | DASHBOARD |
| C-12 | `PRAGMA integrity_check` on all 6 DBs | `ok` | CRITICAL | BUG |
| C-13 | WAL size for all 6 DBs: `ls -lh /app/data/*.db-wal` | < 50 MB each | WARN | BUG |
| C-14 | `SELECT count(DISTINCT ticker) FROM stock_prices WHERE created_at > datetime('now','-24h')` concentration check: top-3 tickers < 60% of rows | top-3 < 60% | WARN | BUG |
| C-15 | `PRAGMA table_info(financial_reports)` — check for sentinel columns: `ticker`, `period`, `revenue`, `confidence` | all 4 present | CRITICAL | BUG |
| C-16 | `SELECT count(*) FROM bctc_queue WHERE status='pending' AND created_at < datetime('now','-72h')` | 0 | WARN | DASHBOARD |

---

## Section 3 — Cadence + Schedule

Three-tier cadence. All times UTC.

### Tier 1 — Lightweight Runtime Ping (every 30 min)
**Scope:** Dimension A checks only — A-01 through A-11 (container running), A-12 through A-20 (health endpoints), A-21 (restart count), A-30 (memory pressure).
**Goal:** Catch container down within 30 min.
**Load:** ~8 bash calls + 9 curl calls. Total wall time < 15s. Safe alongside existing 30-min crons.
**Cron expression:** `*/30 * * * *`

### Tier 2 — Data Freshness Sweep (every 4 hours)
**Scope:** Dimension A cron fire status (A-29), Dimension B checks B-01 through B-13, plus Dimension C quick checks C-06, C-07 (news + signals freshness).
**Goal:** Catch stale fetch sources within 4h window.
**Load:** ~5 MCP calls + ~4 DB queries. Total wall time < 30s.
**Cron expression:** `0 */4 * * *`

### Tier 3 — Deep DB Integrity (daily at 02:00 UTC)
**Scope:** Full Dimension C (C-01 through C-16) + container tooling checks (A-22 through A-28, A-31) + inter-service connectivity (A-25 through A-28).
**Goal:** Catch write distribution anomalies, schema drift, EPIPE crash accumulation, orphaned rows.
**Load:** ~16 DB queries across 6 DBs + ~7 docker exec calls. Total wall time < 60s. Runs at 02:00 UTC = 09:00 VN off-peak.
**Cron expression:** `0 2 * * *`

**Design constraint:** system-auditor itself MUST NOT add more than 3 new cron entries. The three tiers above are implemented as three scheduled invocations of `system-auditor`, each passing a `--tier` flag (or equivalent input variable) to the flow so the checklist scope is gated per tier. The existing irregular schedule is replaced by these three explicit entries.

---

## Section 4 — Output Contracts (Signal Shapes)

All signals emitted via `post_agent_signal` MCP tool. Routing rules enforced by fail-loud-protocol.

### Signal: `system_health_report`
Emitted after Tier 3 (daily) or on demand. Routed to po + agents-architect via DASHBOARD.md.

```json
{
  "type": "system_health_report",
  "ts": "<ISO-8601 UTC>",
  "tier": 3,
  "summary": {
    "services_up": 11,
    "services_down": 0,
    "cron_gaps": [],
    "sources_stale": [],
    "db_breaches": []
  },
  "checks": {
    "A_runtime": { "pass": 31, "warn": 0, "critical": 0 },
    "B_fetch": { "pass": 13, "warn": 0, "critical": 0 },
    "C_db": { "pass": 16, "warn": 0, "critical": 0 }
  },
  "overall": "HEALTHY | DEGRADED | CRITICAL",
  "new_anomalies": [],
  "dedup_skipped": 0
}
```

### Signal: `microservice_degraded`
Emitted per failing service. Routed to BUG channel + DASHBOARD.md (zone owner column).

```json
{
  "type": "microservice_degraded",
  "ts": "<ISO-8601 UTC>",
  "service_id": "pdf-extractor",
  "zone": "apps/pdf-extractor",
  "zone_owner": "dev-pdf-extractor",
  "check_id": "A-08",
  "detail": "container exited — RestartCount=5 in last 24h",
  "severity": "CRITICAL",
  "channel": "bug",
  "dedup_key": "microservice_degraded:pdf-extractor:A-08"
}
```

### Signal: `data_stale`
Emitted per stale source. Routed to BUG channel + DASHBOARD.md (zone owner = dev zone responsible for that fetcher).

```json
{
  "type": "data_stale",
  "ts": "<ISO-8601 UTC>",
  "source_id": "bctc-push",
  "category": "bctc",
  "last_fetch_ts": "<ISO-8601 UTC>",
  "expected_cadence_hours": 168,
  "elapsed_hours": 504,
  "zone_owner": "dev-mcp-server",
  "check_id": "B-05",
  "severity": "WARN",
  "channel": "bug",
  "dedup_key": "data_stale:bctc-push:B-05"
}
```

### Signal: `db_integrity_breach`
Emitted per failing table check. Routed to BUG channel + DASHBOARD.md (po + zone owner).

```json
{
  "type": "db_integrity_breach",
  "ts": "<ISO-8601 UTC>",
  "db_id": "market",
  "table": "financial_reports",
  "check_id": "C-03",
  "detail": "Only 18 of 33 tickers have Q1-2026 financial_reports rows — expected ≥26 post-earnings",
  "actual_value": 18,
  "expected_value": 26,
  "severity": "WARN",
  "channel": "bug",
  "zone_owner": "dev-pdf-extractor",
  "dedup_key": "db_integrity_breach:financial_reports:C-03"
}
```

**Routing rule:** BUG channel write only when `severity >= WARN` AND `dedup_key` not seen in past 7 days. DASHBOARD.md row appended for all `WARN` and `CRITICAL` findings regardless of dedup (so dev-team can see current state at a glance). `INFO` signals are silent (notebook only).

---

## Section 5 — Tool Package Updates

Current `.claude/tools/package/system-auditor.md` has:
- File system tools: Read, Write, Edit, Glob, Grep, Bash (keep all — Bash is needed for docker calls)
- MCP tools: None

**Add the following MCP tools** (all via `call_tool(server="vn-market", tool=..., arguments={...})`):

| Tool | Trigger | Purpose |
|---|---|---|
| `get_cron_health` | Tier 1 + Tier 2 | Last-run timestamp per cron job → Dimension A cron fire check |
| `get_pipeline_health` | Tier 2 | Per-source last successful fetch timestamp → Dimension B |
| `get_vps_proxy_health` | Tier 2 | All 7 geo-blocked route health → Dimension B |
| `get_vps_service_health` | Tier 2 | Per-route HTTP status → Dimension B |
| `get_rate_limit_status` | Tier 2 | Source rate limit saturation → Dimension B |
| `get_macro_snapshot` | Tier 2 | Macro indicator freshness check → Dimension B |
| `get_alerts` | Tier 3 | Cross-table consistency — alerts vs signals → C-08 |
| `get_bctc_full` | Tier 3 | BCTC financial_reports coverage → C-03, C-04 |
| `get_system_status` | Tier 1 | MCP-level system status rollup |
| `post_agent_signal` | all tiers | Emit `system_health_report`, `microservice_degraded`, `data_stale`, `db_integrity_breach` |
| `send_telegram` | all tiers | BUG channel alert (severity ≥ WARN, new anomaly) |

**Keep existing constraints:** `channel market: write=false`. Add `channel work: write=true, rule: tier_complete_notifications_only` (Tier 3 daily report summary to WORK).

The `get_sla_status` tool should also be consulted during Tier 2 to validate freshness SLA alignment.

---

## Section 6 — Boundary Rules

These are non-negotiable and must be encoded in the updated agent definition.

1. **Detect only, never fix.** system-auditor NEVER modifies production code, container configs, DB rows, or cron schedules. It detects and signals.

2. **Never spawn dev-* agents directly.** All findings requiring dev-team action are written to DASHBOARD.md (the cross-team signal-dashboard). Dev-zone owners drain DASHBOARD on their own cadence.

3. **Never spawn cowork agents.** Cowork is the analysis team. system-auditor is infrastructure. No cross-spawn.

4. **DASHBOARD.md is the action sink, not direct spawning.** Append one row per WARN/CRITICAL finding to the appropriate section of `docs/signals/DASHBOARD.md`. Use the signal-dashboard skill (`docs/signals/DASHBOARD.md` writer pattern). Include: `check_id | severity | summary | zone_owner | status=OPEN`.

5. **7-day dedup window applies to BUG channel writes only**, not to DASHBOARD.md rows (which represent current state and should reflect current reality even if same anomaly recurs).

6. **Maintenance invocation model is unchanged.** system-auditor is never spawned by cowork-team or dev-team flows. It runs via its own scheduled cron or direct main-terminal invocation. The three new tier crons are self-owned.

7. **Token budget.** Tier 1 must complete in < 2 min wall time. Tier 2 in < 5 min. Tier 3 in < 10 min. Early exit if no changes AND last run < half-cadence is suspended for Tier 1 and Tier 2 (runtime/freshness checks must always run). The existing early-exit rule is retained only for the existing doc/memory audit pass (which can be bundled into Tier 3).

---

## Section 7 — Implementation Checklist for agent-father

### 7a — `.claude/agents/system-auditor.md`

1. **`version`**: update to `2026-05-19`
2. **`description`** (frontmatter + agent block): expand to include "microservice runtime health, data fetch integrity, DB write integrity"
3. **`capabilities`** — add three items:
   - "Audit all 9 Docker microservices: container up, health endpoint, restart count, log freshness, tooling presence, inter-service connectivity"
   - "Data fetch integrity: per-source last-fetch vs expected cadence, VPS proxy health, BCTC PDF landing, source URL shape"
   - "DB write integrity: row count distributions per table, watchlist coverage, schema sentinel checks, cross-table consistency, WAL size per DB"
4. **`responsibilities`** — add:
   - "Tier 1 (30-min): container + health endpoint liveness"
   - "Tier 2 (4h): data freshness sweep per source"
   - "Tier 3 (daily 02:00 UTC): deep DB integrity + tooling + inter-service connectivity"
   - "Emit typed signals: system_health_report, microservice_degraded, data_stale, db_integrity_breach"
   - "Append WARN/CRITICAL findings to docs/signals/DASHBOARD.md (zone_owner column populated)"
5. **`permissions.channels.work`**: change from `write: false` to `write: true, rule: tier_complete_notifications_only`
6. **`constraints`** — add:
   - `tier_aware: true`
   - `dashboard_write: true`
   - `max_wall_time_tier1_seconds: 120`
   - `max_wall_time_tier2_seconds: 300`
   - `max_wall_time_tier3_seconds: 600`
7. **`knowledge.lazy_load`** — add:
   - `path: docs/data/system-map.json`, `trigger: runtime_or_fetch_or_db_audit`, `fail_loud: true`
   - `path: docs/protocols/bctc-extraction-runbook.md`, `trigger: bctc_anomaly`, `fail_loud: false`
   - `path: docs/protocols/system-audit-runbook.md`, `trigger: audit_cycle_start`, `fail_loud: false`
8. **`tools_package`** — reference updated `.claude/tools/package/system-auditor.md` (no change to path, contents updated per §7c)
9. **`inter_agent.sends_to`** — add:
   - `{to: po, via: dashboard_md, on: warn_or_critical_finding}`
   - `{to: dev_zone_owner, via: dashboard_md, on: service_or_fetch_degraded}`

### 7b — `.claude/flows/system-auditor/main.md` (or new `cycle.md`)

Option: keep `main.md` as the tier dispatcher; existing checklist steps 1–6 become **Tier 3 steps only**.

Insert before existing Step 1:

```
## Tier Dispatch

Read input variable `AUDIT_TIER` (default: 3 if not set).

- TIER=1 → run §Tier-1 Runtime Ping only → skip all other steps → RETURN
- TIER=2 → run §Tier-2 Freshness Sweep only → skip all other steps → RETURN
- TIER=3 → run §Tier-1 + existing checklist steps 1–6 + §Tier-3 DB Integrity → RETURN
```

Insert new flow sections:

```
## Tier-1 Runtime Ping
For each service in system-map.json § microservices:
  - A-01 through A-20: docker ps + curl health
  - A-21: restart count
  - A-30: memory pressure
  - Emit microservice_degraded signal per failure (dedup 7d for BUG; always DASHBOARD)

## Tier-2 Freshness Sweep
  - A-29: get_cron_health → compare last_run vs cadence per cron
  - B-01 through B-13: get_pipeline_health, get_vps_proxy_health, get_vps_service_health, get_rate_limit_status
  - C-06, C-07: news_articles + agent_signals freshness queries
  - Emit data_stale signal per stale source
  - Append findings to DASHBOARD.md

## Tier-3 DB Integrity
  - A-22 through A-28, A-31: container tooling + EPIPE crash check
  - C-01 through C-16: all DB write integrity queries across 6 DBs
  - Emit db_integrity_breach per failing check
  - Emit system_health_report roll-up
  - send_telegram(channel="work", message="[system-auditor] Tier-3 complete — N anomalies")
```

The existing early-exit rule (`git diff` check) applies only when Tier=3 and is scoped to the doc/memory audit sub-steps (steps 1–6 of current flow), not to the new runtime/fetch/DB checks.

### 7c — `.claude/tools/package/system-auditor.md`

Replace `## MCP Tools — None (infrastructure monitoring only)` section with:

```markdown
## MCP Tools

All called via `call_tool(server="vn-market", tool=<name>, arguments={...})`.

| Tool | Tier | Purpose |
|---|---|---|
| get_system_status | 1 | MCP-level system status rollup |
| get_cron_health | 1,2 | Last-run timestamp per cron job |
| get_pipeline_health | 2 | Per-source last successful fetch ts |
| get_vps_proxy_health | 2 | All 7 geo-blocked routes health |
| get_vps_service_health | 2 | Per-route HTTP status |
| get_rate_limit_status | 2 | Source rate limit saturation |
| get_macro_snapshot | 2 | Macro indicator freshness check |
| get_sla_status | 2 | Freshness SLA alignment |
| get_alerts | 3 | Cross-table consistency check |
| get_bctc_full | 3 | BCTC financial_reports coverage |
| post_agent_signal | all | Emit typed audit signals |
| send_telegram | all | BUG channel alert (severity ≥ WARN) |
```

### 7d — `docs/data/system-map.json`

Add `expected_cadence_hours` and `stale_threshold_hours` fields to each entry in `data_sources`. Values per the cadence table in §1B above. Example:

```json
{ "id": "ssc-iboard", "proxy": "vps", "category": "price", "geo_blocked": true,
  "vps_path": "/proxy/ssc-iboard",
  "expected_cadence_hours": 0.25,
  "stale_threshold_hours": 0.5 }
```

This is the SSOT that Tier 2 reads — never hardcoded in the flow.

### 7e — `docs/protocols/system-audit-runbook.md` (NEW FILE)

Create this runbook for the human (or ops agent) investigating BUG-channel reports from system-auditor. Sections:

1. **How to interpret a `microservice_degraded` alert** — docker ps, docker logs, restart procedure
2. **How to interpret a `data_stale` alert** — which VPS route to check, trigger commands (`trigger_bctc_vps_fetch`, `trigger_foreign_flow_vps_fetch`, etc.)
3. **How to interpret a `db_integrity_breach` alert** — which DB, which table, diagnostic queries, when to call dev-pdf-extractor vs dev-mcp-server
4. **Escalation path** — system-auditor → DASHBOARD.md → zone owner dev-* → pm for sprint task if not fixed in 48h
5. **Known false-positive patterns** — earnings window exemptions (BCTC), market-hours-only checks (foreign-flow), bctcBatchSweep quarterly window

This runbook is lazy-loaded by system-auditor (`trigger: audit_cycle_start`).

### 7f — Cron Registration

Add three new cron entries to `system-map.json § microservices[0].crons` (mcp-server owns the schedules):

```json
{ "name": "systemAuditTier1", "schedule": "*/30 * * * *", "desc": "system-auditor Tier-1: container + health ping every 30 min" },
{ "name": "systemAuditTier2", "schedule": "0 */4 * * *", "desc": "system-auditor Tier-2: data freshness sweep every 4h" },
{ "name": "systemAuditTier3", "schedule": "0 2 * * *",   "desc": "system-auditor Tier-3: deep DB integrity daily 02:00 UTC" }
```

The existing `dataAuditDaily` (23:00 VN) and `dataAuditWeekly` (01:00 VN Sunday) crons must be reviewed: if they duplicate Tier-3 coverage, decommission them to avoid double audit load. Agent-father to confirm with developer before removal.

---

## Dependencies and Sequencing

1. **7d (system-map.json cadence fields)** — must land BEFORE 7b Tier-2 flow step (flow reads cadence from SSOT)
2. **7c (tool package)** — must land BEFORE 7b flow (flow references tool package)
3. **7e (runbook)** — can land in parallel with 7a/7b; low urgency, no flow dependency
4. **7f (cron registration)** — lands LAST; activates tiers; requires 7a+7b+7c+7d complete

---

## Risk Notes

- Tier-1 runs every 30 min and adds ~8 bash + 9 curl calls. Docker daemon on macOS host adds ~200ms per call. Estimated wall time: 8–12s. Safe.
- DB queries in Tier-3 are read-only SELECTs on SQLite. No WAL impact. Each query < 50ms on current data volumes.
- `get_cron_health` MCP tool must return `last_run_ts` per job name — verify tool schema before Tier-2 implementation. If tool does not expose per-job granularity, agent-father must add it or use a direct DB query against the cron-health table.
- Quarterly bctcBatchSweep check (A-29 special case): only active within ±72h of `0 9 25 1,4,7,10 *` fire dates. Auditor must compute next/last fire date at runtime to avoid false alerts.

---

## NEXT

`NEXT: agent-father | implement per §7 checklist (sequence: 7d → 7c → 7a → 7b → 7e → 7f)`
