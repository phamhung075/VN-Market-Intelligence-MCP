/**
 * emit_pressure_state — EMIT-DARK-RECURRING Option C (Sprint 2026-06-05)
 *
 * MCP tool that computes server-side infrastructure fields and writes
 * docs/data/pressure-state.json atomically (tmp→rename).
 *
 * Why this tool exists:
 *   The cowork dispatcher is a pure LLM narration engine — it NEVER executes
 *   fenced bash. Fields like signal_backlog (ls+grep+wc), dev_queue_depth
 *   (jq orch-state), and host_headroom_mb (vm_stat/free) require REAL shell
 *   execution. Moving them server-side lets the dispatcher call_tool instead
 *   of running a bash block that silently becomes a no-op.
 *
 * Contract (brief §4 — docs/architecture-briefs/2026-06-05-emit-dark-root-cause.md):
 *   - Arguments: all optional — server defaults each to "unknown" / null.
 *   - Computes: signal_backlog, dev_queue_depth, host_headroom_mb, emitted_at.
 *   - Writes: docs/data/pressure-state.json (atomic tmp→rename).
 *   - Promotes: docs/data/cycle-snapshot-<HH:MM>.json → cycle-snapshot-latest.json
 *     if the per-tick snapshot for tick_id's HH:MM exists.
 *   - Returns: {success:true, emitted_at, pressure_state_path, cycle_snapshot_promoted}
 *     OR {success:false, reason, partial:{fields_written:[...]}}
 *   - NEVER THROWS into the dispatcher — all errors caught internally.
 *
 * @module interface/mcp/tools/system/emitPressureStateTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  copyFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";
import { getProjectRoot } from "../../../../infrastructure/projectRoot.js";
import type { OrchState } from "../../../../infrastructure/orchStateStore.js";

/**
 * Maximum age (ms) a cycle-snapshot may have before it is considered stale.
 * Set to 4 hours — generous enough for off-hours ticks, tight enough to block
 * 15-day-old residues from being promoted.  NO date literals.
 */
export const SNAPSHOT_MAX_STALENESS_MS = 4 * 60 * 60 * 1000; // 4 h

// ─────────────────────────────────────────────────────────────────────────────
// Pressure-state schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 9-key schema that cadence-policy readers expect.
 * Matches the PS_EOF heredoc in telemetry.md lines ~48-58.
 *
 * `stale_warning` is set to `true` when the cycle-snapshot promotion was
 * REFUSED because the source snapshot was beyond SNAPSHOT_MAX_STALENESS_MS.
 */
