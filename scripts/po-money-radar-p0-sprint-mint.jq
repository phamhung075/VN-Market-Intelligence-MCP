# po-money-radar-p0-sprint-mint.jq
# Single-pass sprint-kickoff MINT for MONEY-RADAR-P0 (Phase-0-first, brief §11).
# Source: docs/architecture-briefs/2026-07-01-money-radar.md (7c03e75b);
#         signal docs/signals/money-radar-20260701T075240Z.json.
#
# Mutations (all idempotent, id-guarded across ALL board lanes + sprint_goal.entries):
#   M0  sprint_goal.entries[] += vision entry for sprint MONEY-RADAR-P0
#   M1  task_board.ready[]     += MONEY-RADAR-P0-T1-OSCILLATORS  (LEAD, unblocked, dev-technical-analysis, developer)
#   M2  task_board.backlog[]   += MONEY-RADAR-P0-T2-COMPOSITE    (depends T1, dev-mcp-server, developer)
#   M3  task_board.backlog[]   += MONEY-RADAR-P0-T3-DASHBOARD    (depends T2, dev-frontend, developer)
#   M4  task_board.backlog[]   += MONEY-RADAR-P0-T4-QA-GATE      (depends T1+T2+T3, qa)
#
# WIP discipline (dev-standards WIP=2): CCATO-T1 already READY (1). Adding T1-OSCILLATORS as
# READY → 2 READY total = WIP limit (≤2). Downstream T2/T3/T4 BACKLOG, dep-gated.
# Route via: jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" -f scripts/po-money-radar-p0-sprint-mint.jq \
#            docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# orch-apply.sh does Zod + dup-key + CAS + atomic rename. PUSH HELD — fleet-push timer pushes.

def board_ids:
  [ .task_board | (.ready, .backlog, .in_progress, .review, .done, .done_verified)[]?
    | if type=="object" then .id else . end ];

def sprint_ids:
  [ .sprint_goal.entries[]?.sprint_id ];

# ── M0 : sprint_goal vision entry ──────────────────────────────────────────────
( if (sprint_ids | index("MONEY-RADAR-P0")) then .
  else .sprint_goal.entries += [{
    "sprint_id": "MONEY-RADAR-P0",
    "status": "active",
    "priority": "high",
    "created_by": "po",
    "origin": "architecture_brief_2026-07-01-money-radar (7c03e75b); signal docs/signals/money-radar-20260701T075240Z.json",
    "vision": "Money Radar (Radar Dòng Tiền): the missing fusion + DIVERGENCE layer over the 9 live money-flow tools. DIVERGENCE — smart money quietly exiting a rising tape before the retail crowd reacts — is the headline signal, emitted SEPARATELY from the composite score (never diluted into a mean) and UNKNOWN-not-GREEN when an axis is null. Phase-0-first: NO new crawls; ships REAL non-null readings day one from close+volume on 76 live bars (field-constraint C1). Fulfils standing intent project_money_radar_vision.md.",
    "scope_in": "PHASE 0 ONLY — 4 tasks (brief §11). (1) dev-technical-analysis (Go :5003) get_money_flow_oscillators: OBV, relative-volume z-score(20), up/down volume ratio, degraded close-only VWAP (is_proxy=true) — the ONLY 4 Phase-0-shippable oscillators per C1. (2) dev-mcp-server get_money_radar_composite MCP tool: wires the 8 LIVE reuse tools (§C2) + the 4 new oscillators + D1/D2/D3(Phase-0 form)/D4 divergence detectors + honest-NULL rules HN-1..HN-7. (3) dev-frontend dashboard.money-radar.tsx: mirror dashboard.momentum.tsx, 4 GaugeCards (§8), honest-NULL render. (4) qa gate: verify Phase-0 DoD (§6).",
    "scope_out": "HOLD until Phase 0 verified (NOT this sprint): tự-doanh EOD crawl, per-sector foreign-flow bucketing, agent-flow wiring (fb-market-poster/CHEF/market-watcher/digest-predict/alert-commander), CCATO wiring (HN-7 tie-in), ALL Phase-1/Phase-2 items. FIELD-GATED (C1 — get_price_history exposes ONLY close+volume, NO H/L): MFI(14)/CMF(20)/A-D line/Chaikin Oscillator — HOLD; they unlock automatically (zero radar rework) IF the OHLCV epic later exposes H/L. HOLD PERMANENTLY (§4 roadmap reject list): order-book one-sided flag, per-deal large-block direction, Xtrackers, margin-per-account.",
    "success_metric": "Brief §6 Phase-0 DoD, RAW-demonstrable: (a) get_money_radar_composite (no ticker arg) returns a REAL non-null score (coverage_pct<0.5 → null + null_reason, NEVER a zero); foreign accum z-score, OBV slope, relative-volume z, and volatility regime all contribute non-null. (b) D2 (price-vs-OBV distribution) fires on a REAL historical example: a session where VN-Index closed up while OBV slope was negative over the preceding 5 sessions → detector emits flag=AMBER, detectors=[\"D2\"]. (c) dashboard loads without error; null card renders '—' + gray FreshnessBadge + 'Chưa có dữ liệu'; non-null card renders formatted score + colored badge. (d) momentum cards (all-NULL, OHLCV-depth-gated) sit parallel with NO regression.",
    "field_constraint_C1": "get_price_history exposes ONLY close+volume (no H/L) — router RAW-verified live 2026-07-01 (VCB 76 bars, every bar {code,date,close,volume}). The 4 oscillators above are the ONLY Phase-0-shippable ones; MFI/CMF/A-D/Chaikin are FIELD-GATED and HELD (do NOT include in Phase 0). Degraded VWAP MUST be labeled is_proxy=true, never canonical (HN-5).",
    "created_at": $now
  }] end )

