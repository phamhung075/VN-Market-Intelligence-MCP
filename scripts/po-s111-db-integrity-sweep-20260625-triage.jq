# po-s111-db-integrity-sweep-20260625-triage.jq
# Owner: PO triage — router-driven DB data-integrity sweep (scan_ts 2026-06-25T19:06Z,
# live named-volume vn-market-intelligence-mcp_market_data via file:?immutable=1 sidecar).
# Pure SIGNAL-BUS triage: appends repair_task_request rows to .signal_queue.rows (does NOT
# touch .task_board — no sprint start) + REOPENS recurring db3. Idempotent: each row guarded
# by id-presence in .signal_queue.rows; db3 reopen guarded by status check.
#   R1 — REOPEN sau-20260620T103002-db3 (RESOLVED→TRIAGED, recurring) + file repair root-cause
#   R2 — NEW repair_task_request: scheduler double-registration
#   R3 — NEW repair_task_request: kinhdich_readings duplicate groups (downstream of R2)
#   R4 — NEW repair_task_request: macro_indicators latest row mostly-empty columns
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/po-s111-db-integrity-sweep-20260625-triage.jq \
#     docs/data/orch/orch-state.json > /tmp/orch.tmp \
#   && [ -s /tmp/orch.tmp ] && jq empty /tmp/orch.tmp \
#   && mv /tmp/orch.tmp docs/data/orch/orch-state.json
# Flow-doc pointer: docs/agents/po/flow/main.md (Reusable triage scripts)

