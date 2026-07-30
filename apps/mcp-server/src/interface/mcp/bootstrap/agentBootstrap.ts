/**
 * Skill-Gated Tool Bootstrap — Sprint 1299
 *
 * Interface layer only. Imports: ../tools/registry.ts + SDK types.
 * NEVER import from domain/ or infrastructure/.
 *
 * Design:
 *   - SKILL_MANIFEST maps skill name → MCP tool names (string[])
 *   - At module init, probe each registration fn against a mock server
 *     to build toolName → registrationFn map (O(n) once at startup)
 *   - getToolsForSkills() resolves skill → tool names → registration fns
 *     in O(k) where k = tools in skill
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toolRegistry } from "../tools/registry.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ToolRegistryFn = (server: McpServer) => void;

// ─────────────────────────────────────────────────────────────────────────────
// SKILL_MANIFEST — mirrors docs/SKILL_MANIFEST.md JSON block.
// Update both files together whenever a tool is added or a skill changes.
// ─────────────────────────────────────────────────────────────────────────────

const SKILL_MANIFEST: Record<string, string[]> = {
  news_scout: [
    "get_agent_signals",
    "get_market_context",
    "fetch_and_analyze",
    "run_impact_chain",
    "search_similar_context",
    "get_rate_limit_status",
    "post_agent_signal",
    "get_recent_fixes",
    "submit_feedback",
    "get_legal_risk_signals",
    "get_crisis_early_warning",
    "record_evidence_fragment",
    "log_agent_work",
    "get_fed_liquidity_spread",
    "get_ism_subcomponents",
    "get_macro_snapshot",
  ],
  financial_analyst: [
    "get_cycle_bootstrap",
    "get_user_positions_for_analysis",
    "get_earnings_calendar",
    "list_stored_pdfs",
    "get_bctc_full",
    "read_bctc_pdf",
    "get_financial_summary",
    "compare_stocks",
    "get_sentiment_trend",
    "get_sector_comparison",
    "get_kinhdich_reading",
    "post_agent_signal",
    "get_open_chain_findings",
    "get_market_summary",
    "generate_market_summary",
    "get_market_snapshot",
    "get_legal_risk_signals",
    "get_insider_signals",
    "get_insider_transactions",
    "record_evidence_fragment",
    "send_telegram",
    "get_recent_fixes",
    "submit_feedback",
    "log_agent_work",
    "get_cash_flow",
    "get_macro_snapshot",
    "get_bond_maturity_calendar",
    "get_investment_clock_phase",
    "get_bctc_ocf",
    "get_fed_liquidity_spread",
    "get_ism_subcomponents",
  ],
  market_watcher: [
    "get_cycle_bootstrap",
    "get_agent_signals",
    "get_market_context",
    "get_market_snapshot",
    "get_price_history",
    "get_patterns",
    "get_sector_rotation",
    "get_sector_comparison",
    "get_kinhdich_reading",
    "get_market_hexagram",
    "get_supply_chain_exposure",
    "get_alerts",
    "get_positions",
    "get_portfolio_risk",
    "compare_stocks",
    "get_sentiment_trend",
    "get_open_chain_findings",
    "post_agent_signal",
    "manage_alert_mute",
    "get_recent_fixes",
    "submit_feedback",
    "get_energy_grid_signals",
    "get_climate_risk_signals",
    "get_crisis_early_warning",
    "get_foreign_flow",
    "record_evidence_fragment",
    "log_agent_work",
    "get_macro_snapshot",
    "get_technical_indicators",
    "get_ticker_intelligence",
    "send_telegram",
  ],
  alert_commander: [
    "get_cycle_bootstrap",
    "get_agent_signals",
    "get_system_status",
    "get_market_context",
    "get_alerts",
    "mark_alert_read",
    "send_telegram",
    "send_alert_digest",
    "record_signal_outcome",
    "write_alert_verdict",
    "get_alert_accuracy",
    "manage_alert_mute",
    "list_alert_rules",
    "post_agent_signal",
    "get_recent_fixes",
    "submit_feedback",
    "delete_price_alert",
    "get_kinhdich_reading",
    "get_legal_risk_signals",
    "get_crisis_early_warning",
    "get_cron_health",
    "get_macro_snapshot",
    "get_market_snapshot",
  ],
  digest_predict: [
    "get_cycle_bootstrap",
    "get_user_positions_for_analysis",
    "get_watchlist",
    "get_evidence_summary",
    "get_calibration_report",
    "create_prediction_claim",
    "get_market_summary",
    "generate_market_summary",
    "get_bctc_full",
    "compare_financials",
    "get_macro_snapshot",
    "get_portfolio_conviction",
    "get_correlation_matrix",
    "get_alert_accuracy",
    "get_performance_attribution",
    "get_portfolio_risk",
    "get_rebalancing_signals",
    "get_sector_rotation",
    "get_sector_comparison",
    "get_earnings_calendar",
    "get_signal_effectiveness",
    "get_cascade_metrics",
    "get_prediction_accuracy",
    "get_supply_chain_exposure",
    "get_kinhdich_reading",
    "get_market_hexagram",
    "run_hexagram_backtest",
    "get_transition_probabilities",
    "explain_hexagram",
    "get_hexagram_history",
    "get_open_chain_findings",
    "get_market_snapshot",
    "send_telegram",
    "get_recent_fixes",
    "submit_feedback",
    "get_legal_risk_signals",
    "get_policy_signals",
    "get_bond_maturity_calendar",
    "get_public_contracts",
    "get_credit_flow_signal",
    "get_insider_signals",
    "get_climate_risk_signals",
    "get_energy_grid_signals",
    "get_crisis_early_warning",
    "get_pharma_signals",
    "get_foreign_flow",
    "log_agent_work",
    "post_agent_signal",
    "get_agent_signals",
  ],
  dev_team: [
    "read_telegram_reports",
    "claim_telegram_report",
    "process_telegram_report",
    "log_fix",
    "get_recent_fixes",
    "send_telegram",
    "get_system_status",
    "get_vps_proxy_health",
    "get_cron_health",
    // DEFERRED-TASK-SCHEDULER-MVP: public scheduler tools
    "schedule_task",
    "cancel_scheduled_task",
    "list_scheduled_tasks",
  ],
  qa_responder: [
    "get_pending_ask_questions",
    "answer_ask_question",
    "run_qa_responder",
    "fetch_and_analyze",
    "get_market_context",
    "get_positions",
    "get_kinhdich_reading",
    "get_market_hexagram",
    "get_bctc_full",
    "get_sentiment_trend",
    "get_legal_risk_signals",
    "send_telegram",
    "get_foreign_flow",
    "get_insider_transactions",
  ],
  report_analyzer: [
    "get_cycle_bootstrap",
    "get_earnings_calendar",
    "get_bctc_full",
    "list_stored_pdfs",
    "compare_stocks",
    "compare_financials",
    "get_sector_comparison",
    "get_watchlist",
    "post_agent_signal",
    "log_agent_work",
    "send_telegram",
    "submit_feedback",
    "get_recent_fixes",
  ],
  unified_coordinator: [
    "get_agent_signals",
    "get_system_status",
    "get_market_context",
    "get_macro_snapshot",
    "get_alerts",
    "get_sentiment_trend",
    "get_positions",
    "get_portfolio_conviction",
    "get_portfolio_risk",
    "get_correlation_matrix",
    "get_rebalancing_signals",
    "get_performance_attribution",
    "get_alert_accuracy",
    "get_signal_effectiveness",
    "get_cascade_metrics",
    "get_prediction_accuracy",
    "get_supply_chain_exposure",
    "get_open_chain_findings",
    "claim_telegram_report",
    "read_telegram_reports",
    "process_telegram_report",
    "submit_feedback",
    "get_recent_fixes",
    "send_telegram",
    "get_legal_risk_signals",
    "get_policy_signals",
    "get_bond_maturity_calendar",
    "get_public_contracts",
    "get_credit_flow_signal",
    "get_insider_signals",
    "get_climate_risk_signals",
    "get_energy_grid_signals",
    "get_crisis_early_warning",
    "get_pharma_signals",
    "get_cron_health",
    "get_agent_work_log",
    "get_calibration_report",
    "get_foreign_flow",
    "get_insider_transactions",
    "get_fed_liquidity_spread",
    "get_ism_subcomponents",
    // DEFERRED-TASK-SCHEDULER-MVP: public scheduler tools
    "schedule_task",
    "cancel_scheduled_task",
    "list_scheduled_tasks",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Always-on tools — injected regardless of skill
// ─────────────────────────────────────────────────────────────────────────────

const ALWAYS_ON_TOOLS: string[] = [
  "get_cycle_bootstrap",
  "submit_feedback",
  "get_recent_fixes",
  "log_agent_work",
  "send_telegram",
  "post_agent_signal",
  "get_agent_signals",
];

export const ALWAYS_ON_TOOL_COUNT = ALWAYS_ON_TOOLS.length; // 7

// ─────────────────────────────────────────────────────────────────────────────
// Probe: build toolName → registryFn map at module load (O(n) once)
//
// Strategy: run each registryFn against a minimal fake McpServer that
// intercepts server.tool() calls and records the tool name.
// This stays 100% in the interface layer — no domain/infra imports needed.
// ─────────────────────────────────────────────────────────────────────────────

function buildToolNameMap(): Map<string, ToolRegistryFn> {
  const map = new Map<string, ToolRegistryFn>();

  for (const registryFn of toolRegistry) {
    // Probe server: records which tool names this fn registers
    const registeredNames: string[] = [];
    const probeFakeServer = {
      // Standard MCP SDK method (used by most tools)
      tool(name: string, _description: string, _schema: unknown, _handler?: unknown) {
        registeredNames.push(name);
      },
      // Legacy registerTool method (used by sequential-market-analysis)
      registerTool(name: string, _opts: unknown) {
        registeredNames.push(name);
      },
    } as unknown as McpServer;

    try {
      // Call fn synchronously — async fns execute synchronously up to first await,
      // which is after server.registerTool/tool() calls in all current tools.
      // Ignore returned promise (no await needed for probe purposes).
      void registryFn(probeFakeServer);
    } catch {
      // If registration throws synchronously (e.g. side effects), skip silently
    }

    for (const toolName of registeredNames) {
      // First registration wins (no overwrites).
      // Warn on collision: two registryFns claiming the same tool name would
      // mean the second fn's registration would be ignored by this map, AND
      // the real McpServer would throw "Tool X is already registered" at startup.
      if (!map.has(toolName)) {
        map.set(toolName, registryFn);
      } else if (map.get(toolName) !== registryFn) {
        console.warn(
          `[agentBootstrap] buildToolNameMap: duplicate tool name "${toolName}" ` +
            "detected across two different registryFns. First registration wins here; " +
            "real McpServer will throw at startup. Fix: ensure each tool name is unique."
        );
      }
    }
  }

  return map;
}

// Built once at module load — O(1) per lookup after this
const toolNameMap: Map<string, ToolRegistryFn> = buildToolNameMap();

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the registration functions for the given skill names.
 *
 * Rules:
 *   - Empty skills → always-on tools only (7 fns)
 *   - All skills unknown → warn + return full toolRegistry
 *   - Any skill unknown → warn, continue with known skills
 *   - Always-on tools injected into every non-empty result
 *   - Deduplication: each registryFn appears at most once
 */
