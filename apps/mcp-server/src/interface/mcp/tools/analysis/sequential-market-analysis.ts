/**
 * Sequential Market Analysis Tool
 * ─────────────────────────────────────────────────────────────────────────
 * Provides step-by-step thinking for complex market analysis tasks:
 * - Causal chain analysis (global → sector → stock)
 * - BCTC deep financial analysis
 * - Multi-signal verification chains
 * - Portfolio risk assessment
 * - Signal hypothesis generation & validation
 *
 * Wraps the Sequential Thinking pattern for market-specific reasoning.
 */

import { z } from "zod";
import { createLogger } from "../../../../infrastructure/logger.js";

const log = createLogger("info");

export const sequentialMarketAnalysisSchema = z.object({
  analysisType: z.enum([
    "causal_chain",
    "bctc_deep_dive",
    "signal_verification",
    "portfolio_risk",
    "hypothesis_test",
  ]).describe("Type of market analysis to perform"),

  thought: z.string().describe("Current analytical thinking step"),

  thoughtNumber: z.number().int().min(1)
    .describe("Current thought step number (1, 2, 3, ...)"),

  totalThoughts: z.number().int().min(1)
    .describe("Estimated total thoughts needed (can adjust up/down)"),

  nextThoughtNeeded: z.boolean()
    .describe("Whether another thinking step is required"),

  context: z.object({
    stocks: z.array(z.string()).optional()
      .describe("Affected stock codes (e.g., ['VCB', 'HPG'])"),

    sectors: z.array(z.string()).optional()
      .describe("Affected sectors (e.g., ['banking', 'steel'])"),

    event: z.string().optional()
      .describe("Catalyst event or headline"),

    dataPoints: z.record(z.any()).optional()
      .describe("Market data snapshot: prices, sentiment, BCTC metrics"),
  }).optional().describe("Context for this analysis"),

  isRevision: z.boolean().optional()
    .describe("Whether this thought revises previous analysis"),

  revisesThought: z.coerce.number().int().optional()
    .describe("Which thought number is being reconsidered"),

  branchFromThought: z.coerce.number().int().optional()
    .describe("Thought number where this analysis branches"),

  branchId: z.string().optional()
    .describe("Branch identifier for alternative scenarios"),

  hypothesis: z.string().optional()
    .describe("Solution hypothesis (generated mid-analysis)"),

  confidence: z.number().min(0).max(1).optional()
    .describe("Confidence in current hypothesis (0-1)"),
});

export type SequentialMarketAnalysisInput = z.infer<typeof sequentialMarketAnalysisSchema>;

export interface AnalysisThought {
  thoughtNumber: number;
  totalEstimate: number;
  content: string;
  isRevision: boolean;
  branchId?: string | undefined;
  timestamp: Date;
}

export interface AnalysisResult {
  analysisType: string;
  thoughts: AnalysisThought[];
  finalHypothesis: string;
  confidence: number;
  affectedStocks: string[];
  affectedSectors: string[];
  recommendations: string[];
}

/**
 * Sequential Market Analysis Tool Handler
 * Tracks thinking progression and manages analysis state
 */
