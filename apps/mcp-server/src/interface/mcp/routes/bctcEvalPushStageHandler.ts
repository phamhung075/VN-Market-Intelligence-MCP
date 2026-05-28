/**
 * bctcEvalPushStageHandler.ts — POST /api/bctc-eval/push-stage
 *
 * Interface layer. Receives stage 1-3 eval results from pdf-extractor.
 *
 * Request body shape:
 * {
 *   "report_id": "<uuid>",
 *   "stage_no": 1|2|3,
 *   "stage_name": "RASTERIZE"|"LAYOUT_DETECT"|"OCR",
 *   "status": "green"|"yellow"|"red",
 *   "metrics_json": { ... },
 *   "gate_failures_json": [ ... ],
 *   "golden_diff_json": { ... }
 * }
 *
 * Response codes:
 *   200 — row upserted
 *   400 — invalid body or UUID
 *   500 — DB error
 *
 * DI: db injected by server.ts.
 * Fail-loud: raises on HTTP error (no bare catch swallow).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { upsertEvalRow } from "../../../infrastructure/db/bctcEvalStore.js";
import { isValidUuid } from "./bctcInspectHandler.js";

const VALID_STAGE_NAMES: Record<number, string> = {
  1: "RASTERIZE",
  2: "LAYOUT_DETECT",
  3: "OCR",
};

interface PushStageBody {
  report_id?: unknown;
  stage_no?: unknown;
  stage_name?: unknown;
  status?: unknown;
  metrics_json?: unknown;
  gate_failures_json?: unknown;
  golden_diff_json?: unknown;
}

export async function handleBctcEvalPushStage(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
): Promise<void> {
  let body = "";
  for await (const chunk of req) body += chunk;

  let payload: PushStageBody = {};
  try {
    if (body.trim()) payload = JSON.parse(body) as PushStageBody;
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON body", code: "INVALID_JSON" }));
    return;
  }

  const reportId = typeof payload.report_id === "string" ? payload.report_id.trim() : null;
  const stageNo = typeof payload.stage_no === "number" ? payload.stage_no : null;
  const status = payload.status;

  if (!reportId || !isValidUuid(reportId)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing or invalid report_id (UUID required)", code: "INVALID_UUID" }));
    return;
  }

  if (stageNo === null || ![1, 2, 3].includes(stageNo)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "stage_no must be 1, 2, or 3 for push-stage endpoint", code: "INVALID_STAGE" }));
    return;
  }

  if (status !== "green" && status !== "yellow" && status !== "red") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "status must be green|yellow|red", code: "INVALID_STATUS" }));
    return;
  }

  try {
    const stageName = VALID_STAGE_NAMES[stageNo] ?? `STAGE_${stageNo}`;
    const metricsJson =
      payload.metrics_json &&
      typeof payload.metrics_json === "object" &&
      !Array.isArray(payload.metrics_json)
        ? (payload.metrics_json as Record<string, unknown>)
        : {};
    const gateFailuresJson = Array.isArray(payload.gate_failures_json)
      ? payload.gate_failures_json
      : [];
    const goldenDiffJson =
      payload.golden_diff_json &&
      typeof payload.golden_diff_json === "object" &&
      !Array.isArray(payload.golden_diff_json)
        ? (payload.golden_diff_json as Record<string, unknown>)
        : {};

    upsertEvalRow(db, {
      report_id: reportId,
      stage_no: stageNo,
      stage_name: stageName,
      status,
      metrics_json: metricsJson,
      gate_failures_json: gateFailuresJson,
      golden_diff_json: goldenDiffJson,
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        report_id: reportId,
        stage_no: stageNo,
        stage_name: stageName,
        status,
      }),
    );
  } catch (err) {
    // Fail-loud: raise, don't swallow
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
        code: "DB_ERROR",
      }),
    );
  }
}
