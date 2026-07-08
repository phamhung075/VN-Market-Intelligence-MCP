/**
 * Orch-State Janitor Job — Task 1965b (OSC-2 migration)
 * + FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE (2026-07-08): Steps R-1b/R-4b.
 *
 * Daily 03:00 UTC — off-peak after bctcReparseJob at 02:30 UTC.
 *
 * Implements D4 audit dimension (docs/agents/system-auditor/audit-dimensions.md)
 * via steps R-1..R-7 from docs/agents/system-auditor/handlers.md.
 *
 * What it does:
 *   R-1: calls task_list_held(kind="sprint-task", expired=false) via coordinationStore
 *        (same DB layer used by the MCP tool — no new schema, Option A zero-table
 *        constraint). expired:false is REQUIRED — without it, TTL-expired tombstone
 *        locks are read as held and flood R-2/R-3 with dead-lock false positives.
 *   R-1b: exclusion whitelist (cron:*, *-singleton, po-triage-*, esc-datacov:*,
 *        esc-deepdive:*, session-presence*, commit-mutex*, intent:*) + live-concurrent-
 *        session guard (owner_client_session present in the live session-presence
 *        roster AND lock unexpired) — filters BEFORE R-2/R-3 evaluate any lock.
 *   R-2: reads orch-state.json .head, cross-checks active_task_id vs locks surviving
 *        R-1b (AC-4).
 *   R-3: reads orch-state.json .task_board.tasks[], compares Owner + Status vs locks
 *        surviving R-1b (AC-2, AC-3).
 *   R-4: git log concurrent-commit detection on docs/data/orch/orch-state.json within
 *        30s (AC-5) — emitted directly, NOT subject to R-4b debounce.
 *   R-4b: 2-consecutive-daily-cycle debounce gate on R-2/R-3 candidates. Ledger rides
 *        on the system-auditor notebook's `D4 candidates:` line (no new state file —
 *        see docs/agents/system-auditor/handlers.md §Step R-4b). Cold start (no prior
 *        line found) => zero emissions this cycle, ledger only seeded (fail-safe).
 *   R-5: appends signal_queue row to orch-state.json for each divergence (atomic write).
 *   R-6: BUG telegram for new divergences (7d dedup key d4_tasksmd_lock_diverge:<task_id>).
 *   R-7: logs clean signal when zero divergences detected.
 *
 * OSC-2: All paths re-pointed from docs/TASKS.md + docs/pipeline-state.json +
 *        docs/signals/DASHBOARD.md → docs/data/orch/orch-state.json.
 *        Dashboard rows are now JSON signal_queue rows (appendSignalQueueRow, atomic write).
 *
 * Failure modes: logged as WARN; individual step failures do NOT abort the job.
 * Internal job failure (caught at top level): BUG telegram with 7d dedup.
 *
 * DDD Layer: interface/scheduler — may import from infrastructure/.
 * No domain/ imports. No writes to coordination.db.
 *
 * @module scheduler/system/tasksMdJanitorJob
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { listHeldTasks, type LockRow } from "../../infrastructure/db/coordinationStore.js";
import { getProjectRoot } from "../../infrastructure/projectRoot.js";
import { shouldSkipRecoveryReplay } from "../startupHelpers.js";
import {
  appendSignalQueueRow,
  writeOrchStateAtomic,
  type OrchStateSignalRow,
  type OrchStateTaskBoardTask,
} from "../../infrastructure/orchStateStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DivergenceRow {
  kind: "status" | "owner" | "not_found" | "pipeline_mismatch" | "concurrent_commit";
  taskId: string;
  summary: string;
}

/**
 * A candidate produced by Steps R-2/R-3, gated by the R-4b debounce before it may
 * become a DivergenceRow (FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE). `key` matches
 * the ledger key shape in handlers.md §Step R-4b: R2-mismatch:<id> / R3-no-board-row:<id>
 * / R3-owner-diverge:<id> / R3-status-diverge:<id>.
 */
export interface D4Candidate {
  key: string;
  div: DivergenceRow;
}

export interface JanitorResult {
  heldLocks: number;
  divergences: DivergenceRow[];
  pipelineState: { activeTaskId: string | null } | null;
  concurrentCommits: Array<{ hash1: string; hash2: string; delta: number }>;
  errors: string[];
}