# ── M1 : T1 oscillators -> ready[] (LEAD, unblocked) ───────────────────────────
| ( if (board_ids | index("MONEY-RADAR-P0-T1-OSCILLATORS")) then .
    else .task_board.ready += [{
      "id": "MONEY-RADAR-P0-T1-OSCILLATORS",
      "title": "dev-technical-analysis (Go :5003): get_money_flow_oscillators — OBV, relative-volume z-score(20), up/down volume ratio, degraded close-only VWAP (is_proxy=true). The 4 ONLY Phase-0-shippable oscillators per field-constraint C1 (close+volume only, no H/L).",
      "owner": "developer",
      "next_agent": "developer",
      "status": "READY",
      "zone": "dev-technical-analysis",
      "type": "FEATURE",
      "size": "S",
      "priority": "high",
      "sprint": "MONEY-RADAR-P0",
      "depends": [],
      "created_at": $now,
      "files": ["apps/technical-analysis/ (Go :5003 — new get_money_flow_oscillators endpoint over daily_ohlcv close+volume)"],
      "spec_ref": "docs/architecture-briefs/2026-07-01-money-radar.md §11.1 + §3(L1) + §2(C1) + §10 (TA stale-image mitigation)",
      "generic_mandate": "Implement EXACTLY four oscillators, computed from daily_ohlcv close+volume on the live 76-bar depth: (1) OBV = cumulative sign(close_t − close_{t−1}) × volume_t (depth-independent, no window). (2) Relative-volume z-score(20) = (vol_t − mean_20) / std_20 (window 20 << 76). (3) Up/Down volume ratio = Σvol(up days) / Σvol(down days) over window. (4) Degraded VWAP = Σ(close×vol)/Σvol over window — MUST emit is_proxy=true (HN-5, C1: no true typical price without H/L). Field-constraint C1 is NON-NEGOTIABLE: get_price_history exposes ONLY close+volume — do NOT attempt MFI/CMF/A-D/Chaikin (they need H/L; FIELD-GATED, out of scope). Compute AFTER any TA :5003 deploy/restart + re-probe (not from a stale image — §10 risk).",
      "acceptance": "get_money_flow_oscillators returns real non-null OBV, rel_vol_z_20, up_down_vol_ratio, and degraded_vwap (is_proxy=true) for a live watchlist ticker over the 76-bar depth. Values are plausible (OBV monotone-ish with tape; rel_vol_z within a sane band; ratio > 0; VWAP within the close range). is_proxy=true is present on the VWAP field. NO H/L-gated oscillator is emitted.",
      "verification_gate": "qa RAW-calls the endpoint against a live ticker; asserts all 4 fields non-null + plausible + degraded VWAP carries is_proxy=true; confirms MFI/CMF/A-D/Chaikin are absent (FIELD-GATED). Re-probed AFTER TA :5003 restart to avoid stale-image false read.",
      "note": "LEAD atom of MONEY-RADAR-P0 (no deps). Placed READY: CCATO-T1 (1 READY) + this = 2 READY = dev-standards WIP limit. Depth-independent — decoupled from the in-flight OHLCV-depth epic (C4)."
    }] end )

