/**
 * journalStore.ts — Decision-journal markdown parser + mtime cache
 *
 * ORCH-DASH-DECISION-DRILLDOWN F2
 *
 * Parses sprint-<id>.md decision journals into structured StepDto arrays.
 * Aggregates steps across multiple sprint files into a DecisionsDto keyed
 * by task_id (by_task) and sprint fallback bucket (sprint_bucket).
 *
 * DDD Layer: infrastructure — file I/O only; no domain imports, no HTTP.
 *
 * Parser contract: matches the F1-locked STEP format exactly:
 *   ### STEP <step-id> · <agent-id> · <ISO-timestamp>
 *   **task-id:** <task_id>            (OPTIONAL — absent → sprint_bucket)
 *   **what-done:** <one sentence>
 *   **what-considered:**
 *   - <bullet>
 *   **why-decision:** <one sentence>
 *   **why-change:** <one sentence>
 *
 * Cache: module-level singleton Map keyed by absolute file path; invalidated
 * by mtime change. Reduces parse overhead on the 5-second polling loop to
 * near-zero when no agent is writing (typical hit rate ~100%).
 */

import { statSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// DTO types (consumed by orchestrationHandler.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** One parsed STEP block from a decision journal. */
export interface StepDto {
  step_id: string;
  agent_id: string;
  timestamp: string;
  /** null when the task-id line is absent or trims to empty → routes to sprint_bucket */
  task_id: string | null;
  what_done: string;
  what_considered: string[];
  why_decision: string;
  why_change: string;
  /** Sprint this step was parsed from (populated by getDecisionsForSprints). */
  sprint_id: string;
}

/** Aggregated decisions across all requested sprints. */
export interface DecisionsDto {
  /** Steps with a non-null task_id, keyed by task_id. */
  by_task: Record<string, StepDto[]>;
  /** Steps without a task_id, keyed by sprint_id. */
  sprint_bucket: Record<string, StepDto[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level mtime cache (singleton — lives for the process lifetime)
// Key: absolute file path. Value: {mtime, steps}.
// ─────────────────────────────────────────────────────────────────────────────

const _cache = new Map<string, { mtime: number; steps: StepDto[] }>();

/**
 * Clear the mtime cache for a specific path (or all entries).
 * Exported for test isolation — use unique tmpdir paths per test if possible,
 * or call this at the start of a test that needs a cold cache.
 */
export function _clearCacheForTesting(filePath?: string): void {
  if (filePath !== undefined) {
    _cache.delete(filePath);
  } else {
    _cache.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Regex constants (R-6: CAP-REACHED checked BEFORE STEP header regex)
// ─────────────────────────────────────────────────────────────────────────────

const RE_CAP_REACHED  = /^### CAP-REACHED/;
const RE_STEP_HEADER  = /^### STEP (\S+) · (\S+) · (\S+)/;
const RE_TASK_ID      = /^\*\*task-id:\*\* (.+)/;
const RE_WHAT_DONE    = /^\*\*what-done:\*\* (.+)/;
const RE_WHAT_CONSID  = /^\*\*what-considered:\*\*/;
const RE_BULLET       = /^- (.+)/;
const RE_WHY_DECISION = /^\*\*why-decision:\*\* (.+)/;
const RE_WHY_CHANGE   = /^\*\*why-change:\*\* (.+)/;

// ─────────────────────────────────────────────────────────────────────────────
// Pure parser — testable in isolation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a decision journal markdown file content into an array of StepDtos.
 *
 * Pure function — no filesystem access. Suitable for unit testing with strings.
 *
 * @param content  - Full file content (may have CRLF line endings — handled via /\r?\n/)
 * @param sprintId - Sprint ID string (set on each returned StepDto)
 * @returns Array of parsed steps (empty if no STEP blocks found).
 */
export function parseJournalFile(content: string, sprintId: string): StepDto[] {
  const steps: StepDto[] = [];
  let current: StepDto | null = null;
  let inWhatConsidered = false;

  // R-5: handle CRLF line endings
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    // R-6: check CAP-REACHED BEFORE STEP header regex (order is load-bearing)
    if (RE_CAP_REACHED.test(line)) {
      break;
    }

    const stepMatch = RE_STEP_HEADER.exec(line);
    if (stepMatch) {
      // Push completed previous step
      if (current !== null) {
        steps.push(current);
      }
      // Start new step — stepMatch[1]=step_id, [2]=agent_id, [3]=timestamp
      const stepId = stepMatch[1] ?? "";
      const agentId = stepMatch[2] ?? "";
      const timestamp = stepMatch[3] ?? "";
      current = {
        step_id: stepId,
        agent_id: agentId,
        timestamp,
        task_id: null,
        what_done: "",
        what_considered: [],
        why_decision: "",
        why_change: "",
        sprint_id: sprintId,
      };
      inWhatConsidered = false;
      continue;
    }

    if (current !== null) {
      const taskIdMatch = RE_TASK_ID.exec(line);
      if (taskIdMatch) {
        // AC-F2-3 edge: trim; empty after trim → null (routes to sprint_bucket)
        const trimmed = (taskIdMatch[1] ?? "").trim();
        current.task_id = trimmed.length > 0 ? trimmed : null;
        continue;
      }

      const whatDoneMatch = RE_WHAT_DONE.exec(line);
      if (whatDoneMatch) {
        current.what_done = whatDoneMatch[1] ?? "";
        inWhatConsidered = false;
        continue;
      }

      if (RE_WHAT_CONSID.test(line)) {
        inWhatConsidered = true;
        continue;
      }

      if (inWhatConsidered) {
        const bulletMatch = RE_BULLET.exec(line);
        if (bulletMatch) {
          current.what_considered.push(bulletMatch[1] ?? "");
          continue;
        }
        // Non-bullet line after what-considered section = exit bullet mode
        // (only exit when we hit a new ** field or STEP header, not blank lines)
        if (line.startsWith("**")) {
          inWhatConsidered = false;
        }
      }

      const whyDecisionMatch = RE_WHY_DECISION.exec(line);
      if (whyDecisionMatch) {
        inWhatConsidered = false;
        current.why_decision = whyDecisionMatch[1] ?? "";
        continue;
      }

      const whyChangeMatch = RE_WHY_CHANGE.exec(line);
      if (whyChangeMatch) {
        current.why_change = whyChangeMatch[1] ?? "";
        continue;
      }
    }
  }

  // Push final step (no trailing STEP header to trigger the flush)
  if (current !== null) {
    steps.push(current);
  }

  return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation helper (pure — used by getDecisionsForSprints + tests)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregate a flat list of {sprintId, step} pairs into a DecisionsDto.
 *
 * Steps with non-null task_id → by_task[task_id][].
 * Steps with null task_id     → sprint_bucket[sprintId][].
 */
export function buildDecisionsDto(allSteps: StepDto[]): DecisionsDto {
  const by_task: Record<string, StepDto[]> = {};
  const sprint_bucket: Record<string, StepDto[]> = {};

  for (const step of allSteps) {
    if (step.task_id) {
      if (!by_task[step.task_id]) {
        by_task[step.task_id] = [];
      }
      by_task[step.task_id]!.push(step);
    } else {
      if (!sprint_bucket[step.sprint_id]) {
        sprint_bucket[step.sprint_id] = [];
      }
      sprint_bucket[step.sprint_id]!.push(step);
    }
  }

  return { by_task, sprint_bucket };
}

// ─────────────────────────────────────────────────────────────────────────────
// File reader with mtime cache
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load and parse a single sprint journal file, using the mtime cache.
 *
 * @param filePath - Absolute path to sprint-<id>.md
 * @param sprintId - Sprint ID (passed to parseJournalFile for StepDto.sprint_id)
 * @returns Array of parsed steps; empty array on ENOENT.
 */
function loadSprintFile(filePath: string, sprintId: string): StepDto[] {
  // stat — if ENOENT → return [] (AC-F2-4)
  let mtimeMs: number;
  try {
    const stat = statSync(filePath);
    mtimeMs = stat.mtimeMs;
  } catch (err) {
    // Any stat error (ENOENT, EACCES, …) → treat as missing
    return [];
  }

  // Fast path: cache hit with same mtime
  const cached = _cache.get(filePath);
  if (cached && cached.mtime === mtimeMs) {
    return cached.steps;
  }

  // Cache miss or stale: read + parse
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return [];
  }

  const steps = parseJournalFile(content, sprintId);
  _cache.set(filePath, { mtime: mtimeMs, steps });
  return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load and aggregate decision journal steps for a set of sprint IDs.
 *
 * Sprint IDs are deduplicated internally (Set). Missing journal files yield
 * empty steps without throwing (ENOENT guard — AC-F2-4).
 *
 * @param sprintIds    - Array of sprint IDs (may contain duplicates)
 * @param decisionsDir - Absolute path to the directory holding sprint-*.md files
 * @returns DecisionsDto with by_task and sprint_bucket populated.
 */
export function getDecisionsForSprints(
  sprintIds: string[],
  decisionsDir: string,
): DecisionsDto {
  // Dedup sprint IDs (RULING-3)
  const uniqueIds = Array.from(new Set(sprintIds));

  const allSteps: StepDto[] = [];

  for (const id of uniqueIds) {
    const filePath = join(decisionsDir, `sprint-${id}.md`);
    const steps = loadSprintFile(filePath, id);
    allSteps.push(...steps);
  }

  return buildDecisionsDto(allSteps);
}