/** Shape of orch-state.json .head (only the fields we read) — v3 snake_case */
interface OrchHead {
  active_task_id?: string | null;
  status?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency injection interfaces (for testability)
// ─────────────────────────────────────────────────────────────────────────────

export interface JanitorDeps {
  /** Return held sprint-task locks — defaults to real coordinationStore.listHeldTasks */
  listHeld: () => LockRow[];
  /**
   * Step R-1b live-concurrent-session guard: return live session-presence lock rows
   * (kind="session-presence", expired=false). Optional — defaults to zero live
   * sessions when omitted (the known-legit-pattern whitelist still applies; fail-safe
   * per handlers.md Failure modes: never suppress LESS on this path's absence).
   */
  listSessionPresence?: () => LockRow[];
  /** Read a file to string — defaults to fs.readFileSync */
  readFile: (path: string) => string;
  /** Write a file — defaults to fs.writeFileSync */
  writeFile: (path: string, content: string) => void;
  /** Check file exists */
  fileExists: (path: string) => boolean;
  /** Run a shell command and return stdout */
  runShell: (cmd: string) => string;
  /** Send BUG telegram (text, dedupKey) — returns dedup-skipped boolean */
  sendBug: (text: string, dedupKey: string) => Promise<void>;
  /** ISO timestamp */
  nowIso: () => string;
  /** Project root path */
  projectRoot: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// orch-state.json task_board parser (OSC-2 — replaces TASKS.md markdown parser)
// ─────────────────────────────────────────────────────────────────────────────

interface TasksRow {
  taskId: string;
  title: string;
  status: string;
  owner: string;
  raw: string;
}

/**
 * Flatten all tasks from orch-state.json .task_board.active_sprints[].tasks[]
 * into a list of TasksRow for lock cross-check (R-3).
 *
 * OSC-2 replacement for parseTasksMd() — reads structured JSON instead of
 * Markdown table rows.
 */
export function parseTasksFromOrchState(tasks: OrchStateTaskBoardTask[]): TasksRow[] {
  return tasks.map(t => ({
    // Post-F1B read-path coalesce: prefer canonical `id`, fall back to legacy `task_id`.
    // Write-path emits `id` only; coalesce stays one release per task-schema.md.
    taskId: t.id || t.task_id || "",
    title: t.title ?? "",
    status: t.status ?? "",
    owner: t.owner ?? "",
    raw: JSON.stringify(t),
  }));
}

/**
 * Extract all tasks from orch-state.json JSON (parsed).
 * Flattens active_sprints[].tasks[] into a flat TasksRow array.
 */
export function parseTasksFromOrchStateJson(orchState: {
  task_board?: { active_sprints?: Array<{ tasks?: OrchStateTaskBoardTask[] }> };
}): TasksRow[] {
  const rows: TasksRow[] = [];
  for (const sprint of orchState.task_board?.active_sprints ?? []) {
    for (const task of sprint.tasks ?? []) {
      rows.push({
        // Post-F1B read-path coalesce: prefer canonical `id`, fall back to legacy `task_id`.
        taskId: task.id || task.task_id || "",
        title: task.title ?? "",
        status: task.status ?? "",
        owner: task.owner ?? "",
        raw: JSON.stringify(task),
      });
    }
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step R-1b: exclusion whitelist + live-concurrent-session guard
// (FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE — docs/agents/system-auditor/handlers.md
// §Step R-1b). Filters BEFORE Steps R-2/R-3 evaluate any held lock.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip the "task:" prefix from a lock's task_id, matching the bare id used in
 * orch-state.json .task_board entries and .head.active_task_id.
 */
export function bareTaskId(taskId: string): string {
  return taskId.startsWith("task:") ? taskId.slice(5) : taskId;
}

/**
 * Known-legit kind/pattern list per handlers.md §Step R-1b item 1: persistent /
 * guard / escalation locks that are board-row-less OR held concurrently with any
 * active task BY DESIGN. Prefix-matched (glob) except the "-singleton" suffix.
 */
const KNOWN_LEGIT_PREFIXES: readonly string[] = [
  "cron:",
  "po-triage-",
  "esc-datacov:",
  "esc-deepdive:",
  "session-presence",
  "commit-mutex",
  "intent:",
];

export function isKnownLegitPattern(bareId: string): boolean {
  if (bareId.endsWith("-singleton")) return true;
  return KNOWN_LEGIT_PREFIXES.some(prefix => bareId.startsWith(prefix));
}

/**
 * Live concurrent-session guard per handlers.md §Step R-1b item 2: a lock owned by
 * a session that is CURRENTLY in the live session-presence roster AND itself
 * unexpired is NOT orphaned — it belongs to a concurrently-running sprint that
 * `.head` (single-slot) does not track by design (N-sprint concurrency).
 */
export function isLiveConcurrentSession(
  lock: LockRow,
  liveSessionIds: ReadonlySet<string>,
  nowEpochSeconds: number,
): boolean {
  if (!lock.owner_client_session) return false;
  if (!liveSessionIds.has(lock.owner_client_session)) return false;
  return lock.expires_at > nowEpochSeconds;
}

export interface R1bFilterResult {
  surviving: LockRow[];
  skipped: Array<{ bareId: string; reason: string }>;
}

/**
 * Apply Step R-1b to a batch of held locks. Locks matching either the known-legit
 * pattern whitelist or the live-concurrent-session guard are filtered OUT — they
 * proceed to neither R-2 nor R-3.
 */
export function applyR1bFilter(
  heldLocks: LockRow[],
  liveSessionIds: ReadonlySet<string>,
  nowEpochSeconds: number,
): R1bFilterResult {
  const surviving: LockRow[] = [];
  const skipped: Array<{ bareId: string; reason: string }> = [];

  for (const lock of heldLocks) {
    const bareId = bareTaskId(lock.task_id);
    if (isKnownLegitPattern(bareId)) {
      skipped.push({ bareId, reason: "known-legit-pattern" });
      continue;
    }
    if (isLiveConcurrentSession(lock, liveSessionIds, nowEpochSeconds)) {
      skipped.push({ bareId, reason: `live-concurrent-session:${lock.owner_client_session}` });
      continue;
    }
    surviving.push(lock);
  }

  return { surviving, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step R-4b: 2-consecutive-cycle debounce gate on R-2/R-3 candidates
// (FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE — docs/agents/system-auditor/handlers.md
// §Step R-4b). Ledger rides on the system-auditor notebook's "D4 candidates:" line —
// no new state file (D4's own header comment: "No writes to coordination.db").
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the most recent prior "D4 candidates:" line out of the system-auditor
 * notebook content. This repo's notebook convention prepends the newest `## `
 * section at the top (see docs/agent-memory/notebooks/system-auditor.md — newest
 * section is first), so sections are scanned top-to-bottom and the FIRST one
 * containing a "D4 candidates:" line wins (intervening Tier-1/Tier-2 sections have
 * no such line at all).
 *
 * Returns null when no "D4 candidates:" line is found anywhere (cold start) — the
 * caller MUST treat null as "zero prior candidates, do not emit this cycle".
 * Returns an empty Set when a prior line reads "none" (checked previously, found
 * nothing) — behaviorally identical to null for matching purposes, kept distinct
 * only for notebook-read transparency.
 */
export function parsePriorD4Candidates(notebookContent: string): Set<string> | null {
  const sectionRe = /^## .*$/gm;
  const matches = [...notebookContent.matchAll(sectionRe)];
  if (matches.length === 0) return null;

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i]!.index!;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : notebookContent.length;
    const sectionBody = notebookContent.slice(start, end);
    const lineMatch = sectionBody.match(/^D4 candidates:\s*(.*)$/m);
    if (lineMatch) {
      const raw = lineMatch[1]!.trim();
      if (raw === "" || raw.toLowerCase() === "none") return new Set();
      return new Set(
        raw
          .split(",")
          .map(s => s.trim())
          .filter(Boolean),
      );
    }
  }
  return null;
}

/** Format this cycle's ledger-seed section (machine-appended, ≤3 lines). */
export function formatD4LedgerSection(nowIsoStr: string, candidateKeys: string[]): string {
  const keysStr = candidateKeys.length > 0 ? candidateKeys.join(",") : "none";
  return `## d4-auto · ${nowIsoStr}\nD4 candidates: ${keysStr}\n`;
}

/**
 * Insert the ledger section at the position of the topmost `## ` section (i.e.
 * BEFORE it — this repo prepends newest sections first) or append to end if the
 * notebook has no sections yet (blank-state fallback).
 */
export function insertD4LedgerSection(notebookContent: string, section: string): string {
  const firstSectionMatch = notebookContent.match(/^## /m);
  if (!firstSectionMatch) {
    const sep = notebookContent.trim().length > 0 ? "\n\n" : "";
    return notebookContent + sep + section;
  }
  const idx = firstSectionMatch.index!;
  return notebookContent.slice(0, idx) + section + "\n" + notebookContent.slice(idx);
}

/**
 * Apply Step R-4b to this cycle's R-2/R-3 candidates: candidates that PERSISTED
 * from the prior cycle's ledger emit as divergences this cycle; first-occurrence
 * candidates are suppressed and re-armed via the freshly-seeded ledger. The ledger
 * write is best-effort (a write failure does not fail the job — the debounce
 * fail-safe default is "do not emit", which a missing ledger already achieves).
 */
export function applyR4bDebounce(
  candidates: D4Candidate[],
  notebookPath: string,
  readFile: (p: string) => string,
  writeFile: (p: string, s: string) => void,
  fileExists: (p: string) => boolean,
  nowIsoStr: string,
): DivergenceRow[] {
  let priorContent = "";
  let priorCandidates: Set<string> | null = null;

  try {
    if (fileExists(notebookPath)) {
      priorContent = readFile(notebookPath);
      priorCandidates = parsePriorD4Candidates(priorContent);
    }
  } catch {
    priorCandidates = null; // fail-safe: treat unreadable notebook as cold start
  }

  const emitted: DivergenceRow[] = [];
  for (const c of candidates) {
    if (priorCandidates !== null && priorCandidates.has(c.key)) {
      emitted.push(c.div);
    }
  }

  try {
    const section = formatD4LedgerSection(nowIsoStr, candidates.map(c => c.key));
    writeFile(notebookPath, insertD4LedgerSection(priorContent, section));
  } catch {
    // best-effort — a ledger write failure must not fail the D4 job
  }

  return emitted;
}

// ─────────────────────────────────────────────────────────────────────────────
// Git log concurrent-commit detection (AC-5)
// ─────────────────────────────────────────────────────────────────────────────

interface CommitEntry {
  hash: string;
  tsEpoch: number;
}

/**
 * Parse git log output into commit entries.
 * Expected format per line: "<hash> <ISO-8601-date>"
 * e.g. "a1b2c3d 2026-05-21 02:58:10 +0000"
 */
export function parseGitLog(output: string): CommitEntry[] {
  const entries: CommitEntry[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // hash is first token; rest is datetime
    const spaceIdx = trimmed.indexOf(" ");
    if (spaceIdx === -1) continue;
    const hash = trimmed.slice(0, spaceIdx);
    const dateStr = trimmed.slice(spaceIdx + 1).trim();
    const tsMs = Date.parse(dateStr);
    if (!isNaN(tsMs)) {
      entries.push({ hash, tsEpoch: Math.floor(tsMs / 1000) });
    }
  }
  return entries;
}

/**
 * Find pairs of commits that landed within windowSeconds of each other.
 */
export function findConcurrentCommits(
  entries: CommitEntry[],
  windowSeconds = 30,
): Array<{ hash1: string; hash2: string; delta: number }> {
  const pairs: Array<{ hash1: string; hash2: string; delta: number }> = [];
  // entries should be sorted newest-first by git log; sort ascending for comparison
  const sorted = [...entries].sort((a, b) => a.tsEpoch - b.tsEpoch);

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const delta = b.tsEpoch - a.tsEpoch;
    if (delta <= windowSeconds) {
      pairs.push({ hash1: a.hash, hash2: b.hash, delta });
    }
  }
  return pairs;
}

// ─────────────────────────────────────────────────────────────────────────────
// orch-state.json signal_queue writer (OSC-2 — replaces DASHBOARD.md appendDashboardRow)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sanitize a per-finding discriminator (e.g. taskId) for embedding in a
 * signal_queue row id. Lowercases, collapses any run of non [a-z0-9]
 * characters to a single hyphen, and trims leading/trailing hyphens.
 *
 * FU-AUDITOR-D4-SIGNAL-ID: id-safe encoding so arbitrary taskId values
 * (e.g. "orch-state.json", task ids with colons/slashes) never break the
 * `sau-d4-{entity}-{check}-{YYYYMMDD}` id shape or introduce accidental
 * collisions from divergent-but-similar raw strings.
 */
export function sanitizeSignalIdSegment(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "unknown";
}

/**
 * Append a system_issue row to orch-state.json .signal_queue.rows[] atomically.
 *
 * OSC-2 replacement for the old appendDashboardRow(DASHBOARD.md) pattern.
 * Uses appendSignalQueueRow() from orchStateStore (temp-file-then-rename).
 *
 * Summary is capped at 120 chars (HC-2). Severity is always LOW for D4 divergences
 * unless it is a concurrent_commit (MED).
 *
 * FU-AUDITOR-D4-SIGNAL-ID: id is now a per-finding discriminator
 * `sau-d4-{entityId}-{checkId}-{YYYYMMDD}` instead of a batch id keyed only
 * on minute-truncated timestamp (`sau-d4-{YYYYMMDDHHMM}`). The batch id
 * collided whenever R-5 emitted more than one divergence in the same job
 * run (same minute) — up to 8 distinct per-task findings landed on ONE
 * signal_queue row id. `entityId` is the per-finding subject (D4's
 * `DivergenceRow.taskId` — the "ticker" slot in the id contract);
 * `kind` is the check discriminator (the "check_id" slot).
 */
export function appendOrchStateSignalRow(
  orchStatePath: string,
  summary: string,
  nowIso: string,
  kind: DivergenceRow["kind"],
  entityId: string,
  readFile: (p: string) => string,
  writeFile: (p: string, s: string) => void,
  fileExists: (p: string) => boolean,
): void {
  const ts = nowIso.replace(/\.\d{3}Z$/, "Z").replace(/:\d{2}Z$/, "Z");
  const dateOnly = nowIso.slice(0, 10).replace(/-/g, "");
  const safeEntityId = sanitizeSignalIdSegment(entityId);
  const id = `sau-d4-${safeEntityId}-${kind}-${dateOnly}`;

  const severity: OrchStateSignalRow["severity"] =
    kind === "concurrent_commit" ? "MED" : "LOW";

  const row: OrchStateSignalRow = {
    id,
    ts,
    from: "system-auditor",
    to: "po",
    type: "system_issue",
    summary,
    severity,
    status: "NEW",
    payload_ref: null,
  };

  appendSignalQueueRow(
    orchStatePath,
    row,
    nowIso,
    "system-auditor",
    readFile,
    (p, d) => writeOrchStateAtomic(p, d),
    fileExists,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7-day dedup store (in-memory, resets on process restart — acceptable for daily job)
// ─────────────────────────────────────────────────────────────────────────────

const _dedupStore: Map<string, number> = new Map();
const DEDUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isDedupActive(key: string): boolean {
  const ts = _dedupStore.get(key);
  if (ts === undefined) return false;
  return Date.now() - ts < DEDUP_TTL_MS;
}

export function markDedup(key: string): void {
  _dedupStore.set(key, Date.now());
}

/** Reset dedup store (test isolation) */
export function _resetDedupStore(): void {
  _dedupStore.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Core job logic (injectable for smoke testing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the TASKS.md janitor reconciliation pass.
 *
 * Steps R-1..R-7 per handlers.md.
 *
 * @param deps Injectable dependencies for testing
 * @returns JanitorResult summary
 */
export async function runTasksMdJanitor(deps: JanitorDeps): Promise<JanitorResult> {
  const {
    listHeld,
    listSessionPresence,
    readFile,
    writeFile,
    fileExists,
    runShell,
    sendBug,
    nowIso,
    projectRoot,
  } = deps;

  // OSC-2: all paths re-pointed to orch-state.json
  const orchStatePath = resolve(projectRoot, "docs", "data", "orch", "orch-state.json");
  // FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE: R-4b ledger rides on the
  // system-auditor notebook's "D4 candidates:" line (no new state file).
  const notebookPath = resolve(projectRoot, "docs", "agent-memory", "notebooks", "system-auditor.md");

  const divergences: DivergenceRow[] = [];
  const candidates: D4Candidate[] = []; // R-2/R-3 findings — gated by R-4b before becoming divergences
  const errors: string[] = [];
  let heldLocks: LockRow[] = [];
  let survivingLocks: LockRow[] = []; // heldLocks minus R-1b exclusions
  let pipelineState: { activeTaskId: string | null } | null = null;
  let concurrentCommits: Array<{ hash1: string; hash2: string; delta: number }> = [];
  const nowIsoAtStart = nowIso();

  // ── Step R-1: call task_list_held (kind="sprint-task", expired=false) ──────
  let r1Failed = false;
  try {
    heldLocks = listHeld();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`R-1 listHeld failed: ${msg}`);
    r1Failed = true;
    // Log WARN but continue to R-4 git-log check independently (per failure modes)
  }

  // ── Step R-1b: exclusion whitelist + live-concurrent-session guard ─────────
  // Filters BEFORE R-2/R-3 evaluate any held lock. Skipped entirely if R-1 failed
  // (no locks were fetched, so there is nothing to filter or evaluate) — per
  // handlers.md Failure modes: "task_list_held fails → skip Steps R-1b/R-2/R-3".
  if (!r1Failed) {
    let sessionPresenceRows: LockRow[] = [];
    try {
      sessionPresenceRows = listSessionPresence ? listSessionPresence() : [];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`R-1b listSessionPresence failed: ${msg}`);
      // Fail-safe: treat as zero live sessions this cycle — the known-legit-pattern
      // filter still applies (do NOT suppress on this path's absence).
      sessionPresenceRows = [];
    }
    const liveSessionIds = new Set(
      sessionPresenceRows
        .map(r => r.owner_client_session)
        .filter((s): s is string => typeof s === "string" && s.length > 0),
    );
    const nowEpochSeconds = Math.floor(Date.parse(nowIsoAtStart) / 1000);

    const { surviving, skipped } = applyR1bFilter(heldLocks, liveSessionIds, nowEpochSeconds);
    survivingLocks = surviving;
    for (const s of skipped) {
      console.debug(`[tasks-md-janitor] D4 SKIP: ${s.bareId} — ${s.reason}`);
    }
  }

  // ── Step R-2: orch-state.json .head cross-check (AC-4) ─────────────────────
  // OSC-2: reads orch-state.json .head.active_task_id (v3 schema, snake_case)
  try {
    if (fileExists(orchStatePath)) {
      const raw = readFile(orchStatePath);
      const orchState = JSON.parse(raw) as { head?: OrchHead };
      const activeTaskId = orchState.head?.active_task_id ?? null;
      pipelineState = { activeTaskId };

      if (heldLocks.length === 0 && errors.length === 0) {
        // R-1 succeeded but empty. Check orch-state head (AC-4).
        if (activeTaskId !== null) {
          divergences.push({
            kind: "pipeline_mismatch",
            taskId: activeTaskId,
            summary: `task_list_held empty but orch-state.head.active_task_id=${activeTaskId}`,
          });
        }
      } else if (heldLocks.length > 0 && activeTaskId !== null) {
        // Both non-null: verify held lock matches activeTaskId.
        // R-1b: only locks that survived the exclusion whitelist/live-session guard
        // are evaluated — the rest are known-legit-concurrent or excluded by design.
        for (const lock of survivingLocks) {
          const bareId = bareTaskId(lock.task_id);
          if (bareId !== activeTaskId) {
            candidates.push({
              key: `R2-mismatch:${bareId}`,
              div: {
                kind: "pipeline_mismatch",
                taskId: bareId,
                summary: `orch-state/lock mismatch: active=${activeTaskId} held=${bareId}`,
              },
            });
          }
        }
      }
    } else {
      errors.push("R-2 orch-state.json not found — skipping cross-check");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`R-2 orch-state parse failed: ${msg}`);
  }

  // ── Step R-3: orch-state.json .task_board owner/status cross-check (AC-1, AC-2, AC-3)
  // OSC-2: reads task_board.active_sprints[].tasks[] instead of TASKS.md markdown
  // R-1b: gated on survivingLocks (post-exclusion-whitelist/live-session-guard set),
  // not the raw heldLocks — a lock excluded at R-1b never reaches R-3 either.
  if (survivingLocks.length > 0) {
    try {
      if (!fileExists(orchStatePath)) {
        throw new Error("orch-state.json not found");
      }
      const orchContent = readFile(orchStatePath);
      const orchState = JSON.parse(orchContent) as {
        task_board?: { active_sprints?: Array<{ tasks?: OrchStateTaskBoardTask[] }> };
      };
      const taskRows = parseTasksFromOrchStateJson(orchState);

      for (const lock of survivingLocks) {
        const bareId = bareTaskId(lock.task_id);
        const row = taskRows.find(r => r.taskId === bareId);

        if (!row) {
          candidates.push({
            key: `R3-no-board-row:${bareId}`,
            div: {
              kind: "not_found",
              taskId: bareId,
              summary: `held lock ${bareId} has no orch-state task_board row`,
            },
          });
          continue;
        }

        // Owner divergence check
        if (row.owner && lock.owner_agent && row.owner !== lock.owner_agent) {
          candidates.push({
            key: `R3-owner-diverge:${bareId}`,
            div: {
              kind: "owner",
              taskId: bareId,
              summary: `Owner diverge: lock=${lock.owner_agent} task_board=${row.owner} task=${bareId}`,
            },
          });
        }

        // Status divergence check (AC-2: lock held but status != IN_PROGRESS)
        const status = row.status.toLowerCase();
        const isInProgress = status === "in progress" || status === "in_progress" || status === "inprogress";
        if (!isInProgress) {
          candidates.push({
            key: `R3-status-diverge:${bareId}`,
            div: {
              kind: "status",
              taskId: bareId,
              summary: `Status diverge: lock held but task_board shows ${row.status} for ${bareId}`,
            },
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`R-3 orch-state task_board parse failed: ${msg}`);
      // BUG telegram for orch-state unreadable (per failure modes)
      await sendBug(
        `[system-auditor] D4 ABORT: orch-state.json task_board unreadable — possible Seam 3 corruption: ${msg}`,
        "d4_tasksmd_abort_unreadable",
      );
    }
  }

  // ── Step R-4b: 2-consecutive-cycle debounce gate on R-2/R-3 candidates ─────
  // Skipped when R-1 failed — no candidates were ever produced this cycle (R-1b/
  // R-2/R-3 all skipped per Failure modes), so there is nothing to debounce and
  // seeding the ledger with "none" would falsely record "checked, found nothing"
  // for a cycle that never actually checked.
  if (!r1Failed) {
    const emitted = applyR4bDebounce(candidates, notebookPath, readFile, writeFile, fileExists, nowIsoAtStart);
    divergences.push(...emitted);
  }

  // ── Step R-4: Seam 3 concurrent-commit detection (AC-5) ─────────────────────
  // OSC-2: git-log now targets docs/data/orch/orch-state.json (Decision A: 30s window)
  try {
    const gitCmd = `git log --all --oneline --follow --format="%H %ai" -- docs/data/orch/orch-state.json`;
    const gitOutput = runShell(gitCmd);
    const commits = parseGitLog(gitOutput);
    const pairs = findConcurrentCommits(commits, 30);
    concurrentCommits = pairs;

    for (const pair of pairs) {
      divergences.push({
        kind: "concurrent_commit",
        taskId: "orch-state.json",
        summary: `orch-state.json concurrent commits: ${pair.hash1.slice(0, 8)} + ${pair.hash2.slice(0, 8)} within ${pair.delta}s`,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`R-4 git log failed: ${msg}`);
  }

  // ── Step R-5: emit signal_queue rows to orch-state.json ────────────────────
  // OSC-2: replaces DASHBOARD.md appendDashboardRow with JSON signal_queue append
  for (const div of divergences) {
    try {
      appendOrchStateSignalRow(
        orchStatePath,
        div.summary,
        nowIso(),
        div.kind,
        div.taskId,
        readFile,
        writeFile,
        fileExists,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`R-5 orch-state signal_queue write failed for ${div.taskId}: ${msg}`);
    }
  }

  // ── Step R-6: BUG telegram for new divergences (7d dedup) ──────────────────
  for (const div of divergences) {
    if (div.kind === "concurrent_commit") continue; // Already handled per pair if needed
    const dedupKey = `d4_tasksmd_lock_diverge:${div.taskId}`;
    if (!isDedupActive(dedupKey)) {
      markDedup(dedupKey);
      try {
        await sendBug(
          `[system-auditor] D4 orch-state/lock diverge: ${div.summary} — see orch-state.json .signal_queue`,
          dedupKey,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`R-6 BUG send failed: ${msg}`);
      }
    }
  }

  // ── Step R-7: clean signal ─────────────────────────────────────────────────
  if (divergences.length === 0) {
    const ts = nowIso();
    console.log(`[system-auditor] D4 pass clean — no orch-state/lock divergence at ${ts}`);
  }

  return {
    heldLocks: heldLocks.length,
    divergences,
    pipelineState,
    concurrentCommits,
    errors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Production entry point (used by startScheduler.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** 7d dedup key for job-level internal failures (not per-task divergences) */
const JOB_FAILURE_DEDUP_KEY = "d4_janitor_internal_failure";

/**
 * Production cron entry point.
 * Wires real dependencies and runs the janitor.
 * Internal failures are caught here and send a single BUG telegram (7d dedup).
 *
 * @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of daily cadence (21.6h window)
 */
export async function runTasksMdJanitorJob(nowMsFn?: () => number): Promise<void> {
  // T4 dedup guard: skip if already ran within daily cadence window
  try {
    const { getDb } = await import("../../infrastructure/db/schema.js");
    const _db = getDb();
    const DAILY_CADENCE_MS = 86_400_000;
    if (shouldSkipRecoveryReplay(_db, "tasksMdJanitorJob", DAILY_CADENCE_MS, nowMsFn)) return;
  } catch {
    // DB unavailable — proceed without dedup (fail-open)
  }
  const deps: JanitorDeps = {
    // FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE: expired:false is REQUIRED — without
    // it, task_list_held also returns TTL-expired tombstone locks (handlers.md
    // §Step R-1: "without this filter D4 reads ~100+ dead locks as held").
    listHeld: () => {
      const result = listHeldTasks({ kind: "sprint-task", expired: false });
      return result.locks;
    },

    // Step R-1b live-concurrent-session guard: live session-presence roster.
    listSessionPresence: () => {
      const result = listHeldTasks({ kind: "session-presence", expired: false });
      return result.locks;
    },

    readFile: (p: string) => readFileSync(p, "utf8"),

    writeFile: (p: string, content: string) => writeFileSync(p, content, "utf8"),

    fileExists: (p: string) => existsSync(p),

    runShell: (cmd: string) => {
      try {
        return execSync(cmd, {
          encoding: "utf8",
          cwd: getProjectRoot(),
          timeout: 10_000,
        });
      } catch (err) {
        if (err instanceof Error && "stdout" in err) {
          return (err as NodeJS.ErrnoException & { stdout: string }).stdout ?? "";
        }
        return "";
      }
    },

    sendBug: async (text: string, _dedupKey: string) => {
      try {
        const { sendTelegramBug } = await import(
          "../../infrastructure/notifiers/telegram.js"
        );
        await sendTelegramBug(text);
      } catch (err) {
        console.error("[tasks-md-janitor] BUG telegram send failed:", err);
      }
    },

    nowIso: () => new Date().toISOString(),

    projectRoot: getProjectRoot(),
  };

  try {
    const result = await runTasksMdJanitor(deps);
    console.log(
      `[tasks-md-janitor] done — held=${result.heldLocks} divergences=${result.divergences.length} errors=${result.errors.length}`,
    );
    if (result.errors.length > 0) {
      console.warn("[tasks-md-janitor] non-fatal errors:", result.errors.join("; "));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tasks-md-janitor] FATAL: ${msg}`);

    if (!isDedupActive(JOB_FAILURE_DEDUP_KEY)) {
      markDedup(JOB_FAILURE_DEDUP_KEY);
      try {
        const { sendTelegramBug } = await import(
          "../../infrastructure/notifiers/telegram.js"
        );
        await sendTelegramBug(`[tasks-md-janitor] FATAL internal failure: ${msg}`);
      } catch {
        // swallow — already in error handler
      }
    }
  }
}