# ── M2 : T2 composite MCP tool -> backlog[] (depends T1) ───────────────────────
| ( if (board_ids | index("MONEY-RADAR-P0-T2-COMPOSITE")) then .
    else .task_board.backlog += [{
      "id": "MONEY-RADAR-P0-T2-COMPOSITE",
      "title": "dev-mcp-server: get_money_radar_composite MCP tool — wires the 8 LIVE reuse tools (§C2) + the 4 new oscillators, D1/D2/D3(Phase-0 form)/D4 divergence detectors, and honest-NULL rules HN-1..HN-7 into the composite schema (§4).",
      "owner": "developer",
      "next_agent": "developer",
      "status": "BACKLOG",
      "zone": "dev-mcp-server",
      "type": "FEATURE",
      "size": "M",
      "priority": "high",
      "sprint": "MONEY-RADAR-P0",
      "depends": ["MONEY-RADAR-P0-T1-OSCILLATORS"],
      "created_at": $now,
      "files": ["apps/mcp-server/src/interface/mcp/tools/market-data/ (new get_money_radar_composite tool)"],
      "spec_ref": "docs/architecture-briefs/2026-07-01-money-radar.md §11.2 + §4 (composite schema + fusion) + §5 (HN-1..HN-7) + §3(L2 divergence) + §12 (reuse file:line)",
      "generic_mandate": "REUSE-FIRST (§C2 — do NOT rebuild LIVE tools): get_foreign_flow, get_market_foreign_flow, get_foreign_accum_rank, get_foreign_room, get_carry_trade_signal, get_credit_flow_signal, get_macro_snapshot, get_volatility_indicators + daily_ohlcv.put_through_vol column + the 4 new T1 oscillators. Emit the §4 output schema per ticker/market {score|null, delta_5d|null, divergence{flag,severity,detectors,null_reason?}, coverage_pct, source_tier, is_estimate, null_reason|null, components}. Fusion = coverage-gated tier-weighted mean over NON-NULL components only (T1=1.0,T2=0.9,T3=0.7,T4=0.3). Divergence detectors: D1 index-vs-breadth (get_breadth_thrust), D2 price-vs-OBV, D3 Phase-0 form crowd-vs-foreign (get_market_foreign_flow + foreign_accum_z_market<0), D4 unconfirmed breakout (new high + rel-vol z<0); a detector fires ONLY when BOTH axes non-null over the same window, else flag=UNKNOWN + null_reason (HN-4). Honest-NULL NON-NEGOTIABLE: HN-1 never zero-fill null components (exclude from mean); HN-2 coverage_pct<0.5 → score=null + null_reason lists missing inputs; HN-3 credit-flow is_estimate=true → excluded/hard-down-weighted (DEFAULT_RE_CREDIT_TRILLION defaults NEVER enter as real); HN-4 divergence UNKNOWN-not-GREEN on null axis; HN-5 degraded VWAP is_proxy=true; HN-6 frontend null contract; HN-7 source_tier=min contributing tier (honest floor). All reuse tools reached via mcp gateway call_tool where cross-service.",
      "acceptance": "get_money_radar_composite (no ticker arg) returns a REAL non-null score on live data with foreign accum z, OBV slope, rel-vol z, and volatility regime all contributing non-null; coverage_pct<0.5 path returns score=null + null_reason (NOT a zero-fill). D2 fires on a real historical example (index up + OBV slope negative → flag=AMBER, detectors=[\"D2\"]). A null divergence axis yields flag=UNKNOWN (never GREEN). credit-flow is_estimate=true is excluded/down-weighted, never fed as real. source_tier = min contributing tier.",
      "verification_gate": "qa RAW-calls the tool on live data: asserts real non-null composite + honest coverage-gated null path + D2 AMBER on the real historical example + UNKNOWN-not-GREEN on a null axis + HN-3 credit-estimate exclusion + source_tier honest floor. No fabricated number on a thin-data path.",
      "note": "Aggregation heart of MONEY-RADAR-P0. Depends T1 (needs the 4 oscillators). Reuse-first — the ONE genuinely new crawl (tự doanh) is Phase 1, out of scope."
    }] end )

