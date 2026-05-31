# Dev Environment SOP

**Sprint:** ENV-ISOLATION · **Task:** EI-P1-3 · **Author:** developer
**Date:** 2026-05-31

> **16 GB Mac / Docker 8 GB cap — prod and dev NEVER run simultaneously.**
> Dev replaces prod for the session duration, then prod is restored.

---

## 1. Before you start

- Check VN market hours. Dev sessions must be during off-market hours (UTC 09:00–01:00 next day)
  so production VPS push data gaps are harmless. BCTC refine testing needs no live prices.
- Back up production DB **before any session** (see §7 — RISK-5 warning).

---

## 2. Start the dev stack

```bash
# Step 1 — stop production
docker compose down

# Step 2 — bring up dev override (same image, .dev datastores, port 3099)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Step 3 — verify dev env is active
docker compose exec mcp-server env | grep APP_ENV
# expected: APP_ENV=dev

docker compose exec mcp-server env | grep DB_PATH
# expected: DB_PATH=/app/data/market.dev.db

# Step 4 — verify mcp-server startup log
docker compose logs mcp-server | grep '\[startup\]'
# expected: [startup] APP_ENV=dev DB_PATH=/app/data/market.dev.db LANCEDB_PATH=/app/data/lancedb.dev
```

Dev mcp-server listens on host port **3099** (container port 3000 unchanged).
The VPS systemd services target host port 3000 — they are invisible to the dev instance.
The `claude.ai` gateway also targets port 3000 — cowork agents cannot reach the dev mcp-server
(intentional: dev sessions are maintenance windows, not live analysis cycles).

---

## 3. Seed the dev database

The dev DB (`market.dev.db`) starts empty. BCTC refine testing requires `financial_reports`
and `pdf_extracted_text` rows. Seed them from production:

```bash
# Option A — full table dump (simplest, copies all reports + all OCR text)
# Run from the host with both DB files accessible inside the named volume.
docker compose exec mcp-server sh -c "
  sqlite3 /app/data/market.db '.dump financial_reports' | sqlite3 /app/data/market.dev.db
  sqlite3 /app/data/market.db '.dump pdf_extracted_text' | sqlite3 /app/data/market.dev.db
"

# Option B — single report (targeted, when only one report needs testing)
# Replace <REPORT_UUID> with the target report_id (e.g. e8ea3df5…)
docker compose exec mcp-server sh -c "
  sqlite3 /app/data/market.db \
    'SELECT * FROM financial_reports WHERE report_id=\"<REPORT_UUID>\"' | \
    sqlite3 /app/data/market.dev.db
  sqlite3 /app/data/market.db \
    'SELECT * FROM pdf_extracted_text WHERE report_id=\"<REPORT_UUID>\"' | \
    sqlite3 /app/data/market.dev.db
"
```

For realistic refine tests, also ensure `bctc_vps_queue` has the target report's queue entry.
Seed the same way if needed.

---

## 4. Promote verified BCTC data to production (manual, FK-ordered)

**OD-D ruling:** promotion is a rare, deliberate operator action — a documented manual SOP
is sufficient before a promotion script is proven necessary.

**When to promote:** a dev refine produced real, non-fabricated values (passed DT-1/DT-2/DT-3
gates, `get_bctc_full` at port 3099 shows honest financial numbers) and the operator decides
those values are worth persisting in production.

**Non-BCTC tables** (`news_analysis`, `macro_evidence`, `agent_signals`) produced in a dev
session are throwaway — dev inputs are synthetic (empty price DB, no live news) and have no
value in production. Do not promote them.

### 4.1 Mandatory FK parent-before-child order

`bctc_table_rows` has a FK reference to `financial_reports.report_id`.
`bctc_refined_units` also references `financial_reports.report_id`.
**You must insert the parent row in production BEFORE inserting child rows.**

### 4.2 Promotion steps

```bash
# --- All commands run inside the mcp-server container ---
docker compose exec mcp-server sh

# Inside the container:
REPORT_ID="<the report_id you want to promote>"

# Step 1 — Verify the parent row exists in prod
sqlite3 /app/data/market.db \
  "SELECT report_id, ticker, period_year, refine_status FROM financial_reports \
   WHERE report_id='$REPORT_ID';"

# If the parent row is MISSING from prod, insert it first:
sqlite3 /app/data/market.dev.db \
  "SELECT * FROM financial_reports WHERE report_id='$REPORT_ID';" > /tmp/fr_row.sql
# Inspect /tmp/fr_row.sql, craft an INSERT, run it against /app/data/market.db.
# Do this in a BEGIN/COMMIT transaction.

# Step 2 — Promote bctc_refined_units (within a transaction)
sqlite3 /app/data/market.dev.db \
  "SELECT * FROM bctc_refined_units WHERE report_id='$REPORT_ID';" | \
  sqlite3 /app/data/market.db

# Step 3 — Promote bctc_table_rows (within a transaction, AFTER refined_units)
sqlite3 /app/data/market.dev.db \
  "SELECT * FROM bctc_table_rows WHERE report_id='$REPORT_ID';" | \
  sqlite3 /app/data/market.db

# Step 4 — Verify in production
sqlite3 /app/data/market.db \
  "SELECT COUNT(*) FROM bctc_table_rows WHERE report_id='$REPORT_ID';"
```

