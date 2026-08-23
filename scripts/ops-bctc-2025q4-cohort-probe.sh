#!/usr/bin/env bash
# ops-bctc-2025q4-cohort-probe.sh — RAW ground-truth probe for the 2025-Q4 enrich_failed cohort.
#
# WHY THIS EXISTS (do not replace with a status-echo read):
#   OPS-BCTC-BANK-2025Q4-ENRICH-0ROW-REPARSE was mis-verified twice by trusting job/status
#   echoes (and once by falsified cron_job_runs rows, BUG 3550). bctc_table_rows /
#   bctc_layout_units / bctc_md_tables are extraction GROUND TRUTH and are independent of
#   every cadence/status field, so this probe reads only those + the queue lifecycle row.
#
# Runs INSIDE the mcp-server container against the live named volume (/app/data/market.db) —
# a host-CLI read of apps/mcp-server/data/db.sqlite is NOT the live DB and has returned a
# false OK before (feedback_live_db_is_named_volume_not_host_data).
#
# Usage: bash scripts/ops-bctc-2025q4-cohort-probe.sh
# Owning flow doc: docs/agents/ops/flow/main.md (§ DB Health)

set -euo pipefail
CONTAINER="${MCP_CONTAINER:-vn-market-intelligence-mcp-mcp-server-1}"

docker exec "$CONTAINER" bun -e '
process.on("uncaughtException", e => { console.error("PROBE FAILED (fail-loud):", e.message); process.exit(1); });
const { Database } = require("bun:sqlite");
const db = new Database("/app/data/market.db", { readonly: true });
const T = ["ACB","BID","D2D","EIB","GAS","GVR","HCM","HSG","MBB","NKG","POW","SSI"];

console.log("ticker | queue_status      | att | last_attempt        | report_id                            | pdf | layout | rows | md");
console.log("-------|-------------------|-----|---------------------|--------------------------------------|-----|--------|------|---");
for (const t of T) {
  const q = db.query("SELECT status, attempts, last_attempt FROM bctc_vps_queue WHERE action_code=? AND period_year=2025 AND period_quarter=?").get(t, "Q4");
  // NOTE: financial_reports.period_quarter is INTEGER 4 (one legacy "Q1" string exists),
  // while bctc_vps_queue.period_quarter is the STRING "Q4". Matching on "Q4" against
  // financial_reports silently returns NO ROW — a false negative that cost one probe cycle
  // on 2026-08-23. Match both representations. NOTE: this whole bun program is a
  // single-quoted shell string -- never inline a SQL string literal here, bind it.
  const fr = db.query("SELECT id, pdf_path FROM financial_reports WHERE action_code=? AND period_year=2025 AND (period_quarter=4 OR period_quarter=?) ORDER BY (id LIKE ?) ASC LIMIT 1").get(t, "Q4", "fallback-%");
  let lay="-", rows="-", md="-";
  if (fr) {
    lay = db.query("SELECT COUNT(*) c FROM bctc_layout_units WHERE report_id=?").get(fr.id).c;
    rows = db.query("SELECT COUNT(*) c FROM bctc_table_rows WHERE report_id=?").get(fr.id).c;
    md  = db.query("SELECT COUNT(*) c FROM bctc_md_tables WHERE report_id=?").get(fr.id).c;
  }
  console.log([
    t.padEnd(6), (q?.status ?? "NO_QUEUE_ROW").padEnd(17),
    String(q?.attempts ?? "-").padEnd(3), String(q?.last_attempt ?? "NULL").padEnd(19),
    (fr?.id ?? "NO_FR_ROW").padEnd(36), String(fr?.pdf_path ? 1 : 0).padEnd(3),
    String(lay).padEnd(6), String(rows).padEnd(4), String(md)
  ].join(" | "));
}
console.log("");
const hist = db.query("SELECT status, COUNT(*) c FROM bctc_vps_queue GROUP BY status ORDER BY c DESC").all();
console.log("bctc_vps_queue histogram (DB-wide):", hist.map(r=>`${r.status}=${r.c}`).join(" "));
const mx = db.query("SELECT MAX(extracted_at) m, COUNT(*) c FROM bctc_layout_units").get();
console.log("bctc_layout_units: count=" + mx.c + " MAX(extracted_at)=" + mx.m);
const mr = db.query("SELECT MAX(extracted_at) m, COUNT(*) c FROM bctc_table_rows").get();
console.log("bctc_table_rows:   count=" + mr.c + " MAX(extracted_at)=" + mr.m);
db.close();
'
