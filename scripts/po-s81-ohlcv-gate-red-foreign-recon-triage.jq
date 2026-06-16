# po-s81-ohlcv-gate-red-foreign-recon-triage.jq
# Single-pass dual-finding tick triage (2026-06-16, OHLCV behavioral-gate RED + foreign-flow recon complete).
#
# MUTATIONS (all idempotent, id-guarded across ALL board arrays):
#  F1.a  RELOCATE AUDIT-FC-FOREIGN-FLOW recon SPIKE ready[] -> done[] (verdict captured: real-count-no-truncation),
#        stamped done_verified:false (recon=findings, the two follow-on FIXES are the verified work).
#  F1.b  MINT FIX-FOREIGN-FLOW-COVERAGE (P2, dev-mcp-server)            -> backlog[]   (recon Fix-1)
#  F1.c  MINT FIX-FOREIGN-FLOW-DEAD-ENDPOINT (P3, dev-mcp-server)       -> backlog[]   (recon Fix-2)
#  F2.a  MINT FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0 (P0, dev-mcp-server) -> ready[]  (gate Classes 1+2+3 — PRIMARY GAP)
#  F2.b  MINT FIX-OHLCV-CORP-ACTION-CONTINUITY (P2, dev-mcp-server)     -> backlog[]   (gate Class 4 — NEW scope)
#
# NON-MUTATIONS (asserted held, not touched):
#  - FIX-ALERT-ENGINE-RSI-SINGLEDIGIT  stays review[]  (majors healed but gate non-generic; NOT done_verified)
#  - FIX-ALERT-OPEN-ZERO-PRICE-RACE    stays backlog HELD (Class-2 giá=0 still its source)
#  - FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 stays done_verified (follow-on minted, NOT reopened)
#  - .head untouched (architect hop for FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH is a planning lane, not coding WIP)
#
# Conservation (harness asserts): ready net +0 (-1 relocate, +1 mint), done +1, backlog +3, total +4.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s81-ohlcv-gate-red-foreign-recon-triage.jq docs/data/orch/orch-state.json

