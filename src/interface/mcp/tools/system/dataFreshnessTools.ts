/**
 * Interface Layer — Data Freshness Monitoring Tools
 *
 * MCP tools for detecting SLA breaches on data freshness and formatting alerts.
 * This module wraps the domain service (freshnessSlaChecker.ts) and provides
 * tool implementations for the MCP interface.
 *
 * Task 1282a: RED phase stubs (implementation in task 1282b)
 *
 * @module interface/mcp/tools/system/dataFreshnessTools
 */

import { Database } from "bun:sqlite";
import {
  type SignalSlaConfig,
  type FreshnessSlaCheckOutput,
  type SlaCheckResult,
  type SignalType,
} from "../../../../domain/services/freshnessSlaChecker.js";

/**
 * Detects data freshness SLA breaches by querying signal source timestamps
 * from the database and comparing against configured thresholds.
 *
 * RED phase stub — throws NotImplementedError.
 *
 * @param db Database connection
 * @param config Optional SLA configuration override
 * @returns Object with hasBreach flag, breaches array, and recoveries array
 */
export async function detectDataFreshnessBreach(
  db: Database,
  config?: SignalSlaConfig[],
): Promise<{
  hasBreach: boolean;
  breaches: SlaCheckResult[];
  recoveries: SlaCheckResult[];
}> {
  throw new Error("detectDataFreshnessBreach() not yet implemented (RED phase)");
}

/**
 * Formats a FreshnessSlaCheckOutput into a user-facing alert message (Vietnamese).
 *
 * Returns empty string if no breaches or recoveries.
 * Includes timestamp, signal type, age, severity, and recovery status.
 *
 * RED phase stub — throws NotImplementedError.
 *
 * @param output FreshnessSlaCheckOutput from detectDataFreshnessBreach()
 * @returns Formatted alert string (Vietnamese), or empty string if no issues
 */
export function formatFreshnessAlert(output: FreshnessSlaCheckOutput): string {
  throw new Error("formatFreshnessAlert() not yet implemented (RED phase)");
}
