# po-S50 board write — post-C-08 (FIX-ALERT-ORPHAN-CORRELATION DONE) staging
# 1) Record FU-1 ORPHAN-AUDIT-JOIN-FIX (zone: docs/agents/system-auditor/ — agent-md-factory / system-auditor flow owner; NOT apps/mcp-server)
# 2) Record FU-2 ALERT-COWRITE-SCHEDULER-JOBS (zone: apps/mcp-server/ — dev-mcp-server)
# 3) Stage CI-RED-b7b84d9b-FIX -> READY for the dev chain (next dispatchable; apps/mcp-server zone free since FU-SCHEMA-DRIFT-P8-IMPL is PARKED/REWORK)
# Scoped writes only: append 2 backlog rows + flip one existing row + board _updated_*. No whole-object rewrite.

.task_board._updated_at = $now
| .task_board._updated_by = "po-S50"

# (3) Stage CI-RED-b7b84d9b-FIX as READY for the dev chain
| .task_board.backlog = (.task_board.backlog | map(
    if .id == "CI-RED-b7b84d9b-FIX"
    then .status = "READY"
       | .ready_at = $now
       | .ready_by = "po-S50"
       | .note = (.note + " | [po-S50 2026-06-13] C-08 (FIX-ALERT-ORPHAN-CORRELATION) cleared DONE; per PO ruling this is NEXT after C-08. WIP=0 active dev claims (FU-SCHEMA-DRIFT-P8-IMPL PARKED/REWORK, ARCH-SHIP-WAVE-REAUDIT in REVIEW) -> staging does not breach WIP<=2. zone apps/mcp-server free. STAGED READY for hourly dev-team cron (:07) / router pickup. NOT dispatched by PO.")
    else . end
  ))

# (1) + (2) append the two C-08 follow-ups
| .task_board.backlog += [
  {
    "id": "FU-ORPHAN-AUDIT-JOIN-FIX",
    "title": "system-auditor orphan-correlation audit query (C-08, docs/agents/system-auditor/flow/main.md line 463) uses JOIN ... ON a.id = s.id — compares alerts.id (TEXT/UUID) to agent_signals.id (INTEGER); SQLite never coerces -> permanently reports ALL alerts orphaned (this WAS the false '103 orphans/24h' metric). Change to ON a.id = s.alert_id now that the alert_id column exists and is co-written (FIX-ALERT-ORPHAN-CORRELATION shipped it).",
    "type": "FIX",
    "owner": "agent-md-factory",
    "status": "NEW",
    "size": "S",
    "zone": "docs/agents/system-auditor/",
    "priority": "high",
    "sprint": null,
    "desc": "ZONE = system-auditor flow / agent-md-factory (SSOT/DRY) — NOT apps/mcp-server, NOT dev-mcp-server. Follow-up surfaced during FIX-ALERT-ORPHAN-CORRELATION; intentionally NOT blocked on its REVIEW. The C-08 Tier-3 audit query at docs/agents/system-auditor/flow/main.md:463 reads `SELECT count(*) FROM alerts a LEFT JOIN agent_signals s ON a.id = s.id WHERE s.id IS NULL ...` — a.id is TEXT/UUID, s.id is INTEGER autoincrement; SQLite does no implicit cross-type coercion so the join NEVER matches and every alert reports as orphaned (the spurious '103 orphans/24h'). Fix: `ON a.id = s.alert_id`. DoD: line 463 query joins on s.alert_id; a manual run on the LIVE named-volume DB returns ~0 orphans (post co-write). Invoke agent-md-factory skill before editing the flow .md. UNTIL FIXED the Tier-3 orphan-delta metric is meaningless — orphan long-watch gate must NOT be read as a regression signal.",
    "created_at": $now,
    "created_by": "po",
    "_updated_at": $now,
    "blocks_metric": "tier3-orphan-delta-long-watch"
  },
  {
    "id": "FU-ALERT-COWRITE-SCHEDULER-JOBS",
    "title": "Three scheduler jobs INSERT INTO alerts directly, bypassing storeAlerts/storeAlertsFromCommander, so they do NOT co-write agent_signals rows -> they still generate genuine orphans. Migrate taAlertScanJob, bbAlertScanJob, foreignFlowAlertJob to the atomic alert->signal co-write path (route through storeAlerts) so the orphan-delta gate can fully close to ~0.",
    "type": "FIX",
    "owner": "dev-mcp-server",
    "status": "NEW",
    "size": "M",
    "zone": "apps/mcp-server/",
    "priority": "medium",
    "sprint": null,
    "desc": "ZONE = apps/mcp-server (dev-mcp-server). Follow-up from FIX-ALERT-ORPHAN-CORRELATION (atomic alert->signal co-write + alert_id column, commit 7cbca67a/556eb214). Files: apps/mcp-server/src/scheduler/market-data/taAlertScanJob.ts, apps/mcp-server/src/scheduler/alerts/bbAlertScanJob.ts, apps/mcp-server/src/scheduler/market-data/foreignFlowAlertJob.ts. These three INSERT INTO alerts directly and skip storeAlerts/storeAlertsFromCommander, so no agent_signals row is co-written and the alert is a GENUINE orphan (distinct from the FU-1 false-orphan join bug). DoD: all three jobs route through storeAlerts (or the same atomic co-write helper); each emitted alert co-writes an agent_signals row carrying alert_id; live verify on named-volume DB that orphan-delta from these jobs -> ~0. Generic across ALL tickers — no per-ticker hardcode. SERIALIZE: same zone as the dev chain head (CI-RED-b7b84d9b-FIX); dispatch AFTER it clears to honor zone-serialization + WIP<=2.",
    "created_at": $now,
    "created_by": "po",
    "_updated_at": $now,
    "depends_on": "FIX-ALERT-ORPHAN-CORRELATION",
    "serialize_zone": "apps/mcp-server/"
  }
]