# ── M3 : T3 dashboard route -> backlog[] (depends T2) ──────────────────────────
| ( if (board_ids | index("MONEY-RADAR-P0-T3-DASHBOARD")) then .
    else .task_board.backlog += [{
      "id": "MONEY-RADAR-P0-T3-DASHBOARD",
      "title": "dev-frontend: apps/frontend/app/routes/dashboard.money-radar.tsx — mirror dashboard.momentum.tsx; 4 GaugeCards (§8); honest-NULL render ('—' + gray FreshnessBadge + null_reason).",
      "owner": "developer",
      "next_agent": "developer",
      "status": "BACKLOG",
      "zone": "dev-frontend",
      "type": "FEATURE",
      "size": "S",
      "priority": "high",
      "sprint": "MONEY-RADAR-P0",
      "depends": ["MONEY-RADAR-P0-T2-COMPOSITE"],
      "created_at": $now,
      "files": ["apps/frontend/app/routes/dashboard.money-radar.tsx (new)", "apps/frontend/app/routes/dashboard.momentum.tsx (template, mirror exactly)", "apps/frontend/app/components/GaugeCard.tsx", "apps/frontend/app/components/FreshnessBadge.tsx"],
      "spec_ref": "docs/architecture-briefs/2026-07-01-money-radar.md §11.3 + §8 (card spec) + §5 HN-6 (null contract)",
      "generic_mandate": "Mirror dashboard.momentum.tsx structure EXACTLY: PageHeader (title='Radar Dòng Tiền', subtitle='Tổng hợp dòng vốn thị trường') + FreshnessBadge(dataAsof=generated_at, slaTierKey='daily') in actions; grid 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'; 4 GaugeCards per §8: [Dòng Tiền ← score.toFixed(2) | MẠNH/YẾU/TRUNG TÍNH], [Dòng Vốn Ngoại ← foreign_accum_z_market.toFixed(2) | GOM HÀNG/XÃ HÀNG], [Khối Lượng Nội Địa ← rel_vol_z_20.toFixed(2) | CAO/THẤP], [Tín Hiệu Phân Kỳ ← divergence.flag | PHÂN KỲ/KHÔNG RÕ]. HN-6 null contract NON-NEGOTIABLE: null scalar renders '—' + FreshnessBadge{label:'Chưa có dữ liệu',color:'gray'} + nullReason from composite null_reason — NEVER a fabricated number. FreshnessBadge SLA 'daily' (maxStalenessMin=1560). NO diacritics in CSS class names; Vietnamese only in displayed strings.",
      "acceptance": "Route /dashboard/money-radar loads without error; loader reads the composite; non-null card shows formatted score + colored badge; null card shows '—' + gray badge + 'Chưa có dữ liệu' + null_reason (per HN-6); 4 GaugeCards present per §8. No diacritics in class names.",
      "verification_gate": "qa RAW-loads the route: asserts non-null render + honest-NULL render ('—'/gray/reason) + 4 cards + FreshnessBadge 'daily' + no CSS-class diacritics; confirms it mirrors dashboard.momentum.tsx and does not regress the momentum route.",
      "note": "Consumer surface. Depends T2 (needs the composite tool). Radar cards render non-null (depth-independent) while momentum cards honest-NULL — that contrast VALIDATES the architecture (§10), do NOT homogenize."
    }] end )

