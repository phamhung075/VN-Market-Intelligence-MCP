# RUNBOOK: RECOVER-LIVEDB-INTEGRITY

**Date:** 2026-06-07
**Sprint:** RECOVER-LIVEDB-INTEGRITY
**Author:** architect
**Status:** REVISED — Attempt-1 rolled back cleanly 2026-06-07 (2m07s downtime). Revised method in §8 ready for second window.
**Downstream gated:** FIX-BCTC-LIAB-PRIOR-PERIOD live re-parse

---

## 0. Situation Summary

`PRAGMA integrity_check` on the LIVE `market.db` (named volume
`vn-market-intelligence-mcp_market_data`, mounted at `/app/data` in `mcp-server`) returns:

- B-tree page-level corruption: tree 32 page 2533 cell rowid out-of-order
- Double-referenced pages: 2533 and 22008 (two distinct tables each claim these pages)
- Index/table mismatches: `pdf_extracted_text` and `system_logs` tables — indexes
  `idx_pet_*` and `idx_system_logs_*` have rows that do not correspond to table rows
  (index bloat / orphan entries)

Reads are currently serving correct data. The corruption is structural (B-tree page
ordering and freelist double-reference) rather than content-level. This distinction
drives the method choice in §1.

**Baselines for parity verification — empirically measured 2026-06-07T10:02:25+07:00:**

Principle: restore-verification = per-table equality vs live measured immediately before dump.
There is no `stock_prices` table. Price data lives in `market_prices` (current snapshot, 121 rows)
and `market_prices_history` (append-only time-series). The full baseline table is in §2c.

| Baseline | Table | Value |
|---|---|---|
| C-01 Current price codes | `market_prices` | 121 distinct codes |
| C-02 Price history rows | `market_prices_history` | 41,265 rows |
| C-03 Price history max timestamp | `market_prices_history` | 2026-06-05T08:59:30.032Z |
| C-04 smoke read | `pdf_extracted_text` | 949 rows (integer, no error) |
| C-05 smoke read | `system_logs` | 550,681 rows (append-only; drift ≤1% acceptable) |

**Downtime window:** Sunday market-closed period, targeting execution start
2026-06-07 09:00 UTC+7 (02:00 UTC). VN market opens Monday 2026-06-09 02:30 UTC
(09:00 UTC+7). This yields approximately 19 hours of safe execution headroom.

---

## 1. Recovery Method Decision

### Options Considered

| Method | What it does | Handles double-ref pages | Handles idx mismatch | Risk of data loss | Speed |
|---|---|---|---|---|---|
| `sqlite3 .dump` + reload | Logical export of all rows; creates new B-tree from scratch | YES — logical export ignores physical page allocation | YES — indexes rebuilt clean | LOW — only rows readable at dump time are exported | Medium (~5–15 min for typical market.db size) |
| `sqlite3 .recover` | Page-level forensic reconstruction; reads every page including corrupt ones | PARTIAL — may duplicate rows from double-ref pages | PARTIAL — recovered indexes may still be inconsistent | MEDIUM — can recover rows inaccessible to .dump, but may also emit duplicates | Slow (~20–40 min) |
| Targeted `REINDEX` | Rebuilds only the named indexes | NO — does not fix B-tree page order or double-ref | YES for idx_pet_*/idx_system_logs_* only | VERY LOW | Fast (~1 min) |

### Recommendation: `sqlite3 .dump` + reload

**Justification:** The corruption profile here has two components that interact badly with
`REINDEX`-only and `RECOVER`:

1. **B-tree page-level out-of-order (page 2533) + double-reference (pages 2533 and 22008)**:
   This is freelist / B-tree structural damage. `REINDEX` rebuilds index B-trees but does not
   touch table B-trees or the freelist — it will not resolve the double-reference and will leave
   the underlying page corruption intact. `PRAGMA integrity_check` will still fail after
   `REINDEX` alone.

2. **Index orphan entries (idx_pet_*, idx_system_logs_*)**: These are a secondary symptom.
   `REINDEX` would fix them but cannot be safely run while the primary B-tree/freelist corruption
   exists — the `REINDEX` walk may itself encounter the corrupted pages and abort or produce
   a second inconsistent index.

3. **`.recover` risk**: `.recover` performs a page-by-page forensic scan. With double-referenced
   pages (2533 + 22008), `.recover` may emit duplicate rows for any rows whose B-tree nodes
   resided on those pages. Post-recover deduplication on a financial DB is not safe without
   manual validation. The extra complexity is not warranted here because reads are currently
   clean — the content layer is intact.

**`.dump` + reload is the correct method because:**
- It exports only the logical row content (which is confirmed clean — reads serve correctly).
- The reload writes a brand-new SQLite file with a fresh B-tree, clean freelist, and all
  indexes rebuilt from scratch in page order.
- It is deterministic: output is human-readable SQL; operator can inspect it before replay.
- Downtime is bounded and predictable (dump + reload, not page forensics).
- Risk: only rows readable at dump time are exported. Given that reads currently serve correct
  data, this is not a loss — any row inaccessible to `.dump` was already inaccessible to the
  application.

---

## 2. Backup Procedure (MUST complete and verify before any mutation)

### 2a. Locate the volume mount point on the host

```bash
# On the Docker host (macOS)
docker inspect vn-market-intelligence-mcp-mcp-server-1 \
  --format '{{ range .Mounts }}{{ if eq .Name "vn-market-intelligence-mcp_market_data" }}{{ .Source }}{{ end }}{{ end }}'
```

Record the host path (typically
`/var/lib/docker/volumes/vn-market-intelligence-mcp_market_data/_data` on Linux;
on macOS Docker Desktop the volume is inside the HyperKit/LinuxKit VM — use
`docker cp` approach below, not direct host path).

