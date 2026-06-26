# po-s112-telegram-inbox-3311-3330-triage.jq
# Single-pass id-guarded MINT of the genuinely-real, not-yet-tracked findings drained from the
# Telegram-report inbox (ids 3311-3330, dev-team tick 2026-06-26T05:52Z). All other 15 reports
# were resolved as false/tracked-dup/anchored against the live board (no mint).
#
# Mints 5 PLAN-ONLY FIX rows into .task_board.backlog[] (status:BACKLOG, plan_only:true, WIP stays 0):
#   FIX-BCTC-ACV-Q1-2026-INGEST-GAP            (report 3315)
#   FIX-MARKET-MESSAGES-TIMESTAMP-FORMAT       (report 3316)
#   FIX-NEWS-REUTERS-DEAD-URL-DECOMMISSION     (report 3311 F-3)
#   FIX-MACRO-TE-CHROMIUM-FETCH-BROKEN         (report 3311 F-4)
#   FIX-MACRO-ISM-FRED-API-KEY-MISSING         (report 3311 F-5)
#
# Idempotent: each row skipped if its id already present in ANY board array.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s112-telegram-inbox-3311-3330-triage.jq docs/data/orch/orch-state.json
# (atomic temp -> [ -s ] -> jq empty -> conservation -> rename; commit orch-state by EXPLICIT PATH; PUSH HELD — PO out-of-band)

. as $root
| ([ .task_board.backlog[], .task_board.ready[], .task_board.in_progress[], .task_board.review[], .task_board.done[], .task_board.done_verified[] ]
   | map(if type=="object" then .id else . end)) as $allids
