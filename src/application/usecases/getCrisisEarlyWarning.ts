/**
 * Get Crisis Early Warning — Task 267
 *
 * Application-layer use case. Assembles the crisis early warning report:
 * 1. Reads recent mention velocity for each watchlist stock
 * 2. Looks for velocity spikes that indicate potential crisis escalation
 * 3. Reads reputation scores and flags those below threshold
 *
 * Returns structured data consumed by the MCP tool.
 *
 * Layer: application/usecases — may import domain/ and infrastructure/.
 */

import type { Database } from "bun:sqlite";
import { getBaseline, getVelocity } from "../../infrastructure/db/mentionVelocityStore.js";
import { getReputation } from "../../infrastructure/db/reputationStore.js";
import type { ReputationScore } from "../../domain/services/reputationScorer.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CrisisIndicator {
  stockCode: string;
  velocityRatio: number;
  mentionCount: number;
  negativeCount: number;
  sourceCount: number;
  hour: string;
}

export interface CrisisEarlyWarningResult {
  crisisIndicators: CrisisIndicator[];
  reputationScores: ReputationScore[];
  generatedAt: string;
}

export interface McpContentItem {
  type: "text";
  text: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Velocity ratio threshold to surface as a crisis indicator */
const VELOCITY_SPIKE_THRESHOLD = 2.0;

/** Reputation score threshold below which stock appears in warnings */
const REPUTATION_WARNING_THRESHOLD = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Main use case
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assemble crisis early warning data for a list of stock codes.
 *
 * @param db         - Active bun:sqlite Database instance
 * @param stockCodes - Stock tickers to check (typically from watchlist)
 * @returns          - CrisisEarlyWarningResult with indicators + reputation
 */
export async function getCrisisEarlyWarning(
  db: Database,
  stockCodes: string[],
): Promise<CrisisEarlyWarningResult> {
  const crisisIndicators: CrisisIndicator[] = [];
  const reputationScores: ReputationScore[] = [];

  // Current hour window
  const currentHour = new Date();
  currentHour.setMinutes(0, 0, 0);
  const hourKey = currentHour.toISOString();

  for (const code of stockCodes) {
    // ── Velocity check ─────────────────────────────────────────────────────
    const velocity = getVelocity(db, code, hourKey);
    if (velocity !== null && velocity.mentionCount > 0) {
      const baseline = getBaseline(db, code, 24);
      const velocityRatio = velocity.mentionCount / baseline;
      if (velocityRatio >= VELOCITY_SPIKE_THRESHOLD) {
        crisisIndicators.push({
          stockCode: code,
          velocityRatio,
          mentionCount: velocity.mentionCount,
          negativeCount: velocity.negativeCount,
          sourceCount: velocity.sourceCount,
          hour: hourKey,
        });
      }
    }

    // ── Reputation check ───────────────────────────────────────────────────
    const rep = getReputation(db, code);
    if (rep !== null && rep.score < REPUTATION_WARNING_THRESHOLD) {
      reputationScores.push(rep);
    }
  }

  // Sort crisis indicators by velocity ratio (highest first)
  crisisIndicators.sort((a, b) => b.velocityRatio - a.velocityRatio);

  return {
    crisisIndicators,
    reputationScores,
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Output formatter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format crisis early warning result into MCP content array.
 *
 * @param result - CrisisEarlyWarningResult from getCrisisEarlyWarning
 * @returns      - MCP content array: [{ type: "text", text: string }]
 */
export function formatCrisisWarningOutput(
  result: Omit<CrisisEarlyWarningResult, "generatedAt">,
): McpContentItem[] {
  const lines: string[] = [];

  lines.push("=== RADAR KHỦNG HOẢNG — Crisis Early Warning ===");
  lines.push(`Thời gian: ${new Date().toISOString()}`);
  lines.push("");

  // Crisis indicators section
  lines.push("--- CHỈ SỐ CẢNH BÁO KHỦNG HOẢNG ---");
  if (result.crisisIndicators.length === 0) {
    lines.push("Không có tín hiệu khủng hoảng nào được phát hiện.");
  } else {
    for (const ind of result.crisisIndicators) {
      lines.push(
        `[CẢNH BÁO] ${ind.stockCode}: velocity ${ind.velocityRatio.toFixed(1)}x baseline | ` +
        `${ind.mentionCount} mentions (${ind.negativeCount} negative) | ` +
        `${ind.sourceCount} nguồn tin | ${ind.hour}`,
      );
    }
  }

  lines.push("");

  // Reputation scores section
  lines.push("--- UY TÍN DOANH NGHIỆP (score < 50) ---");
  if (result.reputationScores.length === 0) {
    lines.push("Tất cả cổ phiếu có điểm uy tín an toàn.");
  } else {
    for (const rep of result.reputationScores) {
      lines.push(
        `[${rep.riskLevel.toUpperCase()}] ${rep.stockCode}: score=${rep.score.toFixed(1)} | ` +
        `xu hướng=${rep.trend}`,
      );
    }
  }

  return [
    {
      type: "text" as const,
      text: lines.join("\n"),
    },
  ];
}