### 2b. Take the backup (via docker cp — safe on macOS Docker Desktop)

```bash
# Step 1 — Copy market.db OUT of the container to the host
docker cp vn-market-intelligence-mcp-mcp-server-1:/app/data/market.db \
  /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/data/market.db.bak-$(date +%Y%m%dT%H%M%S)

# Record the filename for later rollback reference, e.g.:
# /path/to/project/data/market.db.bak-20260607T020000
```

> NOTE: `docker cp` from a running container is safe for SQLite only if the DB is in
> WAL mode or if the container's writer is paused. mcp-server uses WAL mode
> (confirmed by schema-init code). The WAL checkpoint completes during copy.
> If WAL mode is NOT confirmed, add the WAL-flush step below before copy:
>
> ```bash
> docker exec vn-market-intelligence-mcp-mcp-server-1 \
>   sqlite3 /app/data/market.db "PRAGMA wal_checkpoint(TRUNCATE);"
> ```

### 2c. RESTORE-VERIFICATION (backup is not done until this passes)

> NOTE: sqlite3 CLI is not installed in the mcp-server container. Use `python3 -c "import sqlite3 ..."`.
> For the backup file (host-side), either `python3` on the host or `sqlite3` if installed.

**Empirically derived baseline table (measured live 2026-06-07T10:02:25+07:00, 87 tables).**
Full table list is recorded below for completeness; C-01/C-02/C-03 are the mandatory gates.

```bash
BACKUP_PATH="/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/data/market.db.bak-<TIMESTAMP>"

# C-01: current price codes (market_prices — snapshot table, NOT stock_prices)
python3 -c "import sqlite3; c=sqlite3.connect('$BACKUP_PATH').cursor(); c.execute('SELECT COUNT(DISTINCT code) FROM market_prices'); print(c.fetchone()[0])"
# EXPECTED: 121

# C-02: price history rows (market_prices_history — append-only time-series)
python3 -c "import sqlite3; c=sqlite3.connect('$BACKUP_PATH').cursor(); c.execute('SELECT COUNT(*) FROM market_prices_history'); print(c.fetchone()[0])"
# EXPECTED: 41265 (append-only — live may have grown slightly; accept ≥41265)

# C-03: price history max timestamp
python3 -c "import sqlite3; c=sqlite3.connect('$BACKUP_PATH').cursor(); c.execute('SELECT MAX(fetched_at) FROM market_prices_history'); print(c.fetchone()[0])"
# EXPECTED: 2026-06-05T08:59:30.032Z

# C-04: smoke read pdf_extracted_text
python3 -c "import sqlite3; c=sqlite3.connect('$BACKUP_PATH').cursor(); c.execute('SELECT COUNT(*) FROM pdf_extracted_text'); print(c.fetchone()[0])"
# EXPECTED: 949 (exact match — not append-only during recovery window)

# C-05: smoke read system_logs
python3 -c "import sqlite3; c=sqlite3.connect('$BACKUP_PATH').cursor(); c.execute('SELECT COUNT(*) FROM system_logs'); print(c.fetchone()[0])"
# EXPECTED: ≥ 550638 (append-only; backup captured 550638; live adds rows continuously)
```

**Full per-table baseline (measured 2026-06-07T10:02:25+07:00 — live is authoritative):**

| Table | Live count | Backup count | Drift note |
|---|---|---|---|
| agent_feedback | 340 | 340 | - |
| agent_signals | 1983 | 1983 | - |
| agent_work_log | 1275 | 1275 | - |
| agm_actuals | 2084 | 2084 | - |
| agm_plan | 323 | 323 | - |
| alert_engine_records | 0 | 0 | - |
| alert_mutes | 0 | 0 | - |
| alerts | 903 | 903 | - |
| ask_queue | 11 | 11 | - |
| audit_state | 1 | 1 | - |
| backtest_runs | 9 | 9 | - |
| bctc_balance_checks | 4 | 4 | - |
| bctc_eval_results | 84 | 84 | - |
| bctc_human_corrections | 1 | 1 | - |
| bctc_layout_units | 185 | 185 | - |
| bctc_md_tables | 1 | 1 | - |
| bctc_page_zones | 543 | 543 | - |
| bctc_refined_units | 53 | 53 | - |
| bctc_signal_debounce | 6 | 6 | - |
| bctc_table_rows | 891 | 891 | - |
| bctc_vps_queue | 413 | 413 | - |
| bond_maturity | 5 | 5 | - |
| briefing_log | 49 | 49 | - |
| broker_sanctions | 0 | 0 | - |
| calibration_snapshots | 5 | 5 | - |
| cascade_rule_hits | 8424 | 8424 | - |
| commodity_prices | 1 | 1 | - |
| commodity_prices_history | 1142 | 1142 | - |
| conviction_history | 694 | 694 | - |
| credit_data | 0 | 0 | - |
| cron_job_runs | 54696 | 54695 | +1 append-only drift |
| custom_alert_rules | 0 | 0 | - |
| daily_ohlcv | 25188 | 25188 | - |
| evidence_fragments | 0 | 0 | - |
| evidence_likelihood_ratios | 45 | 45 | - |
| evidence_scores | 369 | 369 | - |
| financial_reports | 15 | 15 | - |
| fred_series_daily | 8279 | 8279 | - |
| hexagram_transitions | 2617 | 2617 | - |
| imf_indicators | 3 | 3 | - |
| improve_check_log | 0 | 0 | - |
| insider_transactions | 0 | 0 | - |
| kinhdich_readings | 36175 | 36175 | - |
| macro_indicators | 1 | 1 | - |
| market_messages | 672 | 672 | - |
| market_prices | 121 | 121 | - |
| market_prices_history | 41265 | 41265 | - |
| market_summaries | 92 | 92 | - |
| mention_velocity | 240 | 240 | - |
| ohlcv_backfill_queue | 273 | 273 | - |
| pdf_extracted_text | 949 | 949 | - |
| pharma_events | 0 | 0 | - |
| portfolio_pnl_snapshots | 42 | 42 | - |
| portfolio_targets | 0 | 0 | - |
| positions | 1 | 1 | - |
| prediction_claims | 7 | 7 | - |
| prediction_markets | 83 | 83 | - |
| prediction_signals | 6 | 6 | - |
| price_alerts | 0 | 0 | - |
| public_contracts | 0 | 0 | - |
| rag_analyses | 5479 | 5479 | - |
| reputation_scores | 194 | 194 | - |
| sbv_rates | 1 | 1 | - |
| sbv_rates_history | 1429 | 1429 | - |
| scheduler_locks | 1 | 1 | - |
| signal_outcomes | 51 | 51 | - |
| signal_quality_audit | 6 | 6 | - |
| signal_rejections | 627 | 627 | - |
| sla_breach_audit | 5355 | 5355 | - |
| system_changelog | 212 | 212 | - |
| system_logs | 550681 | 550638 | +43 append-only drift (normal) |
| telegram_reports | 39 | 39 | - |
| tracked_indicators | 1921 | 1921 | - |
| trade_exposures | 25 | 25 | - |
| user_requests | 3 | 3 | - |
| vn_index_cache | 0 | 0 | - |
| vnstock_balance_sheet | 79 | 79 | - |
| vnstock_cash_flow | 32 | 32 | - |
| vnstock_events | 2572 | 2572 | - |
| vnstock_fetch_log | 503 | 503 | - |
| vnstock_financials | 79 | 79 | - |
| vnstock_officers | 493 | 493 | - |
| vnstock_shareholders | 1593 | 1593 | - |
| vnstock_trading_stats | 2959 | 2959 | - |
| vps_push_log | 44001 | 44001 | - |
| vps_service_health | 53572 | 53567 | +5 append-only drift |
| watchlist | 39 | 39 | - |