# --- id presence helper: true if id already exists in ANY board array ---
def id_present($id):
  [ .task_board | to_entries[] | select(.value|type=="array") | .value[] | (.id // "") ] | any(. == $id);

# ===== F1.a RELOCATE AUDIT-FC-FOREIGN-FLOW ready[] -> done[] (idempotent on done membership) =====
( [ .task_board.done[] | (.id // "") ] | any(. == "AUDIT-FC-FOREIGN-FLOW") ) as $audit_already_done
| if $audit_already_done then .
  else
    ( .task_board.ready | map(select(.id == "AUDIT-FC-FOREIGN-FLOW")) | .[0] ) as $row
    | if $row == null then .   # nothing to relocate (already moved elsewhere)
      else
        .task_board.ready |= map(select(.id != "AUDIT-FC-FOREIGN-FLOW"))
        | .task_board.done += [
            $row + {
              status: "DONE",
              done_verified: false,
              done_verified_deferred_note: "Recon SPIKE = findings captured (verdict real-count-no-truncation, doc docs/handoffs/AUDIT-FC-FOREIGN-FLOW-recon.md); verified-work = the two minted follow-on FIXES (COVERAGE P2 + DEAD-ENDPOINT P3). Recon itself carries no LIVE regression gate.",
              recon_verdict: "real-count-no-truncation — 102 is the correct filtered output of a 111-code watchlist+ref fetch; bgapidatafeed NOT page-capped. Two real gaps spun out as FIX-FOREIGN-FLOW-COVERAGE + FIX-FOREIGN-FLOW-DEAD-ENDPOINT.",
              resolved_at: $now,
              resolved_by: "po-s81"
            }
          ]
      end
  end

# ===== F1.b MINT FIX-FOREIGN-FLOW-COVERAGE -> backlog[] =====
| if id_present("FIX-FOREIGN-FLOW-COVERAGE") then .
  else .task_board.backlog += [{
    id: "FIX-FOREIGN-FLOW-COVERAGE",
    epic: "AUDIT-FETCH-COMPLETE",
    title: "Expand foreign-flow fetch from the 111-code watchlist+ref subset to the full daily_ohlcv traded universe",
    type: "FIX",
    status: "BACKLOG",
    priority: "P2",
    zone: "apps/mcp-server/",
    dev_agent: "dev-mcp-server",
    parent_recon: "AUDIT-FC-FOREIGN-FLOW",
    root_cause: "CODES list submitted to bgapidatafeed.vps.com.vn/getliststockdata/<CODES> is built only from watchlist DB + mcp.config.json referenceStocks (live 111 codes) -> ~1457 of the 1569 daily_ohlcv traded tickers carry foreign_net_vol=NULL permanently, even on days foreigners trade them.",
    fix_spec: "Source the CODES list from the full daily_ohlcv traded-code universe (recon confirms the API accepts arbitrary code lists in a single call, no pagination). Touch apps/mcp-server config layer + vps-scripts/fetch-foreign-flow.sh. Optionally extract fBValue/fSValue (VND trade value) present-but-dropped in the response; holding_ratio is NOT available from this source (leave NULL).",
    files: ["apps/mcp-server/ (config layer)", "vps-scripts/fetch-foreign-flow.sh"],
    generic_mandate: "Coverage must track the traded universe, not a fixed 111-code list (/goal#1 no-permanent-NULL on a served metric).",
    verification_gate: "RAW: distinct codes with foreign_net_vol NOT NULL for date=latest >> 102 and tracks daily_ohlcv traded count; spot-check a non-watchlist active code now has non-NULL foreign_net_vol.",
    rebuild_required: true,
    created_at: $now,
    created_by: "po-s81"
  }] end

# ===== F1.c MINT FIX-FOREIGN-FLOW-DEAD-ENDPOINT -> backlog[] =====
| if id_present("FIX-FOREIGN-FLOW-DEAD-ENDPOINT") then .
  else .task_board.backlog += [{
    id: "FIX-FOREIGN-FLOW-DEAD-ENDPOINT",
    epic: "AUDIT-FETCH-COMPLETE",
    title: "Remove/stub dead fetchPrimaryVpsEndpoint() — GETs a nonexistent VPS /foreign-flow route, silent 404 every minute",
    type: "FIX",
    status: "BACKLOG",
    priority: "P3",
    zone: "apps/mcp-server/",
    dev_agent: "dev-mcp-server",
    parent_recon: "AUDIT-FC-FOREIGN-FLOW",
    root_cause: "fetchPrimaryVpsEndpoint() in apps/mcp-server/src/infrastructure/fetchers/foreignFlowFetcher.ts GETs http://${VINAHOST_IP}/foreign-flow which does not exist on the VPS proxy (vps-proxy-server.js) -> silent 404 every market-minute; the push model (VPS -> POST /api/push-foreign-flow) is the only live path.",
    fix_spec: "Remove fetchPrimaryVpsEndpoint (dead GET fallback) or stub it to no-op so it stops the per-minute 404. Confirm pushForeignFlowHandler.ts remains the sole write path; no behavior change to served data.",
    files: ["apps/mcp-server/src/infrastructure/fetchers/foreignFlowFetcher.ts"],
    generic_mandate: "Dead-code removal — no fallback to a 404 route (reduce debt per project default).",
    verification_gate: "Grep confirms fetchPrimaryVpsEndpoint removed/stubbed; no /foreign-flow GET in fetcher; foreign flow still writes via push path (RAW: latest-date rows unchanged in count).",
    rebuild_required: true,
    created_at: $now,
    created_by: "po-s81"
  }] end

# ===== F2.a MINT FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0 -> ready[] (PRIMARY GAP — coding lane) =====
| if id_present("FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0") then .
  else .task_board.ready += [{
    id: "FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0",
    title: "Migrate remaining OHLCV writer(s) — esp. the daily aggregator/seeder — through writeOhlcvBatch so FR-S1 + scale-norm + a fail-closed C=0 reject apply to ALL tickers",
    type: "FIX",
    status: "READY",
    priority: "P0",
    zone: "apps/mcp-server/",
    dev_agent: "dev-mcp-server",
    next_agent: "dev-mcp-server",
    blocking: true,
    parent: "FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0",
    behavioral_gate_doc: "docs/handoffs/FIX-OHLCV-SEED-CANDLE-behavioral-gate-2026-06-16-RED.md",
    root_cause: "FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 healed watchlist majors (VHM/VIC/VJC RSI) but is NOT generic — residual OHLCV writers bypass writeOhlcvBatch (FR-S1 seed-rejection + scale-norm), corrupting non-major tickers. Behavioral gate RED on first post-rebuild prod cycle (1569 rows, flat_seed=775, null_env=117; 46 tickers >15% move vs prior real close).",
    classes: [
      "Class 1 (PRIMARY): aggregator/seeder (suspect ohlcvDailyAggregatorJob.ts) writes flat vol=0 bars at WRONG prices, env=production, ~773 rows incl DCR +64% (5900 vs 3600), H11 +47% (25700 vs 17500) — UNMIGRATED to writeOhlcvBatch -> bypasses FR-S1.",
      "Class 2: zero-price all-zero bars (env=NULL, vol=0): DAG/DFF/DMC/POM — FR-S1 should skip 0=0=0=0 today but they landed -> un-migrated env=NULL writer OR FR-S1 not on path. Source of 'giá 0 dưới BB' alerts.",
      "Class 3: ÷1000 leak on a production writer: PDN (105.2 vs prior 99,800), NHD (118.6 vs 92,500) — prevClose-miss in the batch JOIN OR un-migrated production writer. The exact VHM/VIC bug on non-major tickers -> proves non-generic."
    ],
    fix_spec: "Migrate the remaining OHLCV writer(s) — especially the daily aggregator/seeder — through writeOhlcvBatch so FR-S1 seed-rejection + detectAndNormalizeScaleFromPrevClose + a NEW fail-closed C=0 reject apply to ALL tickers (generic /goal#2). Trace the PDN/NHD prevClose-miss (Class 3). Add a fail-closed reject for C=0 (Class 2).",
    files: ["apps/mcp-server/src/.../ohlcvDailyAggregatorJob.ts (suspect — confirm)", "apps/mcp-server writeOhlcvBatch path", "FR-S1 seed-rejection + detectAndNormalizeScaleFromPrevClose"],
    generic_mandate: "Fix must be GENERIC across the full ticker universe, not the watchlist majors. No served bar may carry a ÷1000-scaled, wrong-price-seeded, or all-zero close (/goal#1 + /goal#2).",
    verification_gate: "RAW post-rebuild LIVE: re-run the 5 sidecar queries on daily_ohlcv date=latest — 0 flat vol=0 wrong-price seeds (Class 1), 0 all-zero 0|0|0|0 bars (Class 2), 0 ÷1000 leaks vs prior real close (Class 3); DCR/H11/DAG/DFF/DMC/POM/PDN/NHD all plausible (<=board limit move). get_technical_indicators on the repaired tickers returns real-band RSI.",
    rebuild_required: true,
    sequence_note: "Sequenced AHEAD of lower-pri ready[] items (data-integrity P0). Fills the 2nd coding slot (WIP<=2; in_progress currently = ARCH-CRON-SCHEDULER-RELIABILITY).",
    created_at: $now,
    created_by: "po-s81"
  }] end

# ===== F2.b MINT FIX-OHLCV-CORP-ACTION-CONTINUITY -> backlog[] (Class 4 — NEW scope) =====
| if id_present("FIX-OHLCV-CORP-ACTION-CONTINUITY") then .
  else .task_board.backlog += [{
    id: "FIX-OHLCV-CORP-ACTION-CONTINUITY",
    title: "Detect adjusted-vs-unadjusted price discontinuity at a corp-action boundary (|move| beyond board limit) -> reconcile/flag, never serve a false bar",
    type: "FIX",
    status: "BACKLOG",
    priority: "P2",
    zone: "apps/mcp-server/",
    dev_agent: "dev-mcp-server",
    parent: "FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0",
    behavioral_gate_doc: "docs/handoffs/FIX-OHLCV-SEED-CANDLE-behavioral-gate-2026-06-16-RED.md",
    root_cause: "Class 4: VJC real-shaped candle (proper O/H/L/C spread, 48,640 vol, env=NULL/VNDIRECT) is ~-25% vs unadjusted prior 183,700 — beyond any VN limit = an ex-div/ex-rights ADJUSTED close stitched onto unadjusted history. Poisons RSI/MACD/BB across the adjustment boundary. The pipeline has NO adjusted-vs-unadjusted continuity handling. Generic across any ex-date ticker.",
    fix_spec: "Detect |single-day move| beyond the listing-board limit (HOSE ±7%, UPCoM ±15%) -> reconcile against an adjusted-history source OR flag+exclude the boundary bar from TA. Do NOT silently serve a false -25% bar for VJC (a watchlist major) per /goal#1.",
    files: ["apps/mcp-server OHLCV continuity/adjustment layer (new)"],
    generic_mandate: "Generic across any ex-date ticker, not VJC-specific.",
    verification_gate: "RAW: VJC (and any ex-date ticker) no longer serves a >board-limit discontinuity bar into TA; boundary bar reconciled or flagged+excluded; RSI/MACD/BB no longer poisoned across the adjustment boundary.",
    rebuild_required: true,
    created_at: $now,
    created_by: "po-s81"
  }] end
