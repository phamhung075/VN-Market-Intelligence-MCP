/**
 * Agent → Team Classification Map — ST-6 (DEFERRED-TASK-SCHEDULER-MVP)
 *
 * SSOT: docs/references/agent-roster.md + architecture-brief §b (2026-06-29).
 * Classification: COWORK (spawn via cowork-team dispatcher) | DEV (signal via signal_queue)
 *
 * AC-8 SCAR: NEVER a hardcoded `if agent === "market-watcher" return "COWORK"` switch.
 * This is a declarative map (object literal), not a switch. The source of truth is
 * agent-roster.md; this map MUST be updated whenever the roster changes.
 *
 * COWORK agents: Analysis Team agents that run through the cowork-team dispatcher.
 * DEV agents: Dev Team, Microservice Dev, Crawl Pipeline, and Specialized Maintenance agents.
 *
 * Unknown agent id → resolveAgentTeam() returns null → schedule_task returns error (fail-loud).
 */

export type AgentTeam = "COWORK" | "DEV";

/**
 * Static registry derived from docs/references/agent-roster.md (2026-06-29 snapshot).
 * Key = agent id used in scheduling calls. Value = team classification.
 *
 * DO NOT hardcode agent ids in conditional expressions elsewhere in the codebase.
 * Use resolveAgentTeam() for all lookups.
 */
export const AGENT_TEAM_MAP: Record<string, AgentTeam> = {
  // ── Analysis Team (Claude Cowork) ────────────────────────────────────────
  // Source: docs/references/agent-roster.md § Analysis Team
  "unified-agent":    "COWORK",
  "news-scout":       "COWORK",
  "bctc-analyst":     "COWORK",
  "market-watcher":   "COWORK",
  "alert-commander":  "COWORK",
  "digest-predict":   "COWORK",
  "qa-responder":     "COWORK",
  "tran-ngoc-bau":    "COWORK",
  "fb-market-poster": "COWORK",
  // demand-spawnable cowork agents
  "report-analyzer":  "COWORK",
  "market-analyst":   "COWORK",
  // specialist cowork leaf workers
  "refine_bctc_md":   "COWORK",

  // ── Dev Team (Claude Code CLI) ───────────────────────────────────────────
  // Source: docs/references/agent-roster.md § Dev Team
  "po":                       "DEV",
  "ba":                       "DEV",
  "architect":                "DEV",
  "pm":                       "DEV",
  "developer":                "DEV",
  "qa":                       "DEV",
  "fixer":                    "DEV",
  "ops":                      "DEV",
  "system-auditor":           "DEV",
  "code-janitor":             "DEV",
  "agent-father":             "DEV",
  "claude-manager-helper":    "DEV",
  "agents-architect":         "DEV",
  "cowork-refactory-expert":  "DEV",
  "idea-forge":               "DEV",

  // ── Microservice Dev Agents (Claude Code CLI) ────────────────────────────
  // Source: docs/references/agent-roster.md § Microservice Dev Agents
  "dev-mcp-server":           "DEV",
  "dev-api-gateway":          "DEV",
  "dev-stock-price":          "DEV",
  "dev-technical-analysis":   "DEV",
  "dev-macro-indicators":     "DEV",
  "dev-kinh-dich":            "DEV",
  "dev-alert-engine":         "DEV",
  "dev-pdf-extractor":        "DEV",
  "dev-rag-service":          "DEV",
  "dev-frontend":             "DEV",

  // ── Crawl Pipeline Agents ────────────────────────────────────────────────
  // Source: docs/references/agent-roster.md § Crawl Pipeline Agents
  "dev-vps-crawls":           "DEV",
  "dev-mainserver-crawls":    "DEV",
  "dev-news-fetch":           "DEV",
  "ops-vps-fetch":            "DEV",
  "ops-mainserver-fetch":     "DEV",
} as const;

/**
 * Resolve an agent id to its team classification.
 *
 * Returns null if the agent id is not in the registry.
 * Callers (schedule_task) MUST treat null as an error:
 *   → "unknown agent: <agent>" — do NOT insert row, return error to caller.
 *
 * Never silently defaults to DEV (fail-loud per AC-8).
 */
export function resolveAgentTeam(agentId: string): AgentTeam | null {
  return AGENT_TEAM_MAP[agentId] ?? null;
}
