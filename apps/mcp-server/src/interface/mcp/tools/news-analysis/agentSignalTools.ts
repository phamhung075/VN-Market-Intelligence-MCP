/**
 * Agent Signal Bus MCP Tools — Task 242 + Enrichment Chain Extension
 *
 * Interface layer: registers MCP tools on a McpServer instance.
 *
 * Tools registered:
 *   1. post_agent_signal        — post a typed, TTL-bound signal to another agent
 *                                 (extended with enrichment chain params: cycle_id,
 *                                  finding_data, causal_ref, chain_depth)
 *   2. get_agent_signals        — retrieve pending signals addressed to an agent
 *   3. record_signal_outcome    — record processing outcome for a signal
 *   4. get_signal_effectiveness — aggregated effectiveness metrics
 *   5. get_open_chain_findings  — query open findings for agents to enrich
 *
 * @module interface/mcp/tools/agentSignalTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import {
  postSignalWithCriticGate,
  getSignals,
  recordOutcome,
  getSignalEffectiveness,
  getOpenChainFindings,
  computeCycleId,
  SignalTypeSchema,
  type SignalType,
  type AgentSignal,
} from "../../../../infrastructure/db/agentSignalStore.js";
import { getRecentSignals } from "../../../../tools/signals/getRecentSignals.js";
import { logSignalRejection } from "../../../../infrastructure/db/signalRejectionStore.js";
import { insertSignalQualityAudit } from "../../../../infrastructure/db/signalQualityAuditStore.js";
import {
  prepareSignalAuditRecord,
  type SignalAuditContext,
} from "../../../../domain/services/signalValidator.js";
import { checkRegimeConfidenceThreshold } from "../../../../domain/services/regimeConfidenceThreshold.js";
import {
  ChainCatalystFindingDataSchema,
  PriceConfirmationFindingDataSchema,
  UrgentNewsLooseSchema,
  CrossValidateFindingDataSchema,
  PriceAnomalyFindingDataSchema,
  SignalFeedbackFindingDataSchema,
} from "../../../../domain/signals/signalTypes.js";

// ── Zod schemas ─────────────────────────────────────────────────────────────

// SignalTypeSchema imported from agentSignalStore — single source of truth.

const OutcomeEnum = z.enum([
  "fired",
  "suppressed",
  "confirmed",
  "false_positive",
]);

const PayloadSchema = z.object({
  title: z.string().optional().describe("Short headline for the signal"),
  detail: z.string().optional().describe("Full detail / reasoning"),
  impact_score: z.coerce
    .number()
    .min(0)
    .max(10)
    .optional()
    .describe("Impact score 0-10 (optional)"),
}).passthrough();

// ── Signal Validation ───────────────────────────────────────────────────────────

/**
 * SIGNAL_TYPE_VALIDATORS — Zod schemas for all chain signal types.
 * Used by post_agent_signal to validate finding_data before DB storage.
 */
const SIGNAL_TYPE_VALIDATORS = {
  chain_catalyst: ChainCatalystFindingDataSchema,
  price_confirmation: PriceConfirmationFindingDataSchema,
  // SYS-FUNC-05: use the loose schema here so agents posting minimal payloads
  // {confidence, summary} are not rejected. The strict UrgentNewsFindingDataSchema
  // remains the type-safety / builder contract (see signalTypes.ts).
  urgent_news: UrgentNewsLooseSchema,
  cross_validate: CrossValidateFindingDataSchema,
  price_anomaly: PriceAnomalyFindingDataSchema,
  signal_feedback: SignalFeedbackFindingDataSchema,
} as const;

/**
 * Validate signal payload against its type's schema.
 *
 * @param signalType - The signal type (chain_catalyst, price_confirmation, etc.)
 * @param findingData - The finding_data object to validate
 * @returns { valid: true } or { valid: false; errors: string[] } with detailed messages
 *
 * Unknown signal types pass through with a warning log (forward compatibility).
 * Exported for test access.
 */