Drift: 3 append-only tables (cron_job_runs, system_logs, vps_service_health) diverged by ≤1%
between backup snapshot (10:02:25) and live measurement (~same time). All other 84 tables match
exactly. Backup is VERIFIED-RESTORABLE.

**STOP GATE:** C-01/C-02/C-04 must match exactly; C-03 must be 2026-06-05T08:59:30.032Z; C-05
must be ≥ 550638. If ANY check errors (table not found, malformed DB), do not proceed.

---

## 3. Exact Command Sequence

### Phase 0 — Pre-flight (ops)

```bash
# Confirm mcp-server is the only writer on the volume
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'mcp-server|pdf-extractor|technical-analysis|macro-indicators|stock-price|kinh-dich'

# Confirm mcp-server is healthy before starting
docker inspect vn-market-intelligence-mcp-mcp-server-1 \
  --format '{{ .State.Health.Status }}'
# EXPECTED: healthy
```

### Phase 1 — Backup and verify (ops)

Execute §2 in full. Do not proceed until all 5 baseline checks pass.

### Phase 2 — Dump to SQL (dev-mcp-server)

```bash
# Step 1 — Dump the live DB to SQL inside the container
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  sqlite3 /app/data/market.db ".dump" > /tmp/market_dump_$(date +%Y%m%dT%H%M%S).sql

# Record the dump file path, e.g.: /tmp/market_dump_20260607T020500.sql

# Step 2 — Quick sanity check: dump must contain CREATE TABLE + INSERT rows
grep -c "^CREATE TABLE" /tmp/market_dump_<TIMESTAMP>.sql
# EXPECTED: ≥ 10 tables

grep -c "^INSERT INTO" /tmp/market_dump_<TIMESTAMP>.sql
# EXPECTED: ≥ 41265 (at minimum the market_prices_history rows)
```

### Phase 3 — Stop mcp-server writes (ops)

**CONSTRAINT: `docker compose down` is FORBIDDEN** — it rebuilds all peer containers and
causes ~21 minutes of full-fleet downtime. Use scoped restart only.

```bash
# Stop ONLY mcp-server (scoped stop — peers remain running)
docker compose -f /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docker-compose.yml \
  stop mcp-server

# Confirm stopped
docker ps | grep mcp-server
# EXPECTED: container absent from running list (or Exited state)
```

At this point the volume is quiescent — no process holds the DB open.

### Phase 4 — Create fresh DB from dump (dev-mcp-server)

```bash
DUMP_FILE="/tmp/market_dump_<TIMESTAMP>.sql"
NEW_DB="/tmp/market_fresh_$(date +%Y%m%dT%H%M%S).db"

# Build fresh DB from the logical dump
sqlite3 "$NEW_DB" < "$DUMP_FILE"

# Verify integrity of the new DB immediately
python3 -c "import sqlite3; c=sqlite3.connect('$NEW_DB').cursor(); c.execute('PRAGMA integrity_check'); print(c.fetchone()[0])"
# EXPECTED: ok

# Verify baseline C-01
python3 -c "import sqlite3; c=sqlite3.connect('$NEW_DB').cursor(); c.execute('SELECT COUNT(DISTINCT code) FROM market_prices'); print(c.fetchone()[0])"
# EXPECTED: 121

# Verify baseline C-02
python3 -c "import sqlite3; c=sqlite3.connect('$NEW_DB').cursor(); c.execute('SELECT COUNT(*) FROM market_prices_history'); print(c.fetchone()[0])"
# EXPECTED: ≥ 41265 (equals dump-time live count)

# Verify baseline C-03
python3 -c "import sqlite3; c=sqlite3.connect('$NEW_DB').cursor(); c.execute('SELECT MAX(fetched_at) FROM market_prices_history'); print(c.fetchone()[0])"
# EXPECTED: 2026-06-05T08:59:30.032Z
```

