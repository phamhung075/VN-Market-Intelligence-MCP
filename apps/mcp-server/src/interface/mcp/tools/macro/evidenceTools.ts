/**
 * Task 1117 — record_evidence_fragment MCP Tool
 * Task 1124 — get_evidence_summary + create_prediction_claim MCP Tools
 *
 * Provides MCP tools for the prediction engine:
 *   - record_evidence_fragment: write directional evidence fragments (Phase A, Sprint 057)
 *   - get_evidence_summary: read current evidence picture for a stock (Phase B, Sprint 059)
 *   - create_prediction_claim: insert a structured prediction claim (Phase B, Sprint 059)
 *
 * Usage by analysis agents:
 *   - News Scout (01): news_sentiment_macro, news_sentiment_stock
 *   - BCTC Collector (03): bctc_revenue_growth, bctc_pe_ratio, bctc_debt_equity
 *   - Market Watcher (04): price_momentum_5d, price_momentum_20d
 *   - Alert Commander (05): aggregated signals
 *   - Any agent: kinh_dich_signal
 *   - Prediction Synthesizer (08): get_evidence_summary, create_prediction_claim
 *
 * @module interface/mcp/tools/evidenceTools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { z } from "zod";
import {
  insertEvidenceFragment,
  getLatestEvidenceScore,
} from "../../../../infrastructure/db/evidenceFragmentStore.js";
import {
  getLikelihoodRatio,
  getLikelihoodRatios,
} from "../../../../infrastructure/db/likelihoodRatioStore.js";
import {
  insertPredictionClaim,
  type ClaimDirection,
} from "../../../../infrastructure/db/predictionClaimStore.js";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { isVnTradingDay } from "../../../../domain/services/vnTradingCalendar.js";

/**
 * Advance `startDate` by exactly `tradingDays` VN trading days, skipping
 * weekends and VN public holidays. The result always lands on a trading day.
 *
 * Used by create_prediction_claim so that resolution_date is always a bar-date
 * that exists in daily_ohlcv (PROD-RESOLVER-GAP-FIX — calendar-vs-trading-day).
 *
 * @param startDate    - ISO date YYYY-MM-DD (the creation date, typically today)
 * @param tradingDays  - Number of trading days to advance (must be > 0)
 * @returns ISO date YYYY-MM-DD of the landing trading day
 */
export function addTradingDays(startDate: string, tradingDays: number): string {
  let remaining = tradingDays;
  const current = new Date(startDate + "T00:00:00Z");

  while (remaining > 0) {
    current.setUTCDate(current.getUTCDate() + 1);
    const dateStr = current.toISOString().slice(0, 10);
    if (isVnTradingDay(dateStr).is_trading_day) {
      remaining--;
    }
  }
  return current.toISOString().slice(0, 10);
}

/**
 * Register the evidence fragment tool on an McpServer instance.
 *
 * @param server - The McpServer instance to register tools on
 * @param db     - Optional database injection (defaults to getDb() for production)
 */
