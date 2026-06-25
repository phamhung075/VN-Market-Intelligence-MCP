# po-s117-agent-signals-verified-decision-empty-payload-null-stockcode-mint-ack.jq
#
# Single-pass DB-sweep triage (PLAN-ONLY, project_anomaly_task_bridge) for the
# router 2332Z r6 finding: agent_signals verified_decision rows from alert-engine
# are 100% CONTENT-EMPTY (empty {} payload + null/empty stock_code):
#   M1  id-guarded MINT of 1 BACKLOG FIX task
#       FIX-ALERT-ENGINE-VERIFIED-DECISION-EMPTY-PAYLOAD-NULL-STOCKCODE
#       (MEDIUM-HIGH -> P2, NEVER promoted to ready[]) carrying the RAW LIVE evidence
#       + a "RAW-verify root LIVE before fix; fix MUST produce non-empty payload +
#       non-null stock_code + correct semantic alert_id; add an acceptance check that
#       scans agent_signals for WELL-FORMED verified_decision rows post-fix" mandate
#       (corroboration gate: feedback_false_infra_failure_corroboration_gate).
#   M2  flip the originating signal_queue row NEW->READ (not RESOLVED — open until the
#       fix ships) with a triaged_into anchor pointing at the minted task id.
#
# TRIAGE DECISION — MINT DISTINCT, do NOT fold:
#   The candidate fold-target FIX-ALERT-ENGINE-VERIFIED-DECISION-ALERTID-UUID-MISMATCH
#   is ALREADY DONE-LIVE-VERIFIED + closed (commit 57a781a1; taAlertScanJob.ts:258 +
#   bbAlertScanJob.ts:245 emit semantic id replacing crypto.randomUUID). Its shipped
#   fix scoped alert_id ONLY ("FIX TARGET: persist the SEMANTIC alerts.id") and its
#   verify gate ("alert_ids match alerts.id format AND orphans stop growing") can be
#   GREEN while payload stays empty + stock_code stays null. You cannot fold open work
#   into a closed/verified task, and the defect column-set differs. => genuinely DISTINCT.
#
# CONVERGENCE THESIS (cross-referenced, NOT duplicated): THREE defects on the ONE
#   alert-engine verified_decision emit/construction site (apps/mcp-server scheduler
#   scan jobs -> storeAlerts -> agent_signals):
#     (a) COUNT  / double-fire        = FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION (backlog, r5)
#     (b) LINKAGE / orphan alert_id   = FIX-ALERT-ENGINE-VERIFIED-DECISION-ALERTID-UUID-MISMATCH (DONE — alert_id fixed)
#     (c) CONTENT / empty payload+null stock_code = THIS (r6) — still broken, NOT addressed by (b).
#   Fix (c) coordinated at the SAME construction site that (b) already touched.
#
# ZONE: apps/mcp-server (NOT the Go alert-engine). The DONE task (b) RAW-verified the
#   real source: from_agent='alert-engine' verified_decision rows are emitted by the
#   TypeScript scan jobs taAlertScanJob.ts / bbAlertScanJob.ts via storeAlerts(), NOT
#   the Go service (grep-empty). This resolves the signal's CONFIRM-BEFORE-LOCK zone Q.
#
# Idempotent:
#   - mint guarded by id-presence across ALL board lanes (re-run mints 0)
#   - signal flip guarded by status=="NEW" (re-run flips 0)
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s117-agent-signals-verified-decision-empty-payload-null-stockcode-mint-ack.jq docs/data/orch/orch-state.json

def all_ids:
  [ .task_board.backlog[]?, .task_board.ready[]?, .task_board.in_progress[]?,
    .task_board.review[]?, .task_board.done[]?, .task_board.done_verified[]? ]
  | map(.id);

. as $root
| (all_ids) as $ids