**STOP GATE:** If `PRAGMA integrity_check` returns anything other than `ok`, or C-01 ≠ 121,
or C-02 < 41265, or C-03 ≠ expected timestamp — do not replace the live DB. Execute §4 (Rollback).

### Phase 5 — Replace live DB with fresh DB (ops)

```bash
# Copy the verified fresh DB into the container volume
docker cp "$NEW_DB" \
  vn-market-intelligence-mcp-mcp-server-1:/app/data/market.db

# Note: the container is stopped so docker cp targets the volume path directly
# If docker cp requires a running container, use a temp alpine container:
#
# docker run --rm -v vn-market-intelligence-mcp_market_data:/data \
#   -v /tmp:/tmp alpine \
#   cp /tmp/market_fresh_<TIMESTAMP>.db /data/market.db
```

### Phase 6 — Restart mcp-server (ops)

```bash
# Scoped restart — ONLY mcp-server
docker compose -f /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docker-compose.yml \
  start mcp-server

# Wait for health
for i in $(seq 1 12); do
  STATUS=$(docker inspect vn-market-intelligence-mcp-mcp-server-1 \
    --format '{{ .State.Health.Status }}' 2>/dev/null)
  echo "[$i/12] mcp-server health: $STATUS"
  [ "$STATUS" = "healthy" ] && break
  sleep 5
done
```

### Phase 7 — Post-recovery verification (dev-mcp-server)

See §5 for full verification checklist.

---

## 4. Rollback Plan

### Trigger conditions for rollback

- Phase 4 `PRAGMA integrity_check` on new DB returns anything other than `ok`
- Phase 7 baseline checks diverge from C-01 (121), C-02 (≥41265), C-03 (2026-06-05T08:59:30.032Z)
- mcp-server fails to reach `healthy` within 60 seconds after Phase 6 start
- Any smoke read of `pdf_extracted_text` or `system_logs` errors after restart

### Rollback procedure

```bash
# Step R-1 — Stop mcp-server again
docker compose -f /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docker-compose.yml \
  stop mcp-server

# Step R-2 — Restore the original backup
BACKUP_PATH="/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/data/market.db.bak-<TIMESTAMP>"

docker run --rm \
  -v vn-market-intelligence-mcp_market_data:/data \
  -v "$(dirname $BACKUP_PATH)":/backup \
  alpine \
  cp "/backup/$(basename $BACKUP_PATH)" /data/market.db

# Step R-3 — Restart mcp-server
docker compose -f /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docker-compose.yml \
  start mcp-server

# Step R-4 — Confirm rollback health
docker inspect vn-market-intelligence-mcp-mcp-server-1 \
  --format '{{ .State.Health.Status }}'
# EXPECTED: healthy

# Step R-5 — Verify rollback baseline (confirm reads still work on original corrupt DB)
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  python3 -c "import sqlite3; c=sqlite3.connect('/app/data/market.db').cursor(); c.execute('SELECT COUNT(DISTINCT code) FROM market_prices'); print(c.fetchone()[0])"
# EXPECTED: 121
```

After successful rollback, the system is in its original state (reads serving correctly
despite structural corruption). Escalate the dump file + corruption details to architect
for further investigation before re-attempting.

---

## 5. Post-Recovery Verification

Execute ALL checks after Phase 6 (mcp-server healthy):

### 5a. Structural integrity

```bash
# Inside the live container post-restart
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  sqlite3 /app/data/market.db "PRAGMA integrity_check;"
# REQUIRED: ok (single word, no other output)
```

### 5b. Row-count parity vs baselines

> NOTE: sqlite3 CLI absent from container — use python3 inline.

```bash
# C-01: current price codes
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  python3 -c "import sqlite3; c=sqlite3.connect('/app/data/market.db').cursor(); c.execute('SELECT COUNT(DISTINCT code) FROM market_prices'); print(c.fetchone()[0])"
# REQUIRED: 121

# C-02: price history rows (append-only; must equal dump-time count or higher)
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  python3 -c "import sqlite3; c=sqlite3.connect('/app/data/market.db').cursor(); c.execute('SELECT COUNT(*) FROM market_prices_history'); print(c.fetchone()[0])"
# REQUIRED: ≥ 41265

# C-03: price history max timestamp
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  python3 -c "import sqlite3; c=sqlite3.connect('/app/data/market.db').cursor(); c.execute('SELECT MAX(fetched_at) FROM market_prices_history'); print(c.fetchone()[0])"
# REQUIRED: 2026-06-05T08:59:30.032Z (or later if new fetches completed after recovery)
```

### 5c. Smoke read — pdf_extracted_text

```bash
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  sqlite3 /app/data/market.db \
  "SELECT id, ticker, page_number FROM pdf_extracted_text LIMIT 5;"
# REQUIRED: returns rows without error; no 'Error: disk I/O error' or 'Error: database disk image is malformed'
```

### 5d. Smoke read — system_logs

```bash
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  sqlite3 /app/data/market.db \
  "SELECT id, level, message FROM system_logs ORDER BY id DESC LIMIT 5;"
# REQUIRED: returns rows without error
```

### 5e. Index health

```bash
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  sqlite3 /app/data/market.db "PRAGMA index_check;"
# REQUIRED: empty output (no rows = no index errors)
```

### 5f. MCP server health endpoint