Use `BEGIN; ... COMMIT;` wrappers for each INSERT batch. If a FK violation occurs,
the transaction rolls back — diagnose and fix the parent row before retrying.

### 4.3 After promotion

Update `financial_reports.refine_status` to `DONE` in production if the promoted data
is complete (all pages refined, no `REJECTED_SANITY` units):

```bash
sqlite3 /app/data/market.db \
  "UPDATE financial_reports SET refine_status='DONE' WHERE report_id='$REPORT_ID';"
```

Then verify via the gateway:
```
call_tool(server="vn-market", tool="get_bctc_full", arguments={"ticker":"<TICKER>"})
```

---

## 5. LanceDB dev directory

The dev rag-service writes to `/app/data/lancedb.dev` (a sibling directory inside the
`market_data` volume). Production LanceDB at `/app/data/lancedb` is never touched.

`lancedb.dev` starts empty in a fresh dev session. If the dev intelligence cycle needs
RAG context, copy the production directory:

```bash
docker compose exec rag-service sh -c \
  "cp -r /app/data/lancedb /app/data/lancedb.dev"
```

This is optional for BCTC refine testing (which does not require RAG lookup).

---

## 6. Restore production

```bash
# Step 1 — stop dev stack
docker compose -f docker-compose.yml -f docker-compose.dev.yml down

# Step 2 — bring production back up
docker compose up -d

# Step 3 — verify production is healthy
docker compose exec mcp-server env | grep APP_ENV
# expected: APP_ENV=production

docker compose ps
# all services: Up (healthy)

# Step 4 — smoke-check via gateway (from a Claude session)
# call_tool(server="vn-market", tool="get_market_snapshot", arguments={})
```

---

## 7. RISK-5 — Volume deletion backup WARNING

> **CRITICAL:** `docker volume rm market_data` deletes BOTH `market.db` (production)
> AND `market.dev.db` (dev) in a single irreversible operation.
>
> **Always backup `market.db` before any volume-level operation:**
>
> ```bash
> docker compose exec mcp-server sh -c \
>   "cp /app/data/market.db /app/data/market.db.bak-$(date +%Y%m%d%H%M%S)"
> ```
>
> Verify the backup exists before proceeding with any `docker volume` command.

---

## 8. Maintenance script guards

The host-side scripts `scripts/run-bt7-backfill.ts` and `scripts/purge-phantom-reports.ts`
have ENV-ISOLATION guards (EI-P1-2). Both print `APP_ENV` and resolved `DB_PATH` before
any write. They refuse to run against a non-production datastore unless `--force-dev` is
passed explicitly.

```bash
# Normal production run (no flag needed when APP_ENV=production or unset):
bun scripts/purge-phantom-reports.ts
# prints: [purge] APP_ENV=production  [purge] DB_PATH (resolved)=.../market.db

# Dev run (must be deliberate):
APP_ENV=dev bun scripts/purge-phantom-reports.ts --force-dev

# Example refusal output (no --force-dev):
# [purge] APP_ENV=dev
# [purge] DB_PATH (resolved)=.../market.db
# [purge] REFUSED: APP_ENV="dev" is not "production". Pass --force-dev to override.
```

---

## 9. Dev session checklist

- [ ] Market hours: VN market is closed (UTC 09:00 – 01:00 next day)
- [ ] Backup `market.db` before session (§7)
- [ ] `docker compose down` (prod stopped)
- [ ] `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`
- [ ] Verify `APP_ENV=dev` and `DB_PATH=...market.dev.db` in startup log
- [ ] Seed dev DB with needed `financial_reports` + `pdf_extracted_text` rows (§3)
- [ ] Run tests / refine pipeline at port 3099
- [ ] If promoting: follow FK parent-before-child order (§4.2)
- [ ] `docker compose -f docker-compose.yml -f docker-compose.dev.yml down`
- [ ] `docker compose up -d` (restore production)
- [ ] Verify `APP_ENV=production` + all services healthy