# M1 — agent_signals verified_decision CONTENT-EMPTY (MEDIUM-HIGH -> P2)
| ( if ($ids | index("FIX-ALERT-ENGINE-VERIFIED-DECISION-EMPTY-PAYLOAD-NULL-STOCKCODE")) then {} else
    { id: "FIX-ALERT-ENGINE-VERIFIED-DECISION-EMPTY-PAYLOAD-NULL-STOCKCODE",
      title: "agent_signals verified_decision rows from alert-engine are 100% CONTENT-EMPTY (empty {} payload + null/empty stock_code). LIVE RAW (named volume vn-market-intelligence-mcp_market_data, read-only, immutable=1, scan_ts 2026-06-25T23:32Z): 559/559 (100%) verified_decision rows from from_agent='alert-engine' carry payload='{}'; ZERO verified_decision rows in the whole table have BOTH non-empty payload AND non-null/non-empty stock_code (i.e. zero well-formed rows exist); stock_code NULL/empty on these stock-scoped rows. Continuous/ongoing: MIN(created_at)=2026-06-13T07:59:53Z, MAX=2026-06-25T09:00:07Z (12+ days, not stale).",
      type: "FIX", priority: "P2", status: "BACKLOG",
      zone: "apps/mcp-server/", owner: "developer",
      root_cause: "CONTENT defect: the verified_decision signal is constructed/emitted WITHOUT populating payload (left '{}') or stock_code (left NULL/empty). Same emit/construction site that defect (b) FIX-ALERT-ENGINE-VERIFIED-DECISION-ALERTID-UUID-MISMATCH already touched (apps/mcp-server scheduler scan jobs taAlertScanJob.ts / bbAlertScanJob.ts -> storeAlerts() -> agent_signals). (b) fixed alert_id (UUID->semantic) ONLY; it did NOT populate payload or stock_code, so this symptom remains. Convergence thesis: one root construction site emits verified_decision rows with empty payload + null stock_code (CONTENT) and previously a UUID alert_id (LINKAGE, now fixed) and sometimes fires twice (COUNT, r5).",
      generic_mandate: "RAW-verify the root LIVE before any code change (re-run on the named-volume DB read-only: SELECT COUNT(*) FROM agent_signals WHERE signal_type='verified_decision' AND from_agent='alert-engine' AND (payload='{}' OR payload IS NULL); and confirm ZERO rows have BOTH non-empty payload AND non-null stock_code) — DB-sweep finding, corroborate first (feedback_false_infra_failure_corroboration_gate). Then locate the verified_decision emit/construction site (start at the (b)-fixed sites taAlertScanJob.ts:258 + bbAlertScanJob.ts:245 -> storeAlerts) and POPULATE before emit: (1) payload = the decision detail (NOT '{}'), (2) stock_code = the ticker, (3) keep the now-correct SEMANTIC alert_id from (b). Add an EMIT-TIME GUARD that REFUSES (fail-loud, NOT silent-swallow — feedback_silent_swallow_serial_bugs) to write a verified_decision row with empty payload. Coordinate the single fix with (a) r5 double-fire idempotency and (b) the already-shipped alert_id fix — SAME construction site. VERIFY-DON'T-CLAIM final severity: confirm WHICH consumers READ verified_decision.payload before locking blast radius/severity (feedback_router_verify_raw_not_badges); if NONE read it, downgrade.",
      verification_gate: "LIVE acceptance check (RAW-verify against named-volume DB, read-only): after fix + rebuild, freshly-emitted verified_decision rows from alert-engine have non-empty payload AND non-null/non-empty stock_code AND a semantic alert_id that resolves to alerts.id; specifically a scan SELECT COUNT(*) FROM agent_signals WHERE signal_type='verified_decision' AND created_at>=<fix_ts> AND (payload='{}' OR payload IS NULL OR stock_code IS NULL OR stock_code='') returns 0 over >=2 fresh cycles; AND a positive check confirms >=1 WELL-FORMED verified_decision row exists (non-empty payload AND non-null stock_code) post-fix.",
      source_signal: "router-dbsweep-20260625T2332Z-r6-agent-signals-verified-decision-empty-payload-null-stockcode",
      cross_ref: [
        "router-dbsweep-20260625T2231Z-r5-agent-signals-identical-dup-doublefire",
        "sau-20260625T1426-orphan-signals-regress"
      ],
      relationship: "THIRD distinct symptom (CONTENT) of ONE shared alert-engine verified_decision emit-path root, alongside (a) COUNT/double-fire (r5) and (b) LINKAGE/orphan-alert_id (DONE). NOT a dup of either: (a)=duplicate identical rows; (b)=unresolvable alert_id; THIS=empty payload + null stock_code on the SAME rows. NOT FOLDED into (b) because (b) is DONE-LIVE-VERIFIED + closed and its shipped fix scoped alert_id only (never payload/stock_code) — its verify gate is GREEN while this stays broken. Fix together at the single construction site.",
      related_board: [
        "FIX-ALERT-ENGINE-VERIFIED-DECISION-ALERTID-UUID-MISMATCH(done-live-verified — SAME emit site (taAlertScanJob.ts/bbAlertScanJob.ts->storeAlerts); fixed alert_id ONLY; proves the construction-site files for THIS payload+stock_code fix)",
        "FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION(backlog, r5 — COUNT/double-fire on same emit path; coordinate the single-site fix, DISTINCT defect)",
        "sau-20260625T1426-orphan-signals-regress(source of (b) — LINKAGE symptom)"
      ],
      router_verified: true,
      minted_by: "po", minted_at: $now,
      note: "PLAN-ONLY (project_anomaly_task_bridge): minted BACKLOG, NOT promoted to ready (WIP=0). PRIORITY P2 (MEDIUM-HIGH); confirm consumer reads of verified_decision.payload before escalating. Coordinate with the SAME construction site as the DONE alert_id fix + the backlog r5 double-fire — convergence thesis, three defects, one emit site."
    } end ) as $t1