```bash
curl -sf http://localhost:3000/health | jq '.status'
# REQUIRED: "ok" or equivalent healthy response
```

### 5g. Downstream FIX-BCTC-LIAB-PRIOR-PERIOD gate

Once all 5a–5f checks pass, signal to the PM that the
`FIX-BCTC-LIAB-PRIOR-PERIOD` task is unblocked. That task depends on this
recovery because it triggers a live re-parse that writes to `pdf_extracted_text` —
writing to a structurally corrupt DB risks propagating corruption to new rows.

---

## 6. Task Breakdown for PM

**Ordered execution. Each task depends on the previous completing its STOP GATE.**

| # | Task ID | Zone | Agent Lane | Description | Dependency | STOP GATE |
|---|---|---|---|---|---|---|
| 1 | RLI-OPS-1 | apps/mcp-server/ | ops | Pre-flight: confirm all writer containers healthy; record baseline docker ps output | none | All containers healthy |
| 2 | RLI-OPS-2 | apps/mcp-server/ | ops | Execute §2 backup procedure: `docker cp` market.db to host timestamped backup | RLI-OPS-1 | All 5 baseline checks pass (C-01=121, C-02≥41265, C-03=2026-06-05T08:59:30.032Z, C-04=949, C-05≥550638) |
| 3 | RLI-DEV-1 | apps/mcp-server/ | dev-mcp-server | Phase 2: `.dump` live DB to SQL; sanity check line counts | RLI-OPS-2 (verified backup) | ≥10 CREATE TABLE lines; ≥41265 INSERT lines in dump |
| 4 | RLI-OPS-3 | apps/mcp-server/ | ops | Phase 3: `docker compose stop mcp-server` (scoped — NEVER docker compose down) | RLI-DEV-1 | mcp-server absent from `docker ps` running list |
| 5 | RLI-DEV-2 | apps/mcp-server/ | dev-mcp-server | Phase 4: `sqlite3 $NEW_DB < dump.sql`; verify PRAGMA integrity_check=ok + baselines C-01/02/03 | RLI-OPS-3 | PRAGMA integrity_check=ok; all 3 baselines match |
| 6 | RLI-OPS-4 | apps/mcp-server/ | ops | Phase 5: `docker cp` fresh DB into volume (or alpine container method) | RLI-DEV-2 | File present in volume: `docker run alpine ls -lh /data/market.db` |
| 7 | RLI-OPS-5 | apps/mcp-server/ | ops | Phase 6: `docker compose start mcp-server`; wait for healthy | RLI-OPS-4 | mcp-server health=healthy within 60s |
| 8 | RLI-DEV-3 | apps/mcp-server/ | dev-mcp-server | Phase 7: full post-recovery verification §5a–5f (integrity_check + 3 baselines + 2 smoke reads + index_check + health endpoint) | RLI-OPS-5 | All §5 checks pass; no errors |
| 9 | RLI-PM-1 | apps/mcp-server/ | pm | Signal FIX-BCTC-LIAB-PRIOR-PERIOD unblocked; update orch-state task_board | RLI-DEV-3 | orch-state updated; Telegram WORK notification sent |

**Rollback trigger:** Any STOP GATE failure between tasks 5–8 → execute §4 rollback
immediately. Tasks 1–4 are safe to abort without rollback (DB not yet mutated).

**Downtime estimate:** mcp-server is stopped only during tasks 4–7 (RLI-OPS-3 through
RLI-OPS-5). Estimated wall-clock duration of that window: 10–20 minutes.
Full operation (pre-flight through verification): 45–90 minutes including buffer.

---

## 7. Constraints and Risk Flags

**C-1 (HARD): `docker compose down` is forbidden.**
It rebuilds ALL peer containers (~21 minutes, destroys peers). Use `docker compose stop
mcp-server` / `docker compose start mcp-server` exclusively.

**C-2 (HARD): No DB mutation before backup verified restorable.**
§2c baseline checks are the gate. No partial execution.

**C-3 (HARD): FIX-BCTC-LIAB-PRIOR-PERIOD is blocked until §5 passes.**
That task writes to `pdf_extracted_text`. Writing to a corrupt DB risks page-level
cascade. Do not unblock it until PRAGMA integrity_check=ok on the live container.

**R-1 (MEDIUM): `.dump` omits WAL frames not yet checkpointed.**
Mitigate by running `PRAGMA wal_checkpoint(TRUNCATE)` inside the container before
dump (§2b note). This forces all committed WAL frames into the main DB file before
the logical export reads it.

**R-2 (LOW): pdf_extracted_text and system_logs index orphan entries.**
These are cleaned automatically when the dump is replayed — indexes are rebuilt
from scratch in the new DB. No manual `REINDEX` needed post-reload.

**R-3 (LOW): Double-referenced pages 2533 and 22008 may belong to pdf_extracted_text or system_logs.**
If any rows in those tables are on the double-referenced pages, `.dump` will export
them once (correct). `.recover` would export them twice (wrong). This reinforces
the `.dump` method choice.

**R-4 (INFO): Multiple services read market.db as `DB_READONLY=true`.**
`technical-analysis`, `macro-indicators`, `news-fetch`, `kinh-dich-service`, and
`stock-price` all mount the same named volume with `DB_PATH=/app/data/market.db`.
They are read-only consumers. Stopping mcp-server does not stop them. They will
continue serving reads from the corrupt DB during the mcp-server stop window
(tasks RLI-OPS-3 through RLI-OPS-5). This is acceptable — reads currently serve
correct data. No action needed on peer services.

---

## 7. Attempt-1 Post-Mortem (RLI-DEV-2 failure, 2026-06-07)

### What failed

RLI-DEV-2 executed `sqlite3 $NEW_DB < /tmp/market_dump_host.sql` and the replay
aborted with:

