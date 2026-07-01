#!/usr/bin/env bash
# RAW-probe: window_status counts for a BCTC report's refined units, read from the
# LIVE named-volume DB inside the mcp-server container (WAL-aware: opens read-write
# mode, no readonly flag — see memory feedback_integrity_helper_readonly_wal_blinded).
# Token-economical alternative to get_bctc_refined (which returns full markdown ~25k tokens).
# Usage: bash scripts/qa/probe-bctc-refined-counts.sh <report_id>
# Owning flow: docs/agents/dev-team/flow/main.md (dispatcher RAW-verify of refine_bctc_md chunks)
set -euo pipefail
REPORT_ID="${1:?usage: probe-bctc-refined-counts.sh <report_id>}"
CONTAINER=$(docker ps --format '{{.Names}}' | grep -i 'mcp-server' | head -1)
docker exec "$CONTAINER" bun -e "
const {Database}=require('bun:sqlite');
const db=new Database('/app/data/market.db');
const rows=db.query(\"SELECT window_status, count(*) c, max(refined_at) latest FROM bctc_refined_units WHERE report_id=? GROUP BY window_status\").all('$REPORT_ID');
console.log(JSON.stringify({report_id:'$REPORT_ID', counts:rows}));
db.close();
"