export interface PressureState {
  emitted_at: string;
  tick_id: string;
  signal_backlog: number | null;
  last_regime: string;
  last_volatility_level: string;
  calendar_status: string;
  dev_queue_depth: number | null;
  host_headroom_mb: number | null;
  stale_warning: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Computation helpers (injectable for tests)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Count unprocessed dev signals: docs/signals/*.json EXCLUDING cowork-team-*.json.
 *
 * @param signalsDir  Absolute path to docs/signals/
 * @returns count, or null if directory is not accessible
 */
export function computeSignalBacklog(signalsDir: string): number | null {
  try {
    if (!existsSync(signalsDir)) return null;
    const files = readdirSync(signalsDir);
    const count = files.filter(
      (f) => f.endsWith(".json") && !f.startsWith("cowork-team-"),
    ).length;
    return count;
  } catch {
    return null;
  }
}

/**
 * Count tasks with status TODO or IN_PROGRESS across all active_sprints.
 *
 * @param orchStatePath  Absolute path to orch-state.json
 * @returns count, or null if file is not readable / parse fails
 */
export function computeDevQueueDepth(orchStatePath: string): number | null {
  try {
    if (!existsSync(orchStatePath)) return null;
    const raw = readFileSync(orchStatePath, "utf8");
    const state = JSON.parse(raw) as OrchState;
    let count = 0;
    for (const sprint of state.task_board?.active_sprints ?? []) {
      for (const task of sprint.tasks ?? []) {
        const s = (task.status ?? "").toUpperCase();
        if (s === "TODO" || s === "IN_PROGRESS") count++;
      }
    }
    return count;
  } catch {
    return null;
  }
}

/**
 * Read free memory in MB.
 * - macOS: vm_stat pages free → multiply by page size (4096 bytes typical)
 * - Linux: free -m available column
 * - Unavailable: null
 */
export function computeHostHeadroomMb(): number | null {
  // Try macOS vm_stat first
  try {
    const out = execSync("vm_stat 2>/dev/null", { encoding: "utf8", timeout: 3000 });
    const match = out.match(/Pages free:\s+(\d+)/);
    if (match && match[1]) {
      const pages = parseInt(match[1], 10);
      if (!isNaN(pages) && pages > 0) {
        // vm_stat page size is typically 4096 on macOS
        return Math.floor((pages * 4096) / (1024 * 1024));
      }
    }
  } catch {
    // vm_stat not available
  }

  // Try Linux free -m
  try {
    const out = execSync("free -m 2>/dev/null", { encoding: "utf8", timeout: 3000 });
    // Column order: total, used, free, shared, buff/cache, available
    const match = out.match(/^Mem:\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/m);
    if (match && match[1]) {
      const mb = parseInt(match[1], 10);
      if (!isNaN(mb) && mb >= 0) return mb;
    }
  } catch {
    // free not available
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Atomic write helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write pressure-state.json atomically via tmp→rename.
 * NEVER throws — returns error string or null on success.
 */
export function writePressureStateAtomic(
  pressureStatePath: string,
  state: PressureState,
  writeFileFn: (path: string, content: string) => void = (p, c) =>
    writeFileSync(p, c, "utf8"),
  renameFn: (from: string, to: string) => void = renameSync,
): string | null {
  try {
    const dir = resolve(pressureStatePath, "..");
    mkdirSync(dir, { recursive: true });

    const serialized = JSON.stringify(state, null, 2);
    const tmp = pressureStatePath + ".tmp." + Date.now();
    writeFileFn(tmp, serialized);
    renameFn(tmp, pressureStatePath);
    return null; // success
  } catch (err) {
    return (err as Error).message ?? String(err);
  }
}

/**
 * Result of a promoteCycleSnapshot attempt.
 */
export interface PromoteCycleSnapshotResult {
  /** true when the snapshot was copied to cycle-snapshot-latest.json */
  promoted: boolean;
  /**
   * true when a source snapshot was found but REFUSED because its
   * fetchedAt/created_at was beyond SNAPSHOT_MAX_STALENESS_MS.
   * false in all other cases (no file, promotion succeeded, read error).
   */
  stale: boolean;
}

/**
 * Promote cycle-snapshot-<HH:MM>.json to cycle-snapshot-latest.json atomically.
 *
 * FAIL-SAFE (FIX-CYCLE-SNAPSHOT-STALE-PROMOTE-FAILSAFE):
 *   Before copying, parse the source snapshot and read its `fetchedAt` or
 *   `created_at` timestamp.  If the snapshot is older than
 *   SNAPSHOT_MAX_STALENESS_MS (relative to `nowIsoFn()`), the promotion is
 *   REFUSED: `{ promoted: false, stale: true }` is returned and the
 *   existing cycle-snapshot-latest.json is left untouched.
 *
 *   This prevents a stale HH:MM residue (e.g. from 15 days ago) whose tick
 *   collides with today's HH:MM from being stamped with a fresh fs-mtime
 *   and consumed by downstream agents as current macro data.
 *
 * @param dataDir      Absolute path to docs/data/
 * @param tickHHMM     "HH:MM" extracted from tick_id
 * @param copyFileFn   Injectable copyFileSync (for tests)
 * @param renameFn     Injectable renameSync (for tests)
 * @param readFileFn   Injectable readFileSync (for tests)
 * @param nowIsoFn     Injectable () => ISO string for "now" (for tests)
 * @returns PromoteCycleSnapshotResult
 */
export function promoteCycleSnapshot(
  dataDir: string,
  tickHHMM: string,
  copyFileFn: (src: string, dst: string) => void = copyFileSync,
  renameFn: (from: string, to: string) => void = renameSync,
  readFileFn: (path: string, enc: "utf8") => string = (p) => readFileSync(p, "utf8"),
  nowIsoFn: () => string = () => new Date().toISOString(),
): PromoteCycleSnapshotResult {
  try {
    const snapPath = join(dataDir, `cycle-snapshot-${tickHHMM}.json`);
    if (!existsSync(snapPath)) return { promoted: false, stale: false };

    // ── FAIL-SAFE freshness gate ────────────────────────────────────────────
    // Parse the source snapshot to read its age.  Use fetchedAt if present,
    // fall back to created_at.  A missing or unparseable timestamp is treated
    // as infinitely stale to avoid promoting corrupted data.
    let snapshotAgeMs: number = Infinity;
    try {
      const raw = readFileFn(snapPath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const tsStr =
        (typeof parsed["fetchedAt"] === "string" ? parsed["fetchedAt"] : null) ??
        (typeof parsed["created_at"] === "string" ? parsed["created_at"] : null) ??
        (typeof (parsed["macro_snapshot"] as Record<string, unknown> | undefined)?.["fetchedAt"] === "string"
          ? (parsed["macro_snapshot"] as Record<string, unknown>)["fetchedAt"] as string
          : null);
      if (tsStr) {
        const snapshotMs = new Date(tsStr).getTime();
        const nowMs = new Date(nowIsoFn()).getTime();
        if (!isNaN(snapshotMs)) {
          snapshotAgeMs = nowMs - snapshotMs;
        }
      }
    } catch {
      // JSON parse error → treat as stale; do NOT promote
    }

    if (snapshotAgeMs > SNAPSHOT_MAX_STALENESS_MS) {
      // REFUSED — stale content; leave cycle-snapshot-latest.json untouched
      return { promoted: false, stale: true };
    }
    // ── end freshness gate ──────────────────────────────────────────────────

    const latestTmp = join(dataDir, "cycle-snapshot-latest.json.tmp." + Date.now());
    const latestPath = join(dataDir, "cycle-snapshot-latest.json");
    copyFileFn(snapPath, latestTmp);
    renameFn(latestTmp, latestPath);
    return { promoted: true, stale: false };
  } catch {
    return { promoted: false, stale: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool deps interface (injectable for tests)
// ─────────────────────────────────────────────────────────────────────────────

export interface EmitPressureStateDeps {
  getRoot: () => string;
  computeSignalBacklogFn: (signalsDir: string) => number | null;
  computeDevQueueDepthFn: (orchStatePath: string) => number | null;
  computeHostHeadroomMbFn: () => number | null;
  writePressureStateAtomicFn: (path: string, state: PressureState) => string | null;
  /** Returns { promoted, stale } — stale=true means REFUSED due to freshness gate */
  promoteCycleSnapshotFn: (dataDir: string, tickHHMM: string) => PromoteCycleSnapshotResult;
  nowIso: () => string;
}

const defaultDeps: EmitPressureStateDeps = {
  getRoot: getProjectRoot,
  computeSignalBacklogFn: computeSignalBacklog,
  computeDevQueueDepthFn: computeDevQueueDepth,
  computeHostHeadroomMbFn: computeHostHeadroomMb,
  writePressureStateAtomicFn: writePressureStateAtomic,
  // Production wrapper: passes through to promoteCycleSnapshot with defaults
  promoteCycleSnapshotFn: (dataDir, tickHHMM) => promoteCycleSnapshot(dataDir, tickHHMM),
  nowIso: () => new Date().toISOString(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Core emitter (injectable for tests, called by tool handler)
// ─────────────────────────────────────────────────────────────────────────────

export interface EmitPressureStateArgs {
  calendar_status?: string;
  tick_id?: string;
  fire_time?: string;
  pressure_mode?: string;
  last_regime?: string;
  last_volatility_level?: string;
}

export type EmitPressureStateResult =
  | {
      success: true;
      emitted_at: string;
      pressure_state_path: string;
      cycle_snapshot_promoted: boolean;
      /** Present and true when a cycle-snapshot was REFUSED by the freshness gate */
      stale_warning?: true;
    }
  | {
      success: false;
      reason: string;
      partial?: { fields_written: string[] };
    };

export async function runEmitPressureState(
  args: EmitPressureStateArgs,
  deps: EmitPressureStateDeps = defaultDeps,
): Promise<EmitPressureStateResult> {
  const fieldsWritten: string[] = [];

  try {
    const root = deps.getRoot();
    const dataDir = resolve(root, "docs", "data");
    const signalsDir = resolve(root, "docs", "signals");
    const orchStatePath = resolve(root, "docs", "data", "orch", "orch-state.json");
    const pressureStatePath = resolve(root, "docs", "data", "pressure-state.json");

    const emittedAt = deps.nowIso();
    fieldsWritten.push("emitted_at");

    // Derive tick_id from argument or default to current 15-min floor
    let tickId = args.tick_id ?? "unknown";
    if (!args.tick_id) {
      const now = new Date();
      const hh = now.getUTCHours().toString().padStart(2, "0");
      const mm = (Math.floor(now.getUTCMinutes() / 15) * 15)
        .toString()
        .padStart(2, "0");
      tickId = `${now.toISOString().slice(0, 11)}${hh}:${mm}:00Z`;
    }

    // Extract HH:MM from tick_id for cycle-snapshot promotion
    // tick_id format: "2026-06-05T18:00:00Z" → "18:00"
    const tickHHMM = (() => {
      const m = tickId.match(/T(\d{2}:\d{2}):/);
      return m ? m[1]! : null;
    })();

    // Server-computed fields
    const signal_backlog = deps.computeSignalBacklogFn(signalsDir);
    fieldsWritten.push("signal_backlog");

    const dev_queue_depth = deps.computeDevQueueDepthFn(orchStatePath);
    fieldsWritten.push("dev_queue_depth");

    const host_headroom_mb = deps.computeHostHeadroomMbFn();
    fieldsWritten.push("host_headroom_mb");

    // Promote cycle snapshot if present (FAIL-SAFE: freshness gate inside)
    const promoteResult: PromoteCycleSnapshotResult = tickHHMM
      ? deps.promoteCycleSnapshotFn(dataDir, tickHHMM)
      : { promoted: false, stale: false };

    // Build pressure state — 9-key schema (matches telemetry.md PS_EOF lines ~48-58)
    // stale_warning is set when the freshness gate REFUSED a promotion
    const pressureState: PressureState = {
      emitted_at: emittedAt,
      tick_id: tickId,
      signal_backlog: signal_backlog,
      last_regime: args.last_regime ?? "unknown",
      last_volatility_level: args.last_volatility_level ?? "unknown",
      calendar_status: args.calendar_status ?? "unknown",
      dev_queue_depth: dev_queue_depth,
      host_headroom_mb: host_headroom_mb,
      stale_warning: promoteResult.stale,
    };

    // Atomic write
    const writeErr = deps.writePressureStateAtomicFn(pressureStatePath, pressureState);
    if (writeErr) {
      console.error(`[emit_pressure_state] write failed: ${writeErr}`);
      return {
        success: false,
        reason: `pressure-state write failed: ${writeErr}`,
        partial: { fields_written: fieldsWritten },
      };
    }
    fieldsWritten.push("pressure_state_written");

    console.log(
      `[emit_pressure_state] ok emitted_at=${emittedAt} tick_id=${tickId} ` +
        `signal_backlog=${signal_backlog} dev_queue_depth=${dev_queue_depth} ` +
        `host_headroom_mb=${host_headroom_mb} ` +
        `cycle_snapshot_promoted=${promoteResult.promoted} stale_warning=${promoteResult.stale}`,
    );

    const result: EmitPressureStateResult = {
      success: true,
      emitted_at: emittedAt,
      pressure_state_path: pressureStatePath,
      cycle_snapshot_promoted: promoteResult.promoted,
    };
    if (promoteResult.stale) {
      (result as { stale_warning?: true }).stale_warning = true;
    }
    return result;
  } catch (err) {
    const reason = (err as Error).message ?? String(err);
    console.error(`[emit_pressure_state] unexpected error: ${reason}`);
    return {
      success: false,
      reason: `unexpected error: ${reason}`,
      partial: { fields_written: fieldsWritten },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the `emit_pressure_state` tool on the MCP server.
 *
 * @param server  McpServer instance
 * @param deps    Injectable deps (for tests; defaults to production impl)
 */
export function registerEmitPressureStateTool(
  server: McpServer,
  deps: EmitPressureStateDeps = defaultDeps,
): void {
  server.tool(
    "emit_pressure_state",
    "Write docs/data/pressure-state.json with server-computed infrastructure metrics. " +
      "Accepts calendar_status, tick_id, fire_time, pressure_mode, last_regime, and " +
      "last_volatility_level from the dispatcher (all optional — server defaults each to 'unknown'). " +
      "SERVER-COMPUTED: signal_backlog (docs/signals/*.json count excl cowork-team-*), " +
      "dev_queue_depth (orch-state.json TODO+IN_PROGRESS tasks), " +
      "host_headroom_mb (vm_stat/free -m; null if unavailable), emitted_at (server UTC now). " +
      "Writes docs/data/pressure-state.json atomically (tmp→rename). " +
      "Promotes docs/data/cycle-snapshot-<HH:MM>.json to cycle-snapshot-latest.json if present. " +
      "NEVER throws — returns {success:false, reason} on any error so the cowork dispatcher is never broken.",
    {
      calendar_status: z
        .string()
        .optional()
        .describe(
          "Calendar status for this tick: 'open' | 'weekend' | 'holiday' | 'half_day' | 'unknown'. " +
            "Defaults to 'unknown' if omitted.",
        ),
      tick_id: z
        .string()
        .optional()
        .describe(
          "Nominal tick ISO8601 timestamp (e.g. '2026-06-05T18:00:00Z'). " +
            "Used to key the cycle-snapshot promotion. Defaults to current 15-min floor if omitted.",
        ),
      fire_time: z
        .string()
        .optional()
        .describe(
          "Actual fire time ISO8601 (e.g. '2026-06-05T18:01:29Z'). Recorded for tracing only.",
        ),
      pressure_mode: z
        .string()
        .optional()
        .describe(
          "Pressure mode used this tick: 'adaptive' | 'legacy'. Recorded for tracing only.",
        ),
      last_regime: z
        .string()
        .optional()
        .describe(
          "Last known market regime: 'bull' | 'bear' | 'sideways' | 'unknown'. " +
            "Defaults to 'unknown' if omitted.",
        ),
      last_volatility_level: z
        .string()
        .optional()
        .describe(
          "Last known volatility level: 'high' | 'medium' | 'low' | 'unknown'. " +
            "Defaults to 'unknown' if omitted.",
        ),
    },
    async (args) => {
      // Cast to EmitPressureStateArgs: Zod infers string|undefined for optional fields;
      // our interface uses exactOptionalPropertyTypes so we strip undefined values here.
      const emitArgs: EmitPressureStateArgs = {};
      if (args.calendar_status !== undefined) emitArgs.calendar_status = args.calendar_status;
      if (args.tick_id !== undefined) emitArgs.tick_id = args.tick_id;
      if (args.fire_time !== undefined) emitArgs.fire_time = args.fire_time;
      if (args.pressure_mode !== undefined) emitArgs.pressure_mode = args.pressure_mode;
      if (args.last_regime !== undefined) emitArgs.last_regime = args.last_regime;
      if (args.last_volatility_level !== undefined) emitArgs.last_volatility_level = args.last_volatility_level;

      const result = await runEmitPressureState(emitArgs, deps);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