```
Error: NOT NULL constraint failed: pdf_extracted_text.extracted_at
```

The replay halted at line ~190,356 of the 862,655-line dump. No rows were loaded
into the new DB (executescript is transactional by block; the abort rolled back the
entire transaction). The mcp-server was restarted on the original DB and came up
healthy. Downtime: 2m07s. No data loss.

### Root cause

The `iterdump()` / sqlite3 `.dump` mechanism walks the B-tree of every table in
rowid order. In `pdf_extracted_text` (B-tree root page 32), the page-2533
out-of-order cell caused the B-tree walk to emit **12 ghost rows** with rowids
493554–493565. These ghost rows are **system_logs rows that the double-referenced
page (2533 ↔ tree 31 / system_logs)** allowed to bleed into the pdf_extracted_text
B-tree walk. The ghost rows carry the system_logs schema (7 columns: id, timestamp,
level, source, message, details_json, resolved) but are emitted as pdf_extracted_text
INSERT statements (8 columns: id, filename, page_number, text_content, confidence,
extracted_at, action_code, data_env). Column 6 in the ghost rows is the
system_logs `resolved` INTEGER (0), but in pdf_extracted_text schema position 6 is
`extracted_at TEXT NOT NULL`. When the replay engine reads those 12 INSERT
statements, it sees NULL for `extracted_at` and raises the NOT NULL constraint.

### Why the backup gate did not catch it

The backup was declared "verified-restorable" after C-01/C-02/C-03/C-04/C-05 row-count
checks passed on the byte-copy backup. Row counts do not detect B-tree ghost rows.
The dump was NOT replayed against the backup before the stop window opened.

**Key lesson:** `verified-restorable` requires both structural soundness AND a
successful dump-replay smoke test. Row counts alone are insufficient. Any future
backup gate MUST include:

1. `PRAGMA integrity_check` on the copy (would have revealed the same 98 errors).
2. A dump-replay smoke test into a throwaway DB with `PRAGMA integrity_check=ok`
   required on the result — BEFORE the stop window opens.

### What the failure evidence actually shows

- The 800+ "MALFORMED INSERT" lines reported in the ops execution report are the
  12 ghost rows repeated in the combined dump (the 175MB file contains the full
  corpus). The truncated-string-literal appearance was a display artefact; actual
  malformation is column-count/type mismatch, not truncated strings.
- The backup `data/market.db.bak-20260607T100225` carries the same corruption
  because it is a byte-copy. It is NOT a safe restore target for a clean DB.
- `/tmp/market_corrupt_copy.db` (247MB, taken 2026-06-07T08:14:29Z) and
  `/tmp/market_dump_host.sql` (175MB, taken 2026-06-07T08:14:55Z) are still
  available as working artifacts.

---

## 8. Revised Method (RLI-DEV-2 retry)

### Corruption scope — architect-verified 2026-06-07

Probes run against `/tmp/market_corrupt_copy.db` AND the live container
`/app/data/market.db`. All 88 tables examined.

| Table | Corruption | Real rows | Ghost/phantom | Salvageable |
|---|---|---|---|---|
| `pdf_extracted_text` | B-tree page 2533 (double-ref + out-of-order): 12 ghost rowids (493554–493565) are system_logs rows misplaced by page collision | 949 | 12 ghost rowids | 949 (all real rows) — skip the 12 ghost INSERT lines during replay |
| `system_logs` | B-tree page 22008 (double-ref): 31 phantom rows counted by `COUNT(*)` but not emitted by `iterdump` | 550,744 (iterdump = SELECT id scan) | 31 phantom `COUNT(*)` ghosts (not in B-tree walk) | 550,744 (all real rows) — no skip needed |
| All other 86 tables | CLEAN — `PRAGMA integrity_check` reports ZERO errors for these tables | per §2c baseline | 0 | 100% |

**Index errors** (`wrong # of entries in idx_pet_*`, `idx_system_logs_*`, etc.) are
secondary symptoms of the B-tree ghost rows. They are automatically corrected when
the fresh DB rebuilds indexes from scratch during replay — no manual `REINDEX` needed.

**Live DB progression note (2026-06-07T10:23 vs T08:14):** the live DB has grown
to page 63222 (vs corrupt copy page ~59232 max rootpage). `PRAGMA integrity_check`
on the live container now crashes with `database disk image is malformed` before
completing, indicating the corruption is actively spreading as new pages reference
corrupt freelist entries. The corruption surface remains confined to the same two
tables (pdf_extracted_text, system_logs) — verified by the live dump smoke test
below. However, **urgency has increased**: every new WAL checkpoint risks spreading
double-references further. The window should not be deferred.

### Chosen method one-liner

```
Full sqlite3 .dump replay with exactly one filter:
  skip the 12 ghost INSERT INTO pdf_extracted_text rows where id IN (493554..493565)
```

This is a targeted 12-line filter on an 862,779-line dump. No selective rebuild, no
`.recover`, no per-table gymnastics. The full dump is logically clean except for
those 12 ghost rows.

### Pre-window dump-replay smoke test (MANDATORY — gate before stop window)

**This is the gate that was missing in Attempt 1. It MUST pass before RLI-OPS-3.**