export function getToolsForSkills(skills: string[]): ToolRegistryFn[] {
  // Empty skills → always-on only
  if (skills.length === 0) {
    return resolveToolNames(ALWAYS_ON_TOOLS);
  }

  // Partition skills into known / unknown
  const knownSkills: string[] = [];
  const unknownSkills: string[] = [];
  for (const skill of skills) {
    if (skill in SKILL_MANIFEST) {
      knownSkills.push(skill);
    } else {
      unknownSkills.push(skill);
    }
  }

  // Warn on unknown skills
  if (unknownSkills.length > 0) {
    console.warn(
      `[agentBootstrap] Unknown skills: ${unknownSkills.join(", ")}. ` +
        (knownSkills.length === 0 ? "Falling back to full toolRegistry." : "Continuing with known skills.")
    );
  }

  // All unknown → full toolRegistry fallback
  if (knownSkills.length === 0) {
    return [...toolRegistry];
  }

  // Collect all tool names from known skills + always-on
  const toolNames = new Set<string>(ALWAYS_ON_TOOLS);
  for (const skill of knownSkills) {
    const names = SKILL_MANIFEST[skill];
    if (names) {
      for (const name of names) {
        toolNames.add(name);
      }
    }
  }

  return resolveToolNames([...toolNames]);
}

/**
 * Resolve tool names → registration functions.
 * Deduplicates: if two tool names map to same registryFn (1 fn registers N tools),
 * the fn appears only once.
 *
 * Warn (not throw) when a name from the SKILL_MANIFEST has no entry in toolNameMap.
 * This means the skill references a tool that was never registered in the toolRegistry —
 * a configuration drift that would cause the tool to be silently absent from
 * skill-gated sessions (symptom: "tool not found" in agent logs).
 */
function resolveToolNames(toolNames: string[]): ToolRegistryFn[] {
  const seen = new Set<ToolRegistryFn>();
  const result: ToolRegistryFn[] = [];

  for (const name of toolNames) {
    const fn = toolNameMap.get(name);
    if (fn && !seen.has(fn)) {
      seen.add(fn);
      result.push(fn);
    } else if (!fn) {
      console.warn(
        `[agentBootstrap] resolveToolNames: tool "${name}" not found in toolNameMap — ` +
          "check that the tool is registered in toolRegistry. " +
          "Skill-gated sessions will not receive this tool."
      );
    }
  }

  return result;
}
