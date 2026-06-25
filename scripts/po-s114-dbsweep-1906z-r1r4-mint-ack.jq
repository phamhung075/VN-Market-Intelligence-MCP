# po-s114-dbsweep-1906z-r1r4-mint-ack.jq
#
# Single-pass DB-sweep triage (PLAN-ONLY, project_anomaly_task_bridge):
#   M1  id-guarded MINT of 4 BACKLOG FIX tasks (NEVER promoted to ready[]) — each carries a
#       "RAW-verify root cause before fix" generic_mandate (corroboration gate:
#       feedback_false_infra_failure_corroboration_gate — DB-sweep findings CAN be false-positives).
#   M2  flip the 4 originating signal_queue.rows NEW->READ (not RESOLVED — open until the fix ships)
#       with a po_decision note + the minted backlog task id.
#
# Idempotent:
#   - mint guarded by id-presence across ALL board lanes (re-run mints 0)
#   - signal flip guarded by status=="NEW" (re-run flips 0)
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s114-dbsweep-1906z-r1r4-mint-ack.jq docs/data/orch/orch-state.json

def all_ids:
  [ .task_board.backlog[]?, .task_board.ready[]?, .task_board.in_progress[]?,
    .task_board.review[]?, .task_board.done[]?, .task_board.done_verified[]? ]
  | map(.id);

# --- the 4 minted tasks -------------------------------------------------------
. as $root
| (all_ids) as $ids
| ($root) as $r

# M1-R1 — vnindex startup-purge (MEDIUM -> P2; recurring-bug-escalation, NOT a dedup)
| ( if ($ids | index("FIX-VNINDEX-CACHE-STARTUP-PURGE")) then {} else
    { id: "FIX-VNINDEX-CACHE-STARTUP-PURGE",
      title: "vn_index_cache PURGED on mcp-server startup + refresh is market-hours-only -> any off-hours restart strands cache=0 until next Mon open. RECURRING: prior FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH (DONE, never done_verified) framed it as a refresh-path bug and did NOT close the root.",
      type: "FIX", priority: "P2", status: "BACKLOG",
      zone: "apps/mcp-server/", owner: "developer",
      root_cause: "vn_index_cache is purged on mcp-server startup AND vnIndexRefresh runs market-hours-only (*/5 2-8 * * 1-5); an off-hours container restart leaves the latest-snapshot cache empty until the next market open.",
      generic_mandate: "RAW-verify the root LIVE before any code change (query named-volume vn_index_cache + cron_job_runs + container uptime) — DB-sweep finding, may be a transient. Then fix ONE of: (A) STOP purging vn_index_cache on startup (it is a latest-snapshot cache, no reason to purge), or (B) add a startup backfill of the latest VNINDEX snapshot. Prefer (A) unless a purge-need is proven. Do NOT re-patch the refresh path (the prior DONE fix already did that and the root recurred).",
      verification_gate: "LIVE: after fix, force an OFF-HOURS mcp-server restart and confirm vn_index_cache has the latest snapshot (>0 rows) immediately, NOT only after next market open; RAW-verify against named-volume DB across a restart cycle.",
      supersedes_resolution_of: "FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH",
      recurrence_policy: "recurring-bug-escalation",
      source_signal: "router-dbsweep-20260625T1906Z-r1-vnindex-cache-startup-purge",
      router_verified: true,
      minted_by: "po", minted_at: $now,
      note: "PLAN-ONLY (project_anomaly_task_bridge): minted BACKLOG, NOT promoted to ready. memory feedback_ohlcv_startup_purge_defeated_by_backfill_seeder — fix the WRITER/startup path, do not seed flat data."
    } end ) as $t1