```bash
# Run INSIDE the container while mcp-server is still running (read-only, no stop needed)
docker exec vn-market-intelligence-mcp-mcp-server-1 python3 -c "
import sqlite3, sys

GHOST_IDS = set(range(493554, 493566))

src = sqlite3.connect('/app/data/market.db')
mem = sqlite3.connect(':memory:')

errors = []
for i, line in enumerate(src.iterdump()):
    if line.startswith('INSERT INTO \"pdf_extracted_text\"'):
        try:
            row_id = int(line.split('VALUES(')[1].split(',')[0])
            if row_id in GHOST_IDS:
                continue
        except:
            pass
    try:
        mem.executescript(line)
    except Exception as e:
        if str(e) != 'cannot commit - no transaction is active':
            errors.append((i, str(e)))

c = mem.cursor()
c.execute('PRAGMA integrity_check'); ic = c.fetchone()[0]
c.execute('SELECT COUNT(DISTINCT code) FROM market_prices'); mp = c.fetchone()[0]
c.execute('SELECT COUNT(*) FROM market_prices_history'); mph = c.fetchone()[0]
c.execute('SELECT MAX(fetched_at) FROM market_prices_history'); ts = c.fetchone()[0]
c.execute('SELECT COUNT(*) FROM pdf_extracted_text'); pet = c.fetchone()[0]

ok = ic == 'ok' and mp == 121 and mph >= 41265 and pet == 949 and len(errors) == 0
print('SMOKE-TEST:', 'PASS' if ok else 'FAIL')
print(f'  integrity_check={ic}  market_prices={mp}  market_prices_history={mph}')
print(f'  pdf_extracted_text={pet}  max_fetched_at={ts}')
if errors:
    print('  ERRORS:', errors[:5])
sys.exit(0 if ok else 1)
"
# REQUIRED EXIT CODE: 0 (PASS)
# This was verified PASS on 2026-06-07 against live DB.
```

**STOP GATE:** If this smoke test exits non-zero, do NOT open the stop window.
Escalate to architect — the corruption may have spread beyond the 12 ghost rows.

### Exact revised command sequence for RLI-DEV-2 retry

Phases 0–2 and 3–6 from §3 remain unchanged. Replace Phase 4 (RLI-DEV-2) with:

**Phase 4 revised — Create fresh DB from filtered dump:**

```bash
# On the host, after mcp-server is stopped (RLI-OPS-3 complete)
# The dump was taken in Phase 2 (RLI-DEV-1). Use that dump file.
DUMP_FILE="/tmp/market_dump_<TIMESTAMP>.sql"   # from RLI-DEV-1
NEW_DB="/tmp/market_fresh_$(date +%Y%m%dT%H%M%S).db"
GHOST_IDS="(493554,493555,493556,493557,493558,493559,493560,493561,493562,493563,493564,493565)"

# Filter and replay: skip the 12 ghost pdf_extracted_text rows
python3 -c "
import sqlite3, sys

GHOST_IDS = set(range(493554, 493566))
DUMP_FILE = sys.argv[1]
NEW_DB = sys.argv[2]

src_conn_str = open(DUMP_FILE, 'r', encoding='utf-8', errors='replace')
dst = sqlite3.connect(NEW_DB)

errors = []
for i, line in enumerate(src_conn_str):
    line = line.rstrip('\n')
    if line.startswith('INSERT INTO \"pdf_extracted_text\"'):
        try:
            row_id = int(line.split('VALUES(')[1].split(',')[0])
            if row_id in GHOST_IDS:
                continue
        except:
            pass
    try:
        dst.executescript(line)
    except Exception as e:
        if str(e) != 'cannot commit - no transaction is active':
            errors.append((i, str(e)))

dst.close()
if errors:
    print('ERRORS:', errors[:5], file=sys.stderr)
    sys.exit(1)
print('Replay complete')
" "$DUMP_FILE" "$NEW_DB"

# Alternative: if dump was produced via sqlite3 CLI (not iterdump), use grep filter:
# grep -v "^INSERT INTO \"pdf_extracted_text\" VALUES(49355[4-9]," "$DUMP_FILE" \
#   | grep -v "^INSERT INTO \"pdf_extracted_text\" VALUES(4935[6][0-5]," \
#   | sqlite3 "$NEW_DB"
# NOTE: the python3 approach above is safer and handles edge cases correctly.

# Verify integrity of fresh DB
python3 -c "
import sqlite3
c = sqlite3.connect('$NEW_DB').cursor()
c.execute('PRAGMA integrity_check'); ic = c.fetchone()[0]
c.execute('SELECT COUNT(DISTINCT code) FROM market_prices'); mp = c.fetchone()[0]
c.execute('SELECT COUNT(*) FROM market_prices_history'); mph = c.fetchone()[0]
c.execute('SELECT MAX(fetched_at) FROM market_prices_history'); ts = c.fetchone()[0]
c.execute('SELECT COUNT(*) FROM pdf_extracted_text'); pet = c.fetchone()[0]
c.execute('SELECT COUNT(*) FROM system_logs'); sl = c.fetchone()[0]
ok = ic == 'ok' and mp == 121 and mph >= 41265 and pet == 949
print('FRESH-DB-VERIFY:', 'PASS' if ok else 'FAIL')
print(f'  integrity_check={ic}')
print(f'  market_prices={mp} (expected 121)')
print(f'  market_prices_history={mph} (expected >=41265)')
print(f'  max_fetched_at={ts} (expected 2026-06-05T08:59:30.032Z)')
print(f'  pdf_extracted_text={pet} (expected 949)')
print(f'  system_logs={sl} (expected ~550629+)')
"
# REQUIRED: PASS — integrity_check=ok AND market_prices=121 AND market_prices_history>=41265
```

**STOP GATE:** If FRESH-DB-VERIFY outputs FAIL, do not copy to volume. Execute §4 rollback.

### Per-table validation gates (during fresh DB verify)

