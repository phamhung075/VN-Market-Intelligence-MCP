# po-vn-macro-tooling-sprint-open.jq
# Opens the VN-MACRO-TOOLING sprint (07-06 roundtable methodology gap, PO tools+data lane).
# Idempotent: skips if sprint id already present in active_sprints[]; appends sprint_goal entry
# only if sprint_id absent. Atomic write contract enforced by caller (temp -> [ -s ] -> jq empty -> rename).
# Usage: jq --arg now "$NOW" -f scripts/po-vn-macro-tooling-sprint-open.jq docs/data/orch/orch-state.json
#
# Source brief: docs/analysis-briefs/07-06-methodology-gap.md
#   (## New MCP tools requested (ranked by leverage) + bonus EXTEND)
# Lane: PO scopes tools+data dev pipeline. agents-architect owns the 2 cowork skills in parallel.

def sprint_id: "VN-MACRO-TOOLING";

def sprint_obj($now):
{
  id: sprint_id,
  label: "VN macro data tooling — 5 new MCP tools (trade-balance, BOP, macro-indicators, CPI-components, liquidity-state) + 1 EXTEND (credit-flow/VIRA-VARA real distribution), from the 07-06 expert-roundtable methodology extraction. PO tools+data lane; agents-architect builds the 2 consuming cowork skills (macro-health-read, trade-fx-pressure-decomp) in parallel in DEGRADED mode until these land.",
  opened_at: ($now | sub("T.*";"")),
  opened_by: "po",
  priority: "high",
  status: "PLANNING",
  brief: "docs/analysis-briefs/07-06-methodology-gap.md",
  next_gate: "BA — decompose to docs/REQ_VN-MACRO-TOOLING.md (input/output contract per tool, geo-block routing, acceptance criteria incl. skill-switch-on schema), then PO spec review.",
  acceptance_global: [
    "Honour project_bctc_vps_proxy: ALL VN geo-blocked sources (GSO/Customs/SBV) fetched via Vinahost VPS — never direct.",
    "Every tool reachable ONLY through the claude.ai gateway call_tool wrapper (server=vn-market); registered, discoverable via list_server_tools/search_tools.",
    "SCHEMA-CONTRACT (skill switch-on): each tool exposes a clean, stable output schema so cowork skills macro-health-read + trade-fx-pressure-decomp can flip is_estimate=true (degraded) -> live without code change. Schema fields named in the brief are load-bearing.",
    "Per-series is_estimate flag honest (no static-seed masquerading as live); follow reference_low_confidence_handling.",
    "Direction+delta not point-in-time where applicable (feedback_market_data_direction); transforms (ma3/ma5/yoy/ytd_cumulative) pre-computed server-side, not agent-side math."
  ],
  tasks: [
    {
      id: "VMT-1-TRADE-BALANCE",
      title: "#1 get_vn_trade_balance — HS-group + FDI/domestic-bloc split + processing-margin (export/import) ratio; per-country import; multi-year margin series. HIGHEST leverage (T-33/34/35/36; both new skills).",
      type: "FEATURE",
      priority: "high",
      size: "L",
      status: "TODO",
      zone: "multi",
      owner: "dev-macro-indicators",
      co_owners: ["dev-vps-crawls"],
      depends: [],
      data_source: "GSO / Tong cuc Hai quan monthly trade stats — geo-blocked -> Vinahost VPS.",
      io_contract: "in {period:'YYYY-MM'|'YTD', group_by:'bloc'|'hs_group'|'country', lookback_months?}; out total exp/imp/balance + FDI-bloc vs domestic-bloc split + per-HS {export,import,net,processing_margin} + per-country import + multi-year margin series + is_estimate.",
      skill_consumer: "trade-fx-pressure-decomp (primary), macro-health-read"
    },
    {
      id: "VMT-2-BOP",
      title: "#2 get_vn_bop — balance-of-payments lines (current/financial acct + E&O) with sign + derived offshore_parked_estimate (E&O proxy) + fx_swing_line (largest negative financial-acct component). (T-38/39/40).",
      type: "FEATURE",
      priority: "high",
      size: "L",
      status: "TODO",
      zone: "multi",
      owner: "dev-macro-indicators",
      co_owners: ["dev-vps-crawls"],
      depends: [],
      data_source: "SBV quarterly BOP; cross-check IMF via existing get_imf_signals — geo-blocked -> VPS.",
      io_contract: "in {period, components?:[current_account,trade_goods,services,income,transfers,fdi_net,portfolio_net,other_investment_net,errors_omissions,overall_balance]}; out each line + sign + offshore_parked_estimate + fx_swing_line + is_estimate.",
      skill_consumer: "trade-fx-pressure-decomp (FX-incidence test), unified-agent/CHEF BOP walk"
    },
    {
      id: "VMT-3-MACRO-INDICATORS",
      title: "#3 get_vn_macro_indicators — pmi/iip/retail(nominal+real)/public_investment/fdi(registered+disbursed) with transform pre-computed (raw|ma3|ma5|yoy|ytd_cumulative); per-series is_estimate. (T-16/17/18/24/25).",
      type: "FEATURE",
      priority: "high",
      size: "L",
      status: "TODO",
      zone: "multi",
      owner: "dev-macro-indicators",
      co_owners: ["dev-vps-crawls", "dev-mainserver-crawls"],
      depends: [],
      data_source: "GSO monthly socio-economic report (VPS) + S&P Global VN PMI press page (main-server fetch).",
      io_contract: "in {indicators:[pmi,iip,retail_sales_nominal,retail_sales_real,public_investment,fdi_registered,fdi_disbursed], transform?:'raw'|'ma3'|'ma5'|'yoy'|'ytd_cumulative'}; out each series with transform pre-computed + is_estimate. real = nominal stripped of CPI (T-18).",
      skill_consumer: "macro-health-read (production/consumption/investment tracks)"
    },
    {
      id: "VMT-4-CPI-COMPONENTS",
      title: "#4 get_cpi_components — 11 CPI baskets with weight + contribution (transport ~20%, housing/construction-materials, food, admin-priced edu/health) + derived cpi_peaked boolean (T-21 momentum of heaviest movers). (T-22; supports T-20/21/43).",
      type: "FEATURE",
      priority: "medium",
      size: "M",
      status: "TODO",
      zone: "multi",
      owner: "dev-macro-indicators",
      co_owners: ["dev-vps-crawls"],
      depends: [],
      data_source: "GSO CPI release — geo-blocked -> VPS.",
      io_contract: "in {period, basis:'yoy'|'mom', weights?:bool}; out 11 baskets {weight, contribution, admin_priced?} + derived cpi_peaked + is_estimate.",
      skill_consumer: "macro-health-read (inflation track), market-watcher CPI peak-detection"
    },
    {
      id: "VMT-5-LIQUIDITY-STATE",
      title: "#5 get_vn_liquidity_state — interbank 1w rate + OMO outstanding (+delta vs peak) + refi/OMO floor + IRS + SJC-vs-world-gold gap (T-27) + CNY/DXY cross (T-28). (T-29/30; supports T-23/27/28).",
      type: "FEATURE",
      priority: "medium",
      size: "M",
      status: "TODO",
      zone: "multi",
      owner: "dev-macro-indicators",
      co_owners: ["dev-vps-crawls", "dev-mainserver-crawls"],
      depends: [],
      data_source: "SBV OMO + interbank fixings (VPS); SJC gold existing crawler (only gap-vs-world is new math); CNY/DXY main-server FX fetch.",
      io_contract: "in {} (latest) | {period}; out interbank_1w + omo_outstanding{value,delta_vs_peak} + refi_floor + irs + sjc_world_gold_gap + cny_dxy_cross + is_estimate.",
      skill_consumer: "macro-health-read (fx/liquidity), trade-fx-pressure-decomp"
    },
    {
      id: "VMT-6-CREDIT-FLOW-EXTEND",
      title: "EXTEND get_credit_flow_signal / VIRA-VARA survey path — return real {mean, dispersion, hawk/dove outliers} distribution instead of static-seed. Low-cost, no new crawl. (T-23 bank-survey consensus cross-check).",
      type: "ENHANCEMENT",
      priority: "medium",
      size: "M",
      status: "TODO",
      zone: "apps/mcp-server/src/interface/mcp/tools/sector/",
      owner: "dev-mcp-server",
      co_owners: ["dev-macro-indicators"],
      depends: [],
      data_source: "Existing VIRA/VARA survey path (creditFlowTools.ts + schema-macro.ts) — replace static_seed with real survey distribution.",
      io_contract: "out existing signal + survey_distribution {mean, dispersion, hawk_outliers[], dove_outliers[]}; remove static-seed masquerade, set is_estimate honestly.",
      skill_consumer: "digest-predict (VIRA/VARA consensus cross-check)"
    },
    {
      id: "VMT-7-REGISTER",
      title: "Tool registration + gateway-surface orchestration — register get_vn_trade_balance / get_vn_bop / get_vn_macro_indicators / get_cpi_components / get_vn_liquidity_state in mcp-server; verify each reachable via call_tool wrapper (list_server_tools/search_tools); registry parity test.",
      type: "INFRASTRUCTURE",
      priority: "high",
      size: "M",
      status: "TODO",
      zone: "apps/mcp-server/src/interface/mcp/",
      owner: "dev-mcp-server",
      co_owners: [],
      depends: ["VMT-1-TRADE-BALANCE","VMT-2-BOP","VMT-3-MACRO-INDICATORS","VMT-4-CPI-COMPONENTS","VMT-5-LIQUIDITY-STATE"],
      data_source: "n/a — orchestration/registration.",
      io_contract: "Each new tool discoverable + invocable via gateway; SCHEMA-CONTRACT acceptance verified LIVE (call_tool returns the schema the skills switch onto). Run-last gate, mirrors TOOL-SURFACE-UPGRADE U2-PARITY.",
      skill_consumer: "all (enables skill switch-on)"
    }
  ]
};

# --- mutate ---
. as $root
| ($now) as $now
| ($root.task_board.active_sprints // []) as $act
| if ($act | map(.id) | index(sprint_id)) then
    .   # idempotent: sprint already open, no-op
  else
    .task_board.active_sprints += [ sprint_obj($now) ]
    | .sprint_goal.entries = (
        (.sprint_goal.entries // [])
        | if (map(.sprint_id) | index(sprint_id)) then .
          else . + [{
            created_at: $now,
            sprint_id: sprint_id,
            status: "PLANNING",
            vision: "Build 5 new VN macro MCP tools + 1 credit-flow EXTEND from the 07-06 roundtable methodology gap, in leverage order (trade-balance first). VN geo-blocked sources via Vinahost VPS; all tools reachable only via the call_tool gateway. DoD: each tool LIVE through gateway with the clean schema the cowork skills (macro-health-read, trade-fx-pressure-decomp) switch from DEGRADED is_estimate onto. Next: BA REQ + PO spec review."
          }]
          end
      )
    | .task_board.head = "VN-MACRO-TOOLING sprint opened (PLANNING) — 7 tasks, BA spec gate next"
    | .task_board._updated_at = $now
    | .task_board._updated_by = "po"
  end