# M1-R2 — scheduler double-registration (MEDIUM -> P2; feeds R3)
| ( if ($ids | index("FIX-SCHEDULER-DOUBLE-REGISTRATION")) then {} else
    { id: "FIX-SCHEDULER-DOUBLE-REGISTRATION",
      title: "Scheduler DOUBLE-REGISTRATION: vnIndexRefreshJob fires 2x/min (08:55:00 + 08:55:01) and pollNewsJob 4-5x/min (2026-06-24 14:30 x5) per cron_job_runs — duplicate registerJob / re-entrant startScheduler. Wasted compute + duplicate writes (directly feeds R3 kinhdich dups).",
      type: "FIX", priority: "P2", status: "BACKLOG",
      zone: "apps/mcp-server/", owner: "developer",
      root_cause: "Jobs registered more than once in the scheduler init (duplicate registerJob/startScheduler call or re-entrant init), so a single scheduled minute fires the handler 2-5 times.",
      generic_mandate: "RAW-verify the root LIVE before any code change (re-query cron_job_runs for vnIndexRefreshJob + pollNewsJob multi-fire within the same scheduled minute; confirm it is IN-PROCESS re-registration, NOT dispatcher overlap) — DB-sweep finding, corroborate first. Then make the scheduler registration idempotent: single registration per job (idempotent registry / startup guard) so a re-entrant init cannot double-register. Distinct from cowork manual-x-cloud double-fire (cowork-team-20260615T1620Z) which is dispatcher overlap, not in-process re-registration.",
      verification_gate: "LIVE: after fix, cron_job_runs shows EXACTLY ONE success row per job per scheduled minute across 2 fetch cycles for vnIndexRefreshJob + pollNewsJob; RAW-verify against named-volume DB.",
      source_signal: "router-dbsweep-20260625T1906Z-r2-scheduler-double-register",
      related_board: ["ARCH-CRON-SCHEDULER-RELIABILITY(done_verified, missed-fire class — distinct from this double-register class)", "FACTORY-SCHEDULER-job-table-registry(backlog, maintainability refactor — not this bug)"],
      router_verified: true,
      minted_by: "po", minted_at: $now,
      note: "PLAN-ONLY: minted BACKLOG, NOT promoted. ROOT for R3 (kinhdich same-second key collision) — fix this before R3's one-time dedup."
    } end ) as $t2

# M1-R3 — kinhdich dup groups (MEDIUM -> P3; depends on R2)
| ( if ($ids | index("FIX-KINHDICH-READINGS-DEDUP")) then {} else
    { id: "FIX-KINHDICH-READINGS-DEDUP",
      title: "kinhdich_readings has 1,534 duplicate (stock_code,timestamp,source) groups / 45,454 rows — non-idempotent intelligenceCycle A4 hexagram batch insert, amplified by R2 scheduler double-fire (two inserts same second -> identical key).",
      type: "FIX", priority: "P3", status: "BACKLOG",
      zone: "apps/mcp-server/", owner: "developer",
      root_cause: "Non-idempotent insert in the intelligenceCycle A4 hexagram batch; the R2 same-minute double-fire produces two inserts with an identical (stock_code,timestamp,source) key.",
      generic_mandate: "RAW-verify the dup count LIVE before any change (re-run the GROUP BY (stock_code,timestamp,source) HAVING COUNT(*)>1 on the named-volume DB). Then: (a) fix R2 first (it is the amplifier); (b) make the A4 insert idempotent via CREATE UNIQUE INDEX on (stock_code,timestamp,source) + INSERT OR IGNORE/REPLACE — memory feedback_sqlite_add_column_unique_silent_noop: ALTER TABLE ADD ... UNIQUE is a SILENT NO-OP in SQLite, MUST use CREATE UNIQUE INDEX; (c) one-time dedup of the existing 1534 groups keeping the latest rowid per key.",
      verification_gate: "LIVE: after fix, GROUP BY (stock_code,timestamp,source) HAVING COUNT(*)>1 returns 0 rows AND a fresh A4 cycle adds no new dup groups; RAW-verify against named-volume DB.",
      depends: ["FIX-SCHEDULER-DOUBLE-REGISTRATION"],
      source_signal: "router-dbsweep-20260625T1906Z-r3-kinhdich-dup-groups",
      router_verified: true,
      minted_by: "po", minted_at: $now,
      note: "PLAN-ONLY: minted BACKLOG, NOT promoted. P3 (data-hygiene, depends on R2 root)."
    } end ) as $t3