| ([
    {
      "id": "FIX-BCTC-ACV-Q1-2026-INGEST-GAP",
      "type": "FIX", "status": "BACKLOG", "priority": "P2", "size": "M",
      "zone": "apps/mcp-server/", "next_agent": "bctc-analyst", "route_to": "bctc-analyst", "owner": "bctc-analyst",
      "blocking": false,
      "title": "ACV Q1-2026 BCTC ingest gap: 5 discover/enrich cycles returned empty 8+ days post-filing — bctc-analyst blind to ACV Q1 financials",
      "root_cause": "RECON-FIRST (PLAN-ONLY): bctc-analyst report (Telegram 3315) — ACV Q1-2026 filing exists 8+ days but 5 ingest cycles came back empty. Distinct from the off-season SLA false-positive (FIX-BCTC-SLA-THRESHOLD-360) and the cosmetic stale-fetch artifact: this is a SPECIFIC-ticker coverage gap (ACV filed, not ingested). Likely same enrich-silent-0-rows class as FIX-BCTC-ENRICH-SILENT-0ROWS OR a discover-listing gap for ACV specifically. Recon must confirm the ACV filing is published on HNX/source AND trace which pipeline stage drops it (discover vs pull vs enrich) before any code fix.",
      "anchor_prior_art": ["FIX-BCTC-ENRICH-SILENT-0ROWS", "FIX-BCTC-SLA-THRESHOLD-360"],
      "source": "Telegram report 3315 (bctc-analyst, 2026-06-24T18:03Z); PO triage 2026-06-26 dev-team tick 05:52Z; RAW-verified distinct from off-season SLA falsepos",
      "created_at": $now, "created_by": "po", "plan_only": true
    },
    {
      "id": "FIX-MARKET-MESSAGES-TIMESTAMP-FORMAT",
      "type": "FIX", "status": "BACKLOG", "priority": "P2", "size": "S",
      "zone": "apps/mcp-server/", "next_agent": "architect", "route_to": "architect", "owner": "architect",
      "blocking": false,
      "title": "market_messages.sent_at stored as space-separated TEXT ('YYYY-MM-DD HH:MM:SS') -> datetime/ISO comparison returns 0 rows even when fresh data exists (C-06 freshness query false-empty)",
      "root_cause": "RECON-FIRST (PLAN-ONLY): AUDITOR T3 (Telegram 3316) — latest market_messages.sent_at='2026-06-24T19:51:07' is 4.5h old (inside 3h... wait within window) but a datetime comparison query returns 0 because the column mixes space-separated and T-separated TEXT formats, breaking string/datetime() comparison. Distinct from FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE (that fixes the auditor's off-market threshold; THIS fixes the underlying column-format inconsistency that breaks any sent_at comparison). Fix: normalize sent_at writes to a single canonical format (ISO-8601 or epoch) + migrate existing rows; per memory feedback_sqlite_iso8601_datetime_strcompare_bypass prefer epoch-seconds for comparisons.",
      "anchor_prior_art": ["FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE"],
      "memory_ref": ["feedback_sqlite_iso8601_datetime_strcompare_bypass"],
      "source": "Telegram report 3316 (AUDITOR T3, 2026-06-25T00:32Z); PO triage 2026-06-26 dev-team tick 05:52Z",
      "created_at": $now, "created_by": "po", "plan_only": true
    },
    {
      "id": "FIX-NEWS-REUTERS-DEAD-URL-DECOMMISSION",
      "type": "FIX", "status": "BACKLOG", "priority": "P3", "size": "S",
      "zone": "apps/mcp-server/", "next_agent": "architect", "route_to": "architect", "owner": "architect",
      "blocking": false,
      "title": "Reuters RSS source: 221 consecutive fetch failures — VPS news service decommissioned but news-fetch:5008 still points at the dead Reuters URL (pollNewsJob/intelligenceCycleJob log noise, never fetched)",
      "root_cause": "RECON-FIRST (PLAN-ONLY): health-recheck F-3 (Telegram 3311) — Reuters RSS endpoint has 221 consecutive failures, never returns items. News pipeline RAW-confirmed LIVE this session (news-scout c110 fetched 20 real articles from the 3/7 active sources), so this is a DEAD-SOURCE cleanup, not a pipeline outage. Decommission/replace the dead Reuters URL OR remove it from the active source set so it stops emitting failure noise. Distinct from NEWS-FETCH-AVAIL-01-FIX (that recons whether news-fetch:5008 is undeployed-by-design).",
      "anchor_prior_art": ["NEWS-FETCH-AVAIL-01-FIX", "FIX-VPS-NEWS-STALE-FALSEPOS"],
      "source": "Telegram report 3311 F-3 (health-recheck, 2026-06-23T16:08Z); PO triage 2026-06-26 dev-team tick 05:52Z",
      "created_at": $now, "created_by": "po", "plan_only": true
    },
    {
      "id": "FIX-MACRO-TE-CHROMIUM-FETCH-BROKEN",
      "type": "FIX", "status": "BACKLOG", "priority": "P3", "size": "M",
      "zone": "apps/mcp-server/", "next_agent": "architect", "route_to": "architect", "owner": "architect",
      "blocking": false,
      "title": "Trading Economics fetch: 221-222 consecutive failures — Chromium TE scrape still broken despite prior Dockerfile fix (macroIndicatorRefreshJob degraded)",
      "root_cause": "RECON-FIRST (PLAN-ONLY): health-recheck F-4 (Telegram 3311) — TE Chromium fetch broken with 221-222 failures despite a prior Dockerfile fix. Caller macroIndicatorRefreshJob. Distinct from FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD (that guards the timeout/degrade path; THIS is the actual Chromium TE-fetch breakage). Recon must confirm the Chromium/headless path in the live container and whether the Dockerfile fix actually shipped, before any code change.",
      "anchor_prior_art": ["FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD"],
      "source": "Telegram report 3311 F-4 (health-recheck, 2026-06-23T16:08Z); PO triage 2026-06-26 dev-team tick 05:52Z",
      "created_at": $now, "created_by": "po", "plan_only": true
    },
    {
      "id": "FIX-MACRO-ISM-FRED-API-KEY-MISSING",
      "type": "FIX", "status": "BACKLOG", "priority": "P3", "size": "S",
      "zone": "apps/mcp-server/", "next_agent": "architect", "route_to": "architect", "owner": "architect",
      "blocking": false,
      "title": "get_ism_subcomponents returns no data: fred_series_daily empty for ISM series — likely missing FRED_API_KEY config in the live macro fetch env",
      "root_cause": "RECON-FIRST (PLAN-ONLY): health-recheck F-5 (Telegram 3311) — get_ism_subcomponents has no rows in fred_series_daily, likely a missing FRED_API_KEY in the macro fetcher env. Config bug, not a code bug. Distinct from AUDIT-FC-FRED-MACRO (FRED completeness recon) — THIS is a specific ISM-subcomponent data gap traced to a missing API key. Recon must confirm the key is actually absent in the live container env before any change.",
      "anchor_prior_art": ["AUDIT-FC-FRED-MACRO", "FU-FRED-EFFR-STALE"],
      "source": "Telegram report 3311 F-5 (health-recheck, 2026-06-23T16:08Z); PO triage 2026-06-26 dev-team tick 05:52Z",
      "created_at": $now, "created_by": "po", "plan_only": true
    }
  ] | map(select(.id as $id | ($allids | index($id)) | not))) as $mints
| .task_board.backlog += $mints
| ._s112_minted = ($mints | length)
