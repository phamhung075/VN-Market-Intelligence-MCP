# System Audit Runbook

**Load when:** audit_cycle_start or when investigating BUG-channel alerts from system-auditor.
**Maintained by:** system-auditor (auto) + ops (manual updates on new failure patterns).
**SSOT:** `docs/data/system-map.json` — service names, ports, DB paths, VPS routes, cadence thresholds.

---

## 1. How to Interpret a `microservice_degraded` Alert

A `microservice_degraded` signal means a Docker container is down, its health endpoint returned non-200, its restart count exceeded 2 in 24h, or required tooling is missing.

**Fields to read:**
- `service_id` — which container (e.g., `pdf-extractor`, `mcp-server`)
- `check_id` — which specific check failed (A-01 through A-31)
- `detail` — what was observed

**Diagnostic steps:**
```bash
# 1. Check container status
docker ps --filter name=<service_id>

# 2. Check recent logs
docker logs --since=1h <service_id> 2>&1 | tail -50

# 3. Check restart history
docker inspect <service_id> --format "{{.RestartCount}} restarts, State: {{.State.Status}}"

# 4. Restart if needed (ops only — never system-auditor)
docker-compose restart <service_id>
```

**Check-specific guidance:**

| check_id | What it means | Action |
|---|---|---|
| A-01 through A-11 | Container exited or not found | Check `docker logs`, restart via `docker-compose restart <id>` |
| A-12 through A-20 | Health endpoint not responding | Container may be starting up — wait 60s, re-check; if persists check logs |
| A-21 | Restart count > 2 | OOM or crash loop — check logs for panic/OOM; may need memory limit increase |
| A-22 | `pdftoppm` missing in mcp-server | Rebuild mcp-server image with poppler-utils installed |
| A-23 | `tesseract` missing in mcp-server | Rebuild mcp-server image with tesseract-ocr installed |
| A-24 | `vie` language pack missing | Rebuild mcp-server image with tesseract-ocr-vie installed |
| A-25 through A-28 | Inter-service HTTP failure | Both containers must be running; check Docker network (`market_default`) |
| A-30 | Memory > 85% | Monitor for OOM; increase container memory limit in docker-compose.yml if sustained |
| A-31 | EPIPE/ECONNRESET errors in logs | Network instability or upstream disconnect; check VPS connectivity |

---

## 2. How to Interpret a `data_stale` Alert

A `data_stale` signal means a data source has not had a successful fetch within its `stale_threshold_hours` window (defined in `docs/data/system-map.json § data_sources`).

**Fields to read:**
- `source_id` — which source (e.g., `bctc-push`, `news-vps`, `foreign-flow`)
- `category` — price / news / macro / flow / bctc / sentiment / climate / procurement / sector / exchange
- `elapsed_hours` vs `expected_cadence_hours` — how far behind
- `check_id` — B-01 through B-13

**Diagnostic commands:**

```bash
# VPS-backed sources (geo_blocked: true in system-map)
# Check VPS proxy health
mcp: get_vps_proxy_health
mcp: get_vps_service_health

# Trigger manual VPS fetch
mcp: trigger_bctc_vps_fetch        # for bctc-discover, bctc-push
mcp: trigger_foreign_flow_vps_fetch # for foreign-flow
mcp: trigger_news_vps_fetch         # for news-vps
mcp: trigger_sbv_vps_fetch          # for sbv-vps
mcp: trigger_price_vps_fetch        # for ssc-iboard

# Check VPS server directly
curl -sf http://125.212.251.27:8765/health
```

**Check-specific guidance:**

| check_id | Source | Action |
|---|---|---|
| B-01 | ssc-iboard | VPS proxy issue → `get_vps_proxy_health` → `trigger_price_vps_fetch` |
| B-02 | news-vps | `trigger_news_vps_fetch` or check news-fetch container |
| B-03 | foreign-flow | Market hours check — only alert during 09:00–15:30 VN (02:00–08:30 UTC M-F) |
| B-05 | bctc-push | `trigger_bctc_vps_fetch` → check VPS `/bctc-files/` endpoint |
| B-06 | All 7 VPS routes | VPS server down — SSH to VPS, check nginx/proxy service |
| B-08 | BCTC PDFs | `docker exec mcp-server ls /app/data/pdfs/` — 0 files = VPS fetch pipeline broken |
| B-09 | bctc_queue | SSC portal URLs in queue → dev-mcp-server: fix URL-filter in bctcQueueEnricher |
| B-13 | bctc_queue | Stale pending rows → bctcQueueEnricher not running → check cron |