# --- M1 apply: append non-empty mint to backlog ---------------------------------
| .task_board.backlog += ([$t1] | map(select(. != {})))

# --- M2 apply: flip the originating signal row NEW -> READ with triaged_into ------
| .signal_queue.rows |= map(
    if (.id == "router-dbsweep-20260625T2332Z-r6-agent-signals-verified-decision-empty-payload-null-stockcode") and .status == "NEW" then
      .status = "READ"
      | .triaged_at = $now
      | .triaged_by = "po"
      | .triaged_into = "FIX-ALERT-ENGINE-VERIFIED-DECISION-EMPTY-PAYLOAD-NULL-STOCKCODE"
      | .po_decision = "MINTED BACKLOG FIX-ALERT-ENGINE-VERIFIED-DECISION-EMPTY-PAYLOAD-NULL-STOCKCODE (P2/MEDIUM-HIGH, PLAN-ONLY) — NEW DISTINCT task, NOT folded. Fold-target FIX-ALERT-ENGINE-VERIFIED-DECISION-ALERTID-UUID-MISMATCH is already DONE-LIVE-VERIFIED + closed and its shipped fix (semantic id replacing crypto.randomUUID at taAlertScanJob.ts:258/bbAlertScanJob.ts:245) scoped alert_id ONLY — never payload/stock_code; cannot fold open work into a closed/verified task. CONTENT defect (empty {} payload + null stock_code) is a genuinely distinct column-set on the SAME emit construction site. Zone apps/mcp-server (NOT Go alert-engine — established by the DONE task's RAW grep). Convergence thesis: same emit site as (a) r5 double-fire + (b) DONE alert_id fix. Mandate: RAW-verify root LIVE first; fix MUST produce non-empty payload + non-null stock_code + correct semantic alert_id + fail-loud emit-time guard; acceptance = LIVE scan finds 0 malformed AND >=1 well-formed verified_decision row post-fix. READ not RESOLVED (open until fix ships)."
    else . end )

# --- metadata bump --------------------------------------------------------------
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po-s117"
