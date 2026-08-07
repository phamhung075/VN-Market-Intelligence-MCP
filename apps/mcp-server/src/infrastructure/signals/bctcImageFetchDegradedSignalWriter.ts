/**
 * bctcImageFetchDegradedSignalWriter.ts — FIX-BCTC-REFINE-PAGE-IMAGE-UNAVAILABLE-CAPS-CONFIDENCE
 *
 * AC2: makes a previously invisible defect visible. table-page.md / continuation-stitch.md
 * correctly cap confidence <=0.6 and flag `image_unavailable:*` when a window's
 * get_bctc_page_image call was unusable to the refine_bctc_md subagent — that cap is BY
 * DESIGN (bctcSanityValidator.ts can only pass confidence through or clamp to 0.4/0.1; it
 * never emits 0.55/0.6-adjacent values, and is NOT touched by this fix). What was missing:
 * when this happens for MULTIPLE units of the SAME report — an image-fetch-plane degradation
 * for a whole refine batch, not one flaky page — nothing surfaced it outside a buried DB flag.
 * Root-cause investigation (report 76129128-947c-422b-a591-e1d2b95cbeb8, 2026-08-06 16:37Z
 * batch) found pdf-extractor healthy throughout (zero ERROR/WARN log lines, /health 200 OK)
 * and the mcp-server tool log shows at least one of the 3 affected units' underlying rasterize
 * call succeeding cleanly — the loss happens between a successful tool response and the
 * calling subagent, which this signal cannot see directly. It CAN see the resulting pattern
 * (repeated image_unavailable flags on one report) and that is what gets surfaced.
 *
 * DDD layer: infrastructure/signals — thin wrapper over orchStateStore.appendSignalQueueRow(),
 * same precedent as improvementSignalWriter.ts / narrativeContradictionSignalWriter.ts.
 *
 * @module infrastructure/signals/bctcImageFetchDegradedSignalWriter
 */

import { getProjectRoot } from "../projectRoot.js";
import {
  appendSignalQueueRow,
  getOrchStatePath,
  type OrchStateSignalRow,
} from "../orchStateStore.js";

/** `bctc_image_fetch_degraded` row — base OrchStateSignalRow + a `.payload` object. */
export interface BctcImageFetchDegradedRow extends OrchStateSignalRow {
  payload: {
    report_id: string;
    affected_unit_ids: string[];
  };
}

/** Default on-disk orch-state.json (real repo-root; test callers override). */
export const DEFAULT_ORCH_STATE_PATH = getOrchStatePath(getProjectRoot());
/** `.signal_queue._updated_by` writer identity — the tool, not the calling agent. */
export const SIGNAL_WRITER_ID = "push_bctc_refined_unit";
/**
 * Fire on the Nth occurrence for a report (rising edge) — never re-fires on the
 * 3rd, 4th, ... occurrence for the same still-open report. threshold=2 means
 * "more than one flaky page," distinguishing genuine batch degradation from a
 * single outlier page.
 */
export const IMAGE_UNAVAILABLE_SIGNAL_THRESHOLD = 2;

/** True when a unit's flags array carries any `image_unavailable*` variant. */
export function hasImageUnavailableFlag(flags: readonly string[]): boolean {
  return flags.some((f) => f.startsWith("image_unavailable"));
}

/**
 * Decide whether THIS push should fire the degradation signal.
 *
 * @param occurrenceCountIncludingThisPush COUNT(*) of image_unavailable-flagged
 *   units for this report_id, taken AFTER the current row is written (so it
 *   includes this push).
 */
export function shouldSignalImageFetchDegradation(
  occurrenceCountIncludingThisPush: number,
  threshold: number = IMAGE_UNAVAILABLE_SIGNAL_THRESHOLD,
): boolean {
  return occurrenceCountIncludingThisPush === threshold;
}

function toIsoNoMillis(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Build the signal_queue row for a degraded-image-fetch-plane report batch. */
export function buildBctcImageFetchDegradedRow(
  reportId: string,
  affectedUnitIds: readonly string[],
  now: Date = new Date(),
): BctcImageFetchDegradedRow {
  const ts = toIsoNoMillis(now);
  return {
    id: `bctc-imgdeg-${reportId.slice(0, 8)}-${ts.replace(/[:-]/g, "")}`,
    ts,
    from: "mcp-server",
    to: "po",
    type: "bctc_image_fetch_degraded",
    summary:
      `BCTC report ${reportId.slice(0, 8)}: ${affectedUnitIds.length} refined units capped ` +
      `<=0.6 confidence (image_unavailable) — investigate get_bctc_page_image/pdf-extractor ` +
      `fetch plane for this report, not the numbers themselves`,
    severity: "HIGH",
    status: "NEW",
    payload_ref: null,
    payload: {
      report_id: reportId,
      affected_unit_ids: [...affectedUnitIds],
    },
  };
}

/**
 * Append one bctc_image_fetch_degraded signal row. Never throws — mirrors
 * appendSignalQueueRow's own guard (missing file / CAS exhaustion → warn only).
 * Caller (push_bctc_refined_unit) must not have its primary write blocked by
 * this best-effort visibility step.
 */
export function writeBctcImageFetchDegradedSignal(
  reportId: string,
  affectedUnitIds: readonly string[],
  orchStatePath: string = DEFAULT_ORCH_STATE_PATH,
  now: Date = new Date(),
): void {
  const row = buildBctcImageFetchDegradedRow(reportId, affectedUnitIds, now);
  appendSignalQueueRow(orchStatePath, row, row.ts, SIGNAL_WRITER_ID);
}