# M1-R4 — macro empty columns (LOW -> P3; residual gap not covered by macro-fetch-cluster)
| ( if ($ids | index("FIX-MACRO-INDICATORS-EMPTY-COLUMNS")) then {} else
    { id: "FIX-MACRO-INDICATORS-EMPTY-COLUMNS",
      title: "macro_indicators latest row (id=675, vietnam) populates ONLY cpi/gdp_growth/interest_rate; unemployment_rate/inflation_rate/trade_balance/current_account/government_debt/budget_deficit/manufacturing_pmi/consumer_confidence/retail_sales are ALL EMPTY -> /dashboard/macro mostly blank. Residual data-completeness gap NOT covered by macro-fetch-cluster (FRED/PMI) nor TASK-MACRO-COMMODITY-DELTA.",
      type: "FIX", priority: "P3", status: "BACKLOG",
      zone: "apps/macro-indicators/", owner: "developer",
      root_cause: "macro_indicators writer/fetcher populates only 3 of 13 columns for the vietnam row; remaining columns are never sourced/written.",
      generic_mandate: "RAW-verify LIVE before any change (re-query macro_indicators latest vietnam row on the named-volume DB; confirm the columns are persistently empty, not a one-off). Then dev-team to SCOPE which source feeds each column + whether the writer drops them; manufacturing_pmi may be subsumed by macro-fetch-cluster item(3) FRED_API_KEY-unset (do NOT duplicate that). Fill the genuinely-uncovered columns (unemployment_rate/inflation_rate/trade_balance/current_account/government_debt/budget_deficit/consumer_confidence/retail_sales) from real sources OR leave an honest gap+flag — no fabricated/zero fill (memory feedback_no_fake_data_real_fetch).",
      verification_gate: "LIVE: after fix, the latest macro_indicators vietnam row populates the scoped columns with REAL fetched values (or honest is_estimate/gap flags) and /dashboard/macro renders them; RAW-verify against named-volume DB.",
      source_signal: "router-dbsweep-20260625T1906Z-r4-macro-indicators-empty-columns",
      related_signal: "devteam-20260619T170200Z-macro-fetch-cluster (partial overlap, item 3 — FRED/PMI only)",
      router_verified: true,
      minted_by: "po", minted_at: $now,
      note: "PLAN-ONLY: minted BACKLOG, NOT promoted. LOW->P3 (UX-completeness, no live-correctness regression)."
    } end ) as $t4

# --- M1 apply: append non-empty mints to backlog --------------------------------
| .task_board.backlog += ([$t1,$t2,$t3,$t4] | map(select(. != {})))

# --- M2 apply: flip the 4 NEW signal rows -> READ -------------------------------
| .signal_queue.rows |= map(
    if (.id | startswith("router-dbsweep-20260625T1906Z")) and .status == "NEW" then
      .status = "READ"
      | .triaged_at = $now
      | .triaged_by = "po"
      | .po_decision = (
          if   .id == "router-dbsweep-20260625T1906Z-r1-vnindex-cache-startup-purge"   then "MINTED BACKLOG FIX-VNINDEX-CACHE-STARTUP-PURGE (P2, PLAN-ONLY). Recurring-bug-escalation: prior FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH(DONE) framed a refresh-path bug, did NOT close startup-purge root. RAW-verify-first."
          elif .id == "router-dbsweep-20260625T1906Z-r2-scheduler-double-register"     then "MINTED BACKLOG FIX-SCHEDULER-DOUBLE-REGISTRATION (P2, PLAN-ONLY). No existing double-register task (ARCH-CRON-RELIABILITY=missed-fire class, distinct). RAW-verify-first; root for R3."
          elif .id == "router-dbsweep-20260625T1906Z-r3-kinhdich-dup-groups"           then "MINTED BACKLOG FIX-KINHDICH-READINGS-DEDUP (P3, PLAN-ONLY, depends on R2). No existing kinhdich-dedup task. RAW-verify-first; CREATE UNIQUE INDEX (not ALTER ADD UNIQUE)."
          else                                                                              "MINTED BACKLOG FIX-MACRO-INDICATORS-EMPTY-COLUMNS (P3, PLAN-ONLY). Residual gap not covered by macro-fetch-cluster(item3 FRED/PMI). RAW-verify-first; no fabricated fill."
          end )
    else . end )

# --- metadata bump --------------------------------------------------------------
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po-s114"