def row_present($id):
  [ .signal_queue.rows[] | select((.id // "") == $id) ] | length > 0;

def append_row($r):
  if row_present($r.id) then . else .signal_queue.rows += [$r] end;

. as $root
| ($now) as $now

# --- R2: scheduler double-registration (file FIRST — R3 depends on it) ---
| append_row({
    "id": "router-dbsweep-20260625T1906Z-r2-scheduler-double-register",
    "ts": $now,
    "from": "dev-team",
    "to": "dev-team",
    "type": "repair_task_request",
    "service": "mcp-server/scheduler",
    "zone_owner": "dev-mcp-server",
    "severity": "MEDIUM",
    "status": "NEW",
    "router_verified": true,
    "router_verified_at": "2026-06-25T19:06:00Z",
    "summary": "Scheduler DOUBLE-REGISTRATION. RAW cron_job_runs (last 2d): vnIndexRefreshJob fires TWICE per scheduled minute (e.g. 08:55:00 AND 08:55:01, both success rows_written=1); pollNewsJob fires 4-5x per scheduled minute (2026-06-24 14:30 x5). ROOT-CAUSE HYPOTHESIS: jobs registered more than once in the scheduler (duplicate registerJob/startScheduler call or re-entrant init). Impact: wasted compute + duplicate writes (directly feeds R3 kinhdich dups). FIX DIRECTION: audit scheduler registration path for duplicate handler registration; guarantee single registration per job (idempotent registry / startup guard). NOTE: distinct from the existing manual-x-cloud cowork double-fire signals (cowork-team-20260615T1620Z-gatherer-manual-cloud-doublefire) — this is IN-PROCESS scheduler re-registration, not dispatcher overlap.",
    "evidence": "cron_job_runs: vnIndexRefreshJob 08:55:00 + 08:55:01 same minute; pollNewsJob 2026-06-24 14:30 x5",
    "root_cause": "duplicate job registration in scheduler init (re-entrant startScheduler / duplicate registerJob)",
    "related_board": ["ARCH-CRON-SCHEDULER-RELIABILITY(done_verified)", "FACTORY-SCHEDULER-job-table-registry(backlog)"]
  })

# --- R3: kinhdich duplicate groups (downstream of R2) ---
| append_row({
    "id": "router-dbsweep-20260625T1906Z-r3-kinhdich-dup-groups",
    "ts": $now,
    "from": "dev-team",
    "to": "dev-team",
    "type": "repair_task_request",
    "service": "mcp-server/intelligenceCycle-A4",
    "zone_owner": "dev-mcp-server",
    "severity": "MEDIUM",
    "status": "NEW",
    "router_verified": true,
    "router_verified_at": "2026-06-25T19:06:00Z",
    "summary": "kinhdich_readings has 1,534 duplicate (stock_code,timestamp,source) groups out of 45,454 rows. ROOT CAUSE: non-idempotent insert in the intelligenceCycle A4 hexagram batch, amplified by R2 double-fire (two inserts same second -> identical key). FIX DIRECTION: (a) fix R2 first; (b) make the A4 insert idempotent via CREATE UNIQUE INDEX on (stock_code,timestamp,source) — NOTE per memory: ALTER TABLE ADD ... UNIQUE is a SILENT NO-OP in SQLite, MUST use CREATE UNIQUE INDEX + INSERT OR IGNORE/REPLACE; (c) one-time dedup of existing 1534 groups (keep latest rowid per key).",
    "evidence": "1534 dup (stock_code,timestamp,source) groups / 45454 total rows",
    "root_cause": "non-idempotent A4 hexagram batch insert + R2 double-fire same-second key collision",
    "depends": ["router-dbsweep-20260625T1906Z-r2-scheduler-double-register"]
  })

# --- R4: macro_indicators latest row mostly-empty columns ---
| append_row({
    "id": "router-dbsweep-20260625T1906Z-r4-macro-indicators-empty-columns",
    "ts": $now,
    "from": "dev-team",
    "to": "po",
    "type": "repair_task_request",
    "service": "macro-store/macro_indicators",
    "zone_owner": "dev-macro-indicators",
    "severity": "LOW",
    "status": "NEW",
    "router_verified": true,
    "router_verified_at": "2026-06-25T19:06:00Z",
    "summary": "macro_indicators latest row (id=675, country=vietnam, fetched_at 2026-06-25 12:13) populates ONLY cpi/gdp_growth/interest_rate; unemployment_rate, inflation_rate, trade_balance, current_account, government_debt, budget_deficit, manufacturing_pmi, consumer_confidence, retail_sales are ALL EMPTY -> /dashboard/macro shows mostly blank fields. DATA-COMPLETENESS repair of the macro_indicators WRITER/fetcher. OVERLAP NOTE: macro-fetch-cluster signal (devteam-20260619T170200Z-macro-fetch-cluster, TRIAGED) item(3) covers FRED_API_KEY-unset -> get_ism_subcomponents + macro CALENDAR empty (manufacturing_pmi may be subsumed there). The OTHER empty columns (unemployment_rate/inflation_rate/trade_balance/current_account/government_debt/budget_deficit/consumer_confidence/retail_sales) are NOT covered by that cluster nor by TASK-MACRO-COMMODITY-DELTA (commodity deltas only) — file as the residual data-completeness gap. dev-team to scope which source feeds each column + whether the writer drops them.",
    "evidence": "macro_indicators id=675 vietnam: only cpi/gdp_growth/interest_rate non-null",
    "root_cause": "macro_indicators writer/fetcher populates 3 of 13 columns (residual gap not covered by macro-fetch-cluster)",
    "related_signal": "devteam-20260619T170200Z-macro-fetch-cluster (partial overlap, item 3)"
  })

# --- R1: file repair_task_request with correct recurring root-cause ---
| append_row({
    "id": "router-dbsweep-20260625T1906Z-r1-vnindex-cache-startup-purge",
    "ts": $now,
    "from": "dev-team",
    "to": "dev-team",
    "type": "repair_task_request",
    "service": "mcp-server/vn_index_cache",
    "zone_owner": "dev-mcp-server",
    "severity": "MEDIUM",
    "status": "NEW",
    "recurring": true,
    "router_verified": true,
    "router_verified_at": "2026-06-25T19:06:00Z",
    "summary": "RECURRING (db3 reopen): vn_index_cache = 0 rows RIGHT NOW. Prior fix FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH (board=DONE) did NOT close the root. RAW evidence: cron_job_runs vnIndexRefreshJob status=success rows_written=1 at 08:45/08:50/08:55 (last market-hour runs); mcp-server container Up 4h (restarted ~15:00 UTC, AFTER last write). ROOT CAUSE (correct-thinking, not symptom): vn_index_cache is PURGED on mcp-server startup AND vnIndexRefresh runs market-hours ONLY (*/5 2-8 * * 1-5), so ANY off-hours restart leaves the cache empty until next Monday open. FIX DIRECTION: either (A) STOP purging vn_index_cache on startup (it is a latest-snapshot cache — no reason to purge), OR (B) add a startup backfill of the latest VNINDEX snapshot. Per recurring-bug-escalation policy (2+ failures same module).",
    "evidence": "vn_index_cache=0 rows; vnIndexRefreshJob last success 08:55 rows_written=1; container Up 4h (restart ~15:00Z post-write)",
    "root_cause": "startup purge of vn_index_cache + market-hours-only refresh window -> off-hours restart strands empty cache",
    "supersedes_resolution_of": "sau-20260620T103002-db3 / FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH",
    "recurrence_policy": "recurring-bug-escalation"
  })

# --- R1: REOPEN db3 (RESOLVED -> TRIAGED, recurring) ---
| .signal_queue.rows = ( .signal_queue.rows | map(
    if .id == "sau-20260620T103002-db3" and .status == "RESOLVED"
    then .status = "TRIAGED"
       | .reopened_at = $now
       | .reopened_by = "po-s111"
       | .reopen_reason = "RECURS at 2026-06-25T19:06Z scan (0 rows). Prior resolution minted FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH (DONE) but did NOT address the true root (startup purge + market-hours-only refresh). Re-filed as router-dbsweep-20260625T1906Z-r1-vnindex-cache-startup-purge with correct root-cause. Recurring-bug-escalation."
    else . end ) )

| .signal_queue._updated_at = $now
| .signal_queue._updated_by = "po-s111"
| .signal_queue.last_triaged_at = $now
| .signal_queue.last_triaged_by = "po-s111"
| ._updated_at = $now
| ._updated_by = "po-s111"
