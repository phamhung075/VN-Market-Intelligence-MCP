/**
 * bctcEvalThresholdsHandler.ts — GET /api/bctc-eval/thresholds
 *
 * Interface layer. Exposes docs/data/bctc-eval-thresholds.json to FE.
 * FE Remix loader calls this once on mount; agents load the file directly.
 *
 * Response codes:
 *   200 — thresholds JSON (schema_version, detector_version, thresholds)
 *   500 — file unreadable
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function handleBctcEvalThresholds(
  _req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string,
): void {
  try {
    const thresholdsPath = resolve(
      projectRoot,
      "docs/data/bctc-eval-thresholds.json",
    );
    const raw = readFileSync(thresholdsPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        schema_version: parsed["schema_version"] ?? "1",
        detector_version: parsed["detector_version"] ?? "v1",
        thresholds: parsed["stages"] ?? {},
      }),
    );
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: `Failed to read bctc-eval-thresholds.json: ${err instanceof Error ? err.message : String(err)}`,
        code: "THRESHOLDS_UNREADABLE",
      }),
    );
  }
}