**False-positive patterns:**
- `foreign-flow` stale outside VN market hours → skip (flag: `market_hours_only: true`)
- `bctc-discover`, `bctc-push` outside earnings window (non-Q1/Q2/Q3/Q4 +14d) → 168h threshold is correct, not stale unless > 7 days

---

## 3. How to Interpret a `db_integrity_breach` Alert

A `db_integrity_breach` signal means a DB write distribution check, schema sentinel check, or cross-table consistency check failed.

**Fields to read:**
- `db_id` — which database (market, stock_price, alert_engine, pdf_extractor, rag_service, rag_vectors)
- `table` — which table
- `check_id` — C-01 through C-16
- `actual_value` vs `expected_value`

**DB paths** (from system-map.json):
| db_id | path |
|---|---|
| market | /app/data/market.db |
| stock_price | /app/data/stock_price.db |
| alert_engine | /app/data/alert_engine.db |
| pdf_extractor | /app/data/pdf_extractor.db |
| rag_service | /app/data/rag_service.db |

**Manual query:**
```bash
docker exec mcp-server sqlite3 /app/data/<db>.db "<query>"
```

**Check-specific guidance:**

| check_id | Meaning | Zone owner | Action |
|---|---|---|---|
| C-01 | < 25 active tickers in stock_prices last 24h | dev-stock-price | Check stock-price container + VPS ssc-iboard fetch |
| C-02 | 0 rows in stock_prices last 24h | dev-stock-price | Critical — stock price fetcher down |
| C-03 | < 26 tickers with Q1-2026 BCTC | dev-pdf-extractor | Earnings window check — run `get_bctc_full` |
| C-04 | > 5 low-confidence BCTC rows | dev-pdf-extractor | OCR extraction quality issue — check pdf-extractor logs |
| C-05 | SSC portal URLs in bctc_queue | dev-mcp-server | URL-filter bug — `bctc_skip_queue_item` for SSC URLs |
| C-08 | Orphaned alerts (no parent signal) | dev-alert-engine | Cross-table join broken — check alert-engine signal linkage |
| C-09 | < 8 macro indicators updated last 26h | dev-macro-indicators | `macroIndicatorRefreshJob` may have failed |
| C-10 | > 2 failed pdf_extractions last 24h | dev-pdf-extractor | EPIPE crashes or OCR failures — check pdf-extractor logs |
| C-12 | PRAGMA integrity_check ≠ ok | zone owner per DB | DB corruption — do NOT restart; escalate to PM immediately |
| C-13 | WAL > 50MB | dev-mcp-server | WAL checkpoint stuck — check `walCheckpoint` cron |
| C-14 | Top-3 tickers > 60% of rows | dev-stock-price | Concentration anomaly — one ticker being over-fetched |
| C-15 | Missing sentinel columns | dev-pdf-extractor | Schema migration incomplete — check migration history |
| C-16 | Stale pending bctc_queue rows | dev-mcp-server | `bctcQueueEnricher` not running |

---

## 4. Escalation Path

```
system-auditor detects anomaly
  → emits typed signal (post_agent_signal)
  → BUG channel alert (severity ≥ WARN, dedup 7d)
  → `orch-state.json .signal_queue` row appended (status=NEW)
    → zone owner dev-* drains `.signal_queue` on their own cadence
      → if not fixed in 48h → PM creates task in `.task_board.backlog[]`
        → if recurring (≥2 fix commits same module) → PM blocks, calls Architect for root-cause rethink
```

**Zone owner lookup:** `docs/data/system-map.json § zones[].specialist` maps service zone → dev agent.

---

## 5. Known False-Positive Patterns

| Pattern | Condition | Why it's a false positive |
|---|---|---|
| `foreign-flow` stale (B-03) | Outside VN market hours (15:30–09:00 VN) | Source only produces data during market hours |
| `bctc-discover` / `bctc-push` stale (B-05) | Non-earnings window (> 14 days after Q end) | Quarterly source — 168h threshold is correct |
| `bctcBatchSweep` cron gap (A-29) | Between quarterly fire dates | Only check within ±72h of `0 9 25 1,4,7,10 *` |
| C-03 low BCTC ticker count | Before April each year (Q4 earnings not yet filed) | Earnings window exemption — only flag Apr–May 2026 for Q1 |
| C-11 no completed pdf_extractions | No earnings window active | Only mandatory during Q1/Q2/Q3/Q4 +14d windows |
| `trading-economics-chromium` stale | flaresolverr container down | Chromium scrape depends on flaresolverr — check `docker ps flaresolverr` |