# ── M4 : T4 qa gate -> backlog[] (depends T1+T2+T3) ────────────────────────────
| ( if (board_ids | index("MONEY-RADAR-P0-T4-QA-GATE")) then .
    else .task_board.backlog += [{
      "id": "MONEY-RADAR-P0-T4-QA-GATE",
      "title": "qa gate: verify MONEY-RADAR-P0 Phase-0 DoD (§6) — composite returns real non-null on live data; D2 fires on a real historical example (index up + OBV slope negative → AMBER); dashboard renders with honest-NULL; NO momentum regression.",
      "owner": "qa",
      "next_agent": "qa",
      "status": "BACKLOG",
      "zone": "cross-service",
      "type": "QA",
      "size": "S",
      "priority": "high",
      "sprint": "MONEY-RADAR-P0",
      "depends": ["MONEY-RADAR-P0-T1-OSCILLATORS", "MONEY-RADAR-P0-T2-COMPOSITE", "MONEY-RADAR-P0-T3-DASHBOARD"],
      "created_at": $now,
      "files": ["apps/technical-analysis/", "apps/mcp-server/src/interface/mcp/tools/market-data/", "apps/frontend/app/routes/dashboard.money-radar.tsx"],
      "spec_ref": "docs/architecture-briefs/2026-07-01-money-radar.md §6 (Phase-0 DoD, demonstrable no-fabrication)",
      "generic_mandate": "RAW-verify (no relaying sub-agent badges) all four §6 Phase-0 DoD items on LIVE data: (a) get_money_radar_composite (no ticker arg) returns a REAL non-null score with foreign accum z + OBV slope + rel-vol z + volatility regime all contributing non-null; the coverage_pct<0.5 path returns score=null + null_reason (NOT a zero). (b) D2 divergence fires on a real historical example — a session where VN-Index closed up while OBV slope was negative over the preceding 5 sessions → flag=AMBER, detectors=[\"D2\"]. (c) dashboard /dashboard/money-radar loads without error; null card '—' + gray badge + 'Chưa có dữ liệu'; non-null card formatted score + colored badge. (d) momentum cards (all-NULL) parallel with NO regression. Also spot-check honest-NULL: HN-2 coverage gate, HN-4 UNKNOWN-not-GREEN, HN-5 VWAP is_proxy=true.",
      "acceptance": "All four §6 DoD items RAW-verified GREEN on live data + honest-NULL spot-checks pass. No fabricated number anywhere. Momentum route unregressed.",
      "verification_gate": "qa signs off MONEY-RADAR-P0 → sprint_goal[MONEY-RADAR-P0].status=DONE ONLY when all four §6 DoD items pass RAW on live data. Any fabricated/zero-filled value on a thin-data path = REJECT back to the owning task.",
      "note": "Terminal Phase-0 gate. Depends T1+T2+T3. HOLD-gated follow-ons (tự-doanh crawl, sector bucketing, agent wiring, CCATO wiring, Phase 1/2) mint separately AFTER this gate passes."
    }] end )

# ── metadata bump ──────────────────────────────────────────────────────────────
| .task_board._updated_at = $now
| .task_board._updated_by = "po-money-radar-p0-sprint-mint"
| .sprint_goal._updated_at = $now
| .sprint_goal._updated_by = "po-money-radar-p0-sprint-mint"
