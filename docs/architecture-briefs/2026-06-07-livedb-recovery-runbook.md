# RUNBOOK: RECOVER-LIVEDB-INTEGRITY

**Date:** 2026-06-07
**Sprint:** RECOVER-LIVEDB-INTEGRITY
**Author:** architect
**Status:** PLAN ONLY — no DB mutation permitted until ops confirms backup verified-restorable
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

**Baselines for parity verification (C-01, C-02):**

| Baseline | Value |
|---|---|
| C-01 Ticker count | 1599 distinct ticker codes |
| C-02 Total price rows | 3190 rows |
| Max data date | 2026-06-05 |

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

```bash
# Verify the backup file is readable and row counts match baselines
BACKUP_PATH="/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/data/market.db.bak-<TIMESTAMP>"

# C-01: ticker count
sqlite3 "$BACKUP_PATH" "SELECT COUNT(DISTINCT code) FROM stock_prices;" 
# EXPECTED: 1599

# C-02: row count
sqlite3 "$BACKUP_PATH" "SELECT COUNT(*) FROM stock_prices;"
# EXPECTED: 3190

# C-03: max data date
sqlite3 "$BACKUP_PATH" "SELECT MAX(date) FROM stock_prices;"
# EXPECTED: 2026-06-05

# C-04: smoke read pdf_extracted_text
sqlite3 "$BACKUP_PATH" "SELECT COUNT(*) FROM pdf_extracted_text LIMIT 1;"
# EXPECTED: integer ≥ 0 (no error)

# C-05: smoke read system_logs
sqlite3 "$BACKUP_PATH" "SELECT COUNT(*) FROM system_logs LIMIT 1;"
# EXPECTED: integer ≥ 0 (no error)
```

**STOP GATE:** If ANY of C-01 through C-05 fails, do not proceed. Escalate to architect.
The backup is only declared valid when all 5 checks pass without error.

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
# EXPECTED: ≥ 3190 (at minimum the stock_prices rows)
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
sqlite3 "$NEW_DB" "PRAGMA integrity_check;"
# EXPECTED: ok

# Verify baseline C-01
sqlite3 "$NEW_DB" "SELECT COUNT(DISTINCT code) FROM stock_prices;"
# EXPECTED: 1599

# Verify baseline C-02
sqlite3 "$NEW_DB" "SELECT COUNT(*) FROM stock_prices;"
# EXPECTED: 3190

# Verify baseline C-03
sqlite3 "$NEW_DB" "SELECT MAX(date) FROM stock_prices;"
# EXPECTED: 2026-06-05
```

**STOP GATE:** If `PRAGMA integrity_check` returns anything other than `ok`, or any
baseline diverges, do not replace the live DB. Execute §4 (Rollback).

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
- Phase 7 baseline checks diverge from C-01/C-02/C-03
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
  sqlite3 /app/data/market.db "SELECT COUNT(DISTINCT code) FROM stock_prices;"
# EXPECTED: 1599
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

```bash
# C-01: ticker count
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  sqlite3 /app/data/market.db "SELECT COUNT(DISTINCT code) FROM stock_prices;"
# REQUIRED: 1599

# C-02: total price rows
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  sqlite3 /app/data/market.db "SELECT COUNT(*) FROM stock_prices;"
# REQUIRED: 3190

# C-03: max data date
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  sqlite3 /app/data/market.db "SELECT MAX(date) FROM stock_prices;"
# REQUIRED: 2026-06-05
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
| 2 | RLI-OPS-2 | apps/mcp-server/ | ops | Execute §2 backup procedure: `docker cp` market.db to host timestamped backup | RLI-OPS-1 | All 5 baseline checks pass (C-01=1599, C-02=3190, C-03=2026-06-05, C-04 no error, C-05 no error) |
| 3 | RLI-DEV-1 | apps/mcp-server/ | dev-mcp-server | Phase 2: `.dump` live DB to SQL; sanity check line counts | RLI-OPS-2 (verified backup) | ≥10 CREATE TABLE lines; ≥3190 INSERT lines in dump |
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

## 8. Architect Findings Summary

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
