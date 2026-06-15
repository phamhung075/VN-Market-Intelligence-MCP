#!/usr/bin/env bash
# ops-bctc-enrich-reverify-pulljob.sh
# Re-drive specific bctc_vps_queue rows through the FIXED runBctcPdfPullJob path
# to verify FIX-BCTC-ENRICH-SILENT-0ROWS (Layout-6/7 B02-TCTD parse + 0-row enrich gate).
#
# WHY this exists: the board-row done_verified gate names runBctcReparseJob, but that
# job is a TEXT-stranded-PDF recovery path (Tier 1b/2 pdf-parse) and does NOT exercise
# the B02-TCTD table-extraction fix. The ACTUAL fixed path is runBctcPdfPullJob
# (apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts) — it pulls
# status='pending' queue rows, fetches the PDF (X-API-Key auth to VPS), triggers the
# pdf-extractor microservice (Layout-6/7), then reads ACTUAL bctc_table_rows +
# bctc_md_tables counts and marks 'enrich_failed' (NOT 'done') when both are 0.
#
# It resets the named queue ids to 'pending', runs ONE pull-job pass, and prints the
# post-run queue status + table-row counts. The 112-row VCB 2025Q4 non-regression
# anchor (id 221) is NEVER reset — left 'done' on purpose.
#
# Flow-doc pointer: docs/agents/ops/flow/bctc.md (manual enrich re-verify) and
# docs/policies/dev-standards.md § Script Persistence.
#
# Usage:
#   scripts/ops-bctc-enrich-reverify-pulljob.sh "292117 224 292097"
# Args: space-separated bctc_vps_queue ids to reset->pending and re-drive.
set -euo pipefail

MCP_CONTAINER="vn-market-intelligence-mcp-mcp-server-1"
VOL="vn-market-intelligence-mcp_market_data"
IDS="${1:?usage: $0 \"<id> <id> ...\"}"

sqlite_rw() { docker exec "$MCP_CONTAINER" sh -c "command -v sqlite3 >/dev/null 2>&1"; }

# Build the id IN-list safely (integers only)
INLIST="$(echo "$IDS" | tr ' ' ',' )"
echo "$INLIST" | grep -Eq '^[0-9]+(,[0-9]+)*$' || { echo "ERR: ids must be integers"; exit 2; }

echo "=== BEFORE: queue rows to re-drive ==="
docker run --rm -v "${VOL}:/data" keinos/sqlite3 sqlite3 -header -column /data/market.db \
  "SELECT id, action_code, period_year, period_quarter, status FROM bctc_vps_queue WHERE id IN (${INLIST});"

# RESET + RUN happen IN-CONTAINER via the mcp-server's own DB handle.
# The live DB runs in WAL mode held open by mcp-server; a sidecar writer hits
# "attempt to write a readonly database". Use the same Bun process that owns the
# connection (getDb singleton) for the UPDATE, then run the pull job in one pass.
echo "=== RESET selected rows -> pending (anchor id 221 VCB2025Q4 NEVER touched) + RUN pull job ==="
docker exec "$MCP_CONTAINER" bun -e "
const { getDb } = await import('./src/infrastructure/db/schema.ts');
const db = getDb();
const ids = '${INLIST}'.split(',').map(Number).filter(n => n !== 221);
const reset = db.prepare('UPDATE bctc_vps_queue SET status=\\'pending\\' WHERE id = ?');
for (const id of ids) reset.run(id);
console.log('RESET_TO_PENDING='+JSON.stringify(ids));
const { runBctcPdfPullJob } = await import('./src/scheduler/financial-reports/bctcPdfPullJob.ts');
const r = await runBctcPdfPullJob({ batchSize: 20 });
console.log('PULLJOB_RESULT='+JSON.stringify(r));
"

echo "=== AFTER: queue status + actual table-row counts ==="
docker run --rm -v "${VOL}:/data" keinos/sqlite3 sqlite3 -header -column /data/market.db "
SELECT q.id, q.action_code AS tk, q.period_year AS yr, q.period_quarter AS qq, q.status,
  (SELECT COUNT(*) FROM bctc_table_rows tr JOIN financial_reports fr
     ON fr.id=tr.report_id WHERE fr.action_code=q.action_code
        AND fr.period_year=q.period_year AND fr.period_type=q.period_quarter) AS tbl_rows
FROM bctc_vps_queue q WHERE q.id IN (${INLIST}) ORDER BY q.action_code, q.period_year DESC;"