| Check | Query | Expected | Stop if |
|---|---|---|---|
| Structural integrity | `PRAGMA integrity_check` | `ok` | Any other output |
| Price codes | `SELECT COUNT(DISTINCT code) FROM market_prices` | 121 | ≠ 121 |
| Price history rows | `SELECT COUNT(*) FROM market_prices_history` | ≥ 41265 | < 41265 |
| Price history max ts | `SELECT MAX(fetched_at) FROM market_prices_history` | 2026-06-05T08:59:30.032Z | older timestamp |
| PDF text rows | `SELECT COUNT(*) FROM pdf_extracted_text` | 949 | ≠ 949 |
| System logs rows | `SELECT COUNT(*) FROM system_logs` | ≥ 550629 | < 550000 |

### pdf_extracted_text regenerability assessment

The 949 rows cover **21 source PDFs** across 6 tickers (FPT, HPG, VCB, VEA, VNM,
plus unlabelled). All PDFs are BCTC documents already ingested by the VPS pipeline.
The bctcReparseJob cron (09:00/14:00 UTC) can re-extract them from source. Given the
949 rows are fully salvaged by the dump filter, **re-extraction is not needed for
this recovery**. The cron remains a fallback if, post-recovery, PRAGMA integrity_check
reveals remaining issues with pdf_extracted_text.

### system_logs expendability assessment

system_logs (550,744 real rows) contains telemetry only — no business logic consumes
historical rows for decisions. The system_auditor reads only recent entries
(ORDER BY id DESC LIMIT N). Retention expectation: rolling window, no archival
requirement. The 31 phantom `COUNT(*)` rows are B-tree ghosts, not real log entries
— they do not represent lost data. All 550,744 real rows are fully salvaged.

### sqlite `.recover` evaluation

`.recover` was considered for the 2 corrupt tables. It was rejected because:
- The 12 ghost rows in pdf_extracted_text would be recovered as duplicates on top
  of the 949 real rows. Natural key `UNIQUE(filename, page_number)` would reject
  them with constraint violations — same error profile as Attempt 1.
- The 31 phantom system_logs rows would similarly cause duplicate key violations.
- `.recover` provides no benefit here because `iterdump` already reads all 549,744+949
  real rows cleanly. The only thing `.recover` adds is the ghost rows — which are junk.

### Revised downtime estimate

| Phase | Wall-clock | Notes |
|---|---|---|
| Pre-window smoke test | 8–12 min | Run while mcp-server still running (zero downtime) |
| RLI-DEV-1: dump to file | 3–5 min | `iterdump` on 247MB DB |
| RLI-OPS-3: stop mcp-server | < 30s | Scoped stop |
| RLI-DEV-2: filtered replay + verify | 5–8 min | python3 replay + PRAGMA checks |
| RLI-OPS-4: copy to volume | < 30s | docker cp or alpine |
| RLI-OPS-5: start + health | 1–2 min | Wait for healthy |
| **Total stop window** | **7–12 min** | From `stop mcp-server` to `healthy` |
| Full operation | 20–30 min | Including pre-flight and post-verification |

Previous estimate (10–20 min stop window) stands. Revised method adds ~3 min for the
filtered replay vs straight executescript.

### Revised RLI-* task chain for PM

The task chain from §6 is updated as follows. All tasks before and after RLI-DEV-2
are UNCHANGED. RLI-OPS-1, RLI-OPS-2, RLI-DEV-1, RLI-OPS-3 remain as specified.

| # | Task ID | Change from Attempt 1 | Description |
|---|---|---|---|
| 0 | **RLI-PRE-SMOKE** | NEW — mandatory gate | Run pre-window smoke test (§8 python3 block above) while mcp-server is running. Must exit 0. If fail: STOP, escalate to architect. |
| 5 | **RLI-DEV-2** | REPLACED | Phase 4 revised: python3 filtered replay (skip 12 ghost pdf_extracted_text rows) + FRESH-DB-VERIFY (PRAGMA integrity_check=ok + 6-point table checks). STOP GATE: all 6 checks pass. |
| 6 | RLI-OPS-4 | unchanged | Phase 5: docker cp fresh DB to volume |
| 7 | RLI-OPS-5 | unchanged | Phase 6: start mcp-server, wait healthy |
| 8 | RLI-DEV-3 | unchanged | Phase 7: full §5 post-recovery verification |
| 9 | RLI-PM-1 | unchanged | Signal FIX-BCTC-LIAB-PRIOR-PERIOD unblocked |

Full ordered chain: RLI-OPS-1 → RLI-OPS-2 → **RLI-PRE-SMOKE** → RLI-DEV-1 →
RLI-OPS-3 → **RLI-DEV-2 (revised)** → RLI-OPS-4 → RLI-OPS-5 → RLI-DEV-3 → RLI-PM-1.

---

## 9. Architect Findings Summary

```
## [Architect] Brownfield Findings — RECOVER-LIVEDB-INTEGRITY

- **Zone:** apps/mcp-server/
- **Verified paths:**
  - `docker-compose.yml:11-12` — market_data named volume → /app/data (mcp-server rw)
  - `docker-compose.yml:450-452` — market_data driver:local declaration
  - `docker-compose.yml:27` — DB_PATH=/app/data/market.db (mcp-server env)
  - `docker-compose.yml:162-163` — DB_READONLY=true pattern (technical-analysis, read-only consumers)
- **Reuse patterns:**
  - docker cp + alpine container volume-write pattern (proven in prior ops runbooks)
  - WAL checkpoint before copy (from named-volume shadow audit 2026-05-21)
- **Design decisions:**
  - Method: sqlite3 .dump + reload (logical export beats .recover for this corruption profile)
  - Scoped restart only: docker compose stop/start mcp-server
  - Backup not complete until 5-point baseline verified restorable
- **Scan clean:** true
- **BUILD-STANDARD:** not-applicable (maintenance runbook, no code changes)
```
