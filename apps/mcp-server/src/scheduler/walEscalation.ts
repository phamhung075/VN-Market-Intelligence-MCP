/**
 * walEscalation.ts — WAL checkpoint escalation closure.
 *
 * Extracted from startScheduler.ts (FACTORY-SCHEDULER-job-table-registry) — was an
 * inline closure (`walEscalateFn`) defined at module-composition time and passed into
 * `checkWalFileSize()`'s optional 4th param.
 *
 * D-1 guardrail: appends a WAL_ESCALATION signal_queue row when the WAL file exceeds
 * the checkWalFileSize() threshold (10 MB). checkpoint.ts (infrastructure/db) stays
 * agnostic of orch-state — this scheduler-layer module is the bridge.
 */

import { appendSignalQueueRow, getOrchStatePath } from '../infrastructure/orchStateStore.js'
import { getProjectRoot } from '../infrastructure/projectRoot.js'

export type WalEscalateFn = (walBytes: number) => Promise<void>

/**
 * Builds the walEscalateFn closure bound to a given orchStatePath.
 * Defaults to the live project's orch-state.json path; tests pass a fixture path.
 */
export function createWalEscalateFn(
  orchStatePath: string = getOrchStatePath(getProjectRoot()),
): WalEscalateFn {
  return async (walBytes: number) => {
    const row = {
      id: `wal-escalation-${Date.now()}`,
      ts: new Date().toISOString(),
      from: 'mcp-server/walCheckpointJob',
      to: 'ops',
      type: 'WAL_ESCALATION',
      summary: `WAL file exceeded 10MB (${(walBytes / 1_048_576).toFixed(1)} MB); investigate checkpoint stall`,
      severity: 'HIGH' as const,
      status: 'NEW' as const,
      payload_ref: null,
    }
    appendSignalQueueRow(
      orchStatePath,
      row,
      new Date().toISOString(),
      'mcp-server',
    )
  }
}