export function validateSignalPayload(
  signalType: string,
  findingData: unknown
): { valid: true } | { valid: false; errors: string[] } {
  const schema =
    SIGNAL_TYPE_VALIDATORS[
      signalType as keyof typeof SIGNAL_TYPE_VALIDATORS
    ];

  if (!schema) {
    // Signal type has no validator (new type or legacy) — warn but allow
    console.warn(
      `[agentSignalTools] No validator for signal type: ${signalType}`
    );
    return { valid: true };
  }

  // Normalize undefined/null finding_data to {} so callers that omit
  // finding_data entirely don't hit a Zod "root: Required" parse error.
  // All per-type schemas treat their fields as optional where the field is
  // genuinely optional (e.g. UrgentNewsFindingDataSchema), so {} is a valid
  // minimal payload for those types.
  const normalizedData = findingData == null ? {} : findingData;
  const result = schema.safeParse(normalizedData);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    });
    return { valid: false, errors };
  }
  return { valid: true };
}

// ── formatSignalLines ────────────────────────────────────────────────────────

/**
 * Format pending signals as plain text. Exported for testability (task 1411).
 *
 * @param signals - Array of AgentSignal (empty → no-data message)
 * @param agent   - Agent name echoed in header
 */
export function formatSignalLines(signals: AgentSignal[], agent: string): string {
  if (signals.length === 0) {
    return "Không có tín hiệu mới.";
  }
  const lines: string[] = [
    `Tín hiệu cho ${agent} (${signals.length} tin):`,
    "",
  ];
  for (const s of signals) {
    const stock = s.stockCode ? ` [${s.stockCode}]` : "";
    lines.push(`[${s.id}] ${s.signalType.toUpperCase()}${stock} — từ: ${s.fromAgent}`);
    if (s.payload.title) lines.push(`  Tiêu đề: ${s.payload.title}`);
    if (s.payload.detail) lines.push(`  Chi tiết: ${s.payload.detail}`);
    if (s.payload.impact_score !== undefined) {
      lines.push(`  Mức độ ảnh hưởng: ${s.payload.impact_score}/10`);
    }
    lines.push(`  Trạng thái: ${s.status} | Hết hạn: ${s.expiresAt}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

// ── registerAgentSignalTools ─────────────────────────────────────────────────

/**
 * Register agent signal MCP tools on the given McpServer.
 *
 * @param server - McpServer instance (from createBunServer)
 */
export function registerAgentSignalTools(server: McpServer): void {
  // ── post_agent_signal ──────────────────────────────────────────────────────
  server.tool(
    "post_agent_signal",
    "Post a signal to the agent coordination bus. Agents use this to share findings " +
      "(news events, price confirmations, fundamental validations) that participate in " +
      "the enrichment chain. The chain synthesizer automatically forms causal chains " +
      "when 2+ agents post about the same stock in the same 15-min cycle. " +
      "Signals expire after ttl_minutes and are automatically cleaned up.",
    {
      from_agent: z
        .string()
        .describe("Name of the sending agent (e.g. 'news-scout')"),
      to_agent: z
        .string()
        .describe(
          "Name of the receiving agent or 'all' for broadcast (e.g. 'alert-commander')",
        ),
      signal_type: SignalTypeSchema.describe(
        "Signal classification: urgent_news | price_anomaly | cross_validate | suppress | chain_catalyst | fundamental_validation | price_confirmation | verified_chain | verified_decision",
      ),
      stock_code: z
        .string()
        .optional()
        .describe("Stock ticker code (e.g. 'VNM'), optional"),
      payload: PayloadSchema.describe(
        "Signal payload: title, detail, and optional impact_score",
      ),
      ttl_minutes: z.coerce
        .number()
        .int()
        .positive()
        .default(120)
        .describe("Time-to-live in minutes (default 120)"),
      cycle_id: z.string().optional().describe("15-min cycle ID (auto-computed if omitted), format YYYYMMDD-HHMM"),
      finding_data: z.record(z.unknown()).optional().describe("Structured finding metrics: { confidence, direction, event_type, validates, confirms_direction, volume_above_average, summary, ... }"),
      causal_ref: z.coerce.number().int().optional().describe("ID of parent signal this finding builds on"),
      chain_depth: z.coerce.number().int().min(0).max(3).optional().default(0).describe("Chain depth: 0=catalyst, 1=validation, 2=confirmation, 3=synthesis"),
      retry_count: z.coerce.number().int().min(0).max(1).optional().default(0).describe("TNB critic gate retry counter. 0 = first attempt (default); 1 = retry after critic feedback."),
    },
    async (args) => {
      try {
        await initDatabase();
        const db = getDb();

        // Task 1293b: Validate chain signals (chain_catalyst, price_confirmation,
        // urgent_news) and cross_validate using strict Zod schemas.
        // Reject incomplete payloads with detailed error response before storage.
        const validation = validateSignalPayload(args.signal_type, args.finding_data);
        if (!validation.valid) {
          const errorMsg = `Signal type '${args.signal_type}' has invalid or missing required fields:\n${validation.errors.join("\n")}\n\nSee TECH_1293_ROOTCAUSE.md for schema definition.`;

          // Task 1293c: Log rejection to audit table
          const payloadPreview = JSON.stringify(args.finding_data ?? {}).slice(0, 200);
          logSignalRejection(db, {
            from_agent: args.from_agent || "unknown",
            signal_type: args.signal_type,
            ...(args.stock_code !== undefined ? { stock_code: args.stock_code } : {}),
            reason: validation.errors.join("; "),
            payload_preview: payloadPreview,
          });

          // Log to console for dev debugging
          console.error(`[agentSignalTools] Signal rejected: ${errorMsg}`);

          // Return MCP error (agent receives feedback immediately)
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: ${errorMsg} [LOGGED FOR ANALYSIS]`,
              },
            ],
            isError: true,
          };
        }

        // H3: Regime-based confidence threshold for urgent_news signals.
        // Enforced AFTER schema validation, BEFORE DB write.
        // Extracts confidence and regime from finding_data when present.
        const findingDataRecord = args.finding_data ?? {};
        const regimeCheck = checkRegimeConfidenceThreshold({
          signal_type: args.signal_type,
          confidence:
            typeof findingDataRecord["confidence"] === "number"
              ? (findingDataRecord["confidence"] as number)
              : undefined,
          regime:
            typeof findingDataRecord["regime"] === "string"
              ? (findingDataRecord["regime"] as string)
              : undefined,
        });

        if (!regimeCheck.pass) {
          const regimeFail = regimeCheck as {
            pass: false;
            reason: string;
            threshold: number;
            actual: number;
            regime: string;
          };

          // Log rejection to audit table
          logSignalRejection(db, {
            from_agent: args.from_agent || "unknown",
            signal_type: args.signal_type,
            ...(args.stock_code !== undefined ? { stock_code: args.stock_code } : {}),
            reason: regimeFail.reason,
            payload_preview: JSON.stringify(findingDataRecord).slice(0, 200),
          });

          console.warn(`[agentSignalTools] Regime threshold blocked: ${regimeFail.reason}`);

          return {
            content: [
              {
                type: "text" as const,
                text: `Error: ${regimeFail.reason} [REGIME_THRESHOLD_BLOCK]`,
              },
            ],
            isError: true,
          };
        }

        const cycleId = args.cycle_id ?? computeCycleId();

        // FIX-SIGNAL-CONFIDENCE-DEFAULT-50: wire producer's already-computed
        // confidence from finding_data (0.0–1.0) into confidence_score (0–100 int).
        // Producers that supply finding_data.confidence get their real value stored.
        // When absent, we leave confidence_score undefined so the column DEFAULT 50
        // is used (honest: no fake value substituted where no signal exists).
        const rawConfidence = typeof findingDataRecord["confidence"] === "number"
          ? (findingDataRecord["confidence"] as number)
          : undefined;
        const derivedConfidenceScore = rawConfidence !== undefined
          ? Math.min(100, Math.max(0, Math.round(rawConfidence * 100)))
          : undefined;

        const signalInput: import("../../../../infrastructure/db/agentSignalStore.js").PostSignalInput =
          {
            fromAgent: args.from_agent,
            toAgent: args.to_agent,
            signalType: args.signal_type as SignalType,
            payload: args.payload as Record<string, unknown>,
            ttlMinutes: args.ttl_minutes,
            cycleId,
            findingData: args.finding_data ?? {},
            chainDepth: args.chain_depth ?? 0,
            ...(args.stock_code !== undefined
              ? { stockCode: args.stock_code }
              : {}),
            ...(args.causal_ref !== undefined
              ? { causalRef: args.causal_ref }
              : {}),
            ...(derivedConfidenceScore !== undefined
              ? { confidence_score: derivedConfidenceScore }
              : {}),
          };

        // TNB critic gate: run scorer before DB write.
        // On first-attempt failure (score < 0.6, retry_count=0), returns signalId=-1
        // with critique text for the source agent to revise and retry.
        const gateResult = await postSignalWithCriticGate(db, signalInput, {
          retryCount: args.retry_count ?? 0,
        });

        const { signalId: id, criticResult } = gateResult;

        // Critic gate rejected on first attempt — return critique, do NOT write
        if (id === -1 && criticResult !== null && !criticResult.pass) {
          const stockSuffix = args.stock_code ? ` [${args.stock_code}]` : "";
          const critiqueResponse = JSON.stringify(
            {
              success: false,
              signal_id: null,
              critic_pass: false,
              critic_score: criticResult.score,
              critique: criticResult.critique ?? criticResult.notes,
              retry_count_remaining: 1,
              message:
                `Signal rejected by TNB critic gate${stockSuffix}. ` +
                `Score: ${criticResult.score.toFixed(1)}/1.0. ` +
                `Revise payload addressing the critique gap and call post_agent_signal again with retry_count=1.`,
            },
            null,
            2,
          );
          console.info(`[post_agent_signal] Critic gate rejected: ${criticResult.critique ?? criticResult.notes}`);
          return {
            content: [{ type: "text" as const, text: critiqueResponse }],
          };
        }

        // Task 1920f — conditional audit write for price_confirmation / urgent_news only.
        // Fire-and-forget: any error is swallowed; MCP response is unaffected.
        const AUDIT_SIGNAL_TYPES = new Set(["price_confirmation", "urgent_news"]);
        if (
          AUDIT_SIGNAL_TYPES.has(args.signal_type) &&
          typeof findingDataRecord["confidence"] === "number"
        ) {
          try {
            const confidence = (findingDataRecord["confidence"] as number) * 100;

            // FR-3: Build ValidationResult shape from finding_data
            const validationResult = {
              valid: (findingDataRecord["confidence"] as number) > 0,
              confidence_score: confidence,
              confidence_score_final: confidence,
              confidence_penalty: 1.0,
              source_fallback: Boolean(findingDataRecord["source_fallback"] ?? false),
              ...(typeof findingDataRecord["fallback_source"] === "string"
                ? { fallback_source: findingDataRecord["fallback_source"] as string }
                : {}),
              staleness_warning: false,
              validated_at: new Date().toISOString(),
            };

            // FR-4: Build SignalAuditContext from post_agent_signal args
            const auditContext: SignalAuditContext = {
              signal_id: String(id),
              signal_type: args.signal_type === "price_confirmation" ? "price" : "news",
              ...(typeof findingDataRecord["fallback_tier"] === "number"
                ? { fallback_tier: findingDataRecord["fallback_tier"] as number }
                : {}),
              ...(typeof findingDataRecord["vps_breaker_state"] === "string"
                ? { vps_breaker_state: findingDataRecord["vps_breaker_state"] as string }
                : {}),
              ...(typeof findingDataRecord["coverage_gap"] === "string"
                ? { coverage_gap: findingDataRecord["coverage_gap"] as string }
                : {}),
              ...(typeof findingDataRecord["price"] === "number"
                ? { price: findingDataRecord["price"] as number }
                : {}),
            };

            const auditRecord = prepareSignalAuditRecord(validationResult, auditContext);
            insertSignalQualityAudit(db, auditRecord);
          } catch (auditErr) {
            console.warn("[post_agent_signal] audit write failed (non-fatal):", auditErr);
          }
        }

        const stockSuffix = args.stock_code ? ` [${args.stock_code}]` : "";
        const criticSuffix =
          criticResult !== null
            ? `, critic_score=${criticResult.score.toFixed(1)}`
            : ", critic_score=null (timeout)";

        const result = JSON.stringify(
          {
            success: true,
            signal_id: id,
            cycle_id: cycleId,
            critic_pass: criticResult?.pass ?? null,
            critic_score: criticResult?.score ?? null,
            message: `Signal posted to ${args.to_agent}: ${args.signal_type}${stockSuffix} (id=${id}, ttl=${args.ttl_minutes}m, cycle=${cycleId}${criticSuffix})`,
          },
          null,
          2,
        );

        return {
          content: [{ type: "text" as const, text: result }],
        };
      } catch (err) {
        console.error("[post_agent_signal] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // ── get_agent_signals ──────────────────────────────────────────────────────
  server.tool(
    "get_agent_signals",
    "Retrieve pending signals addressed to the given agent (or broadcast 'all'). " +
      "Unread signals are marked as read on retrieval. " +
      "Pass from_agent to query sender history instead (read-mark suppressed). " +
      "Pass from_agent=null to query ALL producers' signals in the last hours_back window " +
      "(cross-sibling dedup / corroboration gate — DMS-1 SIBLING_WINDOW_CACHE, DMS-2 corroboration). " +
      "Pass hours_back to restrict results to signals created within the last N hours " +
      "(e.g. hours_back=6 covers the 360-min legal_risk dedup window; hours_back=0.25 = 15-min sibling window). " +
      "Pass signal_type to filter results server-side by signal type (reduces payload 40-60%).",
    {
      agent: z
        .string()
        .optional()
        .describe(
          "Agent name to fetch signals for (e.g. 'alert_commander'). " +
            "Required in inbox mode (from_agent omitted). " +
            "Omittable in sender-history mode (from_agent=string) and all-producers mode (from_agent=null).",
        ),
      status: z
        .enum(["unread", "all"])
        .default("unread")
        .describe("Filter: 'unread' (default) or 'all'"),
      from_agent: z
        .string()
        .nullable()
        .optional()
        .describe(
          "If provided as a string, return only signals sent BY this agent (sender history). " +
            "Read-mark side-effect is suppressed. " +
            "Pass null (or omit) to return signals from ALL producers — used for cross-sibling " +
            "dedup (SIBLING_WINDOW_CACHE) and market-watcher corroboration gate. " +
            "When null, hours_back is required to bound the query window.",
        ),
      hours_back: z.coerce
        .number()
        .positive()
        .optional()
        .describe(
          "Restrict results to signals created within the last N hours " +
            "(e.g. 6 = last 360 minutes; 0.25 = last 15 minutes for sibling window). " +
            "When omitted with from_agent=null, defaults to 0.25 (15-min sibling window). " +
            "When omitted with a specific from_agent, returns non-expired signals only.",
        ),
      signal_type: z
        .string()
        .nullable()
        .optional()
        .describe(
          "Filter results to a specific signal type (server-side). " +
            "Examples: 'price_anomaly', 'chain_catalyst', 'verified_decision', 'legal_risk'. " +
            "When null or omitted, all signal types are returned (backward compatible).",
        ),
    },
    async (args) => {
      try {
        await initDatabase();
        const db = getDb();

        // DMS-1 / DMS-2: from_agent=null means "all producers" — use cross-producer window query.
        // This is the SIBLING_WINDOW_CACHE path for news-scout dedup and the market-watcher
        // corroboration gate. Default window: 15 minutes (0.25 hours = 900 seconds).
        if (args.from_agent === null) {
          const hoursBack = args.hours_back ?? 0.25;
          const windowSeconds = Math.round(hoursBack * 3600);
          const signals = getRecentSignals(db, windowSeconds);

          // Apply optional signal_type filter client-side (getRecentSignals returns all types)
          const filtered = args.signal_type != null
            ? signals.filter((s) => s.signalType === args.signal_type)
            : signals;

          return {
            content: [{ type: "text" as const, text: formatSignalLines(filtered, "all-producers") }],
          };
        }

        if (args.from_agent === undefined && !args.agent) {
          return {
            content: [{
              type: "text" as const,
              text: "Error: `agent` is required when using inbox mode (from_agent not provided).",
            }],
          };
        }
        const signals = getSignals(db, args.agent ?? "", {
          status: args.status,
          ...(args.from_agent !== undefined && args.from_agent !== null ? { fromAgent: args.from_agent } : {}),
          ...(args.hours_back !== undefined ? { hoursBack: args.hours_back } : {}),
          ...(args.signal_type != null ? { signalType: args.signal_type } : {}),
        });

        return {
          content: [{ type: "text" as const, text: formatSignalLines(signals, args.agent ?? "") }],
        };
      } catch (err) {
        console.error("[get_agent_signals] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // ── get_recent_signals ────────────────────────────────────────────────────
  // DMS-1 + DMS-2 — cross-producer signal window query (Root B + Root C fix).
  // Exposed as a dedicated MCP tool so flow docs can call it directly without
  // going through get_agent_signals null-path. Both paths call the same
  // getRecentSignals() helper internally.
  server.tool(
    "get_recent_signals",
    "Query ALL producers' signals committed in the last window_seconds seconds. " +
      "Returns signals with status IN ('committed','published','read') — excludes unread drafts. " +
      "Used for: (1) news-scout SIBLING_WINDOW_CACHE cross-dedup gate (DMS-1/Root B) and " +
      "(2) market-watcher sibling-success corroboration to suppress false gateway-down BUGs (DMS-2/Root C). " +
      "Does NOT mark signals as read — safe to call multiple times.",
    {
      window_seconds: z.coerce
        .number()
        .int()
        .positive()
        .default(900)
        .describe(
          "Look-back window in seconds (default 900 = 15 minutes). " +
            "Use 900 for the standard sibling dedup / corroboration window.",
        ),
    },
    async (args) => {
      try {
        await initDatabase();
        const db = getDb();

        const signals = getRecentSignals(db, args.window_seconds);

        if (signals.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ count: 0, signals: [], window_seconds: args.window_seconds }, null, 2),
              },
            ],
          };
        }

        const result = {
          count: signals.length,
          window_seconds: args.window_seconds,
          signals: signals.map((s) => ({
            id: s.id,
            from_agent: s.fromAgent,
            signal_type: s.signalType,
            stock_code: s.stockCode,
            status: s.status,
            created_at: s.createdAt,
            payload_title: s.payload.title ?? null,
          })),
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        console.error("[get_recent_signals] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // ── record_signal_outcome ──────────────────────────────────────────────────
  server.tool(
    "record_signal_outcome",
    "Record the processing outcome for an agent signal. " +
      "Use this after a signal has been acted upon to feed the effectiveness tracker.",
    {
      signal_id: z.coerce
        .number()
        .int()
        .positive()
        .describe("The numeric id of the agent_signals row to update"),
      outcome: OutcomeEnum.describe(
        "Outcome: fired | suppressed | confirmed | false_positive",
      ),
      detail: z
        .string()
        .optional()
        .describe("Optional free-text explanation stored in outcome_detail"),
    },
    async (args) => {
      try {
        await initDatabase();
        const db = getDb();

        recordOutcome(db, args.signal_id, args.outcome, args.detail);

        const text =
          `Outcome recorded: signal_id=${args.signal_id} outcome=${args.outcome}` +
          (args.detail ? ` (${args.detail})` : "");

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        console.error("[record_signal_outcome] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // ── get_signal_effectiveness ───────────────────────────────────────────────
  server.tool(
    "get_signal_effectiveness",
    "Retrieve aggregated signal effectiveness metrics grouped by agent and signal type. " +
      "Shows total signals, confirmed hits, false positives, and precision percentage.",
    {
      from_agent: z
        .string()
        .optional()
        .describe("Filter to a specific sending agent (optional)"),
      signal_type: z
        .string()
        .optional()
        .describe(
          "Filter to a specific signal type (optional)",
        ),
      days: z.coerce
        .number()
        .int()
        .positive()
        .default(7)
        .describe("Look-back window in days (default 7)"),
    },
    async (args) => {
      try {
        await initDatabase();
        const db = getDb();

        const effectivenessOpts: import("../../../../infrastructure/db/agentSignalStore.js").GetEffectivenessOptions =
          { days: args.days };
        if (args.from_agent !== undefined) effectivenessOpts.fromAgent = args.from_agent;
        if (args.signal_type !== undefined) effectivenessOpts.signalType = args.signal_type;

        const rows = getSignalEffectiveness(db, effectivenessOpts);

        if (rows.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Chưa có dữ liệu hiệu quả tín hiệu trong ${args.days} ngày qua.`,
              },
            ],
          };
        }

        const header = `Agent                | Signal type      | Total | Fired | Confirmed | False+ | Precision`;
        const sep = `---------------------|------------------|-------|-------|-----------|--------|----------`;

        const tableRows = rows.map((r) => {
          const precStr =
            r.precision === null ? "  N/A" : `${(r.precision * 100).toFixed(1)}%`;
          return [
            r.fromAgent.padEnd(20),
            r.signalType.padEnd(16),
            String(r.total).padStart(5),
            String(r.fired).padStart(5),
            String(r.confirmed).padStart(9),
            String(r.false_positive).padStart(6),
            precStr.padStart(9),
          ].join(" | ");
        });

        const text = [
          `Hiệu quả tín hiệu (${args.days} ngày qua):`,
          "",
          header,
          sep,
          ...tableRows,
        ].join("\n");

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        console.error("[get_signal_effectiveness] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // ── get_open_chain_findings ────────────────────────────────────────────────
  server.tool(
    "get_open_chain_findings",
    "Get open chain findings from the coordination bus — signals posted with a cycle_id that have not yet been synthesized. Agents use this to see what other agents have found, so they can post enrichment findings that build on the catalyst. Optionally filter by stock_code.",
    {
      minutes_back: z.coerce.number().int().min(1).max(120).optional().default(30).describe("Lookback window in minutes (default 30)"),
      stock_code: z.string().optional().describe("Filter by stock code, e.g. 'VNM'"),
    },
    async (input) => {
      try {
        await initDatabase();
        const db = getDb();

        const findings = getOpenChainFindings(db, input.minutes_back ?? 30);

        const filtered = input.stock_code
          ? findings.filter(f => f.stockCode === input.stock_code)
          : findings;

        // Group by stock for clarity
        const byStock = new Map<string, typeof filtered>();
        for (const f of filtered) {
          const key = f.stockCode ?? "unknown";
          const arr = byStock.get(key) ?? [];
          arr.push(f);
          byStock.set(key, arr);
        }

        const groups = Array.from(byStock.entries()).map(([stock, links]) => ({
          stock_code: stock,
          finding_count: links.length,
          agents: [...new Set(links.map(l => l.fromAgent))],
          latest_depth: Math.max(...links.map(l => l.chainDepth)),
          links: links.map(l => ({
            id: l.id,
            from_agent: l.fromAgent,
            signal_type: l.signalType,
            chain_depth: l.chainDepth,
            causal_ref: l.causalRef,
            confidence: l.findingData["confidence"] ?? null,
            direction: l.findingData["direction"] ?? null,
            summary: l.findingData["summary"] ?? null,
            created_at: l.createdAt,
          })),
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  total_findings: filtered.length,
                  stock_groups: groups.length,
                  groups,
                  cycle_id_current: computeCycleId(),
                  minutes_back: input.minutes_back ?? 30,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        console.error("[get_open_chain_findings] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