export function createSequentialMarketAnalysisTool() {
  const analysisState = new Map<string, AnalysisResult>();

  return {
    schema: sequentialMarketAnalysisSchema,

    description: `Deep market analysis using sequential thinking.

    Use this tool to reason through complex market scenarios step-by-step:
    - Causal chains: trace global events → macro impact → sector impact → stock impact
    - BCTC analysis: examine financial statements, ratios, trends
    - Signal verification: validate multi-source alerts (price, news, insider, BCTC)
    - Portfolio risk: analyze correlations, VaR, concentration, scenario stress-tests
    - Hypothesis testing: propose and verify trading signals

    Key capabilities:
    - Revise previous thoughts as understanding deepens
    - Branch into alternative scenarios (bull/bear/base cases)
    - Adjust estimated total thoughts dynamically
    - Build on prior steps while filtering noise
    - Generate falsifiable hypotheses with confidence scores

    When you reach your estimated total thoughts but realize you need more analysis,
    set nextThoughtNeeded=true and needsMoreThoughts=true to continue.`,

    async handle(input: SequentialMarketAnalysisInput): Promise<{
      status: "thinking" | "complete";
      thought: AnalysisThought;
      progress: string;
      nextSteps: string[] | undefined;
    }> {
      const sessionId = `${input.analysisType}:${Date.now()}`;

      log.info(`Sequential analysis [${input.analysisType}] step ${input.thoughtNumber}/${input.totalThoughts}`);

      // Create thought record
      const thought: AnalysisThought = {
        thoughtNumber: input.thoughtNumber,
        totalEstimate: input.totalThoughts,
        content: input.thought,
        isRevision: input.isRevision ?? false,
        branchId: input.branchId,
        timestamp: new Date(),
      };

      // Get or create analysis result
      let result = analysisState.get(sessionId);
      if (!result) {
        result = {
          analysisType: input.analysisType,
          thoughts: [],
          finalHypothesis: "",
          confidence: 0,
          affectedStocks: input.context?.stocks ?? [],
          affectedSectors: input.context?.sectors ?? [],
          recommendations: [],
        };
        analysisState.set(sessionId, result);
      }

      // Handle revisions: remove revisited thought and subsequent thoughts
      if (input.isRevision && input.revisesThought !== undefined) {
        result.thoughts = result.thoughts.filter(
          (t) => t.thoughtNumber < input.revisesThought!
        );
      }

      // Add current thought
      result.thoughts.push(thought);

      // Update hypothesis and confidence if provided
      if (input.hypothesis) {
        result.finalHypothesis = input.hypothesis;
        result.confidence = input.confidence ?? 0.5;
      }

      // Determine if analysis is complete
      const isComplete =
        !input.nextThoughtNeeded &&
        input.thoughtNumber >= input.totalThoughts;

      if (isComplete) {
        // Generate recommendations based on analysis
        result.recommendations = generateRecommendations(result);
      }

      const progress = `Analysis progress: ${input.thoughtNumber}/${input.totalThoughts} thoughts${
        input.branchId ? ` (branch: ${input.branchId})` : ""
      }`;

      return {
        status: isComplete ? "complete" : "thinking",
        thought,
        progress,
        nextSteps: isComplete
          ? undefined
          : [
              `Continue with thought ${input.thoughtNumber + 1}`,
              input.isRevision
                ? "Review the revised thinking"
                : "Build on current analysis",
            ],
      };
    },
  };
}

/**
 * Generate actionable recommendations from analysis chain
 */
function generateRecommendations(result: AnalysisResult): string[] {
  const recommendations: string[] = [];

  if (result.confidence >= 0.8) {
    recommendations.push(
      `High confidence hypothesis: ${result.finalHypothesis}`
    );
  } else if (result.confidence >= 0.6) {
    recommendations.push(
      `Moderate confidence: ${result.finalHypothesis} — validate with additional signals`
    );
  } else {
    recommendations.push(
      `Low confidence: ${result.finalHypothesis} — requires more data or analysis`
    );
  }

  if (result.affectedStocks.length > 0) {
    recommendations.push(
      `Monitor affected stocks: ${result.affectedStocks.join(", ")}`
    );
  }

  return recommendations;
}

/**
 * Register sequential_market_analysis tool with MCP server
 */
export async function registerSequentialMarketAnalysisTools(
  server: any
): Promise<void> {
  const tool = createSequentialMarketAnalysisTool();

  server.registerTool("sequential_market_analysis", {
    title: "Sequential Market Analysis",
    description: tool.description,
    inputSchema: tool.schema,
    handler: tool.handle,
  });

  log.info("Sequential Market Analysis tool registered");
}