export function registerEvidenceTools(
  server: McpServer,
  db?: Database,
): void {
  const resolveDb = () => db ?? getDb();

  // ── record_evidence_fragment ──────────────────────────────────────────────
  server.tool(
    "record_evidence_fragment",
    "Store a directional evidence fragment for a stock from an analysis agent. " +
      "Called by News Scout, BCTC Collector, Market Watcher, Alert Commander, and other agents " +
      "to accumulate bullish/bearish/neutral evidence per stock. " +
      "The nightly evidence accumulator aggregates these into evidence_scores. " +
      "evidence_type examples: news_sentiment_macro, news_sentiment_stock, bctc_revenue_growth, " +
      "bctc_pe_ratio, bctc_debt_equity, price_momentum_5d, price_momentum_20d, kinh_dich_signal.",
    {
      stock: z
        .string()
        .min(1)
        .describe("Stock ticker, e.g. 'VCB'"),
      evidence_type: z
        .string()
        .min(1)
        .describe(
          "Type of evidence. Examples: news_sentiment_macro, news_sentiment_stock, " +
          "bctc_revenue_growth, bctc_pe_ratio, bctc_debt_equity, " +
          "price_momentum_5d, price_momentum_20d, kinh_dich_signal",
        ),
      direction: z
        .enum(["bullish", "bearish", "neutral"])
        .describe("Direction of the evidence signal"),
      magnitude: z
        .number()
        .min(0)
        .max(1)
        .describe("Strength of the evidence: 0.0 (weak) to 1.0 (strong)"),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .describe("Confidence in this evidence: 0.0 to 1.0"),
      source_agent: z
        .string()
        .min(1)
        .describe("Agent producing this fragment, e.g. '04-market-watcher'"),
      ttl_days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .optional()
        .describe("Days before this fragment expires. Default: 30"),
    },
    async ({
      stock,
      evidence_type,
      direction,
      magnitude,
      confidence,
      source_agent,
      ttl_days,
    }) => {
      try {
        const database = resolveDb();
        const id = insertEvidenceFragment(database, {
          stock: stock.toUpperCase().trim(),
          evidence_type,
          direction,
          magnitude,
          confidence,
          source_agent,
          ttl_days: ttl_days ?? 30,
        });

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Fragment recorded: id=${id}\n` +
                `Stock: ${stock.toUpperCase().trim()}\n` +
                `Type: ${evidence_type}\n` +
                `Direction: ${direction} (magnitude=${magnitude.toFixed(2)}, confidence=${confidence.toFixed(2)})\n` +
                `Agent: ${source_agent}\n` +
                `TTL: ${ttl_days ?? 30} days`,
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error recording evidence fragment: ${msg}`,
            },
          ],
        };
      }
    },
  );

  // ── get_evidence_summary ──────────────────────────────────────────────────
  server.tool(
    "get_evidence_summary",
    "Returns the current evidence picture for a single stock: latest evidence scores, " +
      "top 5 contributing fragments by magnitude*confidence, and applicable likelihood ratios " +
      "from evidence_likelihood_ratios for the bullish direction at 10-day horizon. " +
      "If no evidence has been accumulated yet for the stock, returns a clear message. " +
      "Data is at most 23 hours stale (sourced from nightly evidence_scores aggregate).",
    {
      stock: z.string().min(1).describe("Stock ticker, e.g. 'VNM'"),
    },
    async ({ stock }) => {
      try {
        const database = resolveDb();
        const ticker = stock.toUpperCase().trim();

        // Step 1: get latest evidence score
        const scoreRow = getLatestEvidenceScore(database, ticker);
        if (!scoreRow) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No evidence accumulated yet for ${ticker}`,
              },
            ],
          };
        }

        // Step 2: top 5 fragments by magnitude*confidence DESC
        interface FragmentRow {
          id: number;
          evidence_type: string;
          direction: string;
          magnitude: number;
          confidence: number;
          timestamp: string;
          source_agent: string;
        }
        const fragments = database
          .prepare(
            `SELECT id, evidence_type, direction, magnitude, confidence, timestamp, source_agent
             FROM evidence_fragments
             WHERE stock = ?
             ORDER BY (magnitude * confidence) DESC
             LIMIT 5`,
          )
          .all(ticker) as FragmentRow[];

        // Step 3+4: for each top fragment, get likelihood ratio + trust label
        interface FragmentWithRatio {
          evidence_type: string;
          direction: string;
          magnitude: number;
          confidence: number;
          likelihoodRatio: number;
          trusted: boolean;
          sampleSize: number;
        }

        const fragmentsWithRatios: FragmentWithRatio[] = fragments.map((f) => {
          // Get full row to check sample_size for TRUSTED/UNTRUSTED label
          interface RatioDbRow {
            likelihood_ratio: number;
            sample_size: number;
          }
          const ratioRow = database
            .prepare(
              `SELECT likelihood_ratio, sample_size
               FROM evidence_likelihood_ratios
               WHERE evidence_type = ? AND direction = ? AND horizon_days = ?`,
            )
            .get(f.evidence_type, "bullish", 10) as RatioDbRow | null;

          const sampleSize = ratioRow?.sample_size ?? 0;
          const trusted = sampleSize >= 10;
          // getLikelihoodRatio returns 1.0 for missing/low-sample rows
          const likelihoodRatio = getLikelihoodRatio(
            database,
            f.evidence_type,
            "bullish",
            10,
          );

          return {
            evidence_type: f.evidence_type,
            direction: f.direction,
            magnitude: f.magnitude,
            confidence: f.confidence,
            likelihoodRatio,
            trusted,
            sampleSize,
          };
        });

        // Format output
        const lines: string[] = [
          `Evidence Summary: ${ticker}`,
          `Score date: ${scoreRow.score_date}`,
          ``,
          `Directional Scores:`,
          `  Bullish: ${scoreRow.bullish.toFixed(4)}`,
          `  Bearish: ${scoreRow.bearish.toFixed(4)}`,
          `  Neutral: ${scoreRow.neutral.toFixed(4)}`,
          `  Fragment count: ${scoreRow.fragmentCount}`,
          ``,
          `Top fragments (by magnitude*confidence):`,
        ];

        for (const f of fragmentsWithRatios) {
          const score = (f.magnitude * f.confidence).toFixed(4);
          const trustLabel = f.trusted ? "TRUSTED" : "UNTRUSTED";
          const ratioStr = f.trusted
            ? `LR=${f.likelihoodRatio.toFixed(2)}`
            : `LR=1.00 (n=${f.sampleSize})`;
          lines.push(
            `  - ${f.evidence_type} [${f.direction}] ` +
              `mag=${f.magnitude.toFixed(2)} conf=${f.confidence.toFixed(2)} ` +
              `score=${score} | ${ratioStr} [${trustLabel}]`,
          );
        }

        if (fragmentsWithRatios.length === 0) {
          lines.push("  (no fragments found)");
        }

        return {
          content: [
            {
              type: "text" as const,
              text: lines.join("\n"),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[get_evidence_summary] Error:", msg);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error retrieving evidence summary: ${msg}`,
            },
          ],
        };
      }
    },
  );

  // ── create_prediction_claim ───────────────────────────────────────────────
  server.tool(
    "create_prediction_claim",
    "Insert a structured, falsifiable prediction claim for a stock. " +
      "Intended to be called by the 08-prediction-synthesizer Cowork agent. " +
      "resolution_criteria must be valid JSON with fields: metric, operator, value, currency, description. " +
      "Duplicate claims (same stock + claim_text + resolution_date) are silently skipped.",
    {
      stock: z.string().min(1),
      claim_text: z.string().min(1),
      probability: z.number().min(0.01).max(0.99),
      horizon_days: z.union([z.literal(5), z.literal(10), z.literal(20)]),
      resolution_criteria: z.string().min(1),
      direction: z
        .enum(["bullish", "bearish"])
        .optional()
        .describe("Direction of the prediction"),
      expected_move_pct: z
        .number()
        .min(0.001)
        .max(0.5)
        .optional()
        .describe("Expected percentage move, e.g. 0.05 for 5%"),
    },
    async ({
      stock,
      claim_text,
      probability,
      horizon_days,
      resolution_criteria,
      direction,
      expected_move_pct,
    }) => {
      try {
        const database = resolveDb();
        const ticker = stock.toUpperCase().trim();

        // Step 1: validate resolution_criteria JSON
        try {
          JSON.parse(resolution_criteria);
        } catch {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: resolution_criteria is not valid JSON. Please provide a JSON object with fields: metric, operator, value, currency, description.`,
              },
            ],
          };
        }

        // Step 2: look up latest close price from daily_ohlcv (only needed when direction + pct provided)
        interface OhlcvRow { close: number }
        let creationPrice: number | null = null;
        if (direction != null && expected_move_pct != null) {
          const priceRow = database
            .prepare(
              `SELECT close FROM daily_ohlcv WHERE code = ? ORDER BY date DESC LIMIT 1`,
            )
            .get(ticker) as OhlcvRow | null;

          if (!priceRow) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No price data found for ${ticker} — cannot compute target_price`,
                },
              ],
            };
          }
          creationPrice = priceRow.close;
        }

        // Step 3: compute target_price — null when either direction or pct is absent
        const targetPrice: number | null =
          direction != null && expected_move_pct != null && creationPrice != null
            ? direction === "bullish"
              ? Math.round(creationPrice * (1 + expected_move_pct))
              : Math.round(creationPrice * (1 - expected_move_pct))
            : null;

        // Step 4: compute resolution_date = today + horizon_days TRADING days
        // Skip weekends and VN public holidays so the target date always lands on
        // a bar that exists in daily_ohlcv (PRED-RESOLVER-GAP-FIX — calendar-vs-trading-day).
        const todayStr = new Date().toISOString().slice(0, 10);
        const resolutionDateStr = addTradingDays(todayStr, horizon_days);

        // Step 5: insert claim
        // direction defaults to "neutral" when omitted — the DB column is NOT NULL
        const id = insertPredictionClaim(database, {
          stock: ticker,
          agent_id: "08-prediction-synthesizer",
          claim_text,
          direction: (direction ?? "neutral") as ClaimDirection,
          target_price: targetPrice,
          creation_price: creationPrice,
          resolution_date: resolutionDateStr,
          confidence: probability,
        });

        // Step 6: handle duplicate (INSERT OR IGNORE returned 0)
        if (id === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Duplicate claim skipped: identical claim already exists for ${ticker} resolving on ${resolutionDateStr}`,
              },
            ],
          };
        }

        // Step 7: return confirmation
        return {
          content: [
            {
              type: "text" as const,
              text:
                `Prediction claim created: id=${id}\n` +
                `Stock: ${ticker}\n` +
                `Claim: ${claim_text}\n` +
                (direction ? `Direction: ${direction}\n` : "") +
                `Probability: ${probability.toFixed(2)}\n` +
                (expected_move_pct != null ? `Expected move: ${(expected_move_pct * 100).toFixed(1)}%\n` : "") +
                (creationPrice != null ? `creation_price=${creationPrice} VND\n` : "") +
                (targetPrice != null ? `target_price=${targetPrice} VND\n` : "") +
                `Horizon: ${horizon_days} days\n` +
                `resolution_date=${resolutionDateStr}`,
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[create_prediction_claim] Error:", msg);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error creating prediction claim: ${msg}`,
            },
          ],
        };
      }
    },
  );
}
